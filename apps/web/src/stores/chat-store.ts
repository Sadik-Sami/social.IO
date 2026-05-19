import { create } from 'zustand';
import type { MessageResponse } from '@/types/api';

type WSStatus = 'connecting' | 'open' | 'closed';

interface ParticipantProgress {
	lastDeliveredSequence: number;
	lastSeenSequence: number;
}

interface PresenceState {
	online: boolean;
	lastSeenAt: string | null;
}

interface ChatState {
	activeConversationId: string | null;
	typingUsers: Record<string, string[]>;
	presence: Record<string, PresenceState>;
	drafts: Record<string, string>;
	wsStatus: WSStatus;
	participantProgress: Record<string, Record<string, ParticipantProgress>>;
	editingMessage: MessageResponse | null;
}

interface ChatActions {
	setActiveConversation: (id: string | null) => void;
	setTypingUsers: (convId: string, userIds: string[]) => void;
	updatePresence: (userId: string, online: boolean, lastSeenAt?: string) => void;
	setDraft: (convId: string, text: string) => void;
	setWsStatus: (status: WSStatus) => void;
	setEditingMessage: (message: MessageResponse | null) => void;
	updateParticipantProgress: (
		convId: string,
		userId: string,
		delivered: number,
		seen: number,
	) => void;
	seedParticipantProgress: (
		convId: string,
		participants: { userId: string; lastDeliveredSequence: number; lastSeenSequence: number }[],
	) => void;
}

type ChatStore = ChatState & ChatActions;

const initialState: ChatState = {
	activeConversationId: null,
	typingUsers: {},
	presence: {},
	drafts: {},
	wsStatus: 'closed',
	participantProgress: {},
	editingMessage: null,
};

export const useChatStore = create<ChatStore>()((set) => ({
	...initialState,
	setActiveConversation: (id) => set({ activeConversationId: id }),
	setTypingUsers: (convId, userIds) => set((s) => ({ typingUsers: { ...s.typingUsers, [convId]: userIds } })),
	updatePresence: (userId, online, lastSeenAt) =>
		set((s) => ({
			presence: {
				...s.presence,
				[userId]: { online, lastSeenAt: lastSeenAt ?? null },
			},
		})),
	setDraft: (convId, text) => set((s) => ({ drafts: { ...s.drafts, [convId]: text } })),
	setWsStatus: (wsStatus) => set({ wsStatus }),
	setEditingMessage: (message) => set({ editingMessage: message }),

	updateParticipantProgress: (convId, userId, delivered, seen) =>
		set((s) => ({
			participantProgress: {
				...s.participantProgress,
				[convId]: {
					...s.participantProgress[convId],
					[userId]: { lastDeliveredSequence: delivered, lastSeenSequence: seen },
				},
			},
		})),

	seedParticipantProgress: (convId, participants) =>
		set((s) => {
			const map: Record<string, ParticipantProgress> = {};
			for (const p of participants) {
				map[p.userId] = {
					lastDeliveredSequence: p.lastDeliveredSequence,
					lastSeenSequence: p.lastSeenSequence,
				};
			}
			return {
				participantProgress: { ...s.participantProgress, [convId]: map },
			};
		}),
}));

export type { ParticipantProgress };
