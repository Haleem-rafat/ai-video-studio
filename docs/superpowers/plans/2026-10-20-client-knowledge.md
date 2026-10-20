# Client Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, chosen in chat).

**Goal:** Write every idea, carousel and reel from a per-client knowledge file (website + interview) and check each script before pictures or voice are paid for.
**Architecture:** `src/clients/knowledge.ts` (types, prompt section, draft, answer merge) and `src/clients/review.ts` (quality check); writers in `ideas.ts`, `carousel.ts`, `reel.ts` add the knowledge section; routes in `src/server/clients.ts`; a Knowledge tab in `ClientView`.
**Spec:** `docs/superpowers/specs/2026-10-20-client-knowledge-design.md`

## Global Constraints
- Marketing mode's writer (`src/marketing/write.ts`) is not changed; reels get knowledge through `brief.notes`.
- Without knowledge, behaviour is unchanged.
- Rewrite at most once per check; scores under 4 trigger it.

## Review Focus
1. A client with no knowledge: every writer works as before (test `knowledgeText` → "").
2. An LLM review that fails or returns junk: the post is still made, with no `review` (not a failed job).
3. Answering a question twice: the newer answer wins, other questions untouched (test `mergeAnswer`).

### Task 1: Knowledge (pure + LLM) — `knowledge.ts`, `knowledge.test.ts`, `types.ts` (Client.knowledge, Idea.persona/step, Post.review)
### Task 2: Review — `review.ts`, `review.test.ts`; wire into carousel + reel; writers use `knowledgeText`; ideas get persona/step
### Task 3: Routes + Knowledge tab + review scores on Library cards
### Task 4: Real run on Risero
