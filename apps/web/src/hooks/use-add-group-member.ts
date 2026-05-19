import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { conversationKeys } from '@/lib/query-keys';

export function useAddGroupMember() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: ({ conversationId, participantId, role }: { conversationId: string; participantId: string; role: 'admin' | 'member' }) =>
			api.post(`/api/conversations/${conversationId}/members`, { participantId, role }),
		onSuccess: (_, { conversationId }) => {
			qc.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
		},
	});
}
