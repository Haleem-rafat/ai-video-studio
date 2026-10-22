import type { SiteBrand } from "../types.ts";

/**
 * Carousel designs: whole slide looks laid over the base slide (see
 * src/render/carousel.ts), each in the client's own colours, fonts, logo,
 * name and handle. Classic is the look slides always had. A design sets how
 * the slide looks; the art style (styles.ts) then only sets the pictures.
 */

export const DESIGN_IDS = ["classic", "bold", "neon", "magazine", "minimal", "glass", "brutal", "notes", "tweet", "chat", "sticky", "swiss", "checker", "pastel", "retro", "gradient", "film", "scrapbook"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];
/** A design, or "rotate": one the client's recent posts haven't used. */
export type DesignChoice = DesignId | "rotate";

type Colors = SiteBrand["colors"];
type Text = { en: string; ar: string };

export type DesignContext = { c: Colors; arabic: boolean; name: string; handle: string; logo?: string; index: number; total: number };

export type Design = { id: DesignId; label: Text; description: Text; css: (ctx: DesignContext) => string };

/** Text as a CSS string literal, for `content:`: quotes, backslashes and line breaks can't break out. */
export const cssText = (text: string) => `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

/** Whether a colour is light (for picking dark or light text on it). */
export function isLight(hex: string): boolean {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((part) => parseInt(part, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Cards, list rows and steps: what most designs restyle together. */
const BOXES = ".card,.list li,.step";
const two = (n: number) => String(n).padStart(2, "0");

export const DESIGNS: Record<DesignId, Design> = {
  classic: {
    id: "classic",
    label: { en: "Classic", ar: "كلاسيك" },
    description: { en: "The studio's look: soft glow, rounded cards", ar: "شكل الاستوديو: إضاءة ناعمة وكروت مدوّرة" },
    css: () => "/* design:classic */",
  },

  bold: {
    id: "bold",
    label: { en: "Bold type", ar: "خط عريض" },
    description: { en: "Huge headlines with a highlighter stroke; no boxes", ar: "عناوين ضخمة بخط تحديد؛ من غير كروت" },
    css: ({ c, arabic }) => `/* design:bold */
body{background:${c.background}}
h1{font-size:${arabic ? 112 : 124}px;line-height:${arabic ? 1.25 : 1};letter-spacing:${arabic ? 0 : -3}px;${arabic ? "" : "text-transform:uppercase;"}}
h1,h2{text-decoration:underline;text-decoration-color:${c.cta}bb;text-decoration-thickness:.3em;text-underline-offset:${arabic ? "-.05em" : "-.12em"};text-decoration-skip-ink:none}
h2{font-size:72px;letter-spacing:${arabic ? 0 : -1.5}px}
.sub{font-size:40px;color:${c.text};opacity:.75}
${BOXES}{background:none;border-radius:0;border-bottom:4px solid ${c.text};padding:22px 0}
.card{border:none;border-top:10px solid ${c.accent};padding:24px 0 0}
.card.hot{outline:none;border-top-color:${c.cta}}
.num{background:none;color:${c.cta};font-size:64px;width:auto;height:auto;border-radius:0}
.stat{font-size:280px;letter-spacing:-8px;color:${c.text};text-shadow:12px 12px 0 ${c.cta}}
.button{border-radius:0;font-size:56px;box-shadow:12px 12px 0 ${c.accent}}
.art{border-radius:0}`,
  },

  neon: {
    id: "neon",
    label: { en: "Dark neon", ar: "نيون غامق" },
    description: { en: "Near-black grid with glowing brand colours and arrows", ar: "خلفية شبه سودا بشبكة وألوان البراند منوّرة وأسهم" },
    css: ({ c, arabic }) => `/* design:neon */
body{background:linear-gradient(${c.accent}14 2px,transparent 2px) 0 0/90px 90px,linear-gradient(90deg,${c.accent}14 2px,transparent 2px) 0 0/90px 90px,radial-gradient(circle at 50% 120%,${c.cta}40,transparent 60%),#07060d;color:#f4f2ff}
h1,h2{color:#fff;text-shadow:0 0 18px ${c.accent},0 0 42px ${c.accent}99}
h1::after{content:"${arabic ? "←" : "→"}";color:${c.cta};margin-inline-start:18px;text-shadow:0 0 18px ${c.cta}}
.sub,footer{color:#b9b4d6}
${BOXES}{background:#ffffff08;border:2px solid ${c.accent};box-shadow:0 0 22px ${c.accent}66,inset 0 0 22px ${c.accent}22;border-radius:18px}
.card.hot{outline:none;border-color:${c.cta};box-shadow:0 0 26px ${c.cta}88,inset 0 0 22px ${c.cta}22}
.card.muted p{color:#8f8aad}
.num{background:none;border:3px solid ${c.cta};color:${c.cta};box-shadow:0 0 16px ${c.cta}}
.tag,.card.hot .tag{color:${c.cta};text-shadow:0 0 12px ${c.cta}}
.stat,.bar-value{color:#fff;text-shadow:0 0 24px ${c.cta},0 0 60px ${c.cta}}
.bar-track{background:#ffffff10}
.bar-fill{box-shadow:0 0 18px ${c.accent}}
.button{background:transparent;color:#fff;border:4px solid ${c.cta};box-shadow:0 0 30px ${c.cta},inset 0 0 20px ${c.cta}66}
.art{border-radius:18px;box-shadow:0 0 40px ${c.accent}88}`,
  },

  magazine: {
    id: "magazine",
    label: { en: "Magazine", ar: "مجلة" },
    description: { en: "Editorial page: issue number, thin rules, big quotes", ar: "صفحة مجلة: رقم العدد وخطوط رفيعة واقتباسات كبيرة" },
    css: ({ c, arabic, name, index }) => `/* design:magazine */
body{background:${c.background};padding:64px 84px}
body::before{content:"${two(index + 1)}";position:absolute;inset-inline-end:60px;top:24px;font-size:300px;font-weight:800;line-height:1;color:${c.accent}22;font-family:inherit}
header{border-bottom:2px solid ${c.text};padding-bottom:18px;height:auto;gap:18px}
header::after{content:${cssText(name)};margin-inline-start:auto;font-size:24px;letter-spacing:${arabic ? 0 : 6}px;${arabic ? "" : "text-transform:uppercase;"}color:${c.muted}}
.content{justify-content:flex-end;gap:28px;padding-bottom:20px}
h1{font-size:${arabic ? 92 : 100}px;line-height:${arabic ? 1.3 : 1.02};font-style:${arabic ? "normal" : "italic"}}
h1,h2{max-width:92%}
.sub{font-size:34px;border-inline-start:6px solid ${c.cta};padding-inline-start:20px}
${BOXES}{background:none;border-radius:0;border-top:2px solid ${c.text}55;padding:20px 0}
.card.hot{outline:none;border-top:6px solid ${c.cta}}
.num{background:none;color:${c.cta};font-size:46px;width:auto;height:auto;border-radius:0}
.mark{font-size:300px;color:${c.cta}}
blockquote{font-size:70px;font-style:${arabic ? "normal" : "italic"}}
footer{border-top:2px solid ${c.text};padding-top:14px}
.art{border-radius:4px}`,
  },

  minimal: {
    id: "minimal",
    label: { en: "Minimal", ar: "بسيط" },
    description: { en: "Lots of space, hairlines and one accent dot", ar: "مساحة كتير وخطوط رفيعة ونقطة لون واحدة" },
    css: ({ c }) => `/* design:minimal */
body{background:${c.background};padding:110px 110px 80px}
.content{gap:40px}
h1{font-size:76px;font-weight:700;line-height:1.25}
h1::before{content:"";display:block;width:22px;height:22px;border-radius:50%;background:${c.cta};margin-bottom:34px}
h2{font-size:52px;font-weight:700}
.sub{font-size:32px}
${BOXES}{background:none;border-radius:0;border-bottom:1px solid ${c.muted}55;padding:20px 0;font-size:34px}
.card{border-top:1px solid ${c.muted}55;border-bottom:none}
.card.hot{outline:none}
.card.hot .tag{color:${c.cta}}
.num{background:none;color:${c.muted};font-size:28px;font-weight:600;width:40px}
.stat{font-size:200px;font-weight:300;color:${c.text}}
.button{background:none;color:${c.text};border:2px solid ${c.text};font-size:44px;padding:24px 56px}
.art{border-radius:12px;opacity:.95}`,
  },

  glass: {
    id: "glass",
    label: { en: "Glass", ar: "زجاج" },
    description: { en: "Frosted glass cards over glowing brand-colour blobs", ar: "كروت زجاج مطفي فوق بقع ألوان البراند" },
    css: ({ c }) => `/* design:glass */
body{background:radial-gradient(circle at 18% 22%,${c.accent}cc,transparent 34%),radial-gradient(circle at 85% 30%,${c.cta}b3,transparent 32%),radial-gradient(circle at 60% 88%,${c.accent}99,transparent 36%),${c.background}}
${BOXES}{background:#ffffff1f;border:1.5px solid #ffffff40;backdrop-filter:blur(28px) saturate(1.4);-webkit-backdrop-filter:blur(28px) saturate(1.4);border-radius:36px;box-shadow:0 20px 50px #0004}
.card.hot{outline:none;border-color:${c.cta}aa}
.num{background:#ffffff33;color:${c.text};border:1.5px solid #ffffff66}
h1,h2{text-shadow:0 4px 24px #0005}
.content>h1,.content>.sub{background:#ffffff14;border:1.5px solid #ffffff33;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);border-radius:32px;padding:28px 36px}
.button{background:#ffffff2e;color:${c.text};border:1.5px solid #ffffff66;backdrop-filter:blur(20px)}
.bar-track{background:#ffffff22}
.art{border-radius:40px;border:1.5px solid #ffffff55}`,
  },

  brutal: {
    id: "brutal",
    label: { en: "Neo-brutal", ar: "نيو بروتال" },
    description: { en: "Thick outlines, hard shadows and loud colour blocks", ar: "حدود تخينة وظلال حادة وبلوكات ألوان صريحة" },
    css: ({ c }) => {
      const paper = isLight(c.background) ? c.background : "#fff8e7";
      return `/* design:brutal */
body{background:${paper};color:#111}
.sub,footer{color:#333}
h1{background:${c.cta};color:#111;border:6px solid #111;box-shadow:14px 14px 0 #111;padding:18px 26px;align-self:flex-start;transform:rotate(-1.2deg)}
h2{color:#111}
${BOXES}{background:#fff;color:#111;border:5px solid #111;border-radius:14px;box-shadow:10px 10px 0 #111}
.list li:nth-child(3n+2),.step:nth-child(3n+2){background:${c.accent}66}
.list li:nth-child(3n),.step:nth-child(3n){background:${c.cta}55}
.card.hot{outline:none;background:${c.cta}55}
.card.muted p{color:#555}
.num{background:#111;color:#fff;border-radius:10px}
.tag,.card.hot .tag{color:#111;background:#fff;border:3px solid #111;align-self:flex-start;padding:2px 14px;border-radius:8px}
.stat{color:#111;text-shadow:10px 10px 0 ${c.cta}}
.bar-track{background:#fff;border:4px solid #111}
.bar-fill{background:${c.cta};border-radius:0}
.bar-value{color:#111}
.button{background:${c.cta};color:#111;border:6px solid #111;border-radius:14px;box-shadow:12px 12px 0 #111}
.mark{color:${c.cta}}
.art{border:6px solid #111;border-radius:14px;box-shadow:14px 14px 0 #111}`;
    },
  },

  notes: {
    id: "notes",
    label: { en: "Notes app", ar: "تطبيق النوتس" },
    description: { en: "Looks like a phone note: paper, checkboxes, a date", ar: "شكل نوت على الموبايل: ورق ومربعات صح وتاريخ" },
    css: ({ c, arabic }) => `/* design:notes */
body{background:#fbfaf6;color:#1c1c1e;padding:56px 80px 64px}
body::before{content:"${arabic ? "الملاحظات ›" : "‹ Notes"}";position:absolute;top:44px;inset-inline-start:80px;font-size:34px;color:#d4a20a;font-weight:600}
body::after{content:"${arabic ? "تم" : "Done"}";position:absolute;top:44px;inset-inline-end:80px;font-size:34px;color:#d4a20a;font-weight:700}
header{margin-top:56px;opacity:.9}
.content{justify-content:flex-start;padding-top:30px;gap:30px}
h1{font-size:80px;color:#1c1c1e}
h2{font-size:58px;color:#1c1c1e}
.sub,footer{color:#8e8e93}
${BOXES}{background:none;border-radius:0;padding:10px 0;color:#1c1c1e}
.list li .num,.step .num{background:none;border:4px solid #d4a20a;color:transparent;width:46px;height:46px;font-size:0;display:flex;align-items:center;justify-content:center}
.list li .num::after,.step .num::after{content:"✓";color:#d4a20a;font-size:30px}
.card{border-inline-start:6px solid #d4a20a;padding:6px 26px}
.card.hot{outline:none;border-color:${c.cta}}
.card.muted p{color:#8e8e93}
.tag{color:#d4a20a}
.stat{color:#1c1c1e}
.bar-track{background:#ecebe6}
.button{background:#d4a20a;color:#fff}
.mark{color:#d4a20a}
.art{border-radius:20px}`,
  },

  tweet: {
    id: "tweet",
    label: { en: "Tweet / thread", ar: "تويتة / ثريد" },
    description: { en: "Every slide is a post card with the brand's name and handle", ar: "كل سلايد كارت بوست باسم البراند والهاندل" },
    css: ({ c, arabic, name, handle, logo, index, total }) => {
      const light = isLight(c.background);
      const card = light ? "#ffffff" : "#16181c";
      const ink = light ? "#0f1419" : "#e7e9ea";
      const grey = light ? "#536471" : "#71767b";
      return `/* design:tweet */
body{background:${c.background};padding:90px 70px;justify-content:center}
header,footer{display:none}
.content{flex:none;max-height:100%;background:${card};color:${ink};border:1px solid ${grey}44;border-radius:36px;padding:150px 56px 64px;justify-content:flex-start;gap:28px;position:relative;box-shadow:0 30px 70px #0004}
.content::before{content:${cssText(name)};position:absolute;top:52px;${arabic ? "right" : "left"}:150px;font-size:34px;font-weight:800;color:${ink}}
.content::after{content:${cssText(`@${handle || name.toLowerCase().replace(/\s+/g, "")} · ${index + 1}/${total}`)};position:absolute;top:96px;${arabic ? "right" : "left"}:150px;font-size:28px;color:${grey};direction:ltr;unicode-bidi:isolate}
main.content{background-image:${logo ? `url(${cssText(logo)})` : "none"};background-repeat:no-repeat;background-size:76px 76px;background-position:${"top 46px left 56px"}}
html[dir=rtl] main.content{background-position:top 46px right 56px}
h1{font-size:68px;font-weight:700;line-height:1.3;color:${ink}}
h2{font-size:54px;font-weight:700;color:${ink}}
.sub{color:${grey};font-size:34px}
${BOXES}{background:${light ? "#f7f9f9" : "#202327"};color:${ink};border-radius:20px;font-size:34px}
.card.hot{outline:3px solid ${c.cta}}
.card.muted p{color:${grey}}
.num{background:${c.cta};color:#fff}
.stat{color:${c.cta}}
.bar-track{background:${light ? "#eff3f4" : "#2f3336"}}
.button{font-size:44px}
.art{border-radius:24px;width:100%;height:420px}
.art-cover{height:520px}`;
    },
  },

  chat: {
    id: "chat",
    label: { en: "DM chat", ar: "شات رسايل" },
    description: { en: "Points as chat bubbles, like a DM conversation", ar: "النقط على شكل فقاعات شات زي رسايل الدايركت" },
    css: ({ c }) => {
      const light = isLight(c.background);
      const them = light ? "#e9e9eb" : "#2c2c2e";
      const themInk = light ? "#111" : "#f2f2f7";
      return `/* design:chat */
body{background:radial-gradient(${c.accent}1a 2px,transparent 2px) 0 0/36px 36px,${c.background}}
.content{gap:20px}
h1,h2{background:${them};color:${themInk};border-radius:44px 44px 44px 12px;padding:28px 40px;align-self:flex-start;max-width:90%}
html[dir=rtl] h1,html[dir=rtl] h2{border-radius:44px 44px 12px 44px}
.sub{background:${c.cta};color:#fff;border-radius:40px 40px 12px 40px;padding:20px 34px;align-self:flex-end;max-width:80%}
html[dir=rtl] .sub{border-radius:40px 40px 40px 12px}
.list,.steps{gap:16px}
${BOXES}{border-radius:40px 40px 40px 12px;background:${them};color:${themInk};max-width:88%;align-self:flex-start;padding:22px 32px}
html[dir=rtl] .list li,html[dir=rtl] .step,html[dir=rtl] .card{border-radius:40px 40px 12px 40px}
.list li:nth-child(even),.step:nth-child(even),.card.hot{align-self:flex-end;background:${c.cta};color:#fff;border-radius:40px 40px 12px 40px;outline:none}
html[dir=rtl] .list li:nth-child(even),html[dir=rtl] .step:nth-child(even),html[dir=rtl] .card.hot{border-radius:40px 40px 40px 12px}
.list li:nth-child(even) .num,.step:nth-child(even) .num{background:#ffffff33;color:#fff}
.card.hot .tag{color:#fff}
.card.muted p{color:${light ? "#555" : "#aaa"}}
.button{border-radius:40px 40px 12px 40px}`;
    },
  },

  sticky: {
    id: "sticky",
    label: { en: "Sticky notes", ar: "ورق لاصق" },
    description: { en: "Tilted paper notes with tape on a board", ar: "ورق ملاحظات مايل بلزق على بورد" },
    css: ({ c }) => `/* design:sticky */
body{background:radial-gradient(#00000018 1.5px,transparent 1.5px) 0 0/22px 22px,#e9dcc4;color:#2b2420}
.sub,footer{color:#5c5049}
h1,h2{color:#2b2420}
h1{background:#fff59d;padding:34px 40px;transform:rotate(-1.5deg);box-shadow:0 18px 30px #0003;align-self:flex-start;position:relative}
${BOXES}{border-radius:4px;color:#2b2420;box-shadow:0 14px 24px #0002;position:relative}
.list li:nth-child(4n+1),.step:nth-child(4n+1),.card.muted{background:#fff59d;transform:rotate(-1deg)}
.list li:nth-child(4n+2),.step:nth-child(4n+2),.card.hot{background:#ffcdd2;transform:rotate(.8deg)}
.list li:nth-child(4n+3),.step:nth-child(4n+3){background:#c8e6c9;transform:rotate(-.6deg)}
.list li:nth-child(4n),.step:nth-child(4n){background:#bbdefb;transform:rotate(1.1deg)}
h1::before,.card::before,.list li::before,.step::before{content:"";position:absolute;top:-16px;left:50%;width:120px;height:34px;margin-left:-60px;background:#ffffff99;transform:rotate(-3deg);box-shadow:0 2px 4px #0001}
.card.hot{outline:none}
.card.muted p{color:#6d625a}
.num{background:${c.cta};color:#fff}
.tag,.card.hot .tag{color:${c.cta}}
.stat{color:${c.cta}}
.bar-track{background:#fff8}
.button{background:${c.cta};color:#fff;border-radius:6px;transform:rotate(-1deg)}
.art{border:14px solid #fff;border-bottom-width:44px;border-radius:2px;transform:rotate(2deg);box-shadow:0 18px 30px #0003}`,
  },

  swiss: {
    id: "swiss",
    label: { en: "Swiss grid", ar: "شبكة سويسرية" },
    description: { en: "Strict grid, big numbers, a bold colour bar", ar: "شبكة صارمة وأرقام كبيرة وشريط لون عريض" },
    css: ({ c, arabic, index }) => `/* design:swiss */
body{background:${isLight(c.background) ? c.background : "#f5f3ee"};color:#111;padding-block:72px;padding-inline:150px 84px}
body::before{content:"";position:absolute;top:0;bottom:0;inset-inline-start:0;width:46px;background:${c.cta}}
body::after{content:"${two(index + 1)}";position:absolute;bottom:52px;inset-inline-end:84px;font-size:180px;font-weight:800;line-height:1;color:#111}
header{border-bottom:3px solid #111;padding-bottom:16px;height:auto}
.content{justify-content:flex-start;padding-top:60px;gap:32px}
h1{font-size:${arabic ? 96 : 104}px;line-height:${arabic ? 1.25 : 1.02};letter-spacing:${arabic ? 0 : -2}px;color:#111}
h2{font-size:64px;color:#111}
.sub,footer{color:#444}
footer span:last-child{visibility:hidden}
${BOXES}{background:none;border-radius:0;border-top:3px solid #111;padding:20px 0;color:#111}
.card.hot{outline:none;border-top-color:${c.cta};border-top-width:10px}
.card.muted p{color:#666}
.num{background:none;color:${c.cta};font-size:44px;border-radius:0;width:auto}
.tag,.card.hot .tag{color:${c.cta};${arabic ? "" : "text-transform:uppercase;letter-spacing:3px;"}font-size:26px}
.stat{color:#111}
.bar-track{background:#e2dfd6;border-radius:0}
.bar-fill{background:${c.cta};border-radius:0}
.bar-value{color:#111}
.button{border-radius:0;background:#111;color:#fff}
.art{border-radius:0}`,
  },

  checker: {
    id: "checker",
    label: { en: "Checkerboard", ar: "شطرنج" },
    description: { en: "A bold checked frame in the brand colours", ar: "إطار مربعات جريء بألوان البراند" },
    css: ({ c }) => `/* design:checker */
html{background:${c.background}}
body{border:58px solid transparent;padding:52px 60px;background:linear-gradient(${c.background},${c.background}) padding-box,repeating-conic-gradient(${c.accent} 0 25%,${c.cta} 0 50%) border-box 0 0/116px 116px;border-radius:0}
${BOXES}{border-radius:24px}
.card.hot{outline:4px solid ${c.cta}}
.art{border-radius:24px;border:8px solid ${c.cta}}`,
  },

  pastel: {
    id: "pastel",
    label: { en: "Pastel", ar: "باستيل" },
    description: { en: "Soft pastel paper, rounded frames, friendly type", ar: "ورق باستيل ناعم وإطارات مدوّرة وخط ودود" },
    css: ({ c }) => {
      const ink = "#2d2a3e";
      return `/* design:pastel */
body{background:radial-gradient(circle at 85% 12%,color-mix(in srgb,${c.cta} 30%,#fff) 0 18%,transparent 19%),radial-gradient(circle at 10% 90%,color-mix(in srgb,${c.accent} 30%,#fff) 0 16%,transparent 17%),color-mix(in srgb,${c.accent} 14%,#fffaf6);color:${ink}}
h1,h2{color:${ink}}
.sub,footer{color:#6b6680}
${BOXES}{background:#fff;color:${ink};border-radius:40px;box-shadow:0 14px 34px #2d2a3e18}
.card.hot{outline:4px solid color-mix(in srgb,${c.cta} 55%,#fff)}
.card.muted p{color:#8a85a0}
.num{background:color-mix(in srgb,${c.cta} 35%,#fff);color:${ink}}
.tag,.card.hot .tag{color:color-mix(in srgb,${c.cta} 80%,#000)}
.stat{color:color-mix(in srgb,${c.cta} 85%,#000)}
.bar-track{background:#fff}
.button{background:color-mix(in srgb,${c.cta} 45%,#fff);color:${ink}}
.art{border-radius:50%;border:14px solid #fff;box-shadow:0 18px 40px #2d2a3e22}
.bubble.them{background:#fff;color:${ink}}`;
    },
  },

  retro: {
    id: "retro",
    label: { en: "Retro", ar: "ريترو" },
    description: { en: "Cream paper, a sunburst and chunky retro shadows", ar: "ورق كريمي وشمس وظلال ريترو تخينة" },
    css: ({ c }) => {
      const ink = "#2b1d14";
      return `/* design:retro */
body{background:repeating-conic-gradient(from 0deg at 50% 118%,${c.cta}22 0 6deg,transparent 6deg 12deg),#f6ecd9;color:${ink}}
h1,h2{color:${ink}}
h1{text-shadow:6px 6px 0 ${c.cta},12px 12px 0 ${c.accent}88}
.sub,footer{color:#6d5747}
${BOXES}{background:#fffaf0;color:${ink};border:4px solid ${ink};border-radius:30px;box-shadow:8px 8px 0 ${c.accent}}
.card.hot{outline:none;box-shadow:8px 8px 0 ${c.cta}}
.card.muted p{color:#8a7462}
.num{background:${c.cta};color:#fffaf0;border:3px solid ${ink}}
.tag,.card.hot .tag{color:${ink};background:${c.accent}55;border-radius:999px;padding:2px 16px;align-self:flex-start}
.stat{color:${c.cta};text-shadow:8px 8px 0 ${ink}}
.bar-track{background:#fffaf0;border:3px solid ${ink}}
.bar-value{color:${ink}}
.button{background:${c.cta};color:#fffaf0;border:4px solid ${ink};box-shadow:8px 8px 0 ${ink}}
.art{border:6px solid ${ink};border-radius:30px;box-shadow:12px 12px 0 ${c.accent}}`;
    },
  },

  gradient: {
    id: "gradient",
    label: { en: "Gradient", ar: "تدرّج" },
    description: { en: "A rich brand-colour gradient with centred type", ar: "تدرّج غني بألوان البراند وخط في النص" },
    css: ({ c }) => `/* design:gradient */
body{background:linear-gradient(150deg,${c.accent} 0%,${c.cta} 55%,${c.background} 120%);color:#fff}
.content{text-align:center;align-items:center}
h1,h2{color:#fff;text-shadow:0 6px 30px #0003}
h1{font-size:96px}
.sub,footer{color:#ffffffd9}
${BOXES}{background:#ffffff26;color:#fff;border:1.5px solid #ffffff55;border-radius:32px;text-align:start;width:100%}
.card.hot{outline:none;background:#ffffff38}
.card.muted p{color:#ffffffbb}
.num{background:#fff;color:${c.cta}}
.tag,.card.hot .tag{color:#fff}
.stat{color:#fff;text-shadow:0 10px 40px #0004}
.bar-track{background:#ffffff33}
.bar-fill{background:#fff}
.bar-value{color:#fff}
.mark{color:#ffffffaa}
.button{background:#fff;color:${c.cta}}
.art{border-radius:40px;border:3px solid #ffffff88}
.bubble.them{background:#ffffff33;color:#fff}
.bubble.us{background:#fff;color:${c.cta}}`,
  },

  film: {
    id: "film",
    label: { en: "Film", ar: "فيلم" },
    description: { en: "Analog film strip with sprocket holes and grain", ar: "شريط فيلم قديم بفتحات وحبيبات" },
    css: ({ c, index }) => {
      const holes = "repeating-linear-gradient(to bottom,transparent 0 22px,#f3eee4 22px 46px,transparent 46px 70px)";
      return `/* design:film */
body{background:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.14'/></svg>"),#121110;color:#f3eee4;padding:72px 120px}
body::before,body::after{content:"";position:absolute;top:0;bottom:0;width:70px;background:${holes} 24px 0/22px 100% no-repeat,#050505}
body::before{left:0}
body::after{right:0}
h1,h2{color:#f3eee4}
.sub{color:#bdb5a6}
footer{color:${c.cta};font-family:'Courier New',monospace;letter-spacing:4px}
footer span:last-child::before{content:"▶ ${index + 1}A  ";}
${BOXES}{background:#1d1b19;color:#f3eee4;border-radius:4px;border:1px solid #3a3530}
.card.hot{outline:2px solid ${c.cta}}
.card.muted p{color:#958c7d}
.num{background:${c.cta};color:#121110;border-radius:4px}
.stat{color:#f3eee4}
.bar-track{background:#2a2724;border-radius:2px}
.bar-fill{border-radius:2px}
.button{border-radius:4px}
.art{border:14px solid #f3eee4;border-bottom-width:40px;border-radius:2px;filter:sepia(.25) contrast(1.05)}`;
    },
  },

  scrapbook: {
    id: "scrapbook",
    label: { en: "Scrapbook", ar: "سكراب بوك" },
    description: { en: "Kraft paper, taped polaroids and stamps", ar: "ورق كرافت وصور بولارويد بلزق وأختام" },
    css: ({ c }) => {
      const ink = "#3b2f25";
      return `/* design:scrapbook */
body{background:radial-gradient(#00000012 1px,transparent 1px) 0 0/14px 14px,#d9c4a0;color:${ink}}
h1,h2{color:${ink}}
h1{background:#fffdf7;padding:30px 36px;transform:rotate(1deg);box-shadow:0 12px 24px #0003;align-self:flex-start;position:relative}
h1::before{content:"";position:absolute;top:-18px;left:40px;width:130px;height:36px;background:${c.accent}77;transform:rotate(-6deg)}
.sub,footer{color:#6b5a48}
${BOXES}{background:#fffdf7;color:${ink};border-radius:2px;box-shadow:0 10px 20px #0002;position:relative}
.list li:nth-child(odd),.step:nth-child(odd){transform:rotate(-.8deg)}
.list li:nth-child(even),.step:nth-child(even){transform:rotate(.7deg)}
.card.hot{outline:none;border:3px dashed ${c.cta}}
.card.muted p{color:#8b7a66}
.num{background:none;border:3px dashed ${c.cta};color:${c.cta};border-radius:50%}
.tag,.card.hot .tag{color:${c.cta};border:3px solid ${c.cta};border-radius:50%;padding:6px 14px;align-self:flex-start;transform:rotate(-8deg)}
.stat{color:${c.cta}}
.bar-track{background:#fffdf7}
.button{background:${c.cta};color:#fffdf7;border-radius:4px;transform:rotate(-1.5deg)}
.art{border:16px solid #fffdf7;border-bottom-width:56px;border-radius:2px;transform:rotate(-3deg);box-shadow:0 18px 30px #0004}
.bubble.them{background:#fffdf7;color:${ink}}`;
    },
  },
};

export function designOf(id: string | undefined): Design {
  return (id && (DESIGN_IDS as readonly string[]).includes(id) ? DESIGNS[id as DesignId] : DESIGNS.classic) as Design;
}
