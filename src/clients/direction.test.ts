import { test } from "node:test";
import assert from "node:assert/strict";

import type { Made } from "./history.ts";
import type { Client } from "./types.ts";
import { coveredTopics, directionNotes, featuresTouched, maySell, nextDialect, pitchProblems, readDirection, samePitch, topicTwin } from "./direction.ts";

const features = ["صفحة شخصية تجمع القصة والخدمات والأعمال وآراء العملاء", "حجز مواعيد ذاتي متزامن مع التقويم", "تأكيد وتذكير تلقائي لكل عميل", "لوحة أرقام: الزوار والدول ومدة البقاء", "روابط مخصصة لتتبع كل منشور وستوري"];
const client = { name: "Risero", language: "ar", pronounce: { Risero: "رايزرو" }, brief: { features } } as unknown as Client;
const made = (lines: string[], extra: Partial<Made> = {}): Made => ({ id: "x", kind: "reel", title: lines[0], lines, createdAt: "2026-10-22", ...extra });

// The two Risero reels that were the same ad in new words.
const offer = ["ابعت لينك صفحتك لأي حد يسأل. هيلاقي قصتك وشغلك وآراء عملائك في مكان واحد", "العميل يختار اليوم والميعاد بنفسه. التأكيد والتذكير يوصلوله لوحدهم، والحجز متزامن مع تقويمك", "تشوف عدد الزوار وجايين منين وبيقعدوا قد إيه", "احجز مكالمة مجانية 15 دقيقة"];
const details = ["كل يوم نفس الأسئلة: السعر كام؟ المواعيد إيه؟", "Risero بتبني لك صفحة واحدة: قصتك وخدماتك وآراء عملائك، والعميل يحجز منها بنفسه", "الحجز متزامن مع تقويمك، والعميل يختار ميعاده بنفسه. التأكيد والتذكير بيوصلوله لوحدهم", "لوحة الأرقام تقولك الزوار جايين منين، وبيقعدوا قد إيه", "احجز مكالمة مجانية 15 دقيقة"];
const advice = ["لما حد يسألك السعر كام، متبعتش رقم على طول", "اسأله الأول عن هدفه وظروفه", "كده بيحس إنك فاهمه قبل ما يعرف السعر", "جرب الرد ده النهارده وقولي في الكومنتات حصل إيه"];

test("an ad that tours the same features as an earlier reel is caught; advice touches none", () => {
  assert.ok(featuresTouched(details, features).length >= 3);
  assert.equal(samePitch(details, [made(offer)], features)?.title, offer[0]);
  assert.deepEqual(featuresTouched(advice, features), []);
  assert.equal(samePitch(advice, [made(offer)], features), undefined);
});

test("value content may name the brand only at the end, and never walks through the product", () => {
  assert.deepEqual(pitchProblems([...advice, "تابع Risero لنصايح أكتر"], client), []);
  const named = pitchProblems(details, client);
  assert.ok(named.some((p) => /brand is named/.test(p)));
  assert.ok(named.some((p) => /walks through the product/.test(p)));
  assert.equal(pitchProblems(["رايزرو بيساعدك", "آخر فريم"], client).length, 1);
});

test("a topic already made or planned is refused even in other words", () => {
  const history = [made([], { title: "إزاي ترد على السعر كام من غير ما تخسر العميل", topic: "الرد على سؤال السعر كام من غير ما تخسر العميل" })];
  assert.ok(topicTwin("إزاي ترد على سؤال السعر كام", history));
  assert.equal(topicTwin("٣ حاجات لازم تكون في البايو عشان العميل يثق فيك", history), undefined);
  assert.deepEqual(coveredTopics(["إزاي ترد على السعر كام من غير ما تخسر العميل", "روتين أسبوعي لمدرب شغال لوحده"], history), ["إزاي ترد على السعر كام من غير ما تخسر العميل"]);
});

test("value never sells, mix sells once in five, dialects take turns", () => {
  const value = { direction: readDirection({ mode: "value", dialects: ["egyptian", "gulf"] })! };
  const mix = { direction: readDirection({ mode: "mix" })! };
  assert.equal(maySell(value, []), false);
  assert.equal(maySell(mix, [{ promo: false }, { promo: false }]), true);
  assert.equal(maySell(mix, [{ promo: false }, { promo: true }]), false);
  assert.equal(maySell({}, []), true);
  const ar = { ...value, language: "ar" as const };
  assert.equal(nextDialect(ar, []), "egyptian");
  assert.equal(nextDialect(ar, [{ dialect: "egyptian" }]), "gulf");
  assert.equal(nextDialect(ar, [{ dialect: "gulf" }]), "egyptian");
  assert.equal(nextDialect({ ...ar, language: "en" }, []), undefined);
});

test("a direction is read safely and told to the writers; none means nothing changes", () => {
  assert.equal(readDirection({ mode: "sell everything" }), null);
  const direction = readDirection({ mode: "value", brief: " مش إعلان ", topics: "أ\nب\n\nأ", dialects: ["gulf", "klingon"] })!;
  assert.deepEqual([direction.brief, direction.topics, direction.dialects], ["مش إعلان", ["أ", "ب"], ["gulf"]]);
  assert.equal(directionNotes({}, "reel"), "");
  const notes = directionNotes({ direction }, "ideas");
  assert.match(notes, /VALUE CONTENT, NOT ADS/);
  assert.match(notes, /TOPICS NOT COVERED YET/);
  assert.match(directionNotes({ direction: { ...direction, mode: "mix" } }, "reel", [], true), /PROMO/);
});

test("Gulf text full of Egyptian words is sent back; real Gulf text and Egyptian posts pass", async () => {
  const { dialectProblems } = await import("./direction.ts");
  const egyptian = ["العميل بيدخل بايوك ويمشي من غير ما يراسلك؟", "كلام صح، بس ما بيقولش حاجة", "لسه معندكش رأي؟ مش مشكلة"];
  assert.match(dialectProblems(egyptian, "gulf").join(" "), /Gulf/);
  assert.deepEqual(dialectProblems(egyptian, "egyptian"), []);
  assert.deepEqual(dialectProblems(["العميل يدخل البايو ويطلع بدون ما يراسلك؟", "كلام صح، بس ما يقول شي", "ما عندك رأي؟ مو مشكلة"], "gulf"), []);
});
