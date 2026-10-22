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

test("a post's history holds the text of every layout, its format, design and slide order", async () => {
  const { madeFromPost } = await import("./history.ts");
  const made = madeFromPost({
    id: "p1",
    clientId: "c",
    kind: "carousel",
    caption: "Caption line",
    hashtags: [],
    status: "done",
    design: "neon",
    postFormat: "faq",
    createdAt: "2026-10-22T10:00:00Z",
    updatedAt: "",
    slides: [
      { layout: "cover", title: "أسئلة الناس" },
      { layout: "faq", question: "غالي؟", answer: "أول مكالمة مجانية" },
      { layout: "versus", left: { label: "الرسايل", points: ["بطيء"] }, right: { label: "صفحة", points: ["فوري"] } },
      { layout: "chat", messages: [{ from: "them", text: "متاح بكرة؟" }, { from: "us", text: "احجز من اللينك" }] },
      { layout: "fix", problem: "٦ لينكات", fix: "صفحة واحدة" },
      { layout: "cta", title: "احجز", button: "احجز", url: "https://x" },
    ],
  });
  for (const text of ["غالي؟", "أول مكالمة مجانية", "بطيء", "فوري", "متاح بكرة؟", "٦ لينكات", "صفحة واحدة"]) assert.ok([made.title, ...made.lines].includes(text), text);
  assert.ok(!made.lines.includes("them") && !made.lines.includes("https://x"));
  assert.equal(made.format, "faq");
  assert.equal(made.design, "neon");
  assert.deepEqual(made.layouts, ["cover", "faq", "versus", "chat", "fix", "cta"]);
});

test("Rotate gives a design the recent posts haven't used, else the one used longest ago", async () => {
  const { pickDesign } = await import("./history.ts");
  const { DESIGN_IDS } = await import("./designs.ts");
  assert.equal(pickDesign([{ design: "classic" }, { design: "bold" }]), "neon");
  const all = [...DESIGN_IDS].reverse().map((design) => ({ design }));
  // Newest first: the oldest use is "classic", reversed to the end.
  assert.equal(pickDesign(all), "classic");
});

test("Auto keeps the idea's own format, unless one of the last two carousels used it; then the one used longest ago", async () => {
  const { autoFormat } = await import("./history.ts");
  const { FORMAT_IDS } = await import("./formats.ts");
  assert.equal(autoFormat({ angle: "myth" }, []), "myth");
  assert.equal(autoFormat({ angle: "myth" }, [{ kind: "carousel", format: "list" }, { kind: "carousel", format: "steps" }, { kind: "carousel", format: "myth" }]), "myth", "used three posts ago is fine");
  const repeated = autoFormat({ angle: "myth" }, [{ kind: "carousel", format: "list" }, { kind: "carousel", format: "myth" }]);
  assert.notEqual(repeated, "myth");
  assert.ok(!["list"].includes(repeated!));
  // A trend idea with no format of its own still gets one nobody used lately.
  const used = FORMAT_IDS.filter((id) => id !== "faq").map((format) => ({ kind: "carousel" as const, format }));
  assert.equal(autoFormat({ angle: "trend" }, used), "faq");
  // Reels and videos don't count.
  assert.equal(autoFormat({ angle: "myth" }, [{ kind: "reel", format: "myth" }]), "myth");
});

test("a design choice resolves to a design: Rotate looks at carousels and images only", async () => {
  const { chooseDesign } = await import("./history.ts");
  assert.equal(chooseDesign(undefined, []), undefined);
  assert.equal(chooseDesign("glass", []), "glass");
  assert.equal(chooseDesign("rotate", [{ kind: "reel", design: "classic" }, { kind: "carousel", design: "classic" }]), "bold");
});
