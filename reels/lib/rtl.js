// Arabic text on a canvas: Chrome shapes the letters, but the line order is ours.
// Words are laid out right to left; a run of Latin words or numbers ("MacBook Pro", "$1,999")
// stays one left-to-right piece so it doesn't come out reversed.

const ARABIC = /[؀-ۿ]/;

/** Splits text into pieces: Arabic words, and Latin/number runs kept together. */
export function pieces(text) {
  const out = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const arabic = ARABIC.test(word);
    const last = out[out.length - 1];
    if (!arabic && last && !last.arabic) last.text += " " + word;
    else out.push({ text: word, arabic });
  }
  return out;
}

/**
 * Wraps text to `width` and places each piece: [{ text, arabic, x, w, line, from }], where x is
 * the piece's left edge measured from the right margin (so draw at right - x - w) and `from`
 * is how many characters of the text come before it (for typing it out).
 */
export function layout(ctx, text, width) {
  const space = ctx.measureText(" ").width;
  const placed = [];
  let line = 0, used = 0, from = 0;
  for (const piece of pieces(text)) {
    const w = ctx.measureText(piece.text).width;
    if (used > 0 && used + w > width) { line++; used = 0; }
    placed.push({ ...piece, x: used, w, line, from });
    used += w + space;
    from += piece.text.length + 1;
  }
  return placed;
}

/** Draws laid-out pieces with only the first `shown` characters visible. */
export function draw(ctx, placed, right, top, lineHeight, shown = Infinity, paint) {
  for (const p of placed) {
    const visible = Math.max(0, Math.min(p.text.length, shown - p.from));
    if (!visible) continue;
    const y = top + p.line * lineHeight;
    const text = p.text.slice(0, visible);
    if (p.arabic) {
      ctx.direction = "rtl"; ctx.textAlign = "right";
      ctx.fillText(text, right - p.x, y);
    } else {
      // Latin types left to right inside its slot.
      ctx.direction = "ltr"; ctx.textAlign = "left";
      ctx.fillText(text, right - p.x - p.w, y);
    }
    paint?.(p, right - p.x - p.w, y, visible === p.text.length);
  }
  ctx.direction = "ltr"; ctx.textAlign = "left";
}
