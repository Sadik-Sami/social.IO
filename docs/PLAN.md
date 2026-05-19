## Day 5 Server-First Plan: Group Roles, Member Management, Reactions, and Realtime Sync

### Summary
Implement Day 5 as a server-first feature slice with end-to-end type safety and minimal web ws typing support.
- Add strict group-admin authorization gates for member-management mutations.
- Add member add/remove/nickname APIs with transactional guardrails (`group-only`, `no last-admin removal`, `soft remove via leftAt`, `reactivate on re-add`).
- Add reaction APIs on `/api/messages/:id/reactions` with membership validation through message->conversation lookup.
- Add realtime events `member_added`, `member_removed`, `reaction_update` to server + web WS type unions so new events are typed and safely handled.
- Keep DB schema unchanged; leverage existing `participant` and `message_reaction` tables/indexes.

### Implementation Changes
- **Authorization and middleware (Hono + clean-code)**
  - Add `requireGroupAdmin` middleware that runs after `isMember` and enforces:
    - conversation exists and `type === "group"`;
    - `c.get("participantRole") === "admin"`.
  - Reuse existing `isMember` membership gate for `/conversations/:id/...` routes.
  - Keep reaction routes on `/messages/:id/reactions` behind `isAuthenticated`; membership is verified inside reaction service via message->conversation join.

- **Member management service + routes (Drizzle + Postgres correctness)**
  - Add routes in conversation controller:
    - `POST /api/conversations/:id/members` (admin only, group only)
    - `DELETE /api/conversations/:id/members/:userId` (admin only, group only, disallow self-remove)
    - `PATCH /api/conversations/:id/members/me` (active member only; nickname update)
  - Add service functions with transactions and guard clauses:
    - `addConversationMember(...)`:
      - If active participant exists: return conflict.
      - If participant exists with `leftAt != null`: reactivate row (`leftAt = null`, update `role`, `nickname`, `joinedAt`/`updatedAt`).
      - Else insert new participant row.
    - `removeConversationMember(...)`:
      - Validate target is active participant and not requester.
      - If target role is admin, count active admins in transaction and block if this is the last admin.
      - Soft remove target with `leftAt = now`.
    - `updateMyMemberNickname(...)`:
      - Update requester’s participant nickname for that conversation.
  - Publish realtime + inbox updates after mutations:
    - `member_added` / `member_removed` on conversation channel.
    - `conversation_updated` to affected users via user-events channel.
  - Keep write paths flat and small; use one DB roundtrip per validation step where possible; avoid over-abstraction.

- **Reactions service + routes (idempotent and optimized)**
  - Add routes in message controller:
    - `POST /api/messages/:id/reactions`
    - `DELETE /api/messages/:id/reactions/:emoji`
  - Add reaction service functions:
    - Resolve message + conversation in one query.
    - Verify requester is active participant (`leftAt is null`) of message’s conversation.
    - `POST`: idempotent add using unique index (`messageId,userId,emoji`) with conflict-safe behavior; return created/existing outcome.
    - `DELETE`: idempotent remove (success even if already absent).
  - Emit `reaction_update` event on conversation channel with delta payload (`conversationId`, `messageId`, `emoji`, `userId`, `action`).

- **WS type-safe propagation (server + minimal web updates)**
  - Extend server `OutboundEvent` union with:
    - `member_added`, `member_removed`, `reaction_update`.
  - Extend web inbound WS schema/types with the same events.
  - Add lightweight handling in web ws provider:
    - invalidate conversation detail/list and relevant message query on new membership/reaction events.
    - no full UI feature build required in this phase.

- **Validation/contract updates**
  - Keep and reuse existing validators for `addMemberBody`, `updateMemberBody`, `addReactionBody`, `reactionEmojiParam`.
  - Add dedicated message-id param schema for `/messages/:id/reactions` to avoid overloading conversation-param validators.
  - Keep response shapes consistent with existing controller style (`{ success: true, ... }`).

### Public APIs / Interfaces / Types
- **New REST endpoints**
  - `POST /api/conversations/:id/members`
  - `DELETE /api/conversations/:id/members/:userId`
  - `PATCH /api/conversations/:id/members/me`
  - `POST /api/messages/:id/reactions`
  - `DELETE /api/messages/:id/reactions/:emoji`
- **WS outbound/inbound type additions**
  - `member_added`
  - `member_removed`
  - `reaction_update`
- **No schema migration**
  - Reuse existing `participant.leftAt`, `participant.role`, `message_reaction` table and current indexes.

### Test Plan
- **Type safety and build checks**
  - `pnpm --filter server check-types`
  - `pnpm --filter web exec tsc --noEmit` (because WS inbound union is updated on web)
  - `pnpm check-types` once known workspace blocker is clear.
- **Behavioral scenarios**
  - Admin adds new member to group -> participant active, `member_added` published, conversation list invalidates.
  - Admin re-adds previously removed member -> same participant row reactivated (`leftAt` cleared).
  - Admin removes member -> `leftAt` set, `member_removed` published.
  - Attempt to remove last admin -> rejected with 400/409 policy error.
  - Attempt self-remove via delete endpoint -> rejected.
  - Member nickname self-update succeeds; non-member fails.
  - Reaction add/remove on message by active member succeeds and emits `reaction_update`.
  - Non-member reaction mutation fails with 403.
  - Repeated add/remove reaction calls stay idempotent and do not create duplicates.
- **Realtime compatibility**
  - Web ws parser accepts new event types without dropping connection.
  - Membership/reaction events trigger expected cache invalidation paths.

### Assumptions and Defaults (Locked)
- Reaction route shape is locked to `/api/messages/:id/reactions`.
- Re-adding a previously removed participant reactivates the existing row (no new row).
- Self-removal is disallowed on `DELETE /conversations/:id/members/:userId`.
- This slice is server-first; web changes are limited to ws typing + invalidation safety, not full member/reaction UI.
- Redis Pub/Sub remains correct for these realtime notifications (durability not required for this class of live updates).
