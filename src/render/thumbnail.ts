import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

import type { Channel } from "../config.ts";
import type { Project } from "../types.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A versus thumbnail at 1280x720: both products large and tilted toward a
 * VS badge, the names on colour tabs, a two-word headline with one word in
 * the channel's accent, and an optional sticker such as "+$100".
 */
export function thumbnailHtml(project: Project, channel: Channel): string {
  if (project.deepdive) return deepThumbnailHtml(project, channel);
  const { a, b, thumbnail } = project.versus!;
  const accent = channel.colors.accent;
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo" : "Inter";
  const headline = thumbnail?.headline ?? project.title;
  const highlight = thumbnail?.highlight?.trim();
  const words = esc(headline).replace(highlight ? esc(highlight) : "\u0000", `<b>${esc(highlight ?? "")}</b>`);

  return `<!doctype html><html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@900&family=Inter:wght@900&display=block">
<style>
*{box-sizing:border-box}body{margin:0}
#t{position:relative;width:1280px;height:720px;overflow:hidden;background:#09090b;font-family:${font}}
.g{position:absolute;border-radius:50%;width:900px;height:900px}
.ga{${arabic ? "right" : "left"}:-250px;top:-80px;background:radial-gradient(${a.color}99,transparent 62%)}
.gb{${arabic ? "left" : "right"}:-250px;top:-40px;background:radial-gradient(${b.color}aa,transparent 62%)}
.rays{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 62%,#ffffff07 0 6deg,transparent 6deg 14deg)}
.p{position:absolute;bottom:-30px;height:560px;max-width:560px;object-fit:contain;filter:drop-shadow(0 30px 40px #000) drop-shadow(0 0 26px #ffffff55) brightness(1.12)}
.pa{${arabic ? "right" : "left"}:40px;transform:rotate(${arabic ? 8 : -8}deg)}
.pb{${arabic ? "left" : "right"}:40px;transform:rotate(${arabic ? -8 : 8}deg)}
.lab{position:absolute;top:150px;font:900 40px Inter;direction:ltr;color:#fff;padding:4px 16px;border-radius:12px;white-space:nowrap}
.la{${arabic ? "right" : "left"}:40px;background:${a.color}}
.lb{${arabic ? "left" : "right"}:40px;background:${b.color}}
.vs{position:absolute;left:50%;top:400px;width:170px;height:170px;margin-left:-85px;border-radius:50%;display:grid;place-items:center;font:900 italic 84px Inter;color:#fff;
 background:linear-gradient(145deg,#ff6a3d,${accent} 55%,#a3001a);border:8px solid #fff;box-shadow:0 0 70px ${accent};z-index:3}
.h{position:absolute;left:0;right:0;top:-6px;text-align:center;font:900 ${arabic ? 128 : 118}px/1.1 ${font};color:#fff;-webkit-text-stroke:12px #000;paint-order:stroke fill;text-shadow:0 9px 0 #000;z-index:4;white-space:nowrap}
.h b{color:${accent}}
.tag{position:absolute;left:50%;top:250px;transform:translateX(-50%) rotate(-6deg);background:#ffd400;color:#000;font:900 60px Inter;padding:2px 26px;border-radius:16px;border:5px solid #000;box-shadow:0 9px 0 #000;direction:ltr;z-index:4}
</style></head><body><div id="t">
<div class="g ga"></div><div class="g gb"></div><div class="rays"></div>
${a.image ? `<img class="p pa" src="${a.image}">` : ""}${b.image ? `<img class="p pb" src="${b.image}">` : ""}
<div class="lab la">${esc(a.short)}</div><div class="lab lb">${esc(b.short)}</div>
<div class="vs">VS</div>
<div class="h">${words}</div>
${thumbnail?.tag ? `<div class="tag">${esc(thumbnail.tag)}</div>` : ""}

</div></body></html>`;
}

/**
 * A deep-dive thumbnail at 1280x720: the cover photo fills the frame, fading
 * to dark on the reading side, where a huge two-line headline sits with one
 * word in the channel's accent, plus an optional sticker such as "3nm".
 */
function deepThumbnailHtml(project: Project, channel: Channel): string {
  const { cover, thumbnail } = project.deepdive!;
  const accent = channel.colors.accent;
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo" : "Inter";
  const headline = thumbnail?.headline ?? project.title;
  const highlight = thumbnail?.highlight?.trim();
  const words = esc(headline).replace(highlight ? esc(highlight) : "\u0000", `<b>${esc(highlight ?? "")}</b>`);
  const side = arabic ? "right" : "left";
  const other = arabic ? "left" : "right";

  return `<!doctype html><html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@900&family=Inter:wght@900&display=block">
<style>
*{box-sizing:border-box}body{margin:0}
#t{position:relative;width:1280px;height:720px;overflow:hidden;background:#09090b;font-family:${font}}
.ph{position:absolute;top:0;bottom:0;${other}:0;width:860px;object-fit:cover;height:100%;filter:saturate(1.25) contrast(1.1) brightness(1.05)}
.ph.fit{top:80px;${other}:60px;width:560px;height:560px;object-fit:contain;filter:drop-shadow(0 20px 40px #000) brightness(1.1)}
.fit~.frame{width:640px}
.fade{position:absolute;inset:0;background:linear-gradient(to ${other},#09090b 30%,#09090bcc 48%,transparent 75%)}
.glow{position:absolute;${side}:-200px;top:-150px;width:800px;height:800px;border-radius:50%;background:radial-gradient(${accent}55,transparent 65%)}
.frame{position:absolute;${other}:26px;top:26px;bottom:26px;width:780px;border:6px solid ${accent};border-radius:28px;box-shadow:0 0 50px ${accent}aa, inset 0 0 40px #0008}
.h{position:absolute;${side}:50px;top:50%;transform:translateY(-55%);width:620px;font:900 ${arabic ? 122 : 112}px/1.08 ${font};color:#fff;-webkit-text-stroke:10px #000;paint-order:stroke fill;text-shadow:0 8px 0 #000}
.h b{color:${accent}}
.tag{position:absolute;${side}:56px;bottom:56px;background:#ffd400;color:#000;font:900 64px Inter;padding:2px 28px;border-radius:16px;border:5px solid #000;box-shadow:0 9px 0 #000;direction:ltr;transform:rotate(${arabic ? 4 : -4}deg)}
</style></head><body><div id="t">
${cover?.path ? `<img class="ph${cover.fit === "contain" ? " fit" : ""}" src="${cover.path}">` : ""}${cover?.fit === "contain" ? "" : '<div class="fade"></div>'}<div class="glow"></div><div class="frame"></div>
<div class="h">${words}</div>
${thumbnail?.tag ? `<div class="tag">${esc(thumbnail.tag)}</div>` : ""}
</div></body></html>`;
}

/** Writes thumbnail.html and renders it to thumbnail.png in the project folder. */
export async function renderThumbnail(project: Project, channel: Channel, dir: string): Promise<string> {
  const html = join(dir, "thumbnail.html");
  await writeFile(html, thumbnailHtml(project, channel));
  if (!existsSync(CHROME)) throw new Error("Google Chrome is needed to draw the thumbnail");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(`file://${html}`, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    const out = join(dir, "thumbnail.png");
    await page.screenshot({ path: out as `${string}.png` });
    return out;
  } finally {
    await browser.close();
  }
}
