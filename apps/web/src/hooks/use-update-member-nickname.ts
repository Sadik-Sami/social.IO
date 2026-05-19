import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { conversationKeys } from '@/lib/query-keys';

export function useUpdateMemberNickname() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: ({ conversationId, nickname }: { conversationId: string; nickname: string | null }) =>
			api.patch(`/api/conversations/${conversationId}/members/me`, { nickname }),
		onSuccess: (_, { conversationId }) => {
			qc.invalidateQueries({ queryKey: conversationKeys.detail(conversationId) });
		},
	});
}
