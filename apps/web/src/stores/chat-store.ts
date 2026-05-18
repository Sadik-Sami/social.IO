import { create } from 'zustand';

type WSStatus = 'connecting' | 'open' | 'closed';

interface ParticipantProgress {
	lastDeliveredSequence: number;
	lastSeenSequence: number;
}

interface ChatState {
	activeConversationId: string | null;
	typingUsers: Record<string, string[]>;
	drafts: Record<string, string>;
	wsStatus: WSStatus;
	participantProgress: Record<string, Record<string, ParticipantProgress>>;
}

interface ChatActions {
	setActiveConversation: (id: string | null) => void;
	setTypingUsers: (convId: string, userIds: string[]) => void;
	setDraft: (convId: string, text: string) => void;
	setWsStatus: (status: WSStatus) => void;
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
	drafts: {},
	wsStatus: 'closed',
	participantProgress: {},
};

export const useChatStore = create<ChatStore>()((set) => ({
	...initialState,
	setActiveConversation: (id) => set({ activeConversationId: id }),
	setTypingUsers: (convId, userIds) => set((s) => ({ typingUsers: { ...s.typingUsers, [convId]: userIds } })),
	setDraft: (convId, text) => set((s) => ({ drafts: { ...s.drafts, [convId]: text } })),
	setWsStatus: (wsStatus) => set({ wsStatus }),

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
