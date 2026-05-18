import type { WSContext } from 'hono/ws';

// ─── Room Registry (active conversation viewers) ─────────────────────────────

const roomSockets = new Map<string, Set<WSContext>>();
const roomUsers = new Map<string, Set<string>>();
const userRooms = new Map<string, Set<string>>();

export function joinRoom(conversationId: string, userId: string, ws: WSContext): void {
	if (!roomSockets.has(conversationId)) {
		roomSockets.set(conversationId, new Set());
	}
	roomSockets.get(conversationId)!.add(ws);

	if (!roomUsers.has(conversationId)) {
		roomUsers.set(conversationId, new Set());
	}
	roomUsers.get(conversationId)!.add(userId);

	if (!userRooms.has(userId)) {
		userRooms.set(userId, new Set());
	}
	userRooms.get(userId)!.add(conversationId);
}

export function leaveRoom(conversationId: string, userId: string, ws: WSContext): void {
	roomSockets.get(conversationId)?.delete(ws);
	if (roomSockets.get(conversationId)?.size === 0) {
		roomSockets.delete(conversationId);
	}

	roomUsers.get(conversationId)?.delete(userId);
	if (roomUsers.get(conversationId)?.size === 0) {
		roomUsers.delete(conversationId);
	}

	userRooms.get(userId)?.delete(conversationId);
}

export function leaveAllRooms(userId: string, ws: WSContext): string[] {
	const rooms = [...(userRooms.get(userId) ?? [])];

	for (const convId of rooms) {
		roomSockets.get(convId)?.delete(ws);
		if (roomSockets.get(convId)?.size === 0) {
			roomSockets.delete(convId);
		}

		roomUsers.get(convId)?.delete(userId);
		if (roomUsers.get(convId)?.size === 0) {
			roomUsers.delete(convId);
		}
	}

	userRooms.delete(userId);
	return rooms;
}

// This is in-process memory (single server instance).
// For multi-instance deployments, this would need to move to Redis.
export function isUserInRoom(conversationId: string, userId: string): boolean {
	return roomUsers.get(conversationId)?.has(userId) ?? false;
}

export function pushToRoom(conversationId: string, payload: string): void {
	const sockets = roomSockets.get(conversationId);
	if (!sockets) return;

	for (const ws of sockets) {
		if (ws.readyState === 1) {
			ws.send(payload);
		}
	}
}

export function getUserJoinedRooms(userId: string): string[] {
	return [...(userRooms.get(userId) ?? [])];
}

// ─── User Socket Registry (all connected authenticated users) ────────────────

const userSockets = new Map<string, Set<WSContext>>();

export function addUserSocket(userId: string, ws: WSContext): void {
	if (!userSockets.has(userId)) {
		userSockets.set(userId, new Set());
	}
	userSockets.get(userId)!.add(ws);
}

export function removeUserSocket(userId: string, ws: WSContext): void {
	const sockets = userSockets.get(userId);
	if (!sockets) return;

	sockets.delete(ws);
	if (sockets.size === 0) {
		userSockets.delete(userId);
	}
}

export function pushToUser(userId: string, payload: string): void {
	const sockets = userSockets.get(userId);
	if (!sockets) return;

	for (const ws of sockets) {
		if (ws.readyState === 1) {
			ws.send(payload);
		}
	}
}
