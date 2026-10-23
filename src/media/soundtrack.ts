import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { ROOT } from "../config.ts";
import { placeScenes, totalSeconds } from "../render/composition.ts";
import { lookOf } from "../render/looks.ts";
import { placeVersus, rowTimes } from "../render/versus.ts";
import { arenaRowTimes, hitDelay, meetAt, resultAt } from "../render/arena.ts";
import { chapterTimes, pointsOf } from "../render/proscons.ts";
import { itemTimes, photoBeat, placeDeep, planMotion } from "../render/deepdive.ts";
import { itemTimes as beatTimes, phraseTimes, placeMarketing } from "../render/marketing-kit.ts";
import type { Project } from "../types.ts";

const run = promisify(execFile);

const SFX_DIR = join(ROOT, "assets", "sfx");
const MUSIC_DIR = join(ROOT, "assets", "music");

/** A sound effect placed on the timeline: which file, when, and how loud (linear gain). */
type Cue = { sound: "whoosh" | "pop" | "click" | "typing" | "pen" | "chime"; at: number; gain: number };

/** The beats of the video a viewer should hear: cuts, numbers landing, code typing, the pen. */
export function cuesFor(project: Project): Cue[] {
  if (project.style === "versus") return project.versus?.look === "arena" ? arenaCues(project) : project.versus?.look === "proscons" ? prosConsCues(project) : versusCues(project);
  if (project.style === "deepdive") return deepCues(project);
  if (project.style === "marketing") return marketingCues(project);
  const scenes = placeScenes(project.scenes);
  const total = totalSeconds(scenes);
  const cues: Cue[] = [];
  scenes.forEach((scene, index) => {
    const look = lookOf(project, scene);
    if (index > 0) cues.push({ sound: "whoosh", at: scene.start - 0.12, gain: 0.35 });
    if (["stat", "compare", "chart"].includes(scene.visual.type)) cues.push({ sound: "pop", at: scene.start + 0.35, gain: 0.45 });
    if (scene.visual.type === "code" && look !== "motion") cues.push({ sound: "typing", at: scene.start + 0.45, gain: 0.22 });
    if (scene.visual.type === "list" && look === "explainer") cues.push({ sound: "click", at: scene.start + 0.7, gain: 0.3 });
    if (look === "whiteboard" && scene.image) cues.push({ sound: "pen", at: scene.start + 0.5, gain: 0.16 });
  });
  cues.push({ sound: "chime", at: Math.max(0, total - 2.2), gain: 0.3 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/** A pros-and-cons video's beats: a whoosh per chapter card, a pop per pro, a click per con, a chime per chapter won, the subscribe click. */
function prosConsCues(project: Project): Cue[] {
  const { scenes, outro, total } = placeVersus(project);
  const cues: Cue[] = [{ sound: "whoosh", at: 0.2, gain: 0.45 }];
  scenes.forEach((scene, index) => {
    if (index === 0) return;
    cues.push({ sound: "whoosh", at: scene.start - 1.35, gain: 0.45 });
    const kind = scene.visual.kind ?? "chapter";
    if (kind !== "chapter" && kind !== "problems") return;
    const times = chapterTimes(scene);
    pointsOf(scene.visual).forEach((point, i) => cues.push({ sound: point.good ? "pop" : "click", at: scene.start + times.points[i], gain: point.good ? 0.25 : 0.3 }));
    if (scene.visual.verdict === "a" || scene.visual.verdict === "b") cues.push({ sound: "chime", at: scene.start + times.verdict, gain: 0.25 });
  });
  cues.push({ sound: "pop", at: outro, gain: 0.35 }, { sound: "click", at: outro + 1.15, gain: 0.6 }, { sound: "chime", at: total - 2, gain: 0.3 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/** A versus video's beats: the intro slam, a whoosh per wipe, a pop per row, a chime per win, the subscribe click. */
function versusCues(project: Project): Cue[] {
  const { scenes, outro, total } = placeVersus(project);
  const cues: Cue[] = [
    { sound: "whoosh", at: 0.05, gain: 0.5 },
    { sound: "whoosh", at: 0.15, gain: 0.4 },
    { sound: "pop", at: 0.95, gain: 0.8 },
  ];
  scenes.forEach((scene, index) => {
    if (index > 0) cues.push({ sound: "whoosh", at: scene.start - 0.6, gain: 0.45 });
    rowTimes(scene).forEach((at, row) => {
      cues.push({ sound: "pop", at, gain: 0.2 });
      if (scene.visual.rows[row].winner) cues.push({ sound: "chime", at: at + 0.4, gain: 0.18 });
    });
  });
  cues.push({ sound: "pop", at: outro, gain: 0.35 }, { sound: "click", at: outro + 1.15, gain: 0.6 }, { sound: "chime", at: total - 2, gain: 0.3 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/**
 * An arena video's beats: a whoosh per montage cut, the slam when the fighters
 * meet, a whoosh per glitch cut and a pop on each round card, a pop as each
 * duel lands and a hard pop with a chime when a hit lands, then the result.
 */
function arenaCues(project: Project): Cue[] {
  const { scenes, outro, total } = placeVersus(project);
  const cues: Cue[] = [];
  const intro = scenes[0];
  if (intro) {
    const cuts = Math.min(10, (project.versus?.a.photos?.length ?? 0) + (project.versus?.b.photos?.length ?? 0));
    const step = Math.max(0.7, Math.min(1.1, (intro.seconds + 0.4) / Math.max(1, cuts)));
    for (let i = 0; i < cuts; i++) cues.push({ sound: "whoosh", at: i * step, gain: 0.28 });
    const meet = meetAt(intro.seconds);
    cues.push({ sound: "whoosh", at: meet, gain: 0.5 }, { sound: "pop", at: meet + 0.85, gain: 0.9 }, { sound: "chime", at: meet + 1, gain: 0.25 });
  }
  scenes.forEach((scene, index) => {
    if (index === 0) return;
    cues.push({ sound: "whoosh", at: scene.start - 1.15, gain: 0.5 }, { sound: "pop", at: scene.start - 0.85, gain: 0.55 });
    arenaRowTimes(scene).forEach((at, row) => {
      cues.push({ sound: "pop", at: scene.start + at, gain: 0.22 });
      const line = scene.visual.rows[row];
      if (line.winner) cues.push({ sound: "pop", at: scene.start + at + hitDelay(line), gain: 0.7 }, { sound: "chime", at: scene.start + at + hitDelay(line) + 0.1, gain: 0.16 });
    });
  });
  const last = scenes.at(-1);
  if (last) cues.push({ sound: "pop", at: resultAt(last) + 0.4, gain: 0.9 }, { sound: "chime", at: resultAt(last) + 0.5, gain: 0.35 });
  cues.push({ sound: "pop", at: outro, gain: 0.35 }, { sound: "click", at: outro + 1.25, gain: 0.6 }, { sound: "chime", at: total - 2, gain: 0.3 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/** A deep dive's beats: a whoosh per chapter wipe, a soft pop as each block, step or point lands, the subscribe click. */
function deepCues(project: Project): Cue[] {
  const { scenes, outro, total } = placeDeep(project);
  const cues: Cue[] = [{ sound: "whoosh", at: 0.05, gain: 0.45 }];
  const motions = planMotion(scenes);
  scenes.forEach((scene, index) => {
    // A whoosh on each montage cut, a softer one when a gallery moves on.
    const motion = motions[index];
    if (motion.pictures.length > 1 || motion.tail !== null)
      motion.cuts.slice(1).forEach((cut) => cues.push({ sound: "whoosh", at: scene.start + cut, gain: motion.montage ? 0.3 : 0.12 }));
    if (motion.tail !== null) cues.push({ sound: "whoosh", at: scene.start + motion.tail, gain: 0.18 });
    if (index > 0) cues.push({ sound: "whoosh", at: scene.start - 0.6, gain: 0.4 });
    if (scene.visual.layout === "grid") {
      // The cards pop in as a wave; a tick on every other card keeps it light.
      const step = Math.min(0.18, (scene.seconds * 0.5) / Math.max(1, scene.visual.items.length));
      scene.visual.items.forEach((_, i) => i % 2 || cues.push({ sound: "pop", at: scene.start + photoBeat(scene) + 0.2 + i * step, gain: 0.12 }));
    } else if (scene.visual.layout === "stat") cues.push({ sound: "pop", at: scene.start + photoBeat(scene) + 0.15, gain: 0.5 });
    else itemTimes(scene).forEach((at) => cues.push({ sound: "pop", at: scene.start + at, gain: 0.16 }));
  });
  cues.push({ sound: "pop", at: outro, gain: 0.35 }, { sound: "click", at: outro + 1.15, gain: 0.6 }, { sound: "chime", at: total - 2, gain: 0.3 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/**
 * A marketing video's beats, kept light: a soft whoosh between scenes, a pop
 * per on-screen phrase and item, clicks where the booking widget is tapped,
 * a chime when the booking is confirmed and on the call to action.
 */
function marketingCues(project: Project): Cue[] {
  const { scenes, total } = placeMarketing(project);
  const cues: Cue[] = [];
  scenes.forEach((scene, index) => {
    const t = scene.start;
    const D = scene.seconds;
    if (index > 0) cues.push({ sound: "whoosh", at: t - 0.4, gain: 0.22 });
    phraseTimes(scene).forEach((at) => cues.push({ sound: "pop", at: t + at, gain: 0.18 }));
    switch (scene.visual.beat) {
      case "journey":
        cues.push({ sound: "pop", at: t + D * 0.16, gain: 0.3 }, { sound: "click", at: t + D * 0.4, gain: 0.35 });
        break;
      case "pain":
        beatTimes(scene, 0.08, 0.7).forEach((at) => cues.push({ sound: "pop", at: t + at, gain: 0.28 }));
        break;
      case "booking": {
        const E = D >= 8 ? 0.55 : 0.9;
        [0.14, 0.38, 0.62, 0.8].forEach((f) => cues.push({ sound: "click", at: t + D * E * f, gain: 0.4 }));
        cues.push({ sound: "chime", at: t + D * E * 0.86, gain: 0.3 });
        if (D >= 8) cues.push({ sound: "whoosh", at: t + D * 0.72, gain: 0.2 }, { sound: "pop", at: t + D * 0.72 + 1, gain: 0.3 });
        break;
      }
      case "traffic":
        cues.push({ sound: "whoosh", at: t + D * 0.35, gain: 0.18 });
        break;
      case "dashboard":
        beatTimes(scene, 0.12, 0.55).forEach((at) => cues.push({ sound: "pop", at: t + at, gain: 0.16 }));
        cues.push({ sound: "chime", at: t + D * 0.72, gain: 0.2 });
        break;
      case "recap":
        [0.1, 0.32, 0.54].forEach((f) => cues.push({ sound: "pop", at: t + D * f, gain: 0.25 }));
        break;
      case "cta":
        cues.push({ sound: "pop", at: t + 0.3, gain: 0.4 }, { sound: "chime", at: t + 0.5, gain: 0.25 });
        break;
      case "sting":
        cues.push({ sound: "whoosh", at: t - 0.1, gain: 0.35 }, { sound: "pop", at: t + 1.05, gain: 0.45 }, { sound: "chime", at: t + 1.5, gain: 0.25 });
        break;
      case "chaos":
        beatTimes(scene, 0.02, 0.3).forEach((at) => cues.push({ sound: "pop", at: t + at, gain: 0.14 }));
        cues.push({ sound: "whoosh", at: t + D * 0.58, gain: 0.3 }, { sound: "chime", at: t + D * 0.58 + 1.1, gain: 0.25 });
        break;
      case "path":
      case "notify":
        beatTimes(scene, scene.visual.beat === "path" ? 0.1 : 0.15, scene.visual.beat === "path" ? 0.8 : 0.75).forEach((at) => cues.push({ sound: "pop", at: t + at, gain: 0.25 }));
        break;
      case "stat":
        cues.push({ sound: "chime", at: t + Math.min(D * 0.55, 2.2), gain: 0.3 });
        break;
      case "split":
        cues.push({ sound: "whoosh", at: t + D * 0.5, gain: 0.3 });
        break;
      case "orbit":
        cues.push({ sound: "whoosh", at: t + D * 0.68, gain: 0.25 }, { sound: "pop", at: t + D * 0.68 + 0.5, gain: 0.35 });
        break;
    }
  });
  cues.push({ sound: "chime", at: total - 2, gain: 0.2 });
  return cues.filter((cue) => cue.at >= 0 && existsSync(join(SFX_DIR, `${cue.sound}.mp3`)));
}

/** The channel's own bed if there is one (assets/music/<channel>.mp3), else the first track. */
function musicFor(channel: string): string | null {
  if (!existsSync(MUSIC_DIR)) return null;
  const own = join(MUSIC_DIR, `${channel}.mp3`);
  if (existsSync(own)) return own;
  const first = readdirSync(MUSIC_DIR).filter((file) => file.endsWith(".mp3")).sort()[0];
  return first ? join(MUSIC_DIR, first) : null;
}

/**
 * Mixes music and sound effects under the narration already in `input`.
 *
 * The bed sits about 18 dB down and ducks further whenever the voice speaks
 * (sidechain compression keyed by the narration), so it fills pauses without
 * competing with words. The result is normalised to -14 LUFS, YouTube's
 * playback level. The picture is copied untouched.
 */
export async function addSoundtrack(project: Project, input: string, output: string): Promise<void> {
  const total = project.style === "versus" ? placeVersus(project).total : project.style === "marketing" ? placeMarketing(project).total : project.style === "deepdive" ? placeDeep(project).total : totalSeconds(placeScenes(project.scenes));
  const music = musicFor(project.channel);
  const cues = cuesFor(project);
  const sounds = [...new Set(cues.map((cue) => cue.sound))];

  const args = ["-v", "error", "-y", "-i", input];
  if (music) args.push("-stream_loop", "-1", "-i", music);
  const firstSfx = music ? 2 : 1;
  for (const sound of sounds) args.push("-i", join(SFX_DIR, `${sound}.mp3`));

  const graph: string[] = [];
  const mix: string[] = ["[voice]"];
  graph.push(music ? "[0:a]asplit=2[voice][key]" : "[0:a]anull[voice]");
  if (music) {
    const fadeOut = Math.max(0, total - 2.5).toFixed(2);
    graph.push(`[1:a]atrim=0:${total.toFixed(2)},volume=0.12,afade=t=in:d=1.5,afade=t=out:st=${fadeOut}:d=2.5[bed]`);
    graph.push("[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[ducked]");
    mix.push("[ducked]");
  }
  sounds.forEach((sound, s) => {
    const mine = cues.filter((cue) => cue.sound === sound);
    const labels = mine.map((_, i) => `[${sound}${i}]`);
    graph.push(`[${firstSfx + s}:a]asplit=${mine.length}${labels.join("")}`);
    mine.forEach((cue, i) => {
      const ms = Math.round(cue.at * 1000);
      graph.push(`[${sound}${i}]adelay=${ms}:all=1,volume=${cue.gain}[${sound}${i}d]`);
      mix.push(`[${sound}${i}d]`);
    });
  });
  graph.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first[mixed]`);
  graph.push("[mixed]loudnorm=I=-14:TP=-1.5:LRA=11[out]");

  args.push("-filter_complex", graph.join(";"), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", output);
  await run("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024 });
}
