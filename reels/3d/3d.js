// 3D reel: the diagram reel's words and 2D scenes, with its picture scenes (hook, photo, layers,
// touch, phone, timeline) drawn in three.js by stage.js. The stage is set up first so diagram.js
// hands those scenes to it. A 16:9 job (width > height) is a long YouTube video.
import { scenes } from "../lib/story.js";
import { Stage3D } from "./stage.js";

if ((window.REEL.width ?? 1080) > (window.REEL.height ?? 1920)) document.documentElement.classList.add("wide");
window.DEPTH = new Stage3D(window.REEL, scenes);
await import("../diagram/diagram.js");
