import { pub, sub, RedisKeys } from '@socialIO/db/redis';
import type { OutboundEvent } from './types';
import { pushToRoom, pushToUser } from './registry';

const subscribedChannels = new Set<string>();

sub.on('message', (channel: string, payload: string) => {
	if (channel === RedisKeys.userEventsChannel) {
		try {
			const envelope = JSON.parse(payload) as { targetUserIds: string[]; payload: string };
			for (const userId of envelope.targetUserIds) {
				pushToUser(userId, envelope.payload);
			}
		} catch {
			console.warn('[pubsub] Failed to parse user_events payload');
		}
		return;
	}
	const conversationId = channel.replace('conversation:', '');
	pushToRoom(conversationId, payload);
});

export async function publish(conversationId: string, event: OutboundEvent): Promise<void> {
	await pub.publish(RedisKeys.channel(conversationId), JSON.stringify(event));
}

export async function publishToUsers(targetUserIds: string[], event: OutboundEvent): Promise<void> {
	if (targetUserIds.length === 0) return;
	const envelope = JSON.stringify({ targetUserIds, payload: JSON.stringify(event) });
	await pub.publish(RedisKeys.userEventsChannel, envelope);
}

export async function subscribeToConversation(conversationId: string): Promise<void> {
	const channel = RedisKeys.channel(conversationId);
	if (subscribedChannels.has(channel)) return;

	await sub.subscribe(channel, (err) => {
		if (err) console.error(`[pubsub] subscribe error on ${channel}:`, err);
	});

	subscribedChannels.add(channel);
}

export async function subscribeToUserEvents(): Promise<void> {
	if (subscribedChannels.has(RedisKeys.userEventsChannel)) return;

	await sub.subscribe(RedisKeys.userEventsChannel, (err) => {
		if (err) console.error('[pubsub] user_events subscribe error:', err);
	});

	subscribedChannels.add(RedisKeys.userEventsChannel);
}
