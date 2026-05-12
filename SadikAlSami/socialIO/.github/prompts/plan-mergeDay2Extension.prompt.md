## Plan: Merge Day2_Extension into Plan_Progress

Integrate the Day 2 extension into the main plan, marking the already completed schema changes as done. Keep Plan_Progress as the single source of truth, with Day 2 expanded into the new profile/setup/search/presence scope while preserving the rest of the roadmap.

**Steps**
1. Mark completed schema items in Day 2: update the Day 2 backend todos in [docs/Plan_Progress.md](docs/Plan_Progress.md) to show these as done: unique display_name, trigram extension/index migration, and schema updates already reflected in [packages/db/src/schema/profile.ts](packages/db/src/schema/profile.ts) and [packages/db/src/migrations/0002_enable_pg_trgm.sql](packages/db/src/migrations/0002_enable_pg_trgm.sql).
2. Replace the Day 2 section with the expanded Day 2 plan from [docs/Day2_Extension.md](docs/Day2_Extension.md), preserving the structure and checklist style of Plan_Progress. Fold sections A–G into Day 2, and ensure terminology is consistent with existing repo paths (server routes, services, validators).
3. Keep Day 3–Day 7 intact, but add cross-references where needed: Day 3 should explicitly note presence WS wiring depends on Day 2’s presence REST endpoint and last_seen_at.
4. Remove or deprecate Day2_Extension.md once merged (optional but recommended) by noting in Plan_Progress that the extension content is now integrated; do not delete unless you want it removed.

**Relevant files**
- [docs/Plan_Progress.md](docs/Plan_Progress.md) — main plan to update and merge into
- [docs/Day2_Extension.md](docs/Day2_Extension.md) — source for the expanded Day 2 scope
- [packages/db/src/schema/profile.ts](packages/db/src/schema/profile.ts) — already updated; mark related tasks done
- [packages/db/src/migrations/0002_enable_pg_trgm.sql](packages/db/src/migrations/0002_enable_pg_trgm.sql) — already created/migrated; mark related tasks done

**Verification**
1. Scan the updated Day 2 section to confirm all new tasks (profile setup gate, user search, presence REST, message services, routes) appear exactly once.
2. Ensure all “done” tasks in Day 2 match actual code changes (unique display name, trigram migration, index).
3. Check Day 3 presence notes still align with the plan (WS-only items remain Day 3).

**Decisions**
- Day2_Extension content becomes the canonical Day 2 section inside Plan_Progress; the extension file becomes optional reference only.
- Schema tasks already completed are marked done rather than removed to preserve change history.

**Further Considerations**
1. If you want, we can also align the Day 2 checklist with current file naming in this repo (e.g., server route names, validators) while merging.

Align the day 2 checklist with current file naming in this repo.