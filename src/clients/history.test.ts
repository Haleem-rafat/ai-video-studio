import { test } from "node:test";
import assert from "node:assert/strict";

import { duplicateOf, nextCreativity, nextVoice, reelProblems, similarity, type Made } from "./history.ts";
import { pickRotation } from "./styles.ts";

const made = (over: Partial<Made>): Made => ({ id: "x", kind: "carousel", title: "", lines: [], createdAt: "2026-10-20T10:00:00Z", ...over });

test("similarity: the same Arabic sentence reworded with punctuation is close, unrelated ones are far", () => {
  assert.ok(similarity("المشكلة مش في المحتوى، المشكلة في اللي بيحصل بعد الاهتمام", "المشكلة مش في المحتوى.. المشكلة في اللي بيحصل بعد الاهتمام!") > 0.9);
  assert.ok(similarity("اتفق على ميعاد واختفى؟ غلطتك في 3 حاجات", "لوحة أرقام تعرفك مين زار صفحتك") < 0.15);
  assert.equal(similarity("", "anything"), 0);
});

const carousel = made({
  id: "2026-10-20-2-carousel",
  title: "«ابعتلي التفاصيل» اتكررت النهارده كام مرة؟",
  lines: ["العميل بين النبذة والرسايل ونموذج Google وبيتوه", "صفحة واحدة فيها قصتك وخدماتك وأعمالك وآراء عملائك", "العميل يشوف المواعيد المتاحة ويحجز بنفسه"],
});

test("duplicateOf finds a made carousel from its own idea, and lets a new message through", () => {
  const sameIdea = "كل يوم بتكتب «ابعتلي التفاصيل»؟ صفحة واحدة فيها قصتك وخدماتك وأعمالك وآراء عملائك والعميل يشوف المواعيد المتاحة ويحجز بنفسه";
  assert.equal(duplicateOf(sameIdea, [carousel])?.made.id, carousel.id);
  assert.equal(duplicateOf("إزاي تسعّر جلسة الكوتشينج الأولى من غير ما تخسر العميل", [carousel]), null);
});

// The two real Risero reels made on 2026-10-20.
const offerReel = made({
  id: "reel-offer",
  kind: "reel",
  beats: ["kinetic", "path", "turn", "page", "notify", "orbit", "cta"],
  lines: ["العميل سأل «السعر كام؟» وانت رديت بعد 6 ساعات.. تفتكر لسه مستنيك؟", "المشكلة مش في المحتوى.. المشكلة في اللي بيحصل بعد الاهتمام.", "احجز مكالمة مجانية 15 دقيقة، ولينك الحجز في البايو."],
  voice: "Charon",
  creativity: "creative",
  createdAt: "2026-10-20T14:39:00Z",
});
const awarenessReel = made({
  id: "reel-awareness",
  kind: "reel",
  beats: ["kinetic", "pain", "path", "conflict", "sting", "notify", "cta"],
  lines: ["اتفق على ميعاد واختفى؟ غالبًا غلطتك مش فيه، غلطتك في 3 حاجات.", "ويوصله تأكيد فوري، وتذكير تلقائي قبل الميعاد، من غير ما تبعت ولا رسالة."],
  voice: "Charon",
  creativity: "creative",
  createdAt: "2026-10-20T14:43:00Z",
});

test("a reel that opens like the last ones, follows their scene order or repeats their sentences is sent back", () => {
  const copy = { beats: ["kinetic", "path", "turn", "page", "notify", "orbit", "cta"], lines: ["المشكلة مش في المحتوى، المشكلة في اللي بيحصل بعد الاهتمام"] };
  const problems = reelProblems(copy, [awarenessReel, offerReel]).join("\n");
  assert.match(problems, /opens/);
  assert.match(problems, /scene order/);
  assert.match(problems, /المشكلة مش في المحتوى/);
});

test("a reel with its own opening, order and words passes", () => {
  const fresh = { beats: ["split", "stat", "links", "booking", "recap", "cta"], lines: ["قبل: عشر رسايل عشان ميعاد واحد. بعد: لينك واحد والعميل يختار.", "خمس دقايق بدل ساعة كل يوم."] };
  assert.deepEqual(reelProblems(fresh, [awarenessReel, offerReel]), []);
});

test("the voice and the creative level rotate away from the last reel's", () => {
  assert.notEqual(nextVoice([awarenessReel, offerReel]), "Charon");
  assert.equal(nextCreativity([awarenessReel, offerReel]), "bold");
  assert.equal(nextCreativity([]), "creative");
});

test("rotate picks a style the client's recent posts haven't used", () => {
  const history = [made({ artStyle: "flat" }), made({ artStyle: "clay" }), made({ artStyle: "cartoon" })];
  const picked = pickRotation(history);
  assert.ok(!["flat", "clay", "cartoon"].includes(picked));
});
