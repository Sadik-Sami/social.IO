import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { messageKeys } from '@/lib/query-keys';
import type { MessagePage, MessageResponse } from '@/types/api';

/**
 * @description
 * Sends a message via POST and optimistically prepends it to the InfiniteData cache.
 * On error, rolls back. On success, WS new_message replaces the temp entry.
 */
export function useSendMessage() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: (variables: { conversationId: string; content: string; tempId?: string }) =>
			api.post(`/api/conversations/${variables.conversationId}/messages`, { content: variables.content, type: 'text', tempId: variables.tempId }),

		onMutate: async (variables) => {
			const { conversationId, content } = variables;
			await qc.cancelQueries({ queryKey: messageKeys.list(conversationId) });

			const tempId = variables.tempId || `temp-${Date.now()}`;
			variables.tempId = tempId; // attach it so mutationFn can use it

			const optimistic: MessageResponse = {
				id: tempId,
				conversationId,
				senderId: 'me',
				sequenceNumber: -1,
				content,
				type: 'text',
				imageUrl: null,
				replyToId: null,
				isEdited: false,
				editedAt: null,
				isDeleted: false,
				deletedAt: null,
				createdAt: new Date().toISOString(),
			};

			qc.setQueryData<InfiniteData<MessagePage>>(messageKeys.list(conversationId), (old) => {
				if (!old) return old;
				const newPages = [...old.pages];
				newPages[0] = {
					...newPages[0],
					messages: [optimistic, ...newPages[0].messages],
				};
				return { ...old, pages: newPages };
			});

			return { tempId };
		},

		onSuccess: (res, variables, context) => {
			if (!context) return;
			const { tempId } = context;
			const realMessage = res.data.message;

			qc.setQueryData<InfiniteData<MessagePage>>(messageKeys.list(variables.conversationId), (old) => {
				if (!old) return old;
				const newPages = [...old.pages];

				// Find and replace the temp message
				for (let i = 0; i < newPages.length; i++) {
					const tempIdx = newPages[i].messages.findIndex((m) => m.id === tempId);
					if (tempIdx !== -1) {
						const newMessages = [...newPages[i].messages];
						newMessages[tempIdx] = realMessage;
						newPages[i] = { ...newPages[i], messages: newMessages };
						return { ...old, pages: newPages };
					}
				}

				return { ...old, pages: newPages };
			});
		},

		onError: (_err, variables, context) => {
			if (context?.tempId) {
				qc.setQueryData<InfiniteData<MessagePage>>(messageKeys.list(variables.conversationId), (old) => {
					if (!old) return old;
					const newPages = [...old.pages];
					newPages[0] = {
						...newPages[0],
						messages: newPages[0].messages.filter((m) => m.id !== context.tempId),
					};
					return { ...old, pages: newPages };
				});
			}
		},

		// No onSettled invalidation — WS new_message replaces the temp entry with real data.
	});
}
