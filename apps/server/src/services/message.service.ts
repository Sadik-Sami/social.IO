import type { MessageSelect } from '@socialIO/db/validators/chat.validators';
import { decrypt, encrypt } from '@socialIO/db/lib';
import { nanoid } from 'nanoid';
import {
	messageResponseSchema,
	MESSAGE_PAGE_SIZE_DEFAULT,
	type MessageResponse,
	type CreateMessageBody,
	type EditMessageBody,
	type AddReactionBody,
	reactionResponseSchema,
	type ReactionResponse,
} from '@/validators';
import { db } from '@socialIO/db';
import { conversation, message, messageEditHistory, messageReaction, participant, userProfile } from '@socialIO/db/schema';
import { and, desc, eq, isNull, lt, max, ne } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import {
	cacheAddMessage,
	cacheBulkAddMessages,
	cacheGetMessages,
	cacheUpdateMessage,
} from '@socialIO/db/redis/service';
import { presenceGetBulk } from '@socialIO/db/redis/service';
import { publish, publishToUsers } from '@/ws/pubsub';
import { isUserInRoom } from '@/ws/registry';

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatMessage(row: MessageSelect & { senderDisplayName?: string | null }): MessageResponse {
	return messageResponseSchema.parse({
		...row,
		content: row.isDeleted ? null : decrypt({ content_enc: row.contentEnc, content_iv: row.contentIv }),
	});
}

async function getConversationParticipantIds(conversationId: string): Promise<string[]> {
	const rows = await db
		.select({ userId: participant.userId })
		.from(participant)
		.where(and(eq(participant.conversationId, conversationId), isNull(participant.leftAt)));
	return rows.map((r) => r.userId);
}

async function resolveMessageMembership(
	messageId: string,
	userId: string,
): Promise<{ conversationId: string }> {
	const [row] = await db
		.select({
			conversationId: message.conversationId,
			participantId: participant.id,
		})
		.from(message)
		.leftJoin(
			participant,
			and(
				eq(participant.conversationId, message.conversationId),
				eq(participant.userId, userId),
				isNull(participant.leftAt),
			),
		)
		.where(eq(message.id, messageId))
		.limit(1);

	if (!row) {
		throw new HTTPException(404, { message: 'Message not found' });
	}

	if (!row.participantId) {
		throw new HTTPException(403, { message: 'Not a participant in this conversation' });
	}

	return { conversationId: row.conversationId };
}

// ─── Send Message ─────────────────────────────────────────────────────────────

export async function sendMessage(
	conversationId: string,
	senderId: string,
	body: CreateMessageBody,
): Promise<MessageResponse> {
	const { content, type = 'text', imageUrl, replyToId } = body;

	const { content_enc, content_iv } = encrypt(content);

	if (replyToId) {
		const [replyTarget] = await db
			.select({ id: message.id })
			.from(message)
			.where(and(eq(message.id, replyToId), eq(message.conversationId, conversationId)))
			.limit(1);

		if (!replyTarget) {
			throw new HTTPException(400, { message: 'Invalid replyToId: message does not exist in this conversation' });
		}
	}

	const saved = await db.transaction(async (tx) => {
		const [conv] = await tx
			.select({ id: conversation.id })
			.from(conversation)
			.where(eq(conversation.id, conversationId))
			.for('update');

		if (!conv) {
			throw new HTTPException(404, { message: 'Conversation not found' });
		}

		const maxSeqResult = await tx
			.select({ maxSeq: max(message.sequenceNumber) })
			.from(message)
			.where(eq(message.conversationId, conversationId));

		const nextSeq = (maxSeqResult[0]?.maxSeq ?? 0) + 1;

		const insertResult = await tx
			.insert(message)
			.values({
				id: nanoid(),
				conversationId,
				senderId,
				sequenceNumber: nextSeq,
				contentEnc: content_enc,
				contentIv: content_iv,
				type,
				imageUrl: imageUrl ?? null,
				replyToId: replyToId ?? null,
			})
			.returning();

		const row = insertResult[0];
		if (!row) {
			throw new HTTPException(500, { message: 'Failed to send message' });
		}

		await tx
			.update(conversation)
			.set({ lastMessageId: row.id, updatedAt: new Date() })
			.where(eq(conversation.id, conversationId));

		return row;
	});

	const [senderProfile] = await db
		.select({ displayName: userProfile.displayName })
		.from(userProfile)
		.where(eq(userProfile.id, senderId))
		.limit(1);

	const formatted = formatMessage({ ...saved, senderDisplayName: senderProfile?.displayName ?? null });

	try {
		await cacheAddMessage(conversationId, formatted.sequenceNumber, JSON.stringify(formatted));
	} catch {
		console.warn('[sendMessage] Failed to update cache', { conversationId, messageId: formatted.id });
	}

	// Sender has seen everything up to (and including) their own message
	await db
		.update(participant)
		.set({ lastDeliveredSequence: saved.sequenceNumber, lastSeenSequence: saved.sequenceNumber })
		.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, senderId)));

	try {
		await publish(conversationId, {
			type: 'new_message',
			conversationId,
			message: formatted,
			tempId: body.tempId
		});

		await publish(conversationId, {
			type: 'conversation_status_update',
			conversationId,
			userId: senderId,
			lastDeliveredSequence: saved.sequenceNumber,
			lastSeenSequence: saved.sequenceNumber,
		});

		const participantIds = await getConversationParticipantIds(conversationId);
		await publishToUsers(participantIds, {
			type: 'conversation_updated',
			conversationId,
			lastMessageId: formatted.id,
			updatedAt: new Date().toISOString(),
		});
	} catch {
		console.warn('[sendMessage] Failed to publish to Redis', { conversationId, messageId: formatted.id });
	}

	// Fire-and-forget: update participant sequences for all online receivers
	setImmediate(() => {
		updateStatusOnNewMessage(conversationId, saved.sequenceNumber, senderId).catch((err) => {
			console.error('[sendMessage] updateStatusOnNewMessage failed:', err);
		});
	});

	return formatted;
}

// ─── Get Messages ─────────────────────────────────────────────────────────────

export async function getMessages(
	conversationId: string,
	cursor?: number,
	limit = MESSAGE_PAGE_SIZE_DEFAULT,
): Promise<MessageResponse[]> {
	if (!cursor) {
		try {
			const cached = await cacheGetMessages(conversationId, limit);
			if (cached) {
				return cached.map((msg) => JSON.parse(msg) as MessageResponse);
			}
		} catch {
			// Cache miss — fall through to DB
		}
	}

	const rows = await db
		.select({
			id: message.id,
			conversationId: message.conversationId,
			senderId: message.senderId,
			sequenceNumber: message.sequenceNumber,
			contentEnc: message.contentEnc,
			contentIv: message.contentIv,
			type: message.type,
			imageUrl: message.imageUrl,
			replyToId: message.replyToId,
			isEdited: message.isEdited,
			editedAt: message.editedAt,
			isDeleted: message.isDeleted,
			deletedAt: message.deletedAt,
			createdAt: message.createdAt,
			senderDisplayName: userProfile.displayName,
		})
		.from(message)
		.leftJoin(userProfile, eq(message.senderId, userProfile.id))
		.where(and(eq(message.conversationId, conversationId), cursor ? lt(message.sequenceNumber, cursor) : undefined))
		.orderBy(desc(message.sequenceNumber))
		.limit(limit);

	const formatted = rows.map(formatMessage);

	if (!cursor && formatted.length > 0) {
		await cacheBulkAddMessages(
			conversationId,
			formatted.map((msg) => ({
				sequenceNumber: msg.sequenceNumber,
				messageJson: JSON.stringify(msg),
			})),
			limit,
		);
	}

	return formatted;
}

// ─── Edit Message ─────────────────────────────────────────────────────────────

export async function editMessage(
	messageId: string,
	senderId: string,
	messageBody: EditMessageBody,
): Promise<MessageResponse> {
	const [existing] = await db.select().from(message).where(eq(message.id, messageId)).limit(1);

	if (!existing) {
		throw new HTTPException(404, { message: 'Message not found' });
	}
	if (existing.senderId !== senderId) {
		throw new HTTPException(403, { message: 'You can only edit your own messages' });
	}
	if (existing.isDeleted) {
		throw new HTTPException(400, { message: 'Cannot edit a deleted message' });
	}
	if (existing.type !== 'text') {
		throw new HTTPException(400, { message: 'Only text messages can be edited' });
	}

	const { content_enc: newEnc, content_iv: newIv } = encrypt(messageBody.content);
	const updated = await db.transaction(async (tx) => {
		await tx.insert(messageEditHistory).values({
			id: nanoid(),
			messageId: existing.id,
			prevContentIv: existing.contentIv,
			prevContentEnc: existing.contentEnc,
			editedAt: new Date(),
		});
		const [row] = await tx
			.update(message)
			.set({ contentEnc: newEnc, contentIv: newIv, isEdited: true, editedAt: new Date() })
			.where(eq(message.id, messageId))
			.returning();
		return row;
	});

	if (!updated) {
		throw new HTTPException(500, { message: 'Failed to edit message' });
	}

	const formatted = formatMessage(updated);

	try {
		await cacheUpdateMessage(existing.conversationId, formatted.sequenceNumber, JSON.stringify(formatted));
	} catch {
		console.warn('[editMessage] Failed to update cache', {
			conversationId: existing.conversationId,
			messageId: formatted.id,
		});
	}

	try {
		await publish(existing.conversationId, {
			type: 'new_message',
			conversationId: existing.conversationId,
			message: formatted,
		});
		const participantIds = await getConversationParticipantIds(existing.conversationId);
		await publishToUsers(participantIds, {
			type: 'conversation_updated',
			conversationId: existing.conversationId,
			lastMessageId: formatted.id,
			updatedAt: new Date().toISOString(),
		});
	} catch {
		console.warn('[editMessage] Failed to publish to Redis', {
			conversationId: existing.conversationId,
			messageId: formatted.id,
		});
	}

	return formatted;
}

// ─── Soft Delete Message ──────────────────────────────────────────────────────

export async function softDeleteMessage(messageId: string, requestingUserId: string): Promise<MessageResponse> {
	const [existing] = await db.select().from(message).where(eq(message.id, messageId)).limit(1);

	if (!existing) {
		throw new HTTPException(404, { message: 'Message not found' });
	}
	if (existing.senderId !== requestingUserId) {
		throw new HTTPException(403, { message: 'You can only delete your own messages' });
	}
	if (existing.isDeleted) {
		throw new HTTPException(400, { message: 'Message is already deleted' });
	}

	const [deleted] = await db
		.update(message)
		.set({ isDeleted: true, deletedAt: new Date() })
		.where(eq(message.id, messageId))
		.returning();

	if (!deleted) {
		throw new HTTPException(500, { message: 'Failed to delete message' });
	}

	const formatted = formatMessage(deleted);

	try {
		await cacheUpdateMessage(existing.conversationId, formatted.sequenceNumber, JSON.stringify(formatted));
	} catch {
		console.warn('[softDeleteMessage] Failed to update cache', {
			conversationId: existing.conversationId,
			messageId: formatted.id,
		});
	}

	try {
		await publish(existing.conversationId, {
			type: 'new_message',
			conversationId: existing.conversationId,
			message: formatted,
		});
		const participantIds = await getConversationParticipantIds(existing.conversationId);
		await publishToUsers(participantIds, {
			type: 'conversation_updated',
			conversationId: existing.conversationId,
			lastMessageId: formatted.id,
			updatedAt: new Date().toISOString(),
		});
	} catch {
		console.warn('[softDeleteMessage] Failed to publish to Redis', {
			conversationId: existing.conversationId,
			messageId: formatted.id,
		});
	}

	return formatted;
}

// ─── Status: New Message Delivery ─────────────────────────────────────────────

/**
 * Called fire-and-forget after a new message is saved.
 * Updates lastDeliveredSequence / lastSeenSequence on each non-sender participant
 * based on their current online/in-room state.
 */
async function updateStatusOnNewMessage(conversationId: string, newSeq: number, senderId: string): Promise<void> {
	const participants = await db
		.select({
			userId: participant.userId,
			lastDeliveredSequence: participant.lastDeliveredSequence,
			lastSeenSequence: participant.lastSeenSequence,
		})
		.from(participant)
		.where(
			and(eq(participant.conversationId, conversationId), isNull(participant.leftAt), ne(participant.userId, senderId)),
		);

	if (participants.length === 0) return;

	const presenceMap = await presenceGetBulk(participants.map((p) => p.userId));

	for (const p of participants) {
		const isOnline = presenceMap[p.userId] ?? false;
		const isInRoom = isUserInRoom(conversationId, p.userId);

		if (isInRoom) {
			// Receiver is actively viewing this conversation → seen
			await db
				.update(participant)
				.set({ lastDeliveredSequence: newSeq, lastSeenSequence: newSeq })
				.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, p.userId)));

			await publish(conversationId, {
				type: 'conversation_status_update',
				conversationId,
				userId: p.userId,
				lastDeliveredSequence: newSeq,
				lastSeenSequence: newSeq,
			});
		} else if (isOnline) {
			// Receiver is online but not in this room → delivered
			await db
				.update(participant)
				.set({ lastDeliveredSequence: newSeq })
				.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, p.userId)));

			await publish(conversationId, {
				type: 'conversation_status_update',
				conversationId,
				userId: p.userId,
				lastDeliveredSequence: newSeq,
				lastSeenSequence: p.lastSeenSequence,
			});
		}
		// Receiver is offline → no update; stays at current value (sent state)
	}
}

// ─── Status: On Connect ───────────────────────────────────────────────────────

/**
 * Called when a user comes online. Catches up lastDeliveredSequence
 * for every conversation where new messages arrived while they were offline.
 */
export async function updateDeliveredOnConnect(userId: string): Promise<void> {
	const participantRows = await db
		.select({
			conversationId: participant.conversationId,
			lastDeliveredSequence: participant.lastDeliveredSequence,
			lastSeenSequence: participant.lastSeenSequence,
		})
		.from(participant)
		.where(and(eq(participant.userId, userId), isNull(participant.leftAt)));


	for (const row of participantRows) {
		const [latest] = await db
			.select({ maxSeq: max(message.sequenceNumber) })
			.from(message)
			.where(and(eq(message.conversationId, row.conversationId), eq(message.isDeleted, false)));

		const latestSeq = latest?.maxSeq ?? 0;
		if (latestSeq <= row.lastDeliveredSequence) continue;

		await db
			.update(participant)
			.set({ lastDeliveredSequence: latestSeq })
			.where(and(eq(participant.conversationId, row.conversationId), eq(participant.userId, userId)));

		await publish(row.conversationId, {
			type: 'conversation_status_update',
			conversationId: row.conversationId,
			userId,
			lastDeliveredSequence: latestSeq,
			lastSeenSequence: row.lastSeenSequence,
		});
	}
}

// NOTE: This loop can be expensive for users with many conversations.
// An optimization (phase 2) would be a single SQL query with MAX(seq) > lastDeliveredSequence predicate. For now this is correct and acceptable.

// ─── Status: Mark Conversation Seen ──────────────────────────────────────────

/**
 * Updates lastSeenSequence for a participant and broadcasts the status update.
 * Called from WS conversation_seen event and the REST fallback PATCH endpoint.
 */
export async function markConversationSeen(
	conversationId: string,
	userId: string,
	lastSeenSequence: number,
): Promise<void> {
	const [current] = await db
		.select({
			lastDeliveredSequence: participant.lastDeliveredSequence,
			lastSeenSequence: participant.lastSeenSequence,
		})
		.from(participant)
		.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, userId)))
		.limit(1);

	if (!current) return;

	// lastSeenSequence can never exceed lastDeliveredSequence AND it can never go backwards
	const clampedSeenSeq = Math.max(current.lastSeenSequence, Math.min(lastSeenSequence, current.lastDeliveredSequence));

	if (clampedSeenSeq === current.lastSeenSequence) return;

	await db
		.update(participant)
		.set({ lastSeenSequence: clampedSeenSeq })
		.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, userId)));

	await publish(conversationId, {
		type: 'conversation_status_update',
		conversationId,
		userId,
		lastDeliveredSequence: current.lastDeliveredSequence,
		lastSeenSequence: clampedSeenSeq,
	});
}

// ─── Unread Counts ────────────────────────────────────────────────────────────

/**
 * Returns unread message count per conversation for a user.
 * Computed as: max(message.sequenceNumber) - participant.lastSeenSequence
 */
export async function getUnreadCounts(userId: string): Promise<Record<string, number>> {
	const rows = await db
		.select({
			conversationId: participant.conversationId,
			lastSeenSequence: participant.lastSeenSequence,
			latestSeq: max(message.sequenceNumber),
		})
		.from(participant)
		.leftJoin(message, and(eq(message.conversationId, participant.conversationId), eq(message.isDeleted, false)))
		.where(and(eq(participant.userId, userId), isNull(participant.leftAt)))
		.groupBy(participant.conversationId, participant.lastSeenSequence);

	const result: Record<string, number> = {};
	for (const row of rows) {
		const latest = row.latestSeq ?? 0;
		result[row.conversationId] = Math.max(0, latest - row.lastSeenSequence);
	}
	return result;
}

// ─── Group Seen List (per-message) ────────────────────────────────────────────

/**
 * Returns the list of participant userIds who have seen a specific message.
 * Derived dynamically: participant.lastSeenSequence >= message.sequenceNumber.
 * No per-message storage needed.
 */
export async function getMessageSeenBy(messageId: string): Promise<{
	seenBy: string[];
	totalParticipants: number;
}> {
	const [msgRow] = await db
		.select({
			conversationId: message.conversationId,
			sequenceNumber: message.sequenceNumber,
			senderId: message.senderId,
		})
		.from(message)
		.where(eq(message.id, messageId))
		.limit(1);

	if (!msgRow) {
		throw new HTTPException(404, { message: 'Message not found' });
	}

	const participants = await db
		.select({
			userId: participant.userId,
			lastSeenSequence: participant.lastSeenSequence,
		})
		.from(participant)
		.where(
			and(
				eq(participant.conversationId, msgRow.conversationId),
				isNull(participant.leftAt),
				ne(participant.userId, msgRow.senderId),
			),
		);

	const seenBy = participants.filter((p) => p.lastSeenSequence >= msgRow.sequenceNumber).map((p) => p.userId);

	return { seenBy, totalParticipants: participants.length };
}

// ─── Participant Progress ─────────────────────────────────────────────────────

/**
 * Returns the lastDeliveredSequence and lastSeenSequence for a specific participant.
 * Useful for the frontend to derive per-message status indicators on load.
 */
export async function getParticipantProgress(
	conversationId: string,
	userId: string,
): Promise<{ lastDeliveredSequence: number; lastSeenSequence: number } | null> {
	const [row] = await db
		.select({
			lastDeliveredSequence: participant.lastDeliveredSequence,
			lastSeenSequence: participant.lastSeenSequence,
		})
		.from(participant)
		.where(and(eq(participant.conversationId, conversationId), eq(participant.userId, userId)))
		.limit(1);

	return row ?? null;
}

export async function addReaction(
	messageId: string,
	userId: string,
	body: AddReactionBody,
): Promise<{ created: boolean; reaction: ReactionResponse | null }> {
	const { conversationId } = await resolveMessageMembership(messageId, userId);

	const [inserted] = await db
		.insert(messageReaction)
		.values({
			id: nanoid(),
			messageId,
			userId,
			emoji: body.emoji,
		})
		.onConflictDoNothing({
			target: [messageReaction.messageId, messageReaction.userId, messageReaction.emoji],
		})
		.returning();

	const created = Boolean(inserted);
	const reaction = inserted ? reactionResponseSchema.parse(inserted) : null;

	if (created) {
		try {
			await publish(conversationId, {
				type: 'reaction_update',
				conversationId,
				messageId,
				emoji: body.emoji,
				userId,
				action: 'added',
			});
		} catch {
			console.warn('[addReaction] Failed to publish reaction_update');
		}
	}

	return { created, reaction };
}

export async function removeReaction(
	messageId: string,
	userId: string,
	emoji: string,
): Promise<{ removed: boolean }> {
	const { conversationId } = await resolveMessageMembership(messageId, userId);

	const deleted = await db
		.delete(messageReaction)
		.where(
			and(
				eq(messageReaction.messageId, messageId),
				eq(messageReaction.userId, userId),
				eq(messageReaction.emoji, emoji),
			),
		)
		.returning({ id: messageReaction.id });

	const removed = deleted.length > 0;

	if (removed) {
		try {
			await publish(conversationId, {
				type: 'reaction_update',
				conversationId,
				messageId,
				emoji,
				userId,
				action: 'removed',
			});
		} catch {
			console.warn('[removeReaction] Failed to publish reaction_update');
		}
	}

	return { removed };
}
