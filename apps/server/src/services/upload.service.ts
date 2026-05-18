import { env } from '@socialIO/env/server';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME,
	api_key: env.CLOUDINARY_API_KEY,
	api_secret: env.CLOUDINARY_API_SECRET,
});

export async function generateCloudinarySignature(): Promise<{
	signature: string;
	timestamp: number;
	cloudname: string;
	apikey: string;
	folder: string;
}> {
	const paramsToSign = {
		timestamp: Math.floor(new Date().getTime() / 1000),
		folder: 'socialIO',
		tags: 'socialIO-image',
	};
	const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);
	const signedUrl = {
		signature,
		timestamp: paramsToSign.timestamp,
		cloudname: env.CLOUDINARY_CLOUD_NAME,
		apikey: env.CLOUDINARY_API_KEY,
		folder: 'socialIO',
	};
	return signedUrl;
}
