import { env } from '@socialIO/env/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME,
	api_key: env.CLOUDINARY_API_KEY,
	api_secret: env.CLOUDINARY_API_SECRET,
});

export async function generateCloudinarySignature(): Promise<{
	apikey: string;
	cloudname: string;
	signature: string;
	timestamp: number;
	folder: string;
}> {
	const paramsToSign = {
		timestamp: Math.floor(Date.now() / 1000),
		folder: 'socialIO',
	};
	const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);
	const signedUrl = {
		apikey: env.CLOUDINARY_API_KEY,
		cloudname: env.CLOUDINARY_CLOUD_NAME,
		signature: signature,
		timestamp: paramsToSign.timestamp,
		folder: paramsToSign.folder,
	};
	return signedUrl;
}

export function extractPublicIdFromUrl(url: string): string | null {
	// Example URL: https://res.cloudinary.com/cloudname/image/upload/v1234567890/socialIO/abc123xyz.jpg
	// The public ID is everything after the version number and before the extension.
	const regex = /\/v\d+\/(.+)\.[a-z]+$/i;
	const match = url.match(regex);
	if (match && match[1]) {
		return match[1];
	}
	return null;
}

export async function deleteCloudinaryImage(imageUrl: string): Promise<boolean> {
	const publicId = extractPublicIdFromUrl(imageUrl);
	if (!publicId) return false;

	const result = await cloudinary.uploader.destroy(publicId);
	return result.result === 'ok';
}
