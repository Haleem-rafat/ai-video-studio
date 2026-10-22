import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { loadClient } from "../store.ts";
import { renderDesignPreviews } from "../design-previews.ts";
import { DESIGN_IDS } from "../designs.ts";
const run = promisify(execFile);
const out = process.argv[2];
const client = await loadClient("risero");
const lang = (process.argv[3] ?? "ar") as "ar" | "en";
const slides = ["cover", "list", "mythfact", "stat", "cta"] as const;
await renderDesignPreviews({ ...client, language: lang }, () => {}, { slides, out: (d, s) => join(out, `${lang}-${d}-${s}.png`), scale: 0.3 });
// One sheet per design: its five slides in a row.
for (const d of DESIGN_IDS) await run("ffmpeg", ["-v", "error", "-y", ...slides.flatMap((s) => ["-i", join(out, `${lang}-${d}-${s}.png`)]), "-filter_complex", `hstack=${slides.length}`, join(out, `row-${lang}-${d}.png`)]);
for (const [i, group] of [DESIGN_IDS.slice(0, 4), DESIGN_IDS.slice(4, 8), DESIGN_IDS.slice(8, 12)].entries())
  await run("ffmpeg", ["-v", "error", "-y", ...group.flatMap((d) => ["-i", join(out, `row-${lang}-${d}.png`)]), "-filter_complex", `vstack=${group.length}`, join(out, `sheet-${lang}-${i + 1}.png`)]);
console.log("done");
