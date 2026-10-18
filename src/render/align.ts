import type { Word } from "../types.ts";

/**
 * When each word of the script is spoken. The voice's word timings come from
 * a transcription of the audio, and they rarely match the script one to one:
 * "12MP" is heard as "12 ميجا بيكسل", "Liquid Retina" as "ليكود ريتنا". A
 * proportional guess drifts by seconds in a long scene, so the two word lists
 * are aligned (edit-distance style), and words without a match take the time
 * between their matched neighbours.
 */

const normalize = (word: string) =>
  word
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // harakat and tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}.]/gu, "")
    .replace(/\.$/, "");

/** Drops the clitics Egyptian Arabic glues on (و، ب، ف، ل، ال) so "وبالشاشة" meets "الشاشة". */
const stem = (word: string) => word.replace(/^(و|ف)?(ب|ل|ك)?(ال)?/, "");

function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [x, y] = [stem(a), stem(b)];
  if (x.length >= 2 && x === y) return true;
  // One is the other with an ending or a prefix (لحد / لحدّ, بتتعرف / تتعرف).
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && (long.startsWith(short) || long.endsWith(short));
}

/** Start time (seconds) for every script word, in order and never going backwards. */
export function alignWords(script: string[], heard: Word[], seconds: number): number[] {
  const n = script.length;
  const m = heard.length;
  if (!n) return [];
  if (!m) return script.map((_, i) => (seconds * i) / n);

  const a = script.map(normalize);
  const b = heard.map((word) => normalize(word.text));
  // cost[i][j]: aligning the first i script words with the first j heard words.
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 match/sub, 2 skip script, 3 skip heard
  for (let i = 1; i <= n; i++) (cost[i][0] = i), (move[i][0] = 2);
  for (let j = 1; j <= m; j++) (cost[0][j] = j * 0.6), (move[0][j] = 3);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const pair = cost[i - 1][j - 1] + (similar(a[i - 1], b[j - 1]) ? 0 : 1.4);
      const skipScript = cost[i - 1][j] + 1;
      // The voice often says more words than the script (expanded numbers and names), so skipping heard words is cheaper.
      const skipHeard = cost[i][j - 1] + 0.6;
      const best = Math.min(pair, skipScript, skipHeard);
      cost[i][j] = best;
      move[i][j] = best === pair ? 1 : best === skipScript ? 2 : 3;
    }
  }

  // Walk back, keeping only real matches as anchors.
  const anchor: (number | null)[] = new Array(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (move[i][j] === 1) {
      if (similar(a[i - 1], b[j - 1])) anchor[i - 1] = heard[j - 1].start;
      i--, j--;
    } else if (move[i][j] === 2) i--;
    else j--;
  }

  // Words between anchors share the time between them; the ends run to 0 and to the scene's end.
  const times = new Array<number>(n);
  let previous = -1;
  for (let k = 0; k <= n; k++) {
    if (k < n && anchor[k] === null) continue;
    const startTime = previous < 0 ? 0 : anchor[previous]!;
    const endTime = k < n ? anchor[k]! : Math.max(startTime, seconds - 0.3);
    const gap = k - previous;
    for (let g = previous + 1; g < k; g++) times[g] = startTime + ((endTime - startTime) * (g - previous)) / gap;
    if (k < n) times[k] = anchor[k]!;
    previous = k;
  }
  for (let k = 1; k < n; k++) times[k] = Math.max(times[k], times[k - 1]);
  return times;
}
