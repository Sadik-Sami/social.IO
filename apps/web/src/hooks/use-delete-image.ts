import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * @description
 * Custom mutation to delete an image from Cloudinary via our backend.
 * Uses the image's secure_url to issue the deletion.
 */
export function useDeleteImage() {
	return useMutation({
		mutationFn: async ({ imageUrl }: { imageUrl: string }) => {
			const { data } = await api.delete<{ success: boolean }>('/api/upload/image', {
				data: { imageUrl },
			});
			return data.success;
		},
	});
}
