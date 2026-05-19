import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface CloudinarySignature {
	apikey: string;
	cloudname: string;
	signature: string;
	timestamp: number;
	folder: string;
}

function uploadWithXhr(
	cloudname: string,
	formData: FormData,
	onProgress?: (percent: number) => void,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudname}/image/upload`);

		xhr.upload.onprogress = (event) => {
			if (!event.lengthComputable || !onProgress) return;
			const percent = Math.round((event.loaded / event.total) * 100);
			onProgress(Math.min(100, Math.max(0, percent)));
		};

		xhr.onload = () => {
			if (xhr.status < 200 || xhr.status >= 300) {
				reject(new Error('Failed to upload image to Cloudinary'));
				return;
			}

			try {
				const result = JSON.parse(xhr.responseText) as { secure_url?: string };
				if (!result.secure_url) {
					reject(new Error('Cloudinary response did not include secure_url'));
					return;
				}
				resolve(result.secure_url);
			} catch {
				reject(new Error('Failed to parse Cloudinary upload response'));
			}
		};

		xhr.onerror = () => reject(new Error('Failed to upload image to Cloudinary'));
		xhr.send(formData);
	});
}

/**
 * @description
 * Custom mutation to handle the two-step Cloudinary upload process:
 * 1. Fetch secure signature from our backend
 * 2. POST the file directly to Cloudinary using the signature
 */
export function useUploadImage() {
	return useMutation({
		mutationFn: async ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) => {
			// 1. Get signature
			const { data: res } = await api.get<{ success: boolean; data: CloudinarySignature }>('/api/upload/sign');

			const sig = res.data;

			// 2. Upload to Cloudinary
			const formData = new FormData();
			formData.append('file', file);

			formData.append('api_key', sig.apikey);
			formData.append('timestamp', String(sig.timestamp));
			formData.append('signature', sig.signature);
			formData.append('folder', sig.folder);

			const secureUrl = await uploadWithXhr(sig.cloudname, formData, onProgress);
			return secureUrl;
		},
	});
}
