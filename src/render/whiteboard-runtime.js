// Whiteboard renderer, inlined into a composition by whiteboard.ts.
//
// Every scene is a page of paper. A hand draws the scene's picture (outlines
// first, then colour) and writes its visual in handwriting, timed to the words
// the narrator is saying. Pages slide in like paper being moved.
//
// Everything is drawn on one canvas from a single function of time,
// renderAt(t), which one GSAP tween calls on every update. HyperFrames and the
// studio preview both seek that tween, so any frame can be drawn in any order.
// The timeline is only registered once the pictures are loaded and the pen
// paths planned; HyperFrames waits for it.
(() => {
  const DATA = window.WB;
  const W = DATA.width, H = DATA.height, PORTRAIT = H > W;
  const INK = "#1d1d1b", GREEN = "#2f5d50", RED = "#a8322a", PAPER = "#f4eddc";
  const FONT = (size) => `700 ${size}px Caveat`;
  const SLIDE = 0.5;
  const canvas = document.getElementById("wb");
  const ctx = canvas.getContext("2d");

  const load = (src) => new Promise((ok, fail) => {
    const image = new Image();
    image.onload = () => ok(image);
    image.onerror = () => fail(new Error(`could not load ${src}`));
    image.src = src;
  });
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  // ------------------------------------------------------------ layout

  /** Where a page's picture and its writing go. */
  function regions(hasImage) {
    if (!hasImage) return { image: null, text: PORTRAIT ? { x: 90, y: 300, w: 900, h: 1000 } : { x: 200, y: 140, w: 1520, h: 800 } };
    // Shorts keep clear of YouTube's buttons (right) and title (bottom ~400px).
    return PORTRAIT
      ? { image: { x: 140, y: 170, w: 800, h: 800 }, text: { x: 80, y: 1010, w: 860, h: 520 } }
      : { image: { x: 70, y: 110, w: 860, h: 860 }, text: { x: 990, y: 150, w: 860, h: 780 } };
  }

  /** The handwritten pieces a visual becomes, top to bottom. */
  function pieces(visual) {
    const v = visual || { type: "title", headline: "" };
    switch (v.type) {
      case "stat":
        return [{ str: v.value, size: 230, color: RED }, { str: v.label, size: 84 }];
      case "compare":
        return [
          { str: `${v.left?.label}: ${v.left?.value}`, size: 100 },
          { str: "vs", size: 70, color: GREEN },
          { str: `${v.right?.label}: ${v.right?.value}`, size: 100, color: RED },
        ];
      case "list":
        return [{ str: v.headline, size: 104 }, ...(v.items || []).map((item) => ({ str: `• ${item}`, size: 78, color: GREEN }))];
      case "quote":
        return [{ str: `"${v.text}"`, size: 92 }, ...(v.author ? [{ str: `— ${v.author}`, size: 64, color: GREEN }] : [])];
      case "code":
        return [{ str: v.headline, size: 96 }, ...(v.lines || []).slice(0, 6).map((line) => ({ str: line, size: 56, color: GREEN }))];
      case "chapter":
        return [{ str: `Chapter ${v.number}`, size: 80, color: GREEN }, { str: v.headline, size: 150 }];
      case "chart":
        return [{ str: v.headline, size: 96 }, { chart: (v.bars || []).slice(0, 5) }];
      default:
        return [{ str: v.headline, size: 140 }];
    }
  }

  const measurer = document.createElement("canvas").getContext("2d");

  /** Wraps text into at most `maxLines` lines that fit `maxW`, shrinking the size until it does. */
  function fit(str, size, maxW, maxLines) {
    const words = String(str ?? "").split(/\s+/).filter(Boolean);
    for (let s = size; s >= 36; s = Math.floor(s * 0.9)) {
      measurer.font = FONT(s);
      const lines = [];
      let line = "";
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (measurer.measureText(next).width <= maxW || !line) line = next;
        else { lines.push(line); line = word; }
      }
      if (line) lines.push(line);
      if (lines.length <= maxLines && lines.every((l) => measurer.measureText(l).width <= maxW)) return { lines, size: s };
    }
    return { lines: [words.join(" ")], size: 36 };
  }

  // ------------------------------------------------------------ elements

  // Ink cells: a coarse grid of the points where something is drawn.
  function inkCells(cv, step) {
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const cells = [];
    for (let y = 0; y < cv.height; y += step)
      for (let x = 0; x < cv.width; x += step) {
        let ink = false;
        for (let yy = y; yy < Math.min(y + step, cv.height) && !ink; yy += 2)
          for (let xx = x; xx < Math.min(x + step, cv.width); xx += 2) {
            const k = (yy * cv.width + xx) * 4;
            if (d[k + 3] > 60 && (d[k] + d[k + 1] + d[k + 2]) / 3 < 236) { ink = true; break; }
          }
        if (ink) cells.push([x + step / 2, y + step / 2]);
      }
    return cells;
  }

  // Visits cells the way a pen would: follow the stroke, and only lift to
  // jump to the nearest unvisited ink when the stroke runs out.
  function penWalk(cells, step) {
    if (!cells.length) return [];
    const key = (x, y) => Math.round(x / step) + "," + Math.round(y / step);
    const index = new Map(cells.map((p, i) => [key(p[0], p[1]), i]));
    const seen = new Uint8Array(cells.length);
    let cur = cells.reduce((best, p, i) => (p[1] * 2 + p[0] < cells[best][1] * 2 + cells[best][0] ? i : best), 0);
    const out = [];
    let dx = 1, dy = 0;
    for (let n = 0; n < cells.length; n++) {
      seen[cur] = 1;
      out.push(cells[cur]);
      const [x, y] = cells[cur];
      let best = -1, bestScore = -1e9;
      for (let r = 1; r <= 2 && best < 0; r++)
        for (let oy = -r; oy <= r; oy++)
          for (let ox = -r; ox <= r; ox++) {
            if (!ox && !oy) continue;
            const j = index.get(key(x + ox * step, y + oy * step));
            if (j === undefined || seen[j]) continue;
            const score = (ox * dx + oy * dy) / Math.hypot(ox, oy) - Math.hypot(ox, oy) * 0.3;
            if (score > bestScore) { bestScore = score; best = j; }
          }
      if (best < 0) {
        let bestDistance = Infinity;
        for (let j = 0; j < cells.length; j++)
          if (!seen[j]) {
            const distance = (cells[j][0] - x) ** 2 + (cells[j][1] - y) ** 2;
            if (distance < bestDistance) { bestDistance = distance; best = j; }
          }
        if (best < 0) break;
      }
      const ndx = cells[best][0] - x, ndy = cells[best][1] - y, length = Math.hypot(ndx, ndy) || 1;
      dx = ndx / length; dy = ndy / length; cur = best;
    }
    return out;
  }

  // Writing goes left to right: sweep columns, zig-zagging up and down.
  function writeWalk(cells, step) {
    const columns = new Map();
    for (const p of cells) {
      const k = Math.floor(p[0] / (step * 2));
      (columns.get(k) || columns.set(k, []).get(k)).push(p);
    }
    return [...columns.keys()].sort((a, b) => a - b).flatMap((k, i) => {
      const column = columns.get(k).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      return i % 2 ? column.reverse() : column;
    });
  }

  /** The drawn part of a picture, with a small margin, so it can fill its box. */
  function inkBox(image) {
    const cv = document.createElement("canvas");
    cv.width = image.width; cv.height = image.height;
    const g = cv.getContext("2d");
    g.drawImage(image, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y += 2)
      for (let x = 0; x < cv.width; x += 2) {
        const k = (y * cv.width + x) * 4;
        if ((d[k] + d[k + 1] + d[k + 2]) / 3 < 232) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
    if (x1 <= x0 || y1 <= y0) return [0, 0, cv.width, cv.height];
    const m = 16;
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(cv.width, x1 + m); y1 = Math.min(cv.height, y1 + m);
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /** A picture: an outline layer drawn by pen, then a quick colour scribble. */
  function pictureElement(image, box) {
    const [bx, by, bw, bh] = inkBox(image);
    const scale = Math.min(box.w / bw, box.h / bh);
    const w = Math.round(bw * scale), h = Math.round(bh * scale);
    const x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;

    const full = document.createElement("canvas");
    full.width = w; full.height = h;
    const fg = full.getContext("2d");
    fg.drawImage(image, bx, by, bw, bh, 0, 0, w, h);
    // FLUX's "white" is often a faint grey or cream; lift it to pure white so
    // no box shows on the paper, and keep the ink as dark as it was.
    const lifted = fg.getImageData(0, 0, w, h);
    for (let i = 0; i < lifted.data.length; i += 4)
      for (let c = 0; c < 3; c++) lifted.data[i + c] = Math.min(255, lifted.data[i + c] / 0.9);
    fg.putImageData(lifted, 0, 0);

    // Light pixels are made transparent first so they don't block the ink.
    const lines = document.createElement("canvas");
    lines.width = w; lines.height = h;
    const lg = lines.getContext("2d");
    lg.drawImage(full, 0, 0);
    const pixels = lg.getImageData(0, 0, w, h);
    for (let i = 0; i < pixels.data.length; i += 4)
      if ((pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3 > 125) pixels.data[i + 3] = 0;
    lg.putImageData(pixels, 0, 0);

    const step = 8;
    const linePath = penWalk(inkCells(lines, step), step).map(([px, py]) => [x + px, y + py]);
    const fillStep = 34;
    const rows = new Map();
    for (const c of inkCells(full, fillStep)) {
      const r = Math.round(c[1] / fillStep);
      (rows.get(r) || rows.set(r, []).get(r)).push(c);
    }
    const fillPath = [...rows.keys()].sort((a, b) => a - b).flatMap((r, i) => {
      const row = rows.get(r).sort((a, b) => a[0] - b[0]);
      return i % 2 ? row.reverse() : row;
    }).map(([px, py]) => [x + px, y + py]);

    return {
      kind: "picture", x, y, w, h, full, lines,
      linePath: linePath.length ? linePath : [[x + w / 2, y + h / 2]],
      fillPath: fillPath.length ? fillPath : [[x + w / 2, y + h / 2]],
      brush: 11, fillBrush: fillStep * 1.05,
      want: Math.min(4.6, Math.max(1.5, linePath.length / 650 + 0.9)),
    };
  }

  /** Handwritten text, already wrapped; `y` is the top of the block. */
  function textElement(lines, size, color, x, y, w, align, label) {
    const lineHeight = size * 1.05;
    const h = Math.ceil(lineHeight * lines.length + size * 0.35);
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(w); cv.height = h;
    const g = cv.getContext("2d");
    g.font = FONT(size);
    g.fillStyle = color;
    lines.forEach((line, i) => {
      const lw = g.measureText(line).width;
      g.fillText(line, align === "center" ? (w - lw) / 2 : 0, size * 0.92 + i * lineHeight);
    });
    const step = Math.max(5, Math.round(size / 14));
    const cells = inkCells(cv, step);
    const path = lines
      .flatMap((_, i) => writeWalk(cells.filter((p) => Math.min(lines.length - 1, Math.floor(p[1] / lineHeight)) === i), step))
      .map(([px, py]) => [x + px, y + py]);
    return {
      kind: "text", x, y, w: cv.width, h, canvas: cv, label,
      path: path.length ? path : [[x, y]], brush: step * 1.5,
      want: Math.min(2.6, Math.max(0.6, lines.join(" ").length * 0.075)),
    };
  }

  /** A stroke along points, such as a chart bar's outline. */
  function strokeElement(points, color, width, label) {
    const path = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
      for (let k = 0; k < n; k++) path.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    path.push(points[points.length - 1]);
    return { kind: "stroke", color, width, path, label, want: Math.min(1.6, Math.max(0.5, path.length / 260)) };
  }

  /** Hand-drawn horizontal bars inside `area`, longest = full width. */
  function chartElements(bars, area) {
    const out = [];
    const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
    const rowH = Math.min(130, area.h / Math.max(bars.length, 1));
    const labelW = area.w * 0.28;
    bars.forEach((bar, i) => {
      const y = area.y + i * rowH;
      const label = fit(String(bar.label), 64, labelW - 20, 1);
      out.push(textElement(label.lines, label.size, INK, area.x, y + rowH * 0.12, labelW, "left", String(bar.label)));
      const x0 = area.x + labelW, len = Math.max(30, ((Number(bar.value) || 0) / max) * (area.w - labelW - 150));
      const top = y + rowH * 0.2, bottom = y + rowH * 0.75;
      out.push(strokeElement([[x0, bottom], [x0, top], [x0 + len, top], [x0 + len, bottom], [x0, bottom]], i === bars.length - 1 ? RED : GREEN, 7, String(bar.value)));
      const value = fit(String(bar.value), 64, 150, 1);
      out.push(textElement(value.lines, value.size, INK, x0 + len + 16, y + rowH * 0.12, 150, "left", String(bar.value)));
    });
    return out;
  }

  /** When the narration says this piece, or null. */
  function spokenAt(label, words) {
    const tokens = String(label ?? "").split(/\s+/).map(norm).filter((t) => t.length >= 4 || /^\d+$/.test(t));
    for (const word of words) if (tokens.includes(norm(word.text))) return word.start;
    return null;
  }

  // ------------------------------------------------------------ pages

  async function buildPage(scene, index, picture) {
    const area = regions(Boolean(picture));
    const els = [];
    const start = scene.start, end = scene.start + scene.duration;
    const ready = index === 0 ? start + 0.15 : start + SLIDE;

    if (picture) {
      const el = pictureElement(picture, area.image);
      el.t = ready;
      els.push(el);
    }

    // Lay the writing out top to bottom, then centre the block vertically.
    const text = area.text;
    const written = [];
    for (const piece of pieces(scene.visual)) {
      if (piece.chart) {
        written.push({ chart: piece.chart, h: Math.min(130, text.h / 2 / Math.max(piece.chart.length, 1)) * piece.chart.length });
        continue;
      }
      if (!piece.str) continue;
      const maxLines = piece.size >= 200 ? 1 : 3;
      const f = fit(piece.str, piece.size, text.w, maxLines);
      written.push({ ...piece, lines: f.lines, size: f.size, h: f.size * 1.05 * f.lines.length + f.size * 0.35 });
    }
    const gap = 26;
    const total = written.reduce((sum, w) => sum + w.h, 0) + gap * Math.max(0, written.length - 1);
    let y = text.y + Math.max(0, (text.h - total) / 2);
    const align = picture ? "left" : "center";
    const textEls = [];
    for (const w of written) {
      if (w.chart) textEls.push(...chartElements(w.chart, { x: text.x, y, w: text.w, h: w.h }));
      else textEls.push(textElement(w.lines, w.size, w.color || INK, text.x, y, text.w, align, w.str));
      y += w.h + gap;
    }

    // Timing: the picture first, then each piece when it is said (or spread
    // evenly when the narration never says it), always in order.
    const afterPicture = picture ? ready + Math.min(els[0].want, (end - ready) * 0.45) : ready;
    const spread = (i) => afterPicture + ((end - 1.4 - afterPicture) * i) / Math.max(textEls.length, 1);
    let previous = afterPicture;
    textEls.forEach((el, i) => {
      const said = spokenAt(el.label, scene.words.map((w) => ({ ...w, start: start + w.start })));
      const t = Math.max(previous, said !== null ? said - 0.15 : spread(i));
      el.t = Math.min(t, end - 1.0);
      previous = el.t + 0.3;
    });
    els.push(...textEls);

    // Each element draws until the next one starts, within a natural range.
    els.sort((a, b) => a.t - b.t);
    els.forEach((el, i) => {
      const next = i + 1 < els.length ? Math.max(els[i + 1].t, el.t + 0.3) : end - 0.5;
      el.dur = Math.max(0.3, Math.min(el.want, next - el.t - 0.05));
    });

    return { start, end, els, dir: ["left", "up", "left", "right", "up"][index % 5] };
  }

  // ------------------------------------------------------------ drawing

  const paper = document.createElement("canvas");
  paper.width = W; paper.height = H;
  (() => {
    const g = paper.getContext("2d");
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    const d = g.getImageData(0, 0, W, H), a = d.data;
    let seed = 1234567;
    const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < a.length; i += 4) { const n = (random() - 0.5) * 10; a[i] += n; a[i + 1] += n; a[i + 2] += n; }
    g.putImageData(d, 0, 0);
    const vignette = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.62);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(90,70,40,0.16)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, W, H);
  })();

  const mask = document.createElement("canvas"), mg = mask.getContext("2d");

  function reveal(g, x, y, layer, path, p, brush) {
    if (p <= 0) return;
    if (p >= 1) return g.drawImage(layer, x, y);
    mask.width = layer.width; mask.height = layer.height;
    mg.fillStyle = "#000";
    mg.beginPath();
    const n = Math.floor(path.length * p);
    for (let i = 0; i < n; i++) {
      const [px, py] = path[i];
      mg.moveTo(px - x + brush, py - y);
      mg.arc(px - x, py - y, brush, 0, 7);
    }
    mg.fill();
    mg.globalCompositeOperation = "source-in";
    mg.drawImage(layer, 0, 0);
    mg.globalCompositeOperation = "source-over";
    g.drawImage(mask, x, y);
  }

  const LINE_SHARE = 0.72;
  const progress = (el, t) => (t < el.t ? 0 : t >= el.t + el.dur ? 1 : (t - el.t) / el.dur);

  function drawElement(g, el, p) {
    if (p <= 0) return;
    if (el.kind === "stroke") {
      const n = Math.max(2, Math.floor(el.path.length * p));
      g.save();
      g.strokeStyle = el.color; g.lineWidth = el.width; g.lineCap = g.lineJoin = "round";
      g.beginPath();
      g.moveTo(...el.path[0]);
      for (let i = 1; i < n; i++) g.lineTo(...el.path[i]);
      g.stroke();
      g.restore();
      return;
    }
    g.save();
    g.globalCompositeOperation = "multiply";
    if (el.kind === "picture") {
      if (p >= 1) g.drawImage(el.full, el.x, el.y);
      else {
        reveal(g, el.x, el.y, el.lines, el.linePath, Math.min(1, p / LINE_SHARE), el.brush);
        const fill = (p - LINE_SHARE) / (1 - LINE_SHARE);
        if (fill > 0) reveal(g, el.x, el.y, el.full, el.fillPath, fill, el.fillBrush);
      }
    } else reveal(g, el.x, el.y, el.canvas, el.path, p, el.brush);
    g.restore();
  }

  /** Where the pen tip is at progress p through an element. */
  function penPoint(el, p) {
    let path = el.path, q = p;
    if (el.kind === "picture") {
      if (p < LINE_SHARE) { path = el.linePath; q = p / LINE_SHARE; }
      else { path = el.fillPath; q = (p - LINE_SHARE) / (1 - LINE_SHARE); }
    }
    const f = Math.min(1, Math.max(0, q)) * (path.length - 1);
    const a = path[Math.floor(f)], b = path[Math.min(path.length - 1, Math.floor(f) + 1)], r = f % 1;
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  }

  const OFF = [W + 380, H + 420];
  /** The pen on this page at time t, or null while the hand is away. */
  function penAt(page, t) {
    const els = page.els;
    for (let i = 0; i < els.length; i++) {
      const el = els[i], end = el.t + el.dur, next = els[i + 1];
      if (t >= el.t && t < end) return penPoint(el, (t - el.t) / el.dur);
      const last = penPoint(el, 1);
      const shortGap = next && next.t - end < 0.9;
      if (shortGap && t >= end && t < next.t) {
        const r = ease((t - end) / (next.t - end)), s = penPoint(next, 0);
        return [last[0] + (s[0] - last[0]) * r, last[1] + (s[1] - last[1]) * r];
      }
      if (!shortGap && t >= end && t < end + 0.45) {
        const r = ease((t - end) / 0.45);
        return [last[0] + (OFF[0] - last[0]) * r, last[1] + (OFF[1] - last[1]) * r];
      }
      const arriving = i === 0 || el.t - (els[i - 1].t + els[i - 1].dur) >= 0.9;
      if (arriving && t < el.t && t >= el.t - 0.4) {
        const r = ease((t - (el.t - 0.4)) / 0.4), s = penPoint(el, 0);
        return [OFF[0] + (s[0] - OFF[0]) * r, OFF[1] + (s[1] - OFF[1]) * r];
      }
    }
    return null;
  }

  function drawPage(page, t) {
    // A slow push-in keeps a finished page alive.
    const k = 1 + 0.035 * ease((t - page.start) / Math.max(1, page.end - page.start));
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
    for (const el of page.els) drawElement(ctx, el, progress(el, t));
    ctx.restore();
    return k;
  }

  let PAGES = [], HAND = null, TIP = [0, 0];

  function renderAt(t) {
    ctx.drawImage(paper, 0, 0);
    if (!PAGES.length) return;
    let i = PAGES.findIndex((page, n) => t >= page.start && (n + 1 === PAGES.length || t < PAGES[n + 1].start));
    if (i < 0) i = 0;
    const page = PAGES[i];
    const slide = i > 0 ? (t - page.start) / SLIDE : 1;
    let ox = 0, oy = 0;
    if (slide < 1) {
      const r = ease(slide);
      const v = { left: [-W, 0], right: [W, 0], up: [0, -H] }[page.dir];
      ctx.save(); ctx.translate(v[0] * r, v[1] * r); drawPage(PAGES[i - 1], t); ctx.restore();
      ox = -v[0] * (1 - r); oy = -v[1] * (1 - r);
    }
    ctx.save(); ctx.translate(ox, oy);
    const k = drawPage(page, t);
    ctx.restore();

    const pen = penAt(page, t);
    if (pen && HAND) {
      const x = W / 2 + (pen[0] - W / 2) * k + ox, y = H / 2 + (pen[1] - H / 2) * k + oy;
      const wobble = Math.sin(t * 23) * 2 + Math.sin(t * 37) * 1.5;
      const s = 0.8;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.filter = "brightness(0) blur(10px)";
      ctx.drawImage(HAND, x - TIP[0] * s + 22, y - TIP[1] * s + 26 + wobble, HAND.width * s, HAND.height * s);
      ctx.restore();
      ctx.drawImage(HAND, x - TIP[0] * s, y - TIP[1] * s + wobble, HAND.width * s, HAND.height * s);
    }
  }

  async function prepare() {
    await document.fonts.load(FONT(100));

    // The hand's forearm is stretched off the bottom so it never ends on screen.
    const handImage = await load(DATA.hand);
    const hand = document.createElement("canvas");
    hand.width = handImage.width; hand.height = handImage.height + 900;
    const hg = hand.getContext("2d");
    hg.drawImage(handImage, 0, 0);
    hg.drawImage(handImage, 0, handImage.height - 6, handImage.width, 4, 0, handImage.height - 3, handImage.width, 903);
    HAND = hand;
    // The pen tip is the topmost opaque pixel.
    const hd = hg.getImageData(0, 0, handImage.width, handImage.height).data;
    find: for (let y = 0; y < handImage.height; y++)
      for (let x = 0; x < handImage.width; x++)
        if (hd[(y * handImage.width + x) * 4 + 3] > 140) { TIP = [x, y + 4]; break find; }

    const pictures = await Promise.all(DATA.scenes.map((scene) => (scene.image ? load(scene.image).catch(() => null) : null)));
    PAGES = [];
    for (const [index, scene] of DATA.scenes.entries()) PAGES.push(await buildPage(scene, index, pictures[index]));
  }

  window.__timelines = window.__timelines || {};
  prepare()
    .catch((error) => console.error("whiteboard:", error))
    .then(() => {
      renderAt(0);
      const tl = gsap.timeline({ paused: true });
      const clock = { t: 0 };
      tl.to(clock, { t: DATA.total, duration: DATA.total, ease: "none", onUpdate: () => renderAt(clock.t) }, 0);
      window.__timelines.main = tl;
    });
})();
