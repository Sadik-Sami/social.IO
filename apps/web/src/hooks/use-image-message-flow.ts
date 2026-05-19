import { useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { toast } from 'sonner';

import { messageKeys } from '@/lib/query-keys';
import type { MessagePage, MessageResponse } from '@/types/api';
import { useSendMessage } from '@/hooks/use-send-message';
import { useUploadImage } from '@/hooks/use-upload-image';
import { useDeleteImage } from '@/hooks/use-delete-image';
import { useImageUploadStore } from '@/stores/image-upload-store';

function createTempId(): string {
	return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useImageMessageFlow() {
	const qc = useQueryClient();
	const sendMessage = useSendMessage();
	const uploadImage = useUploadImage();
	const deleteImage = useDeleteImage();
	const pendingImageMessages = useImageUploadStore((s) => s.pendingImageMessages);
	const upsertPendingImageMessage = useImageUploadStore((s) => s.upsertPendingImageMessage);
	const setPendingImageMessageStatus = useImageUploadStore((s) => s.setPendingImageMessageStatus);
	const setPendingImageMessageProgress = useImageUploadStore((s) => s.setPendingImageMessageProgress);
	const removePendingImageMessage = useImageUploadStore((s) => s.removePendingImageMessage);

	const insertOptimisticImageMessage = useCallback(
		(tempId: string, conversationId: string, previewUrl: string, content: string) => {
			const optimistic: MessageResponse = {
				id: tempId,
				conversationId,
				senderId: 'me',
				sequenceNumber: -1,
				content,
				type: 'image',
				imageUrl: previewUrl,
				replyToId: null,
				isEdited: false,
				editedAt: null,
				isDeleted: false,
				deletedAt: null,
				createdAt: new Date().toISOString(),
				reactions: [],
			};

			qc.setQueryData<InfiniteData<MessagePage>>(messageKeys.list(conversationId), (old) => {
				if (!old || old.pages.length === 0) {
					return {
						pages: [{ messages: [optimistic], hasMore: false }],
						pageParams: [undefined],
					};
				}
				const newPages = [...old.pages];
				newPages[0] = {
					...newPages[0],
					messages: [optimistic, ...newPages[0].messages.filter((m) => m.id !== tempId)],
				};
				return { ...old, pages: newPages };
			});
		},
		[qc],
	);

	const finalizeSuccess = useCallback(
		(tempId: string) => {
			const pending = pendingImageMessages[tempId];
			if (pending) {
				URL.revokeObjectURL(pending.previewUrl);
			}
			removePendingImageMessage(tempId);
		},
		[pendingImageMessages, removePendingImageMessage],
	);

	const finalizeFailure = useCallback(
		(tempId: string) => {
			setPendingImageMessageStatus(tempId, 'failed');
		},
		[setPendingImageMessageStatus],
	);

	const sendOrRetryImageMessage = useCallback(
		async (tempId: string, conversationId: string, file: File, content: string) => {
			let uploadedImageUrl: string | null = null;
			try {
				setPendingImageMessageStatus(tempId, 'uploading');
				setPendingImageMessageProgress(tempId, 0);

				uploadedImageUrl = await uploadImage.mutateAsync({
					file,
					onProgress: (percent) => setPendingImageMessageProgress(tempId, percent),
				});

				setPendingImageMessageStatus(tempId, 'sending');
				setPendingImageMessageProgress(tempId, 100);

				await sendMessage.mutateAsync({
					conversationId,
					content,
					type: 'image',
					imageUrl: uploadedImageUrl,
					tempId,
					skipOptimistic: true,
				});

				finalizeSuccess(tempId);
			} catch {
				if (uploadedImageUrl) {
					deleteImage.mutate({ imageUrl: uploadedImageUrl });
				}
				finalizeFailure(tempId);
				toast.error('Failed to send image message');
			}
		},
		[
			deleteImage,
			finalizeFailure,
			finalizeSuccess,
			sendMessage,
			setPendingImageMessageProgress,
			setPendingImageMessageStatus,
			uploadImage,
		],
	);

	const startImageMessageSend = useCallback(
		({ conversationId, file, content }: { conversationId: string; file: File; content: string }) => {
			const tempId = createTempId();
			const previewUrl = URL.createObjectURL(file);

			upsertPendingImageMessage({
				tempId,
				conversationId,
				file,
				previewUrl,
				content,
				status: 'uploading',
				progress: 0,
			});

			insertOptimisticImageMessage(tempId, conversationId, previewUrl, content);
			void sendOrRetryImageMessage(tempId, conversationId, file, content);
			return tempId;
		},
		[insertOptimisticImageMessage, sendOrRetryImageMessage, upsertPendingImageMessage],
	);

	const retryImageMessageSend = useCallback(
		(tempId: string) => {
			const pending = pendingImageMessages[tempId];
			if (!pending) return;
			if (pending.status !== 'failed') return;
			void sendOrRetryImageMessage(tempId, pending.conversationId, pending.file, pending.content);
		},
		[pendingImageMessages, sendOrRetryImageMessage],
	);

	const isImageMessageFlowPending = uploadImage.isPending || sendMessage.isPending;

	return {
		startImageMessageSend,
		retryImageMessageSend,
		isImageMessageFlowPending,
	};
}
