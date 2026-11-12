import * as THREE from "three";

const C = {
  ground: "#14181F",
  paper: "#E7E1D4",
  ink: "#F2F4F7",
  accent: "#FF5C1A",
  hud: "#8E99A8",
  spot: "#FFE6C4",
  skin: "#E4C7A8",
  hair: "#1C1916",
  cloth: "#3A4450",
  suit: "#23282E",
  wood: "#3A3128",
  screen: "#1E4C56",
  key: "#2A3138",
};

const FOV = 28;
const BASE_DIST = 8.1;
const FRAME_H = 2 * BASE_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const PX_PER_M = 1920 / FRAME_H;

const hook1 = document.getElementById("hook1");
const hook2 = document.getElementById("hook2");
const termEl = document.getElementById("term");
const subEl = document.getElementById("sub");
const gapEl = document.getElementById("gap");

let timeline, B, renderer, scene, camera, spot;
let frank, reader, watcher, coat, check, pen, desk, cities, seminar, motes, screen;
const maps = {};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, u) { return a + (b - a) * u; }
function smooth(u) { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); }
function easeOutBez(u) { return sampleBezier(u, 0.16, 1, 0.3, 1); }
function easeInOutBez(u) { return sampleBezier(u, 0.65, 0, 0.35, 1); }

function sampleBezier(u, x1, y1, x2, y2) {
  let t = u;
  for (let i = 0; i < 8; i++) {
    const mt = 1 - t;
    const x = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t;
    const dx = 3 * mt * mt * x1 + 6 * mt * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dx) < 1e-5) break;
    t = clamp(t - (x - u) / dx, 0, 1);
  }
  const mt = 1 - t;
  return 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t;
}

function lerpZoom(a, b, u) {
  return Math.exp(lerp(Math.log(a), Math.log(b), u));
}

function sceneAt(t) {
  for (const s of timeline.scenes) if (t >= s.start && t < s.end) return s;
  return timeline.scenes[timeline.scenes.length - 1];
}

function cameraPose(t) {
  const keys = timeline.camera;
  if (t <= keys[0].t) return { ...keys[0] };
  let i = 1;
  while (i < keys.length - 1 && keys[i].t <= t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const ease = b.ease || "in-out";
  const span = Math.max(1e-4, b.t - a.t);
  const held = () => ({ zoom: a.zoom, x: a.x, y: a.y });
  const mix = (u) => ({
    zoom: lerpZoom(a.zoom, b.zoom, u),
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
  });
  if (t >= b.t) return { zoom: b.zoom, x: b.x, y: b.y };
  if (ease === "cut" || ease === "time-cut") return held();
  if (ease.startsWith("slam")) {
    const frames = Number(ease.slice(5));
    const dur = frames / timeline.meta.fps;
    const start = b.t - dur;
    if (t < start) return held();
    return mix(easeOutBez((t - start) / dur));
  }
  if (ease === "hold") {
    const dur = 0.22;
    if (t < b.t - dur) return held();
    return mix(easeOutBez((t - (b.t - dur)) / dur));
  }
  if (ease === "crit") {
    const tau = (t - a.t);
    const w = 2 * Math.PI * 2.4;
    const u = 1 - (1 + w * tau) * Math.exp(-w * tau);
    return mix(clamp(u, 0, 1));
  }
  if (ease === "hero-spring") {
    const peak = Math.PI / (2 * Math.PI * 2.2 * Math.sqrt(1 - 0.72 * 0.72));
    const t0 = b.t - peak;
    if (t < t0) return held();
    const tau = t - t0;
    const zeta = 0.72;
    const w = 2 * Math.PI * 2.2;
    const wd = w * Math.sqrt(1 - zeta * zeta);
    const u = 1 - Math.exp(-zeta * w * tau) * (Math.cos(wd * tau) + (zeta * w / wd) * Math.sin(wd * tau));
    return mix(u);
  }
  const u = (t - a.t) / span;
  if (ease === "whip-brake") return mix(easeOutBez(u));
  return mix(easeInOutBez(u));
}

function shakePx(t) {
  const t0 = B["s7.caught"];
  const tau = t - t0;
  if (tau < 0 || tau > 0.45) return 0;
  return 12 * Math.exp(-14 * tau) * Math.sin(2 * Math.PI * 8 * tau);
}

function gapAt(t) {
  let g = timeline.meta.quantityValues[0].gap;
  for (const v of timeline.meta.quantityValues) if (t >= v.t - 1e-4) g = v.gap;
  return g;
}

function rr(g, x, y, w, h, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function drawPerson(opt) {
  const W = 640, H = 1280;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const seat = !!opt.seat;
  const cloth = opt.cloth || C.cloth;
  const hair = opt.hair || C.hair;
  const headY = seat ? 300 : 340;
  const torsoY = seat ? 470 : 500;

  if (!opt.coatOnly) {
    if (!seat) {
      rr(g, 220, 860, 78, 360, 16, opt.legs || cloth);
      rr(g, 342, 860, 78, 360, 16, opt.legs || cloth);
    } else {
      rr(g, 150, 900, 340, 90, 20, opt.legs || cloth);
    }
    rr(g, 118, torsoY + 40, 70, seat ? 280 : 340, 20, cloth);
    rr(g, 452, torsoY + 40, 70, seat ? 280 : 340, 20, cloth);
    rr(g, 160, torsoY, 320, seat ? 430 : 390, 36, cloth);
    if (opt.coat) {
      rr(g, 176, torsoY + 24, 288, seat ? 390 : 350, 28, C.paper);
      g.fillStyle = cloth;
      g.beginPath();
      g.moveTo(320, torsoY + 24);
      g.lineTo(250, torsoY + (seat ? 390 : 340));
      g.lineTo(390, torsoY + (seat ? 390 : 340));
      g.fill();
    }
    if (opt.tie) {
      g.fillStyle = C.ink;
      g.beginPath();
      g.moveTo(320, torsoY + 18);
      g.lineTo(292, torsoY + 210);
      g.lineTo(320, torsoY + 250);
      g.lineTo(348, torsoY + 210);
      g.fill();
    }
    if (opt.tell) {
      g.fillStyle = C.accent;
      rr(g, 292, torsoY + 78, 56, 16, 4, C.accent);
    }
    g.fillStyle = C.skin;
    rr(g, 286, torsoY - 28, 68, 48, 12, C.skin);
    g.beginPath();
    g.ellipse(320, headY, 104, 118, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.rect(200, headY - 150, 240, 78);
    g.clip();
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(320, headY - 10, 108, 100, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    if (opt.cap) {
      rr(g, 210, headY - 138, 220, 36, 8, cloth);
      rr(g, 188, headY - 108, 250, 16, 4, C.paper);
    }
    g.fillStyle = C.hair;
    g.beginPath(); g.ellipse(278, headY + 8, 11, 14, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(362, headY + 8, 11, 14, 0, 0, 7); g.fill();
    g.strokeStyle = C.hair;
    g.lineWidth = 5;
    g.lineCap = "round";
    g.beginPath();
    g.arc(320, headY + 36, 22, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
    if (opt.glasses) {
      g.strokeStyle = C.ink;
      g.lineWidth = 6;
      g.strokeRect(232, headY - 22, 72, 52);
      g.strokeRect(336, headY - 22, 72, 52);
      g.beginPath();
      g.moveTo(304, headY + 4);
      g.lineTo(336, headY + 4);
      g.stroke();
    }
  } else {
    rr(g, 150, 360, 340, 620, 40, cloth);
    rr(g, 120, 400, 70, 420, 20, cloth);
    rr(g, 450, 400, 70, 420, 20, cloth);
    g.fillStyle = C.accent;
    rr(g, 292, 460, 56, 16, 4, C.accent);
    g.strokeStyle = C.hud;
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(320, 180);
    g.lineTo(320, 360);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function drawCheck(strokes) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = C.paper;
  g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = C.hud;
  g.lineWidth = 3;
  g.globalAlpha = 0.55;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(80, 90 + i * 48);
    g.lineTo(620, 90 + i * 48);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.strokeStyle = C.accent;
  g.lineWidth = 14;
  g.lineCap = "round";
  g.lineJoin = "round";
  const curves = [
    (ctx) => { ctx.moveTo(150, 390); ctx.quadraticCurveTo(220, 250, 310, 360); ctx.quadraticCurveTo(250, 450, 210, 400); },
    (ctx) => { ctx.moveTo(300, 370); ctx.quadraticCurveTo(420, 180, 500, 340); ctx.quadraticCurveTo(560, 460, 470, 400); },
    (ctx) => { ctx.moveTo(490, 360); ctx.quadraticCurveTo(640, 220, 780, 340); ctx.quadraticCurveTo(700, 470, 620, 390); },
  ];
  for (let i = 0; i < strokes; i++) {
    g.beginPath();
    curves[i](g);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawBoard(seed) {
  const rnd = mulberry32(seed);
  const c = document.createElement("canvas");
  c.width = 512; c.height = 768;
  const g = c.getContext("2d");
  g.fillStyle = C.paper;
  g.fillRect(0, 0, 512, 768);
  g.fillStyle = C.suit;
  const base = 640;
  let x = 24;
  while (x < 490) {
    const w = 28 + rnd() * 36;
    const h = 80 + rnd() * 280;
    g.fillRect(x, base - h, w, h);
    x += w + 8;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawScreen() {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 400;
  const g = c.getContext("2d");
  g.fillStyle = C.screen;
  g.fillRect(0, 0, 640, 400);
  g.strokeStyle = C.ink;
  g.globalAlpha = 0.35;
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(40, 60 + i * 48);
    g.lineTo(420, 60 + i * 48);
    g.stroke();
  }
  g.globalAlpha = 0.8;
  g.strokeRect(460, 70, 140, 180);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function mat(color, opt = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness: opt.roughness ?? 0.72, metalness: 0,
  });
}

function plane(tex, w, h) {
  const m = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.35,
    roughness: 0.84, metalness: 0, side: THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function box(w, h, d, color) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildDesk() {
  const g = new THREE.Group();
  const top = box(1.9, 0.06, 0.9, C.wood);
  top.position.y = 0.78;
  g.add(top);
  for (const [x, z] of [[-0.8, -0.32], [0.8, -0.32], [-0.8, 0.32], [0.8, 0.32]]) {
    const leg = box(0.08, 0.74, 0.08, C.suit);
    leg.position.set(x, 0.37, z);
    g.add(leg);
  }
  const bezel = box(0.78, 0.46, 0.05, C.suit);
  bezel.position.set(0, 1.22, -0.28);
  g.add(bezel);
  screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.36),
    new THREE.MeshBasicMaterial({ map: maps.screen })
  );
  screen.position.set(0, 1.22, -0.25);
  g.add(screen);
  const neck = box(0.08, 0.18, 0.08, C.suit);
  neck.position.set(0, 0.96, -0.28);
  g.add(neck);
  const keys = new THREE.Group();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 10; c++) {
      const key = box(0.042, 0.018, 0.042, C.key);
      key.position.set((c - 4.5) * 0.052, 0.82, 0.08 + (r - 1.5) * 0.052);
      keys.add(key);
    }
  }
  g.add(keys);
  return g;
}

function buildCities() {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const board = plane(maps["board" + (i % 3)], 0.62, 0.92);
    board.position.set((i - 2) * 0.78, 1.35, -0.55);
    g.add(board);
  }
  return g;
}

function buildSeminar() {
  const g = new THREE.Group();
  const top = box(2.2, 0.06, 1.05, C.wood);
  top.position.y = 0.78;
  g.add(top);
  const board = plane(maps.check3, 0.9, 0.45);
  board.position.set(0, 1.7, -1.15);
  g.add(board);
  return g;
}

function applyMap(mesh, tex) {
  mesh.material.map = tex;
  mesh.material.needsUpdate = true;
}

function captionAt(t) {
  for (const c of timeline.captions) if (t >= c.from - 1e-4 && t < c.to - 1e-4) return c;
  return null;
}

function textEntry(id) {
  return timeline.texts.find((x) => x.id === id);
}

function subPx(text) {
  const n = Math.max(1, text.replace(/\s/g, "").length);
  return clamp(Math.floor(900 / (n * 0.7)), 64, 112);
}

function showEl(el, on) { el.style.display = on ? "block" : "none"; }

function renderType(t) {
  const h1 = textEntry("hook-frank");
  const h2 = textEntry("hook-name");
  const onHook = t >= h1.from && t < h1.to;
  showEl(hook1, onHook);
  showEl(hook2, onHook);
  if (onHook) {
    hook1.textContent = h1.text;
    hook2.textContent = h2.text;
    hook1.style.cssText = `left:${h1.box[0]}px;top:${h1.box[1]}px;width:${h1.box[2]}px;font-size:${h1.px}px;text-align:center;display:block`;
    hook2.style.cssText = `left:${h2.box[0]}px;top:${h2.box[1]}px;width:${h2.box[2]}px;font-size:${h2.px}px;text-align:center;display:block`;
  }
  const hand = textEntry("term-hand");
  const sign = textEntry("term-sign");
  let term = null;
  if (t >= hand.from && t < hand.to) term = hand;
  if (t >= sign.from && t < sign.to) term = sign;
  if (term) {
    showEl(termEl, true);
    termEl.textContent = term.text;
    termEl.style.cssText = "left:60px;top:1424px;width:960px;height:120px;font-size:108px;color:#FF9340;text-align:center;display:block";
  } else showEl(termEl, false);

  const cap = captionAt(t);
  if (!cap || term) showEl(subEl, false);
  else {
    showEl(subEl, true);
    const words = cap.text.split(" ");
    subEl.innerHTML = words.map((w) => (w === cap.accent ? `<span class="accent">${w}</span>` : w)).join(" ");
    let px = 108;
    subEl.style.fontSize = px + "px";
    while (px > 52 && subEl.scrollWidth > 940) {
      px -= 2;
      subEl.style.fontSize = px + "px";
    }
    const enter = cap.from <= 0 ? 1 : easeOutBez(clamp((t - cap.from) / 0.12, 0, 1));
    subEl.style.transform = `translateY(${(1 - enter) * 16}px)`;
  }
  const g = gapAt(t);
  gapEl.textContent = Number.isInteger(g) ? String(g) : g.toFixed(1);
}

function costume(t) {
  const id = sceneAt(t).id;
  if (id === "s8") return "teacher";
  if (t >= B["s2.lawyer"] && t < B["s4.depart"]) return "lawyer";
  if (t >= B["s2.doctor"] && t < B["s2.lawyer"]) return "doctor";
  if (t >= B["s2.pilot"] && t < B["s2.doctor"]) return "pilot";
  if (id === "s4") return t >= B["s4.city"] ? "travelB" : "travelA";
  return "civilian";
}

function placeFrank(t, lookX) {
  const id = sceneAt(t).id;
  frank.visible = true;
  applyMap(frank, maps[costume(t)]);
  frank.scale.set(1, 1, 1);
  let x = -0.55, y = 0.81, z = 0.25, yaw = 0.18;
  if (id === "s1") {
    x = -0.62; z = 0.35;
  } else if (id === "s2") {
    x = lookX; z = 0.15; yaw = 0.05;
  } else if (id === "s3") {
    x = lookX * 0.2; y = 0.81; z = -1.05; yaw = 0;
    frank.scale.set(0.92, 0.92, 0.92);
  } else if (id === "s4") {
    if (t >= B["s4.other"]) { frank.visible = false; return; }
    x = lookX; z = 0.2;
  } else if (id === "s5") {
    frank.visible = false; return;
  } else if (id === "s6") {
    const u = smooth((t - B["s6.step"]) / 0.45);
    const gap = lerp(1.5, 0.5, t >= B["s6.step"] ? u : 0);
    x = -gap; z = 0.2; yaw = 0.25;
  } else if (id === "s7") {
    const u = smooth((t - B["s7.caught"]) / 0.35);
    x = lerp(-0.15, -0.05, u);
    z = 0.55; yaw = 0.1;
  } else if (id === "s8") {
    const u = smooth((t - B["s8.years"]) / (B["s8.sits"] - B["s8.years"]));
    applyMap(frank, maps.teacher);
    x = -0.48; y = lerp(0.95, 0.62, u); z = 0.15; yaw = 0.35;
  }
  frank.position.set(x, y, z);
  frank.rotation.set(0, yaw, 0);
}

function placeReader(t) {
  const id = sceneAt(t).id;
  reader.visible = id === "s5" || id === "s6" || id === "s7" || id === "s8";
  if (!reader.visible) return;
  applyMap(reader, id === "s8" ? maps.readerSit : maps.reader);
  if (id === "s5") {
    if (t >= B["s5.hand"]) { reader.visible = false; return; }
    reader.position.set(0.02, 0.92, -0.2);
    reader.rotation.set(0, -0.2, 0);
  } else if (id === "s6") {
    const u = smooth((t - B["s6.step"]) / 0.45);
    const gap = lerp(1.5, 0.5, t >= B["s6.step"] ? u : 0);
    reader.position.set(gap, 0.81, 0.15);
    reader.rotation.set(0, -0.3, 0);
  } else if (id === "s7") {
    const u = smooth((t - B["s7.caught"]) / 0.4);
    reader.position.set(lerp(1.1, 0.42, u), 0.81, 0.2);
    reader.rotation.set(0, -0.5, 0);
  } else {
    reader.position.set(0.55, 0.62, -0.15);
    reader.rotation.set(0, -0.4, 0);
  }
}

function placeCheck(t, lookX) {
  const id = sceneAt(t).id;
  const strokes = t >= B["s1.pen3"] ? 3 : t >= B["s1.pen2"] ? 2 : t >= B["s1.pen1"] ? 1 : 0;
  applyMap(check, maps["check" + strokes]);
  check.visible = true;
  check.scale.set(1, 1, 1);
  let x = 0.05, y = 0.83, z = 0.12, rx = -Math.PI / 2, ry = 0;
  if (id === "s1") {
    const u = smooth((t - (B["s2.deny"] - 0.45)) / 0.45);
    if (t >= B["s2.deny"] - 0.45) {
      x = lerp(0.05, -0.35, u);
      y = lerp(0.83, 1.15, u);
      z = lerp(0.12, 0.7, u);
      rx = lerp(-Math.PI / 2, -0.4, u);
      check.scale.setScalar(lerp(1, 1.8, u));
    }
  } else if (id === "s2" || id === "s3" || (id === "s4" && frank.visible)) {
    x = frank.position.x + 0.38;
    y = 0.72;
    z = frank.position.z + 0.08;
    rx = -0.55; ry = -0.3;
    check.scale.setScalar(0.42);
  } else if (id === "s4") {
    x = 0.15; y = 1.02; z = 0.45; rx = -0.35;
    check.scale.setScalar(0.55);
  } else if (id === "s5") {
    const u = t >= B["s5.hand"] ? easeOutBez(clamp((t - B["s5.hand"]) / (7 / 30), 0, 1)) : 0;
    x = lerp(0.2, lookX, u);
    y = lerp(0.86, 1.05, u);
    z = lerp(0.15, 1.15, u);
    rx = lerp(-Math.PI / 2, -0.25, u);
    check.scale.setScalar(lerp(1, 1.55, u));
  } else if (id === "s6") {
    x = 0; y = 0.86; z = 0.35; rx = -Math.PI / 2;
  } else if (id === "s7") {
    const fall = clamp((t - (B["s7.payoffHit"] - 0.33)) / 0.33, 0, 1);
    if (t < B["s7.payoffHit"] - 0.33) {
      x = frank.position.x + 0.32;
      y = 0.95; z = frank.position.z + 0.1; rx = -0.6;
      check.scale.setScalar(0.42);
    } else {
      const e = fall * fall;
      const over = t >= B["s7.payoffHit"]
        ? Math.sin(Math.min(t - B["s7.payoffHit"], 0.08) * 40) * 0.01
        : 0;
      x = 0.05;
      y = lerp(1.25, 0.9, e) + over;
      z = lerp(1.3, 1.05, e);
      rx = lerp(-0.9, -0.4, e);
      check.scale.setScalar(lerp(0.7, 1.15, e));
    }
  } else {
    x = 0.02; y = 0.84; z = 0.02; rx = -Math.PI / 2;
    check.scale.setScalar(1.15);
  }
  check.position.set(x, y, z);
  check.rotation.set(rx, ry, 0);
}

function placePen(t) {
  const id = sceneAt(t).id;
  pen.visible = id === "s1" || id === "s8";
  if (id === "s1") {
    const approach = smooth((t - 2.45) / (B["s1.pen1"] - 2.45));
    const restX = 0.42, writeX0 = -0.05;
    let x = lerp(restX, writeX0, t < B["s1.pen1"] ? approach : 1);
    let y = lerp(0.95, 0.86, t < B["s1.pen1"] ? approach : 1);
    if (t >= B["s1.pen1"]) {
      const stops = [B["s1.pen1"], B["s1.pen2"], B["s1.pen3"], B["s1.pen3"] + 0.2];
      const xs = [-0.05, 0.04, 0.12, 0.2];
      let seg = 0;
      while (seg < 3 && t >= stops[seg + 1]) seg++;
      const u = clamp((t - stops[seg]) / Math.max(0.04, stops[seg + 1] - stops[seg]), 0, 1);
      x = lerp(xs[seg], xs[Math.min(seg + 1, 3)], easeOutBez(u));
      y = 0.86 + (seg < 3 && u < 0.2 ? 0.02 : 0);
    }
    pen.position.set(x, y, 0.22);
    pen.rotation.set(0, 0, -0.9);
  } else if (id === "s8") {
    const span = B["s8.tells"] - B["s8.explains"];
    const u = clamp((t - B["s8.explains"]) / span, 0, 1);
    pen.position.set(lerp(-0.22, 0.2, u), 0.92, 0.32);
    pen.rotation.set(-0.4, 0, lerp(-0.7, 0.15, u));
    pen.visible = t >= B["s8.explains"] - 0.15;
  }
}

function placeSets(t, look) {
  const id = sceneAt(t).id;
  desk.visible = id === "s1" || id === "s2" || id === "s5";
  cities.visible = id === "s4";
  seminar.visible = id === "s8";
  coat.visible = id === "s4" && t >= B["s4.other"];
  watcher.visible = id === "s3";
  if (id === "s5") desk.position.set(0.2, 0, -0.35);
  else desk.position.set(0, 0, 0);
  if (coat.visible) {
    coat.position.set(0, 0.9, 0.1);
    coat.rotation.set(0, 0.2, 0);
  }
  if (watcher.visible) {
    watcher.children.forEach((child, i) => {
      child.position.set((i - 1) * 0.48, 0.78, 0.85);
      const aim = Math.atan2(frank.position.x - child.position.x, frank.position.z - child.position.z);
      child.rotation.y = clamp(aim, -0.6, 0.2);
    });
  }
  const aim = new THREE.Vector3(look.x, 0.9, 0.2);
  if (id === "s5") aim.set(0.2, 0.9, 0);
  if (id === "s8") aim.set(0, 0.85, 0);
  spot.position.set(aim.x + 0.35, 3.4, aim.z + 2.4);
  spot.target.position.copy(aim);
  spot.target.updateMatrixWorld();
}

function seek(t) {
  const pose = cameraPose(t);
  const sh = shakePx(t);
  const zoom = pose.zoom;
  const dist = BASE_DIST / zoom;
  const lookX = (pose.x + sh) / (PX_PER_M * zoom);
  const lookY = 0.58 - pose.y / (PX_PER_M * zoom);
  camera.fov = FOV;
  camera.position.set(lookX, lookY + 0.02, dist);
  camera.lookAt(lookX, lookY, 0);
  camera.updateProjectionMatrix();

  placeFrank(t, lookX);
  placeReader(t);
  placeCheck(t, lookX);
  placePen(t);
  placeSets(t, { x: lookX });

  renderType(t);
  renderer.render(scene, camera);
}

function visibleTexts(t) {
  const out = [];
  for (const tx of timeline.texts) {
    if (t >= tx.from && t < tx.to) out.push({ text: tx.text, x: tx.box[0], y: tx.box[1], w: tx.box[2], h: tx.box[3] });
  }
  const cap = captionAt(t);
  const term = out.find((x) => x.text === "ПОЧЕРК" || x.text === "ПОДПИСИ");
  if (cap && !(term && cap.text === term.text)) {
    out.push({ text: cap.text, x: 60, y: 1424, w: 960, h: 120 });
  }
  return out;
}

function init() {
  const canvas = document.getElementById("view");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(1080, 1920, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(C.ground, 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ground);
  scene.fog = new THREE.Fog(C.ground, 9, 18);
  camera = new THREE.PerspectiveCamera(FOV, 1080 / 1920, 0.08, 40);

  scene.add(new THREE.AmbientLight(C.spot, 0.22));
  spot = new THREE.SpotLight(C.spot, 90, 16, 0.62, 0.7, 1);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.4;
  spot.shadow.camera.far = 16;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.03;
  scene.add(spot);
  scene.add(spot.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 16),
    mat(C.ground, { roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), mat(C.ground));
  wall.position.set(0, 2.2, -1.8);
  wall.receiveShadow = true;
  scene.add(wall);

  maps.civilian = drawPerson({ cloth: C.cloth });
  maps.pilot = drawPerson({ cloth: C.suit, cap: true, tell: true, legs: C.suit });
  maps.doctor = drawPerson({ cloth: C.suit, coat: true, tell: true });
  maps.lawyer = drawPerson({ cloth: C.suit, tie: true, tell: true, legs: C.suit });
  maps.travelA = drawPerson({ cloth: C.cloth });
  maps.travelB = drawPerson({ cloth: C.suit, legs: C.suit });
  maps.teacher = drawPerson({ cloth: C.cloth, seat: true });
  maps.reader = drawPerson({ cloth: C.suit, hair: C.hud, glasses: true, legs: C.suit });
  maps.readerSit = drawPerson({ cloth: C.suit, hair: C.hud, glasses: true, seat: true, legs: C.suit });
  maps.watchA = drawPerson({ cloth: C.cloth });
  maps.watchB = drawPerson({ cloth: C.suit, tie: true });
  maps.watchC = drawPerson({ cloth: C.cloth, glasses: true });
  maps.coat = drawPerson({ cloth: C.suit, coatOnly: true });
  for (let i = 0; i < 4; i++) maps["check" + i] = drawCheck(i);
  for (let i = 0; i < 3; i++) maps["board" + i] = drawBoard(100 + i);
  maps.screen = drawScreen();

  frank = plane(maps.civilian, 0.78, 1.64);
  reader = plane(maps.reader, 0.82, 1.68);
  coat = plane(maps.coat, 0.7, 1.4);
  watcher = new THREE.Group();
  for (const name of ["watchA", "watchB", "watchC"]) {
    const w = plane(maps[name], 0.7, 1.5);
    watcher.add(w);
  }
  check = plane(maps.check0, 0.52, 0.26);
  pen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10),
    mat(C.ink, { roughness: 0.4 })
  );
  pen.castShadow = true;
  desk = buildDesk();
  cities = buildCities();
  seminar = buildSeminar();
  scene.add(frank, reader, coat, watcher, check, pen, desk, cities, seminar);

  motes = [];
}

async function loadFonts() {
  const specs = [
    ["Unbounded", "fonts/unbounded-cyrillic-700-normal.woff", "U+0400-04FF, U+0500-052F"],
    ["Unbounded", "fonts/unbounded-latin-700-normal.woff", "U+0000-00FF"],
    ["Unbounded", "fonts/unbounded-latin-ext-700-normal.woff", "U+0100-024F"],
    ["Plex", "fonts/IBMPlexMono-Medium.ttf", "U+0000-00FF"],
  ];
  for (const [family, url, range] of specs) {
    const face = new FontFace(family, `url(${url})`, { weight: family === "Plex" ? "500" : "700", unicodeRange: range });
    await face.load();
    document.fonts.add(face);
  }
}

window.READY = (async () => {
  const res = await fetch("/timeline.json");
  timeline = await res.json();
  B = {};
  for (const s of timeline.scenes) for (const [k, v] of Object.entries(s.beats)) B[`${s.id}.${k}`] = v;
  window.DUR = timeline.meta.dur;
  window.FPS = timeline.meta.fps;
  window.CUES = timeline;
  await loadFonts();
  init();
  seek(0);
})();

window.seek = (t) => { seek(t); };
window.TEXTS = (t) => visibleTexts(t);
