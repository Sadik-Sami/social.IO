import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { conversationKeys } from '@/lib/query-keys';

export function useRemoveGroupMember() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: ({ conversationId, userId }: { conversationId: string; userId: string }) =>
			api.delete(`/api/conversations/${conversationId}/members/${userId}`),
		onSuccess: (_, { conversationId }) => {
			qc.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
		},
	});
}
