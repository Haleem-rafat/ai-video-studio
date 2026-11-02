// iPhone bodies for the 3D reel, one per design generation, built from their real measurements
// (millimetres): the outline and its corner radius, round or flat sides, the front (home button,
// notch, Dynamic Island) and the back (camera layout, bump or plateau, finish). Drawn in code;
// the reel shows the real photo beside it.
import * as THREE from "three";

const MM = 1 / 40; // 40 mm = 1 unit

/**
 * x, y on the back are measured from the top-left corner as you look at the back.
 * front: home | notch | island. bump: a raised plate the cameras sit on.
 */
export const PHONES = {
  original: { w: 61, h: 115, d: 11.6, r: 10, edge: "round", frame: 0xb7bbc1, back: 0xa9adb3, finish: "metal", strip: 0x111111, front: "home", bezel: [20, 4, 22], cams: [[9, 9, 2.6]] },
  "3g": { w: 62.1, h: 115.5, d: 12.3, r: 11, edge: "round", frame: 0xd8dadd, back: 0x0c0c0e, finish: "gloss", front: "home", bezel: [20, 4, 22], cams: [[9, 9, 2.6]] },
  4: { w: 58.6, h: 115.2, d: 9.3, r: 8, edge: "flat", frame: 0xcfd2d6, back: 0x0b0b0c, finish: "gloss", front: "home", bezel: [20, 5, 20], cams: [[7.5, 7.5, 2.8]], flash: [15, 7.5] },
  5: { w: 58.6, h: 123.8, d: 7.6, r: 8, edge: "flat", frame: 0x2a2b2f, back: 0x2c2d31, finish: "metal", strip: 0x111114, front: "home", bezel: [18, 4.5, 18], cams: [[7.5, 7.5, 2.8]], flash: [15, 7.5] },
  6: { w: 67, h: 138.1, d: 6.9, r: 10, edge: "round", frame: 0x8c8f95, back: 0x8c8f95, finish: "metal", front: "home", bezel: [18, 4.5, 17], cams: [[9, 9, 3.6]], camRing: true, flash: [18, 9] },
  7: { w: 67.1, h: 138.3, d: 7.1, r: 10, edge: "round", frame: 0x161618, back: 0x111113, finish: "gloss", front: "home", bezel: [18, 4.5, 17], cams: [[9.5, 9.5, 4.4]], camRing: true, flash: [19.5, 9.5] },
  x: { w: 70.9, h: 143.6, d: 7.7, r: 12, edge: "flat", frame: 0xd4d6da, back: 0xeeeeec, finish: "gloss", front: "notch", bezel: [4, 4, 4], bump: [5, 5, 13, 27, 6.5], cams: [[11.5, 11.5, 4], [11.5, 25.5, 4]], flash: [11.5, 18.5] },
  11: { w: 75.7, h: 150.9, d: 8.3, r: 12, edge: "flat", frame: 0xb6d9c6, back: 0xc6e6d4, finish: "gloss", front: "notch", bezel: [4.5, 4.5, 4.5], bump: [5, 5, 31, 31, 8], cams: [[13, 13, 5.5], [13, 28, 5.5]], flash: [28, 13] },
  "11pro": { w: 71.4, h: 144, d: 8.1, r: 12, edge: "flat", frame: 0x4f5a54, back: 0x5b665f, finish: "matte", front: "notch", bezel: [4, 4, 4], bump: [5, 5, 33, 33, 8], cams: [[13, 13, 5.2], [13, 29, 5.2], [27, 21, 5.2]], flash: [27, 10] },
  12: { w: 71.5, h: 146.7, d: 7.4, r: 11, edge: "flat", frame: 0x2f4b6e, back: 0x2b4a72, finish: "gloss", front: "notch", bezel: [4, 4, 4], bump: [5, 5, 30, 30, 7.5], cams: [[12.5, 12.5, 5.3], [12.5, 27.5, 5.3]], flash: [27, 12.5] },
  13: { w: 71.5, h: 146.7, d: 7.65, r: 11, edge: "flat", frame: 0xf0d3d4, back: 0xf5dcdc, finish: "gloss", front: "notch-s", bezel: [4, 4, 4], bump: [5, 5, 30, 30, 7.5], cams: [[12.5, 12.5, 5.3], [27, 27, 5.3]], flash: [27, 12.5] },
  "14pro": { w: 71.5, h: 147.5, d: 7.85, r: 11, edge: "flat", frame: 0x5b5166, back: 0x625a6e, finish: "matte", front: "island", bezel: [3.5, 3.5, 3.5], bump: [4.5, 4.5, 36, 37, 9], cams: [[14, 14, 6.2], [14, 32, 6.2], [30, 23, 6.2]], flash: [30, 10] },
  15: { w: 71.6, h: 147.6, d: 7.8, r: 11, edge: "flat", frame: 0xf2c9cf, back: 0xf4d6da, finish: "matte", front: "island", bezel: [3.5, 3.5, 3.5], bump: [5, 5, 31, 31, 8], cams: [[13, 13, 5.6], [27.5, 27.5, 5.6]], flash: [28, 12] },
  16: { w: 71.6, h: 147.6, d: 7.8, r: 11, edge: "flat", frame: 0x4565d4, back: 0x5a78e0, finish: "matte", front: "island", bezel: [3.5, 3.5, 3.5], bump: [5, 5, 17, 35, 8.5], cams: [[13.5, 13.5, 5.6], [13.5, 31.5, 5.6]], flash: [27, 12] },
  17: { w: 71.5, h: 149.6, d: 7.95, r: 11, edge: "flat", frame: 0xb7a9d6, back: 0xc4b8e0, finish: "matte", front: "island", bezel: [3.2, 3.2, 3.2], bump: [5, 5, 17, 35, 8.5], cams: [[13.5, 13.5, 5.6], [13.5, 31.5, 5.6]], flash: [27, 12] },
  air: { w: 74.7, h: 156.2, d: 5.64, r: 13, edge: "flat", frame: 0xd9d6cf, back: 0xe7e4dc, finish: "matte", front: "island", bezel: [3.2, 3.2, 3.2], bump: [3, 6, 68.7, 20, 10], cams: [[13, 16, 5.8]], flash: [26, 16] },
  "17pro": { w: 71.9, h: 150, d: 8.75, r: 11, edge: "flat", frame: 0xdc7032, back: 0xe07a3c, finish: "metal", front: "island", bezel: [3.2, 3.2, 3.2], bump: [2.5, 3.5, 66.9, 44, 12], cams: [[14, 14, 6.4], [14, 33, 6.4], [31, 23.5, 6.4]], flash: [56, 14] },
  "18pro": { w: 71.9, h: 150, d: 8.75, r: 11, edge: "flat", frame: 0x6a2030, back: 0x71263a, finish: "metal", front: "island-s", bezel: [3.2, 3.2, 3.2], bump: [2.5, 3.5, 66.9, 44, 12], cams: [[14, 14, 6.4], [14, 33, 6.4], [31, 23.5, 6.4]], flash: [56, 14] },
  duo: { w: 62, h: 128, d: 4.8, r: 11, edge: "flat", frame: 0xe8e6e1, back: 0xefede8, finish: "matte", front: "island", bezel: [3, 3, 3], bump: [4, 5, 36, 18, 9], cams: [[13, 14, 5.4], [27, 14, 5.4]], flash: [37, 14], fold: true },
};

/** A rounded rectangle centred on 0, in units. */
function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A flat shape whose UVs run 0–1 over its box, so a texture fills it. */
function flat(w, h, r) {
  const g = new THREE.ShapeGeometry(rounded(w, h, r), 24);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  return g;
}

const finishOf = (color, finish) => new THREE.MeshPhysicalMaterial({
  color,
  metalness: finish === "metal" ? 0.9 : 0.1,
  roughness: finish === "gloss" ? 0.08 : finish === "matte" ? 0.55 : 0.32,
  clearcoat: finish === "gloss" ? 1 : 0.2,
  clearcoatRoughness: 0.1,
});

/** A home screen for the era: icon grid and dock, old (2007–2012) or modern. */
export function homeScreen(old) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 1024;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 512, 1024);
  if (old) { bg.addColorStop(0, "#0b0b10"); bg.addColorStop(1, "#1d2230"); }
  else { bg.addColorStop(0, "#ff7a59"); bg.addColorStop(0.5, "#7b4dff"); bg.addColorStop(1, "#1a8cff"); }
  g.fillStyle = bg; g.fillRect(0, 0, 512, 1024);
  const colors = ["#34c759", "#ff9500", "#ff2d55", "#5ac8fa", "#ffcc00", "#af52de", "#007aff", "#ff3b30", "#30b0c7", "#a2845e", "#64d2ff", "#ffd60a"];
  const cols = 4, size = 84, gap = (512 - cols * size) / (cols + 1);
  for (let i = 0; i < (old ? 16 : 20); i++) {
    const x = gap + (i % cols) * (size + gap), y = 110 + Math.floor(i / cols) * (size + 46);
    g.fillStyle = colors[i % colors.length];
    g.beginPath(); g.roundRect(x, y, size, size, old ? 16 : 22); g.fill();
    if (old) { g.fillStyle = "rgba(255,255,255,0.28)"; g.beginPath(); g.roundRect(x, y, size, size / 2, [16, 16, 4, 4]); g.fill(); }
  }
  g.fillStyle = old ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.25)";
  g.beginPath(); g.roundRect(24, 880, 464, 120, 40); g.fill();
  for (let i = 0; i < 4; i++) { g.fillStyle = colors[(i * 3) % colors.length]; g.beginPath(); g.roundRect(gap + i * (size + gap), 898, size, size, 22); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One phone slab: body, front glass and screen, back with cameras. Faces +z (front). */
function slab(spec, screenMap, { back = true, front = true } = {}) {
  const w = spec.w * MM, h = spec.h * MM, d = spec.d * MM, r = spec.r * MM;
  const group = new THREE.Group();
  const side = finishOf(spec.frame, spec.edge === "flat" ? "metal" : spec.finish);
  const bevel = spec.edge === "round" ? d * 0.45 : d * 0.12;
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(rounded(w - 2 * bevel * 0.9, h - 2 * bevel * 0.9, Math.max(0.01, r - bevel)), { depth: d - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 6, curveSegments: 24 }), side);
  body.position.z = -(d - 2 * bevel) / 2;
  group.add(body);
  const faceW = w - 2 * bevel * 0.9 + 0.002, faceH = h - 2 * bevel * 0.9 + 0.002, faceR = Math.max(0.01, r - bevel);
  if (front) {
    const glass = new THREE.Mesh(flat(faceW, faceH, faceR), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1, metalness: 0 }));
    glass.position.z = d / 2 + 0.001;
    const [top, sideB, bottom] = spec.bezel.map((v) => v * MM);
    const sw = w - 2 * sideB, sh = h - top - bottom;
    const modern = spec.front !== "home";
    const screen = new THREE.Mesh(flat(sw, sh, modern ? r - sideB : 0.01), new THREE.MeshBasicMaterial({ map: screenMap, toneMapped: false }));
    screen.position.set(0, (bottom - top) / 2, d / 2 + 0.002);
    group.add(glass, screen);
    if (spec.front === "home") {
      const button = new THREE.Mesh(new THREE.CircleGeometry(4.8 * MM, 40), new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.3, clearcoat: 1 }));
      button.position.set(0, -h / 2 + bottom / 2, d / 2 + 0.0025);
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.6 * MM, 5.0 * MM, 40), new THREE.MeshStandardMaterial({ color: 0x3a3b40, metalness: 0.8, roughness: 0.3 }));
      ring.position.copy(button.position).setZ(d / 2 + 0.003);
      const speaker = new THREE.Mesh(flat(10 * MM, 1.4 * MM, 0.7 * MM), new THREE.MeshBasicMaterial({ color: 0x1a1a1c }));
      speaker.position.set(0, h / 2 - top / 2, d / 2 + 0.0025);
      group.add(button, ring, speaker);
    } else {
      const cut = spec.front === "notch" ? [34, 5.6, 3] : spec.front === "notch-s" ? [27, 5.6, 3] : spec.front === "island-s" ? [17, 5.2, 2.6] : [21, 6, 3];
      const [cw, ch, cr] = cut.map((v) => v * MM);
      const notch = new THREE.Mesh(flat(cw, spec.front.startsWith("notch") ? ch * 2 : ch, cr), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      notch.position.set(0, spec.front.startsWith("notch") ? h / 2 - top : h / 2 - top - 3 * MM - ch / 2, d / 2 + 0.003);
      group.add(notch);
    }
  }
  if (back) {
    const plate = new THREE.Mesh(flat(faceW, faceH, faceR), finishOf(spec.back, spec.finish));
    plate.rotation.y = Math.PI;
    plate.position.z = -d / 2 - 0.001;
    group.add(plate);
    // Looking at the back, x runs to the left in the phone's own space.
    const at = (x, y) => [w / 2 - x * MM, h / 2 - y * MM];
    if (spec.strip) {
      for (const y of [7, spec.h - 7]) {
        const strip = new THREE.Mesh(flat(faceW * 0.99, 14 * MM, 0.01), new THREE.MeshPhysicalMaterial({ color: spec.strip, roughness: 0.1, clearcoat: 1 }));
        strip.rotation.y = Math.PI;
        const [, sy] = at(0, y);
        strip.position.set(0, spec.strip && spec.w < 60 && y > 50 ? sy : sy, -d / 2 - 0.0015);
        if (spec === PHONES.original && y < 50) continue; // the original has only the bottom strip
        group.add(strip);
      }
    }
    let lift = 0;
    if (spec.bump) {
      const [bx, by, bw, bh, br] = spec.bump;
      lift = 1.3 * MM;
      const bump = new THREE.Mesh(new THREE.ExtrudeGeometry(rounded(bw * MM, bh * MM, br * MM), { depth: lift, bevelEnabled: true, bevelThickness: 0.2 * MM, bevelSize: 0.4 * MM, bevelSegments: 3, curveSegments: 24 }), finishOf(spec.back, spec.finish === "matte" ? "gloss" : spec.finish));
      const [cx, cy] = at(bx + bw / 2, by + bh / 2);
      bump.position.set(cx, cy, -d / 2 - lift);
      group.add(bump);
    }
    for (const [x, y, rad] of spec.cams) {
      const [cx, cy] = at(x, y);
      const R = rad * MM;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1.2 * MM + (spec.camRing ? 0.6 * MM : 0), 40), new THREE.MeshStandardMaterial({ color: 0x9a9da3, metalness: 1, roughness: 0.25 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, cy, -d / 2 - lift - 0.6 * MM);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(R * 0.78, 40), new THREE.MeshPhysicalMaterial({ color: 0x05070c, roughness: 0.02, clearcoat: 1, metalness: 0.2 }));
      lens.rotation.y = Math.PI;
      lens.position.set(cx, cy, -d / 2 - lift - 1.25 * MM - (spec.camRing ? 0.6 * MM : 0));
      const glint = new THREE.Mesh(new THREE.CircleGeometry(R * 0.3, 24), new THREE.MeshBasicMaterial({ color: 0x2a3a6a, transparent: true, opacity: 0.8 }));
      glint.rotation.y = Math.PI;
      glint.position.copy(lens.position).setZ(lens.position.z - 0.0005);
      group.add(ring, lens, glint);
    }
    if (spec.flash) {
      const [fx, fy] = at(...spec.flash);
      const flash = new THREE.Mesh(new THREE.CircleGeometry(1.8 * MM, 24), new THREE.MeshStandardMaterial({ color: 0xf3e9c8, emissive: 0x3a3320, roughness: 0.4 }));
      flash.rotation.y = Math.PI;
      flash.position.set(fx, fy, -d / 2 - lift - 0.0015);
      group.add(flash);
    }
    // The Apple logo, as the system font draws it.
    const logoTex = (() => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.font = "110px -apple-system, 'SF Pro Display', 'Helvetica Neue'"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("", 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(16 * MM, 16 * MM), new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, metalness: 0.9, roughness: 0.2, color: spec.finish === "metal" || spec.back > 0x888888 ? 0xd9dadc : 0xbfc0c4 }));
    logo.rotation.y = Math.PI;
    logo.position.set(0, spec.front === "home" ? h * 0.12 : 0, -d / 2 - 0.002);
    group.add(logo);
  }
  return group;
}

/**
 * The phone for a model, standing up and facing +z. A foldable is two halves on a hinge;
 * `open(k)` (0 closed – 1 flat open) turns its right half.
 */
export function buildPhone(model) {
  const spec = PHONES[model] ?? PHONES["17pro"];
  const old = ["original", "3g", "4", "5"].includes(model);
  const screen = homeScreen(old);
  const group = new THREE.Group();
  if (!spec.fold) {
    group.add(slab(spec, screen));
    return { group, spec, open: () => {} };
  }
  // Duo: the left half carries the cameras; the right half swings round the hinge on its left edge.
  const w = spec.w * MM;
  const left = slab(spec, screen);
  left.position.x = -w / 2;
  // The hinge sits on the back face, so the closed half folds behind the left one.
  const d = spec.d * MM;
  const hinge = new THREE.Group();
  hinge.position.z = -d / 2;
  const right = slab({ ...spec, cams: [], flash: null, bump: null }, screen, {});
  right.position.set(w / 2, 0, d / 2);
  hinge.add(right);
  group.add(left, hinge);
  return { group, spec, open: (k) => { hinge.rotation.y = -Math.PI * (1 - k) * 0.98; } };
}
