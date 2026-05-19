# Real-Time Chat Application - Plan & Progress

> Stack target: Next.js, Hono, Better Auth, Drizzle ORM, PostgreSQL, Redis, Cloudinary, WebSockets
> Snapshot date: May 20, 2026

---

## 1. Purpose of this Document

This document tracks the current execution state of the social.io platform, separating what is already present in the repository from what remains to be implemented for the full chat system.

---

## 2. Current Repository Architecture

### Monorepo shape
- `apps/web` - Next.js frontend
- `apps/server` - Hono API & WebSocket server
- `packages/auth` - Better Auth integration
- `packages/db` - Database schema, migrations, Redis client, and encryption
- `packages/env` - Type-safe environment variables
- `packages/ui` - Shadcn UI components and design system
- `packages/config` - Shared ESLint, TS, and Prettier configs

### Current State
- **Server:** Fully functional Hono server with Better Auth, comprehensive chat REST routes, WebSocket upgrade/fan-out, DB operations, and Redis caching. Includes full reaction aggregation in `getMessages`.
- **Web:** Auth pages, profile onboarding (`/profile/onboarding`), and full chat UI (sidebar conversation list, real-time message thread, composer, user search modal). Group creation via dropdown FAB, group details modal with member management (add/remove/nickname). Inline emoji reaction picker and grouped reaction badges on messages. A cohesive "Warm Precision" design system is implemented.
- **Data/Infra:** PostgreSQL (Drizzle ORM) and Redis. Local Docker infra is fully operational.

---

## 3. Target Architecture (Mostly Implemented)

- `apps/server`: API gateway + realtime node.
  - Auth routes, REST routes for conversations/messages/profiles.
  - WebSocket handling for presence, typing, new messages, and read receipts.
  - End-to-end request/response validation with Zod + Hono `zValidator`.
- `apps/web`: Chat client.
  - Real-time conversation list and thread view.
  - State managed via TanStack Query and Zustand.
- **Redis:**
  - Pub/sub for multi-instance WS fan-out.
  - Ephemeral typing keys with TTL.
  - Presence tracking.
  - Hot-conversation cache (ZSET containing decrypted message JSON).
- **PostgreSQL:** Durable chat state with sequence-based ordering, AES-256-GCM encryption at rest, and scalable conversation-progress tracking (seen/delivered states on `participant` table).

---

## 4. API and Realtime Surfaces

### REST endpoints (Implemented)
- `GET /api/profile/me`, `POST /api/profile`, `PATCH /api/profile`, `PATCH /api/profile/avatar`, `GET /api/profile/search`
- `GET /api/conversations`, `POST /api/conversations`, `GET /api/conversations/:id`
- `POST /api/conversations/:id/members`, `DELETE /api/conversations/:id/members/:userId`, `PATCH /api/conversations/:id/members/me`
- `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages`
- `PATCH /api/messages/:id`, `DELETE /api/messages/:id`
- `POST /api/messages/:id/reactions`, `DELETE /api/messages/:id/reactions/:emoji`
- `GET /api/upload/sign`, `DELETE /api/upload/image`

### REST endpoints (Pending)
- None

### Realtime events (Implemented)
- **Client -> server:** `join_conversation`, `send_message`, `typing_start`, `typing_stop`, `conversation_seen`
- **Server -> client:** `new_message`, `typing_update`, `conversation_status_update`, `conversation_updated`, `member_added`, `member_removed`, `reaction_update`

### Realtime events (Pending)
- None

---

## 5. Encryption and Cache Design

- **Encryption:** AES-256-GCM runs entirely on the server. The client always receives plaintext. Ciphertext (`content_enc`, `content_iv`) is an internal DB concern and never appears in API responses, WS payloads, or Redis.
- **Cache:** To avoid repetitive decryption, formatted (plaintext) messages are cached in Redis ZSETs scored by `sequence_number`.
- **Invalidation:** Sending, editing, or deleting a message updates the DB and immediately updates the Redis ZSET via a pipeline.

---

## 6. Feature Status (Truthful)

### Foundation
- [x] Monorepo scaffold (`apps/*`, `packages/*`)
- [x] Better Auth baseline integration
- [x] Basic Hono server bootstrapped
- [x] Local Postgres + Redis infra setup in `packages/db`
- [x] Chat domain Drizzle schema implementation
- [x] Chat HTTP APIs
- [x] Realtime WebSocket flow

### Product features
- [x] DM and group conversation creation
- [x] Cursor-based message pagination
- [x] Typing indicators
- [x] Message delivered/seen lifecycle (Scalable Participant Progress Model) + realtime UI ticks
- [x] Redis hot cache and pub/sub fan-out
- [x] Encryption at rest for message content
- [x] Cache invalidation on new message, edit, delete, and reaction changes
- [x] UI Design System Rework ("Warm Precision")
- [x] Group membership admin flows (Server done, UI done)
- [x] Emoji reactions (Server done, UI done)
- [x] Image message flow (Cloudinary signed upload)

---

## 7. Execution Plan (Adjusted to Current Baseline)

### Day 1 - Baseline Alignment + Schema Bring-Up
- [x] Implement full chat/domain schema in Drizzle
- [x] Generate/push migrations
- [x] Add schema-level enums/validation contracts

### Day 2 — Schema Update + Profile + Search + Chat Core HTTP
- [x] Shared schemas + typed context
- [x] Schema changes (Unique display name, trigram index)
- [x] Crypto utils
- [x] Profile, User, Conversation, Message services
- [x] Controllers, routes, and middleware
- [x] Frontend profile setup (`/profile/onboarding`) and chat shell

### Day 3 - Realtime + Redis Integration
- [x] WebSocket upgrade and connection lifecycle
- [x] Redis pub/sub fan-out
- [x] Typing key TTL and presence
- [x] Redis ZSET cache populate and read path
- [x] Frontend WebSocket integration

### Day 4 - Message Status Architecture Rework + Chat List Fidelity
- [x] Refactor from `message_status` table to scalable Conversation Progress Model (`last_delivered_sequence`, `last_seen_sequence`)
- [x] Conversation list fetch by `last_message_id`
- [x] Read-receipt behavior for DM and group contexts
- [x] Status ticks and read receipts on messages
- [x] Chat list preview

### Day 5 - Groups, Roles, Reactions
- [x] Group role authorization gates
- [x] Member add/remove + nickname updates
- [x] Reaction mutation + realtime sync
- [x] Group member management UI (modal dialog, admin controls, nickname editing)
- [x] Reaction picker and reaction list display (inline badges, grouped counts, WS sync)

### Day 6 - Upload + Edit + Cache Hardening
- [x] Message edit path and cache invalidation
- [x] Display `is_deleted` messages (UX updated with inline actions)
- [x] Signed upload endpoint (`POST /api/upload/sign`)
- [x] Image delete endpoint (`DELETE /api/upload/image`)
- [x] Image message send path and UI
- [x] Message actions menu (Edit / Unsend)
- [x] Edit message flow (Composer inline editing)
- [x] Real-time presence UI (active dots, last seen text)

### Day 7 - Hardening + Deploy Readiness
- [ ] Error handling and rate-limit guardrails
- [O] Deployment wiring (Vercel, Railway)
- [O] Verify WSS works on production
- [ ] Error/empty/loading UX hardening
- [O] Failed send retry state
- [x] Connection lost banner (WS disconnect detection)

---

## 8. Frontend Functional Plan (Pages + Modules)

**Routes:**
- `/login`: sign-in/sign-up UI (Done)
- `/profile/onboarding`: Profile creation step (Done)
- `/chat`: chat shell with conversation list + thread view (Done)
- `/settings`: profile edits, notification toggles (Pending)

**Core UI modules:**
- Conversation list: preview, unread counts, last message (Done)
- Thread view: message list with infinite scroll, typing indicator, status ticks (Done)
- Composer: text input, send button, auto-resize, pill design (Done)

---

## 9. Risks and Mitigations

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Cache serving stale content after edit | Low | `ZREMRANGEBYSCORE` + `ZADD` at same score on every edit updates cache correctly. |
| Cache serving stale content after send | Low | Pipeline `ZADD` + `ZREMRANGEBYRANK` + `EXPIRE` after every insert keeps cache fresh. |
| Redis unavailable at runtime | Low | All cache paths fall through to DB silently. |
| Write throughput exceeds DB capacity | Very Low | Direct per-message transaction is correct now; write buffer documented as known scaling path. |

---

## 10. Decision Note: WebSocket Routing Architecture

### Context

We identified a critical flaw in the original WebSocket broadcast model. When a user received a new message in a conversation they weren't actively viewing, their sidebar (unread badges, chat ordering, last message preview) didn't update in real-time. The root cause: `publishGlobal()` routed through `pushToAllRooms()`, which only reached sockets that had explicitly joined a conversation room via `join_conversation`. Users sitting on the chat list or viewing a different conversation received nothing. Additionally, `pushToAllRooms` leaked conversation metadata to unrelated room members — a privacy bug.

### The Fix: Two-Layer Socket Routing

We split the in-memory registry into two distinct layers:

1. **Room-level** (`roomSockets: Map<convId, Set<WSContext>>`) — for high-frequency, active-chat events: `new_message`, `typing_update`, `conversation_status_update`. Only sockets that have explicitly joined a conversation room receive these.

2. **User-level** (`userSockets: Map<userId, Set<WSContext>>`) — for low-frequency, global-inbox events: `conversation_updated`, `presence_update`. Every connected socket receives these, regardless of which room they're viewing.

### Redis Channel Strategy: Single Shared Channel

We chose a **single shared `user:events` Redis Pub/Sub channel** instead of dynamic per-user channels (`user:{id}`).

**How it works:** When a message is sent, the server publishes one payload to `user:events` containing `{ targetUserIds: [...], payload: { ... } }`. Every Node instance receives this, checks its local `userSockets` map, and only pushes to sockets belonging to targeted users. Non-matching users are silently dropped.

**Why this over per-user channels:**

| Factor | Single shared channel | Per-user channels |
|--------|----------------------|-------------------|
| Redis subscriptions | 1 total | 1 per connected user |
| Subscribe/unsubscribe bookkeeping | Zero (subscribe once on boot) | Complex (on every connect/disconnect) |
| Multi-tab handling | Automatic (Set of sockets per user) | Same |
| Filtering cost | O(targetUserIds) map lookup per message | Zero (Redis handles routing) |
| Debugging | Simple (one channel to monitor) | Harder (thousands of channels) |
| Implementation complexity | Low | Medium |

**The tradeoff is clear:** with a single server instance, the shared channel is strictly better. There's no "wasted work" filtering events because all connected users are on the same process. The `userSockets.has(userId)` check is a single hash map lookup — essentially free.

### Future Upgrade Path (Multi-Instance)

If we ever scale to multiple Node.js instances behind a load balancer, the shared channel will still work correctly — each instance filters against its own local `userSockets` map. However, at very high scale (hundreds of instances), every instance would parse every user event just to potentially drop it. At that point, the migration path is:

1. Replace `user:events` with per-user channels: `user:{userId}`
2. Each server subscribes only to channels for users connected to that instance
3. Add `SUBSCRIBE` on `onOpen` and `UNSUBSCRIBE` on `onClose` in the WS handler
4. The `publishToUsers` function publishes to each user's individual channel

This is a clean, isolated change to `pubsub.ts` and `handler.ts` — no schema, service, or frontend changes needed. But for our current single-instance deployment, the shared channel is the correct engineering choice: simpler, fewer moving parts, identical performance characteristics.

---

## 11. Gaps & Suggestions

### Identified Gaps
1. **Optimistic Reaction Updates:** Currently relies on WebSocket `reaction_update` invalidating TanStack Query cache. UX feels instant on same-tab, but has a slight network delay on slower connections.
   - *Suggestion:* Implement `onMutate`/`onSettled` in `useAddReaction`/`useRemoveReaction` to update the cache instantly before the server responds.
2. **Reaction Picker Scope:** Uses a static set of 8 common emojis (`COMMON_EMOJIS`).
   - *Suggestion:* Integrate a full emoji picker library (e.g., `emoji-mart`) if users demand broader expression.
3. **Group Self-Leave:** Admins can remove members, but no UI allows a member to leave a group voluntarily.
   - *Suggestion:* Add "Leave Group" button in `GroupDetailsModal` for non-admins, calling a new `POST /conversations/:id/leave` endpoint.
4. **Group Avatar Upload:** Group creation currently accepts an `avatarUrl` in the schema, but the UI lacks an avatar uploader for groups.
   - *Suggestion:* Reuse existing `useUploadImage` hook in `CreateGroupModal` to allow custom group avatars.
5. **Message Reply UI:** Schema supports `replyToId`, but the composer and thread UI do not expose reply functionality.
   - *Suggestion:* Add swipe/click-to-reply on `MessageBubble`, update composer to show reply context.
6. **Rate Limiting:** No rate limiting on message send or reaction endpoints.
   - *Suggestion:* Implement `hono-rate-limiter` middleware for Day 7 hardening.

### Day 7 Priority Adjustments
- Rate limiting and error hardening should take precedence over deployment wiring.
- Verify WSS works on production requires a staging environment first.
