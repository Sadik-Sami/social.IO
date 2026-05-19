'use client';

import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';

import { env } from '@socialIO/env/web';

import { useAuthStore } from '@/stores/auth-store';
import { useChatStore } from '@/stores/chat-store';
import { getWsUrl, WS_HEARTBEAT_INTERVAL, WS_RECONNECT_DELAY } from '@/lib/ws';
import { messageKeys, conversationKeys } from '@/lib/query-keys';
import { parseInboundEvent } from '@/types/ws';
import type { OutboundEvent, InboundEvent } from '@/types/ws';
import type { MessagePage } from '@/types/api';

/**
 * @description
 * Context for WebSocket connection
 */
interface WSContextValue {
	send: (event: OutboundEvent) => void;
	isConnected: boolean;
}

const WSContext = createContext<WSContextValue | null>(null);

export function useWS() {
	const ctx = useContext(WSContext);
	if (!ctx) throw new Error('useWS must be used inside WSProvider');
	return ctx;
}

/**
 * @description
 * Provider for WebSocket connection
 */
export function WSProvider({ children }: { children: React.ReactNode }) {
	const queryClient = useQueryClient();
	const session = useAuthStore((s) => s.session);
	const activeConversationId = useChatStore((s) => s.activeConversationId);
	const setTypingUsers = useChatStore((s) => s.setTypingUsers);
	const setWsStatus = useChatStore((s) => s.setWsStatus);
	const updateParticipantProgress = useChatStore((s) => s.updateParticipantProgress);
	const updatePresence = useChatStore((s) => s.updatePresence);
	const wsStatus = useChatStore((s) => s.wsStatus);

	const wsRef = useRef<WebSocket | null>(null);
	const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeConversationRef = useRef(activeConversationId);
	const prevConversationRef = useRef<string | null>(null);

	// Keep ref in sync with state (avoid stale closures in WS callbacks)
	activeConversationRef.current = activeConversationId;

	/**
	 * @description
	 * Handles inbound WebSocket events
	 */
	const handleInbound = useCallback(
		(event: InboundEvent) => {
			switch (event.type) {
				case 'new_message': {
					const { conversationId, message, tempId } = event;

					queryClient.setQueryData<InfiniteData<MessagePage>>(messageKeys.list(conversationId), (old) => {
						if (!old) return old;

						// Edit/delete case — update in place across all pages
						for (let i = 0; i < old.pages.length; i++) {
							const idx = old.pages[i].messages.findIndex((m) => m.id === message.id);
							if (idx !== -1) {
								const newPages = [...old.pages];
								newPages[i] = {
									...newPages[i],
									messages: newPages[i].messages.map((m) => (m.id === message.id ? message : m)),
								};
								return { ...old, pages: newPages };
							}
						}

						const newPages = [...old.pages];

						// If tempId exists, replace the optimistic message
						if (tempId) {
							for (let i = 0; i < newPages.length; i++) {
								const tempIdx = newPages[i].messages.findIndex((m) => m.id === tempId);
								if (tempIdx !== -1) {
									const newMessages = [...newPages[i].messages];
									newMessages[tempIdx] = message;
									newPages[i] = { ...newPages[i], messages: newMessages };
									return { ...old, pages: newPages };
								}
							}
						}

						// New message (no tempId match) — prepend to first page
						newPages[0] = {
							...newPages[0],
							messages: [message, ...newPages[0].messages],
						};
						return { ...old, pages: newPages };
					});

					// Always refresh unread counts (server computes correctly for sender)
					queryClient.invalidateQueries({ queryKey: conversationKeys.unread() });

					// Refresh conversation list for background conversations
					if (conversationId !== activeConversationRef.current) {
						queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
					}
					break;
				}

				case 'typing_update': {
					setTypingUsers(event.conversationId, event.typingUserIds);
					break;
				}

				case 'presence_update': {
					updatePresence(event.userId, event.online, event.lastSeenAt);
					break;
				}

				case 'conversation_status_update': {
					updateParticipantProgress(
						event.conversationId,
						event.userId,
						event.lastDeliveredSequence,
						event.lastSeenSequence,
					);

					// If this status update is for ME, my unread count might have changed!
					const myUserId = useAuthStore.getState().session?.user?.id;
					if (event.userId === myUserId) {
						queryClient.invalidateQueries({ queryKey: conversationKeys.unread() });
						queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
					}
					break;
				}

				case 'conversation_updated': {
					queryClient.invalidateQueries({ queryKey: conversationKeys.all });
					break;
				}

				case 'member_added':
				case 'member_removed': {
					queryClient.invalidateQueries({ queryKey: conversationKeys.detail(event.conversationId) });
					queryClient.invalidateQueries({ queryKey: conversationKeys.list() });
					queryClient.invalidateQueries({ queryKey: conversationKeys.unread() });
					break;
				}

				case 'reaction_update': {
					queryClient.invalidateQueries({ queryKey: messageKeys.list(event.conversationId) });
					break;
				}

				case 'joined': {
					break;
				}

				case 'heartbeat_ack': {
					break;
				}

				case 'error': {
					toast.error('Realtime error: ' + event.error);
					break;
				}
			}
		},
		[queryClient, setTypingUsers, updateParticipantProgress, updatePresence],
	);

	/**
	 * @description
	 * Sends raw WebSocket events
	 */
	const sendRaw = useCallback((ws: WebSocket, event: OutboundEvent) => {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(event));
		}
	}, []);

	const send = useCallback(
		(event: OutboundEvent) => {
			if (wsRef.current) {
				sendRaw(wsRef.current, event);
			}
		},
		[sendRaw],
	);

	/**
	 * @description
	 * Handles WebSocket connection lifecycle
	 */
	useEffect(() => {
		if (!session?.user) return;

		// Close any existing connection
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.close();
		}

		const wsUrl = getWsUrl(env.NEXT_PUBLIC_SERVER_URL);
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			setWsStatus('open');

			// Invalidate all conversations to sync state missed while offline
			queryClient.invalidateQueries({ queryKey: conversationKeys.all });

			// Start heartbeat
			heartbeatTimerRef.current = setInterval(() => {
				sendRaw(ws, { type: 'heartbeat', payload: {} });
			}, WS_HEARTBEAT_INTERVAL);

			// Rejoin active conversation after reconnect
			const convId = activeConversationRef.current;
			if (convId) {
				sendRaw(ws, {
					type: 'join_conversation',
					payload: { conversationId: convId },
				});

				// Sync read state for messages received while offline
				const pages = queryClient.getQueryData<InfiniteData<MessagePage>>(messageKeys.list(convId))?.pages;
				const latestMessage = pages?.[0]?.messages?.[0];
				if (latestMessage && !latestMessage.id.startsWith('temp-')) {
					sendRaw(ws, {
						type: 'conversation_seen',
						payload: { conversationId: convId, lastSeenSequence: latestMessage.sequenceNumber },
					});
				}
			}
		};

		ws.onmessage = (event) => {
			const raw = typeof event.data === 'string' ? event.data : String(event.data);
			const parsed = parseInboundEvent(raw);
			if (parsed) {
				handleInbound(parsed);
			}
		};

		ws.onclose = () => {
			setWsStatus('closed');

			if (heartbeatTimerRef.current) {
				clearInterval(heartbeatTimerRef.current);
				heartbeatTimerRef.current = null;
			}

			// Auto-reconnect
			reconnectTimerRef.current = setTimeout(() => {
				// Re-check session before reconnecting (may have logged out)
				if (useAuthStore.getState().session?.user) {
					setWsStatus('connecting');
				}
			}, WS_RECONNECT_DELAY);
		};

		ws.onerror = () => {
			// onerror always fires before onclose — onclose handles cleanup
		};

		setWsStatus('connecting');

		return () => {
			if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
			if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
			ws.close();
			wsRef.current = null;
		};
	}, [session?.user?.id, setWsStatus, sendRaw, handleInbound]);

	/**
	 * @description
	 * Handles auto-join/leave when active conversation changes
	 */
	useEffect(() => {
		if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

		// Leave previous conversation
		const prev = prevConversationRef.current;
		if (prev && prev !== activeConversationId) {
			send({
				type: 'leave_conversation',
				payload: { conversationId: prev },
			});
		}

		// Join new conversation
		if (activeConversationId) {
			send({
				type: 'join_conversation',
				payload: { conversationId: activeConversationId },
			});
			setTypingUsers(activeConversationId, []);
		}

		prevConversationRef.current = activeConversationId;
	}, [activeConversationId, send, setTypingUsers]);

	/**
	 * @description
	 * Render WebSocket provider
	 */
	const contextValue: WSContextValue = {
		send,
		isConnected: wsStatus === 'open',
	};

	return <WSContext.Provider value={contextValue}>{children}</WSContext.Provider>;
}
