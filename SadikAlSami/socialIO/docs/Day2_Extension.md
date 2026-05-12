# Day 2 Extension — Profile Setup, User Search, Display Name & Presence

> Addendum to Plan_Progress.md · Integrates into Day 2 todos and Day 3 presence wiring
> All items below are additions or modifications to the existing plan.

---

## A. Schema Changes (Do First — Before Any Day 2 Code)

### A1. `user_profile` table modifications

Three changes to the existing schema:

**1. Make `display_name` unique**

```ts
// packages/db/src/schema/profile.ts
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const userProfile = pgTable(
  "user_profile",
  {
    id:          text("id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull().unique(), // ← unique constraint
    avatarUrl:   text("avatar_url"),
    bio:         text("bio"),
    lastSeenAt:  timestamp("last_seen_at"),               // ← written on WS disconnect
    createdAt:   timestamp("created_at").defaultNow().notNull(),
    updatedAt:   timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    // Trigram index — makes ILIKE '%query%' fast without a search engine
    // Requires: CREATE EXTENSION IF NOT EXISTS pg_trgm;
    // Add this to your first migration file or run manually once
    index("profile_display_name_idx").on(table.displayName),
  ]
);
```

**2. Add trigram extension to your migration**

Create a migration file or add to `drizzle.config.ts` custom SQL:

```sql
-- Run once on your Postgres instance (local and production)
-- packages/db/src/migrations/0000_enable_trgm.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- The trigram index — enables fast ILIKE on display_name
CREATE INDEX IF NOT EXISTS profile_display_name_trgm_idx
  ON user_profile USING gin (display_name gin_trgm_ops);
```

Why trigram and not a plain B-tree index? A plain index on `display_name` helps `WHERE display_name = 'exact'` but does nothing for `WHERE display_name ILIKE '%sim%'` (contains search). Trigram indexes break strings into 3-character chunks and index those, making substring search as fast as an exact lookup.

**3. After schema change: generate + migrate + push**

```bash
pnpm --filter @socialIO/db db:generate   # generate migration files
pnpm --filter @socialIO/db db:migrate    # apply to local DB
# Verify in psql:
# \d user_profile  →  should show display_name with UNIQUE constraint
# \di  →  should show profile_display_name_trgm_idx
```

---

## B. Profile Setup Flow (No Auto-Create on Signup)

### B1. Decision

Better Auth creates the `user` row on signup. Your app does **not** auto-create `user_profile`. After every login, the frontend checks whether a profile exists. If not, it redirects to `/profile/setup` before the user can access `/chat`.

This is the correct design because:
- Auto-creating an empty profile violates the `display_name NOT NULL` constraint
- Even if you allowed null display names, search would be broken for those users
- Forcing profile setup is the standard pattern (Discord, Notion, Linear all do this)

### B2. The profile existence check

```ts
// apps/server/src/routes/profile.ts

// GET /api/profile/me
// Called by the frontend immediately after login
// Returns the profile if it exists, or 404 if setup is needed
profileRouter.get("/me", authMiddleware, async (c) => {
  const userId = c.get("userId");

  const [profile] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.id, userId));

  if (!profile) {
    return c.json({ exists: false }, 404);
  }

  return c.json({ exists: true, profile });
});
```

```ts
// Frontend: apps/web/src/app/(app)/layout.tsx
// This layout wraps /chat and any other authenticated routes
// It gates access behind profile existence

export default async function AppLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const profileRes = await fetch(`${API_URL}/api/profile/me`, {
    headers: { Cookie: ... }
  });

  if (profileRes.status === 404) {
    redirect("/profile/setup");
  }

  return <>{children}</>;
}
```

### B3. Profile setup page

Route: `/profile/setup` — accessible only to authenticated users with no profile.

Prefill strategy:
- `displayName` input → prefilled with `session.user.name` from Better Auth
- `avatarUrl` input (file or URL) → prefilled with `session.user.image` if it exists
- `bio` textarea → empty, user fills in

```ts
// apps/server/src/routes/profile.ts

// POST /api/profile
// Creates the profile — called once on the setup page submit
// Zod validates display_name uniqueness at DB level (unique constraint throws)

const createProfileSchema = z.object({
  displayName: z
    .string()
    .min(3, "Display name must be at least 3 characters")
    .max(32, "Display name must be at most 32 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores"),
  avatarUrl: z.string().url().optional(),
  bio:       z.string().max(160).optional(),
});

profileRouter.post(
  "/",
  authMiddleware,
  zValidator("json", createProfileSchema),
  async (c) => {
    const userId = c.get("userId");
    const body   = c.req.valid("json");

    // Check profile does not already exist
    const [existing] = await db
      .select({ id: userProfile.id })
      .from(userProfile)
      .where(eq(userProfile.id, userId));

    if (existing) {
      return c.json({ error: "Profile already exists" }, 409);
    }

    try {
      const [created] = await db
        .insert(userProfile)
        .values({
          id:          userId,
          displayName: body.displayName,
          avatarUrl:   body.avatarUrl ?? null,
          bio:         body.bio ?? null,
        })
        .returning();

      return c.json(created, 201);
    } catch (err: any) {
      // Postgres unique violation code = 23505
      if (err.code === "23505") {
        return c.json(
          { error: "Display name is already taken. Please choose another." },
          409
        );
      }
      throw err;
    }
  }
);

// PATCH /api/profile/me
// Updates the profile after it exists (settings page)
const updateProfileSchema = createProfileSchema.partial();

profileRouter.patch(
  "/me",
  authMiddleware,
  zValidator("json", updateProfileSchema),
  async (c) => {
    const userId = c.get("userId");
    const body   = c.req.valid("json");

    try {
      const [updated] = await db
        .update(userProfile)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(userProfile.id, userId))
        .returning();

      return c.json(updated);
    } catch (err: any) {
      if (err.code === "23505") {
        return c.json({ error: "Display name is already taken." }, 409);
      }
      throw err;
    }
  }
);
```

---

## C. User Search

### C1. Endpoint

```
GET /api/users/search?q={query}
```

- Requires auth (session cookie)
- Excludes the requesting user from results
- Searches `display_name` via trigram ILIKE (fast due to gin index)
- Also searches `email` as a secondary path (exact or prefix match)
- Returns max 20 results — this is a people picker, not full-text search
- Returns only safe public fields: `id`, `displayName`, `avatarUrl`
  Never returns `email` in the response (privacy)

### C2. Service

```ts
// apps/server/src/services/user.service.ts
import { db } from "@socialIO/db";
import { userProfile, user } from "@socialIO/db/schema";
import { ilike, or, and, ne, eq } from "drizzle-orm";

export async function searchUsers(query: string, requestingUserId: string) {
  if (!query || query.trim().length < 2) return [];

  const q = query.trim();

  return await db
    .select({
      id:          userProfile.id,
      displayName: userProfile.displayName,
      avatarUrl:   userProfile.avatarUrl,
    })
    .from(userProfile)
    .innerJoin(user, eq(userProfile.id, user.id))
    .where(
      and(
        ne(userProfile.id, requestingUserId),   // exclude self
        or(
          ilike(userProfile.displayName, `%${q}%`),  // uses trgm index
          ilike(user.email, `${q}%`)                 // prefix match on email
        )
      )
    )
    .limit(20);
}
```

### C3. Route

```ts
// apps/server/src/routes/users.ts
const searchQuerySchema = z.object({
  q: z.string().min(2, "Search query must be at least 2 characters").max(50),
});

usersRouter.get(
  "/search",
  authMiddleware,
  zValidator("query", searchQuerySchema),
  async (c) => {
    const userId = c.get("userId");
    const { q }  = c.req.valid("query");

    const results = await searchUsers(q, userId);
    return c.json(results);
  }
);
```

### C4. Verify it works

```bash
# Two characters minimum
curl "http://localhost:3001/api/users/search?q=si" -H "Cookie: session=..."
# [{ id, displayName, avatarUrl }, ...]

# Too short → 422
curl "http://localhost:3001/api/users/search?q=s"
# { error: "Validation failed" }

# No session → 401
curl "http://localhost:3001/api/users/search?q=sim"
# { error: "Unauthorized" }
```

---

## D. Online/Offline Presence and Last Seen

### D1. Two separate concerns — do not conflate them

| Concern | Storage | Updated when | Used for |
|---|---|---|---|
| **Online now** (green dot) | Redis `presence:user:{id}` HASH, TTL 30s | WS connect, heartbeat every 20s | Live indicator in chat UI |
| **Last seen** (e.g. "3h ago") | `user_profile.last_seen_at` timestamp | WS disconnect | Shown when user is offline |

### D2. Why this split is optimal

Storing live presence in PostgreSQL would require an update query every 20 seconds per connected user. At 1000 users that is 50 updates/second hitting the DB for nothing useful. Redis TTL handles expiry automatically — if the heartbeat stops (tab closed, crash, network drop), the key simply expires after 30 seconds with zero cleanup code needed.

`last_seen_at` in PostgreSQL is written only once per session disconnect. One write per logout/disconnect. Cheap, durable, always accurate when the user is offline.

### D3. WebSocket lifecycle wires both together

```ts
// apps/server/src/ws/handler.ts
// These three events cover the full presence lifecycle

onOpen: async (event, ws) => {
  const userId = c.get("userId");

  // Set presence in Redis — heartbeat will keep refreshing this
  await redis.hset(`presence:user:${userId}`, {
    status:    "online",
    last_seen: Date.now(),
  });
  await redis.expire(`presence:user:${userId}`, 30);

  // Start heartbeat — client sends { type: "heartbeat" } every 20s
  // Server refreshes the Redis TTL on each heartbeat
};

// Client sends { type: "heartbeat" } every 20 seconds
case "heartbeat": {
  await redis.expire(`presence:user:${userId}`, 30);
  // No broadcast needed — just refresh the TTL
  break;
}

onClose: async (event, ws) => {
  // 1. Remove presence from Redis immediately
  await redis.del(`presence:user:${userId}`);

  // 2. Write last_seen_at to DB — this is the "was online X ago" timestamp
  await db
    .update(userProfile)
    .set({ lastSeenAt: new Date() })
    .where(eq(userProfile.id, userId));

  leaveAll(ws, userId);
};
```

### D4. How the frontend checks presence

When a user opens a conversation, the client needs to know which participants are currently online. One endpoint handles this:

```ts
// apps/server/src/routes/users.ts

// GET /api/users/presence?ids=id1,id2,id3
// Called once when a conversation opens
// Returns which of the given user IDs are currently online

usersRouter.get(
  "/presence",
  authMiddleware,
  async (c) => {
    const idsParam = c.req.query("ids") ?? "";
    const userIds  = idsParam.split(",").filter(Boolean).slice(0, 50);
    // Cap at 50 — group size limit is well under this

    if (userIds.length === 0) return c.json({});

    // Check Redis for each user
    // pipeline = one round-trip for all checks
    const pipeline = redis.pipeline();
    userIds.forEach(id => pipeline.exists(`presence:user:${id}`));
    const results = await pipeline.exec();

    const presence: Record<string, boolean> = {};
    userIds.forEach((id, i) => {
      presence[id] = results![i][1] === 1;
    });

    return c.json(presence);
    // { "user_a_id": true, "user_b_id": false, "user_c_id": true }
  }
);
```

Frontend usage:
```ts
// When conversation opens, fetch presence for all participants
const { data: presence } = useQuery({
  queryKey: ["presence", conversationId],
  queryFn: () => fetch(`/api/users/presence?ids=${participantIds.join(",")}`),
  refetchInterval: 25_000, // re-check every 25s (slightly under the 30s TTL)
  staleTime: 20_000,
});

// Green dot: presence["user_b_id"] === true
```

### D5. Real-time presence updates via WebSocket

When a user connects or disconnects, broadcast a presence event to all their active conversations:

```ts
// In onOpen — tell everyone this user is now online
const userConversations = await getUserConversationIds(userId);
for (const convId of userConversations) {
  await broadcastMessage(convId, {
    type:   "presence_update",
    userId,
    online: true,
  });
}

// In onClose — tell everyone this user went offline
for (const convId of userConversations) {
  await broadcastMessage(convId, {
    type:      "presence_update",
    userId,
    online:    false,
    lastSeen:  new Date().toISOString(),
  });
}
```

This means the green dot updates in real time without polling. The polling fallback (`refetchInterval: 25_000`) is a safety net for missed events.

---

## E. Day 2 Todos — Updated and Complete

Replace the existing Day 2 section with this:

---

### Day 2 — Schema Update + Profile + Search + Chat Core HTTP

#### E1. Schema (do this first, before writing any service code)

- [ ] Add `unique()` to `userProfile.displayName` in `packages/db/src/schema/profile.ts`
- [ ] Add trigram index `profile_display_name_trgm_idx` (GIN, `gin_trgm_ops`)
- [ ] Add `CREATE EXTENSION IF NOT EXISTS pg_trgm` to migration SQL
- [ ] Run `db:generate` → `db:migrate` → `db:push`
- [ ] Verify in psql: `\d user_profile` shows UNIQUE on `display_name`, `\di` shows the GIN index

#### E2. Crypto

- [ ] Implement `packages/db/src/crypto.ts` (`encrypt`, `decrypt`, `getKey`)
- [ ] Run benchmark: `npx tsx packages/db/src/crypto.benchmark.ts` — confirm sub-0.01ms per op
- [ ] Manually verify round-trip: `decrypt(encrypt("hello")) === "hello"`

#### E3. Profile service (`apps/server/src/services/profile.service.ts`)

- [ ] `getProfile(userId)` — returns profile or null
- [ ] `createProfile({ userId, displayName, avatarUrl?, bio? })` — inserts, handles 23505 uniqueness error
- [ ] `updateProfile(userId, patch)` — partial update, handles 23505

#### E4. User service (`apps/server/src/services/user.service.ts`)

- [ ] `searchUsers(query, requestingUserId)` — trigram ILIKE on display_name + prefix on email, max 20
- [ ] `getUserPresence(userIds[])` — Redis pipeline EXISTS check, returns `Record<string, boolean>`

#### E5. Conversation service (`apps/server/src/services/conversation.service.ts`)

- [ ] `findOrCreateDm(userAId, userBId)` — sort IDs, check existing, create if not found
- [ ] `createGroup({ name, creatorId, participantIds[] })` — insert conversation + participants, creator gets role admin
- [ ] `getUserConversations(userId)` — join with last_message + sender profile for preview
- [ ] `getConversationById(id, requestingUserId)` — single conversation with participants, auth check

#### E6. Message service (`apps/server/src/services/message.service.ts`)

- [ ] `formatMessage(row)` — decrypt boundary, never exposes content_enc/content_iv
- [ ] `sendMessage({ conversationId, senderId, content, type, imageUrl?, replyToId? })` — encrypt, FOR UPDATE txn, last_message_id update
- [ ] `getMessages({ conversationId, cursor?, limit? })` — cursor pagination by sequence_number DESC

#### E7. Routes and middleware

- [ ] Auth middleware: extract session, attach `userId` to context, return 401 if missing
- [ ] Participant guard middleware: verify `userId` is an active participant in `conversationId`, return 403 if not
- [ ] Validation middleware: `zValidator` on all routes, returns 422 on schema failure

Routes to implement:

```
GET  /api/profile/me              → getProfile, 404 if not found
POST /api/profile                 → createProfile (setup page submit)
PATCH /api/profile/me             → updateProfile (settings page)

GET  /api/users/search?q=         → searchUsers (min 2 chars)
GET  /api/users/presence?ids=     → getUserPresence (comma-separated IDs)

GET  /api/conversations           → getUserConversations
POST /api/conversations           → findOrCreateDm | createGroup
GET  /api/conversations/:id       → getConversationById (participant guard)

GET  /api/conversations/:id/messages   → getMessages (participant guard, cursor pagination)
POST /api/conversations/:id/messages   → sendMessage (participant guard, encrypt)
```

#### E8. Frontend

- [ ] After login: call `GET /api/profile/me` → redirect to `/profile/setup` if 404
- [ ] `/profile/setup` page: form prefilled with `user.name` and `user.image`, submit calls `POST /api/profile`, on success redirect to `/chat`
- [ ] `/chat` shell: conversation list sidebar + empty thread state
- [ ] "New Chat" button → search modal → `GET /api/users/search?q=` (debounced 300ms) → click result → `POST /api/conversations` → navigate to conversation
- [ ] Conversation list: renders each item with avatar, display name, last message preview
- [ ] Thread view: renders messages from `GET /api/conversations/:id/messages`
- [ ] Composer: text input → `POST /api/conversations/:id/messages` → TanStack Query invalidates → thread re-renders

#### E9. Day 2 verification checklist

```bash
# Schema
psql → \d user_profile → display_name has UNIQUE constraint
psql → \di → profile_display_name_trgm_idx exists

# Crypto
npx tsx packages/db/src/crypto.benchmark.ts → sub-0.01ms per op

# Encryption boundary
rg -n "content_enc|content_iv" apps/server/src/routes  → zero hits
psql → SELECT content_enc FROM message LIMIT 1 → shows ciphertext, not plaintext

# Profile
curl POST /api/profile { displayName: "simanto" } → 201 created
curl POST /api/profile { displayName: "simanto" } again → 409 taken

# Search
curl GET /api/users/search?q=si → results, no self in list
curl GET /api/users/search?q=s  → 422 too short

# DM idempotency
curl POST /api/conversations { type: "dm", participantId: "X" } → conv id "abc"
curl POST /api/conversations { type: "dm", participantId: "X" } → same "abc"

# Messages
curl POST /api/conversations/abc/messages { content: "hello" } → 201, content: "hello"
psql → SELECT content_enc FROM message → ciphertext, not "hello"
curl GET /api/conversations/abc/messages → [{ content: "hello", sequenceNumber: 1 }]

# Auth
curl GET /api/conversations (no cookie) → 401
curl GET /api/conversations/abc/messages (not a participant) → 403
```

---

## F. Presence Notes for Day 3

The `onOpen` and `onClose` presence logic (Section D3) and the `presence_update` WS broadcast (Section D4) belong in Day 3 when WebSocket is implemented. Day 2 only needs:

- The `GET /api/users/presence?ids=` endpoint (REST, no WS needed)
- The `last_seen_at` column already in the schema (already there)

Day 3 adds:
- `SET presence:user:{id}` on WS connect
- `EXPIRE` refresh on heartbeat (every 20s from client)
- `DEL presence:user:{id}` + `UPDATE user_profile SET last_seen_at` on WS disconnect
- `presence_update` WS broadcast to shared conversations on connect/disconnect

---

## G. Gap Verification

Checking the full plan for remaining gaps after these additions:

| Area | Status |
|---|---|
| Auth (signup/login) | Covered — Better Auth handles this |
| Profile setup gate | Covered — Section B |
| Display name uniqueness + index | Covered — Section A |
| User search | Covered — Section C |
| DM creation (find or create) | Covered — Section E5 |
| Group creation | Covered — Section E5 |
| Live presence (green dot) | Covered — Section D, wired in Day 3 |
| Last seen timestamp | Covered — Section D, written on WS disconnect |
| Message send with encryption | Covered — Section E6 |
| Message pagination | Covered — Section E6 |
| Conversation list with preview | Covered — Section E5 |
| Redis cache (hot conversations) | Covered — Day 3 |
| Typing indicators | Covered — Day 3 |
| Message status (delivered/seen) | Covered — Day 4 |
| Group roles + member management | Covered — Day 5 |
| Reactions | Covered — Day 5 |
| Image upload | Covered — Day 6 |
| Message edit + cache invalidation | Covered — Day 6 |
| Deployment | Covered — Day 7 |

**No remaining gaps identified.**
