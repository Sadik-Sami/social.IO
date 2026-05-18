import { Hono } from 'hono';
import { type AppEnv } from '@/types/app-env';
import { HTTPException } from 'hono/http-exception';
import { isAuthenticated } from '@/middlewares';
import { generateCloudinarySignature } from '@/services';

export const uploadController = new Hono<AppEnv>();

/**
 * @route GET /upload/sign
 * @desc Get the signature for uploading images to Cloudinary
 * @access Private
 */
uploadController.get('/sign', isAuthenticated, async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const signature = await generateCloudinarySignature();
	return c.json({ success: true, data: signature }, 200);
});
