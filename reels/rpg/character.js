// The dialogue portrait: a 32×40 pixel character drawn from rectangles, so it stays crisp at
// any scale. Pick a preset in the job JSON ("character": { "preset": "girl" }) and override any
// colour, e.g. { "preset": "guy", "shirt": "#e0457b" }.

export const PRESETS = {
  girl: { hair: "long", glasses: true, beard: false, hairColor: "#6b3e26", hairLight: "#8d5634", hairDark: "#4a2a1a", skin: "#f5c9a3", skinShade: "#dca27e", shirt: "#7c5cff", shirtDark: "#5a3fd1", collar: "#2dd4bf", blush: "#f28b9a", lips: "#b5525e" },
  guy: { hair: "short", glasses: true, beard: true, hairColor: "#2b2220", hairLight: "#4a3a34", hairDark: "#1a1412", skin: "#d9a074", skinShade: "#bb825a", shirt: "#2dd4bf", shirtDark: "#1a9f8f", collar: "#7c5cff", blush: "#e08c7c", lips: "#8f4a45", beardColor: "#33261f" },
};

const EYE = "#2b1d3a", FRAME = "#231a3a", MOUTH = "#5a1f2b", TEETH = "#fff6ee", TONGUE = "#e0707e";

/**
 * Draws the character with its top-left at (x, y), each grid pixel `scale` screen pixels.
 * face: { expression: "talk" | "smile" | "wink" | "blink", open: 0–1 (how far the mouth is open), blink: bool }
 */
export function drawCharacter(ctx, x, y, scale, look, face) {
  const c = { ...PRESETS[look.preset ?? "girl"], ...look };
  const r = (gx, gy, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x + gx * scale, y + gy * scale, w * scale, h * scale); };

  // Hair behind the head.
  if (c.hair === "long") {
    r(7, 6, 18, 26, c.hairColor); r(6, 10, 1, 20, c.hairDark); r(25, 10, 1, 20, c.hairDark);
    r(7, 32, 4, 2, c.hairColor); r(21, 32, 4, 2, c.hairColor);
  }
  // Shoulders and shirt.
  r(5, 33, 22, 7, c.shirt); r(4, 35, 1, 5, c.shirtDark); r(27, 35, 1, 5, c.shirtDark); r(5, 33, 22, 1, c.shirtDark);
  r(13, 32, 6, 2, c.collar); r(14, 34, 4, 1, c.collar);
  // Neck and face.
  r(14, 28, 4, 5, c.skinShade); r(14, 28, 4, 2, c.skin);
  r(10, 10, 12, 16, c.skin); r(11, 26, 10, 1, c.skin); r(12, 27, 8, 1, c.skin);
  r(10, 22, 1, 4, c.skinShade); r(21, 22, 1, 4, c.skinShade); r(9, 16, 1, 3, c.skinShade); r(22, 16, 1, 3, c.skinShade);
  if (c.beard) {
    r(10, 22, 12, 4, c.beardColor); r(11, 26, 10, 1, c.beardColor); r(12, 27, 8, 1, c.beardColor);
    r(10, 18, 1, 4, c.beardColor); r(21, 18, 1, 4, c.beardColor); r(13, 21, 6, 1, c.beardColor);
  }
  // Hair in front.
  if (c.hair === "long") {
    r(9, 6, 14, 4, c.hairColor); r(9, 10, 4, 2, c.hairColor); r(15, 10, 3, 1, c.hairColor); r(19, 10, 4, 2, c.hairColor);
    r(9, 10, 1, 12, c.hairColor); r(22, 10, 1, 12, c.hairColor); r(12, 7, 5, 1, c.hairLight); r(8, 9, 1, 8, c.hairDark);
  } else {
    r(9, 6, 14, 5, c.hairColor); r(9, 11, 2, 4, c.hairColor); r(21, 11, 2, 4, c.hairColor);
    r(12, 6, 7, 1, c.hairLight); r(10, 5, 11, 1, c.hairColor); r(17, 11, 4, 1, c.hairColor);
  }
  // Brows.
  const raised = face.expression === "smile" || face.expression === "wink" ? -1 : 0;
  r(11, 13 + raised, 3, 1, c.hairDark); r(18, 13 + (face.expression === "wink" ? 0 : raised), 3, 1, c.hairDark);

  // Eyes: open, shut (blink), happy arcs (smile) or one shut (wink).
  const open = (ex) => { r(ex, 15, 2, 2, EYE); r(ex, 15, 1, 1, "#ffffff"); };
  const shut = (ex) => r(ex - 1, 16, 4, 1, EYE);
  const happy = (ex) => { r(ex - 1, 16, 1, 1, EYE); r(ex, 15, 2, 1, EYE); r(ex + 2, 16, 1, 1, EYE); };
  if (face.blink && face.expression !== "wink") { shut(12); shut(18); }
  else if (face.expression === "smile") { happy(12); happy(18); }
  else if (face.expression === "wink") { open(12); happy(18); }
  else { open(12); open(18); }

  if (c.glasses) {
    for (const gx of [11, 17]) { r(gx, 14, 4, 1, FRAME); r(gx, 17, 4, 1, FRAME); r(gx, 14, 1, 4, FRAME); r(gx + 3, 14, 1, 4, FRAME); }
    r(15, 15, 2, 1, FRAME); r(10, 15, 1, 1, FRAME); r(21, 15, 1, 1, FRAME);
    ctx.globalAlpha = 0.35; r(13, 15, 1, 1, "#bfe9ff"); r(19, 15, 1, 1, "#bfe9ff"); ctx.globalAlpha = 1;
  }
  r(11, 19, 2, 1, c.blush); r(19, 19, 2, 1, c.blush);
  r(15, 19, 2, 1, c.skinShade);

  // Mouth: follows the voice while talking; a smile otherwise.
  const talking = face.expression === "talk" || face.open > 0.08;
  if (talking && face.open > 0.45) { r(14, 21, 4, 3, MOUTH); r(14, 21, 4, 1, TEETH); r(15, 23, 2, 1, TONGUE); }
  else if (talking && face.open > 0.12) { r(14, 22, 4, 2, MOUTH); r(14, 22, 4, 1, TEETH); }
  else if (face.expression === "talk") r(14, 22, 4, 1, c.lips);
  else { r(13, 21, 1, 1, c.lips); r(14, 22, 4, 1, c.lips); r(18, 21, 1, 1, c.lips); }
}
