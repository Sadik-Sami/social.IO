import { db } from '@socialIO/db';
import { and, eq, ilike, ne, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { userProfile } from '@socialIO/db/schema/profile';

import {
	profileResponseSchema,
	type CreateProfileBody,
	type ProfileResponse,
	type PublicUserResponse,
	type UpdateProfileAvatarBody,
	type UpdateProfileBody,
} from '@/validators';
import { user } from '@socialIO/db/schema/auth';

type SearchProfileRow = {
	user_profile: ProfileResponse;
	user: PublicUserResponse;
};

export async function getProfile(userID: string): Promise<ProfileResponse | null> {
	const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, userID));

	if (!profile) {
		throw new HTTPException(404, { message: 'Profile not found' });
	}

	return profileResponseSchema.parse(profile);
}

export async function createProfile(userId: string, profileData: CreateProfileBody): Promise<ProfileResponse> {
	const existingProfile = await db.select().from(userProfile).where(eq(userProfile.id, userId)).limit(1);

	if (existingProfile.length > 0) {
		throw new HTTPException(409, { message: 'Profile already exists' });
	}

	const existingName = await db
		.select()
		.from(userProfile)
		.where(eq(userProfile.displayName, profileData.displayName))
		.limit(1);

	if (existingName.length > 0) {
		throw new HTTPException(409, {
			message: 'Display name already taken',
		});
	}

	const [newProfile] = await db
		.insert(userProfile)
		.values({ id: userId, ...profileData })
		.returning();

	return profileResponseSchema.parse(newProfile);
}

export async function updateProfile(userID: string, profileData: UpdateProfileBody): Promise<ProfileResponse> {
	if (profileData.displayName) {
		const displayNameExists = await db
			.select()
			.from(userProfile)
			.where(and(eq(userProfile.displayName, profileData.displayName), ne(userProfile.id, userID)))
			.limit(1);

		if (displayNameExists.length > 0) {
			throw new HTTPException(409, {
				message: 'Display name already taken',
			});
		}
	}

	const [updatedProfile] = await db.update(userProfile).set(profileData).where(eq(userProfile.id, userID)).returning();

	if (!updatedProfile) {
		throw new HTTPException(404, { message: 'Profile not found' });
	}

	return profileResponseSchema.parse(updatedProfile);
}

export async function updateProfileImage(userId: string, data: UpdateProfileAvatarBody): Promise<ProfileResponse> {
	const [updatedProfile] = await db.update(userProfile).set(data).where(eq(userProfile.id, userId)).returning();

	if (!updatedProfile) {
		throw new HTTPException(404, { message: 'Profile not found' });
	}
	return profileResponseSchema.parse(updatedProfile);
}

export async function searchProfiles(query: string, requestingUserId: string): Promise<SearchProfileRow[]> {
	if (!query || query.trim().length < 2) return [];
	const q = query.trim();

	const profiles = await db
		.select()
		.from(userProfile)
		.innerJoin(user, eq(userProfile.id, user.id))
		.where(
			and(
				ne(userProfile.id, requestingUserId), // Exclude the requesting user's own profile
				or(
					ilike(userProfile.displayName, `%${q}%`), // using trgm index for efficient search
					ilike(user.email, `${q}%`), // prefix search on email
				),
			),
		)
		.limit(20);

	if (profiles.length === 0) {
		throw new HTTPException(404, { message: 'No profiles found' });
	}

	return profiles;
}
