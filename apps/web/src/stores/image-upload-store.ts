import { create } from 'zustand';

export type PendingImageMessageStatus = 'uploading' | 'sending' | 'failed';

export interface PendingImageMessage {
	tempId: string;
	conversationId: string;
	file: File;
	previewUrl: string;
	content: string;
	status: PendingImageMessageStatus;
	progress: number;
}

interface ImageUploadState {
	pendingImageMessages: Record<string, PendingImageMessage>;
}

interface ImageUploadActions {
	upsertPendingImageMessage: (message: PendingImageMessage) => void;
	setPendingImageMessageStatus: (tempId: string, status: PendingImageMessageStatus) => void;
	setPendingImageMessageProgress: (tempId: string, progress: number) => void;
	removePendingImageMessage: (tempId: string) => void;
}

type ImageUploadStore = ImageUploadState & ImageUploadActions;

export const useImageUploadStore = create<ImageUploadStore>()((set) => ({
	pendingImageMessages: {},
	upsertPendingImageMessage: (message) =>
		set((state) => ({
			pendingImageMessages: {
				...state.pendingImageMessages,
				[message.tempId]: message,
			},
		})),
	setPendingImageMessageStatus: (tempId, status) =>
		set((state) => {
			const target = state.pendingImageMessages[tempId];
			if (!target) return state;
			return {
				pendingImageMessages: {
					...state.pendingImageMessages,
					[tempId]: {
						...target,
						status,
					},
				},
			};
		}),
	setPendingImageMessageProgress: (tempId, progress) =>
		set((state) => {
			const target = state.pendingImageMessages[tempId];
			if (!target) return state;
			return {
				pendingImageMessages: {
					...state.pendingImageMessages,
					[tempId]: {
						...target,
						progress,
					},
				},
			};
		}),
	removePendingImageMessage: (tempId) =>
		set((state) => {
			if (!state.pendingImageMessages[tempId]) return state;
			const next = { ...state.pendingImageMessages };
			delete next[tempId];
			return { pendingImageMessages: next };
		}),
}));
