import { pgEnum } from 'drizzle-orm/pg-core';

export const conversationTypeEnum = pgEnum('conversation_type', ['dm', 'group']);
export const participantRoleEnum = pgEnum('participant_role', ['admin', 'member']);
export const messageTypeEnum = pgEnum('message_type', ['text', 'image', 'system']);
