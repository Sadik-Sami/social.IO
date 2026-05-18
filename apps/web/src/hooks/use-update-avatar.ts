import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { profileKeys } from '@/lib/query-keys';
import type { UpdateProfileAvatarBody } from '@/types/api';

export function useUpdateAvatar() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: (data: UpdateProfileAvatarBody) => api.patch('/api/profile/avatar', data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: profileKeys.all });
		},
	});
}
