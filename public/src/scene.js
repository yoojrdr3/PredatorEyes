// 캔버스 렌더링 + 뒤돌아보기 장면 생성 (이미지 에셋 없이 전부 코드로 그린다)

import { VIEW } from './config.js';

const { W, H, HORIZON } = VIEW;
const CX = W / 2;
const SILHOUETTE = '#07050b';

/* ---------------------------------------------------------- 유틸 */

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  const r = Math.round(lerp(a[0], b[0], t));
  const g = Math.round(lerp(a[1], b[1], t));
  const bl = Math.round(lerp(a[2], b[2], t));
  return `rgb(${r},${g},${bl})`;
}

/* ---------------------------------------------------------- 하늘 / 지면 */

function drawSky(ctx, sunT) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON + 40);
  g.addColorStop(0, mix('#2a0a12', '#040208', sunT));
  g.addColorStop(0.55, mix('#8e2410', '#170509', sunT));
  g.addColorStop(1, mix('#ff8a3c', '#2a0a06', sunT));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON + 40);
}

function drawSun(ctx, sunT) {
  const y = HORIZON - 150 + sunT * 196;
  const r = 62;
  const fade = clamp((1 - sunT) * 4, 0, 1);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  const glow = ctx.createRadialGradient(CX, y, r * 0.3, CX, y, r * 4.2);
  glow.addColorStop(0, 'rgba(255,170,80,0.55)');
  glow.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(CX - r * 4.5, y - r * 4.5, r * 9, r * 9);
  ctx.beginPath();
  ctx.arc(CX, y, r, 0, Math.PI * 2);
  ctx.fillStyle = mix('#ffd07a', '#ff4a12', sunT);
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------- 협곡 벽 */

function wallProfile(rng, count) {
  const pts = [];
  for (let i = 0; i <= count; i++) pts.push(0.25 + rng() * 0.75);
  return pts;
}

function drawCanyonWall(ctx, profile, side, sunT) {
  // side: -1 = 왼쪽, 1 = 오른쪽
  // 벽은 소실점을 향해 좁아지고, 아래쪽 경계는 원근에 맞춘 지면 라인이 된다.
  const edgeX = side < 0 ? 0 : W;
  const apexX = CX + side * 34;   // 소실점 근처의 벽 끝
  const footX = CX + side * 470;  // 화면 아래쪽에서 벽이 지면과 만나는 지점
  ctx.beginPath();
  ctx.moveTo(edgeX, H);
  ctx.lineTo(edgeX, H * 0.03);
  const n = profile.length - 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(edgeX, apexX, Math.pow(t, 1.6));
    const y = lerp(H * 0.03, HORIZON - 6, Math.pow(t, 0.5)) + profile[i] * 48 * (1 - t);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(apexX, HORIZON);
  // 벽이 지면과 만나는 선도 약간 들쭉날쭉하게
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const jag = (profile[i % profile.length] - 0.5) * 46 * t;
    ctx.lineTo(lerp(apexX, footX, t) + side * jag, lerp(HORIZON, H, t));
  }
  ctx.closePath();
  ctx.fillStyle = mix('#160a0c', '#050307', sunT);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,120,50,${0.22 * (1 - sunT * 0.8)})`;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/* ---------------------------------------------------------- 엄폐물 */

const COVER_TYPES = ['boulder', 'boulder', 'slab', 'pillar', 'rubble', 'tree'];

function buildCover(rng, x, depth, forcedType) {
  const type = forcedType || pick(rng, COVER_TYPES);
  const s = 0.45 + depth * 0.95;
  const baseY = HORIZON + 90 + depth * 250;
  const c = { type, x, depth, baseY, poly: [], strokes: [] };

  const jag = (w, h, steps, roundness) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI - (Math.PI * i) / steps;
      const rr = 1 - roundness * rng();
      pts.push([Math.cos(a) * (w / 2) * rr, -Math.sin(a) * h * rr]);
    }
    pts.push([w / 2, 6]);
    pts.push([-w / 2, 6]);
    return pts;
  };

  if (type === 'boulder') {
    c.w = (150 + rng() * 130) * s;
    c.h = (95 + rng() * 85) * s;
    c.poly = jag(c.w, c.h, 9, 0.22);
  } else if (type === 'slab') {
    c.w = (230 + rng() * 160) * s;
    c.h = (58 + rng() * 46) * s;
    c.poly = jag(c.w, c.h, 7, 0.16);
  } else if (type === 'pillar') {
    c.w = (48 + rng() * 34) * s;
    c.h = (190 + rng() * 150) * s;
    const lean = (rng() - 0.5) * c.w * 0.9;
    c.poly = [
      [-c.w / 2, 6], [-c.w / 2 + rng() * 6, -c.h * 0.45],
      [lean - c.w * 0.28, -c.h], [lean + c.w * 0.26, -c.h * 0.96],
      [c.w / 2 - rng() * 6, -c.h * 0.42], [c.w / 2, 6],
    ];
  } else if (type === 'rubble') {
    c.w = (170 + rng() * 120) * s;
    c.h = (52 + rng() * 42) * s;
    const pts = [[-c.w / 2, 6]];
    const lumps = 4;
    for (let i = 0; i < lumps; i++) {
      const t0 = i / lumps, t1 = (i + 0.5) / lumps, t2 = (i + 1) / lumps;
      const hh = c.h * (0.5 + rng() * 0.5);
      pts.push([-c.w / 2 + c.w * t0, -hh * 0.35]);
      pts.push([-c.w / 2 + c.w * t1, -hh]);
      pts.push([-c.w / 2 + c.w * t2, -hh * 0.3]);
    }
    pts.push([c.w / 2, 6]);
    c.poly = pts;
  } else {
    // 죽은 고목
    c.w = (34 + rng() * 22) * s;
    c.h = (200 + rng() * 140) * s;
    const lean = (rng() - 0.5) * 40 * s;
    c.poly = [
      [-c.w / 2, 6], [-c.w * 0.3, -c.h * 0.5],
      [lean - c.w * 0.24, -c.h], [lean + c.w * 0.2, -c.h],
      [c.w * 0.3, -c.h * 0.5], [c.w / 2, 6],
    ];
    const branches = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < branches; i++) {
      const t = 0.42 + rng() * 0.5;
      const dir = rng() < 0.5 ? -1 : 1;
      const len = (50 + rng() * 70) * s;
      const y = -c.h * t;
      c.strokes.push({
        pts: [
          [dir * c.w * 0.2, y],
          [dir * (c.w * 0.2 + len * 0.6), y - len * 0.3],
          [dir * (c.w * 0.2 + len), y - len * (0.35 + rng() * 0.5)],
        ],
        w: Math.max(3, 9 * s * (0.6 + rng() * 0.5)),
      });
    }
  }
  // 히트 판정을 위해 화면상의 경계 상자를 저장
  c.bounds = c.poly.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p[0]), maxX: Math.max(b.maxX, p[0]),
      minY: Math.min(b.minY, p[1]), maxY: Math.max(b.maxY, p[1]),
    }),
    { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 }
  );
  return c;
}

export function drawCoverShape(ctx, c) {
  ctx.save();
  ctx.translate(c.x, c.baseY);
  ctx.beginPath();
  ctx.moveTo(c.poly[0][0], c.poly[0][1]);
  for (let i = 1; i < c.poly.length; i++) ctx.lineTo(c.poly[i][0], c.poly[i][1]);
  ctx.closePath();
  ctx.fill();
  for (const st of c.strokes) {
    ctx.beginPath();
    ctx.moveTo(st.pts[0][0], st.pts[0][1]);
    for (let i = 1; i < st.pts.length; i++) ctx.lineTo(st.pts[i][0], st.pts[i][1]);
    ctx.lineWidth = st.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------------------------------------- 공룡 */

// 옆모습 실루엣. dir = 1 이면 오른쪽을 본다. baseY 는 발이 닿는 지면.
export function drawDinoShape(ctx, d) {
  const k = 220 * d.scale;
  ctx.save();
  ctx.translate(d.x, d.baseY);
  ctx.scale(d.dir, 1);

  ctx.beginPath();
  // 뒷다리
  ctx.moveTo(-0.10 * k, 0);
  ctx.lineTo(-0.02 * k, 0);
  ctx.quadraticCurveTo(0.02 * k, -0.24 * k, -0.04 * k, -0.46 * k);
  ctx.lineTo(-0.20 * k, -0.44 * k);
  ctx.quadraticCurveTo(-0.20 * k, -0.18 * k, -0.10 * k, 0);
  ctx.closePath();
  ctx.fill();
  // 앞다리
  ctx.beginPath();
  ctx.moveTo(0.10 * k, 0);
  ctx.lineTo(0.20 * k, 0);
  ctx.quadraticCurveTo(0.22 * k, -0.26 * k, 0.16 * k, -0.48 * k);
  ctx.lineTo(0.03 * k, -0.46 * k);
  ctx.quadraticCurveTo(0.05 * k, -0.2 * k, 0.10 * k, 0);
  ctx.closePath();
  ctx.fill();
  // 몸통
  ctx.beginPath();
  ctx.ellipse(0.02 * k, -0.56 * k, 0.30 * k, 0.19 * k, -0.06, 0, Math.PI * 2);
  ctx.fill();
  // 꼬리
  ctx.beginPath();
  ctx.moveTo(-0.16 * k, -0.66 * k);
  ctx.quadraticCurveTo(-0.55 * k, -0.66 * k, -0.86 * k, -0.34 * k);
  ctx.lineTo(-0.88 * k, -0.28 * k);
  ctx.quadraticCurveTo(-0.52 * k, -0.48 * k, -0.16 * k, -0.46 * k);
  ctx.closePath();
  ctx.fill();
  // 목
  ctx.beginPath();
  ctx.moveTo(0.18 * k, -0.68 * k);
  ctx.quadraticCurveTo(0.34 * k, -0.76 * k, 0.38 * k, -0.90 * k);
  ctx.lineTo(0.50 * k, -0.88 * k);
  ctx.quadraticCurveTo(0.44 * k, -0.70 * k, 0.24 * k, -0.52 * k);
  ctx.closePath();
  ctx.fill();
  // 머리 + 주둥이
  ctx.beginPath();
  ctx.moveTo(0.34 * k, -0.86 * k);
  ctx.quadraticCurveTo(0.40 * k, -1.00 * k, 0.56 * k, -1.00 * k);
  ctx.lineTo(0.70 * k, -0.96 * k);
  ctx.quadraticCurveTo(0.76 * k, -0.93 * k, 0.70 * k, -0.88 * k);
  ctx.lineTo(0.56 * k, -0.855 * k);
  ctx.quadraticCurveTo(0.44 * k, -0.83 * k, 0.34 * k, -0.86 * k);
  ctx.closePath();
  ctx.fill();
  // 아래턱
  ctx.beginPath();
  ctx.moveTo(0.40 * k, -0.855 * k);
  ctx.lineTo(0.68 * k, -0.855 * k);
  ctx.lineTo(0.66 * k, -0.815 * k);
  ctx.lineTo(0.42 * k, -0.825 * k);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

export function dinoEyePos(d) {
  const k = 220 * d.scale;
  return { x: d.x + d.dir * 0.505 * k, y: d.baseY - 0.935 * k, r: Math.max(2.6, 0.026 * k) };
}

export function drawDinoEye(ctx, d, glow = 1) {
  const e = dinoEyePos(d);
  ctx.save();
  const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 7);
  g.addColorStop(0, `rgba(255,60,40,${0.85 * glow})`);
  g.addColorStop(0.35, `rgba(220,20,10,${0.30 * glow})`);
  g.addColorStop(1, 'rgba(180,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
  ctx.fillStyle = '#ff2a18';
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------- 앞을 볼 때(전진) 장면 */

const FOCAL = 260;

export function createForwardScene(seed) {
  const rng = makeRng(seed);
  const props = [];
  for (let i = 0; i < 30; i++) {
    props.push(makeProp(rng, 20 + rng() * 900));
  }
  return {
    rng,
    props,
    wallL: wallProfile(rng, 12),
    wallR: wallProfile(rng, 12),
  };
}

function makeProp(rng, z) {
  return {
    z,
    side: rng() < 0.5 ? -1 : 1,
    lane: 300 + rng() * 420,
    type: pick(rng, ['boulder', 'boulder', 'pillar', 'slab', 'tree']),
    size: 0.6 + rng() * 0.9,
    tilt: (rng() - 0.5) * 0.4,
    seed: Math.floor(rng() * 1e6),
  };
}

export function updateForwardScene(scene, dz) {
  for (const p of scene.props) {
    p.z -= dz;
    if (p.z < 8) {
      const np = makeProp(scene.rng, p.z + 920);
      Object.assign(p, np);
    }
  }
}

export function drawForward(ctx, st) {
  const { scene, sunT, travelled, distanceLeft, stageDistance } = st;
  drawSky(ctx, sunT);
  drawSun(ctx, sunT);

  // 지면
  const g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, mix('#5a1c10', '#120608', sunT));
  g.addColorStop(1, mix('#1d0a09', '#060305', sunT));
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // 속도감을 주는 지면 라인
  ctx.strokeStyle = `rgba(255,140,70,${0.10 * (1 - sunT * 0.7)})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const z = i * 70 - (travelled % 70);
    if (z < 2) continue;
    const p = FOCAL / (z + FOCAL);
    const y = HORIZON + (H - HORIZON) * p;
    ctx.beginPath();
    ctx.moveTo(CX - 900 * p, y);
    ctx.lineTo(CX + 900 * p, y);
    ctx.stroke();
  }

  drawCanyonWall(ctx, scene.wallL, -1, sunT);
  drawCanyonWall(ctx, scene.wallR, 1, sunT);

  // 대피소 (가까워질수록 커진다)
  const t = clamp(1 - distanceLeft / stageDistance, 0, 1);
  const sh = 26 + 330 * Math.pow(t, 2.4);
  const baseY = HORIZON + 22 + 380 * Math.pow(t, 2.6);
  drawShelter(ctx, CX, baseY, sh, sunT);

  // 양옆 지형지물 (원근 투영)
  const sorted = [...scene.props].sort((a, b) => b.z - a.z);
  ctx.fillStyle = SILHOUETTE;
  ctx.strokeStyle = SILHOUETTE;
  for (const p of sorted) {
    const pr = FOCAL / (p.z + FOCAL);
    const x = CX + p.side * p.lane * pr;
    const y = HORIZON + (H - HORIZON) * pr;
    if (y < HORIZON || pr < 0.02) continue;
    const s = pr * p.size;
    drawPropSilhouette(ctx, x, y, s, p);
  }

  // 어둠 / 비네트
  const dark = ctx.createRadialGradient(CX, HORIZON + 60, 120, CX, HORIZON + 60, W * 0.8);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, `rgba(0,0,0,${0.45 + sunT * 0.45})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
}

function drawPropSilhouette(ctx, x, y, s, p) {
  const w = 210 * s, h = 150 * s;
  if (w < 1.5) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (p.type === 'pillar') {
    ctx.moveTo(-w * 0.14, 0);
    ctx.lineTo(-w * 0.10, -h * 1.5);
    ctx.lineTo(w * 0.06 + p.tilt * w, -h * 1.85);
    ctx.lineTo(w * 0.14, -h * 1.4);
    ctx.lineTo(w * 0.16, 0);
  } else if (p.type === 'slab') {
    ctx.moveTo(-w * 0.6, 0);
    ctx.lineTo(-w * 0.5, -h * 0.45);
    ctx.lineTo(w * 0.42, -h * 0.55);
    ctx.lineTo(w * 0.6, 0);
  } else if (p.type === 'tree') {
    ctx.moveTo(-w * 0.06, 0);
    ctx.lineTo(-w * 0.05, -h * 1.6);
    ctx.lineTo(w * 0.05, -h * 1.6);
    ctx.lineTo(w * 0.07, 0);
  } else {
    ctx.moveTo(-w * 0.45, 0);
    ctx.quadraticCurveTo(-w * 0.42, -h * 0.9, 0, -h * 0.95);
    ctx.quadraticCurveTo(w * 0.44, -h * 0.86, w * 0.45, 0);
  }
  ctx.closePath();
  ctx.fill();
  if (p.type === 'tree') {
    ctx.lineWidth = Math.max(1, 8 * s);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -h * 1.1);
    ctx.lineTo(-w * 0.3, -h * 1.5);
    ctx.moveTo(0, -h * 1.25);
    ctx.lineTo(w * 0.28, -h * 1.6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShelter(ctx, x, baseY, h, sunT) {
  const w = h * 1.35;
  ctx.save();
  ctx.translate(x, baseY);
  // 바위 아래 파인 대피 공간
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, 0);
  ctx.lineTo(-w * 0.44, -h * 0.72);
  ctx.lineTo(-w * 0.12, -h);
  ctx.lineTo(w * 0.16, -h * 0.98);
  ctx.lineTo(w * 0.46, -h * 0.66);
  ctx.lineTo(w * 0.5, 0);
  ctx.closePath();
  ctx.fillStyle = mix('#241014', '#070409', sunT);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,150,70,${0.4 * (1 - sunT * 0.6)})`;
  ctx.lineWidth = Math.max(1, h * 0.012);
  ctx.stroke();
  // 입구의 따뜻한 불빛 (목표 지점 표시)
  const gw = w * 0.26, gh = h * 0.55;
  const gl = ctx.createLinearGradient(0, -gh, 0, 0);
  gl.addColorStop(0, 'rgba(255,190,90,0.95)');
  gl.addColorStop(1, 'rgba(255,110,30,0.55)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.moveTo(-gw, 0);
  ctx.quadraticCurveTo(-gw, -gh, 0, -gh);
  ctx.quadraticCurveTo(gw, -gh, gw, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ---------------------------------------------------------- 뒤를 볼 때(탐색) 장면 */

const MASK_SCALE = 0.5;

function foregroundPoly(rng) {
  const pts = [[0, H]];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    pts.push([(W / n) * i, H - 40 - rng() * 90]);
  }
  pts.push([W, H]);
  return pts;
}

function drawForeground(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
  ctx.closePath();
  ctx.fill();
}

/**
 * 뒤돌아봤을 때의 장면을 만든다.
 * 공룡이 실제로 몇 픽셀 노출되는지 마스크로 세어서,
 * 난이도별 목표 노출량에 맞을 때까지 위치를 조정한다. (풀 수 없는 문제 방지)
 */
export function buildBackScene(seed, opts) {
  const rng = makeRng(seed);
  const { coverCount, exposure, minRatio, maxRatio, gap } = opts;

  const covers = [];
  for (let i = 0; i < coverCount; i++) {
    const slot = (W - 140) / coverCount;
    const x = 70 + slot * (i + 0.15 + rng() * 0.7);
    const depth = 0.30 + rng() * 0.70;
    covers.push(buildCover(rng, x, depth));
  }
  covers.sort((a, b) => a.depth - b.depth);

  const scale = clamp(0.5 + (1 - clamp((gap - 15) / 125, 0, 1)) * 1.05, 0.5, 1.6);
  const dinoW = 1.5 * 220 * scale;
  const dinoH = 1.0 * 220 * scale;

  // 공룡이 숨을 만한 엄폐물 후보 (너무 작거나 너무 먼 것은 제외).
  // 깊이 숨어야 하는 후반 스테이지일수록 더 큰 엄폐물을 요구한다.
  const needW = dinoW * (0.30 + (1 - clamp(maxRatio, 0, 1)) * 0.5);
  const all = covers.map((c, i) => ({ c, i }));
  let candidates = all.filter(({ c }) => c.depth >= 0.42 && c.w >= needW);
  if (!candidates.length) candidates = all.filter(({ c }) => c.depth >= 0.42 && c.w >= dinoW * 0.30);
  if (!candidates.length) candidates = [...all].sort((a, b) => b.c.w - a.c.w).slice(0, 2);

  const mask = document.createElement('canvas');
  mask.width = Math.round(W * MASK_SCALE);
  mask.height = Math.round(H * MASK_SCALE);
  const mctx = mask.getContext('2d', { willReadFrequently: true });

  const fg = foregroundPoly(makeRng(seed ^ 0x9e3779b9));

  const measure = (dino, hideIndex) => {
    mctx.setTransform(MASK_SCALE, 0, 0, MASK_SCALE, 0, 0);
    mctx.clearRect(0, 0, W, H);
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#fff';
    mctx.strokeStyle = '#fff';
    drawDinoShape(mctx, dino);
    mctx.globalCompositeOperation = 'destination-out';
    for (let i = hideIndex; i < covers.length; i++) drawCoverShape(mctx, covers[i]);
    drawForeground(mctx, fg);
    mctx.globalCompositeOperation = 'source-over';
    mctx.setTransform(1, 0, 0, 1, 0, 0);

    return countAlpha(mctx, mask);
  };

  // 가려지지 않은 온전한 공룡의 면적 (화면 중앙에 임시로 그려서 측정)
  const measureFull = () => {
    mctx.setTransform(MASK_SCALE, 0, 0, MASK_SCALE, 0, 0);
    mctx.clearRect(0, 0, W, H);
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#fff';
    mctx.strokeStyle = '#fff';
    drawDinoShape(mctx, { x: CX, baseY: HORIZON + 340, scale, dir: 1 });
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    return countAlpha(mctx, mask).count;
  };

  // 공룡이 하나도 가려지지 않았을 때의 면적을 먼저 재고,
  // 그 비율로 목표 노출량을 잡는다 (공룡 크기가 달라져도 난이도가 일정하다)
  const fullArea = measureFull();
  const minPx = Math.max(55, Math.round(fullArea * minRatio));
  const maxPx = Math.max(minPx + 40, Math.round(fullArea * maxRatio));

  // 엄폐물이 화면 끝에 있으면 아무리 밀어도 목표 노출량이 안 나올 수 있다.
  // 그럴 때는 다른 엄폐물 / 다른 숨는 방식으로 다시 시도하고, 가장 근접한 배치를 쓴다.
  const attempt = () => {
    const chosen = candidates[Math.floor(rng() * candidates.length) % candidates.length];
    const cover = chosen.c;
    const hideIndex = chosen.i;
    const mode = rng() < 0.55 ? 'side' : 'top';
    const side = rng() < 0.5 ? -1 : 1;
    const topJitter = (rng() - 0.5) * cover.w * 0.35;

    const place = (peek) => {
      if (mode === 'side') {
        return {
          x: clamp(cover.x + side * (cover.w * 0.5 + dinoW * (peek - 0.44)), 190, W - 190),
          baseY: cover.baseY, scale, dir: side,
        };
      }
      return {
        x: clamp(cover.x + topJitter, 190, W - 190),
        baseY: cover.baseY + (1 - clamp(peek, 0, 1)) * dinoH * 0.78,
        scale, dir: side,
      };
    };

    let peek = exposure;
    let dino = place(peek);
    let res = measure(dino, hideIndex);
    for (let i = 0; i < 22; i++) {
      if (res.count >= minPx && res.count <= maxPx) break;
      peek += res.count < minPx ? 0.06 : -0.05;
      peek = clamp(peek, 0.02, 1.7);
      dino = place(peek);
      res = measure(dino, hideIndex);
      if (peek >= 1.69 || peek <= 0.021) break;
    }
    const miss = res.count < minPx ? minPx - res.count : Math.max(0, res.count - maxPx);
    return { dino, res, hideIndex, mode, miss };
  };

  let best = attempt();
  for (let n = 1; n < 8 && best.miss > 0; n++) {
    const t = attempt();
    if (t.miss < best.miss) best = t;
  }
  const { dino, res, hideIndex, mode } = best;

  return {
    covers, hideIndex, dino, fg, mode,
    exposedPx: res.count,
    fullArea,
    maskData: res.img,
    maskW: mask.width,
    maskH: mask.height,
    wallL: wallProfile(rng, 12),
    wallR: wallProfile(rng, 12),
    eyeVisible: isVisibleAt(res.img, mask.width, mask.height, dinoEyePos(dino).x, dinoEyePos(dino).y, 6),
  };
}

function countAlpha(mctx, mask) {
  const img = mctx.getImageData(0, 0, mask.width, mask.height);
  const d = img.data, mw = mask.width;
  let count = 0;
  for (let y = 0; y < mask.height; y += 2) {
    for (let x = 0; x < mw; x += 2) {
      if (d[(y * mw + x) * 4 + 3] > 40) count++;
    }
  }
  return { img, count };
}

function isVisibleAt(img, mw, mh, x, y, tol) {
  const cx = Math.round(x * MASK_SCALE), cy = Math.round(y * MASK_SCALE);
  const r = Math.max(1, Math.round(tol * MASK_SCALE));
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 0 || py < 0 || px >= mw || py >= mh) continue;
      if (img.data[(py * mw + px) * 4 + 3] > 40) return true;
    }
  }
  return false;
}

// 클릭 지점이 공룡의 "노출된" 부위인지 판정
export function testHit(scene, x, y, tolerance) {
  return isVisibleAt(scene.maskData, scene.maskW, scene.maskH, x, y, tolerance);
}

export function drawBack(ctx, scene, st) {
  const { sunT, eyePulse } = st;
  drawSky(ctx, Math.min(1, sunT * 0.9 + 0.1));

  const g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, mix('#4a1710', '#0f0507', sunT));
  g.addColorStop(1, mix('#170808', '#050205', sunT));
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  drawCanyonWall(ctx, scene.wallL, -1, sunT);
  drawCanyonWall(ctx, scene.wallR, 1, sunT);

  ctx.fillStyle = SILHOUETTE;
  ctx.strokeStyle = SILHOUETTE;

  for (let i = 0; i < scene.hideIndex; i++) drawCoverShape(ctx, scene.covers[i]);

  drawDinoShape(ctx, scene.dino);
  drawDinoEye(ctx, scene.dino, 0.75 + Math.sin(eyePulse * 4) * 0.25);

  ctx.fillStyle = SILHOUETTE;
  ctx.strokeStyle = SILHOUETTE;
  for (let i = scene.hideIndex; i < scene.covers.length; i++) drawCoverShape(ctx, scene.covers[i]);
  drawForeground(ctx, scene.fg);

  const dark = ctx.createRadialGradient(CX, H * 0.5, 140, CX, H * 0.5, W * 0.75);
  dark.addColorStop(0, 'rgba(0,0,0,0)');
  dark.addColorStop(1, `rgba(0,0,0,${0.5 + sunT * 0.4})`);
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------- 연출 */

export function drawCrosshair(ctx, x, y, ready) {
  ctx.save();
  ctx.strokeStyle = ready ? 'rgba(255,90,60,0.9)' : 'rgba(140,140,140,0.5)';
  ctx.lineWidth = 2;
  const r = ready ? 13 : 20;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 9, y); ctx.lineTo(x - r + 3, y);
  ctx.moveTo(x + r - 3, y); ctx.lineTo(x + r + 9, y);
  ctx.moveTo(x, y - r - 9); ctx.lineTo(x, y - r + 3);
  ctx.moveTo(x, y + r - 3); ctx.lineTo(x, y + r + 9);
  ctx.stroke();
  ctx.restore();
}

export function drawMuzzleFlash(ctx, x, y, t) {
  ctx.save();
  ctx.globalAlpha = 1 - t;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 90 * (0.5 + t));
  g.addColorStop(0, 'rgba(255,230,170,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 120, y - 120, 240, 240);
  ctx.restore();
}

export function drawTurnWipe(ctx, t) {
  ctx.save();
  ctx.globalAlpha = Math.sin(t * Math.PI) * 0.85;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = Math.sin(t * Math.PI) * 0.4;
  ctx.strokeStyle = 'rgba(255,90,40,0.6)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 22; i++) {
    const y = (i / 22) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }
  ctx.restore();
}

// 점프스케어: 검은 얼굴과 붉은 눈이 화면을 채운다
export function drawJumpscare(ctx, t) {
  const e = Math.pow(t, 1.7);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const s = 0.25 + e * 4.2;
  ctx.save();
  ctx.translate(CX + Math.sin(t * 60) * 14 * e, H * 0.62 + Math.cos(t * 51) * 12 * e);
  ctx.scale(s, s);

  ctx.fillStyle = '#0a0509';
  // 두개골 (뒤로 갈수록 넓고, 앞으로 길게 뻗은 주둥이)
  ctx.beginPath();
  ctx.moveTo(-120, -128);
  ctx.quadraticCurveTo(-40, -152, 40, -132);
  ctx.lineTo(150, -74);
  ctx.quadraticCurveTo(178, -60, 150, -44);
  ctx.lineTo(40, -18);
  ctx.quadraticCurveTo(-40, -4, -120, -34);
  ctx.quadraticCurveTo(-150, -82, -120, -128);
  ctx.closePath();
  ctx.fill();
  // 아래턱
  ctx.beginPath();
  ctx.moveTo(-110, -30);
  ctx.lineTo(146, -44);
  ctx.quadraticCurveTo(150, -14, 120, -6);
  ctx.lineTo(-70, 26);
  ctx.quadraticCurveTo(-116, 8, -110, -30);
  ctx.closePath();
  ctx.fill();
  // 이빨
  ctx.fillStyle = '#231a1e';
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x = -80 + t * 210;
    const y = -34 + t * 12;
    const s = 1 - t * 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + 9 * s, y); ctx.lineTo(x + 4 * s, y + 22 * s);
    ctx.closePath(); ctx.fill();
  }
  // 붉은 눈
  for (const [ex, ey] of [[-66, -108], [26, -100]]) {
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 48);
    g.addColorStop(0, 'rgba(255,70,40,1)');
    g.addColorStop(0.3, 'rgba(210,10,0,0.7)');
    g.addColorStop(1, 'rgba(160,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(ex, ey, 48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff2a18';
    ctx.beginPath(); ctx.ellipse(ex, ey, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  ctx.fillStyle = `rgba(120,0,0,${Math.max(0, t - 0.55) * 1.6})`;
  ctx.fillRect(0, 0, W, H);
}

export function drawShelterFlash(ctx, t) {
  ctx.fillStyle = `rgba(255,190,110,${Math.sin(t * Math.PI) * 0.85})`;
  ctx.fillRect(0, 0, W, H);
}
