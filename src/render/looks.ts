import type { Look, Project, Scene } from "../types.ts";

/**
 * Which look a scene is drawn in. A single-look project uses its own; a mixed
 * project uses the scene's choice, or picks by what the scene shows: ideas and
 * stories on the whiteboard, code and steps on the device, numbers as motion
 * graphics.
 */
export function lookOf(project: Pick<Project, "style">, scene: Pick<Scene, "look" | "visual">): Look {
  // A versus video has no AI pictures; "motion" keeps the picture code out of its way.
  if (project.style === "versus" || project.style === "arena" || project.style === "deepdive") return "motion";
  if (project.style !== "mixed") return project.style ?? "motion";
  if (scene.look) return scene.look;
  switch (scene.visual.type) {
    case "code":
    case "list":
      return "explainer";
    case "stat":
    case "compare":
    case "chart":
      return "motion";
    default:
      return "whiteboard";
  }
}

/** Consecutive scenes that share a look; each run is rendered as its own composition. */
export function runsOf<T extends Pick<Scene, "look" | "visual">>(project: Pick<Project, "style">, scenes: T[]): { look: Look; scenes: T[] }[] {
  const runs: { look: Look; scenes: T[] }[] = [];
  for (const scene of scenes) {
    const look = lookOf(project, scene);
    const last = runs.at(-1);
    if (last && last.look === look) last.scenes.push(scene);
    else runs.push({ look, scenes: [scene] });
  }
  return runs;
}
