import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { profileKeys } from '@/lib/query-keys';
import type { UpdateProfileBody } from '@/types/api';

export function useUpdateProfile() {
	const qc = useQueryClient();

	return useMutation({
		mutationFn: (data: UpdateProfileBody) => api.patch('/api/profile', data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: profileKeys.all });
		},
	});
}
