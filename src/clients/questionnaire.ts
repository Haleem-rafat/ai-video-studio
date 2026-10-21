import type { Client } from "./types.ts";

/**
 * Prompted mode: the questions a client answers about their business, in
 * English and Arabic. The answers are stored on the client (`client.profile`)
 * and given to the writers by `businessContext` (context.ts). Only what the
 * studio can make is asked: Instagram/YouTube posts, carousels, single images
 * and voiced reels.
 */

export const QUESTIONNAIRE_VERSION = 1;

export type Text = { en: string; ar: string };
/** Which writer reads an answer. */
export type Purpose = "ideas" | "carousel" | "reel" | "review";
export const PURPOSES: Purpose[] = ["ideas", "carousel", "reel", "review"];

export type Option = { id: string; label: Text };

export type Question = {
  id: string;
  section: SectionId;
  kind: "short" | "long" | "single" | "multi";
  label: Text;
  help?: Text;
  example?: Text;
  options?: Option[];
  /** Choice questions also take the client's own words ("other:…"). */
  other?: boolean;
  /** Needed to call the profile complete; nothing blocks saving or making posts. */
  required?: boolean;
  /** Writers that get this answer; all four when unset. */
  uses?: Purpose[];
  /** A promotion or launch: temporary, kept apart from stable facts. */
  campaign?: boolean;
  /** Shown only when another answer includes one of these values. */
  showIf?: { question: string; anyOf: string[] };
};

export const SECTIONS = [
  { id: "overview", title: { en: "Business overview", ar: "نظرة على النشاط" }, intro: { en: "What you do, in your own words.", ar: "بتعمل إيه، بكلامك انت." } },
  { id: "audience", title: { en: "Your customers", ar: "عملاءك" }, intro: { en: "Who buys, and why.", ar: "مين بيشتري، وليه." } },
  { id: "voice", title: { en: "Brand voice", ar: "صوت البراند" }, intro: { en: "How you sound on social media.", ar: "إزاي بتتكلم على السوشيال ميديا." } },
  { id: "goals", title: { en: "Marketing goals", ar: "أهداف التسويق" }, intro: { en: "What the content should achieve.", ar: "المحتوى المفروض يحقق إيه." } },
  { id: "products", title: { en: "Products and proof", ar: "المنتجات والدليل" }, intro: { en: "What to promote, and what backs it up.", ar: "نروّج لإيه، وإيه اللي يثبت كلامنا." } },
  { id: "content", title: { en: "Content preferences", ar: "تفضيلات المحتوى" }, intro: { en: "The posts you want, and the ones you don't.", ar: "البوستات اللي عايزها، واللي مش عايزها." } },
  { id: "creative", title: { en: "Video and visuals", ar: "الفيديو والصور" }, intro: { en: "How reels and pictures should look and sound.", ar: "الريلز والصور تبان وتتسمع إزاي." } },
  { id: "rules", title: { en: "Restrictions and accuracy", ar: "الممنوعات والدقة" }, intro: { en: "What must never be said or claimed.", ar: "اللي ممنوع يتقال أو نوعد بيه." } },
  { id: "more", title: { en: "Anything else", ar: "أي حاجة تانية" }, intro: { en: "What would make the content a success.", ar: "إيه اللي يخلّي المحتوى ناجح في نظرك." } },
] as const satisfies { id: string; title: Text; intro: Text }[];

export type SectionId = (typeof SECTIONS)[number]["id"];

const o = (id: string, en: string, ar: string): Option => ({ id, label: { en, ar } });

export const QUESTIONS: Question[] = [
  // ---- overview
  { id: "overview.what", section: "overview", kind: "long", required: true, label: { en: "What does your business do?", ar: "نشاطك بيعمل إيه؟" }, help: { en: "One or two sentences a customer would understand.", ar: "جملة أو اتنين يفهمهم أي عميل." }, example: { en: "We build booking pages that let coaches' clients book a session in under a minute.", ar: "بنعمل صفحات حجز تخلّي عملاء الكوتش يحجزوا جلسة في أقل من دقيقة." } },
  { id: "overview.offer", section: "overview", kind: "long", label: { en: "Which products or services do you offer?", ar: "بتقدّم أنهي منتجات أو خدمات؟" }, example: { en: "Booking page, reminders, a dashboard of bookings", ar: "صفحة حجز، تذكيرات، لوحة بالحجوزات" } },
  { id: "overview.problem", section: "overview", kind: "long", required: true, label: { en: "Which problem do you solve for customers?", ar: "بتحل أنهي مشكلة للعملاء؟" }, example: { en: "Clients ask for a session in DMs and disappear before booking.", ar: "العميل يسأل في الرسايل ويختفي قبل ما يحجز." } },
  { id: "overview.different", section: "overview", kind: "long", required: true, label: { en: "What makes you different from the alternatives?", ar: "إيه اللي يميزك عن البدائل؟" }, help: { en: "Concrete differences, not 'quality' or 'best service'.", ar: "فروق حقيقية، مش «جودة» أو «أحسن خدمة»." } },

  // ---- audience
  { id: "audience.who", section: "audience", kind: "long", required: true, label: { en: "Who is your ideal customer?", ar: "مين العميل المثالي ليك؟" }, example: { en: "Life coaches in Egypt who get clients from Instagram", ar: "كوتشز في مصر بييجي لهم عملاء من إنستجرام" } },
  { id: "audience.market", section: "audience", kind: "short", label: { en: "Which countries, cities or markets do you serve?", ar: "بتخدم أنهي بلاد أو مدن أو أسواق؟" }, uses: ["ideas", "carousel", "reel"] },
  { id: "audience.pains", section: "audience", kind: "long", label: { en: "What frustrates your customers before they find you?", ar: "إيه اللي بيضايق عملاءك قبل ما يلاقوك؟" }, help: { en: "In the words they use themselves.", ar: "بالكلام اللي هما بيقولوه." } },
  { id: "audience.motivation", section: "audience", kind: "long", label: { en: "What makes them decide to buy?", ar: "إيه اللي بيخليهم ياخدوا قرار الشراء؟" }, uses: ["ideas", "carousel", "reel"] },
  { id: "audience.objections", section: "audience", kind: "long", label: { en: "What makes them hesitate, and what is the honest answer?", ar: "إيه اللي بيخليهم يترددوا، وإيه الرد الصادق؟" }, example: { en: "'Is it expensive?' The first call is free.", ar: "«غالي؟» أول مكالمة مجانية." } },

  // ---- voice
  {
    id: "voice.tone",
    section: "voice",
    kind: "multi",
    other: true,
    label: { en: "How should your brand sound?", ar: "البراند بتاعك يتكلم إزاي؟" },
    options: [o("friendly", "Friendly", "ودود"), o("professional", "Professional", "احترافي"), o("educational", "Educational", "تعليمي"), o("premium", "Premium", "فخم"), o("bold", "Bold", "جريء"), o("humorous", "Humorous", "خفيف ودمه خفيف"), o("calm", "Calm and reassuring", "هادي ومطمّن")],
  },
  { id: "voice.personality", section: "voice", kind: "long", label: { en: "Describe your brand as if it were a person.", ar: "اوصف البراند كأنه شخص." }, example: { en: "A calm older friend who has seen it all.", ar: "صاحب كبير هادي شاف كتير." } },
  { id: "voice.words", section: "voice", kind: "long", label: { en: "Words or phrases you like to use", ar: "كلمات أو جمل بتحب تستخدمها" }, uses: ["carousel", "reel", "review"] },
  { id: "voice.avoidWords", section: "voice", kind: "long", label: { en: "Words, phrases or tones to avoid", ar: "كلمات أو جمل أو أسلوب لازم نبعد عنه" } },

  // ---- goals
  {
    id: "goals.primary",
    section: "goals",
    kind: "single",
    required: true,
    other: true,
    label: { en: "What is your main marketing goal right now?", ar: "إيه هدفك التسويقي الأساسي دلوقتي؟" },
    options: [o("awareness", "Get known", "الناس تعرفنا"), o("engagement", "More engagement", "تفاعل أكتر"), o("leads", "Leads and messages", "رسايل وعملاء محتملين"), o("sales", "Sales and bookings", "مبيعات وحجوزات"), o("traffic", "Website visits", "زيارات للموقع")],
  },
  { id: "goals.action", section: "goals", kind: "short", required: true, label: { en: "What should people do after watching or reading?", ar: "الناس تعمل إيه بعد ما تشوف البوست؟" }, example: { en: "Book a free 15-minute call", ar: "يحجزوا مكالمة مجانية ١٥ دقيقة" } },
  { id: "goals.focus", section: "goals", kind: "long", label: { en: "Which products or services should get the most attention?", ar: "أنهي منتجات أو خدمات تاخد الاهتمام الأكبر؟" }, uses: ["ideas", "carousel", "reel"] },
  { id: "goals.hasOffer", section: "goals", kind: "single", label: { en: "Do you have an offer, launch or season coming up?", ar: "عندك عرض أو إطلاق أو موسم جاي؟" }, options: [o("yes", "Yes", "أيوه"), o("no", "No", "لأ")], uses: ["ideas", "carousel", "reel"] },
  { id: "goals.offerDetails", section: "goals", kind: "long", campaign: true, showIf: { question: "goals.hasOffer", anyOf: ["yes"] }, label: { en: "Describe the offer: what, for whom, until when", ar: "اوصف العرض: إيه، لمين، لحد إمتى" }, example: { en: "20% off the first month for new coaches until 30 November", ar: "خصم ٢٠٪ على أول شهر للكوتشز الجداد لحد ٣٠ نوفمبر" }, uses: ["ideas", "carousel", "reel", "review"] },

  // ---- products
  { id: "products.benefits", section: "products", kind: "long", label: { en: "What do customers actually gain?", ar: "العميل بيكسب إيه فعلاً؟" }, help: { en: "Outcomes, not features: time saved, money made, worry gone.", ar: "نتايج مش مميزات: وقت أقل، فلوس أكتر، قلق أقل." } },
  { id: "products.proof", section: "products", kind: "long", label: { en: "What proves your claims?", ar: "إيه اللي يثبت كلامك؟" }, help: { en: "Real results, numbers, reviews or names you allow us to use.", ar: "نتايج حقيقية، أرقام، تقييمات أو أسماء مسموح نستخدمها." }, example: { en: "Coach Sara went from 5 to 22 bookings a month (she agreed to be named).", ar: "الكوتش سارة وصلت من ٥ لـ ٢٢ حجز في الشهر (وافقت نذكر اسمها)." } },
  { id: "products.competitors", section: "products", kind: "long", label: { en: "Which alternatives do customers compare you with?", ar: "العملاء بيقارنوك بأنهي بدائل؟" }, uses: ["ideas", "carousel", "reel"] },
  { id: "products.misunderstood", section: "products", kind: "long", label: { en: "What do customers often not know about you?", ar: "إيه اللي العملاء غالباً ميعرفوهوش عنك؟" }, uses: ["ideas", "carousel", "reel"] },

  // ---- content
  {
    id: "content.formats",
    section: "content",
    kind: "multi",
    label: { en: "Which formats do you want?", ar: "عايز أنهي أشكال محتوى؟" },
    options: [o("reel", "Reels / Shorts", "ريلز / شورتس"), o("carousel", "Carousels", "كاروسيل"), o("single", "Single images", "صورة واحدة")],
    uses: ["ideas"],
  },
  {
    id: "content.styles",
    section: "content",
    kind: "multi",
    other: true,
    label: { en: "Which kinds of content fit you?", ar: "أنهي نوع محتوى يناسبك؟" },
    options: [o("educational", "Educational", "تعليمي"), o("storytelling", "Stories", "قصص"), o("promotional", "Promotional", "ترويجي"), o("behind", "Behind the scenes", "من ورا الكواليس"), o("entertaining", "Entertaining", "ترفيهي"), o("comparisons", "Comparisons", "مقارنات")],
    uses: ["ideas", "carousel", "reel"],
  },
  { id: "content.themes", section: "content", kind: "long", label: { en: "Topics we should keep coming back to", ar: "مواضيع نرجع لها دايماً" }, uses: ["ideas"] },
  { id: "content.hooks", section: "content", kind: "long", label: { en: "What makes your audience stop scrolling?", ar: "إيه اللي بيوقف جمهورك عن السكرول؟" }, example: { en: "A question about their empty calendar", ar: "سؤال عن الجدول الفاضي" }, uses: ["ideas", "carousel", "reel"] },
  { id: "content.liked", section: "content", kind: "long", label: { en: "Posts, videos or creators whose style you like", ar: "بوستات أو فيديوهات أو صناع محتوى بيعجبك أسلوبهم" }, help: { en: "Links or short descriptions.", ar: "لينكات أو وصف قصير." }, uses: ["ideas", "carousel", "reel"] },
  { id: "content.disliked", section: "content", kind: "long", label: { en: "Content styles you don't want", ar: "أساليب محتوى مش عايزها" } },

  // ---- creative
  {
    id: "creative.video",
    section: "creative",
    kind: "multi",
    label: { en: "What should reels use?", ar: "الريلز تستخدم إيه؟" },
    options: [o("voice", "Voice-over", "تعليق صوتي"), o("text", "On-screen text", "كلام مكتوب على الشاشة"), o("screens", "Real website screens", "شاشات الموقع الحقيقية"), o("ai", "AI pictures", "صور بالذكاء الاصطناعي")],
    uses: ["reel"],
  },
  { id: "creative.visuals", section: "creative", kind: "long", label: { en: "Which visual style fits your brand?", ar: "أنهي ستايل بصري يناسب البراند؟" }, example: { en: "Clean, warm colours, real people, no cartoons", ar: "بسيط، ألوان دافية، ناس حقيقيين، من غير كرتون" }, uses: ["carousel", "reel"] },
  {
    id: "output.language",
    section: "creative",
    kind: "single",
    required: true,
    label: { en: "Which language should the posts be in?", ar: "البوستات تكون بأنهي لغة؟" },
    help: { en: "Your answers here can be in any language.", ar: "إجاباتك هنا ممكن تكون بأي لغة." },
    options: [o("ar", "Arabic (Egyptian)", "عربي (مصري)"), o("en", "English", "إنجليزي")],
    uses: [],
  },
  { id: "creative.subtitles", section: "creative", kind: "single", label: { en: "Should reels show the full narration as subtitles?", ar: "الريلز تعرض الكلام كله كترجمة مكتوبة؟" }, options: [o("yes", "Yes, every word", "أيوه، كل كلمة"), o("short", "Only short phrases", "جمل قصيرة بس")], uses: ["reel"] },

  // ---- rules
  { id: "rules.never", section: "rules", kind: "long", required: true, label: { en: "What must never be said, shown or promised?", ar: "إيه الممنوع يتقال أو يتعرض أو نوعد بيه؟" }, example: { en: "No prices, no guaranteed results, no competitor names", ar: "لا أسعار، لا نتايج مضمونة، لا أسماء منافسين" } },
  { id: "rules.legal", section: "rules", kind: "long", label: { en: "Legal or industry rules we must follow", ar: "قواعد قانونية أو خاصة بالمجال لازم نلتزم بيها" }, example: { en: "Sessions are not medical advice; say so when health comes up.", ar: "الجلسات مش استشارة طبية؛ لازم نقول كده لو الكلام عن الصحة." } },
  { id: "rules.approval", section: "rules", kind: "long", label: { en: "Claims that need proof or your approval first", ar: "ادعاءات محتاجة دليل أو موافقتك الأول" } },
  { id: "rules.always", section: "rules", kind: "long", label: { en: "Instructions every post must follow", ar: "تعليمات لازم كل بوست يلتزم بيها" }, example: { en: "Always end with the free call.", ar: "دايماً نختم بالمكالمة المجانية." } },

  // ---- more
  { id: "more.mistakes", section: "more", kind: "long", label: { en: "What did agencies or AI tools get wrong about you before?", ar: "وكالات أو أدوات ذكاء اصطناعي غلطت في إيه عنك قبل كده؟" } },
  { id: "more.success", section: "more", kind: "long", label: { en: "What would make you call the content a success?", ar: "إيه اللي يخليك تقول إن المحتوى نجح؟" }, uses: ["ideas", "review"] },
  { id: "more.notes", section: "more", kind: "long", label: { en: "Anything else we should know?", ar: "أي حاجة تانية لازم نعرفها؟" } },
];

export type Value = string | string[];
/** Where an answer came from: typed in the studio, an imported file, the client's own AI chat, or confirmed from the website/Knowledge. */
export type AnswerSource = "app" | "docx" | "json" | "chat" | "website";
export type AnswerEntry = { value: Value; source: AnswerSource; updatedAt: string };
export type Answers = Record<string, AnswerEntry>;

export type BusinessProfile = { version: number; answers: Answers; updatedAt: string };

const MAX_TEXT = 2000;
const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionById = (id: string) => byId.get(id);

export type AnswerError = { question: string; message: string };

/** Turns untrusted answers (from the app or a file) into clean values; reports what was dropped or cut. */
export function validateAnswers(input: unknown): { answers: Record<string, Value>; errors: AnswerError[] } {
  const answers: Record<string, Value> = {};
  const errors: AnswerError[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { answers, errors: [{ question: "", message: "Answers must be an object of question id → answer" }] };
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    const q = byId.get(id);
    if (!q) {
      errors.push({ question: id, message: "Unknown question; skipped" });
      continue;
    }
    const cut = (text: string) => {
      const clean = text.replace(/\r\n/g, "\n").trim();
      if (clean.length > MAX_TEXT) errors.push({ question: id, message: `Longer than ${MAX_TEXT} characters; cut` });
      return clean.slice(0, MAX_TEXT);
    };
    if (q.kind === "short" || q.kind === "long") {
      if (typeof raw !== "string") {
        if (raw != null) errors.push({ question: id, message: "Must be text" });
        continue;
      }
      answers[id] = cut(raw);
      continue;
    }
    const list = (Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw]).filter((item): item is string => typeof item === "string");
    const kept: string[] = [];
    for (const item of list) {
      if (q.options!.some((option) => option.id === item)) kept.push(item);
      else if (q.other && item.startsWith("other:") && item.slice(6).trim()) kept.push(`other:${cut(item.slice(6))}`);
      else errors.push({ question: id, message: `"${item}" is not one of the options` });
    }
    if (!kept.length) continue;
    answers[id] = q.kind === "single" ? kept[0] : [...new Set(kept)];
  }
  return { answers, errors };
}

const isEmpty = (value: Value | undefined) => value === undefined || (Array.isArray(value) ? value.length === 0 : !value.trim());

/** New answers over the saved ones; an empty answer clears its question. */
export function mergeAnswers(saved: Answers, incoming: Record<string, Value>, source: AnswerSource, at = new Date().toISOString()): Answers {
  const next = { ...saved };
  for (const [id, value] of Object.entries(incoming)) {
    if (isEmpty(value)) delete next[id];
    else next[id] = { value, source, updatedAt: at };
  }
  return next;
}

/** The plain values of saved answers. */
export const valuesOf = (answers: Answers): Record<string, Value> => Object.fromEntries(Object.entries(answers).map(([id, entry]) => [id, entry.value]));

/** Whether a question is shown, given the answers so far. */
export function visible(q: Question, values: Record<string, Value | undefined>): boolean {
  if (!q.showIf) return true;
  const value = values[q.showIf.question];
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return q.showIf.anyOf.some((wanted) => list.includes(wanted));
}

export type Completion = { answered: number; total: number; required: number; requiredAnswered: number; done: boolean; bySection: Record<string, { answered: number; total: number }> };

/** How far the profile is: answered and required questions, overall and per section. */
export function completion(answers: Answers): Completion {
  const values = valuesOf(answers);
  const shown = QUESTIONS.filter((q) => visible(q, values));
  const has = (q: Question) => !isEmpty(values[q.id]);
  const bySection = Object.fromEntries(SECTIONS.map((s) => [s.id, { answered: shown.filter((q) => q.section === s.id && has(q)).length, total: shown.filter((q) => q.section === s.id).length }]));
  const required = shown.filter((q) => q.required);
  const requiredAnswered = required.filter(has).length;
  return { answered: shown.filter(has).length, total: shown.length, required: required.length, requiredAnswered, done: requiredAnswered === required.length, bySection };
}

/** An answer as words, in the language asked for: option ids become their labels. */
export function answerText(q: Question, value: Value, lang: "en" | "ar" = "en"): string {
  if (q.kind === "short" || q.kind === "long") return String(value);
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => (item.startsWith("other:") ? item.slice(6) : (q.options?.find((option) => option.id === item)?.label[lang] ?? item))).join(", ");
}

/**
 * What the website and Knowledge already say for some questions, so the
 * client can confirm or correct it instead of typing it again.
 */
export function knownAnswers(client: Client): Record<string, string> {
  const k = client.knowledge;
  const join = (list: string[] | undefined) => (list ?? []).filter(Boolean).join("\n");
  const known: Record<string, string> = {
    "overview.what": [client.brand?.summary, client.brief?.business].filter(Boolean).join("\n"),
    "overview.offer": join(client.brand?.services),
    "overview.problem": join(client.brief?.problems),
    "overview.different": join(k?.different),
    "audience.who": client.brief?.audience ?? "",
    "audience.objections": (k?.objections ?? []).map((item) => `${item.doubt} → ${item.answer}`).join("\n"),
    "products.benefits": [client.brief?.result, ...(client.brief?.features ?? [])].filter(Boolean).join("\n"),
    "products.proof": join(k?.proof),
    "voice.words": join(k?.use),
    "goals.action": client.brief?.cta?.label ? `${client.brief.cta.label} (${client.brief.cta.url})` : "",
    "rules.never": [client.avoid, ...(k?.avoid ?? [])].filter(Boolean).join("\n"),
    "output.language": client.language,
  };
  return Object.fromEntries(Object.entries(known).filter(([, text]) => text.trim()));
}
