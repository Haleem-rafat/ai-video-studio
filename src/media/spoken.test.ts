import { test } from "node:test";
import assert from "node:assert/strict";

import { egyptianNumbers, misheard, namesHeard, pronounce, sameLetters, spokenOf, spokenText } from "./spoken.ts";

test("numbers before a noun use the Egyptian counting form", () => {
  assert.equal(egyptianNumbers("غلطتك في 3 حاجات"), "غلطتك في تلات حاجات");
  assert.equal(egyptianNumbers("بعد 6 ساعات"), "بعد ست ساعات");
  assert.equal(egyptianNumbers("مكالمة 15 دقيقة"), "مكالمة خمستاشر دقيقة");
  assert.equal(egyptianNumbers("مكالمة ١٥ دقيقة"), "مكالمة خمستاشر دقيقة");
});

test("standalone numbers, tens, hundreds and percentages", () => {
  assert.equal(egyptianNumbers("الرقم 3."), "الرقم تلاتة.");
  assert.equal(egyptianNumbers("48%"), "تمانية وأربعين في المية");
  assert.equal(egyptianNumbers("120 عميل"), "مية وعشرين عميل");
  assert.equal(egyptianNumbers("1 و 2"), "واحد و اتنين");
  assert.equal(egyptianNumbers("سنة 2026"), "سنة 2026", "years and long numbers stay digits");
});

test("brand names are said the client's way, whole words only, any case", () => {
  const map = { Risero: "رايزرو" };
  assert.equal(pronounce("صفحة Risero تخلي", map), "صفحة رايزرو تخلي");
  assert.equal(pronounce("RISERO.io و risero", map), "RISERO.io و رايزرو");
});

test("spokenText applies both", () => {
  assert.equal(spokenText("Risero في 3 حاجات", { Risero: "رايزرو" }), "رايزرو في تلات حاجات");
});

test("sameLetters accepts added vowel marks only", () => {
  assert.equal(sameLetters("آراء عملائك", "آراءْ عُملائك"), true);
  assert.equal(sameLetters("آراء عملائك", "أراء عملائك"), false);
  assert.equal(sameLetters("ميعادين", "مواعيد"), false);
});

test("the voice reads the spoken text only while the narration is unchanged", () => {
  const scene = { narration: "صفحة Risero", speech: { for: "صفحة Risero", text: "صفحة رايزرو" } };
  assert.equal(spokenOf(scene), "صفحة رايزرو");
  assert.equal(spokenOf({ ...scene, narration: "صفحة Risero الجديدة" }), "صفحة Risero الجديدة");
  assert.equal(spokenOf({ narration: "x" }), "x");
});

test("English words in Arabic narration are found, and longer names are said before their parts", async () => {
  const { COMMON_WORDS, latinWords, pronounce } = await import("./spoken.ts");
  assert.deepEqual(latinWords("ابعت DM على Instagram أو Google Form، والـ AI.."), ["DM", "Instagram", "Google", "Form", "AI"]);
  assert.equal(pronounce("املا الـ Google Form من Google", COMMON_WORDS), "املا الـ جوجل فورم من جوجل");
  assert.equal(pronounce("شوف الـ bio واللينك في الـ Bio", COMMON_WORDS), "شوف الـ بايو واللينك في الـ بايو");
  assert.equal(pronounce("Risero على instagram", { ...COMMON_WORDS, Risero: "رايزرو" }), "رايزرو على إنستجرام");
});

test("misheard: a take that says the script scores 0, whatever its marks, punctuation or spelling of alef and ta marbuta", () => {
  assert.equal(misheard("السِّعر كام؟ مش سُؤال عن الرَّقم.. ده سُؤال عن الثِّقة.", "السعر كام، مش سؤال عن الرقم ده سؤال عن الثقه"), 0);
  assert.equal(misheard("أكتر غلطة؟ ترد برقم", "اكتر غلطه ترد برقم"), 0);
});

test("misheard: numbers count as said however the listener writes them", () => {
  assert.equal(misheard("الخُطوة اِتنين: وضّح السعر", "الخطوة 2 وضح السعر"), 0);
});

test("misheard: words the voice got wrong count against the take", () => {
  // The take read «السعر» as «السارة» and «قصيرة» as «أو سيارة».
  const score = misheard("السعر كام؟ تحب نحدد مكالمة قصيرة", "السارة كم تحب نحدد مكالمة أو سيارة");
  assert.ok(score > 0.4, `scored ${score}`);
});

test("a 1 before a noun isn't read as «واحد»: «1 ساعة واحدة» is «ساعة واحدة», «1 ساعة» is «ساعة واحدة»", () => {
  assert.equal(egyptianNumbers("التلات يوم الرد. 1 ساعة واحدة تجاوب فيها"), "التلات يوم الرد. ساعة واحدة تجاوب فيها");
  assert.equal(egyptianNumbers("خد 1 ساعة بس"), "خد ساعة واحدة بس");
  assert.equal(egyptianNumbers("كل 1 يوم"), "كل يوم واحد");
  assert.equal(egyptianNumbers("الخطوة 1: اسأله"), "الخطوة واحد: اسأله");
});

test("a brand name must be heard whole: «رايزر» for «رايزرو» is a bad take", () => {
  assert.equal(namesHeard(["رايزرو"], "اكتب في الكومنت أكتر عميل سكت عليك. رَايزرو", "اكتب في الكومنت اكتر عميل سكت عليك رايزرو"), true);
  assert.equal(namesHeard(["رايزرو"], "سكت عليك. رَايزرو", "سكت عليك رايزر"), false);
  assert.equal(namesHeard(["رايزرو"], "سكت عليك.", "سكت عليك"), true, "a name the scene doesn't say isn't asked for");
  assert.equal(namesHeard(["رايز رو"], "شكرًا رايز رو", "شكرا رايزرو"), true, "spaces don't matter");
});
