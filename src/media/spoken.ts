/**
 * The text a voice reads, as opposed to the text people read on screen.
 * Gemini guesses at digits, Latin brand names and Arabic words without vowel
 * marks; these helpers write them the way they should be said.
 */

const ONES = ["صفر", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة", "عشرة"];
/** 3-10 before a counted noun: "تلات حاجات", "ست ساعات". */
const COUNTING = ["", "", "", "تلات", "أربع", "خمس", "ست", "سبع", "تمن", "تسع", "عشر"];
const TEENS = ["", "حداشر", "اتناشر", "تلتاشر", "أربعتاشر", "خمستاشر", "ستاشر", "سبعتاشر", "تمنتاشر", "تسعتاشر"];
const TENS = ["", "", "عشرين", "تلاتين", "أربعين", "خمسين", "ستين", "سبعين", "تمانين", "تسعين"];
const HUNDREDS = ["", "مية", "ميتين", "تلتمية", "ربعمية", "خمسمية", "ستمية", "سبعمية", "تمنمية", "تسعمية"];

/** 0-999 in Egyptian Arabic; `counting` uses the short form of 3-10 that comes before a noun. */
function sayNumber(n: number, counting: boolean): string {
  if (n <= 10) return counting && n >= 3 ? COUNTING[n] : ONES[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 100) return n % 10 ? `${ONES[n % 10]} و${TENS[Math.floor(n / 10)]}` : TENS[n / 10];
  const rest = n % 100;
  return rest ? `${HUNDREDS[Math.floor(n / 100)]} و${sayNumber(rest, counting)}` : HUNDREDS[n / 100];
}

const toLatinDigits = (text: string) => text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

/** Numbers up to 999 as Egyptian words; a percentage becomes "… في المية". Longer numbers (years, phone numbers) stay digits. */
export function egyptianNumbers(text: string): string {
  return toLatinDigits(text).replace(/(?<![\d.:])(\d{1,3})(?!\d)(?![.:]\d)(%?)/g, (_match, digits: string, percent: string, offset: number, whole: string) => {
    const n = Number(digits);
    if (percent) return `${sayNumber(n, false)} في المية`;
    const after = whole.slice(offset + digits.length);
    const beforeNoun = /^\s+[ء-ي]/.test(after) && !/^\s+و(\s|$)/.test(after);
    return sayNumber(n, beforeNoun);
  });
}

/**
 * English words Arabic speakers use, as they say them. A voice reading Latin
 * letters inside Arabic switches language mid-sentence and stumbles, so every
 * one is spoken from Arabic letters. A client's own list wins over these.
 */
export const COMMON_WORDS: Record<string, string> = {
  Instagram: "إنستجرام", WhatsApp: "واتساب", Facebook: "فيسبوك", TikTok: "تيك توك", YouTube: "يوتيوب", Snapchat: "سناب شات", LinkedIn: "لينكد إن", Telegram: "تيليجرام",
  Google: "جوجل", "Google Form": "جوجل فورم", "Google Forms": "جوجل فورمز", "Google Calendar": "جوجل كاليندر", Gmail: "جيميل", Calendly: "كاليندلي", Zoom: "زووم", Canva: "كانفا", Notion: "نوشن",
  DM: "دي إم", DMs: "دي إمز", bio: "بايو", link: "لينك", links: "لينكات", reel: "ريل", reels: "ريلز", story: "ستوري", stories: "ستوريز", post: "بوست", posts: "بوستات", feed: "فيد", highlight: "هايلايت", highlights: "هايلايتس",
  online: "أونلاين", offline: "أوفلاين", OK: "أوكيه", AI: "إيه آي", PDF: "بي دي إف", app: "أبلكيشن", CTA: "سي تي إيه", SEO: "إس إي أو", follow: "فولو", followers: "فولوورز", like: "لايك", likes: "لايكات", comment: "كومنت", comments: "كومنتات", save: "سيف", share: "شير",
};

/** The words written in Latin letters in a text (a voice should not read them as they are). */
export function latinWords(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z0-9'’.+-]*[A-Za-z0-9]|[A-Za-z]/g) ?? [];
}

/** Swaps whole words for how they are said, ignoring case: { Risero: "رايزرو" }. Longer names go first ("Google Form" before "Google"). */
export function pronounce(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [word, said] of Object.entries(map).sort(([a], [b]) => b.length - a.length)) {
    if (!word.trim() || !said.trim()) continue;
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}.])`, "giu"), said.trim());
  }
  return out;
}

export function spokenText(text: string, map: Record<string, string> = {}): string {
  return egyptianNumbers(pronounce(text, map));
}

const MARKS = /[ً-ْٰ]/g;

/** True when `marked` is `plain` with only vowel marks added (no letter changed, added or dropped). */
export function sameLetters(plain: string, marked: string): boolean {
  return plain.replace(MARKS, "") === marked.replace(MARKS, "");
}

/** What the voice reads for a scene: its spoken text while that was made from the current narration, else the narration. */
export function spokenOf(scene: { narration: string; speech?: { for: string; text: string } }): string {
  return scene.speech && scene.speech.for === scene.narration ? scene.speech.text : scene.narration;
}

/** Arabic as a listener writes it: no vowel marks or tatweel, one alef, ه for ة, ي for ى, no punctuation. */
const plainWords = (text: string) =>
  toLatinDigits(text)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

// Number words in either dialect: a listener may write any number as digits or words, so numbers aren't scored.
const NUMBER_WORDS = new Set(
  [...ONES, ...COUNTING, ...TEENS, ...TENS, ...HUNDREDS, "اثنين", "اثنان", "ثلاثه", "ثلاث", "ثمانيه", "ثماني", "الاول", "الاولي", "الثاني", "الثانيه", "الثالث", "الثالثه", "التالت", "التالته", "الرابع", "الرابعه"]
    .filter(Boolean)
    .flatMap((word) => plainWords(word)),
);
const scored = (text: string) => plainWords(text).filter((word) => !/\d/.test(word) && !NUMBER_WORDS.has(word.replace(/^و(?=..)/, "")));

/**
 * How much of a take the listener heard wrong: word edits between the script
 * and what Whisper heard, over the script's words (0 = said exactly). Marks,
 * punctuation, alef and ta marbuta spellings and numbers don't count.
 */
export function misheard(script: string, heard: string): number {
  const a = scored(script);
  const b = scored(heard);
  if (!a.length) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] / a.length;
}
