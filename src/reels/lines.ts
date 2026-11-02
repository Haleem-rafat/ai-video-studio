import type { Reel } from "./store.ts";

/**
 * Line edits that keep a reel consistent: every reference to a line (an RPG or proof line's
 * settings, a news or proof scene's span) follows its text. Plain functions, so the app edits
 * its unsaved draft with them too.
 */

/** Moves line `from` to `to` in a reel, keeping every reference to a line on the same text. */
export function moveLine<T extends Reel>(reel: T, from: number, to: number): T {
  if (from === to || from < 0 || to < 0 || from >= reel.lines.length || to >= reel.lines.length) return reel;
  const order = reel.lines.map((_, i) => i);
  order.splice(to, 0, order.splice(from, 1)[0]);
  const where = (old: number) => order.indexOf(old);
  return remap(reel, order.map((old) => reel.lines[old]), where);
}

/** Inserts a line after `after` (-1 = first). */
export function insertLine<T extends Reel>(reel: T, after: number, text = ""): T {
  const at = after + 1;
  return remap(reel, [...reel.lines.slice(0, at), text, ...reel.lines.slice(at)], (old) => (old >= at ? old + 1 : old));
}

/** Removes a line; its own settings go with it, and scenes that covered it move to its neighbour. */
export function removeLine<T extends Reel>(reel: T, index: number): T {
  if (reel.lines.length <= 1) return reel;
  const lines = reel.lines.filter((_, i) => i !== index);
  const without = {
    ...reel,
    ...(reel.rpg ? { rpg: { ...reel.rpg, subs: reel.rpg.subs.filter((sub) => sub.line !== index) } } : {}),
    ...(reel.proof ? { proof: { ...reel.proof, subs: reel.proof.subs.filter((sub) => sub.line !== index) } } : {}),
    ...(reel.kinetic ? { kinetic: { ...reel.kinetic, subs: reel.kinetic.subs.filter((sub) => sub.line !== index) } } : {}),
    ...(reel.story ? { story: { ...reel.story, subs: reel.story.subs.filter((sub) => sub.line !== index) } } : {}),
  };
  return remap(without, lines, (old) => (old > index ? old - 1 : old === index ? Math.min(index, lines.length - 1) : old));
}

/** New lines with every line reference passed through `where` (old index → new index). */
function remap<T extends Reel>(reel: T, lines: string[], where: (old: number) => number): T {
  const span = ([a, b]: [number, number]): [number, number] => {
    const x = where(a), y = where(b);
    return [Math.min(x, y), Math.max(x, y)];
  };
  return {
    ...reel,
    lines,
    ...(reel.rpg ? { rpg: { ...reel.rpg, subs: reel.rpg.subs.map((sub) => ({ ...sub, line: where(sub.line) })).sort((a, b) => a.line - b.line) } } : {}),
    ...(reel.news ? { news: { ...reel.news, scenes: reel.news.scenes.map((scene) => ({ ...scene, lines: span(scene.lines) })) } } : {}),
    ...(reel.kinetic ? { kinetic: { ...reel.kinetic, subs: reel.kinetic.subs.map((sub) => ({ ...sub, line: where(sub.line) })).sort((a, b) => a.line - b.line), scenes: reel.kinetic.scenes.map((scene) => ({ ...scene, lines: span(scene.lines) })) } } : {}),
    ...(reel.proof ? { proof: { ...reel.proof, subs: reel.proof.subs.map((sub) => ({ ...sub, line: where(sub.line) })).sort((a, b) => a.line - b.line), scenes: reel.proof.scenes.map((scene) => ({ ...scene, lines: span(scene.lines) })) } } : {}),
    ...(reel.story ? { story: { ...reel.story, subs: reel.story.subs.map((sub) => ({ ...sub, line: where(sub.line) })).sort((a, b) => a.line - b.line), scenes: reel.story.scenes.map((scene) => ({ ...scene, lines: span(scene.lines) })) } } : {}),
  };
}
