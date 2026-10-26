/**
 * The pace of a marketing video. The reels people watch to the end change
 * what's on screen about every two seconds and number their steps; these
 * helpers decide when the camera moves inside a scene, which scenes are
 * numbered steps, and find the stretches of a render where nothing moves.
 */

const r = (n: number) => Math.round(n * 1000) / 1000;

/**
 * When the camera moves inside a scene of `seconds`: on each phrase that
 * starts at least a second after the last move, never in the scene's first
 * or last half second, and with moves added where a phrase runs long, so the
 * picture never holds longer than about 2.2 seconds.
 */
export function cameraCuts(starts: number[], seconds: number, edge = 0.5): number[] {
  const kept: number[] = [];
  for (const at of [...starts].sort((a, b) => a - b)) {
    if (at < edge || at > seconds - edge) continue;
    if (at - (kept.at(-1) ?? 0) >= 1) kept.push(r(at));
  }
  const out: number[] = [];
  const points = [0, ...kept, seconds];
  for (let i = 1; i < points.length; i++) {
    const [from, to] = [points[i - 1], points[i]];
    if (to - from > 2.4) {
      const pieces = Math.ceil((to - from) / 2.2);
      for (let j = 1; j < pieces; j++) {
        const at = from + ((to - from) * j) / pieces;
        if (at >= edge && at <= seconds - edge) out.push(r(at));
      }
    }
    if (i < points.length - 1) out.push(points[i]);
  }
  return out;
}

const STEP = /^\s*(?:ال)?(?:خطوة|نصيحة|غلطة)\s*(?:رقم\s*)?(?:\d+|[٠-٩]+|الأولى|الاولى|الأول|الاول|التانية|الثانية|التانيه|التالتة|الثالثة|الرابعة|الخامسة)|^\s*(?:step|tip|mistake)\s*#?\d+/i;

/** Which scenes are numbered steps ("الخطوة 2", "Tip 3"), numbered among themselves; null for the others. Two at least, or none. */
export function stepsOf(scenes: { narration: string; visual: { headline?: string } }[]): ({ n: number; total: number } | null)[] {
  const marks = scenes.map((scene) => STEP.test(scene.narration) || STEP.test(scene.visual.headline ?? ""));
  const total = marks.filter(Boolean).length;
  if (total < 2) return scenes.map(() => null);
  let n = 0;
  return marks.map((step) => (step ? { n: ++n, total } : null));
}

/**
 * The stretches of a video where the picture barely changes, from the change
 * between each frame and the next (`diffs`, sampled `fps` a second): runs below
 * `quiet` lasting at least `min` seconds, in seconds.
 */
export function stillStretches(diffs: number[], fps: number, min = 2.5, quiet = 1): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  diffs.forEach((diff, i) => {
    if (diff < quiet) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && (i - start) / fps >= min) out.push({ from: r(start / fps), to: r(i / fps) });
      start = -1;
    }
  });
  if (start >= 0 && (diffs.length - start) / fps >= min) out.push({ from: r(start / fps), to: r(diffs.length / fps) });
  return out;
}
