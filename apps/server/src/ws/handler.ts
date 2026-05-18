import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
import type { AppEnv } from '@/types/app-env';
import { auth } from '@socialIO/auth';
import { db } from '@socialIO/db';
import { participant } from '@socialIO/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

import { upgradeWebSocket } from '@hono/node-server';
import { joinRoom, leaveRoom, leaveAllRooms, addUserSocket, removeUserSocket } from './registry';
import { subscribeToConversation, publish } from './pubsub';
import { setOnline, setOffline, refreshPresenceTTL } from '@/services/presence.service';
import { startTyping, stopTyping, getWhoIsTyping } from '@/services/typing.service';
import { updateDeliveredOnConnect, markConversationSeen } from '@/services/message.service';
import { createTypedWS, parseInboundEvent, type InboundEvent, type TypedWS } from './types';

export const wsRouter = new Hono<AppEnv>();

wsRouter.get(
	'/',
	upgradeWebSocket(async (c) => {
		const session = await auth.api.getSession({ headers: c.req.raw.headers });

		if (!session?.user) {
			return {
				onOpen(_event, _ws) {
					const tws = createTypedWS(_ws);
					tws.send({ type: 'error', error: 'Unauthorized' });
					tws.close();
				},
			};
		}

		const userId = session.user.id;

		return {
			async onOpen(_event, _ws: WSContext) {
				addUserSocket(userId, _ws);
				await setOnline(userId);

				const convIds = await getUserConversationIds(userId);
				for (const convId of convIds) {
					await publish(convId, { type: 'presence_update', userId, online: true });
				}

				// Fire-and-forget: update lastDeliveredSequence for all conversations
				// where new messages arrived while the user was offline.
				setImmediate(() => {
					updateDeliveredOnConnect(userId).catch((err) => {
						console.error('[ws] updateDeliveredOnConnect failed:', err);
					});
				});
			},

			async onMessage(event: MessageEvent, ws: WSContext) {
				const tws = createTypedWS(ws);
				const raw = typeof event.data === 'string' ? event.data : String(event.data);
				const inbound = parseInboundEvent(raw);

				if (!inbound) {
					tws.send({ type: 'error', error: 'Invalid message format' });
					return;
				}

				await handleEvent(inbound, userId, ws, tws);
			},

			async onClose(_event, ws: WSContext) {
				removeUserSocket(userId, ws);
				leaveAllRooms(userId, ws);
				await setOffline(userId);

				// Broadcast offline presence to ALL conversations the user participates in,
				// not just the rooms they were actively joined in at disconnect time.
				const lastSeenAt = new Date().toISOString();
				const convIds = await getUserConversationIds(userId);
				for (const convId of convIds) {
					await publish(convId, {
						type: 'presence_update',
						userId,
						online: false,
						lastSeenAt,
					});
				}
			},

			onError(error: Event) {
				console.error('[ws] error:', error);
			},
		};
	}),
);

async function handleEvent(event: InboundEvent, userId: string, ws: WSContext, tws: TypedWS): Promise<void> {
	switch (event.type) {
		case 'echo': {
			tws.send({ type: 'echo', payload: event.payload });
			return;
		}

		case 'join_conversation': {
			const { conversationId } = event.payload;
			const isMember = await checkMembership(conversationId, userId);
			if (!isMember) {
				tws.send({ type: 'error', error: 'Not a participant in this conversation' });
				return;
			}
			joinRoom(conversationId, userId, ws);
			await subscribeToConversation(conversationId);
			tws.send({ type: 'joined', conversationId });
			break;
		}

		case 'leave_conversation': {
			leaveRoom(event.payload.conversationId, userId, ws);
			break;
		}

		case 'typing_start': {
			const { conversationId } = event.payload;
			await startTyping(conversationId, userId);
			const typingUserIds = await getWhoIsTyping(conversationId);
			await publish(conversationId, { type: 'typing_update', conversationId, typingUserIds });
			break;
		}

		case 'typing_stop': {
			const { conversationId } = event.payload;
			await stopTyping(conversationId, userId);
			const typingUserIds = await getWhoIsTyping(conversationId);
			await publish(conversationId, { type: 'typing_update', conversationId, typingUserIds });
			break;
		}

		case 'conversation_seen': {
			const { conversationId, lastSeenSequence } = event.payload;
			await markConversationSeen(conversationId, userId, lastSeenSequence);
			break;
		}

		case 'heartbeat': {
			await refreshPresenceTTL(userId);
			tws.send({ type: 'heartbeat_ack' });
			break;
		}

		default: {
			const _exhaustive: never = event;
			tws.send({ type: 'error', error: 'Unknown event type' });
			return _exhaustive;
		}
	}
}

async function checkMembership(conversationId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: participant.id })
		.from(participant)
		.where(
			and(eq(participant.conversationId, conversationId), eq(participant.userId, userId), isNull(participant.leftAt)),
		)
		.limit(1);
	return !!row;
}

async function getUserConversationIds(userId: string): Promise<string[]> {
	const rows = await db
		.select({ conversationId: participant.conversationId })
		.from(participant)
		.where(and(eq(participant.userId, userId), isNull(participant.leftAt)));
	return rows.map((r) => r.conversationId);
}
