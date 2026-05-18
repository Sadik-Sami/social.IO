import { z } from 'zod';
import { Hono } from 'hono';
import { type AppEnv } from '@/types/app-env';
import { HTTPException } from 'hono/http-exception';
import { isAuthenticated, validate } from '@/middlewares';
import { generateCloudinarySignature, deleteCloudinaryImage } from '@/services';

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

const deleteImageBodySchema = z.object({
	imageUrl: z.string().url(),
});

/**
 * @route DELETE /upload/image
 * @desc Delete an image from Cloudinary
 * @access Private
 */
uploadController.delete(
	'/image',
	isAuthenticated,
	validate('json', deleteImageBodySchema),
	async (c) => {
		const user = c.get('user');
		const userId = user?.id;

		if (!userId) {
			throw new HTTPException(401, { message: 'Unauthorized' });
		}

		const { imageUrl } = c.req.valid('json');
		const success = await deleteCloudinaryImage(imageUrl);

		// We return 200 even if it fails, as Cloudinary might return 'not found' 
		// if it was already deleted or doesn't exist, which is fine for idempotency.
		return c.json({ success }, 200);
	}
);
