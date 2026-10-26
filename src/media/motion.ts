import { spawn } from "node:child_process";

import { stillStretches } from "../render/marketing-pace.ts";

const FPS = 4;
const SIDE = 96;

/** How much each sampled frame differs from the next: mean change per pixel (0-255) of tiny grey frames, `FPS` a second. */
export function frameChanges(video: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", video, "-vf", `fps=${FPS},scale=${SIDE}:${SIDE},format=gray`, "-f", "rawvideo", "pipe:1"]);
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg stopped (${code}) reading ${video}`));
      const all = Buffer.concat(chunks);
      const size = SIDE * SIDE;
      const out: number[] = [];
      for (let at = size; at + size <= all.length; at += size) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += Math.abs(all[at + i] - all[at - size + i]);
        out.push(sum / size);
      }
      resolve(out);
    });
  });
}

/** The stretches of a video where the picture holds still for `min` seconds or more. */
export async function stillMoments(video: string, min = 2.5): Promise<{ from: number; to: number }[]> {
  return stillStretches(await frameChanges(video), FPS, min, QUIET);
}

/** Below this mean change per pixel a frame counts as still: drifting particles and grain alone stay under it. */
export const QUIET = 1;
