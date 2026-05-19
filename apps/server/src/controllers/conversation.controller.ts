import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import type { AppEnv } from '@/types/app-env';

import { isAuthenticated, isMember, requireGroupAdmin, validate } from '@/middlewares';

import {
	addMemberBodySchema,
	conversationIdParamSchema,
	createConversationBodySchema,
	memberParamSchema,
	updateMemberBodySchema,
} from '@/validators';

import {
	addConversationMember,
	createGroup,
	findOrCreateDM,
	getConversationById,
	getUnreadCounts,
	getUserConversations,
	removeConversationMember,
	updateMyMemberNickname,
} from '@/services';

export const conversationController = new Hono<AppEnv>();

/**
 * @route GET /conversations
 * @desc Get all conversations for the authenticated user with unread message counts
 * @access Private
 */
conversationController.get('/', isAuthenticated, async (c) => {
	const user = c.get('user');
	const userId = user?.id;
	if (!userId) {
		throw new HTTPException(401, {
			message: 'Unauthorized',
		});
	}

	const conversations = await getUserConversations(userId);

	return c.json({ success: true, conversations });
});

/**
 * @route GET /conversations/unread
 * @desc Get unread message counts per conversation
 * @access Private
 */
conversationController.get('/unread', isAuthenticated, async (c) => {
	const user = c.get('user');
	const userId = user?.id;
	if (!userId) {
		throw new HTTPException(401, { message: 'Unauthorized' });
	}

	const counts = await getUnreadCounts(userId);
	return c.json({ success: true, counts });
});

/**
 * @route POST /conversations
 * @desc Create a new conversation (DM or Group)
 * @access Private
 */
conversationController.post('/', isAuthenticated, validate('json', createConversationBodySchema), async (c) => {
	const user = c.get('user');
	const userId = user?.id;
	if (!userId) {
		throw new HTTPException(401, {
			message: 'Unauthorized',
		});
	}

	const body = c.req.valid('json');

	if (body.type === 'dm') {
		if (body.participantId === userId) {
			throw new HTTPException(400, {
				message: 'You cannot DM yourself',
			});
		}

		const conversation = await findOrCreateDM(userId, body.participantId);

		return c.json(
			{
				success: true,
				conversation,
			},
			201,
		);
	}

	const conversation = await createGroup(
		{
			name: body.name,
			participantIds: body.participantIds,
			avatarUrl: body.avatarUrl ?? undefined,
		},
		userId,
	);

	return c.json(
		{
			success: true,
			conversation,
		},
		201,
	);
});

/**
 * @route GET /conversations/:id
 * @desc Get conversation details by ID
 * @access Private (must be a participant)
 */
conversationController.get(
	'/:id',
	isAuthenticated,
	isMember,
	validate('param', conversationIdParamSchema),
	async (c) => {
		const conversationId = c.req.param('id');
		const conversation = await getConversationById(conversationId);

		if (!conversation) {
			throw new HTTPException(404, {
				message: 'Conversation not found',
			});
		}

		return c.json({ success: true, conversation });
	},
);

/**
 * @route POST /conversations/:id/members
 * @desc Add a member to a group conversation (admin only)
 * @access Private
 */
conversationController.post(
	'/:id/members',
	isAuthenticated,
	isMember,
	requireGroupAdmin,
	validate('param', conversationIdParamSchema),
	validate('json', addMemberBodySchema),
	async (c) => {
		const user = c.get('user');
		const userId = user?.id;
		if (!userId) {
			throw new HTTPException(401, { message: 'Unauthorized' });
		}

		const { id: conversationId } = c.req.valid('param');
		const body = c.req.valid('json');

		const participant = await addConversationMember(conversationId, userId, body);
		return c.json({ success: true, participant }, 201);
	},
);

/**
 * @route DELETE /conversations/:id/members/:userId
 * @desc Remove a member from a group conversation (admin only)
 * @access Private
 */
conversationController.delete(
	'/:id/members/:userId',
	isAuthenticated,
	isMember,
	requireGroupAdmin,
	validate('param', memberParamSchema),
	async (c) => {
		const user = c.get('user');
		const userId = user?.id;
		if (!userId) {
			throw new HTTPException(401, { message: 'Unauthorized' });
		}

		const { id: conversationId, userId: targetUserId } = c.req.valid('param');
		const participant = await removeConversationMember(conversationId, userId, targetUserId);
		return c.json({ success: true, participant });
	},
);

/**
 * @route PATCH /conversations/:id/members/me
 * @desc Update my nickname in a conversation
 * @access Private
 */
conversationController.patch(
	'/:id/members/me',
	isAuthenticated,
	isMember,
	validate('param', conversationIdParamSchema),
	validate('json', updateMemberBodySchema),
	async (c) => {
		const user = c.get('user');
		const userId = user?.id;
		if (!userId) {
			throw new HTTPException(401, { message: 'Unauthorized' });
		}

		const { id: conversationId } = c.req.valid('param');
		const body = c.req.valid('json');

		const participant = await updateMyMemberNickname(conversationId, userId, body);
		return c.json({ success: true, participant });
	},
);
