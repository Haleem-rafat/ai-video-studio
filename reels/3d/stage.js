// The 3D half of the 3D reel (three.js). It owns the picture scenes and draws them in a canvas
// behind the diagram reel's words: a MacBook (or iPad) built in code with the scene's press photo
// on its screen and a camera that moves around it, the display's layers exploding apart with the
// layer being talked about lit, and a finger pressing a cut-through screen with a ripple and the
// touch grid lighting up under it. Everything is a function of the time, so any frame can be drawn.
import * as THREE from "three";
import { RoomEnvironment } from "/three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "/three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildPhone, PHONES } from "./phones.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
const out3 = (v) => 1 - Math.pow(1 - clamp(v), 3);
const lerp = (a, b, k) => a + (b - a) * k;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const GLOW = 0x5ce1c6; // the cool teal of the wireframes
const OWNED = ["hook", "photo", "layers", "touch", "phone", "timeline"];
// 9:16 draws the 3D in a band under the headline; 16:9 (a long YouTube video) uses the whole frame.
const WIDE = (window.REEL.width ?? 1080) > (window.REEL.height ?? 1920);
const W = WIDE ? 1920 : 1080, H = WIDE ? 1080 : 1040, TOP = WIDE ? 0 : 330;

/** A canvas drawn once and used as a texture. */
function painted(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The look of a display layer, from its name: glass, a touch grid, OLED subpixels or a plain sheet. */
function layerFace(name) {
  const n = name.toLowerCase();
  if (/glass|زجاج|cover/.test(n)) return { kind: "glass" };
  if (/touch|sensor|لمس|حساس/.test(n)) return { kind: "grid", map: painted(512, 340, (g, w, h) => {
    g.fillStyle = "#06120f"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(92,225,198,0.85)"; g.lineWidth = 2;
    for (let x = 16; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = "rgba(92,225,198,0.45)";
    for (let y = 16; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }) };
  if (/oled|pixel|بيكسل|led/.test(n)) return { kind: "pixels", map: painted(512, 340, (g, w, h) => {
    g.fillStyle = "#050506"; g.fillRect(0, 0, w, h);
    const colors = ["#ff3b4a", "#35e06a", "#3d7bff"];
    for (let y = 6; y < h; y += 14) for (let x = 4; x < w; x += 12) { g.fillStyle = colors[Math.floor(x / 12) % 3]; g.globalAlpha = 0.75; g.fillRect(x, y, 7, 9); }
    g.globalAlpha = 1;
  }) };
  return { kind: "sheet" };
}

/** A soft round light, for halos under objects. */
const halo = () => painted(256, 256, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, "rgba(92,225,198,0.55)"); r.addColorStop(1, "rgba(92,225,198,0)");
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});

export class Stage3D {
  constructor(R, scenes) {
    this.R = R;
    this.scenes = scenes;
    this.accent = new THREE.Color(R.accent ?? "#ff3b30");

    const canvas = document.createElement("canvas");
    canvas.id = "depth";
    canvas.style.cssText = `position:absolute;left:0;top:${TOP}px;width:${W}px;height:${H}px;`;
    document.getElementById("stage").before(canvas);
    this.canvas = canvas;
    const tags = document.createElement("div");
    tags.style.cssText = `position:absolute;left:0;top:${TOP}px;width:${W}px;height:${H}px;pointer-events:none;`;
    canvas.after(tags);
    this.tags = tags;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.75;
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 200);
    // 16:9: lift the picture so it sits above the big word.
    if (WIDE) this.camera.setViewOffset(W, H, 0, 90, W, H);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 5);
    const rim = new THREE.DirectionalLight(GLOW, 2.5);
    rim.position.set(-5, 2, -4);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.15));

    // Floor: a faint grid and a halo under whatever stands on it.
    const grid = new THREE.GridHelper(24, 48, GLOW, GLOW);
    grid.material.transparent = true; grid.material.opacity = 0.09;
    grid.position.y = -0.02;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: halo(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.0;
    this.floor = new THREE.Group();
    this.floor.add(grid, glow);
    scene.add(this.floor);

    this.textures = new Map();
    this.laptop = this.buildLaptop();
    this.tablet = this.buildTablet();
    this.stacks = new Map();
    this.touch = this.buildTouch();
    scene.add(this.laptop.group, this.tablet.group, this.touch.group);

    const loader = new THREE.TextureLoader();
    const files = [...new Set(scenes.filter((s) => (s.kind === "hook" || s.kind === "photo") && s.media).map((s) => s.media))];
    this.ready = Promise.all(files.map((file) => new Promise((ok) => {
      loader.load(`/job/${file}`, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; this.textures.set(file, tex); ok(); }, undefined, () => ok());
    })));
    scenes.forEach((s, i) => { if (s.kind === "layers") { const stack = this.buildStack(s.layers ?? []); this.stacks.set(i, stack); scene.add(stack.group); } });
    // One body per iPhone model the reel shows, and the row of them for the timeline.
    this.phones = new Map();
    const models = new Set([...scenes.filter((s) => s.kind === "phone").map((s) => s.phone ?? "17pro"), ...(scenes.some((s) => s.kind === "timeline") ? (R.timeline ?? []).map((stop) => stop.phone ?? "17pro") : [])]);
    for (const model of models) { const phone = buildPhone(model); this.phones.set(model, phone); scene.add(phone.group); }
    this.row = (R.timeline ?? []).map((stop, i) => {
      const phone = buildPhone(stop.phone ?? "17pro");
      phone.group.position.x = i * 2.4;
      phone.open(1);
      return { ...stop, model: stop.phone ?? "17pro", phone };
    });
    this.rowGroup = new THREE.Group();
    for (const stop of this.row) this.rowGroup.add(stop.phone.group);
    scene.add(this.rowGroup);
  }

  owns(kind) { return OWNED.includes(kind); }

  // ---- models ---------------------------------------------------------------
  metal() { return new THREE.MeshPhysicalMaterial({ color: 0xb9bdc5, metalness: 1, roughness: 0.3, clearcoat: 0.3 }); }

  buildLaptop() {
    const group = new THREE.Group();
    const metal = this.metal();
    const base = new THREE.Mesh(new RoundedBoxGeometry(3.2, 0.11, 2.2, 4, 0.05), metal);
    base.position.y = 0.055;
    const keys = painted(1024, 380, (g, w, h) => {
      g.fillStyle = "#1a1b1f"; g.fillRect(0, 0, w, h);
      const rows = 6, cols = 14, kw = w / cols, kh = h / rows;
      g.fillStyle = "#0b0b0d";
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { g.beginPath(); g.roundRect(c * kw + 5, r * kh + 5, kw - 10, kh - 10, 8); g.fill(); }
    });
    const keyboard = new THREE.Mesh(new THREE.PlaneGeometry(2.75, 1.0), new THREE.MeshStandardMaterial({ map: keys, color: 0x6a6c72, roughness: 0.9, envMapIntensity: 0.15 }));
    keyboard.rotation.x = -Math.PI / 2;
    keyboard.position.set(0, 0.112, -0.38);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.72), new THREE.MeshPhysicalMaterial({ color: 0x8e9299, metalness: 1, roughness: 0.25, envMapIntensity: 0.6 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.112, 0.6);

    const hinge = new THREE.Group();
    hinge.position.set(0, 0.11, -1.08);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(3.2, 2.12, 0.06, 4, 0.03), metal);
    lid.position.set(0, 1.06, 0);
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(3.12, 2.04), new THREE.MeshBasicMaterial({ color: 0x030303 }));
    bezel.position.set(0, 1.06, 0.0315);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.94), screenMat);
    screen.position.set(0, 1.04, 0.033);
    const island = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    island.position.set(0, 1.97, 0.034);
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    logo.position.set(0, 1.06, -0.0315);
    logo.rotation.y = Math.PI;
    hinge.add(lid, bezel, screen, island, logo);
    group.add(base, keyboard, pad, hinge);
    return { group, hinge, screen, screenMat, size: [3.0, 1.94] };
  }

  buildTablet() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.9, 2.7, 0.07, 4, 0.12), this.metal());
    const bezel = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 2.64), new THREE.MeshBasicMaterial({ color: 0x030303 }));
    bezel.position.z = 0.0355;
    const screenMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 2.54), screenMat);
    screen.position.z = 0.037;
    group.add(body, bezel, screen);
    return { group, screen, screenMat, size: [1.74, 2.54] };
  }

  buildStack(names) {
    const group = new THREE.Group();
    const layers = names.slice(0, 6).map((name) => {
      const face = layerFace(name);
      const mat = face.kind === "glass"
        ? new THREE.MeshPhysicalMaterial({ color: 0xcfe9ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: face.map ? 0xffffff : 0x25282f, map: face.map ?? null, emissive: face.map ? 0xffffff : 0x000000, emissiveMap: face.map ?? null, emissiveIntensity: 0.35, roughness: 0.5, transparent: true, opacity: 0.95 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.05, 1.95), mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: GLOW, transparent: true, opacity: 0.9 }));
      const layer = new THREE.Group();
      layer.add(slab, edges);
      group.add(layer);
      return { layer, slab, edges, name, mat };
    });
    return { group, layers };
  }

  buildTouch() {
    const group = new THREE.Group();
    // A cut-through of the screen: glass, touch sensor, OLED, backplane, as long thin slabs.
    const parts = [
      { name: "glass", color: 0xcfe9ff, opacity: 0.25, h: 0.12 },
      { name: "touch", color: 0x0d2b25, opacity: 1, h: 0.07 },
      { name: "oled", color: 0x14161b, opacity: 1, h: 0.1 },
      { name: "oled2", color: 0x14161b, opacity: 1, h: 0.1 },
      { name: "base", color: 0x30333a, opacity: 1, h: 0.14 },
    ];
    let y = 0;
    const slabs = [];
    for (const part of [...parts].reverse()) {
      const mat = new THREE.MeshPhysicalMaterial({ color: part.color, roughness: part.name === "glass" ? 0.05 : 0.5, metalness: part.name === "base" ? 0.8 : 0, transparent: part.opacity < 1, opacity: part.opacity, depthWrite: part.opacity === 1 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(7, part.h, 2.2), mat);
      slab.position.y = y + part.h / 2;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: GLOW, transparent: true, opacity: 0.55 }));
      edges.position.copy(slab.position);
      group.add(slab, edges);
      slabs.push({ ...part, slab, y: y + part.h / 2 });
      y += part.h + 0.03;
    }
    const top = y;
    // RGB subpixels along the two OLED layers' front edge.
    const sub = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.06, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), 2 * 80);
    const colors = [new THREE.Color(0xff3b4a), new THREE.Color(0x35e06a), new THREE.Color(0x3d7bff)];
    const m = new THREE.Matrix4();
    let n = 0;
    for (const part of slabs.filter((s) => s.name.startsWith("oled"))) {
      for (let i = 0; i < 80; i++) { m.makeTranslation(-3.4 + i * 0.086, part.y, 1.111); sub.setMatrixAt(n, m); sub.setColorAt(n, colors[i % 3]); n++; }
    }
    group.add(sub);
    // The touch grid's nodes, lit near the finger.
    const nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), 40 * 6);
    const touchY = slabs.find((s) => s.name === "touch").y + 0.05;
    n = 0;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 6; j++) { m.makeTranslation(-3.3 + i * 0.17, touchY, -0.9 + j * 0.36); nodes.setMatrixAt(n++, m); }
    group.add(nodes);
    // Ripples on the glass.
    const ripples = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = top + 0.01;
      group.add(ring);
      return ring;
    });
    // The finger: a capsule with a nail, coming down at an angle.
    const finger = new THREE.Group();
    const skin = new THREE.MeshPhysicalMaterial({ color: 0xd8a27f, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0xffd9c0) });
    const digit = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 2.6, 12, 32), skin);
    digit.position.y = 1.64;
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xf2c9b8, roughness: 0.2, clearcoat: 1 }));
    nail.scale.set(1, 1.5, 0.35);
    nail.position.set(0, 0.55, 0.26);
    finger.add(digit, nail);
    finger.rotation.set(-0.35, 0, 0.12);
    group.add(finger);
    return { group, finger, ripples, nodes, top, count: n };
  }

  // ---- helpers ----------------------------------------------------------------
  /** Puts a photo on a screen, cropped to fill it. */
  showOn(device, file) {
    const tex = this.textures.get(file);
    if (!tex || device.screenMat.map === tex) return;
    const [w, h] = device.size;
    const img = tex.image, want = w / h, have = img.width / img.height;
    tex.repeat.set(have > want ? want / have : 1, have > want ? 1 : have / want);
    tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
    device.screenMat.map = tex;
    device.screenMat.needsUpdate = true;
  }

  orbit(radius, angle, height, target = [0, 0.9, 0]) {
    this.camera.position.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    this.camera.lookAt(...target);
  }

  /** The screen position (px in the page) of a point in 3D. */
  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H + TOP };
  }

  // ---- a frame ------------------------------------------------------------------
  render(t, current) {
    const s = this.scenes[current];
    const own = s && this.owns(s.kind);
    const T = 0.4;
    const enter = current === 0 ? out3(t / T) : ease((t - s.from) / T);
    const leave = current === this.scenes.length - 1 ? 0 : ease((t - s.to + T) / T);
    this.canvas.style.opacity = own ? String(Math.min(enter, 1 - leave)) : "0";
    this.tags.innerHTML = "";
    if (!own) return;
    const since = t - s.from, span = Math.max(1, s.to - s.from), k = clamp(since / span);
    this.laptop.group.visible = this.tablet.group.visible = this.touch.group.visible = this.rowGroup.visible = false;
    for (const stack of this.stacks.values()) stack.group.visible = false;
    for (const phone of this.phones.values()) phone.group.visible = false;
    this.floor.visible = true;

    if (s.kind === "hook" || s.kind === "photo") {
      const tablet = s.device === "tablet" || s.device === "phone";
      const device = tablet ? this.tablet : this.laptop;
      device.group.visible = true;
      if (s.media) this.showOn(device, s.media);
      // Each photo scene gets its own camera move.
      const variant = s.kind === "hook" ? -1 : this.scenes.slice(0, current).filter((x) => x.kind === "photo").length % 3;
      if (tablet) {
        device.group.position.set(0, 1.45, 0);
        device.group.rotation.set(-0.08, lerp(-0.6, 0.5, ease(k)), 0.04 * Math.sin(t));
        this.orbit(6.4 - 0.6 * k, 0.15, 1.7, [0, 1.4, 0]);
        device.screenMat.color.setScalar(1);
      } else {
        device.group.position.set(0, 0, 0);
        device.group.rotation.set(0, 0, 0);
        if (variant === -1) {
          // Hook: the lid opens as the camera swings round to the front, the screen lights up.
          const open = ease((since - 0.15) / 1.1);
          device.hinge.rotation.x = lerp(Math.PI / 2 - 0.02, -0.3, open);
          device.screenMat.color.setScalar(clamp((open - 0.5) * 2));
          this.orbit(lerp(9.5, 7.6, ease(k)), lerp(1.1, -0.35, ease(k)), lerp(3.4, 2.1, ease(k)), [0, 0.95, -0.3]);
        } else {
          device.hinge.rotation.x = -0.3;
          device.screenMat.color.setScalar(1);
          if (variant === 0) this.orbit(lerp(7.8, 6.9, k), lerp(-0.7, 0.2, ease(k)), 2.3, [0, 0.95, -0.3]);
          else if (variant === 1) this.orbit(lerp(7.4, 6.6, k), lerp(0.75, 0.15, ease(k)), lerp(0.9, 1.4, k), [0, 1.0, -0.4]);
          else this.orbit(lerp(6.2, 4.4, ease(k)), lerp(0.25, -0.1, k), lerp(1.9, 1.6, k), [0, 1.05, -0.9]);
        }
      }
      if (s.label && s.kind === "photo") {
        const at = this.project(new THREE.Vector3(tablet ? 0.9 : 1.6, tablet ? 2.9 : 2.25, tablet ? 0 : -1.1));
        const p = out3((since - 0.6) / 0.4);
        this.tags.innerHTML = `<div class="tag" style="left:${Math.min(W - 420, at.x - 120)}px;top:${at.y - TOP - 70}px;opacity:${p};transform:scale(${0.8 + 0.2 * p})">${esc(s.label)}</div>`;
      }
    }

    if (s.kind === "layers") {
      const stack = this.stacks.get(current);
      stack.group.visible = true;
      const count = stack.layers.length;
      const spread = ease((since - 0.2) / 1.3);
      const on = Math.min(count - 1, Math.floor(clamp((since - 1.3) / Math.max(1, span - 1.6)) * count));
      stack.group.position.set(0, 1.4, 0);
      stack.group.rotation.set(0.05, lerp(-0.55, 0.35, ease(k)), 0);
      stack.layers.forEach((layer, j) => {
        layer.layer.position.y = ((count - 1) / 2 - j) * lerp(0.07, 0.62, spread);
        const lit = since > 1.3 && j === on;
        layer.edges.material.color.set(lit ? this.accent : new THREE.Color(GLOW));
        layer.edges.material.opacity = lit ? 1 : since > 1.3 ? 0.45 : 0.9;
        if (layer.mat.emissive) layer.mat.emissiveIntensity = lit ? 0.9 : 0.35;
        layer.layer.position.x = lit ? 0.12 * out3((since - 1.3) % 1 / 0.3) : 0;
      });
      this.orbit(8.6, 0.55, 4.4, [0, 1.3, 0]);
      this.camera.updateMatrixWorld();
      // A tag beside each layer's right edge.
      this.tags.innerHTML = stack.layers.map((layer, j) => {
        const v = new THREE.Vector3(1.5, 0, 0.98);
        layer.layer.localToWorld(v);
        const at = this.project(v);
        const p = out3((since - 0.6 - j * 0.25) / 0.35);
        const lit = since > 1.3 && j === on;
        return `<div class="tag${lit ? " lit" : ""}" style="left:${Math.min(W - 330, at.x + 30)}px;top:${at.y - TOP - 26}px;opacity:${p * (since > 1.3 && !lit ? 0.55 : 1)}">${esc(layer.name)}</div>`;
      }).join("");
    }

    if (s.kind === "touch") {
      const g = this.touch;
      g.group.visible = true;
      this.floor.visible = false;
      g.group.position.set(0, 0, 0);
      const press = ease((since - 0.2) / 0.9);
      const lift = since > span - 0.8 ? ease((since - span + 0.8) / 0.6) : 0;
      const down = press * (1 - lift);
      g.finger.position.set(0.2, g.top + 0.34 + lerp(2.6, 0, down), 0.1 + lerp(1.0, 0, down));
      const hit = since - 1.1; // when the finger lands
      g.ripples.forEach((ring, i) => {
        const r = ((hit - i * 0.45) % 1.35 + 1.35) % 1.35;
        const on = hit - i * 0.45 > 0 && !lift;
        ring.position.set(0.2, g.top + 0.01, 0.1);
        ring.scale.setScalar(0.15 + r * 1.6);
        ring.material.opacity = on ? 0.9 * (1 - r / 1.35) : 0;
      });
      const c = new THREE.Color(), m = new THREE.Matrix4(), p = new THREE.Vector3();
      for (let i = 0; i < g.count; i++) {
        g.nodes.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        const d = Math.hypot(p.x - 0.2, p.z - 0.1);
        const glow = hit > 0 && !lift ? clamp(1 - d / (0.4 + Math.min(1.6, hit * 1.4))) : 0;
        c.set(GLOW).multiplyScalar(0.25 + 0.75 * glow);
        if (glow > 0.6) c.lerp(new THREE.Color(0xffd36b), (glow - 0.6) * 2);
        g.nodes.setColorAt(i, c);
      }
      g.nodes.instanceColor.needsUpdate = true;
      this.orbit(lerp(7.4, 6.6, k), lerp(0.42, 0.22, k), 2.2, [0.2, 0.7, 0]);
      // The read-out under the cut: the pressure each node feels.
      const row = [100, 100, 100, 96, 79, 60, 75, 95, 100, 100].map((v, i) => {
        const d = Math.abs(i - 5.5);
        const shown = hit > 0 && !lift ? Math.round(lerp(100, v, clamp(hit / 0.6))) : 100;
        return `<span${d < 2 && hit > 0 ? ' class="hot"' : ""}>${shown}</span>`;
      }).join("");
      this.tags.innerHTML = `<div class="readout" style="opacity:${out3((hit + 0.2) / 0.4)}">${row}</div>`;
    }

    if (s.kind === "phone") {
      const phone = this.phones.get(s.phone ?? "17pro");
      const spec = PHONES[s.phone] ?? PHONES["17pro"];
      phone.group.visible = true;
      const h = spec.h / 40;
      // It spins in showing its back (the cameras), turns to the front, then sways.
      // The back (the cameras, what changed most) is held for a moment before it turns.
      const spin = ease((since - 1.4) / 1.8);
      phone.group.position.set(WIDE ? -2.1 : -0.55, h / 2 + 0.25 + Math.sin(t * 1.3) * 0.04, 0);
      phone.group.rotation.set(-0.06, lerp(Math.PI + 0.7, 0.42, spin) + Math.sin(since * 0.6) * 0.12 * spin, lerp(0.25, 0.02, spin));
      phone.open(spec.fold ? ease((since - 1.6) / 1.4) : 1);
      this.orbit(WIDE ? 10.5 : 11.5, 0, h / 2 + 0.35, [WIDE ? -2.1 : -0.55, h / 2 + 0.25, 0]);
      this.camera.position.x += WIDE ? -0.8 : -0.3;
      this.camera.lookAt(WIDE ? -0.3 : -0.25, h / 2 + 0.25, 0);
      const pin = out3((since - 0.5) / 0.6), cin = out3((since - 0.9) / 0.6);
      this.tags.innerHTML =
        `<div class="ptitle" style="opacity:${pin};transform:translateY(${(1 - pin) * 30}px)"><b>${esc(s.year ?? "")}</b><span>${esc(s.title ?? "")}</span></div>` +
        (s.media ? `<figure class="pcard" style="opacity:${cin};transform:translateX(${(1 - cin) * 60}px) rotate(${(1 - cin) * 3}deg)"><img src="/job/${esc(s.media)}"><figcaption>${esc(s.credit ?? "")}</figcaption></figure>` : "");
    }

    if (s.kind === "timeline") {
      this.rowGroup.visible = true;
      const stops = this.row;
      const at = Math.max(0, stops.findIndex((stop) => stop.year === s.year));
      const target = s.year ? at * 2.4 : lerp(0, (stops.length - 1) * 2.4, ease(k));
      const from = s.year ? Math.max(0, at - 3) * 2.4 : 0;
      const x = s.year ? lerp(from, target, ease(since / 1.6)) : target;
      stops.forEach((stop, i) => {
        const near = 1 - clamp(Math.abs(i * 2.4 - x) / 4.8);
        stop.phone.group.rotation.set(0, -0.35 + 0.35 * near + Math.sin(t * 0.8 + i) * 0.05, 0);
        stop.phone.group.position.y = PHONES[stop.model].h / 80 + 0.2 + near * 0.35;
      });
      this.floor.position.x = x;
      this.orbit(WIDE ? 15 : 21, 0.12, 3.2, [x, 2.1, 0]);
      this.camera.position.x += x;
      this.camera.lookAt(x, 2.1, 0);
      const lit = s.year ? at : Math.round(x / 2.4);
      this.tags.innerHTML = `<div class="tline">${stops.map((stop, i) => `<span class="${i === lit ? "on" : i < lit ? "past" : ""}"><i></i>${esc(stop.year)}</span>`).join("")}</div>` +
        (stops[lit] ? `<div class="ttitle">${esc(stops[lit].title)}</div>` : "");
    } else {
      this.floor.position.x = 0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
