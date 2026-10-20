# Client knowledge and script quality

Date: 2026-10-20 · Status: approved in chat

## Problem

Scripts for reels and carousels don't show what the client's product is or how it works,
and don't speak to its customers in their own words. The writers only get a one-line
summary, five feature names and a list of problems, so they fall back on generic
marketing lines and repeat one pain point.

## Goal

Every idea, carousel and reel is written from a **knowledge file** about the client — how
the product works, what makes it different, who buys and how they talk — and is **checked**
before money is spent on pictures or voice: a customer must understand what it does, feel
it is about them, and every claim must be true.

## 1. Knowledge

`Client.knowledge`:

```ts
type Knowledge = {
  howItWorks: string[];            // 3-6 steps, from the customer's side
  different: string[];             // what makes it different from the usual way / competitors
  personas: { name: string; who: string; words: string[]; worries: string[]; wishes: string[] }[]; // 2-3
  objections: { doubt: string; answer: string }[];
  proof: string[];                 // real results, examples, numbers the client confirmed
  facts: string[];                 // true claims a script may make
  use: string[];                   // words/phrases to use
  avoid: string[];                 // words/claims to avoid
  questions: { id: string; question: string; answer?: string }[]; // the interview
  updatedAt: string;
};
```

- **Draft** (`POST /api/clients/:id/knowledge/draft`, a job): one LLM call from the client's
  brief, brand summary, services and the whole website text (`brand.text`, not cut at
  6,000 characters) → a Knowledge plus ~6 questions about what the site doesn't say
  (how a customer starts, who buys most, what they doubt, a real result, what to never claim).
  Written in the client's language (Egyptian Arabic for Risero).
- **Interview**: Profile → Knowledge tab lists the questions one at a time; an answer is
  saved and folded into the knowledge by one LLM call (`POST …/knowledge/answer`); skipping is fine.
- Every section is editable in the tab (`PUT /api/clients/:id` with `knowledge`).

## 2. Writers use it

`knowledgeText(client)` renders the knowledge as a prompt section. It is added to:
- the ideas writer — each idea also names its `persona` and its `step` (which "how it works"
  step it shows), and the rules ask for one real how-it-works moment per idea;
- the carousel writer — the persona's words and worries, the step, the facts;
- reels — through the brief's notes (Marketing mode's writer itself is unchanged).

Without a knowledge file, writers behave as today.

## 3. Quality check

`reviewScript(client, { kind, idea, text })` → `{ understand, feel, true: 1-5, notes: string[] }`
(one LLM call, the knowledge as the source of truth).
- Carousels: after writing, before art. Reels: after writing, before voice.
- Any score under 4 → one rewrite with the notes; the second review is stored either way.
- The post keeps `review` (scores + notes) and the Library card shows them.

## Testing

Pure: `knowledgeText` (sections present, empty knowledge → ""), `needsRewrite` (any score < 4),
`mergeAnswer` keeps unanswered questions and records answers. Then a real run on Risero:
draft knowledge, answer 2 questions, one carousel and one reel, read both scripts.
