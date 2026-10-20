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

/** Swaps whole words for how they are said, ignoring case: { Risero: "رايزرو" }. */
export function pronounce(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [word, said] of Object.entries(map)) {
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
