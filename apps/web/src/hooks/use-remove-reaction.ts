import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRemoveReaction() {
	return useMutation({
		mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
			api.delete(`/api/messages/${messageId}/reactions/${emoji}`),
	});
}
