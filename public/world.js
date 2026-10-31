// Killhouse world builder: turns a director's world spec into a lit, playable 3D level.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { ARCHETYPES } from './agents.js';

/* ---------- seeded noise ---------- */
export function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(rng) {
  const p = new Uint8Array(512); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  function n2(x, y) {
    const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
    const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255; let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { const q = g[p[ii + p[jj]] & 7]; t0 *= t0; n += t0 * t0 * (q[0] * x0 + q[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { const q = g[p[ii + i1 + p[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (q[0] * x1 + q[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { const q = g[p[ii + 1 + p[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (q[0] * x2 + q[1] * y2); }
    return 70 * n;
  }
  const fbm = (x, y, o = 4) => { let a = 1, f = 1, s = 0, m = 0; for (let k = 0; k < o; k++) { s += a * n2(x * f, y * f); m += a; a *= 0.5; f *= 2.03; } return s / m; };
  return { n2, fbm };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = h => new THREE.Color(h);

/* ---------- procedural textures ---------- */
function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4; return t;
}
function grainTex(rng, base = 200, spread = 55, repeat = 1, size = 256) {
  return canvasTex(size, size, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { const v = base + (rng() - 0.5) * spread; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(0,0,0,${0.03 + rng() * 0.05})`; x.beginPath(); x.arc(rng() * w, rng() * h, 6 + rng() * 30, 0, 7); x.fill(); }
  }, repeat);
}
function concreteTex(rng, repeat) {
  return canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#9c968c'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 120 + rng() * 70 | 0; x.fillStyle = `rgba(${v},${v - 4},${v - 10},.35)`; x.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2); }
    for (let i = 0; i < 18; i++) { const g = x.createLinearGradient(0, 0, 0, h); x.fillStyle = `rgba(40,30,20,${rng() * 0.12})`; x.fillRect(rng() * w, 0, 2 + rng() * 8, h); }
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; x.strokeRect(0, 0, w, h); x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke();
    for (const [a, b] of [[30, 30], [226, 30], [30, 226], [226, 226], [30, 98], [226, 98]]) { x.fillStyle = 'rgba(30,30,30,.4)'; x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill(); }
  }, repeat);
}
function windowsTex(rng, lit, glow, frame = '#15171c') {
  return canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = frame; x.fillRect(0, 0, w, h);
    for (let j = 6; j < h; j += 14) for (let i = 6; i < w; i += 12) {
      const on = rng() < lit; x.fillStyle = on ? (rng() < 0.15 ? '#ffffff' : glow) : '#0b0c10'; x.globalAlpha = on ? 0.55 + rng() * 0.45 : 1; x.fillRect(i, j, 7, 9);
    }
    x.globalAlpha = 1;
  });
}
function signTex(text, color, bg = '#07070c') {
  return canvasTex(512, 128, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h); x.strokeStyle = color; x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16);
    x.font = '700 70px "Chakra Petch", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = color; x.shadowBlur = 24; x.fillStyle = color; x.fillText(text, w / 2, h / 2 + 4); x.fillText(text, w / 2, h / 2 + 4);
  });
}
function waterNormalTex(rng) {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d'); const img = x.createImageData(s, s);
  const N = makeNoise(rng);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const f = (a, b) => N.fbm(a / 40, b / 40, 3);
    const dx = f(i + 1, j) - f(i - 1, j), dy = f(i, j + 1) - f(i, j - 1); const k = (j * s + i) * 4;
    img.data[k] = 128 + dx * 160; img.data[k + 1] = 128 + dy * 160; img.data[k + 2] = 255; img.data[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* ---------- sky shaders ---------- */
function gradientSky(top, horizon, stars, seed) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(top) }, horizon: { value: C(horizon) }, stars: { value: stars }, seed: { value: seed % 1000 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform float stars; uniform float seed; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)) + seed) * 43758.5453); }
      void main(){ float y = clamp(vP.y, -1.0, 1.0); vec3 c = mix(horizon, top, smoothstep(-0.05, 0.6, y));
        vec3 q = floor(vP * 420.0); float s = step(0.9975, h(q)) * stars * smoothstep(0.02, 0.3, y); c += vec3(s) * (0.6 + 0.4 * h(q + 1.0));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
}
function auroraMesh(colorA, colorB) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { t: { value: 0 }, a: { value: C(colorA) }, b: { value: C(colorB) } },
    vertexShader: 'varying vec2 vU; uniform float t; void main(){ vU = uv; vec3 p = position; p.z += sin(p.x*0.004 + t*0.3)*120.0; p.y += sin(p.x*0.01 + t*0.5)*20.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }',
    fragmentShader: `varying vec2 vU; uniform float t; uniform vec3 a; uniform vec3 b;
      void main(){ float w = sin(vU.x*40.0 + t*0.8)*0.5+0.5; float fade = smoothstep(0.0,0.25,vU.y)*smoothstep(1.0,0.35,vU.y);
        float bands = 0.55 + 0.45*sin(vU.x*130.0 + t*2.0 + sin(vU.x*9.0)*4.0);
        vec3 c = mix(a, b, vU.y + 0.2*w); gl_FragColor = vec4(c, fade * bands * 0.55); }`,
  });
  const g = new THREE.PlaneGeometry(2600, 260, 160, 1);
  const m = new THREE.Mesh(g, mat); m.position.set(0, 380, -900); return m;
}
function lavaMaterial(col) {
  return new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, hot: { value: C(col) } },
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: `varying vec2 vW; uniform float t; uniform vec3 hot;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hs(i),hs(i+vec2(1,0)),f.x), mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.1; a*=0.5; } return s; }
      void main(){ vec2 p = vW*0.08; float n = fbm(p + vec2(t*0.05, t*0.03)); float m = fbm(p*2.0 - vec2(t*0.08));
        float crust = smoothstep(0.45, 0.62, n*0.7 + m*0.5); vec3 c = mix(hot*3.2 + vec3(0.6,0.3,0.0)*m, vec3(0.06,0.03,0.02), crust);
        gl_FragColor = vec4(c, 1.0); }`,
  });
}

/* ================= main builder ================= */
export function buildWorld(scene, renderer, spec, quality) {
  const rng = mulberry(spec.seed || 1);
  const N = makeNoise(rng);
  const A = ARCHETYPES[spec.archetype];
  const P = spec.palette;
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];
  const add = o => { group.add(o); return o; };
  const animated = []; // {update(dt,t)}
  const colliders = []; // {minX,maxX,minZ,maxZ,top}
  const B = spec.archetype === 'vertical_pit' ? 54 : 84; // playable half-extent
  const terrainType = A.terrain;
  let waterLevel = null;
  const night = spec.timeOfDay === 'night' || spec.archetype === 'vertical_pit';

  /* ----- height field ----- */
  const outside = (x, z) => Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - B);
  let heightAt;
  if (terrainType === 'island') {
    waterLevel = 0;
    heightAt = (x, z) => { const r = (0.5 * Math.hypot(x, z) + 0.5 * Math.max(Math.abs(x), Math.abs(z))) / 112; const isl = 1 - smooth(0.72, 1.12, r);
      return (N.fbm(x * 0.011, z * 0.011) * 9 + 3.2 + Math.max(0, N.n2(x * 0.004, z * 0.004)) * 10) * isl + (isl - 1) * 7; };
  } else if (terrainType === 'dunes') {
    heightAt = (x, z) => N.fbm(x * 0.008, z * 0.008) * 4 + Math.sin(x * 0.045 + N.n2(x * 0.01, z * 0.01) * 3) * 1.8 + 1 + outside(x, z) * 0.35;
  } else if (terrainType === 'hills') {
    heightAt = (x, z) => N.fbm(x * 0.012, z * 0.012) * 4.5 + 0.5 + outside(x, z) * 0.45 + Math.max(0, N.n2(x * 0.003, z * 0.003)) * outside(x, z) * 0.6;
  } else if (terrainType === 'lava') {
    waterLevel = -0.55; // lava surface
    heightAt = (x, z) => { const ch = Math.abs(N.n2(x * 0.012 + 3.1, z * 0.012 - 1.7)); const base = N.fbm(x * 0.015, z * 0.015) * 4 + 1.2 + outside(x, z) * 0.6;
      return ch < 0.06 && Math.max(Math.abs(x), Math.abs(z)) < B + 30 ? lerpN(-1.4, base, smooth(0.02, 0.06, ch)) : base; };
  } else if (terrainType === 'flatwater') {
    waterLevel = 0.18;
    heightAt = (x, z) => { const canal = Math.abs(((x + 300) % 56) - 28) < 4 && !(Math.abs(((z + 300) % 50) - 25) < 4);
      return canal && Math.abs(x) < B + 10 ? -2.6 : N.fbm(x * 0.02, z * 0.02) * 0.25 + outside(x, z) * 0.05; };
  } else if (terrainType === 'pit') {
    heightAt = (x, z) => (Math.abs(x) < 9 && Math.abs(z) < 9) ? -400 : 0;
  } else {
    heightAt = (x, z) => 0;
  }
  function lerpN(a, b, t) { return a + (b - a) * t; }
  // cache the playable area's heights on a 1 m grid: rays and AI sample this thousands of times a second
  if (terrainType !== 'pit' && terrainType !== 'flat') {
    const rawH = heightAt, HC = Math.ceil(B + 14), HN = HC * 2 + 1, hc = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) hc[j * HN + i] = rawH(i - HC, j - HC);
    heightAt = (x, z) => { const fx = x + HC, fz = z + HC; if (fx < 0 || fz < 0 || fx >= HN - 1 || fz >= HN - 1) return rawH(x, z); const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * HN + i;
      return (hc[k] * (1 - tx) + hc[k + 1] * tx) * (1 - tz) + (hc[k + HN] * (1 - tx) + hc[k + HN + 1] * tx) * tz; };
  }

  /* ----- sky, light, fog ----- */
  const elev = spec.sky.sunElevation, az = spec.sky.sunAzimuth;
  const phi = THREE.MathUtils.degToRad(90 - Math.max(elev, -10)), theta = THREE.MathUtils.degToRad(az);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  const envScene = new THREE.Scene();
  let skyMesh;
  const useSkyShader = !night && spec.archetype !== 'shadow_realm' && elev > -2;
  if (useSkyShader) {
    const sky = new Sky(); sky.scale.setScalar(4000);
    const u = sky.material.uniforms; u.turbidity.value = spec.sky.turbidity; u.rayleigh.value = spec.weather === 'sandstorm' ? 4 : elev < 12 ? 2.6 : 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86; u.sunPosition.value.copy(sunDir);
    skyMesh = sky;
    const s2 = new Sky(); s2.scale.setScalar(4000); Object.keys(u).forEach(k => s2.material.uniforms[k].value = u[k].value); envScene.add(s2);
  } else {
    const top = spec.archetype === 'shadow_realm' ? '#050208' : spec.archetype === 'vertical_pit' ? '#020203' : '#03050d';
    skyMesh = gradientSky(top, spec.sky.tint, spec.archetype === 'vertical_pit' ? 0 : 1, spec.seed);
    envScene.add(gradientSky(top, spec.sky.tint, 0, 1));
  }
  add(skyMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.04); scene.environment = envRT.texture; pmrem.dispose(); disposables.push(envRT);
  scene.environmentIntensity = night ? 0.25 : 0.7; // r163+ only; harmless otherwise

  const fogCol = C(spec.fog.color);
  const wFog = { fog: 0.016, sandstorm: 0.022, snow: 0.009, storm: 0.007, rain: 0.006, spores: 0.012, ash: 0.01, clear: 0.0028 }[spec.weather] || 0.004;
  const fogDensity = wFog * (0.6 + spec.fog.density) + (spec.archetype === 'vertical_pit' ? 0.012 : 0);
  scene.fog = new THREE.FogExp2(fogCol, fogDensity);
  scene.background = null;

  const sunColor = elev < 0 ? C('#8fa8ff') : elev < 8 ? C('#ff9a55') : elev < 20 ? C('#ffc58a') : C('#fff3e0');
  const sunInt = spec.archetype === 'vertical_pit' ? 1.4 : night ? 0.55 : elev < 8 ? 1.9 : elev < 20 ? 2.6 : 3.2;
  const sun = new THREE.DirectionalLight(sunColor, sunInt);
  if (spec.archetype === 'vertical_pit') sun.position.set(0.2, 1, 0.1).multiplyScalar(100); else sun.position.copy(night ? new THREE.Vector3(-0.4, 0.8, 0.3) : sunDir.clone().setY(Math.max(sunDir.y, 0.12))).multiplyScalar(100);
  sun.castShadow = true; const sm = quality.high ? 2048 : 1024; sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  add(sun); add(sun.target);
  const pitHall = spec.archetype === 'vertical_pit';
  const hemi = new THREE.HemisphereLight(pitHall ? C('#9a8f80') : night ? C(spec.sky.tint).lerp(C('#4a5878'), 0.6) : C(spec.sky.tint), pitHall ? C('#3a342e') : C(P.secondary).multiplyScalar(0.5), pitHall ? 0.9 : night ? 0.6 : 1.0);
  add(hemi);
  const exposure = { night: 1.15, dusk: 0.95, dawn: 0.9, golden: 0.75, day: 0.62 }[spec.timeOfDay] || 0.8;

  /* ----- terrain ----- */
  const groundCol = { island: ['#4c6a33', '#7a6b4a', '#d9c99a'], dunes: [P.primary, P.secondary, '#f0d9a8'], hills: [P.primary, P.secondary, '#ffffff'], lava: ['#2a2321', '#151110', '#3a2a24'], flatwater: ['#55604f', '#3d4a3d', '#6d6a55'], pit: ['#7b766e', '#5c5852', '#8b857c'], flat: ['#1b1d22', '#121418', '#2a2c33'] }[terrainType];
  if (spec.archetype === 'shadow_realm') groundCol.splice(0, 3, '#1c1820', '#100c14', '#2a1f2c');
  if (spec.archetype === 'frozen_station') groundCol.splice(0, 3, '#e9eef2', '#b8c6cf', '#ffffff');
  if (terrainType !== 'pit') {
    const SIZE = terrainType === 'island' ? 520 : 460, SEG = quality.high ? 220 : 140;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const c0 = C(groundCol[0]), c1 = C(groundCol[1]), c2 = C(groundCol[2]), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); const y = Math.max(heightAt(x, z), -30); pos.setY(i, y);
      const n = N.fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
      tmp.copy(c0).lerp(c1, n);
      if (terrainType === 'island' && y < 1.2) tmp.lerp(c2, smooth(1.2, 0.2, y));
      if (terrainType === 'dunes' || terrainType === 'hills') tmp.lerp(c2, smooth(2, 6, y) * 0.5);
      if (terrainType === 'lava' && y < -0.3) tmp.set('#120806');
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const detail = grainTex(rng, 205, 70, SIZE / 6);
    const wet = spec.weather === 'rain' || spec.weather === 'storm' || terrainType === 'flatwater';
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: terrainType === 'flat' ? (wet ? 0.18 : 0.6) : wet ? 0.55 : 0.95, metalness: terrainType === 'flat' ? 0.35 : 0 });
    if (spec.archetype === 'shadow_realm') { mat.emissive = C(P.emissive); mat.emissiveMap = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 1.5; for (let k = 0; k < 14; k++) { let px = rng() * w, py = rng() * h; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 14; s++) { px += (rng() - 0.5) * 40; py += (rng() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); } }, SIZE / 30); mat.emissiveIntensity = 0.9; }
    const terrain = new THREE.Mesh(g, mat); terrain.receiveShadow = true; add(terrain);
  }

  /* ----- water / lava ----- */
  if (waterLevel !== null && terrainType !== 'lava') {
    const nt = waterNormalTex(rng); nt.repeat.set(60, 60);
    const wm = new THREE.MeshStandardMaterial({ color: terrainType === 'island' ? C('#1f5560') : C('#3d5550'), roughness: 0.06, metalness: 0.25, normalMap: nt, normalScale: new THREE.Vector2(0.35, 0.35), transparent: true, opacity: terrainType === 'flatwater' ? 0.82 : 0.9 });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), wm); water.rotation.x = -Math.PI / 2; water.position.y = waterLevel; water.receiveShadow = true; add(water);
    animated.push({ update: (dt, t) => { nt.offset.set(t * 0.006, t * 0.004); } });
  }
  if (terrainType === 'lava') {
    const lm = lavaMaterial(P.emissive); const lava = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), lm); lava.rotation.x = -Math.PI / 2; lava.position.y = waterLevel; add(lava);
    animated.push({ update: (dt, t) => { lm.uniforms.t.value = t; } });
  }

  /* ----- helpers for solid objects ----- */
  const mats = {
    stone: new THREE.MeshStandardMaterial({ color: C(P.secondary).lerp(C('#8a8478'), 0.5), map: grainTex(rng, 190, 80, 1), roughness: 0.92 }),
    concrete: new THREE.MeshStandardMaterial({ color: '#b5afa5', map: concreteTex(rng, 1), roughness: 0.88 }),
    metal: new THREE.MeshStandardMaterial({ color: C(P.secondary).lerp(C('#555a60'), 0.6), roughness: 0.45, metalness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.6, metalness: 0.4 }),
    crate: new THREE.MeshStandardMaterial({ color: C('#6b5a3c').lerp(C(P.primary), 0.25), map: canvasTex(128, 128, (x, w, h) => { x.fillStyle = '#9a8b70'; x.fillRect(0, 0, w, h); x.strokeStyle = '#4a3d2a'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10); x.lineWidth = 7; x.beginPath(); x.moveTo(8, 8); x.lineTo(w - 8, h - 8); x.stroke(); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(60,40,20,${rng() * 0.15})`; x.fillRect(rng() * w, rng() * h, 2, 8); } }), roughness: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: C(P.accent), roughness: 0.5, metalness: 0.2 }),
    glow: new THREE.MeshStandardMaterial({ color: '#000', emissive: C(P.emissive), emissiveIntensity: 3 }),
    glowAccent: new THREE.MeshStandardMaterial({ color: '#000', emissive: C(P.accent), emissiveIntensity: 4 }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3a2a', map: grainTex(rng, 170, 90, 1), roughness: 0.95 }),
    sandbag: new THREE.MeshStandardMaterial({ color: '#8f8162', map: grainTex(rng, 200, 60, 1), roughness: 1 }),
  };
  function solid(geo, mat, x, y, z, opts = {}) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (opts.ry) m.rotation.y = opts.ry; if (opts.rx) m.rotation.x = opts.rx; if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.shadow !== false; m.receiveShadow = true; add(m);
    if (opts.collide !== false) { m.updateMatrixWorld(); const bb = new THREE.Box3().setFromObject(m); const ground = groundAt(x, z); if (bb.max.y - ground > 0.4) colliders.push({ minX: bb.min.x, maxX: bb.max.x, minZ: bb.min.z, maxZ: bb.max.z, top: bb.max.y, bottom: bb.min.y }); }
    return m;
  }
  const groundAt = (x, z) => Math.max(heightAt(x, z), terrainType === 'pit' ? 0 : -50);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  function freeSpot(r, tries = 60, region = B - 4, avoidCenter = 0) {
    for (let k = 0; k < tries; k++) {
      const x = (rng() * 2 - 1) * region, z = (rng() * 2 - 1) * region;
      if (Math.hypot(x, z) < avoidCenter) continue;
      if (blockedTerrain(x, z)) continue;
      if (colliders.some(c => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r)) continue;
      return { x, z };
    }
    return null;
  }
  function blockedTerrain(x, z) {
    const h = heightAt(x, z);
    if (terrainType === 'pit') return Math.abs(x) < 10.5 && Math.abs(z) < 10.5;
    if (terrainType === 'island') return h < -0.7;
    if (terrainType === 'lava') return h < -0.2;
    if (terrainType === 'flatwater') return h < -1;
    return false;
  }

  /* ----- archetype kits ----- */
  const lights = []; // point lights (limited)
  function pointLight(color, intensity, dist, x, y, z) { if (lights.length >= (quality.high ? 10 : 5)) return null; const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); add(l); lights.push(l); return l; }
  const kit = A.kit;
  const ds = spec.density.structures;

  if (kit === 'brutalist') {
    const H = 16, HALL = 60;
    const wallMat = mats.concrete.clone(); wallMat.map = concreteTex(rng, 4);
    for (const [x, z, w, d] of [[0, -HALL, HALL * 2 + 2, 2], [0, HALL, HALL * 2 + 2, 2], [-HALL, 0, 2, HALL * 2], [HALL, 0, 2, HALL * 2]]) solid(box(w, H, d), wallMat, x, H / 2, z);
    const floorMat = mats.concrete.clone(); floorMat.map = concreteTex(rng, 30); floorMat.roughness = 0.7;
    const fl = (w, d, x, z, y = 0) => { const m = new THREE.Mesh(box(w, 1, d), floorMat); m.position.set(x, y - 0.5, z); m.receiveShadow = true; add(m); return m; };
    fl(HALL * 2, HALL - 9, 0, -(HALL + 9) / 2); fl(HALL * 2, HALL - 9, 0, (HALL + 9) / 2); fl(HALL - 9, 18, -(HALL + 9) / 2, 0); fl(HALL - 9, 18, (HALL + 9) / 2, 0);
    // ceiling with hole
    const ceil = (w, d, x, z) => { const m = new THREE.Mesh(box(w, 1.2, d), wallMat); m.position.set(x, H, z); add(m); };
    ceil(HALL * 2, HALL - 9, 0, -(HALL + 9) / 2); ceil(HALL * 2, HALL - 9, 0, (HALL + 9) / 2); ceil(HALL - 9, 18, -(HALL + 9) / 2, 0); ceil(HALL - 9, 18, (HALL + 9) / 2, 0);
    // the shaft: levels above and below
    const ringMat = wallMat.clone(); ringMat.map = concreteTex(rng, 2);
    const strip = mats.glow.clone(); strip.emissive = C(P.emissive); strip.emissiveIntensity = 2.2;
    const red = mats.glowAccent;
    for (let i = -3; i <= 22; i++) {
      if (i === 0) continue; const y = i * -H;
      for (const [x, z, w, d] of [[0, -14, 30, 10], [0, 14, 30, 10], [-14, 0, 10, 18], [14, 0, 10, 18]]) { const m = new THREE.Mesh(box(w, 1.2, d), ringMat); m.position.set(x, y, z); add(m); }
      for (const s of [-1, 1]) { const a = new THREE.Mesh(box(18, 0.25, 0.25), i % 7 === 0 ? red : strip); a.position.set(0, y - 0.8, s * 9.1); add(a); const b2 = new THREE.Mesh(box(0.25, 0.25, 18), strip); b2.position.set(s * 9.1, y - 0.8, 0); add(b2); }
    }
    // edge of the void: glowing lip + warning stripes
    for (const s of [-1, 1]) { const a = new THREE.Mesh(box(19, 0.12, 0.4), red); a.position.set(0, 0.06, s * 9.2); add(a); const b2 = new THREE.Mesh(box(0.4, 0.12, 19), red); b2.position.set(s * 9.2, 0.06, 0); add(b2); }
    // the platform: a slab that endlessly travels the shaft with a long table on it
    const plat = new THREE.Group(); const slab = new THREE.Mesh(box(15, 1.4, 15), mats.metal); slab.castShadow = true; slab.receiveShadow = true; plat.add(slab);
    const table = new THREE.Mesh(box(10, 0.3, 3), new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.3, metalness: 0.1 })); table.position.y = 1.4; plat.add(table);
    for (let k = 0; k < 14; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.22 + rng() * 0.25, 10, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rng() * 0.12, 0.6, 0.45), roughness: 0.4 })); f.position.set(-4.5 + k * 0.7, 1.7, (rng() - 0.5) * 2); plat.add(f); }
    const pl = new THREE.PointLight(C(P.emissive), 60, 30, 2); pl.position.y = 4; plat.add(pl);
    add(plat);
    animated.push({ update: (dt, t) => { plat.position.y = 60 - ((t * 7) % 360); plat.rotation.y = Math.sin(t * 0.05) * 0.02; } });
    // level number painted on walls
    const lvl = 40 + Math.floor(rng() * 290);
    for (const [x, z, ry] of [[0, -HALL + 1.05, 0], [0, HALL - 1.05, Math.PI], [-HALL + 1.05, 0, Math.PI / 2], [HALL - 1.05, 0, -Math.PI / 2]]) {
      const t = canvasTex(512, 256, (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h); c.font = '700 190px "Big Shoulders Display", Impact, sans-serif'; c.fillStyle = 'rgba(25,22,20,.85)'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(lvl), w / 2, h / 2); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9 })); m.position.set(x, 8, z); m.rotation.y = ry; add(m);
    }
    // pillars, beds, blocks
    for (const sx of [-36, -20, 20, 36]) for (const sz of [-36, -20, 20, 36]) if (rng() < 0.75) solid(box(2.4, H, 2.4), wallMat, sx, H / 2, sz);
    const ceilLights = [[-30, -30], [30, 30], [-30, 30], [30, -30], [0, -40], [0, 40]];
    for (const [x, z] of ceilLights) { const m = new THREE.Mesh(box(6, 0.2, 0.6), strip); m.position.set(x, H - 0.7, z); add(m); pointLight(C(P.emissive), 220, 48, x, H - 2, z); }
    const shaftGlow = new THREE.PointLight(C(P.accent), 160, 40, 2); shaftGlow.position.set(0, -6, 0); add(shaftGlow);
    for (let k = 0; k < 12 + ds * 10; k++) { const s = freeSpot(2, 40, 52, 14); if (!s) continue; if (rng() < 0.5) solid(box(2.2, 0.7, 4), mats.metal, s.x, 0.35, s.z, { ry: rng() < 0.5 ? 0 : Math.PI / 2 }); else solid(box(3 + rng() * 3, 1.3, 1.2), wallMat, s.x, 0.65, s.z, { ry: rng() < 0.5 ? 0 : Math.PI / 2 }); }
  }

  if (kit === 'city') {
    const road = 14, block = 40; const roadMat = new THREE.MeshStandardMaterial({ color: '#d7d23a', emissive: '#3a3500', roughness: 0.4 });
    const neon = [P.accent, P.emissive, '#ff2e88', '#29e6ff', '#b14bff', '#ffe14a'];
    const SIGNS = ['NOODLE 24', 'OMNI-7', 'KAIJU BAR', 'HOTEL LUX', 'ZERO GRAV', 'NEO-TOKYO MART', 'SYNTH CLINIC', 'PACHI 88', 'RED LOTUS', 'VOLT'];
    const windowMats = [0, 1, 2, 3].map(() => { const t = windowsTex(rng, 0.35, neon[Math.floor(rng() * neon.length)]); return new THREE.MeshStandardMaterial({ color: '#0e1016', map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.6 }); });
    for (let gx = -6; gx <= 6; gx++) for (let gz = -6; gz <= 6; gz++) {
      const cx = gx * (block + road), cz = gz * (block + road);
      const inside = Math.abs(cx) < B && Math.abs(cz) < B;
      const lots = inside ? (rng() < 0.25 ? 0 : 2) : 1;
      for (let l = 0; l < lots; l++) {
        const w = inside ? 12 + rng() * 10 : block - 2, d = inside ? 12 + rng() * 10 : block - 2;
        const ox = inside ? (l ? 1 : -1) * (block / 2 - w / 2 - 1) * (rng() < 0.5 ? 1 : -1) : 0, oz = inside ? (rng() - 0.5) * (block - d - 2) : 0;
        const h = inside ? 14 + rng() * 40 : 30 + rng() * (Math.hypot(cx, cz) > 200 ? 160 : 90);
        const mat = windowMats[Math.floor(rng() * windowMats.length)].clone(); mat.map = mat.map.clone(); mat.map.repeat.set(Math.max(1, w / 8), Math.max(1, h / 16)); mat.map.needsUpdate = true; mat.emissiveMap = mat.map;
        solid(box(w, h, d), mat, cx + ox, h / 2, cz + oz, { collide: inside, shadow: inside });
        if (inside && rng() < 0.7) {
          const s = signTex(SIGNS[Math.floor(rng() * SIGNS.length)], neon[Math.floor(rng() * neon.length)]);
          const sm2 = new THREE.MeshStandardMaterial({ map: s, emissive: '#ffffff', emissiveMap: s, emissiveIntensity: 2.4, color: '#000' });
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), sm2); const face = rng() < 0.5 ? 1 : -1;
          sign.position.set(cx + ox, 6 + rng() * 6, cz + oz + face * (d / 2 + 0.06)); if (face < 0) sign.rotation.y = Math.PI; add(sign);
        }
      }
    }
    for (let i = -6; i <= 6; i++) { const off = i * (block + road) + (block + road) / 2; for (const vert of [0, 1]) { const m = new THREE.Mesh(box(vert ? 0.25 : 700, 0.02, vert ? 700 : 0.25), roadMat); m.position.set(vert ? off : 0, 0.02, vert ? 0 : off); add(m); } }
    // cars and barriers on roads
    const carCols = ['#c21f2b', '#1f2a3a', '#e6e6e6', '#202020', '#3a5a7a'];
    for (let k = 0; k < 16 + ds * 14; k++) {
      const s = freeSpot(3, 40); if (!s) continue; const ry = rng() < 0.5 ? 0 : Math.PI / 2;
      const car = solid(box(2, 1.3, 4.4), new THREE.MeshStandardMaterial({ color: carCols[k % carCols.length], roughness: 0.25, metalness: 0.7 }), s.x, 0.75, s.z, { ry });
      const tl = new THREE.Mesh(box(1.8, 0.2, 0.05), mats.glowAccent); tl.position.set(0, 0.2, -2.21); car.add(tl);
      const top = new THREE.Mesh(box(1.8, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: '#0b0e14', roughness: 0.05, metalness: 0.9 })); top.position.set(0, 0.95, -0.2); car.add(top);
    }
    // holo billboard
    const holoT = signTex(spec.landmark ? spec.landmark.toUpperCase().slice(0, 14) : 'ARCOLOGY', P.accent, 'rgba(0,0,0,0)');
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(60, 15), new THREE.MeshBasicMaterial({ map: holoT, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    holo.position.set(0, 70, -130); add(holo); animated.push({ update: (dt, t) => { holo.material.opacity = 0.75 + Math.sin(t * 13) * 0.08 + (Math.random() < 0.02 ? -0.5 : 0); } });
    for (let k = 0; k < 8; k++) { const s = freeSpot(1.5, 30); if (!s) continue; const pole = solid(box(0.25, 7, 0.25), mats.dark, s.x, 3.5, s.z); const lamp = new THREE.Mesh(box(1.4, 0.2, 0.5), mats.glow); lamp.position.set(s.x, 7, s.z); add(lamp); pointLight(C(neon[k % neon.length]), 70, 26, s.x, 6, s.z); }
  }

  if (kit === 'ruins' || kit === 'drowned') {
    const sMat = mats.stone.clone(); sMat.color = C(kit === 'drowned' ? '#8a948a' : '#9a907a');
    const moss = new THREE.MeshStandardMaterial({ color: '#3d5a2a', roughness: 1 });
    if (kit === 'ruins') {
      // stepped temple landmark
      const tp = spec.pois[0] ? { x: spec.pois[0].x * B * 0.8, z: spec.pois[0].z * B * 0.8 } : { x: 0, z: 0 };
      const base = groundAt(tp.x, tp.z);
      for (let s = 0; s < 5; s++) { const w = 22 - s * 4; solid(box(w, 2.2, w), s % 2 ? moss : sMat, tp.x, base + 1.1 + s * 2.2 - 0.8, tp.z, { collide: s === 0 }); }
      const shrine = new THREE.Mesh(box(4, 3, 4), sMat); shrine.position.set(tp.x, base + 12.6, tp.z); shrine.castShadow = true; add(shrine);
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mats.glow); fire.position.set(tp.x, base + 14.6, tp.z); add(fire); pointLight(C(P.emissive), 120, 40, tp.x, base + 15, tp.z);
      for (let k = 0; k < 10 + ds * 14; k++) { const s = freeSpot(2); if (!s) continue; const h = 3 + rng() * 6; const fallen = rng() < 0.3;
        solid(new THREE.CylinderGeometry(0.9, 1.1, h, 10), sMat, s.x, groundAt(s.x, s.z) + (fallen ? 0.9 : h / 2 - 0.3), s.z, fallen ? { rz: Math.PI / 2, ry: rng() * 3 } : {}); }
    } else {
      // ruined, tilted towers half underwater + walkways
      for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
        if (rng() < 0.35) continue; const x = gx * 44 + (rng() - 0.5) * 12, z = gz * 44 + (rng() - 0.5) * 12; if (Math.abs(heightAt(x, z)) > 1) continue;
        const inside = Math.abs(x) < B && Math.abs(z) < B; const w = 8 + rng() * 10, d = 8 + rng() * 10, h = inside ? 6 + rng() * 18 : 20 + rng() * 60;
        const t = windowsTex(rng, 0.05, '#ffe08a', '#55605a'); t.repeat.set(w / 8, h / 16);
        solid(box(w, h, d), new THREE.MeshStandardMaterial({ color: '#8d968e', map: t, roughness: 0.9 }), x, h / 2 - 1.5, z, { rz: (rng() - 0.5) * 0.12, rx: (rng() - 0.5) * 0.08, collide: inside, shadow: inside });
      }
      // colossal robed figure with a torch on the horizon
      const fig = new THREE.Group(); const fm = new THREE.MeshStandardMaterial({ color: '#6fae9a', roughness: 0.6, metalness: 0.5 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 16, 70, 16), fm); body.position.y = 20; fig.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), fm); head.position.y = 62; fig.add(head);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, 34, 10), fm); arm.position.set(9, 70, 0); arm.rotation.z = -0.25; fig.add(arm);
      const torch = new THREE.Mesh(new THREE.SphereGeometry(3.5, 12, 8), mats.glow); torch.position.set(13, 89, 0); fig.add(torch);
      fig.position.set(-150, -14, -190); fig.rotation.z = 0.08; add(fig);
    }
  }

  if (kit === 'modules') {
    const hull = new THREE.MeshStandardMaterial({ color: C(P.accent), roughness: 0.5, metalness: 0.3 });
    const white = new THREE.MeshStandardMaterial({ color: '#dfe5ea', roughness: 0.5, metalness: 0.2 });
    for (let k = 0; k < 5 + ds * 6; k++) {
      const s = freeSpot(9); if (!s) continue; const y = groundAt(s.x, s.z); const ry = rng() < 0.5 ? 0 : Math.PI / 2; const len = 12 + rng() * 10;
      const tube = solid(new THREE.CylinderGeometry(3, 3, len, 18), k % 2 ? hull : white, s.x, y + 4.2, s.z, { rz: Math.PI / 2, ry });
      for (const e of [-1, 1]) { const legX = ry ? 0 : e * len * 0.35, legZ = ry ? e * len * 0.35 : 0; const leg = new THREE.Mesh(box(0.4, 2, 0.4), mats.metal); leg.position.set(s.x + legX, y + 0.8, s.z + legZ); leg.castShadow = true; add(leg); }
      for (let w = -2; w <= 2; w++) { const win = new THREE.Mesh(box(0.8, 0.5, 0.1), mats.glow); win.position.set(ry ? 3.05 : w * 2, 0.6, ry ? w * 2 : 3.05); if (ry) win.rotation.y = Math.PI / 2; tube.add(win); }
    }
    const mx = freeSpot(3) || { x: 20, z: 20 }; const my = groundAt(mx.x, mx.z);
    solid(box(0.6, 34, 0.6), mats.metal, mx.x, my + 17, mx.z); const blink = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), mats.glowAccent.clone()); blink.position.set(mx.x, my + 34.5, mx.z); add(blink);
    animated.push({ update: (dt, t) => { blink.material.emissiveIntensity = (t % 1.6) < 0.2 ? 8 : 0.2; } });
    const dish = solid(new THREE.SphereGeometry(6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3), white, mx.x + 12, my + 5, mx.z, { rx: -0.9, collide: false });
    solid(box(1.2, 4, 1.2), mats.metal, mx.x + 12, my + 2, mx.z);
    if (spec.timeOfDay === 'night' || spec.timeOfDay === 'dawn') { const au = auroraMesh(P.emissive, '#7a5cff'); add(au); animated.push({ update: (dt, t) => { au.material.uniforms.t.value = t; } }); }
  }

  if (kit === 'colossi') {
    const st = new THREE.MeshStandardMaterial({ color: C(P.secondary).lerp(C('#c9a476'), 0.6), map: grainTex(rng, 200, 70, 3), roughness: 0.95 });
    // standing colossus on the horizon
    const col = new THREE.Group();
    const torso = new THREE.Mesh(box(16, 26, 9), st); torso.position.y = 42; col.add(torso);
    const head = new THREE.Mesh(box(8, 10, 8), st); head.position.y = 61; col.add(head);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(box(6, 30, 7), st); leg.position.set(s * 4.5, 15, 0); col.add(leg); const arm = new THREE.Mesh(box(4.5, 26, 5), st); arm.position.set(s * 10.5, 40, 0); arm.rotation.z = s * 0.06; col.add(arm); }
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 80, 8), st); spear.position.set(14, 40, 0); col.add(spear);
    col.traverse(m => { if (m.isMesh) { m.castShadow = true; } }); col.position.set(140 * Math.cos(rng() * 6), -4, -170); add(col);
    // half-buried giant head, giant hand, toppled torso in the arena
    const hp = freeSpot(14, 80, B - 20) || { x: 25, z: -25 };
    const gh = solid(new THREE.SphereGeometry(9, 20, 14), st, hp.x, groundAt(hp.x, hp.z) + 2, hp.z);
    const brow = new THREE.Mesh(box(14, 2.5, 4), st); brow.position.set(0, 3.5, 7); gh.add(brow); const nose = new THREE.Mesh(box(3, 6, 3), st); nose.position.set(0, -0.5, 8.4); gh.add(nose);
    gh.rotation.set(-0.3, rng() * 6, 0.25);
    const hp2 = freeSpot(10, 80, B - 15) || { x: -30, z: 30 }; const by = groundAt(hp2.x, hp2.z);
    solid(box(7, 3, 9), st, hp2.x, by + 1, hp2.z, { ry: rng() * 3 });
    for (let f = 0; f < 4; f++) solid(box(1.6, 7 + f, 1.6), st, hp2.x - 2.4 + f * 1.6, by + 4 + f / 2, hp2.z + 3, { rx: -0.3 + f * 0.05 });
    const hp3 = freeSpot(12, 80, B - 15) || { x: 30, z: 40 };
    solid(box(10, 6, 22), st, hp3.x, groundAt(hp3.x, hp3.z) + 2.4, hp3.z, { ry: rng() * 3, rz: 0.2 });
    for (let k = 0; k < 8 + ds * 8; k++) { const s = freeSpot(2); if (!s) continue; const h = 6 + rng() * 10; solid(box(1.8, h, 1.8), st, s.x, groundAt(s.x, s.z) + h / 2 - 1, s.z, { rz: (rng() - 0.5) * 0.3 }); }
  }

  if (kit === 'forge') {
    const iron = new THREE.MeshStandardMaterial({ color: '#3a3330', roughness: 0.5, metalness: 0.85 });
    for (let k = 0; k < 6 + ds * 6; k++) {
      const s = freeSpot(5); if (!s) continue; const y = groundAt(s.x, s.z); const h = 14 + rng() * 26;
      solid(new THREE.CylinderGeometry(2.5, 3.5, h, 14), iron, s.x, y + h / 2, s.z);
      for (let b = 0; b < 3; b++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.35, 14), mats.glow); band.position.set(s.x, y + 3 + b * (h / 4), s.z); add(band); }
      if (rng() < 0.6) pointLight(C(P.emissive), 140, 36, s.x, y + 4, s.z);
    }
    for (let k = 0; k < 4; k++) { const s = freeSpot(6); if (!s) continue; const y = groundAt(s.x, s.z); solid(box(14, 1, 2.5), iron, s.x, y + 6, s.z, { ry: rng() * 3, collide: false }); solid(box(1, 6, 1), iron, s.x, y + 3, s.z); }
  }

  if (kit === 'inverted') {
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2230', roughness: 0.9, emissive: C(P.emissive), emissiveIntensity: 0.05 });
    for (let k = 0; k < 26; k++) { // upside-down buildings hanging in the sky
      const w = 8 + rng() * 14, h = 16 + rng() * 40; const x = (rng() - 0.5) * 400, z = (rng() - 0.5) * 400;
      const m = new THREE.Mesh(box(w, h, w), dark); m.position.set(x, 70 + rng() * 60 + h / 2, z); m.rotation.set((rng() - 0.5) * 0.3, rng() * 3, (rng() - 0.5) * 0.3); add(m);
      animated.push({ update: (dt, t) => { m.position.y += Math.sin(t * 0.3 + k) * 0.01; } });
    }
    const vein = new THREE.MeshStandardMaterial({ color: '#1a0c10', roughness: 0.6, emissive: C(P.emissive), emissiveIntensity: 0.6 });
    for (let k = 0; k < 14 + ds * 10; k++) { // tendrils
      const s = freeSpot(2); if (!s) continue; const y = groundAt(s.x, s.z); const pts = []; let px = s.x, pz = s.z;
      for (let i = 0; i < 6; i++) { pts.push(new THREE.Vector3(px, y + i * (2 + rng() * 2), pz)); px += (rng() - 0.5) * 4; pz += (rng() - 0.5) * 4; }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.45 + rng() * 0.4, 6), vein); tube.castShadow = true; add(tube);
      colliders.push({ minX: s.x - 0.7, maxX: s.x + 0.7, minZ: s.z - 0.7, maxZ: s.z + 0.7, top: y + 8, bottom: y });
    }
    for (let k = 0; k < 10; k++) { const s = freeSpot(3); if (!s) continue; const r = 1.5 + rng() * 2.5; solid(new THREE.DodecahedronGeometry(r, 0), dark, s.x, groundAt(s.x, s.z) + r * 0.5, s.z, { ry: rng() * 3 }); }
  }

  /* ----- POIs from the director ----- */
  for (const p of spec.pois) {
    const x = p.x * B, z = p.z * B; if (blockedTerrain(x, z) || (terrainType === 'pit' && Math.hypot(x, z) < 14)) continue;
    const y = groundAt(x, z); const ry = Math.round(rng() * 4) * Math.PI / 2;
    if (p.type === 'bunker') {
      const m = terrainType === 'pit' || kit === 'city' ? mats.concrete : mats.stone;
      solid(box(10, 3.2, 0.8), m, x, y + 1.6, z - 4.6); solid(box(0.8, 3.2, 10), m, x - 4.6, y + 1.6, z); solid(box(0.8, 3.2, 10), m, x + 4.6, y + 1.6, z);
      solid(box(4, 3.2, 0.8), m, x - 3, y + 1.6, z + 4.6); const roof = new THREE.Mesh(box(10, 0.6, 10), m); roof.position.set(x, y + 3.5, z); roof.castShadow = true; add(roof);
    } else if (p.type === 'tower') {
      for (const [a, b] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) solid(box(0.35, 9, 0.35), mats.metal, x + a, y + 4.5, z + b);
      const deck = new THREE.Mesh(box(4.4, 0.4, 4.4), mats.crate); deck.position.set(x, y + 9, z); deck.castShadow = true; add(deck);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), mats.dark); roof.position.set(x, y + 12, z); roof.rotation.y = Math.PI / 4; add(roof);
      if (night) pointLight(C(P.emissive), 50, 22, x, y + 8.5, z);
    } else if (p.type === 'wreck') {
      const hull = solid(box(3, 2.2, 9), mats.metal, x, y + 1, z, { ry, rz: 0.15 });
      const rotor = new THREE.Mesh(box(12, 0.15, 0.5), mats.dark); rotor.position.y = 1.4; rotor.rotation.y = 0.7; hull.add(rotor);
      const ember = pointLight(C('#ff7a2a'), 40, 16, x, y + 2, z); if (ember) animated.push({ update: () => { ember.intensity = 30 + Math.random() * 25; } });
    } else if (p.type === 'statue') {
      const st = mats.stone; solid(box(3, 1.5, 3), st, x, y + 0.75, z); const body = solid(new THREE.CylinderGeometry(0.8, 1.1, 4.5, 8), st, x, y + 3.7, z); const h = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), st); h.position.y = 2.8; body.add(h);
    } else if (p.type === 'ruin') {
      for (let k = 0; k < 4; k++) solid(box(1 + rng() * 6, 1 + rng() * 4, 0.9), mats.stone, x + (rng() - 0.5) * 8, y + 1, z + (rng() - 0.5) * 8, { ry: Math.round(rng()) * Math.PI / 2 });
    } else {
      for (let k = 0; k < 5; k++) { const s = 1.2 + rng() * 0.6; solid(box(s, s, s), mats.crate, x + (rng() - 0.5) * 6, y + s / 2, z + (rng() - 0.5) * 6, { ry: rng() }); }
    }
  }

  /* ----- general cover ----- */
  const coverN = Math.round((terrainType === 'pit' ? 6 : 18) * spec.density.cover + 6);
  for (let k = 0; k < coverN; k++) {
    const s = freeSpot(2, 50, B - 4, terrainType === 'pit' ? 13 : 0); if (!s) continue; const y = groundAt(s.x, s.z); const ry = rng() * Math.PI;
    const r = rng();
    if (r < 0.35) { const sz = 1.2 + rng() * 0.5; solid(box(sz, sz, sz), mats.crate, s.x, y + sz / 2, s.z, { ry }); if (rng() < 0.5) solid(box(sz, sz, sz), mats.crate, s.x + 0.2, y + sz * 1.5, s.z, { ry: ry + 0.3 }); }
    else if (r < 0.6) { const len = 3 + rng() * 2; const g = new THREE.CapsuleGeometry(0.32, len - 0.6, 4, 8); g.rotateZ(Math.PI / 2); const m = solid(new THREE.BoxGeometry(len, 1.1, 0.9), mats.sandbag, s.x, y + 0.55, s.z, { ry: 0 }); m.visible = false;
      for (let row = 0; row < 3; row++) { const bag = new THREE.Mesh(g, mats.sandbag); bag.position.set(s.x, y + 0.3 + row * 0.35, s.z + (row % 2 ? 0.05 : -0.05)); bag.castShadow = true; add(bag); } }
    else if (r < 0.8) solid(box(4, 1.2, 0.5), kit === 'city' || kit === 'brutalist' ? mats.concrete : mats.metal, s.x, y + 0.6, s.z, { ry: Math.round(ry / (Math.PI / 2)) * Math.PI / 2 });
    else { const g = new THREE.DodecahedronGeometry(1 + rng() * 1.2, 1); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.85 + rng() * 0.3), pa.getY(i) * (0.7 + rng() * 0.3), pa.getZ(i) * (0.85 + rng() * 0.3)); g.computeVertexNormals();
      solid(g, kit === 'modules' ? new THREE.MeshStandardMaterial({ color: '#cfe3ef', roughness: 0.15, metalness: 0.1 }) : mats.stone, s.x, y + 0.5, s.z, { ry }); }
  }

  /* ----- vegetation (instanced) ----- */
  const veg = A.veg, vd = spec.density.vegetation;
  if (veg !== 'none') {
    const trunkG = new THREE.CylinderGeometry(0.25, 0.45, 1, 7); trunkG.translate(0, 0.5, 0);
    const leafG = new THREE.IcosahedronGeometry(1, 1);
    const coneG = new THREE.ConeGeometry(1, 1, 8); coneG.translate(0, 0.5, 0);
    const trunks = [], crowns = [], cones = [], shrooms = [], ferns = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const place = (arr, x, y, z, sx, sy, sz, ry = 0, rx = 0) => { e.set(rx, ry, 0); q.setFromEuler(e); arr.push(m4.compose(v.set(x, y, z), q, sc.set(sx, sy, sz)).clone()); };
    const count = Math.round((veg === 'jungle' ? 260 : veg === 'tundra' ? 90 : veg === 'fungal' ? 120 : 50) * (0.4 + vd));
    for (let k = 0; k < count; k++) {
      const inside = k < count * 0.6; const R = inside ? B : B + 90;
      const x = (rng() * 2 - 1) * R, z = (rng() * 2 - 1) * R;
      if (inside && (blockedTerrain(x, z) || colliders.some(c => x > c.minX - 1.5 && x < c.maxX + 1.5 && z > c.minZ - 1.5 && z < c.maxZ + 1.5))) continue;
      const y = groundAt(x, z); if (waterLevel !== null && y < waterLevel + 0.2 && terrainType !== 'flatwater') continue;
      if (veg === 'jungle') {
        const giant = rng() < 0.12; const h = giant ? 24 + rng() * 14 : 7 + rng() * 7; const r = giant ? 1.4 : 0.5 + rng() * 0.3;
        place(trunks, x, y - 0.3, z, r * 2, h, r * 2, rng() * 6);
        for (let c = 0; c < (giant ? 6 : 3); c++) { const s = (giant ? 6 : 2.6) * (0.7 + rng() * 0.6); place(crowns, x + (rng() - 0.5) * s, y + h - 1 + rng() * s * 0.6, z + (rng() - 0.5) * s, s, s * 0.7, s, rng() * 6); }
        for (let f = 0; f < 3; f++) place(ferns, x + (rng() - 0.5) * 5, y, z + (rng() - 0.5) * 5, 1 + rng(), 0.5 + rng() * 0.6, 1 + rng(), rng() * 6);
        if (inside) colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: y + h, bottom: y });
      } else if (veg === 'tundra') {
        const h = 6 + rng() * 9; place(trunks, x, y - 0.2, z, 0.8, h * 0.3, 0.8);
        for (let c = 0; c < 3; c++) place(cones, x, y + h * 0.18 + c * h * 0.24, z, 2.6 - c * 0.7, h * 0.38, 2.6 - c * 0.7, rng());
        if (inside) colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4, top: y + h, bottom: y });
      } else if (veg === 'dead') {
        const h = 4 + rng() * 6; place(trunks, x, y - 0.2, z, 0.7, h, 0.7, 0, (rng() - 0.5) * 0.3);
        for (let b = 0; b < 3; b++) place(trunks, x, y + h * (0.4 + b * 0.18), z, 0.3, h * 0.35, 0.3, rng() * 6, 0.9 + rng() * 0.5);
        if (inside) colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, top: y + h, bottom: y });
      } else if (veg === 'fungal') {
        const h = 1 + rng() * (rng() < 0.15 ? 9 : 2.5); place(trunks, x, y - 0.1, z, 0.5 * h * 0.3 + 0.3, h, 0.5 * h * 0.3 + 0.3);
        place(shrooms, x, y + h, z, h * 0.7 + 0.6, h * 0.35 + 0.3, h * 0.7 + 0.6);
        if (inside && h > 3) colliders.push({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6, top: y + h, bottom: y });
      }
    }
    const inst = (geo, mat, arr, colorize) => { if (!arr.length) return; const m = new THREE.InstancedMesh(geo, mat, arr.length); const cc = new THREE.Color();
      arr.forEach((M, i) => { m.setMatrixAt(i, M); if (colorize) m.setColorAt(i, colorize(cc)); }); m.castShadow = true; m.receiveShadow = true; add(m); };
    const leafCol = C(veg === 'jungle' ? '#3f6e2c' : '#2f4a33');
    inst(trunkG, veg === 'fungal' ? new THREE.MeshStandardMaterial({ color: '#d8cfc0', roughness: 0.8 }) : veg === 'dead' ? new THREE.MeshStandardMaterial({ color: '#3a302a', roughness: 1 }) : mats.bark, trunks);
    inst(leafG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true }), crowns, c => c.copy(leafCol).offsetHSL((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.12));
    inst(coneG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), cones, c => c.set(rng() < 0.6 ? '#e8f0f4' : '#2d4a3a'));
    inst(new THREE.ConeGeometry(1, 1, 5, 1, true), new THREE.MeshStandardMaterial({ color: '#4d7a33', roughness: 0.9, side: THREE.DoubleSide }), ferns);
    inst(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#111', emissive: C(P.emissive), emissiveIntensity: 1.6, roughness: 0.5 }), shrooms);
  }

  /* ----- rocks ring / backdrop mountains for non-island outdoors ----- */
  if (['dunes', 'hills', 'lava'].includes(terrainType)) {
    const g = new THREE.DodecahedronGeometry(1, 1); const pa = g.attributes.position; for (let i = 0; i < pa.count; i++) { const n = 0.75 + rng() * 0.5; pa.setXYZ(i, pa.getX(i) * n, pa.getY(i) * n, pa.getZ(i) * n); } g.computeVertexNormals();
    const arr = []; const m4 = new THREE.Matrix4();
    for (let k = 0; k < 40; k++) { const a = rng() * Math.PI * 2, r = B + 30 + rng() * 120, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 6 + rng() * 22;
      arr.push(m4.compose(new THREE.Vector3(x, heightAt(x, z) + s * 0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * 6, rng())), new THREE.Vector3(s, s * (0.6 + rng() * 0.8), s)).clone()); }
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: C(groundCol[1]).lerp(C('#555'), 0.3), roughness: 0.95, flatShading: true }), arr.length);
    arr.forEach((M, i) => m.setMatrixAt(i, M)); m.castShadow = true; m.receiveShadow = true; add(m);
  }

  /* ----- weather particles (follow camera) ----- */
  const weather = spec.weather;
  let rain = null, flakes = null;
  if (weather === 'rain' || weather === 'storm') {
    const n = quality.high ? 9000 : 4000, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = (rng() - 0.5) * 80, y = rng() * 40, z = (rng() - 0.5) * 80; pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#a9b8cc', transparent: true, opacity: 0.35 })); rain.frustumCulled = false; add(rain);
  }
  if (['snow', 'sandstorm', 'ash', 'spores'].includes(weather)) {
    const n = quality.high ? 6000 : 2500, pos = new Float32Array(n * 3), seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([(rng() - 0.5) * 90, rng() * 40, (rng() - 0.5) * 90], i * 3); seeds[i] = rng(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = { snow: '#ffffff', sandstorm: '#d9b07a', ash: '#9a8f88', spores: P.emissive }[weather];
    flakes = new THREE.Points(g, new THREE.PointsMaterial({ color, size: weather === 'sandstorm' ? 0.12 : weather === 'spores' ? 0.16 : 0.1, transparent: true, opacity: weather === 'spores' ? 0.9 : 0.8, depthWrite: false, blending: weather === 'spores' ? THREE.AdditiveBlending : THREE.NormalBlending }));
    flakes.userData.seeds = seeds; flakes.frustumCulled = false; add(flakes);
  }

  /* ----- lightning / blackout ----- */
  const flashLight = new THREE.DirectionalLight(spec.archetype === 'shadow_realm' ? '#ff3344' : '#cfe0ff', 0); flashLight.position.set(30, 100, -20); add(flashLight);
  let flashT = 0, nextBolt = 4 + rng() * 8; const baseHemi = hemi.intensity, baseSun = sun.intensity; let blackout = 0;
  function flash(power = 1) { flashT = 0.35 * power; }
  const stormy = weather === 'storm' || spec.archetype === 'shadow_realm';

  /* ----- nav grid ----- */
  const CELL = 2, NG = Math.ceil((B * 2) / CELL);
  const blocked = new Uint8Array(NG * NG);
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
    const x = -B + (i + 0.5) * CELL, z = -B + (j + 0.5) * CELL;
    let b = blockedTerrain(x, z) ? 1 : 0;
    if (!b) for (const c of colliders) { if (c.top - groundAt(x, z) < 0.5) continue; if (x > c.minX - 0.7 && x < c.maxX + 0.7 && z > c.minZ - 0.7 && z < c.maxZ + 0.7) { b = 1; break; } }
    if (!b && terrainType !== 'pit' && terrainType !== 'flat') { const s = Math.abs(heightAt(x + 1, z) - heightAt(x - 1, z)) + Math.abs(heightAt(x, z + 1) - heightAt(x, z - 1)); if (s > 2.4) b = 1; }
    blocked[j * NG + i] = b;
  }
  const nav = { CELL, NG, B, blocked,
    cellOf: (x, z) => [Math.max(0, Math.min(NG - 1, Math.floor((x + B) / CELL))), Math.max(0, Math.min(NG - 1, Math.floor((z + B) / CELL)))],
    center: (i, j) => ({ x: -B + (i + 0.5) * CELL, z: -B + (j + 0.5) * CELL }),
    free: (i, j) => i >= 0 && j >= 0 && i < NG && j < NG && !blocked[j * NG + i] };

  function hazardAt(x, z, y) {
    if (terrainType === 'pit' && Math.abs(x) < 9 && Math.abs(z) < 9) return 'fall';
    if (terrainType === 'lava' && heightAt(x, z) < -0.3 && y < 0.2) return 'lava';
    return null;
  }

  /* ----- update ----- */
  function update(dt, t, cam) {
    for (const a of animated) a.update(dt, t);
    const cx = cam.position.x, cz = cam.position.z;
    sun.target.position.set(cx, 0, cz); sun.position.set(cx, 0, cz).add(spec.archetype === 'vertical_pit' ? new THREE.Vector3(10, 100, 5) : (night ? new THREE.Vector3(-40, 80, 30) : sunDir.clone().setY(Math.max(sunDir.y, 0.12)).normalize().multiplyScalar(120)));
    if (rain) { rain.position.set(cx, 0, cz); const p = rain.geometry.attributes.position; for (let i = 0; i < p.count; i += 2) { let y = p.getY(i) - dt * 32; if (y < cam.position.y - 6) y += 40; p.setY(i, y); p.setY(i + 1, y + 0.7); } p.needsUpdate = true; }
    if (flakes) { flakes.position.set(cx, 0, cz); const p = flakes.geometry.attributes.position, s = flakes.userData.seeds; const wind = weather === 'sandstorm' ? 18 : 1.2, fall = weather === 'snow' ? 2.2 : weather === 'sandstorm' ? 0.6 : weather === 'spores' ? -0.25 : 1.1;
      for (let i = 0; i < p.count; i++) { let x = p.getX(i) + (wind + Math.sin(t + s[i] * 9)) * dt * (0.5 + s[i]), y = p.getY(i) - fall * dt * (0.5 + s[i]); if (x > 45) x -= 90; if (x < -45) x += 90; if (y < cam.position.y - 8) y += 40; if (y > cam.position.y + 32) y -= 40; p.setX(i, x); p.setY(i, y); } p.needsUpdate = true; }
    if (stormy) { nextBolt -= dt; if (nextBolt <= 0) { flash(1); nextBolt = 5 + Math.random() * 12; return 'thunder'; } }
    if (flashT > 0) { flashT -= dt; flashLight.intensity = (Math.random() < 0.6 ? 6 : 2) * Math.max(0, flashT / 0.35); } else flashLight.intensity = 0;
    const bo = blackout > 0 ? 0.15 : 1; hemi.intensity = baseHemi * bo; sun.intensity = baseSun * (blackout > 0 && spec.archetype === 'vertical_pit' ? 0.1 : 1); lights.forEach(l => l.visible = blackout <= 0); if (blackout > 0) blackout -= dt;
    return null;
  }

  return { group, heightAt: groundAt, colliders, nav, B, waterLevel, hazardAt, update, flash, exposure, terrainType,
    setBlackout: s => { blackout = s; }, sun, hemi, night,
    dispose() { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }); } }); disposables.forEach(d => d.dispose()); scene.environment = null; scene.fog = null; } };
}
