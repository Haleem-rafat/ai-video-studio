import { alignWords } from "./align.ts";
import { postPictures, seeded, bdi, boxFor, esc, ICONS, iconFor, itemTimes, nextDays, phraseTimes, placeMarketing, r, saidAt, socialBadge, type Beat, type Ctx } from "./marketing-kit.ts";
import { ARABIC, karaoke } from "./arena.ts";
import { FULL_FRAME, MOTION, motionCss } from "./marketing-motion.ts";
import { cameraCuts, stepsOf } from "./marketing-pace.ts";
import type { MarketingItem, MarketingSetup, Project, Scene, SiteBrand } from "../types.ts";

/**
 * A marketing video in the brand's own look: its colours, fonts, logo and
 * real screenshots of its website. Every scene is one beat of the customer's
 * story (see MarketingBeat): a phone scrolling the brand's content, the
 * questions piling up in the inbox, a calm turning point, the page building
 * itself, a booking made and synced, visitors flowing in from posts, a
 * dashboard, the parts joined up, and a call-to-action button. Motion is
 * smooth and premium rather than loud; on-screen text is a few short
 * phrases that appear as they are spoken, plus optional subtitles.
 */


function journey({ s, k, B, brand, arabic, m }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const pw = B.short ? 430 : 330;
  const ph = Math.min(B.stageH - 20, pw * 2.05);
  const cx = B.W / 2;
  const top = (B.stageH - ph) / 2;
  const pictures = postPictures(m);
  const pic = (i: number) => pictures[i % Math.max(1, pictures.length)] ?? "";
  const comment = items.find((item) => item.value)?.value ?? (arabic ? "حد جربه قبل كده؟ 👀" : "Has anyone tried this? 👀");
  const cardW = B.short ? 290 : 300;
  const floats = items.map((item, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side < 0 ? cx - pw / 2 - (B.short ? 20 : 70) - cardW : cx + pw / 2 + (B.short ? 20 : 70);
    const y = top + 40 + Math.floor(i / 2) * (B.short ? 250 : 210) + (side > 0 ? (B.short ? 110 : 90) : 0);
    return `<div class="float" id="fl${k}_${i}" style="left:${x}px;top:${y}px;width:${cardW}px"><span class="ic">${iconFor(item.label)}</span><div>${bdi(item.label)}${item.value ? `<small>${bdi(item.value)}</small>` : ""}</div></div>`;
  });
  const tiles = Array.from({ length: 9 }, (_, i) => `<i style="background-image:url('${pic(i + 1)}')"></i>`).join("");
  const html = `<div class="phone" id="ph${k}" style="left:${cx - pw / 2}px;top:${top}px;width:${pw}px;height:${ph}px"><div class="scr">
    <div class="feed" id="fd${k}">
      <div class="post vid"><img src="${pic(0)}" /><b class="play">▶</b><div class="pmeta"><i class="av">${brand.logo ? `<img src="${brand.logo}" />` : ""}</i><span dir="ltr">@${esc(brand.name.toLowerCase().replace(/\s+/g, ""))}</span></div><div class="prog"><i id="pg${k}"></i></div></div>
      <div class="post"><img src="${pic(1)}" /></div>
      <div class="post"><img src="${pic(2)}" /></div>
    </div>
    <div class="heart" id="ht${k}">❤</div>
    <div class="cmt" id="cm${k}"><i class="av2"></i><span>${bdi(comment)}</span></div>
    <i class="rip" id="rp${k}"></i>
    <div class="profile" id="pf${k}"><div class="phead"><i class="av big">${brand.logo ? `<img src="${brand.logo}" />` : ""}</i><b>${esc(brand.name)}</b><div class="stats"><span></span><span></span><span></span></div></div><div class="tiles">${tiles}</div></div>
  </div></div>${floats.join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)};
  tl.fromTo('#ph${k}', { y: 90, scale: .92 }, { y: 0, scale: 1, duration: .7, ease: 'power3.out', immediateRender: false }, t - .3);
  tl.fromTo('#pg${k}', { scaleX: 0 }, { scaleX: 1, duration: D * .4, ease: 'none', immediateRender: false }, t);
  tl.to('#fd${k}', { y: -${Math.round(ph * 0.12)}, duration: D * .3, ease: 'power1.inOut' }, t + .3);
  tl.fromTo('#ht${k}', { opacity: 0, scale: 0 }, { opacity: 1, scale: 1.3, duration: .35, ease: 'back.out(3)', immediateRender: false }, t + D * .16);
  tl.to('#ht${k}', { opacity: 0, y: -80, scale: .8, duration: .6 }, t + D * .16 + .7);
  tl.fromTo('#cm${k}', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .45, ease: 'power3.out', immediateRender: false }, t + D * .26);
  tl.fromTo('#rp${k}', { opacity: .6, scale: 0 }, { opacity: 0, scale: 3, duration: .55, immediateRender: false }, t + D * .4);
  tl.set('#pf${k}', { yPercent: 100, visibility: 'visible' }, t + D * .42 - .01);
  tl.to('#pf${k}', { yPercent: 0, duration: .55, ease: 'power3.out' }, t + D * .42);
  tl.fromTo('#pf${k} .tiles i', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .3, stagger: .05, ease: 'back.out(2)', immediateRender: false }, t + D * .42 + .3);
  ${JSON.stringify(items.map((_, i) => i))}.forEach((i) => {
    const at = t + D * .5 + i * Math.min(.9, D * .4 / ${Math.max(1, items.length)});
    tl.fromTo('#fl${k}_' + i, { opacity: 0, scale: .4, x: (i % 2 ? -1 : 1) * 160, y: 60 }, { opacity: 1, scale: 1, x: 0, y: 0, duration: .55, ease: 'back.out(1.6)', immediateRender: false }, at);
    tl.to('#fl${k}_' + i, { y: -10, duration: 1.6, yoyo: true, repeat: Math.max(0, Math.floor((t + D - at) / 1.6)), ease: 'sine.inOut' }, at + .55);
  });
}`;
  return { html, js };
}

function pain({ s, k, B, brand, m, arabic, locale }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const times = itemTimes(s, 0.08, 0.7);
  // Senders in the brand's own colours, nothing from outside its palette.
  const hues = ["var(--accent)", "var(--cta)", "var(--muted)", "color-mix(in srgb, var(--accent) 55%, var(--cta))", "var(--text)"];
  const clock = (i: number) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(2026, 0, 1, 23, 12 + i * 9));
  const msgs = items
    .map((item, i) => `<div class="msg" id="mg${k}_${i}"><i class="who" style="background:${hues[i % hues.length]}"></i><div class="bub"><span class="typing" id="ty${k}_${i}"><b></b><b></b><b></b></span><span class="txt" id="tx${k}_${i}">${bdi(item.label)}</span></div><time>${clock(i)}</time></div>`)
    .join("");
  const html = `<div class="stage flex"><div class="chat" id="ch${k}" style="width:${B.short ? 900 : 1080}px">
    <div class="chathead"><i class="av">${brand.logo && !m.value ? `<img src="${brand.logo}" />` : ""}</i><b>${arabic ? "الرسايل" : "Messages"}</b><span class="badge" id="bd${k}">0</span></div>
    <div class="msgs">${msgs}</div></div></div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)};
  T.forEach((at, i) => {
    tl.fromTo('#mg${k}_' + i, { opacity: 0, y: 30, scale: .9 }, { opacity: 1, y: 0, scale: 1, duration: .35, ease: 'back.out(1.8)', immediateRender: false }, t + at - .55);
    tl.fromTo('#ty${k}_' + i + ' b', { y: 0 }, { y: -8, duration: .18, yoyo: true, repeat: 1, stagger: .09, immediateRender: false }, t + at - .5);
    tl.set('#ty${k}_' + i, { display: 'none' }, t + at);
    tl.fromTo('#tx${k}_' + i, { opacity: 0 }, { opacity: 1, duration: .2, immediateRender: false }, t + at);
    tl.set('#bd${k}', { textContent: ${arabic ? "(i + 1).toLocaleString('ar-EG')" : "String(i + 1)"} }, t + at);
    tl.fromTo('#bd${k}', { scale: 1.6 }, { scale: 1, duration: .3, ease: 'back.out(3)', immediateRender: false }, t + at);
  });
  ${items.length >= 3 ? `tl.fromTo('#ch${k} .msgs', { x: 0 }, { x: 8, duration: .06, yoyo: true, repeat: 7, ease: 'none', immediateRender: false }, t + D * .82);` : ""}
}`;
  return { html, js };
}

function turn({ s, k, B }: Ctx): Beat {
  const sentence = (s.visual.headline || s.visual.words.join(" ") || s.narration).trim();
  const words = sentence.split(/\s+/).filter(Boolean);
  const said = s.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(said, s.audio?.words ?? [], s.seconds);
  const at: number[] = [];
  let from = 0;
  words.forEach((word, i) => {
    const found = saidAt(s, word, times, said, from);
    const index = found === null ? -1 : times.indexOf(found, from);
    if (index >= 0) from = index + 1;
    at.push(r(Math.max(i ? at[i - 1] + 0.08 : 0.1, found ?? 0.2 + i * 0.16)));
  });
  const hot = Math.max(0, words.length - 2);
  const html = `<div class="turn" style="font-size:${B.short ? (words.length > 9 ? 66 : 88) : words.length > 10 ? 66 : 84}px"><p>${words
    .map((word, i) => `<span class="tw${i >= hot ? " hot" : ""}" id="tw${k}_${i}"${ARABIC.test(word) ? "" : ' dir="ltr"'}>${esc(word)}</span>`)
    .join(" ")}</p><i class="uline" id="ul${k}"></i></div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(at)};
  tl.to('#dim', { opacity: .55, duration: .8 }, t - .3);
  tl.to('#dim', { opacity: 0, duration: .6 }, t + D + .1);
  T.forEach((at, i) => tl.fromTo('#tw${k}_' + i, { opacity: 0, y: 30, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: .5, ease: 'power2.out', immediateRender: false }, t + at));
  tl.fromTo('#ul${k}', { scaleX: 0 }, { scaleX: 1, duration: .8, ease: 'power2.inOut', immediateRender: false }, t + T[T.length - 1] + .3);
  tl.fromTo('#sc${k} .turn', { scale: .96 }, { scale: 1.04, duration: D + .6, ease: 'none', immediateRender: false }, t - .3);
}`;
  return { html, js };
}

function booking({ s, k, B, brand, arabic, locale, m }: Ctx): Beat {
  const slots = (s.visual.items.length ? s.visual.items : ["10:00", "11:30", "13:00", "15:30", "17:00", "19:30"].map((label) => ({ label }))).slice(0, 6);
  const days = nextDays(new Date(), locale);
  const cals = s.seconds >= 8;
  const cx = B.W / 2;
  const bw = B.short ? 820 : 640;
  const button = s.visual.headline || m.brief.cta.label || (arabic ? "احجز معايا" : "Book with me");
  const pickedDay = days[1];
  const pickedSlot = slots[Math.min(1, slots.length - 1)].label;
  const cw = B.short ? 440 : 470;
  const hours = ["10", "11", "12", "1", "2", "3"];
  const cal = (id: string, title: string, busy: number) =>
    `<div class="cal" id="${id}" style="width:${cw}px"><div class="ct">${esc(title)}</div><div class="hrs">${hours.map((h, i) => `<div class="hr"><small>${h}</small>${i === busy ? `<i class="busy"></i>` : ""}</div>`).join("")}</div><div class="ev" id="${id}e"><b>${esc(brand.name)}</b><small>${bdi(`${pickedDay.day} · ${pickedSlot}`)}</small></div></div>`;
  const html = `<div class="book" id="bk${k}" style="left:${cx - bw / 2}px;top:${B.short ? 40 : 10}px;width:${bw}px">
    <div class="bhead">${brand.logo ? `<img src="${brand.logo}" />` : ""}<div><b>${esc(brand.name)}</b><small>${arabic ? "اختار المعاد اللي يناسبك" : "Pick a time that suits you"}</small></div></div>
    <div class="bbtn" id="bb${k}">${bdi(button)}<i class="rip"></i></div>
    <div class="days" id="dys${k}">${days.map((day, i) => `<div class="day" id="dy${k}_${i}"><small>${esc(day.day)}</small><b>${esc(day.date)}</b><i class="rip"></i></div>`).join("")}</div>
    <div class="slots" id="sls${k}">${slots.map((slot, i) => `<div class="slot" id="sl${k}_${i}">${bdi(slot.label)}<i class="rip"></i></div>`).join("")}</div>
    <div class="confirm" id="cf${k}">${arabic ? "تأكيد الحجز" : "Confirm booking"}<i class="rip"></i></div>
    <div class="done" id="dn${k}"><span class="ck">${ICONS.check}</span><b>${arabic ? "تم الحجز" : "Booked"}</b><small>${bdi(`${pickedDay.day} ${pickedDay.date} · ${pickedSlot}`)}</small></div>
  </div>
  ${cals ? `<div class="cals" id="cls${k}" style="top:${B.short ? 140 : 110}px">${cal(`ca${k}`, arabic ? "تقويمك ١" : "Calendar 1", 3)}<div class="sync" id="sy${k}">${ICONS.sync}</div>${cal(`cb${k}`, arabic ? "تقويمك ٢" : "Calendar 2", 4)}</div>` : ""}`;
  const end = cals ? 0.55 : 0.9;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, E = ${end};
  const tap = (sel, at) => tl.fromTo(sel + ' .rip', { opacity: .55, scale: 0 }, { opacity: 0, scale: 3.2, duration: .5, immediateRender: false }, at);
  tl.fromTo('#bk${k}', { y: 80, scale: .94 }, { y: 0, scale: 1, duration: .6, ease: 'power3.out', immediateRender: false }, t - .3);
  tl.to('#bb${k}', { scale: 1.05, duration: .5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, t + .1);
  tap('#bb${k}', t + D * E * .14);
  tl.to('#bb${k}', { scale: .94, duration: .08, yoyo: true, repeat: 1 }, t + D * E * .14);
  tl.fromTo('#dys${k} .day', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .3, stagger: .06, ease: 'back.out(2)', immediateRender: false }, t + D * E * .22);
  tap('#dy${k}_1', t + D * E * .38);
  tl.set('#dy${k}_1', { className: 'day sel' }, t + D * E * .38);
  tl.fromTo('#sls${k} .slot', { opacity: 0, scale: .8 }, { opacity: 1, scale: 1, duration: .28, stagger: .05, ease: 'back.out(2)', immediateRender: false }, t + D * E * .44);
  tap('#sl${k}_${Math.min(1, slots.length - 1)}', t + D * E * .62);
  tl.set('#sl${k}_${Math.min(1, slots.length - 1)}', { className: 'slot sel' }, t + D * E * .62);
  tl.fromTo('#cf${k}', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .3, immediateRender: false }, t + D * E * .68);
  tap('#cf${k}', t + D * E * .8);
  tl.fromTo('#dn${k}', { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(1.8)', immediateRender: false }, t + D * E * .86);
  tl.fromTo('#dn${k} .ck path', { strokeDashoffset: 30 }, { strokeDashoffset: 0, duration: .5, ease: 'power2.out', immediateRender: false }, t + D * E * .86 + .15);
  ${
    cals
      ? `tl.to('#bk${k}', { opacity: 0, scale: .85, y: -40, duration: .45, ease: 'power2.in' }, t + D * .56);
  tl.fromTo('#cls${k}', { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: .55, ease: 'power3.out', immediateRender: false }, t + D * .6);
  tl.fromTo('#ca${k}e', { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, duration: .4, ease: 'back.out(2)', immediateRender: false }, t + D * .68);
  tl.fromTo('#sy${k}', { rotation: 0, scale: 1 }, { rotation: 360 * 2, scale: 1.25, duration: 1.1, ease: 'power2.inOut', immediateRender: false }, t + D * .72);
  tl.to('#sy${k}', { scale: 1, duration: .3 }, t + D * .72 + 1.1);
  tl.fromTo('#cb${k}e', { opacity: 0, scaleY: 0 }, { opacity: 1, scaleY: 1, duration: .4, ease: 'back.out(2)', immediateRender: false }, t + D * .72 + 1);`
      : ""
  }
}`;
  return { html, js };
}

function traffic({ s, k, B, brand, example, arabic, m }: Ctx): Beat {
  const items = (s.visual.items.length ? s.visual.items : [{ label: "Instagram", value: "?from=reel" }, { label: "Facebook", value: "?from=post" }, { label: "TikTok", value: "?from=video" }]).slice(0, 3);
  const pictures = postPictures(m);
  const pw = B.short ? 270 : 250;
  const scrW = pw - 16;
  const phH = Math.round((scrW * 844) / 390);
  let posts: { x: number; y: number; w: number; h: number }[];
  let dest: { x: number; y: number };
  if (B.short) {
    const w = 300;
    posts = items.map((_, i) => ({ x: 60 + i * (w + 30), y: 0, w, h: 330 }));
    if (B.dir < 0) posts.reverse();
    dest = { x: B.W / 2 - pw / 2, y: B.stageH - phH - 30 };
  } else {
    const w = 420;
    const x = B.dir < 0 ? B.W - 140 - w : 140;
    posts = items.map((_, i) => ({ x, y: 30 + i * 230, w, h: 200 }));
    dest = { x: B.dir < 0 ? 200 : B.W - 200 - pw, y: (B.stageH - phH - 16) / 2 };
  }
  const target = { x: dest.x + pw / 2, y: dest.y + phH * 0.3 };
  const dots: string[] = [];
  const paths: number[][] = [];
  posts.forEach((post, i) => {
    const from = B.short ? { x: post.x + post.w / 2, y: post.y + post.h } : { x: B.dir < 0 ? post.x : post.x + post.w, y: post.y + post.h / 2 };
    for (let j = 0; j < 7; j++) {
      dots.push(`<i class="dot" id="dt${k}_${i}_${j}" style="left:${from.x - 9}px;top:${from.y - 9}px"></i>`);
      paths.push([i, j, r(target.x - from.x), r(target.y - from.y)]);
    }
  });
  const html = `${items
    .map((item, i) => {
      const box = posts[i];
      return `<div class="pcard${B.short ? "" : " wide"}" id="po${k}_${i}" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"><div class="pic" style="background-image:url('${pictures[i % Math.max(1, pictures.length)] ?? ""}')"></div><div class="pinfo">${socialBadge(`${item.label} ${item.value ?? ""}`, "pl") || `<span class="pl">${esc(item.label.trim()[0] ?? "•")}</span>`}<b>${esc(item.label)}</b><code dir="ltr" id="lk${k}_${i}">${esc(item.value ?? "")}</code></div></div>`;
    })
    .join("")}
  <div class="phone sm" id="ds${k}" style="left:${dest.x}px;top:${dest.y}px;width:${pw}px;height:${phH + 16}px"><div class="scr minip">${brand.logo ? `<img src="${brand.logo}" />` : "<i></i>"}<b>${esc(brand.name)}</b><i class="mp1"></i><i class="mp2"></i><i class="mp3"></i><i class="mpb"></i></div><div class="cnt" id="cn${k}"><b id="cv${k}">0</b><small>${arabic ? "زيارة" : "visits"}${example ? (arabic ? " · مثال" : " · example") : ""}</small></div></div>
  ${dots.join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, P = ${JSON.stringify(paths)};
  for (let i = 0; i < ${items.length}; i++) {
    tl.fromTo('#po${k}_' + i, { opacity: 0, y: 50, scale: .9 }, { opacity: 1, y: 0, scale: 1, duration: .5, ease: 'back.out(1.6)', immediateRender: false }, t + i * D * .08);
    tl.fromTo('#lk${k}_' + i, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: .35, immediateRender: false }, t + D * .2 + i * .25);
  }
  tl.fromTo('#ds${k}', { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: .55, ease: 'power3.out', immediateRender: false }, t + D * .25);
  P.forEach(([i, j, dx, dy]) => {
    const at = t + D * .35 + j * D * .07 + i * .18;
    tl.fromTo('#dt${k}_' + i + '_' + j, { opacity: 0, x: 0, y: 0, scale: .5 }, { opacity: 1, scale: 1, duration: .15, immediateRender: false }, at);
    tl.to('#dt${k}_' + i + '_' + j, { x: dx, y: dy, duration: .9, ease: 'power2.in' }, at);
    tl.to('#dt${k}_' + i + '_' + j, { opacity: 0, scale: .2, duration: .15 }, at + .85);
  });
  ${example ? `const N = 21; for (let n = 1; n <= N; n++) tl.set('#cv${k}', { textContent: ${arabic ? "(n * 7).toLocaleString('ar-EG')" : "String(n * 7)"} }, t + D * .35 + .9 + n * (D * .5 / N));` : ""}
  ${example ? `tl.fromTo('#cn${k}', { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .4, ease: 'back.out(2)', immediateRender: false }, t + D * .35 + .8);` : ""}
}`;
  return { html, js };
}

function dashboard({ s, k, B, brand, example, arabic }: Ctx): Beat {
  const items = s.visual.items.slice(0, 5);
  const values = items.map((item) => Number(String(item.value ?? "").replace(/[^\d.]/g, "")) || 0);
  const max = Math.max(1, ...values);
  const best = values.indexOf(Math.max(...values));
  // The page's parts, not the website's own headings.
  const sections = (arabic ? ["خدماتك", "آراء عملائك", "قصتك"] : ["Your services", "Client reviews", "Your story"]).map((label) => ({ label }));
  const times = itemTimes(s, 0.12, 0.55);
  const html = `<div class="stage flex"><div class="dash" id="db${k}" style="width:${B.short ? 940 : 1240}px">
    <div class="dhead">${brand.logo ? `<img src="${brand.logo}" />` : ""}<b>${bdi(s.visual.headline || (arabic ? "لوحة الأرقام" : "Your dashboard"))}</b>${example ? `<span class="ex">${arabic ? "أرقام توضيحية" : "Example numbers"}</span>` : ""}</div>
    <div class="dgrid${B.short ? " col" : ""}">
      <div class="dcol"><h4>${arabic ? "الزيارات جاية منين" : "Where visits come from"}</h4>${items
        .map(
          (item, i) =>
            `<div class="brow${i === best ? " best" : ""}" id="br${k}_${i}"><span class="bl">${socialBadge(item.label)}<bdi>${esc(item.label)}</bdi></span><div class="btrack"><i id="bi${k}_${i}" style="--w:${r(values[i] / max)}"></i></div><b class="bv" id="bv${k}_${i}">0%</b></div>`,
        )
        .join("")}</div>
      ${sections.length ? `<div class="dcol"><h4>${arabic ? "أكتر أقسام اتشافت" : "Most viewed sections"}</h4>${sections.map((shot, i) => `<div class="srow" id="sr${k}_${i}"><bdi>${esc(shot.label)}</bdi><div class="btrack thin"><i style="--w:${[0.92, 0.68, 0.45][i]}"></i></div></div>`).join("")}</div>` : ""}
    </div></div></div>`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, T = ${JSON.stringify(times)}, V = ${JSON.stringify(values)};
  tl.fromTo('#db${k}', { y: 70, rotationX: 12, transformPerspective: 1400 }, { y: 0, rotationX: 0, duration: .7, ease: 'power3.out', immediateRender: false }, t - .3);
  T.forEach((at, i) => {
    tl.fromTo('#br${k}_' + i, { opacity: 0, x: ${B.dir * -40} }, { opacity: 1, x: 0, duration: .35, immediateRender: false }, t + at);
    tl.fromTo('#bi${k}_' + i, { scaleX: 0 }, { scaleX: 1, duration: .9, ease: 'power2.out', immediateRender: false }, t + at + .1);
    for (let n = 1; n <= 8; n++) tl.set('#bv${k}_' + i, { textContent: ${arabic ? "Math.round(V[i] * n / 8).toLocaleString('ar-EG') + '٪'" : "Math.round(V[i] * n / 8) + '%'"} }, t + at + .1 + n * .1);
  });
  tl.fromTo('#db${k} .srow', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .3, stagger: .15, immediateRender: false }, t + D * .45);
  tl.fromTo('#db${k} .srow i', { scaleX: 0 }, { scaleX: 1, duration: .7, stagger: .15, ease: 'power2.out', immediateRender: false }, t + D * .45);
  ${items.length ? `tl.fromTo('#br${k}_${best}', { scale: 1, boxShadow: '0 0 0 0 rgba(0,0,0,0)' }, { scale: 1.04, boxShadow: '0 0 0 3px var(--cta), 0 0 40px var(--cta)', duration: .45, ease: 'back.out(2)', immediateRender: false }, t + D * .72);` : ""}
}`;
  return { html, js };
}

function recap({ s, k, B, brand, arabic, m }: Ctx): Beat {
  const labels = s.visual.items.length ? s.visual.items.map((item) => item.label) : arabic ? ["صفحتك", "الحجوزات", "الأرقام"] : ["Your page", "Bookings", "Insights"];
  const nodes = labels.slice(0, 3);
  const icons = [ICONS.page, ICONS.calendar, ICONS.chart];
  const cx = B.W / 2;
  const nw = B.short ? 640 : 400;
  const nh = B.short ? 190 : 230;
  const pos = nodes.map((_, i) =>
    B.short ? { x: cx - nw / 2, y: 70 + i * (nh + 110) } : { x: cx - nw / 2 + (i - (nodes.length - 1) / 2) * (nw + 120) * B.dir, y: (B.stageH - nh) / 2 },
  );
  const links = nodes.slice(1).map((_, i) => {
    const a = pos[i];
    const b = pos[i + 1];
    if (B.short) return `<i class="link v" id="lk${k}_${i}" style="left:${cx - 3}px;top:${a.y + nh + 15}px;height:${b.y - a.y - nh - 30}px"></i>`;
    const left = Math.min(a.x, b.x) + nw + 15;
    return `<i class="link h${B.dir < 0 ? " rtl" : ""}" id="lk${k}_${i}" style="left:${left}px;top:${a.y + nh / 2 - 3}px;width:${Math.abs(b.x - a.x) - nw - 30}px"></i>`;
  });
  const shots = postPictures(m).slice(0, 3);
  const html = `${shots.map((shot, i) => `<div class="mont" id="mo${k}_${i}" style="background-image:url('${shot}')"></div>`).join("")}
  ${nodes.map((label, i) => `<div class="node" id="nd${k}_${i}" style="left:${pos[i].x}px;top:${pos[i].y}px;width:${nw}px;height:${nh}px"><span class="nic">${icons[i]}</span>${bdi(label)}</div>`).join("")}
  ${links.join("")}`;
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, M = ${shots.length}, N = ${nodes.length};
  for (let i = 0; i < M; i++) {
    const at = t - .3 + i * (D / Math.max(1, M));
    tl.fromTo('#mo${k}_' + i, { opacity: 0, scale: 1.12 }, { opacity: .22, scale: 1, duration: .8, immediateRender: false }, at);
    tl.to('#mo${k}_' + i, { opacity: 0, duration: .6 }, at + D / Math.max(1, M) + .2);
  }
  for (let i = 0; i < N; i++) {
    const at = t + D * (.1 + i * .22);
    tl.fromTo('#nd${k}_' + i, { opacity: 0, scale: .7, y: 40 }, { opacity: 1, scale: 1, y: 0, duration: .5, ease: 'back.out(1.7)', immediateRender: false }, at);
    tl.fromTo('#nd${k}_' + i + ' .nic', { rotation: -20, scale: .5 }, { rotation: 0, scale: 1, duration: .5, ease: 'back.out(3)', immediateRender: false }, at + .1);
    if (i) tl.fromTo('#lk${k}_' + (i - 1), { opacity: 1, ${B.short ? "scaleY" : "scaleX"}: 0 }, { opacity: 1, ${B.short ? "scaleY" : "scaleX"}: 1, duration: .4, ease: 'power2.inOut', immediateRender: false }, at - .3);
  }
  tl.to('#sc${k} .node', { boxShadow: '0 0 0 2px var(--accent), 0 20px 60px rgba(0,0,0,.4)', duration: .4, stagger: .12 }, t + D * .8);
}`;
  return { html, js };
}

function cta({ s, k, B, brand, m, arabic, next }: Ctx): Beat {
  const label = s.visual.headline || m.brief.cta.label || brand.cta?.label || (arabic ? "احجز دلوقتي" : "Book now");
  const link = (m.brief.cta.url || brand.cta?.url || brand.url).replace(/^https?:\/\//, "").replace(/\/$/, "");
  const where = m.brief.platforms.some((p) => /youtube|يوتيوب/i.test(p)) && !B.short ? (arabic ? "اللينك تحت الفيديو" : "Link below the video") : arabic ? "اللينك في البايو" : "Link in bio";
  // Value content signs off with the question and the brand, never a link.
  const html = `<div class="ctaw">
    ${brand.logo ? `<img class="clogo" id="cl${k}" src="${brand.logo}" />` : ""}
    <div class="cname" id="cnm${k}">${esc(brand.name)}</div>
    <div class="cbtn" id="cb${k}">${bdi(label)}<i class="shine" id="sh${k}"></i></div>
    ${m.value ? "" : `<div class="arrow" id="ar${k}">${ICONS.arrow}</div>
    <div class="curl" dir="ltr" id="cu${k}">${esc(link)}</div>
    <div class="where" id="wh${k}">${esc(where)}</div>`}
  </div>`;
  const until = next ?? "TOTAL";
  const js = `{
  const t = ${s.start}, D = ${r(s.seconds)}, END = ${until};
  tl.fromTo('#cl${k}', { opacity: 0, scale: .4, rotation: -20 }, { opacity: 1, scale: 1, rotation: 0, duration: .6, ease: 'back.out(2)', immediateRender: false }, t - .2);
  tl.fromTo('#cnm${k}', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .4, immediateRender: false }, t + .1);
  tl.fromTo('#cb${k}', { opacity: 0, scale: .5 }, { opacity: 1, scale: 1, duration: .6, ease: 'elastic.out(1, .55)', immediateRender: false }, t + .3);
  for (let at = t + 1.2; at < END - .8; at += 2.2) {
    tl.fromTo('#sh${k}', { xPercent: -150 }, { xPercent: 250, duration: .8, ease: 'power2.inOut', immediateRender: false }, at);
    tl.to('#cb${k}', { scale: 1.05, duration: .35, yoyo: true, repeat: 1, ease: 'sine.inOut' }, at + .6);
  }
${
    m.value
      ? ""
      : `  tl.fromTo(['#ar${k}', '#cu${k}', '#wh${k}'], { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .4, stagger: .15, immediateRender: false }, t + D * .4);
  tl.to('#ar${k}', { y: 22, duration: .45, yoyo: true, repeat: Math.max(1, Math.floor((END - t - D * .4) / .45)), ease: 'sine.inOut' }, t + D * .4 + .4);`
  }
}`;
  return { html, js };
}

const BEATS = { journey, pain, turn, booking, traffic, dashboard, recap, cta, ...MOTION };

function fontsLink(brand: SiteBrand, arabic: boolean): string {
  const wanted = [brand.fonts.heading, brand.fonts.body].filter((font, i, all) => font && all.indexOf(font) === i && brand.googleFonts.includes(font));
  const families = [...wanted, arabic ? "Cairo" : "Inter", "IBM Plex Mono"].map((font) => `family=${font.replace(/\s+/g, "+")}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=block`;
}

/**
 * One caption word as HTML. An English word or number runs left to right with
 * its punctuation kept outside, so «2:» in an Arabic line reads «2:», not «:2».
 */
export function captionWord(word: string): string {
  if (ARABIC.test(word)) return esc(word);
  const [, core, mark] = word.match(/^(.*?)([.,،:؛؟?!…]*)$/)!;
  return `<bdi dir="ltr">${esc(core)}</bdi>${esc(mark)}`;
}

/** Beats whose picture is a device or the real page: no photo behind them, the screen is the picture. */
const DEVICE_BEATS = ["journey", "page", "booking", "traffic", "dashboard"];

/** Beats whose picture is already the words: no extra on-screen phrases. */
const wordless = (beat: string) => ["turn", "cta", "kinetic", "sting", "stat"].includes(beat);

/** The HyperFrames composition of a marketing video. */
export function buildMarketing(project: Project): string {
  const m = project.marketing;
  if (!m) throw new Error("This project has no brand to market");
  const brand = m.brand;
  const arabic = m.language === "ar";
  // Western digits on screen in Arabic too, the same as the captions and the script, never "1" beside "٩:٤١".
  const locale = arabic ? "ar-EG-u-nu-latn" : "en-US";
  const B = boxFor(project, m.captions, arabic);
  const { scenes, outro, total } = placeMarketing(project);
  const c = brand.colors;
  const head = `'${brand.fonts.heading}', ${arabic ? "Cairo" : "Inter"}, sans-serif`;
  const body = `'${brand.fonts.body}', ${arabic ? "Cairo" : "Inter"}, sans-serif`;
  const example = m.brief.data !== "real";

  // Each scene's own picture drifts behind it; device scenes keep theirs faint so the screen leads.
  const blocks: string[] = [];
  const scripts: string[] = [];
  const captions: string[] = [];
  const timeline: { start: number; dur: number; next: number | null; chips: number[]; lines: number[][]; cuts: number[]; step: number | null }[] = [];
  const steps = stepsOf(scenes);
  const stepTotal = steps.find(Boolean)?.total ?? 0;
  scenes.forEach((s, k) => {
    const next = scenes[k + 1]?.start ?? null;
    // The website is shown once: a later page scene tells its words over the scene's own art instead.
    const repeatPage = s.visual.beat === "page" && scenes.slice(0, k).some((earlier) => earlier.visual.beat === "page");
    const shown = repeatPage ? "kinetic" : s.visual.beat;
    const beat = BEATS[shown] ?? turn;
    const { html, js } = beat({ s, k, B, brand, m, arabic, locale, next, example });
    // Every scene's title sits in the same place at the top; only scenes whose picture is the words themselves have none.
    const own = ["turn", "cta", ...FULL_FRAME.filter((beat) => beat !== "stat")].includes(shown) || !s.visual.headline;
    const chips = s.visual.words.slice(0, 3);
    // The video has one background (#vbg), so scenes draw none and no objects float in: it reads as one piece.
    const photo = null;
    const object = null;
    blocks.push(`<section class="sc b-${shown}" id="sc${k}"><div class="cam" id="cm${k}">
      ${photo ? `<div class="scbg${DEVICE_BEATS.includes(shown) ? " faint" : ""}"><img src="${photo}" /></div>` : ""}
      ${object ? `<img class="obj" id="ob${k}" src="${object}" />` : ""}
      ${own ? "" : `<h2 class="hd">${bdi(s.visual.headline)}</h2>`}
      <div class="stage">${html}</div>
      ${chips.length && !wordless(shown) ? `<div class="chips">${chips.map((word, j) => `<span class="chip" id="w${k}_${j}">${bdi(word)}</span>`).join("")}</div>` : ""}
    </div></section>`);
    scripts.push(js);
    // Captions of 2-4 words, the word being said lit up; the camera moves on every phrase.
    const spoken = karaoke(s, B.short ? 3 : 5);
    const lines = m.captions ? spoken : [];
    lines.forEach((line, j) => captions.push(`<div class="cap" id="cp${k}_${j}"><div>${line.words.map((word) => `<span class="w">${captionWord(word)}</span>`).join(" ")}</div></div>`));
    timeline.push({ start: s.start, dur: r(s.seconds), next, chips: wordless(shown) ? [] : phraseTimes(s).slice(0, chips.length), lines: lines.map((line) => line.at), cuts: cameraCuts(spoken.map((line) => line.at[0]), s.seconds), step: steps[k]?.n ?? null });
  });

  // The whole video's background: the first picture drawn for it (older projects drew one per scene).
  const videoBackdrop = scenes.find((s) => s.visual.backdrop?.path)?.visual.backdrop?.path ?? null;

  const prnd = seeded(41);
  const particles = Array.from({ length: 22 }, (_, i) => {
    const size = r(8 + prnd() * 34);
    const far = prnd() < 0.45;
    return `<i class="p${i % 3}" style="left:${r(prnd() * B.W)}px;top:${r(prnd() * B.H)}px;width:${size}px;height:${size}px;opacity:${r(far ? 0.12 + prnd() * 0.12 : 0.25 + prnd() * 0.25)};${far ? "filter:blur(3px);" : ""}"></i>`;
  }).join("");
  const audio = scenes
    .filter((s) => s.audio)
    .map((s, k) => `<audio id="a${k}" data-start="${s.start}" data-duration="${r(s.seconds)}" data-track-index="2" src="${s.audio!.path}"></audio>`)
    .join("\n");

  return `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${B.W}, height=${B.H}" />
<title>${esc(project.title)}</title>
<link rel="stylesheet" href="${fontsLink(brand, arabic)}" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  :root { --bg: ${c.background}; --panel: ${c.panel}; --text: ${c.text}; --accent: ${c.accent}; --cta: ${c.cta}; --muted: ${c.muted}; --head: ${head}; --body: ${body}; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); }
  bdi { unicode-bidi: isolate; }
  #root { position: relative; width: ${B.W}px; height: ${B.H}px; overflow: hidden; font-family: var(--body); color: var(--text); background: var(--bg); }
  svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  /* The brand's own background: soft colour that keeps drifting. */
  #bg { position: absolute; inset: 0; overflow: hidden; }
  .blob { position: absolute; border-radius: 50%; filter: blur(${B.short ? 110 : 120}px); opacity: .35; }
  .b1 { width: ${B.W * 0.8}px; height: ${B.W * 0.8}px; background: var(--accent); top: -${B.W * 0.3}px; ${arabic ? "right" : "left"}: -${B.W * 0.2}px; }
  .b2 { width: ${B.W * 0.6}px; height: ${B.W * 0.6}px; background: var(--cta); bottom: -${B.W * 0.25}px; ${arabic ? "left" : "right"}: -${B.W * 0.15}px; opacity: .22; }
  .b3 { width: ${B.W * 0.5}px; height: ${B.W * 0.5}px; background: var(--panel); top: 40%; left: 30%; opacity: .6; }
  .dots { position: absolute; inset: 0; opacity: .12; background-image: radial-gradient(var(--muted) 1.2px, transparent 1.4px); background-size: 34px 34px; }
  #dim { position: absolute; inset: 0; background: #000; opacity: 0; z-index: 2; }

  #brandbar { position: absolute; top: ${B.short ? 70 : 36}px; ${arabic ? "right" : "left"}: ${B.short ? 50 : 50}px; z-index: 40; display: flex; align-items: center; gap: 14px; opacity: 0; }
  #brandbar img { width: ${B.short ? 58 : 48}px; height: ${B.short ? 58 : 48}px; border-radius: 14px; object-fit: contain; }
  #brandbar span { font: 700 ${B.short ? 38 : 32}px var(--head); letter-spacing: .3px; }

  .sc { position: absolute; inset: 0; z-index: 10; opacity: 0; }
  .hd { position: absolute; top: ${B.headTop}px; left: 60px; right: 60px; margin: 0; text-align: center; font: 700 ${B.short ? 64 : 56}px/1.2 var(--head); text-shadow: 0 4px 30px #0006; }
  .stage { position: absolute; left: 0; top: ${B.stageTop}px; width: ${B.W}px; height: ${B.stageH}px; }
  .stage .stage { top: 0; }
  .stage.flex { display: flex; align-items: center; justify-content: center; }
  .chips { position: absolute; top: ${B.chipsTop}px; left: 40px; right: 40px; display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
  .chip { opacity: 0; font: 700 ${B.short ? 46 : 38}px var(--head); padding: 10px 30px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--accent); border: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: 0 10px 30px #0004; }

  /* Devices. */
  .phone { position: absolute; border-radius: ${B.short ? 58 : 46}px; background: #0b0b12; padding: 10px; box-shadow: 0 40px 90px #000a, inset 0 0 0 2px #ffffff22; }
  .phone.sm { padding: 8px; border-radius: 40px; opacity: 0; }
  .phone .scr { position: relative; width: 100%; height: 100%; border-radius: ${B.short ? 48 : 38}px; overflow: hidden; background: var(--bg); }
  .phone.sm .scr { border-radius: 32px; }

  /* journey */
  .feed { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px; }
  .post { position: relative; flex: none; height: 62%; overflow: hidden; background: var(--panel); }
  .post img { width: 100%; height: 100%; object-fit: cover; }
  .post .play { position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); font-size: ${B.short ? 70 : 54}px; color: #fffd; text-shadow: 0 0 30px #0008; }
  .pmeta { position: absolute; bottom: 30px; ${arabic ? "right" : "left"}: 20px; display: flex; align-items: center; gap: 10px; font: 600 ${B.short ? 26 : 20}px var(--body); text-shadow: 0 2px 8px #000; }
  .av { display: inline-block; width: ${B.short ? 52 : 40}px; height: ${B.short ? 52 : 40}px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; overflow: hidden; } .av img { width: 100%; height: 100%; object-fit: contain; background: var(--bg); }
  .av.big { width: ${B.short ? 120 : 90}px; height: ${B.short ? 120 : 90}px; }
  .prog { position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: #fff3; } .prog i { display: block; height: 100%; background: var(--cta); transform-origin: left; transform: scaleX(0); }
  .heart { position: absolute; top: 34%; left: 50%; margin-left: -60px; width: 120px; text-align: center; font-size: 120px; line-height: 1; color: var(--cta); opacity: 0; text-shadow: 0 0 40px var(--cta); }
  .cmt { position: absolute; left: 14px; right: 14px; top: 52%; display: flex; gap: 10px; align-items: center; padding: 14px 16px; border-radius: 20px; background: #000b; backdrop-filter: blur(10px); font: 500 ${B.short ? 26 : 20}px var(--body); opacity: 0; }
  .av2 { flex: none; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); }
  .rip { position: absolute; width: 90px; height: 90px; margin: -45px 0 0 -45px; border-radius: 50%; background: #fff; opacity: 0; pointer-events: none; }
  .phone .rip { top: 62%; ${arabic ? "right" : "left"}: 60px; }
  .profile { position: absolute; inset: 0; background: var(--bg); visibility: hidden; padding: 40px 14px 14px; }
  .phead { display: flex; flex-direction: column; align-items: center; gap: 10px; font: 700 ${B.short ? 34 : 26}px var(--head); margin-bottom: 18px; }
  .stats { display: flex; gap: 14px; } .stats span { width: 70px; height: 12px; border-radius: 6px; background: var(--panel); }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; } .tiles i { opacity: 0; aspect-ratio: .8; background: var(--panel) center / cover; border-radius: 6px; }
  .float { position: absolute; opacity: 0; display: flex; align-items: center; gap: 14px; padding: 16px 20px; border-radius: 22px; background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1.5px solid color-mix(in srgb, var(--accent) 35%, transparent); box-shadow: 0 24px 60px #0008; font: 600 ${B.short ? 30 : 26}px var(--body); }
  .float small { display: block; font-size: .75em; color: var(--muted); font-weight: 400; margin-top: 4px; }
  .float .ic { flex: none; width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; background: color-mix(in srgb, var(--accent) 20%, transparent); color: var(--accent); }
  .float .ic svg { width: 30px; height: 30px; }

  /* pain */
  .chat { border-radius: 34px; background: color-mix(in srgb, var(--panel) 94%, transparent); box-shadow: 0 40px 90px #0009; padding: 26px; border: 1.5px solid #ffffff14; }
  .chathead { display: flex; align-items: center; gap: 16px; font: 700 ${B.short ? 40 : 34}px var(--head); padding-bottom: 18px; border-bottom: 1.5px solid #ffffff14; margin-bottom: 20px; }
  .badge { margin-inline-start: auto; min-width: 56px; height: 56px; padding: 0 14px; border-radius: 28px; background: var(--cta); color: #1a0d07; display: grid; place-items: center; font: 700 30px var(--body); }
  .msgs { display: flex; flex-direction: column; gap: 18px; }
  .msg { display: flex; align-items: flex-end; gap: 14px; opacity: 0; }
  .who { flex: none; width: 54px; height: 54px; border-radius: 50%; }
  .bub { position: relative; padding: 18px 26px; border-radius: 28px; border-end-start-radius: 8px; background: #ffffff12; font: 500 ${B.short ? 40 : 42}px/1.35 var(--body); min-width: 140px; }
  .typing { display: inline-flex; gap: 8px; } .typing b { width: 12px; height: 12px; border-radius: 50%; background: var(--muted); display: block; }
  .txt { opacity: 0; } .msg time { font: 400 22px var(--body); color: var(--muted); }

  /* turn */
  .b-turn .stage, .b-cta .stage { top: 0; height: ${B.H}px; display: flex; align-items: center; justify-content: center; }
  .turn { position: relative; max-width: ${B.short ? 900 : 1440}px; padding: 0 20px; text-align: center; font-family: var(--head); font-weight: 700; line-height: 1.35; z-index: 3; }
  .turn p { margin: 0; } .tw { display: inline-block; opacity: 0; } .tw.hot { color: var(--accent); }
  .uline { display: block; height: 8px; width: 40%; margin: 34px auto 0; border-radius: 4px; background: linear-gradient(90deg, var(--accent), var(--cta)); transform-origin: center; transform: scaleX(0); }

  /* booking */
  .book { position: absolute; border-radius: 34px; background: var(--panel); padding: 34px; box-shadow: 0 40px 100px #000a; border: 1.5px solid #ffffff14; }
  .bhead { display: flex; align-items: center; gap: 18px; margin-bottom: 26px; } .bhead img { width: 72px; height: 72px; border-radius: 18px; object-fit: contain; background: var(--bg); }
  .bhead b { display: block; font: 700 ${B.short ? 42 : 34}px var(--head); } .bhead small { font: 400 ${B.short ? 28 : 22}px var(--body); color: var(--muted); }
  .bbtn, .confirm { position: relative; overflow: hidden; text-align: center; font: 700 ${B.short ? 38 : 32}px var(--body); padding: 20px; border-radius: 999px; background: var(--cta); color: #1a0d07; }
  .confirm { margin-top: 24px; opacity: 0; }
  .bbtn .rip, .confirm .rip, .day .rip, .slot .rip { top: 50%; left: 50%; background: #fff; }
  .days { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin: 26px 0 18px; }
  .day { position: relative; overflow: hidden; opacity: 0; text-align: center; padding: 14px 4px; border-radius: 18px; background: #ffffff0d; border: 2px solid #ffffff14; }
  .day small { display: block; font: 400 ${B.short ? 22 : 17}px var(--body); color: var(--muted); } .day b { font: 700 ${B.short ? 28 : 22}px var(--body); }
  .day.sel, .slot.sel { background: color-mix(in srgb, var(--accent) 25%, transparent); border-color: var(--accent); }
  .slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .slot { position: relative; overflow: hidden; opacity: 0; text-align: center; padding: 16px 6px; border-radius: 16px; background: #ffffff0d; border: 2px solid #ffffff14; font: 600 ${B.short ? 30 : 24}px var(--body); }
  .slot.sel { background: var(--cta); color: #1a0d07; border-color: var(--cta); }
  .done { position: absolute; inset: 0; border-radius: 34px; background: var(--panel); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; opacity: 0; }
  .done .ck { width: 150px; height: 150px; border-radius: 50%; background: var(--accent); color: var(--bg); display: grid; place-items: center; box-shadow: 0 0 60px var(--accent); }
  .done .ck svg { width: 90px; height: 90px; stroke-width: 3; stroke-dasharray: 30; }
  .done b { font: 700 ${B.short ? 60 : 50}px var(--head); } .done small { font: 500 ${B.short ? 32 : 26}px var(--body); color: var(--muted); }
  .cals { position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 30px; opacity: 0; direction: ltr; }
  .cal { position: relative; border-radius: 28px; background: var(--text); color: var(--bg); padding: 22px; box-shadow: 0 40px 90px #000a; }
  .ct { font: 700 30px var(--head); margin-bottom: 12px; direction: ${arabic ? "rtl" : "ltr"}; }
  .hr { position: relative; height: ${B.short ? 82 : 76}px; border-top: 1.5px solid #e4e4ea; } .hr small { font: 400 18px var(--body); color: #999; }
  .busy { position: absolute; left: 50px; right: 10px; top: 6px; bottom: 6px; border-radius: 10px; background: #e8e8ef; }
  .ev { position: absolute; left: 72px; right: 32px; top: ${12 + 22 + 42 + (B.short ? 82 : 76) * 1 + 6}px; height: ${(B.short ? 82 : 76) - 12}px; border-radius: 12px; background: var(--cta); color: #1a0d07; padding: 8px 14px; opacity: 0; transform-origin: top; direction: ${arabic ? "rtl" : "ltr"}; }
  .ev b { display: block; font: 700 22px var(--body); } .ev small { font: 500 18px var(--body); }
  .sync { width: 96px; height: 96px; border-radius: 50%; background: var(--accent); color: var(--bg); display: grid; place-items: center; box-shadow: 0 0 50px var(--accent); }
  .sync svg { width: 56px; height: 56px; stroke-width: 2.4; }

  /* traffic */
  .pcard { position: absolute; opacity: 0; border-radius: 26px; overflow: hidden; background: var(--panel); box-shadow: 0 30px 70px #0009; border: 1.5px solid #ffffff14; display: flex; flex-direction: column; }
  .pcard.wide { flex-direction: row; }
  .pic { flex: 1; background: center / cover; } .pcard.wide .pic { flex: none; width: 42%; }
  .pinfo { padding: 16px; display: flex; flex-direction: column; gap: 10px; } .pcard.wide .pinfo { justify-content: center; flex: 1; }
  .pinfo b { font: 700 ${B.short ? 30 : 28}px var(--head); }
  .pl { width: 50px; height: 50px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--accent), var(--cta)); font: 700 28px Inter, sans-serif; }
  .pl svg { width: 30px; height: 30px; }
  /* A platform's real icon beside its name. */
  .soc { flex: none; display: inline-grid; place-items: center; width: 1.3em; height: 1.3em; border-radius: 28%; vertical-align: middle; margin-inline-end: .35em; }
  .soc svg { width: 72%; height: 72%; }
  .bl { display: flex; align-items: center; }
  .pinfo code { opacity: 0; font: 500 ${B.short ? 24 : 22}px 'IBM Plex Mono', monospace; color: var(--accent); background: #0005; padding: 6px 12px; border-radius: 10px; align-self: flex-start; }
  .dot { position: absolute; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 18px var(--accent); opacity: 0; z-index: 7; }
  /* The page the visitors land on, drawn rather than screenshotted. */
  .minip { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 40px 18px; }
  .minip img, .minip > i:first-child { width: 70px; height: 70px; border-radius: 18px; object-fit: contain; background: var(--panel); }
  .minip b { font: 700 26px var(--head); }
  .minip .mp1, .minip .mp2, .minip .mp3 { display: block; width: 100%; height: 70px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 20%, var(--panel)); }
  .minip .mp2 { height: 110px; background: color-mix(in srgb, var(--cta) 22%, var(--panel)); } .minip .mp3 { height: 50px; }
  .minip .mpb { display: block; width: 70%; height: 44px; border-radius: 999px; background: var(--cta); margin-top: auto; }
  .cnt { position: absolute; bottom: -34px; left: 50%; transform: translateX(-50%); background: var(--cta); color: #1a0d07; border-radius: 22px; padding: 10px 26px; text-align: center; white-space: nowrap; box-shadow: 0 20px 40px #0008; opacity: 0; }
  .cnt b { font: 700 46px var(--body); display: block; line-height: 1.1; } .cnt small { font: 600 20px var(--body); }

  /* dashboard */
  .dash { border-radius: 34px; background: var(--panel); padding: 34px 40px; box-shadow: 0 40px 100px #000a; border: 1.5px solid #ffffff14; }
  .dhead { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; font: 700 ${B.short ? 42 : 36}px var(--head); } .dhead img { width: 56px; height: 56px; border-radius: 14px; object-fit: contain; background: var(--bg); }
  .ex { margin-inline-start: auto; font: 600 ${B.short ? 24 : 20}px var(--body); color: var(--bg); background: var(--accent); padding: 6px 16px; border-radius: 999px; }
  .dgrid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 40px; } .dgrid.col { grid-template-columns: 1fr; gap: 30px; }
  .dcol h4 { margin: 0 0 18px; font: 600 ${B.short ? 30 : 24}px var(--body); color: var(--muted); }
  .brow { display: grid; grid-template-columns: ${B.short ? 220 : 200}px 1fr 110px; align-items: center; gap: 18px; padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; opacity: 0; }
  .bl { font: 600 ${B.short ? 32 : 28}px var(--body); } .bv { font: 700 ${B.short ? 34 : 30}px var(--body); text-align: end; }
  .btrack { height: 22px; border-radius: 11px; background: #ffffff10; overflow: hidden; } .btrack i { transform: scaleX(0); display: block; height: 100%; width: calc(var(--w) * 100%); border-radius: 11px; background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--cta))); transform-origin: ${arabic ? "right" : "left"}; }
  .brow.best .btrack i { background: linear-gradient(90deg, var(--cta), #ffc36b); }
  .btrack.thin { height: 12px; margin-top: 8px; }
  .srow { opacity: 0; margin-bottom: 18px; font: 500 ${B.short ? 28 : 24}px var(--body); }

  /* recap */
  .mont { position: absolute; inset: -${B.stageTop}px 0 0; background: center top / cover; opacity: 0; filter: blur(2px); }
  .node { position: absolute; opacity: 0; display: flex; flex-direction: ${B.short ? "row" : "column"}; align-items: center; justify-content: center; gap: 22px; border-radius: 34px; background: color-mix(in srgb, var(--panel) 92%, transparent); border: 1.5px solid #ffffff1a; box-shadow: 0 20px 60px #0007; font: 700 ${B.short ? 50 : 44}px var(--head); text-align: center; padding: 20px; }
  .nic { width: ${B.short ? 100 : 96}px; height: ${B.short ? 100 : 96}px; border-radius: 28px; display: grid; place-items: center; background: var(--accent); color: var(--bg); flex: none; }
  .nic svg { width: 56px; height: 56px; stroke-width: 2.2; }
  .link { position: absolute; opacity: 0; background: linear-gradient(90deg, var(--accent), var(--cta)); border-radius: 3px; }
  .link.h { height: 6px; transform-origin: left; } .link.h.rtl { transform-origin: right; background: linear-gradient(270deg, var(--accent), var(--cta)); }
  .link.v { width: 6px; transform-origin: top; background: linear-gradient(180deg, var(--accent), var(--cta)); }

  /* cta */
  .ctaw > * { opacity: 0; }
  .ctaw { display: flex; flex-direction: column; align-items: center; gap: ${B.short ? 30 : 22}px; z-index: 3; }
  .clogo { width: ${B.short ? 150 : 120}px; height: ${B.short ? 150 : 120}px; border-radius: 34px; object-fit: contain; box-shadow: 0 0 60px color-mix(in srgb, var(--accent) 50%, transparent); }
  .cname { font: 700 ${B.short ? 64 : 54}px var(--head); }
  .cbtn { position: relative; overflow: hidden; font: 700 ${B.short ? 58 : 52}px var(--head); padding: ${B.short ? "30px 60px" : "26px 64px"}; border-radius: 999px; background: var(--cta); color: #1a0d07; box-shadow: 0 24px 70px color-mix(in srgb, var(--cta) 55%, transparent); text-align: center; max-width: ${B.W - 100}px; }
  .shine { position: absolute; top: -20%; bottom: -20%; width: 30%; left: 0; background: linear-gradient(100deg, transparent, #ffffffaa, transparent); transform: translateX(-150%) skewX(-20deg); }
  .arrow { width: 90px; height: 90px; color: var(--accent); } .arrow svg { width: 100%; height: 100%; stroke-width: 2.6; }
  .curl { font: 600 ${B.short ? 36 : 32}px 'IBM Plex Mono', monospace; color: var(--accent); background: #0005; padding: 12px 30px; border-radius: 16px; max-width: ${B.W - 100}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .where { font: 500 ${B.short ? 34 : 28}px var(--body); color: var(--muted); }

  ${motionCss(B, arabic)}

  /* depth: art behind, particles, light and grain */
  #vbg { position: absolute; inset: -6%; z-index: 1; overflow: hidden; opacity: .4; }
  #vbg img { width: 100%; height: 100%; object-fit: cover; filter: blur(2px); }
  #vbg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, transparent 0%, var(--bg) 80%); }
  .scbg { position: absolute; inset: -6%; overflow: hidden; opacity: .42; }
  .scbg.faint { opacity: .16; }
  .scbg img { width: 100%; height: 100%; object-fit: cover; filter: blur(1.5px); }
  /* A floating object beside the words: at the far side on a wide frame, under them on a tall one. */
  .obj { position: absolute; z-index: 12; width: ${B.short ? 300 : 320}px; height: ${B.short ? 300 : 320}px; object-fit: contain; opacity: 0; filter: drop-shadow(0 30px 50px #000a);
    ${arabic ? "left" : "right"}: ${B.short ? 40 : 90}px; top: ${B.short ? 260 : 110}px; }
  .scbg::after { content: ""; position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 45%, transparent 0%, var(--bg) 78%); }
  #particles { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
  #particles i { position: absolute; display: block; }
  #particles .p0 { border-radius: 50%; background: var(--accent); }
  #particles .p1 { border-radius: 50%; border: 2px solid var(--cta); }
  #particles .p2 { border-radius: 22%; border: 2px solid var(--accent); }
  #leak { position: absolute; width: ${B.W * 1.2}px; height: ${B.W * 1.2}px; border-radius: 50%; z-index: 85; pointer-events: none; opacity: 0; mix-blend-mode: screen; filter: blur(40px);
    background: radial-gradient(circle, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--cta) 25%, transparent) 40%, transparent 68%); }
  #grain { position: absolute; inset: -50%; z-index: 86; opacity: .06; mix-blend-mode: overlay; pointer-events: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }

  /* subtitles */
  .cap { position: absolute; top: ${B.capTop - (B.short ? 20 : 10)}px; left: 40px; right: 40px; z-index: 30; text-align: center; opacity: 0; }
  .cap > div { display: inline-block; font: 800 ${B.short ? 64 : 54}px/1.3 var(--head); direction: ${arabic ? "rtl" : "ltr"}; text-shadow: 0 6px 24px #000d, 0 0 3px #000; -webkit-text-stroke: ${B.short ? 2 : 1.5}px #0009; paint-order: stroke fill; }
  .cap .w { display: inline-block; color: #fff; margin: 0 .13em; } .cap .w.on { color: var(--accent); transform: scale(1.12); }

  /* The camera inside each scene moves on every phrase. */
  .cam { position: absolute; inset: 0; transform-origin: 50% 45%; }

  /* Numbered steps: how far along the video is. */
  #steps { position: absolute; z-index: 45; top: ${B.short ? 92 : 22}px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; opacity: 0; direction: ltr; }
  #steps i { display: block; width: ${B.short ? 84 : 70}px; height: 10px; border-radius: 5px; background: #ffffff26; }
  #steps i.on { background: var(--accent); box-shadow: 0 0 16px var(--accent); }
  #steps b { margin-left: 8px; font: 700 ${B.short ? 30 : 26}px var(--body); color: var(--text); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${B.W}" data-height="${B.H}">
 <div id="bg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><div class="dots"></div></div>
 ${videoBackdrop ? `<div id="vbg"><img src="${videoBackdrop}" /></div>` : ""}
 <div id="dim"></div>
 ${m?.value ? "" : `<div id="brandbar">${brand.logo ? `<img src="${brand.logo}" />` : ""}<span>${esc(brand.name)}</span></div>`}
 ${blocks.join("\n")}
 ${stepTotal ? `<div id="steps">${Array.from({ length: stepTotal }, (_, i) => `<i id="st${i + 1}"></i>`).join("")}<b><span id="stn">1</span>/${stepTotal}</b></div>` : ""}
 ${captions.join("\n")}
 <div id="particles">${particles}</div>
 <div id="leak"></div><div id="grain"></div>
 ${audio}
</div>
<script>
window.__timelines = window.__timelines || {};
const D_ = ${JSON.stringify(timeline)};
const TOTAL = ${total}, OUTRO = ${outro}, ACCENT = '${c.accent}', CTA = '${c.cta}', BG = '${c.background}', W = ${B.W}, H = ${B.H}, DIR = ${B.dir};
const tl = gsap.timeline({ paused: true });

// The background never stands still.
tl.to('.b1', { x: ${B.W * 0.15}, y: ${B.H * 0.08}, duration: TOTAL / 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
tl.to('.b2', { x: -${B.W * 0.12}, y: -${B.H * 0.1}, duration: TOTAL / 3, yoyo: true, repeat: 2, ease: 'sine.inOut' }, 0);
tl.to('.b3', { x: ${B.W * 0.1}, scale: 1.3, duration: TOTAL / 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0);
tl.to('.dots', { backgroundPosition: '0px 340px', duration: TOTAL, ease: 'none' }, 0);
if (document.querySelector('#vbg')) tl.fromTo('#vbg', { scale: 1.12, x: 30 * DIR }, { scale: 1, x: -30 * DIR, duration: TOTAL, ease: 'none', immediateRender: false }, 0);
${m?.value ? "" : "tl.fromTo('#brandbar', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .5, immediateRender: false }, .2);"}
// Particles drift upward through the whole video, the near ones faster; grain crawls.
document.querySelectorAll('#particles i').forEach((p, i) => {
  tl.to(p, { y: -H * (.25 + (i % 5) * .08), rotation: (i % 2 ? 1 : -1) * 180, duration: TOTAL, ease: 'none' }, 0);
  tl.to(p, { x: (i % 2 ? 1 : -1) * 40, duration: 3 + (i % 4), yoyo: true, repeat: Math.ceil(TOTAL / (3 + (i % 4))), ease: 'sine.inOut' }, 0);
});
tl.to('#grain', { x: 60, y: -40, duration: TOTAL, ease: 'steps(' + Math.round(TOTAL * 12) + ')' }, 0);

// Scenes come in soft and leave soft.
D_.forEach((s, k) => {
  // Zoom-through cuts: the old scene rushes past the camera, the new one settles in.
  // One transition for the whole video: the new scene fades in drifting a little in the reading direction, the old one fades out.
  tl.fromTo('#sc' + k, { opacity: 0, x: 60 * DIR }, { opacity: 1, x: 0, duration: .5, ease: 'power2.out', immediateRender: false }, Math.max(0, s.start - .25));
  if (s.next !== null) tl.to('#sc' + k, { opacity: 0, x: -40 * DIR, duration: .35, ease: 'power2.in' }, s.next - .3);
  const end = (s.next ?? TOTAL) + .4, root = document.querySelector('#sc' + k);
  // The camera never stops: a slow push-in on every scene.
  tl.fromTo('#sc' + k + ' .stage', { scale: 1 }, { scale: 1.045, duration: end - s.start + .3, ease: 'none', immediateRender: false }, s.start - .3);
  if (root.querySelector('.scbg')) tl.fromTo('#sc' + k + ' .scbg', { scale: 1.15, x: 30 * DIR }, { scale: 1, x: -30 * DIR, duration: end - s.start + .3, ease: 'none', immediateRender: false }, s.start - .3);
  if (root.querySelector('.obj')) {
    tl.fromTo('#ob' + k, { opacity: 0, scale: .4, rotation: -20 * DIR, y: 80 }, { opacity: 1, scale: 1, rotation: 0, y: 0, duration: .8, ease: 'back.out(1.7)', immediateRender: false }, s.start + .3);
    tl.to('#ob' + k, { y: -24, rotation: 6 * DIR, duration: 2.2, yoyo: true, repeat: Math.max(1, Math.floor((end - s.start - 1.1) / 2.2)), ease: 'sine.inOut' }, s.start + 1.1);
  }

  // Devices and cards keep floating once they have arrived.
  root.querySelectorAll('.phone, .pmap, .book, .dash, .chat, .order, .splitw, .week, .lchat, .ringbox, .cals').forEach((el, i) => tl.to(el, { y: '-=12', duration: 1.8 + i * .3, yoyo: true, repeat: Math.max(1, Math.floor((end - s.start - 1.2) / (1.8 + i * .3))), ease: 'sine.inOut' }, s.start + 1.2));
  s.chips.forEach((at, j) => tl.fromTo('#w' + k + '_' + j, { opacity: 0, scale: .6, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: .4, ease: 'back.out(2.2)', immediateRender: false }, s.start + at));
  s.lines.forEach((at, j) => {
    const id = '#cp' + k + '_' + j, end = j + 1 < s.lines.length ? s.start + s.lines[j + 1][0] - .05 : s.start + s.dur + .2;
    tl.fromTo(id, { opacity: 0 }, { opacity: 1, duration: .12, immediateRender: false }, s.start + at[0] - .08);
    tl.set(id, { opacity: 0 }, end);
    tl.fromTo(id + ' > div', { scale: .85 }, { scale: 1, duration: .25, ease: 'back.out(2.5)', immediateRender: false }, s.start + at[0] - .08);
    // Only the word being said is lit.
    document.querySelectorAll(id + ' .w').forEach((w, i) => {
      tl.set(w, { className: 'w on' }, s.start + at[i]);
      if (i + 1 < at.length) tl.set(w, { className: 'w' }, s.start + at[i + 1]);
    });
  });
  // The camera breathes with the phrases: a slow push in, then out, never a jump.
  s.cuts.forEach((at, i) => tl.to('#cm' + k, { scale: i % 2 ? 1 : 1.035, duration: 1.6, ease: 'sine.inOut' }, s.start + at));
  if (s.step) {
    if (!document.querySelector('#steps').dataset.shown) { document.querySelector('#steps').dataset.shown = 1; tl.fromTo('#steps', { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: .4, immediateRender: false }, s.start); }
    tl.set('#st' + s.step, { className: 'on' }, s.start + .1);
    tl.fromTo('#st' + s.step, { scaleX: .2 }, { scaleX: 1, duration: .45, ease: 'power3.out', immediateRender: false }, s.start + .1);
    tl.set('#stn', { textContent: s.step }, s.start + .1);
    if (s.step === ${stepTotal}) tl.to('#steps', { opacity: 0, duration: .3 }, (s.next ?? TOTAL) - .3);
  }
});

${scripts.join("\n")}

tl.to({}, { duration: .01 }, TOTAL - .01);
window.__timelines.main = tl;
</script>
</body>
</html>
`;
}
