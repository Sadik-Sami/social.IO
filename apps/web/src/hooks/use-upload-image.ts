import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CloudinarySignature {
	apikey: string;
	cloudname: string;
	signature: string;
	timestamp: number;
	folder: string;
}

/**
 * @description
 * Custom mutation to handle the two-step Cloudinary upload process:
 * 1. Fetch secure signature from our backend
 * 2. POST the file directly to Cloudinary using the signature
 */
export function useUploadImage() {
	return useMutation({
		mutationFn: async ({ file }: { file: File }) => {
			// 1. Get signature
			const { data: res } = await api.get<{ success: boolean; data: CloudinarySignature }>('/api/upload/sign');

			const sig = res.data;
			console.log(sig);

			// 2. Upload to Cloudinary
			const formData = new FormData();
			formData.append('file', file);

			formData.append('api_key', sig.apikey);
			formData.append('timestamp', String(sig.timestamp));
			formData.append('signature', sig.signature);
			formData.append('folder', sig.folder);

			const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudname}/image/upload`, {
				method: 'POST',
				body: formData,
			});

			console.log(uploadRes);

			if (!uploadRes.ok) {
				throw new Error('Failed to upload image to Cloudinary');
			}

			const result = (await uploadRes.json()) as { secure_url: string; public_id: string };
			return result.secure_url;
		},
	});
}
