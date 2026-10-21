import {
  completion,
  knownAnswers,
  mergeAnswers,
  QUESTIONNAIRE_VERSION,
  QUESTIONS,
  SECTIONS,
  validateAnswers,
  valuesOf,
  type AnswerError,
  type AnswerSource,
  type Completion,
  type Question,
  type Value,
} from "./questionnaire.ts";
import type { Client } from "./types.ts";

/** The output language lives on the client (it drives every writer); Prompted mode reads and writes it there. */
const LANGUAGE = "output.language";

export type ProfileView = {
  version: number;
  sections: typeof SECTIONS;
  questions: Question[];
  /** Saved answers, plus the output language from the client. */
  values: Record<string, Value>;
  sources: Record<string, AnswerSource>;
  /** What the website and Knowledge already say, to confirm or correct. */
  known: Record<string, string>;
  completion: Completion;
  updatedAt?: string;
};

/** Everything Prompted mode needs to render a client's questionnaire. */
export function profileView(client: Client): ProfileView {
  const answers = client.profile?.answers ?? {};
  const values = { ...valuesOf(answers), [LANGUAGE]: client.language };
  const withLanguage = { ...answers, [LANGUAGE]: { value: client.language, source: "app" as const, updatedAt: "" } };
  return {
    version: QUESTIONNAIRE_VERSION,
    sections: SECTIONS,
    questions: QUESTIONS,
    values,
    sources: Object.fromEntries(Object.entries(answers).map(([id, entry]) => [id, entry.source])),
    known: knownAnswers(client),
    completion: completion(withLanguage),
    ...(client.profile?.updatedAt ? { updatedAt: client.profile.updatedAt } : {}),
  };
}

/**
 * Applies answers to a client (a copy): checked, merged with what was saved,
 * the output language put on the client. In the app an empty answer clears
 * its question; an import (`keepEmpty`) never clears what the file left blank.
 * `confirmed` answers were taken from the website and are recorded so.
 */
export function applyAnswers(client: Client, input: unknown, options: { source: AnswerSource; confirmed?: string[]; keepEmpty?: boolean }): { client: Client; errors: AnswerError[] } {
  const { answers, errors } = validateAnswers(input);
  // Validation drops an emptied choice; in the app any emptied field must clear its answer.
  const cleared = !options.keepEmpty && input && typeof input === "object" ? Object.entries(input as Record<string, unknown>).filter(([id, value]) => QUESTIONS.some((q) => q.id === id) && (value === "" || (Array.isArray(value) && !value.length))).map(([id]) => id) : [];
  if (options.keepEmpty) for (const [id, value] of Object.entries(answers)) if (Array.isArray(value) ? !value.length : !value.trim()) delete answers[id];
  const next: Client = { ...client };
  const language = answers[LANGUAGE];
  if (language === "ar" || language === "en") next.language = language;
  delete answers[LANGUAGE];

  const at = new Date().toISOString();
  const confirmed = new Set(options.confirmed ?? []);
  let saved = { ...(client.profile?.answers ?? {}) };
  for (const id of cleared) delete saved[id];
  const fromWebsite = Object.fromEntries(Object.entries(answers).filter(([id]) => confirmed.has(id)));
  const own = Object.fromEntries(Object.entries(answers).filter(([id]) => !confirmed.has(id)));
  saved = mergeAnswers(saved, own, options.source, at);
  saved = mergeAnswers(saved, fromWebsite, "website", at);
  delete saved[LANGUAGE];
  next.profile = { version: QUESTIONNAIRE_VERSION, answers: saved, updatedAt: at };
  return { client: next, errors };
}
