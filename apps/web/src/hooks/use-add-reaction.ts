import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAddReaction() {
	return useMutation({
		mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
			api.post(`/api/messages/${messageId}/reactions`, { emoji }),
	});
}
