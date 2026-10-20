export type Rect = { x: number; y: number; w: number; h: number };

export type Shape = "16x9" | "9x16";
export const SHAPES: Shape[] = ["16x9", "9x16"];

export type Layout = {
  width: number;
  height: number;
  /** `screen` is where the desktop recording plays; `body` is the lid around it; `base` the keyboard edge below. */
  laptop: { screen: Rect; body: Rect; base: Rect };
  /** `screen` is where the phone recording plays; `bar` the status bar above it; `body` is the phone around both. */
  phone: { screen: Rect; bar: Rect; body: Rect };
};

/** Bezel widths in pixels; the laptop's chin is thicker than its sides. */
const BEZEL = { laptop: 16, chin: 28, phone: 14 };

const even = (n: number) => Math.round(n / 2) * 2;

/** A screen `width` wide in the shape of the recording (1440×900 desktop, 390×844 phone). */
function screenOf(x: number, y: number, width: number, aspect: number): Rect {
  const w = even(width);
  return { x: Math.round(x), y: Math.round(y), w, h: even(w / aspect) };
}

function laptopAround(screen: Rect): Layout["laptop"] {
  const body = { x: screen.x - BEZEL.laptop, y: screen.y - BEZEL.laptop, w: screen.w + BEZEL.laptop * 2, h: screen.h + BEZEL.laptop + BEZEL.chin };
  const overhang = Math.round(screen.w * 0.07);
  const base = { x: body.x - overhang, y: body.y + body.h, w: body.w + overhang * 2, h: Math.max(14, Math.round(screen.w * 0.022)) };
  return { screen, body, base };
}

/** A phone shows the page below its status bar, so the camera never covers the site's header. */
function phoneAround(screen: Rect): Layout["phone"] {
  const bar = { x: screen.x, y: screen.y - Math.round(screen.w * 0.12), w: screen.w, h: Math.round(screen.w * 0.12) };
  return { screen, bar, body: { x: screen.x - BEZEL.phone, y: bar.y - BEZEL.phone, w: screen.w + BEZEL.phone * 2, h: screen.h + bar.h + BEZEL.phone * 2 } };
}

/**
 * Where the laptop and the phone sit: the laptop large, the phone in front of
 * its lower right corner, the pair centered on the canvas.
 */
export function layoutFor(shape: Shape): Layout {
  const desktop = 1440 / 900;
  const mobile = 390 / 844;
  if (shape === "16x9") {
    const laptop = laptopAround(screenOf(250, 120, 1180, desktop));
    const phoneScreen = screenOf(1390, 0, 300, mobile);
    phoneScreen.y = laptop.base.y + laptop.base.h + 40 - phoneScreen.h;
    return { width: 1920, height: 1080, laptop, phone: phoneAround(phoneScreen) };
  }
  const laptop = laptopAround(screenOf(110, 330, 860, desktop));
  const phoneScreen = screenOf(576, laptop.screen.y + laptop.screen.h * 0.6, 420, mobile);
  return { width: 1080, height: 1920, laptop, phone: phoneAround(phoneScreen) };
}
