import { Hono } from 'hono';
import { type AppEnv } from '@/types/app-env';
import { HTTPException } from 'hono/http-exception';
import { createProfileBodySchema, updateProfileAvatarBodySchema, updateProfileBodySchema } from '@/validators';
import { createProfile, getProfile, searchProfiles, updateProfile, updateProfileImage } from '@/services';
import { isAuthenticated, validate } from '@/middlewares';
import z from 'zod';

export const profileController = new Hono<AppEnv>();

//
const searchQuerySchema = z.object({
	q: z.string().min(2, 'Search query must be at least 2 characters').max(50),
});

/**
 * @description
 * - `GET /api/profile` — get current user's profile
 * - `POST /api/profile` — create profile for current user, body: `{ displayName, avatarUrl?, bio? }`
 * - `PATCH /api/profile` — update profile for current user, body: `{ displayName?, avatarUrl?, bio? }`
 * - `PATCH /api/profile/avatar` — update profile avatar for current user, body: `{ avatarUrl }`
 *
 * - All routes require authentication.
 */

profileController.get('/', isAuthenticated, async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const profile = await getProfile(userId);

	return c.json({ success: true, profile });
});

profileController.get('/search', isAuthenticated, validate('query', searchQuerySchema), async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const { q } = c.req.valid('query');
	const results = await searchProfiles(q, userId);

	return c.json({ success: true, results });
});

profileController.post('/', isAuthenticated, validate('json', createProfileBodySchema), async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const profileData = c.req.valid('json');

	const profile = await createProfile(userId, profileData);
	return c.json({ success: true, profile });
});

profileController.patch('/', isAuthenticated, validate('json', updateProfileBodySchema), async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const profileData = c.req.valid('json');

	const profile = await updateProfile(userId, profileData);
	return c.json({ success: true, profile });
});

profileController.patch('/avatar', isAuthenticated, validate('json', updateProfileAvatarBodySchema), async (c) => {
	const user = c.get('user');
	const userId = user?.id;

	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const profileData = c.req.valid('json');

	const profile = await updateProfileImage(userId, profileData);
	return c.json({ success: true, profile });
});
