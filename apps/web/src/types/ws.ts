import { z } from 'zod';

import { messageResponseSchema } from './api';

/**
 * Outbound events (client → server)
 */
export const outboundEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('join_conversation'),
		payload: z.object({ conversationId: z.string().min(1) }),
	}),
	z.object({
		type: z.literal('leave_conversation'),
		payload: z.object({ conversationId: z.string().min(1) }),
	}),
	z.object({
		type: z.literal('typing_start'),
		payload: z.object({ conversationId: z.string().min(1) }),
	}),
	z.object({
		type: z.literal('typing_stop'),
		payload: z.object({ conversationId: z.string().min(1) }),
	}),
	z.object({
		type: z.literal('conversation_seen'),
		payload: z.object({
			conversationId: z.string().min(1),
			lastSeenSequence: z.number().int().min(0),
		}),
	}),
	z.object({
		type: z.literal('heartbeat'),
		payload: z.object({}).default({}),
	}),
]);

/**
 * Inbound events (server → client)
 */
export const inboundEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('new_message'),
		conversationId: z.string(),
		message: messageResponseSchema,
		tempId: z.string().optional(),
	}),
	z.object({
		type: z.literal('typing_update'),
		conversationId: z.string(),
		typingUserIds: z.array(z.string()),
	}),
	z.object({
		type: z.literal('presence_update'),
		userId: z.string(),
		online: z.boolean(),
		lastSeenAt: z.string().optional(),
	}),
	z.object({
		type: z.literal('conversation_status_update'),
		conversationId: z.string(),
		userId: z.string(),
		lastDeliveredSequence: z.number(),
		lastSeenSequence: z.number(),
	}),
	z.object({
		type: z.literal('conversation_updated'),
		conversationId: z.string(),
		lastMessageId: z.string(),
		updatedAt: z.string(),
	}),
	z.object({
		type: z.literal('joined'),
		conversationId: z.string(),
	}),
	z.object({
		type: z.literal('heartbeat_ack'),
	}),
	z.object({
		type: z.literal('error'),
		error: z.string(),
	}),
]);

export type OutboundEvent = z.infer<typeof outboundEventSchema>;
export type InboundEvent = z.infer<typeof inboundEventSchema>;

/**
 * Safe parse at the WS boundary.
 */
export function parseInboundEvent(raw: string): InboundEvent | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		const result = inboundEventSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
