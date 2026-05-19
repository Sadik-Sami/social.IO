import { z } from 'zod';
import type { WSContext } from 'hono/ws';
import type { MessageResponse } from '@/validators';

// ─── Inbound Zod Schemas ─────────────────────────────────────────────────────

const echoSchema = z.object({
	type: z.literal('echo'),
	payload: z.object({ text: z.string() }),
});

const joinConversationSchema = z.object({
	type: z.literal('join_conversation'),
	payload: z.object({ conversationId: z.string().min(1) }),
});

const leaveConversationSchema = z.object({
	type: z.literal('leave_conversation'),
	payload: z.object({ conversationId: z.string().min(1) }),
});

const typingStartSchema = z.object({
	type: z.literal('typing_start'),
	payload: z.object({ conversationId: z.string().min(1) }),
});

const typingStopSchema = z.object({
	type: z.literal('typing_stop'),
	payload: z.object({ conversationId: z.string().min(1) }),
});

// Replaces per-message `message_seen`. Client sends this when it enters a
// conversation room and has viewed messages up to lastSeenSequence.
const conversationSeenSchema = z.object({
	type: z.literal('conversation_seen'),
	payload: z.object({
		conversationId: z.string().min(1),
		lastSeenSequence: z.number().int().min(0),
	}),
});

const heartbeatSchema = z.object({
	type: z.literal('heartbeat'),
	payload: z.object({}).strict().optional().default({}),
});

export const inboundEventSchema = z.discriminatedUnion('type', [
	echoSchema,
	joinConversationSchema,
	leaveConversationSchema,
	typingStartSchema,
	typingStopSchema,
	conversationSeenSchema,
	heartbeatSchema,
]);

export type InboundEvent = z.infer<typeof inboundEventSchema>;

// ─── Outbound Types ──────────────────────────────────────────────────────────

export type EchoEvent = {
	type: 'echo';
	payload: { text: string };
};

export type NewMessageEvent = {
	type: 'new_message';
	conversationId: string;
	message: MessageResponse;
	tempId?: string;
};

export type JoinedEvent = {
	type: 'joined';
	conversationId: string;
};

export type TypingUpdateEvent = {
	type: 'typing_update';
	conversationId: string;
	typingUserIds: string[];
};

export type PresenceUpdateEvent = {
	type: 'presence_update';
	userId: string;
	online: boolean;
	lastSeenAt?: string;
};

// Replaces per-message MessageStatusUpdateEvent.
// Frontend derives per-message status by comparing message.sequenceNumber
// against lastDeliveredSequence / lastSeenSequence for the relevant participant.
export type ConversationStatusUpdateEvent = {
	type: 'conversation_status_update';
	conversationId: string;
	userId: string;
	lastDeliveredSequence: number;
	lastSeenSequence: number;
};

export type ConversationUpdatedEvent = {
	type: 'conversation_updated';
	conversationId: string;
	lastMessageId: string;
	updatedAt: string;
};

export type MemberAddedEvent = {
	type: 'member_added';
	conversationId: string;
	userId: string;
	role: 'admin' | 'member';
	nickname: string | null;
	addedBy: string;
};

export type MemberRemovedEvent = {
	type: 'member_removed';
	conversationId: string;
	userId: string;
	removedBy: string;
};

export type ReactionUpdateEvent = {
	type: 'reaction_update';
	conversationId: string;
	messageId: string;
	emoji: string;
	userId: string;
	action: 'added' | 'removed';
};

export type HeartbeatAckEvent = {
	type: 'heartbeat_ack';
};

export type ErrorEvent = {
	type: 'error';
	error: string;
};

export type OutboundEvent =
	| EchoEvent
	| NewMessageEvent
	| JoinedEvent
	| TypingUpdateEvent
	| PresenceUpdateEvent
	| ConversationStatusUpdateEvent
	| ConversationUpdatedEvent
	| MemberAddedEvent
	| MemberRemovedEvent
	| ReactionUpdateEvent
	| HeartbeatAckEvent
	| ErrorEvent;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export type TypedWS = {
	send: (event: OutboundEvent) => void;
	close: () => void;
};

export function createTypedWS(ws: WSContext): TypedWS {
	return {
		send: (event) => ws.send(JSON.stringify(event)),
		close: () => ws.close(),
	};
}

export function parseInboundEvent(data: string): InboundEvent | null {
	try {
		const parsed = JSON.parse(data) as unknown;
		const result = inboundEventSchema.safeParse(parsed);
		return result.success ? result.data : null;
	} catch {
		return null;
	}
}
