# Prompted mode

A guided, bilingual questionnaire about a client's business. The answers become the first source of truth for every writer. Requested 2026-10-21 with a written brief; built end to end the same day.

## Audit (what it fits into)

- Node + TypeScript server (`src/server`), React 19 + shadcn app (`app/`), `node:test`.
- No database: one JSON file per client (`output/.clients/<id>/client.json`) holds the brand (read from the website), the brief, `language`, `avoid` and `knowledge`.
- Knowledge (`src/clients/knowledge.ts`) was pasted into four writers by `knowledgeText()`: ideas, carousels, reels (through the marketing writer's brief notes) and the script review.
- A single-user app on the Mac: no login. Clients are isolated by folder, and every route is keyed by client id.
- No i18n system; the interface is English and content uses `dir="auto"`.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Storage | `client.profile = { version, answers: { [questionId]: { value, source, updatedAt } }, updatedAt }` in the same `client.json` | One source of truth per client, beside Knowledge; no second store |
| Output language | The `output.language` answer reads and writes `client.language` and is never stored twice | The writers already read `client.language` |
| Provenance | `source`: `app`, `website` (confirmed with "Use this"), `docx`, `json`; an unchanged answer keeps its source on re-import | Shows where each fact came from |
| Priority | Client answers, then Knowledge (from the website and interview), then the brief | User corrections win over website assumptions |
| Context | `businessContext(client, purpose)` in `src/clients/context.ts`, one place for all four writers | Consistent and selective; no prompt sprawl |
| Selection | Each question lists the writers that use it (`uses`); restrictions reach all; settings (language, subtitles) are applied, not written | Only relevant fields; token control (600 characters per answer, 3600 per block) |
| Campaigns | Questions marked `campaign` are fenced as temporary; offer posts build on them | Stable facts are kept apart from promotions |
| Safety | Client text sits in one `<client>` block, with tags stripped from answers; the prompt says it is data, never instructions | Prompt injection from answers or imports |
| No answers | The output is exactly `knowledgeText()` | Existing clients and flows are unchanged |
| Structures | Reels: Hook → Problem or opportunity → Main value → Supporting details → CTA. Carousels: Cover hook → Problem or insight → Useful information → Practical takeaway → CTA | Guidance from the brief, added only when the client has answered |
| Interface language | Questions carry `{ en, ar }`; interface text is in `app/components/prompted-text.ts`; the English/Arabic switch is remembered per browser; Arabic is right to left | Minimal i18n scoped to this feature |
| Export | Word, built by hand as WordprocessingML and zipped with the system `zip` (RTL with `w:bidi`/`w:rtl`, pre-filled answer boxes, `Ref:` codes); PDF from a print page via puppeteer; JSON with every question, its options and the answers | No new dependencies or paid services |
| Import | JSON, and Word files exported here (read with `unzip`, answers found by `Ref:` codes; choice text matched to English or Arabic option labels, the rest kept as the client's own words); dry run first; another client's file is refused unless confirmed | Validated before saving; imports never clear answers |

## Files

- `src/clients/questionnaire.ts`: sections, questions, validation, merge, conditions, progress, and what the website already knows.
- `src/clients/profile.ts`: the view the app renders, and `applyAnswers` (sources, language, imports).
- `src/clients/context.ts`: the context builder.
- `src/clients/questionnaire-files.ts`: Word, PDF and JSON export; Word and JSON import.
- `src/server/prompted.ts`: `GET/PUT /api/clients/:id/profile`, `GET …/export?format=docx|pdf|json&lang=ar|en`, `POST …/import?format=docx|json[&dryRun=1][&force=1]`, `GET …/context?purpose=ideas|carousel|reel|review`.
- `app/components/PromptedMode.tsx`, `app/components/prompted-text.ts`: the tab on the client page.
- Writers now use `businessContext`: `ideas.ts`, `carousel.ts`, `reel.ts` (`reelNotes`; the subtitles answer sets the reel's captions) and `review.ts`.

## Limits

- Word import reads files exported by the studio (it needs the `Ref:` codes); an arbitrary document is refused with a clear message.
- No login exists, so there is no per-user authorization; isolation is per client.
- Marketing mode (`writeMarketing` for website videos) is unchanged, as agreed earlier; only Instagram client posts read Prompted mode.
