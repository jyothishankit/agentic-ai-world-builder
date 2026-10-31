// Killhouse: cinematic 3D shooter with an AI World Director, an AI Battle Commander and agentic NPCs.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as AG from './agents.js';
import { buildWorld } from './world.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/* =============================== renderer =============================== */
const canvas = $('#game');
const isTouch = matchMedia('(pointer: coarse)').matches;
let quality = { high: !isTouch };
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.08, 6000);
scene.add(camera);
let composer = null, bloom = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function resize() {
  const w = innerWidth, h = innerHeight; const pr = Math.min(devicePixelRatio || 1, quality.high ? 1.5 : 1);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
}
setupComposer(); addEventListener('resize', resize); resize();
const DEBUG = { noRender: false };
function render() { if (DEBUG.noRender) return; if (quality.high && composer) composer.render(); else renderer.render(scene, camera); }

/* =============================== audio =============================== */
const audio = { ctx: null, master: null, music: null, noise: null, muted: false, voices: true };
function initAudio() {
  if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  try {
    const c = audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
    audio.master = c.createGain(); audio.master.gain.value = 0.9; audio.master.connect(c.destination);
    audio.music = c.createGain(); audio.music.gain.value = 0.0; audio.music.connect(audio.master);
    const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; audio.noise = b;
  } catch (e) { audio.ctx = null; }
}
function sfx(type, vol = 1, pan = 0) {
  const c = audio.ctx; if (!c || audio.muted || vol < 0.02) return; const t = c.currentTime;
  const out = c.createGain(); const p = c.createStereoPanner ? c.createStereoPanner() : null; if (p) { p.pan.value = clamp(pan, -1, 1); out.connect(p); p.connect(audio.master); } else out.connect(audio.master);
  const noise = (dur, f, q = 0.7, type2 = 'lowpass') => { const s = c.createBufferSource(); s.buffer = audio.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4; const fl = c.createBiquadFilter(); fl.type = type2; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); fl.connect(out); s.start(t, Math.random()); s.stop(t + dur); return fl; };
  const osc = (type2, f0, f1, dur) => { const o = c.createOscillator(); o.type = type2; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); o.connect(out); o.start(t); o.stop(t + dur + 0.05); return o; };
  const env = (peak, dur, attack = 0.002) => { out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(peak, t + attack); out.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  switch (type) {
    case 'shot': env(0.5 * vol, 0.22); noise(0.25, 3200); osc('square', 140, 50, 0.08); break;
    case 'npcshot': env(0.35 * vol, 0.3); noise(0.3, 1700 + Math.random() * 600); break;
    case 'hit': env(0.12 * vol, 0.06); osc('square', 1800, 1500, 0.05); break;
    case 'kill': env(0.18 * vol, 0.25); osc('sine', 980, 1300, 0.2); break;
    case 'impact': env(0.08 * vol, 0.08); noise(0.08, 4000, 1, 'bandpass'); break;
    case 'reload': env(0.15 * vol, 0.12); noise(0.1, 2600, 4, 'bandpass'); break;
    case 'roar': env(0.9 * vol, 2.2, 0.15); osc('sawtooth', 120, 48, 2.1); osc('sawtooth', 97, 40, 2.1); noise(2.1, 500); break;
    case 'slam': env(1.0 * vol, 1.2, 0.005); osc('sine', 80, 25, 1.0); noise(1.1, 300); break;
    case 'beat': env(0.6 * vol, 0.25, 0.003); osc('sine', 90, 50, 0.22); break;
    case 'screech': env(0.4 * vol, 0.6, 0.02); osc('sawtooth', 1400, 600, 0.55); osc('square', 1900, 900, 0.5); break;
    case 'thunder': env(0.8 * vol, 3.2, 0.05); noise(3.2, 220); noise(0.4, 1500); break;
    case 'hurt': env(0.25 * vol, 0.2); noise(0.2, 600); break;
    case 'step': env(0.05 * vol, 0.07); noise(0.07, 700); break;
    case 'alert': env(0.25 * vol, 0.9, 0.02); osc('square', 660, 660, 0.25); setTimeout(() => sfx('alert2', vol), 300); break;
    case 'alert2': env(0.25 * vol, 0.4, 0.02); osc('square', 880, 880, 0.25); break;
  }
}
// procedural score: a chord pad and, for some moods, a pulse
const MOODS = { dread: { root: 41.2, chords: [[0, 1, 7], [0, 3, 6], [-2, 1, 5]], bpm: 0 }, epic: { root: 55, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], bpm: 72 },
  pulse: { root: 49, chords: [[0, 3, 7], [0, 5, 8], [-2, 3, 7]], bpm: 110 }, melancholy: { root: 51.9, chords: [[0, 3, 10], [-4, 0, 7], [-5, 2, 7]], bpm: 0 }, tension: { root: 46.2, chords: [[0, 6, 11], [0, 1, 7]], bpm: 90 } };
let musicTimer = null;
function startMusic(mood) {
  stopMusic(); const c = audio.ctx; if (!c) return; const M = MOODS[mood] || MOODS.tension; let k = 0, beat = 0;
  audio.music.gain.cancelScheduledValues(c.currentTime); audio.music.gain.setTargetAtTime(audio.muted ? 0 : 0.16, c.currentTime, 2);
  const chord = () => {
    const t = c.currentTime, notes = M.chords[k++ % M.chords.length];
    for (const n of notes) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = M.root * 2 * Math.pow(2, n / 12); o.detune.value = det;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 4); f.frequency.linearRampToValueAtTime(300, t + 8.5);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 2.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 9);
      o.connect(f); f.connect(g); g.connect(audio.music); o.start(t); o.stop(t + 9.2);
    }
    const sub = c.createOscillator(); sub.frequency.value = M.root * Math.pow(2, notes[0] / 12); const sg = c.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.12, t + 2); sg.gain.exponentialRampToValueAtTime(0.0001, t + 9); sub.connect(sg); sg.connect(audio.music); sub.start(t); sub.stop(t + 9.2);
  };
  chord(); const iv = setInterval(chord, 8000);
  let iv2 = null; if (M.bpm) iv2 = setInterval(() => { const t = c.currentTime; const o = c.createOscillator(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18); const g = c.createGain(); g.gain.setValueAtTime(beat++ % 4 === 0 ? 0.5 : 0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g); g.connect(audio.music); o.start(t); o.stop(t + 0.3); }, 60000 / M.bpm);
  musicTimer = [iv, iv2];
}
function stopMusic() { if (musicTimer) musicTimer.forEach(i => i && clearInterval(i)); musicTimer = null; if (audio.ctx) audio.music.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.5); }
function speak(text, persona) {
  if (!audio.voices || audio.muted || !('speechSynthesis' in window) || !text) return;
  try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.12; u.pitch = persona ? persona.pitch : 1; u.volume = 0.55; if (speechSynthesis.speaking && speechSynthesis.pending) return; speechSynthesis.speak(u); } catch (e) {}
}

/* =============================== agents: connection =============================== */
let sampleFn = null, aiMode = 'checking';
const HARD_OFF = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'session_expired'];
const aiReady = (async () => {
  try { if (window.claude && typeof window.claude.use === 'function') sampleFn = await window.claude.use('sample'); } catch (e) { sampleFn = null; }
  if (sampleFn) aiMode = 'claude';
  else { try { const r = await fetch('api/director', { method: 'GET' }); if (r.ok) { const j = await r.json(); if (j && j.ok) aiMode = 'server'; } } catch (e) {} if (aiMode !== 'server') aiMode = 'offline'; }
  renderAIStatus();
})();
function renderAIStatus() {
  const dot = $('#dirDot'), s = $('#dirStatus');
  dot.className = 'dot ' + (aiMode === 'claude' || aiMode === 'server' ? 'on' : aiMode === 'checking' ? 'warn' : '');
  s.textContent = aiMode === 'claude' ? 'Agents online: Claude directs every level and commands the NPCs'
    : aiMode === 'server' ? 'Agents online: Claude via the game server'
      : aiMode === 'checking' ? 'Connecting to the agents…' : 'Offline agents: levels and tactics are generated in your browser';
}
let genCtl = null, forceOffline = false;
async function askWorld(ctx, log) {
  await aiReady;
  if (aiMode === 'claude' && !forceOffline) {
    log('WORLD DIRECTOR · Claude', 'hi'); log('Reading campaign history and your last mission…'); log(`Writing level ${ctx.level} of ${ctx.total}…`);
    genCtl = new AbortController();
    try { const raw = await sampleFn.json(AG.directorPrompt(ctx), { modelTier: 'default', effort: 'low', cache: false, signal: genCtl.signal, onText: ({ text }) => log(text.slice(-520), 'raw') });
      return Object.assign(AG.normalizeWorld(raw, ctx), { source: 'Written and directed by Claude' }); }
    catch (e) { const c = e && e.code; if (HARD_OFF.includes(c)) { aiMode = 'offline'; renderAIStatus(); log('Claude is not available for this viewer. Switching to offline agents.', 'hi'); } else if (c === 'cancelled') log('Switched to the offline director.', 'hi'); else log(`Claude could not finish (${c || 'error'}). Using the offline director.`, 'hi'); }
    finally { genCtl = null; }
  } else if (aiMode === 'server' && !forceOffline) {
    log('WORLD DIRECTOR · Claude via game server', 'hi'); log(`Writing level ${ctx.level} of ${ctx.total}…`);
    genCtl = new AbortController();
    try { const r = await fetch('api/director', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ctx }), signal: genCtl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(); return Object.assign(AG.normalizeWorld(j.level, ctx), { source: 'Written and directed by Claude (server)' }); }
    catch (e) { log(`Server director failed (${e.message || 'error'}). Using the offline director.`, 'hi'); } finally { genCtl = null; }
  }
  log('Offline director: composing a level…'); await new Promise(r => setTimeout(r, 400));
  return Object.assign(AG.proceduralWorld(ctx), { source: 'Composed by the offline director' });
}
let aiGap = 0; // seconds until the next Claude subagent call may start (keeps calls spread out)
async function askSubagent(snap) {
  if (aiMode === 'claude' && sampleFn) {
    try { const raw = await sampleFn.json(AG.subagentPrompt(snap), { modelTier: 'quick', cache: false }); return { ...AG.normalizeSubOrders(raw, snap), src: 'claude' }; }
    catch (e) { const c = e && e.code; if (HARD_OFF.includes(c)) { aiMode = 'offline'; renderAIStatus(); } else if (c === 'rate_limited') aiGap = 45; }
  } else if (aiMode === 'server') {
    try { const r = await fetch('api/subagent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ snap }) }); if (r.ok) return { ...AG.normalizeSubOrders(await r.json(), snap), src: 'claude' }; if (r.status === 429) aiGap = 45; } catch (e) {}
  }
  return { ...AG.offlineSubagent(snap), src: 'offline' };
}

/* =============================== models =============================== */
const matCache = {};
function M(key, make) { return matCache[key] || (matCache[key] = make()); }
function soldierModel(teamColor, outfit) {
  const g = new THREE.Group();
  const cloth = M('cloth' + outfit, () => new THREE.MeshStandardMaterial({ color: outfit, roughness: 0.9 }));
  const vest = M('vest' + outfit, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(outfit).multiplyScalar(0.55), roughness: 0.75 }));
  const helmet = M('helmet' + outfit, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(outfit).multiplyScalar(0.7), roughness: 0.55, metalness: 0.2 }));
  const skin = M('skin', () => new THREE.MeshStandardMaterial({ color: '#8a6a55', roughness: 0.7 }));
  const gunm = M('gun', () => new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.4, metalness: 0.8 }));
  const glow = M('glow' + teamColor, () => new THREE.MeshStandardMaterial({ color: '#000', emissive: teamColor, emissiveIntensity: 3.5 }));
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
  const spine = new THREE.Group(); hips.add(spine);
  mesh(new THREE.BoxGeometry(0.44, 0.58, 0.26), vest, 0, 0.32, 0, spine);
  mesh(new THREE.BoxGeometry(0.36, 0.3, 0.2), cloth, 0, 0.05, 0, spine);
  mesh(new THREE.BoxGeometry(0.34, 0.42, 0.16), M('pack', () => new THREE.MeshStandardMaterial({ color: '#3a3a30', roughness: 0.9 })), 0, 0.34, -0.2, spine);
  const band = mesh(new THREE.BoxGeometry(0.12, 0.05, 0.13), glow, 0.27, 0.48, 0, spine);
  const head = new THREE.Group(); head.position.y = 0.72; spine.add(head);
  mesh(new THREE.SphereGeometry(0.12, 12, 10), skin, 0, 0, 0.01, head);
  const h = mesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet, 0, 0.02, 0, head);
  mesh(new THREE.BoxGeometry(0.2, 0.05, 0.03), glow, 0, 0.01, 0.12, head);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.12, 0, 0); hips.add(leg);
    mesh(new THREE.BoxGeometry(0.16, 0.46, 0.18), cloth, 0, -0.23, 0, leg);
    const knee = new THREE.Group(); knee.position.y = -0.46; leg.add(knee);
    mesh(new THREE.BoxGeometry(0.14, 0.44, 0.16), cloth, 0, -0.22, 0, knee);
    mesh(new THREE.BoxGeometry(0.15, 0.1, 0.26), gunm, 0, -0.46, 0.04, knee);
    legs.push({ leg, knee });
    const sh = new THREE.Group(); sh.position.set(s * 0.27, 0.56, 0); spine.add(sh);
    mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), cloth, 0, -0.15, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.3; sh.add(el); mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), cloth, 0, -0.14, 0, el);
    arms.push({ sh, el, s });
  }
  // rifle
  const gun = new THREE.Group(); gun.position.set(0.1, 0.36, 0.3); spine.add(gun);
  mesh(new THREE.BoxGeometry(0.07, 0.11, 0.56), gunm, 0, 0, 0, gun); mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6).rotateX(Math.PI / 2), gunm, 0, 0.02, 0.42, gun);
  mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), gunm, 0, -0.12, 0.08, gun); mesh(new THREE.BoxGeometry(0.06, 0.06, 0.16), gunm, 0, 0.09, 0.02, gun);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, 0.6); gun.add(muzzle);
  // pose arms holding the rifle
  arms[0].sh.rotation.set(-1.1, 0, 0.35); arms[0].el.rotation.set(-0.5, 0, 0); arms[1].sh.rotation.set(-1.3, 0, -0.5); arms[1].el.rotation.set(-0.3, 0, 0);
  return { root: g, hips, spine, head, legs, arms, gun, muzzle, band };
}
function furMaterial(base) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = Math.random(); x.strokeStyle = v < 0.5 ? 'rgba(0,0,0,.25)' : 'rgba(255,240,220,.08)'; x.lineWidth = 1; const px = Math.random() * 256, py = Math.random() * 256; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - 0.5) * 3, py + 4 + Math.random() * 6); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  return new THREE.MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 1, bumpMap: t, bumpScale: 0.02 });
}
function titanModel() {
  const g = new THREE.Group(); const fur = furMaterial('#2c2622'); const skin = new THREE.MeshStandardMaterial({ color: '#4a3c36', roughness: 0.8 });
  const eye = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb020', emissiveIntensity: 5 });
  const mesh = (geo, mat, x, y, z, parent, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const S = new THREE.SphereGeometry(1, 20, 16);
  const hips = new THREE.Group(); hips.position.y = 3; g.add(hips);
  const torso = new THREE.Group(); torso.rotation.x = 0.55; hips.add(torso);
  mesh(S, fur, 0, 1.6, 0.2, torso, 2.0, 2.4, 1.6); mesh(S, skin, 0, 1.9, 1.15, torso, 1.3, 1.5, 0.6); mesh(S, fur, 0, 0.2, 0, torso, 1.6, 1.3, 1.3);
  const head = new THREE.Group(); head.position.set(0, 3.9, 0.9); torso.add(head);
  mesh(S, fur, 0, 0, 0, head, 0.95, 0.95, 0.95); mesh(S, skin, 0, -0.25, 0.65, head, 0.62, 0.48, 0.5); mesh(new THREE.BoxGeometry(1.4, 0.28, 0.4), skin, 0, 0.3, 0.6, head);
  const jaw = mesh(S, skin, 0, -0.6, 0.5, head, 0.5, 0.25, 0.45);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.09, 8, 8), eye, s * 0.3, 0.12, 0.82, head);
  mesh(S, fur, 0, 0.55, -0.1, head, 0.6, 0.4, 0.6);
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 2.0, 2.9, 0.4); torso.add(sh);
    mesh(new THREE.CapsuleGeometry(0.62, 2.2, 6, 12), fur, 0, -1.4, 0, sh);
    const el = new THREE.Group(); el.position.y = -2.8; sh.add(el); mesh(new THREE.CapsuleGeometry(0.55, 2.0, 6, 12), fur, 0, -1.2, 0, el);
    mesh(S, skin, 0, -2.6, 0.1, el, 0.75, 0.6, 0.85);
    arms.push({ sh, el, s });
    const leg = new THREE.Group(); leg.position.set(s * 1.0, -0.2, 0); hips.add(leg); mesh(new THREE.CapsuleGeometry(0.62, 1.2, 6, 10), fur, 0, -0.9, 0, leg);
    const kn = new THREE.Group(); kn.position.y = -1.7; leg.add(kn); mesh(new THREE.CapsuleGeometry(0.5, 0.8, 6, 10), fur, 0, -0.6, 0.1, kn); mesh(S, skin, 0, -1.25, 0.35, kn, 0.55, 0.25, 0.85);
    legs.push({ leg, kn, s });
  }
  return { root: g, hips, torso, head, jaw, arms, legs };
}
function raptorModel(col) {
  const g = new THREE.Group(); const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05 }); const dark = new THREE.MeshStandardMaterial({ color: '#1b1612', roughness: 0.6 });
  const eye = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#c8ff3a', emissiveIntensity: 4 });
  const mesh = (geo, mat, x, y, z, p, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; p.add(m); return m; };
  const body = new THREE.Group(); body.position.y = 1.0; g.add(body);
  mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 10), skin, 0, 0, 0, body, Math.PI / 2 - 0.15);
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 0.6); body.add(neck); mesh(new THREE.CapsuleGeometry(0.13, 0.45, 4, 8), skin, 0, 0.2, 0.08, neck, 0.6);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.25); neck.add(head); mesh(new THREE.BoxGeometry(0.22, 0.2, 0.5), skin, 0, 0, 0.15, head); mesh(new THREE.BoxGeometry(0.18, 0.06, 0.4), dark, 0, -0.1, 0.18, head);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.035, 6, 6), eye, s * 0.1, 0.06, 0.15, head);
  const tail = new THREE.Group(); tail.position.set(0, 0.05, -0.6); body.add(tail); mesh(new THREE.ConeGeometry(0.22, 1.6, 8), skin, 0, 0, -0.75, tail, -Math.PI / 2);
  const legs = [];
  for (const s of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(s * 0.2, -0.1, 0.05); body.add(leg); mesh(new THREE.CapsuleGeometry(0.12, 0.45, 4, 8), skin, 0, -0.3, 0, leg); const kn = new THREE.Group(); kn.position.y = -0.55; leg.add(kn); mesh(new THREE.CapsuleGeometry(0.07, 0.4, 4, 6), skin, 0, -0.25, -0.05, kn); legs.push({ leg, kn, s }); }
  return { root: g, body, neck, head, tail, legs };
}
function flyerModel(col) {
  const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 3, 4, 8), m); body.rotation.x = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 6), m); head.rotation.x = Math.PI / 2; head.position.z = 2.6; g.add(head);
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.x = s * 0.5; g.add(w); const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(s * 7, 1.5); shape.lineTo(s * 6, -1.6); shape.lineTo(0, -1.2); const wm = new THREE.Mesh(new THREE.ShapeGeometry(shape), m); wm.rotation.x = Math.PI / 2; w.add(wm); wings.push(w); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root: g, wings };
}
function viewModel() {
  const g = new THREE.Group(); const metal = new THREE.MeshStandardMaterial({ color: '#5a5f66', roughness: 0.42, metalness: 0.55 }); const poly = new THREE.MeshStandardMaterial({ color: '#56594a', roughness: 0.75 });
  const vmLight = new THREE.PointLight('#fff2e0', 0.9, 1.6, 2); vmLight.position.set(0.15, 0.25, 0.1); g.add(vmLight);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.07, 0.1, 0.42), metal, 0, 0, -0.1); add(new THREE.BoxGeometry(0.075, 0.08, 0.28), poly, 0, -0.005, -0.42);
  add(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8).rotateX(Math.PI / 2), metal, 0, 0.01, -0.68); add(new THREE.BoxGeometry(0.045, 0.16, 0.07), metal, 0, -0.11, -0.12);
  add(new THREE.BoxGeometry(0.06, 0.18, 0.08), poly, 0, -0.1, 0.07).rotation.x = -0.3; add(new THREE.BoxGeometry(0.06, 0.09, 0.22), poly, 0, -0.02, 0.24);
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 12).rotateX(Math.PI / 2), metal, 0, 0.085, -0.12);
  add(new THREE.BoxGeometry(0.008, 0.02, 0.008), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff3a2a', emissiveIntensity: 2 }), 0, 0.118, -0.16);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: flashTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ffd28a' }));
  flash.position.set(0, 0.01, -0.86); flash.visible = false; g.add(flash);
  g.traverse(o => { if (o.isMesh) { o.renderOrder = 10; o.frustumCulled = false; } }); g.scale.setScalar(0.85);
  return { root: g, flash };
}
function flashTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,.8)'); gr.addColorStop(1, 'rgba(255,120,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 6; i++) { x.save(); x.translate(32, 32); x.rotate(i * Math.PI / 3); x.fillStyle = 'rgba(255,230,150,.6)'; x.fillRect(0, -1.5, 32, 3); x.restore(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function tagSprite(text, color, sub, subColor) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 96; const x = c.getContext('2d'); x.textAlign = 'center';
  x.font = '600 30px "IBM Plex Mono", monospace'; const w = Math.max(x.measureText(text).width, sub ? 150 : 0) + 24; x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(160 - w / 2, 6, w, sub ? 84 : 46);
  x.fillStyle = color; x.fillText(text, 160, 40);
  if (sub) { x.font = '600 20px "IBM Plex Mono", monospace'; x.fillStyle = subColor || '#fff'; x.fillText(sub, 160, 74); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.9, 0.57, 1); s.renderOrder = 20; return s;
}

/* =============================== game state =============================== */
let campaign = null, spec = null, world = null, G = null;
const keys = new Set(); const input = { fire: false, ads: false, dx: 0, dy: 0, touchMove: null, touchLook: null };

function teamColorFor(team) { return team === 'A' ? spec.factions.ally.color : spec.factions.hostile.color; }
function hostile(a, b) { return a !== b && a.team !== b.team; }

/* ---------- collision & raycasts ---------- */
const RAD = 0.42;
function blockedXZ(x, z, y, r) {
  for (const c of world.colliders) { if (y + 0.45 > c.top || y + 1.7 < c.bottom) continue; if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) { const nx = clamp(x, c.minX, c.maxX), nz = clamp(z, c.minZ, c.maxZ); if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return c; } }
  return null;
}
function deepWater(x, z) { const h = world.heightAt(x, z); return (world.terrainType === 'island' && h < -0.7) || (world.terrainType === 'flatwater' && h < -1); }
function moveEntity(p, dx, dz, r = RAD) {
  const tryAxis = (ax, d) => {
    if (!d) return; const old = p[ax]; p[ax] += d;
    const c = blockedXZ(p.x, p.z, p.y, r);
    if (c) { // slide out along this axis
      if (ax === 'x') p.x = d > 0 ? Math.min(p.x, c.minX - r - 0.001) : Math.max(p.x, c.maxX + r + 0.001); else p.z = d > 0 ? Math.min(p.z, c.minZ - r - 0.001) : Math.max(p.z, c.maxZ + r + 0.001);
      if (blockedXZ(p.x, p.z, p.y, r)) p[ax] = old;
    }
    if (deepWater(p.x, p.z)) p[ax] = old;
  };
  tryAxis('x', dx); tryAxis('z', dz);
  const B = world.B - 0.5; p.x = clamp(p.x, -B, B); p.z = clamp(p.z, -B, B);
}
const _ray = new THREE.Ray();
function rayAABB(o, d, c, maxD) {
  let tmin = 0, tmax = maxD; const mins = [c.minX, c.bottom - 0.2, c.minZ], maxs = [c.maxX, c.top, c.maxZ], os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) { if (Math.abs(ds[i]) < 1e-8) { if (os[i] < mins[i] || os[i] > maxs[i]) return null; } else { let t1 = (mins[i] - os[i]) / ds[i], t2 = (maxs[i] - os[i]) / ds[i]; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; } }
  return tmin;
}
function raySphere(o, d, c, r) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z; const b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc; if (h < 0) return null; const t = -b - Math.sqrt(h); return t >= 0 ? t : (cc < 0 ? 0 : null); }
function rayWorld(o, d, maxD) {
  let best = maxD;
  for (const c of world.colliders) { if (c.top < o.y - 30) continue; const t = rayAABB(o, d, c, best); if (t !== null && t < best) best = t; }
  if (world.terrainType !== 'pit' && world.terrainType !== 'flat') { for (let t = 0.5; t < best; t += 1.0) { const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t; if (y < world.heightAt(x, z)) { best = t; break; } } }
  else if (d.y < 0) { const t = (0 - o.y) / d.y; const x = o.x + d.x * t, z = o.z + d.z * t; if (t < best && !(world.terrainType === 'pit' && Math.abs(x) < 9 && Math.abs(z) < 9)) best = t; }
  return best;
}
function hitboxes(e) {
  if (e.kind === 'soldier') { const y = e.pos.y, cr = e.crouch ? 0.7 : 1; return [{ c: V(e.pos.x, y + 1.68 * cr, e.pos.z), r: 0.17, part: 'head' }, { c: V(e.pos.x, y + 1.15 * cr, e.pos.z), r: 0.36, part: 'body' }, { c: V(e.pos.x, y + 0.55, e.pos.z), r: 0.3, part: 'body' }]; }
  if (e.kind === 'titan') { const s = e.size; const out = [{ c: V(e.pos.x, e.pos.y + 5 * s, e.pos.z), r: 2.4 * s, part: 'body' }, { c: e.headWorld.clone(), r: 1.0 * s, part: 'head' }, { c: V(e.pos.x, e.pos.y + 2 * s, e.pos.z), r: 1.8 * s, part: 'body' }]; return out; }
  if (e.kind === 'raptor') return [{ c: V(e.pos.x, e.pos.y + 1.0, e.pos.z), r: 0.6, part: 'body' }, { c: e.headWorld.clone(), r: 0.25, part: 'head' }];
  if (e.kind === 'flyer') return [{ c: e.pos.clone(), r: 2.2, part: 'body' }];
  return [];
}
function castShot(o, d, maxD, shooter) {
  const wd = rayWorld(o, d, maxD); let best = wd, hit = null, part = null;
  for (const e of G.entities) { if (!e.alive || e === shooter) continue; if (e.pos.distanceToSquared(o) > (best + 6) ** 2) continue;
    for (const hb of hitboxes(e)) { const t = raySphere(o, d, hb.c, hb.r); if (t !== null && t < best) { best = t; hit = e; part = hb.part; } } }
  return { dist: best, ent: hit, part, point: o.clone().addScaledVector(d, best), world: !hit && best < maxD };
}
function canSee(from, to, maxD) { const d = to.clone().sub(from); const L = d.length(); if (L > maxD) return false; d.divideScalar(L); return rayWorld(from, d, L) >= L - 0.4; }

/* ---------- A* on the nav grid ---------- */
function findPath(sx, sz, tx, tz) {
  const nav = world.nav, NG = nav.NG; let [si, sj] = nav.cellOf(sx, sz), [ti, tj] = nav.cellOf(tx, tz);
  const nearestFree = (i, j) => { if (nav.free(i, j)) return [i, j]; for (let r = 1; r < 6; r++) for (let a = -r; a <= r; a++) for (const [x, y] of [[i + a, j - r], [i + a, j + r], [i - r, j + a], [i + r, j + a]]) if (nav.free(x, y)) return [x, y]; return null; };
  const s = nearestFree(si, sj), t = nearestFree(ti, tj); if (!s || !t) return null; [si, sj] = s; [ti, tj] = t;
  const start = sj * NG + si, goal = tj * NG + ti; if (start === goal) return [nav.center(ti, tj)];
  const g = new Float32Array(NG * NG).fill(1e9), came = new Int32Array(NG * NG).fill(-1), closed = new Uint8Array(NG * NG);
  const heap = []; const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = n => { const x = n % NG, y = (n / NG) | 0; const dx = Math.abs(x - ti), dy = Math.abs(y - tj); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  g[start] = 0; push(start, h(start)); let it = 0;
  while (heap.length && it++ < 6000) {
    const [, n] = pop(); if (n === goal) break; if (closed[n]) continue; closed[n] = 1; const x = n % NG, y = (n / NG) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!nav.free(nx, ny)) continue; if (dx && dy && (!nav.free(x + dx, y) || !nav.free(x, y + dy))) continue;
      const m = ny * NG + nx, cost = g[n] + (dx && dy ? 1.414 : 1); if (cost < g[m]) { g[m] = cost; came[m] = n; push(m, cost + h(m)); }
    }
  }
  if (came[goal] < 0) return null;
  const cells = []; for (let n = goal; n !== start && n >= 0; n = came[n]) cells.push(n); cells.reverse();
  // string-pull: drop waypoints that are directly reachable
  const pts = cells.map(n => nav.center(n % NG, (n / NG) | 0)); const out = []; let from = { x: sx, z: sz }, i = 0;
  while (i < pts.length) { let j = pts.length - 1; while (j > i && !gridLine(from, pts[j])) j--; out.push(pts[j]); from = pts[j]; i = j + 1; }
  return out;
}
function gridLine(a, b) { const nav = world.nav; const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / (nav.CELL * 0.5)); for (let k = 1; k <= n; k++) { const t = k / n; const [i, j] = nav.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); if (!nav.free(i, j)) return false; } return true; }
function randomFreePoint(nearX = 0, nearZ = 0, radius = 1e9, minFrom = null, minD = 0) {
  const nav = world.nav;
  for (let k = 0; k < 300; k++) {
    const i = Math.floor(Math.random() * nav.NG), j = Math.floor(Math.random() * nav.NG); if (!nav.free(i, j)) continue; const p = nav.center(i, j);
    if (Math.hypot(p.x - nearX, p.z - nearZ) > radius) continue; if (minFrom && minFrom.some(q => Math.hypot(q.x - p.x, q.z - p.z) < minD)) continue; if (world.hazardAt(p.x, p.z, 0)) continue; return p;
  }
  return null;
}

/* =============================== entities =============================== */
let uid = 0;
function makeSoldier(o) {
  const e = Object.assign({ kind: 'soldier', id: o.id || 'e' + (uid++), alive: true, pos: V(), vel: V(), yaw: 0, pitch: 0, hp: 100, maxHp: 100, mag: 30, magSize: 30, reload: 0, fireCd: 0,
    kills: 0, crouch: false, lastShotT: -99, lastHurtT: -99, hurtFrom: null, onGround: true, vy: 0, moving: 0, walkPh: Math.random() * 6 }, o);
  if (!e.isPlayer) {
    const tc = e.team === 'A' ? spec.factions.ally.color : (campaign.mode === 'ffa' ? new THREE.Color().setHSL((e.idx * 0.137) % 1, 0.85, 0.55).getStyle() : spec.factions.hostile.color);
    e.color = tc; e.model = soldierModel(tc, e.team === 'A' ? '#4a5a44' : (campaign.mode === 'ffa' ? ['#4a4a42', '#3d4652', '#5a4a3a', '#3a3a3a'][e.idx % 4] : '#3b3f45'));
    scene.add(e.model.root); const ST = AG.STRATEGIES[e.persona.strategy] || AG.STRATEGIES.guerrilla; e.strat = ST; e.tag = tagSprite(e.name.toUpperCase(), e.team === 'A' ? '#7cc8ff' : '#ff8a7a', ST.short, ST.color); e.tag.position.y = 2.25; e.model.root.add(e.tag);
    e.brain = { memory: new Map(), morale: 1, order: null, action: 'patrol', target: null, goal: null, path: null, pathI: 0, repath: 0, decideT: Math.random() * 0.5, perceiveT: Math.random() * 0.2,
      reactT: 0, burst: 0, burstPause: 0, strafe: 1, strafeT: 0, peekT: 0, barkT: 3 + Math.random() * 5, vis: null, coverAt: null, stuckT: 0, lastP: V() };
    e.voice = { pitch: 0.75 + Math.random() * 0.5 };
  }
  return e;
}

function spawnAll() {
  const D = spec.difficulty, ents = [];
  const placed = [];
  const corner = randomFreePoint(0, 0, 1e9) || { x: 0, z: 0 };
  let ps = null; for (let k = 0; k < 40 && !ps; k++) { const p = randomFreePoint(); if (p && Math.max(Math.abs(p.x), Math.abs(p.z)) > world.B * 0.55) ps = p; } ps = ps || corner;
  const player = makeSoldier({ id: 'player', name: campaign.callsign, team: 'A', isPlayer: true, hp: D.playerHealth, maxHp: D.playerHealth, magSize: 30, mag: 30 });
  player.pos.set(ps.x, world.heightAt(ps.x, ps.z), ps.z); player.yaw = Math.atan2(-ps.x, -ps.z); ents.push(player); placed.push(ps);
  const allies = campaign.mode === 'tdm' ? Math.floor(campaign.npcs / 2) : 0;
  spec.operators.forEach((op, i) => {
    const ally = i < allies;
    let p = ally ? randomFreePoint(ps.x, ps.z, 14, placed, 2.5) : randomFreePoint(0, 0, 1e9, campaign.mode === 'ffa' ? placed : [ps], campaign.mode === 'ffa' ? 26 : world.B * 0.9);
    if (!p) p = randomFreePoint(0, 0, 1e9, [ps], 20) || { x: 0, z: 0 };
    placed.push(p);
    const hp = ally ? 130 : D.enemyHealth;
    const e = makeSoldier({ id: 'n' + i, idx: i, name: op.name, team: ally ? 'A' : (campaign.mode === 'ffa' ? 'n' + i : 'H'), ally, persona: op, hp, maxHp: hp,
      acc: ally ? 0.6 : D.enemyAccuracy, react: ally ? 0.45 : D.enemyReactionMs / 1000, aggr: clamp(op.aggression * 0.6 + (ally ? 0.5 : D.aggression) * 0.4, 0, 1) });
    e.pos.set(p.x, world.heightAt(p.x, p.z), p.z); e.yaw = Math.random() * 6; ents.push(e);
  });
  return { player, ents };
}

/* ---------- creatures ---------- */
function spawnTitan(fromEdge = true) {
  const s = spec.creature.size; const m = titanModel(); m.root.scale.setScalar(s); scene.add(m.root);
  let p = null; if (fromEdge) { const a = Math.random() * Math.PI * 2; p = { x: Math.cos(a) * world.B * 0.85, z: Math.sin(a) * world.B * 0.85 }; } else p = randomFreePoint(0, 0, world.B * 0.5) || { x: 0, z: 0 };
  const t = { kind: 'titan', id: 'creature', name: spec.creature.name || 'the titan', alive: true, pos: V(p.x, world.heightAt(p.x, p.z), p.z), yaw: 0, size: s, hp: 2600 * s, maxHp: 2600 * s, model: m,
    state: 'roar', stateT: 2.2, target: null, attackCd: 0, walkPh: 0, headWorld: V(), noise: null, roarCd: 12, team: 'beast' };
  G.entities.push(t); G.titan = t; sfx('roar', 1); G.shake = Math.max(G.shake, 0.8);
  return t;
}
function spawnRaptors(n) {
  for (let k = 0; k < n; k++) {
    const p = randomFreePoint(0, 0, 1e9, [G.player.pos], 35) || { x: 0, z: 0 };
    const m = raptorModel(new THREE.Color(spec.palette.secondary).lerp(new THREE.Color('#5a6a3a'), 0.4).getStyle()); scene.add(m.root);
    G.entities.push({ kind: 'raptor', id: 'r' + (uid++), name: 'raptor', alive: true, pos: V(p.x, world.heightAt(p.x, p.z), p.z), yaw: 0, hp: 70, maxHp: 70, model: m, target: null, biteCd: 0, walkPh: 0, headWorld: V(), circle: Math.random() * 6, team: 'beast', path: null, repath: 0 });
  }
}
function spawnFlyers(n) {
  for (let k = 0; k < n; k++) {
    const m = flyerModel(new THREE.Color(spec.palette.secondary).multiplyScalar(0.5).getStyle()); m.root.scale.setScalar(1 + Math.random() * 0.6); scene.add(m.root);
    G.entities.push({ kind: 'flyer', id: 'f' + (uid++), name: 'flyer', alive: true, pos: V(0, 50, 0), hp: 160, maxHp: 160, model: m, ang: Math.random() * 6, rad: 30 + Math.random() * 50, h: 35 + Math.random() * 30, speed: 0.15 + Math.random() * 0.1, cx: (Math.random() - 0.5) * 60, cz: (Math.random() - 0.5) * 60, fall: 0, team: 'beast' });
  }
}

/* =============================== FX =============================== */
const fx = { tracers: [], parts: null, partData: [], light: null };
function initFX() {
  const n = 600; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  fx.parts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); fx.parts.frustumCulled = false; scene.add(fx.parts);
  fx.partData = Array.from({ length: n }, () => ({ life: 0, p: V(), v: V(), c: new THREE.Color() })); fx.pi = 0;
  fx.light = new THREE.PointLight('#ffcf80', 0, 14, 2); scene.add(fx.light);
  fx.tracerMat = new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  fx.tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4, 1, true); fx.tracerGeo.rotateX(Math.PI / 2); fx.tracerGeo.translate(0, 0, 0.5);
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(fx.tracerGeo, fx.tracerMat.clone()); m.visible = false; m.userData.life = 0; scene.add(m); fx.tracers.push(m); }
}
function burst(p, color, n, speed, life = 0.5, up = 0) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) { const d = fx.partData[fx.pi = (fx.pi + 1) % fx.partData.length]; d.life = life * (0.6 + Math.random() * 0.6); d.max = d.life; d.p.copy(p); d.v.set(gauss(), Math.abs(gauss()) * 0.6 + up, gauss()).multiplyScalar(speed); d.c.copy(c); }
}
function tracer(from, to) { const t = fx.tracers.find(m => !m.visible); if (!t) return; t.position.copy(from); t.lookAt(to); t.scale.set(1, 1, from.distanceTo(to)); t.visible = true; t.userData.life = 0.07; t.material.opacity = 0.9; }
function muzzleLight(p) { fx.light.position.copy(p); fx.light.intensity = 18; }
function updateFX(dt) {
  const pos = fx.parts.geometry.attributes.position, col = fx.parts.geometry.attributes.color;
  fx.partData.forEach((d, i) => { if (d.life > 0) { d.life -= dt; d.v.y -= 6 * dt; d.p.addScaledVector(d.v, dt); const a = Math.max(0, d.life / d.max); pos.setXYZ(i, d.p.x, d.p.y, d.p.z); col.setXYZ(i, d.c.r * a, d.c.g * a, d.c.b * a); } else { pos.setXYZ(i, 0, -999, 0); } });
  pos.needsUpdate = true; col.needsUpdate = true;
  fx.tracers.forEach(t => { if (t.visible) { t.userData.life -= dt; t.material.opacity = Math.max(0, t.userData.life / 0.07) * 0.9; if (t.userData.life <= 0) t.visible = false; } });
  fx.light.intensity = Math.max(0, fx.light.intensity - dt * 300);
}

/* =============================== combat =============================== */
function shoot(e, dir, spread) {
  const eye = e.isPlayer ? camera.position.clone() : V(e.pos.x, e.pos.y + 1.45, e.pos.z);
  const d = dir.clone(); if (spread) { d.x += gauss() * spread; d.y += gauss() * spread * 0.6; d.z += gauss() * spread; d.normalize(); }
  const res = castShot(eye, d, 220, e);
  const muzzle = e.isPlayer ? G.vm.flash.getWorldPosition(V()) : e.model.muzzle.getWorldPosition(V());
  tracer(muzzle, res.point); muzzleLight(muzzle);
  e.mag--; e.lastShotT = G.t; if (e.mag <= 0) startReload(e);
  G.noise.push({ x: e.pos.x, z: e.pos.z, t: G.t, src: e });
  if (e.isPlayer) { G.stats.shots++; sfx('shot', 1); }
  else { const d2 = e.pos.distanceTo(G.player.pos); sfx('npcshot', clamp(1 - d2 / 140, 0, 0.8), panOf(e.pos)); }
  if (res.ent) damage(res.ent, (e.isPlayer ? 28 : e.kind === 'soldier' ? (e.ally ? 12 : 9) : 10) * (res.part === 'head' ? 2.3 : 1), e, res.point, res.part);
  else if (res.world) { burst(res.point, '#ffcc88', 5, 3, 0.25, 1); if (e.isPlayer) sfx('impact', 0.5); }
  // near-miss awareness for the target
  if (!e.isPlayer && res.ent !== G.player) { const pp = G.player.pos; const toP = V(pp.x - eye.x, pp.y + 1.5 - eye.y, pp.z - eye.z); const along = toP.dot(d); if (along > 0 && along < res.dist) { const miss = toP.clone().addScaledVector(d, -along).length(); if (miss < 1.5) { G.suppress = 1; sfx('impact', 0.4, panOf(e.pos)); } } }
}
function startReload(e) { if (e.reload > 0 || e.mag === e.magSize) return; e.reload = e.isPlayer ? 1.7 : 2.1; if (e.isPlayer) sfx('reload', 1); }
function panOf(p) { const d = V(p.x - camera.position.x, 0, p.z - camera.position.z).normalize(); const right = V(Math.cos(G.player.yaw), 0, -Math.sin(G.player.yaw)); return d.dot(right) * -1; }

function damage(v, amount, src, point, part) {
  if (!v.alive) return;
  v.hp -= amount; v.lastHurtT = G.t; v.hurtFrom = src;
  const blood = v.kind === 'soldier' ? '#a01810' : v.kind === 'titan' ? '#6a1a10' : '#7a2010';
  if (point) burst(point, blood, v.kind === 'titan' ? 10 : 6, 2.5, 0.5);
  if (src && src.brain && src.strat && src.strat.relocateOnHit) { src.brain.relocateUntil = G.t + src.strat.relocateOnHit; src.brain.coverAt = null; }
  if (src && src.isPlayer) { G.stats.hits++; G.hitT = 0.12; sfx('hit', 1); if (part === 'head') G.headT = 0.2; }
  if (v.isPlayer) { G.stats.dmgTaken += amount; G.hurtT = 0.4; G.shake = Math.max(G.shake, 0.25); if (src) { G.dmgDir = Math.atan2(src.pos.x - v.pos.x, src.pos.z - v.pos.z); G.dmgDirT = 1.2; } sfx('hurt', 0.8); }
  if (v.brain && src && src !== v) { v.brain.memory.set(src.id, { x: src.pos.x, z: src.pos.z, t: G.t, ent: src }); v.brain.morale = Math.max(0, v.brain.morale - amount / 300); }
  if (v.kind === 'titan' && src) { v.noise = src; if (v.state === 'wander') v.state = 'charge'; }
  if (v.kind === 'raptor' && src) v.target = src;
  if (v.hp <= 0) kill(v, src);
}
function kill(v, src) {
  v.alive = false; v.deadT = 0;
  if (src) src.kills = (src.kills || 0) + 1;
  feed(src, v);
  if (src && src.isPlayer) { G.hitKill = 0.3; sfx('kill', 1); if (v.kind === 'titan') { G.stats.titan = true; banner(`${v.name.toUpperCase()} HAS FALLEN`, '+2000 bonus', 3000); } }
  if (v.kind === 'titan') { sfx('roar', 0.8); G.shake = 1; }
  if (v.kind === 'soldier' && !v.isPlayer) {
    v.tag.visible = false;
    for (const o of G.entities) if (o.brain && o.alive && o.team === v.team && o.pos.distanceTo(v.pos) < 50) { o.brain.morale = Math.max(0, o.brain.morale - 0.25); if (Math.random() < 0.5) comms(o, ['Man down!', `${v.name} is down!`, 'We lost one!'][Math.floor(Math.random() * 3)]); }
  }
  if (v.isPlayer) endLevel(false, src && src.kind !== 'soldier' ? `Killed by ${src.kind === 'titan' ? src.name : 'a predator'}` : src ? `Killed by ${src.name}` : 'You died');
  else checkWin();
}
function checkWin() { if (G.ended) return; const left = G.entities.filter(e => e.kind === 'soldier' && !e.isPlayer && e.alive && e.team !== 'A').length; if (left === 0) endLevel(true); }

/* =============================== NPC brain =============================== */
const ROLE_RANGE = { sniper: 38, assault: 18, support: 22, flanker: 13, berserker: 5 };
function enemiesOf(e) { return G.entities.filter(o => o.alive && o !== e && (o.kind === 'soldier' ? hostile(e, o) : o.kind !== 'flyer')); }
function updateNPC(e, dt) {
  const b = e.brain, P = e.persona, S = e.strat, now = G.t, sightR = (world.night ? 45 : 85) * (G.blackout > 0 ? 0.5 : 1) * (spec.weather === 'fog' || spec.weather === 'sandstorm' ? 0.6 : 1);
  const eye = V(e.pos.x, e.pos.y + (e.crouch ? 1.05 : 1.55), e.pos.z);
  // --- perceive ---
  b.perceiveT -= dt;
  if (b.perceiveT <= 0) {
    b.perceiveT = 0.22; let best = null, bd = 1e9;
    const fwd = V(Math.sin(e.yaw), 0, Math.cos(e.yaw));
    for (const o of enemiesOf(e)) {
      const to = V(o.pos.x - e.pos.x, 0, o.pos.z - e.pos.z); const d = to.length(); if (d > sightR * (o.kind === 'titan' ? 2 : 1)) continue;
      const inFov = d < 7 || to.normalize().dot(fwd) > -0.2 || now - e.lastHurtT < 2;
      if (!inFov) continue;
      const tgt = V(o.pos.x, o.pos.y + (o.kind === 'titan' ? 5 * o.size : o.crouch ? 1.0 : 1.3), o.pos.z);
      if (!canSee(eye, tgt, sightR * 2)) continue;
      b.memory.set(o.id, { x: o.pos.x, z: o.pos.z, t: now, ent: o, seen: true });
      let score = d; if (b.order && b.order.target === o.id) score *= 0.5; if (o.isPlayer && campaign.mode === 'ffa') score *= 0.9; if (o.kind === 'titan') score *= 1.8;
      if (score < bd) { bd = score; best = o; }
      // callouts to teammates
      if (campaign.mode === 'tdm' && Math.random() < P.teamwork * 0.3) for (const m of G.entities) if (m.brain && m.alive && m.team === e.team && m !== e && m.pos.distanceTo(e.pos) < 70 && !m.brain.memory.has(o.id)) m.brain.memory.set(o.id, { x: o.pos.x, z: o.pos.z, t: now, ent: o, seen: false });
    }
    for (const n of G.noise) if (now - n.t < 0.3 && n.src !== e && n.src.alive && (n.src.kind !== 'soldier' || hostile(e, n.src)) && Math.hypot(n.x - e.pos.x, n.z - e.pos.z) < 55 && !b.memory.has(n.src.id)) b.memory.set(n.src.id, { x: n.x + rnd(-6, 6), z: n.z + rnd(-6, 6), t: now, ent: n.src, seen: false });
    for (const [k, m] of b.memory) if (now - m.t > 25 || !m.ent.alive) b.memory.delete(k);
    if (best !== b.vis) { if (best) { b.reactT = e.react * (0.7 + Math.random() * 0.6) * (b.vis ? 0.5 : 1); if (!b.vis && Math.random() < 0.35) bark(e, best.kind === 'titan' ? 'evade' : 'engage'); } b.vis = best; }
  }
  if (b.vis && !b.vis.alive) b.vis = null;
  // --- decide (utility AI, biased by the commander's order) ---
  b.decideT -= dt;
  const hpF = e.hp / e.maxHp, V_ = b.vis;
  if (b.decideT <= 0) {
    b.decideT = 0.5 + Math.random() * 0.3;
    let known = null, kd = 1e9; for (const m of b.memory.values()) { const d = Math.hypot(m.x - e.pos.x, m.z - e.pos.z); if (m.ent.kind !== 'titan' && d < kd) { kd = d; known = m; } }
    const titanNear = G.titan && G.titan.alive && G.titan.pos.distanceTo(e.pos) < 24 * G.titan.size;
    const mates = G.entities.filter(o => o.kind === 'soldier' && o.alive && o !== e && o.team === e.team);
    const mateD = mates.length ? Math.min(...mates.map(m => m.pos.distanceTo(e.pos))) : 0;
    const role = P.role, aggr = e.aggr, caut = P.caution;
    const U = { patrol: 0.15, engage: 0, cover: 0, flank: 0, hunt: 0, retreat: 0, regroup: 0, evade: 0, ambush: 0, hold: 0.1, lure: 0 };
    if (V_ && V_.kind !== 'titan') { const d = V_.pos.distanceTo(e.pos); U.engage = 0.55 + aggr * 0.4 + hpF * 0.15 + (role === 'berserker' ? 0.35 : 0) - (role === 'sniper' && d < 15 ? 0.3 : 0);
      U.cover = caut * 0.45 + (1 - hpF) * 0.5 + (now - e.lastHurtT < 2 ? 0.35 : 0) + (e.reload > 0 ? 0.4 : 0) + (role === 'sniper' ? 0.25 : 0) - (role === 'berserker' ? 0.4 : 0);
      U.flank = role === 'flanker' ? 0.75 : 0.25 * aggr; }
    if (known && !V_) { U.hunt = 0.4 + aggr * 0.35; U.flank = (role === 'flanker' ? 0.6 : 0.3) * aggr; U.ambush = role === 'sniper' ? 0.6 : caut * 0.4; }
    if (hpF < 0.4) U.retreat = (1 - hpF) * 0.7 + caut * 0.3 - aggr * 0.25 + (1 - b.morale) * 0.4;
    if (mates.length && mateD > 22) U.regroup = P.teamwork * 0.55 + (e.ally ? 0.25 : 0);
    if (e.ally && G.player.alive && G.player.pos.distanceTo(e.pos) > 28) U.regroup += 0.35;
    if (titanNear) U.evade = 1.3 - aggr * 0.3;
    // --- doctrine of this NPC's strategy subagent ---
    if (V_ && V_.kind !== 'titan') { U.engage += S.engage; U.cover += S.cover; U.flank += S.flank; }
    if (known && !V_) { U.hunt += S.hunt; U.ambush += S.ambush; U.flank += S.flank * 0.6; }
    if (S.engageWindow) { if (b.action === 'engage' && V_) { b.engageStart = b.engageStart || now; if (now - b.engageStart > S.engageWindow) { b.relocateUntil = now + S.relocate; b.engageStart = 0; b.coverAt = null; } } else b.engageStart = 0; }
    if (b.relocateUntil > now) { U.cover += 0.9; U.engage -= 0.7; }
    if (S.suppressor && V_) { const sq = G.squadOf[e.id]; const alive = sq ? sq.members.filter(m => m.alive) : [e]; b.isSuppressor = alive[Math.floor(now / 10) % alive.length] === e;
      if (b.isSuppressor) { U.engage += 0.45; U.flank -= 0.3; } else { U.flank += 0.45; U.engage -= 0.25; } }
    if (S.lure && creatureAlive()) U.lure = S.lure + (titanNear ? -0.6 : 0) + (known ? 0.1 : 0);
    if (S.short === 'BLITZ' && hpF < 0.25) U.cover += 0.6;
    if (b.order && b.order.until > now && U[b.order.action] !== undefined) U[b.order.action] += 0.5;
    let best = 'patrol', bv = -1; for (const k in U) if (U[k] > bv) { bv = U[k]; best = k; }
    if (best !== b.action) { b.action = best; b.goal = null; b.path = null; b.coverAt = null; if (Math.random() < 0.18) bark(e, best); }
    b.known = known;
    // goals
    const ordTarget = b.order && b.order.until > now ? targetEnt(b.order.target) : null;
    const T = V_ || (ordTarget && ordTarget.alive ? ordTarget : null) || (known ? known.ent : null);
    const tp = T ? (b.memory.get(T.id) || { x: T.pos.x, z: T.pos.z }) : null;
    let goal = null;
    const ord = b.order && b.order.until > now ? b.order : null;
    const ordMove = ord && ord.moveTo && ord.action === best && !(best === 'engage' && V_) && Math.hypot(ord.moveTo.x - e.pos.x, ord.moveTo.z - e.pos.z) > 2.5 ? ord.moveTo : null;
    if (ordMove) goal = { x: ordMove.x, z: ordMove.z };
    else if (best === 'lure') { const c = G.titan && G.titan.alive ? G.titan : G.entities.find(o => o.kind === 'raptor' && o.alive); const foe = T && T.kind === 'soldier' ? T : null;
      if (c && foe) { const kx = foe.pos.x - c.pos.x, kz = foe.pos.z - c.pos.z, kl = Math.hypot(kx, kz) || 1; goal = { x: foe.pos.x + kx / kl * 14, z: foe.pos.z + kz / kl * 14 }; } else if (c) { const kx = e.pos.x - c.pos.x, kz = e.pos.z - c.pos.z, kl = Math.hypot(kx, kz) || 1; goal = { x: e.pos.x + kx / kl * 15, z: e.pos.z + kz / kl * 15 }; } }
    else if (best === 'hold') goal = null;
    else if (best === 'engage' && T) { const d = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); const want = S.range * 0.65 + (ROLE_RANGE[role] || 18) * 0.35; if (d > want + 4 || !V_) goal = { x: tp.x, z: tp.z }; }
    else if (best === 'cover' && T) { if (!b.coverAt || b.coverFor !== T) { b.coverAt = findCover(e, T.pos); b.coverFor = T; } goal = b.coverAt; }
    else if (best === 'flank' && tp) { const ang = Math.atan2(e.pos.x - tp.x, e.pos.z - tp.z) + (b.flankSide || (b.flankSide = squadSide(e))) * 1.4; goal = { x: tp.x + Math.sin(ang) * 14, z: tp.z + Math.cos(ang) * 14 }; }
    else if (best === 'hunt' && tp) goal = { x: tp.x, z: tp.z };
    else if (best === 'retreat') { const thr = T ? T.pos : e.pos; const away = V(e.pos.x - thr.x, 0, e.pos.z - thr.z).normalize(); const kit = G.pickups.filter(k => k.alive).sort((a, c) => a.pos.distanceTo(e.pos) - c.pos.distanceTo(e.pos))[0];
      goal = kit && kit.pos.distanceTo(e.pos) < 40 ? { x: kit.pos.x, z: kit.pos.z } : { x: e.pos.x + away.x * 22, z: e.pos.z + away.z * 22 }; }
    else if (best === 'regroup') { const lead = e.ally && G.player.alive ? G.player : mates.sort((a, c) => a.pos.distanceTo(e.pos) - c.pos.distanceTo(e.pos))[0]; if (lead) goal = { x: lead.pos.x + rnd(-5, 5), z: lead.pos.z + rnd(-5, 5) }; }
    else if (best === 'evade' && G.titan) { const away = V(e.pos.x - G.titan.pos.x, 0, e.pos.z - G.titan.pos.z).normalize(); goal = { x: e.pos.x + away.x * 30 + away.z * 8, z: e.pos.z + away.z * 30 - away.x * 8 }; }
    else if (best === 'ambush' && tp) { if (!b.coverAt) b.coverAt = findCover(e, V(tp.x, 0, tp.z)); goal = b.coverAt; }
    else if (best === 'patrol') { if (!b.patrolGoal || Math.hypot(b.patrolGoal.x - e.pos.x, b.patrolGoal.z - e.pos.z) < 3) { const poi = spec.pois[Math.floor(Math.random() * spec.pois.length)]; b.patrolGoal = Math.random() < 0.5 && poi ? { x: poi.x * world.B, z: poi.z * world.B } : randomFreePoint(e.pos.x, e.pos.z, 40); } goal = b.patrolGoal; }
    if (goal && (!b.goal || Math.hypot(goal.x - b.goal.x, goal.z - b.goal.z) > 4 || b.repath <= 0)) { b.goal = goal; if (G.pathBudget > 0) { G.pathBudget--; b.path = findPath(e.pos.x, e.pos.z, goal.x, goal.z); b.pathI = 0; b.repath = 2.5; } }
    if (!goal) { b.goal = null; b.path = null; }
  }
  b.repath -= dt;
  // --- act: move ---
  let mx = 0, mz = 0, speed = 4.2 * (e.ally ? 1 : 0.85 + spec.difficulty.aggression * 0.3) * S.speed;
  if (b.path && b.pathI < b.path.length) {
    const wp = b.path[b.pathI]; const dx = wp.x - e.pos.x, dz = wp.z - e.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.2) b.pathI++; else { mx = dx / d; mz = dz / d; }
  }
  const coverSpot = b.coverAt || (b.order && b.order.until > now && b.order.moveTo);
  const atCover = (b.action === 'cover' || b.action === 'ambush') && coverSpot ? Math.hypot(coverSpot.x - e.pos.x, coverSpot.z - e.pos.z) < 2.2 : false;
  e.crouch = atCover && b.peekT <= 0;
  if (V_ && (b.action === 'engage') && !b.path) { b.strafeT -= dt; if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.6 + Math.random() * 1.5; }
    const to = V(V_.pos.x - e.pos.x, 0, V_.pos.z - e.pos.z).normalize(); const d = V_.pos.distanceTo(e.pos), want = S.range * 0.65 + (ROLE_RANGE[P.role] || 18) * 0.35; const fwd = d > want + 3 ? 0.7 : d < want - 4 ? -0.6 : 0;
    mx = to.x * fwd + to.z * b.strafe * 0.8; mz = to.z * fwd - to.x * b.strafe * 0.8; speed *= 0.7; }
  if (atCover) { b.peekT -= dt; if (b.peekT < -2.2 - P.caution * 2) b.peekT = 1 + Math.random(); if (e.mag < e.magSize * 0.5 && e.reload <= 0 && b.peekT <= 0) startReload(e); }
  if (b.action === 'retreat' && b.pathI >= (b.path ? b.path.length : 0)) { e.hp = Math.min(e.maxHp, e.hp + dt * 4); b.morale = Math.min(1, b.morale + dt * 0.03); }
  if (P.role === 'support') for (const m of G.entities) if (m.kind === 'soldier' && m.alive && m !== e && m.team === e.team && m.pos.distanceTo(e.pos) < 6 && !m.isPlayer) m.hp = Math.min(m.maxHp, m.hp + dt * 3);
  // stuck detection
  b.stuckT += dt; if (b.stuckT > 1) { if ((mx || mz) && e.pos.distanceTo(b.lastP) < 0.6) { b.path = null; b.repath = 0; b.goal = null; e.yaw += rnd(-2, 2); } b.lastP.copy(e.pos); b.stuckT = 0; }
  const mlen = Math.hypot(mx, mz); if (mlen > 1) { mx /= mlen; mz /= mlen; }
  const sp = speed * (e.crouch ? 0.45 : 1) * (e.reload > 0 ? 0.85 : 1);
  moveEntity(e.pos, mx * sp * dt, mz * sp * dt);
  separate(e);
  e.pos.y = Math.max(world.heightAt(e.pos.x, e.pos.z), world.waterLevel !== null && world.terrainType === 'flatwater' ? -0.2 : -1e3);
  e.moving = Math.hypot(mx, mz) * sp;
  // --- act: aim & shoot ---
  let FT = V_; // lure: tag the creature from a distance so it follows you into the enemy
  if (b.action === 'lure' && G.titan && G.titan.alive && G.titan.target !== e && G.titan.pos.distanceTo(e.pos) > 22 && G.titan.pos.distanceTo(e.pos) < 70 && (!V_ || V_.pos.distanceTo(e.pos) > 18)) FT = G.titan;
  let wantYaw = e.yaw;
  if (FT) wantYaw = Math.atan2(FT.pos.x - e.pos.x, FT.pos.z - e.pos.z); else if (mx || mz) wantYaw = Math.atan2(mx, mz);
  e.yaw += clamp(angDiff(e.yaw, wantYaw), -6 * dt, 6 * dt);
  b.reactT -= dt; if (b.burstPause > 0) b.burstPause -= dt;
  let discipline = true;
  if (V_ && S.holdFireBeyond && V_.pos.distanceTo(e.pos) > S.holdFireBeyond && now - e.lastHurtT > 2 && !(b.sprungUntil > now)) discipline = false;
  if (V_ && S.holdFireBeyond && discipline) b.sprungUntil = Math.max(b.sprungUntil || 0, now + 6);
  if (S.stillFire && e.moving > 0.8) discipline = false;
  if (b.relocateUntil > now && V_ && V_.pos.distanceTo(e.pos) > 8) discipline = false;
  const canFire = FT && discipline && e.reload <= 0 && e.fireCd <= 0 && b.reactT <= 0 && b.burstPause <= 0 && !(atCover && b.peekT <= 0 && b.action === 'cover') && Math.abs(angDiff(e.yaw, wantYaw)) < 0.3;
  if (canFire) {
    const tgt = V(FT.pos.x, FT.pos.y + (FT.kind === 'titan' ? 4.5 * FT.size : FT.crouch ? 1.0 : 1.25), FT.pos.z);
    const dir = tgt.sub(eye).normalize(); const d = FT.pos.distanceTo(e.pos);
    const sMul = S.suppressor && !b.isSuppressor ? 1 : S.spread;
    const spread = ((1 - e.acc) * 0.06 + (e.moving > 1 ? 0.02 : 0) + (P.role === 'sniper' ? -0.01 : 0) + d * 0.0003 + (FT.isPlayer && FT.crouch ? 0.006 : 0)) * sMul;
    shoot(e, dir, Math.max(0.003, spread)); e.fireCd = P.role === 'sniper' ? Math.max(S.fireCd, 0.6) : S.fireCd;
    const [b0, b1] = S.burst; if (++b.burst >= b0 + Math.floor(Math.random() * (b1 - b0 + 1))) { b.burst = 0; b.burstPause = 0.35 + Math.random() * 0.7 * (1.2 - e.aggr); }
  } else if (!V_ && e.mag < e.magSize * 0.4 && e.reload <= 0) startReload(e);
  // --- barks ---
  b.barkT -= dt;
}
function creatureAlive() { return (G.titan && G.titan.alive) || G.entities.some(o => o.kind === 'raptor' && o.alive); }
function squadSide(e) { const sq = G.squadOf[e.id]; if (!sq) return Math.random() < 0.5 ? 1 : -1; return sq.members.indexOf(e) % 2 ? 1 : -1; }
function targetEnt(id) { if (!id) return null; if (id === 'player') return G.player; if (id === 'creature') return G.titan || G.entities.find(e => e.kind === 'raptor' && e.alive); return G.entities.find(e => e.id === id); }
function findCover(e, threat) {
  let best = null, bs = 1e9; const tEye = V(threat.x, (threat.y || 0) + 1.5, threat.z);
  for (const c of world.colliders) {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2; const d = Math.hypot(cx - e.pos.x, cz - e.pos.z); if (d > 30 || c.top - world.heightAt(cx, cz) < 0.9) continue;
    const away = V(cx - threat.x, 0, cz - threat.z).normalize(); const half = Math.max(c.maxX - c.minX, c.maxZ - c.minZ) / 2;
    const p = { x: cx + away.x * (half + 1.1), z: cz + away.z * (half + 1.1) }; const [i, j] = world.nav.cellOf(p.x, p.z); if (!world.nav.free(i, j)) continue;
    const pe = V(p.x, world.heightAt(p.x, p.z) + 1.0, p.z); if (canSee(tEye, pe, 200)) continue;
    const s = Math.hypot(p.x - e.pos.x, p.z - e.pos.z) + Math.hypot(p.x - threat.x, p.z - threat.z) * 0.15; if (s < bs) { bs = s; best = p; }
  }
  return best;
}
function separate(e) { for (const o of G.entities) { if (o === e || !o.alive || o.kind !== 'soldier') continue; const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz); if (d > 0 && d < 0.9) { const p = (0.9 - d) / 2; moveEntity(e.pos, dx / d * p, dz / d * p); } } }
function bark(e, action) { if (e.brain.barkT > 0 || G.barkGlobal > 0) return; e.brain.barkT = 7 + Math.random() * 6; G.barkGlobal = 1.6; comms(e, AG.bark(action)); }

function animateSoldier(e, dt) {
  const m = e.model; if (!m) return;
  m.root.position.copy(e.pos); m.root.rotation.y = e.yaw;
  if (!e.alive) { e.deadT += dt; m.root.rotation.x = Math.max(-Math.PI / 2, -e.deadT * 5); m.root.position.y = e.pos.y + 0.15 * Math.min(1, e.deadT * 3); if (e.deadT > 20) m.root.visible = false; return; }
  if (!Number.isFinite(e.moving)) e.moving = 0; if (!Number.isFinite(e.walkPh)) e.walkPh = 0;
  const mv = clamp(e.moving / 4, 0, 1.4); e.walkPh += dt * (4 + e.moving * 2.2);
  const s = Math.sin(e.walkPh) * 0.65 * mv;
  m.legs[0].leg.rotation.x = s; m.legs[1].leg.rotation.x = -s; m.legs[0].knee.rotation.x = Math.max(0, -s) * 1.2 + (e.crouch ? 1.4 : 0); m.legs[1].knee.rotation.x = Math.max(0, s) * 1.2 + (e.crouch ? 1.4 : 0);
  if (e.crouch) { m.legs[0].leg.rotation.x = -1.0; m.legs[1].leg.rotation.x = -0.6; }
  m.hips.position.y = (e.crouch ? 0.6 : 0.95) + Math.abs(Math.cos(e.walkPh)) * 0.04 * mv;
  m.spine.rotation.x = (e.crouch ? 0.25 : 0.06) + (e.lastShotT > G.t - 0.08 ? -0.06 : 0);
  // name tag: allies always, enemies when you aim at them
  e.tag.visible = e.team === 'A' || G.aimed === e;
}
function updateTitan(t, dt) {
  const m = t.model; const s = t.size;
  if (!t.alive) { t.deadT = (t.deadT || 0) + dt; m.root.position.copy(t.pos); m.root.rotation.z = Math.min(Math.PI / 2.2, t.deadT * 0.9); m.root.position.y = t.pos.y - Math.min(2, t.deadT) * s; if (t.deadT < 1.2 && t.deadT + dt >= 1.2) { sfx('slam', 1); G.shake = 1; burst(t.pos.clone().setY(t.pos.y + 1), '#8a7a66', 60, 8, 1.2, 1); } return; }
  t.stateT -= dt; t.attackCd -= dt; t.roarCd -= dt;
  const targets = G.entities.filter(o => o.alive && o.kind === 'soldier');
  if (!t.target || !t.target.alive || Math.random() < dt * 0.2) {
    let best = null, bd = 1e9; for (const o of targets) { let d = o.pos.distanceTo(t.pos); if (t.noise === o) d *= 0.4; if (G.t - o.lastShotT < 2) d *= 0.75; if (d < bd) { bd = d; best = o; } }
    t.target = bd < 70 + spec.creature.temper * 60 ? best : null;
  }
  let speed = 0;
  if (t.state === 'roar') { if (t.stateT <= 0) t.state = t.target ? 'charge' : 'wander'; const ph = t.stateT * 12; m.arms.forEach((a, i) => { a.sh.rotation.x = -1.6 + Math.sin(ph + i * Math.PI) * 0.5; a.el.rotation.x = -1.2; }); if (Math.sin(ph) > 0.95) sfx('beat', 0.6); m.jaw.position.y = -0.75; }
  else if (t.state === 'slam') {
    const k = 1 - t.stateT / 1.3; m.arms.forEach(a => { a.sh.rotation.x = k < 0.6 ? lerp(-0.4, -3.0, k / 0.6) : lerp(-3.0, -0.2, (k - 0.6) / 0.4); a.el.rotation.x = -0.3; });
    if (!t.slammed && k >= 0.62) { t.slammed = true; const hit = t.pos.clone().add(V(Math.sin(t.yaw) * 4 * s, 0, Math.cos(t.yaw) * 4 * s)); sfx('slam', 1); G.shake = Math.max(G.shake, 1 - Math.min(1, G.player.pos.distanceTo(hit) / 60)); burst(hit.clone().setY(hit.y + 0.5), '#9a8a70', 50, 7, 1.2, 1.5);
      for (const o of targets) { const d = o.pos.distanceTo(hit); if (d < 8 * s) damage(o, 70 * (1 - d / (8 * s)) + 25, t, null); }
      // smashes cover it lands on
      world.colliders = world.colliders.filter(c => { const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2; return !(Math.hypot(cx - hit.x, cz - hit.z) < 4 * s && c.top - world.heightAt(cx, cz) < 3); }); }
    if (t.stateT <= 0) { t.state = 'charge'; t.slammed = false; }
  } else {
    let goal = null;
    if (t.target) { goal = t.target.pos; t.state = 'charge'; } else { t.state = 'wander'; if (!t.wander || t.pos.distanceTo(t.wander) < 6) { const p = randomFreePoint(0, 0, world.B * 0.8); t.wander = p ? V(p.x, 0, p.z) : V(); } goal = t.wander; }
    const d = Math.hypot(goal.x - t.pos.x, goal.z - t.pos.z); const want = Math.atan2(goal.x - t.pos.x, goal.z - t.pos.z); t.yaw += clamp(angDiff(t.yaw, want), -1.4 * dt, 1.4 * dt);
    speed = t.state === 'charge' ? 7 * s : 3 * s;
    if (t.target && d < 6.5 * s && t.attackCd <= 0) { t.state = 'slam'; t.stateT = 1.3; t.attackCd = 2.6 - spec.creature.temper; speed = 0; }
    if (t.roarCd <= 0 && t.target) { t.state = 'roar'; t.stateT = 2.2; t.roarCd = 14 + Math.random() * 10; sfx('roar', clamp(1 - t.pos.distanceTo(G.player.pos) / 160, 0.2, 1)); speed = 0; }
    if (d > 3) { t.pos.x += Math.sin(t.yaw) * speed * dt; t.pos.z += Math.cos(t.yaw) * speed * dt; }
    const B = world.B; t.pos.x = clamp(t.pos.x, -B, B); t.pos.z = clamp(t.pos.z, -B, B);
    t.walkPh += dt * speed * 0.35; const w = Math.sin(t.walkPh);
    m.arms.forEach((a, i) => { a.sh.rotation.x = -0.35 + (i ? w : -w) * 0.55 * Math.min(1, speed / 3); a.el.rotation.x = -0.25; });
    m.legs.forEach((l, i) => { l.leg.rotation.x = (i ? -w : w) * 0.5 * Math.min(1, speed / 3); l.kn.rotation.x = 0.3; });
    m.jaw.position.y = -0.6;
    if (speed > 0 && Math.abs(Math.cos(t.walkPh)) < 0.05) { G.shake = Math.max(G.shake, 0.15 * (1 - Math.min(1, t.pos.distanceTo(G.player.pos) / 60))); }
    // tramples soldiers in its way
    for (const o of targets) if (o.pos.distanceTo(t.pos) < 2.2 * s && speed > 4) { damage(o, 40 * dt, t, null); moveEntity(o.pos, Math.sin(t.yaw) * 6 * dt, Math.cos(t.yaw) * 6 * dt); }
  }
  t.pos.y = world.heightAt(t.pos.x, t.pos.z); if (world.terrainType === 'pit') t.pos.y = 0;
  m.root.position.copy(t.pos); m.root.rotation.y = t.yaw; m.hips.position.y = 3 + Math.abs(Math.sin(t.walkPh)) * 0.25;
  m.head.updateMatrixWorld(); m.head.getWorldPosition(t.headWorld);
}
function updateRaptor(r, dt) {
  const m = r.model;
  if (!r.alive) { r.deadT = (r.deadT || 0) + dt; m.root.position.copy(r.pos); m.root.rotation.z = Math.min(Math.PI / 2, r.deadT * 6); return; }
  r.biteCd -= dt; r.repath -= dt;
  if (!r.target || !r.target.alive || Math.random() < dt * 0.3) { let best = null, bd = 50; for (const o of G.entities) if (o.alive && o.kind === 'soldier') { const d = o.pos.distanceTo(r.pos); if (d < bd) { bd = d; best = o; } } r.target = best; }
  let mx = 0, mz = 0, speed = 0;
  if (r.target) {
    const tp = r.target.pos, d = tp.distanceTo(r.pos);
    let goal = tp; if (d > 7) { r.circle += dt * 0.8; goal = V(tp.x + Math.sin(r.circle) * 5, 0, tp.z + Math.cos(r.circle) * 5); }
    if (d > 3 && (r.repath <= 0 || !r.path)) { r.path = findPath(r.pos.x, r.pos.z, goal.x, goal.z); r.pi = 0; r.repath = 1.2; }
    if (r.path && r.pi < r.path.length && d > 2.5) { const wp = r.path[r.pi]; const dx = wp.x - r.pos.x, dz = wp.z - r.pos.z, dd = Math.hypot(dx, dz); if (dd < 1) r.pi++; else { mx = dx / dd; mz = dz / dd; } }
    else if (d > 1.4) { mx = (tp.x - r.pos.x) / d; mz = (tp.z - r.pos.z) / d; }
    speed = 9.5;
    if (d < 1.9 && r.biteCd <= 0) { r.biteCd = 0.9; damage(r.target, 14, r, r.target.pos.clone().setY(r.target.pos.y + 1)); sfx('screech', clamp(1 - d / 40, 0.2, 0.6), panOf(r.pos)); }
  }
  moveEntity(r.pos, mx * speed * dt, mz * speed * dt, 0.5); r.pos.y = world.heightAt(r.pos.x, r.pos.z);
  if (mx || mz) r.yaw += clamp(angDiff(r.yaw, Math.atan2(mx, mz)), -8 * dt, 8 * dt);
  r.walkPh += dt * (mx || mz ? 16 : 2); const w = Math.sin(r.walkPh);
  m.legs.forEach((l, i) => { l.leg.rotation.x = (i ? w : -w) * 0.8; l.kn.rotation.x = 0.6 + (i ? -w : w) * 0.4; });
  m.tail.rotation.y = Math.sin(r.walkPh * 0.5) * 0.3; m.body.position.y = 1.0 + Math.abs(w) * 0.06;
  m.root.position.copy(r.pos); m.root.rotation.y = r.yaw; m.head.getWorldPosition(r.headWorld);
}
function updateFlyer(f, dt) {
  const m = f.model;
  if (!f.alive) { f.fall += dt; f.pos.y -= f.fall * 9 * dt; m.root.rotation.z += dt * 3; const g = world.heightAt(f.pos.x, f.pos.z); if (f.pos.y < g) f.pos.y = g; m.root.position.copy(f.pos); return; }
  f.ang += f.speed * dt; const swoop = Math.max(0, Math.sin(G.t * 0.11 + f.rad)) ** 8;
  f.pos.set(f.cx + Math.cos(f.ang) * f.rad, f.h - swoop * (f.h - 12), f.cz + Math.sin(f.ang) * f.rad);
  if (swoop > 0.95 && !f.screeched) { f.screeched = true; sfx('screech', 0.5, panOf(f.pos)); } if (swoop < 0.5) f.screeched = false;
  m.root.position.copy(f.pos); m.root.rotation.y = -f.ang; m.root.rotation.z = -0.3;
  const flap = Math.sin(G.t * 5 + f.rad) * 0.6; m.wings[0].rotation.z = flap; m.wings[1].rotation.z = -flap;
}

/* =============================== player =============================== */
const PLAYER = { eye: 1.62, crouchEye: 1.05, walk: 5.2, sprint: 8.2, jump: 6 };
function updatePlayer(dt) {
  const p = G.player; if (!p.alive) return;
  // look
  const sens = (input.ads ? 0.0011 : 0.0021);
  p.yaw -= input.dx * sens; p.pitch = clamp(p.pitch - input.dy * sens, -1.45, 1.45); input.dx = input.dy = 0;
  if (input.touchLook) { /* handled in pointermove */ }
  // move
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (input.touchMove) { const dx = input.touchMove.x - input.touchMove.ox, dy = input.touchMove.y - input.touchMove.oy, L = Math.hypot(dx, dy); if (L > 8) { s = dx / Math.max(L, 60); f = -dy / Math.max(L, 60); } }
  p.crouch = keys.has('KeyC') || keys.has('ControlLeft');
  const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && f > 0 && !input.ads && !p.crouch;
  const sp = (sprint ? PLAYER.sprint : PLAYER.walk) * (p.crouch ? 0.5 : 1) * (input.ads ? 0.6 : 1) * (world.terrainType === 'flatwater' && p.pos.y < 0.1 ? 0.8 : 1);
  const L = Math.hypot(f, s); if (L > 1) { f /= L; s /= L; }
  const fx2 = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const vx = (fx2 * f + rx * s) * sp, vz = (fz * f + rz * s) * sp;
  p.vel.x = lerp(p.vel.x, vx, Math.min(1, dt * 12)); p.vel.z = lerp(p.vel.z, vz, Math.min(1, dt * 12));
  moveEntity(p.pos, p.vel.x * dt, p.vel.z * dt);
  // vertical
  const ground = world.heightAt(p.pos.x, p.pos.z);
  if ((keys.has('Space') || input.jump) && p.onGround) { p.vy = PLAYER.jump; p.onGround = false; input.jump = false; }
  p.vy -= 18 * dt; p.pos.y += p.vy * dt;
  if (p.pos.y <= ground && ground > -50) { if (p.pos.y < ground - 0.6 && p.onGround === false && p.vy < -14) damage(p, (-p.vy - 14) * 6, null, null); p.pos.y = ground; p.vy = 0; p.onGround = true; }
  else if (p.pos.y > ground + 0.05) p.onGround = false;
  const moving = Math.hypot(p.vel.x, p.vel.z);
  if (p.onGround && moving > 1) { G.stepT -= dt * moving * 0.32; if (G.stepT <= 0) { G.stepT = 1; sfx('step', 0.6); } }
  // hazards
  const hz = world.hazardAt(p.pos.x, p.pos.z, p.pos.y);
  if (hz === 'fall' && p.pos.y < -12) { p.hp = 0; G.deathMsg = 'You fell into the pit'; kill(p, null); }
  if (hz === 'lava') { damage(p, 40 * dt, null, null); G.hurtT = 0.3; }
  // camera
  const eyeH = lerp(G.eyeH || PLAYER.eye, p.crouch ? PLAYER.crouchEye : PLAYER.eye, Math.min(1, dt * 10)); G.eyeH = eyeH;
  G.bob += dt * moving * 1.6; const bob = p.onGround ? Math.sin(G.bob) * 0.035 * Math.min(1, moving / 5) : 0;
  const shake = G.shake; const sx = gauss() * shake * 0.04, sy = gauss() * shake * 0.04;
  camera.position.set(p.pos.x, p.pos.y + eyeH + bob, p.pos.z);
  camera.rotation.set(0, 0, 0); camera.rotation.order = 'YXZ'; camera.rotation.y = p.yaw + sx; camera.rotation.x = p.pitch + G.recoil + sy;
  G.recoil = lerp(G.recoil, 0, Math.min(1, dt * 9));
  const targetFov = input.ads ? 48 : sprint ? 80 : 74; camera.fov = lerp(camera.fov, targetFov, Math.min(1, dt * 12)); camera.updateProjectionMatrix();
  // weapon
  p.fireCd -= dt; if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) p.mag = p.magSize; }
  if (keys.has('KeyR') && p.mag < p.magSize) startReload(p);
  const firing = input.fire && !sprint;
  if (firing && p.reload <= 0 && p.fireCd <= 0 && p.mag > 0) {
    const dir = V(0, 0, -1).applyQuaternion(camera.quaternion);
    shoot(p, dir, input.ads ? 0.002 : p.crouch ? 0.006 : moving > 1 ? 0.016 : 0.009); p.fireCd = 0.092; G.recoil += input.ads ? 0.009 : 0.016; p.pitch += input.ads ? 0.004 : 0.007; G.vmKick = 1; G.vm.flash.visible = true; G.vm.flash.rotation.z = Math.random() * 6; G.flashT = 0.04;
  } else if (firing && p.mag === 0 && p.reload <= 0) startReload(p);
  G.flashT -= dt; if (G.flashT <= 0) G.vm.flash.visible = false;
  // viewmodel sway / ADS / reload dip
  const vm = G.vm.root; G.vmKick = lerp(G.vmKick, 0, Math.min(1, dt * 14));
  const ads = input.ads ? 1 : 0; G.adsK = lerp(G.adsK || 0, ads, Math.min(1, dt * 12));
  const rd = p.reload > 0 ? Math.sin((1 - p.reload / 1.7) * Math.PI) : 0;
  vm.position.set(lerp(0.2, 0.0, G.adsK) + Math.sin(G.bob * 0.5) * 0.01 * (1 - G.adsK), lerp(-0.2, -0.11, G.adsK) + Math.abs(Math.cos(G.bob * 0.5)) * 0.008 - rd * 0.12, lerp(-0.36, -0.26, G.adsK) + G.vmKick * 0.05);
  vm.rotation.set(G.vmKick * 0.06 + rd * 0.5, 0, sprint ? 0.5 : rd * 0.3);
  // pickups
  for (const k of G.pickups) if (k.alive && k.pos.distanceTo(p.pos) < 1.6 && p.hp < p.maxHp) { k.alive = false; k.mesh.visible = false; p.hp = Math.min(p.maxHp, p.hp + k.heal); banner('', `+${k.heal} HEALTH`, 1000); sfx('kill', 0.6); }
  // what are we aiming at (for enemy name tags)
  const res = castShot(camera.position, V(0, 0, -1).applyQuaternion(camera.quaternion), 120, p); G.aimed = res.ent && res.ent.kind === 'soldier' ? res.ent : null;
  // regen after 6s untouched
  if (G.t - p.lastHurtT > 6) p.hp = Math.min(p.maxHp, p.hp + dt * 3);
}

/* =============================== events & commander =============================== */
function runEvents() {
  for (const ev of spec.events) {
    if (ev.done || G.t < ev.at) continue; ev.done = true;
    sfx('alert', 0.7);
    if (ev.type === 'titan_arrives') { if (!G.titan) spawnTitan(true); banner(`${(spec.creature.name || 'THE TITAN').toUpperCase()}`, ev.text || 'Something enormous is coming. Do not draw its attention.', 3500); }
    else if (ev.type === 'blackout') { world.setBlackout(25); G.blackout = 25; banner('BLACKOUT', ev.text || 'Power is down. Sightlines are short.', 2600); }
    else if (ev.type === 'reinforcements') { const n = 2; for (let k = 0; k < n; k++) { const i = spec.operators.length + G.reinf++; const name = ['Grave', 'Spectre', 'Bastion', 'Fang'][G.reinf % 4] + '-' + i; const p = randomFreePoint(0, 0, 1e9, [G.player.pos], 50) || { x: 0, z: 0 };
      const op = { name, role: k ? 'flanker' : 'assault', strategy: k ? 'pincer' : 'blitz', aggression: 0.7, caution: 0.3, teamwork: 0.6, bio: '', quirk: 'all business' }; const e = makeSoldier({ id: 'n' + i, idx: i, name, team: campaign.mode === 'ffa' ? 'n' + i : 'H', persona: op, hp: spec.difficulty.enemyHealth, maxHp: spec.difficulty.enemyHealth, acc: spec.difficulty.enemyAccuracy, react: spec.difficulty.enemyReactionMs / 1000, aggr: 0.7 });
      e.pos.set(p.x, world.heightAt(p.x, p.z), p.z); e.brain.memory.set('player', { x: G.player.pos.x, z: G.player.pos.z, t: G.t, ent: G.player }); G.entities.push(e); } buildSquads(); banner('REINFORCEMENTS', ev.text || 'Hostile reinforcements inbound.', 2600); }
    else if (ev.type === 'storm_surge') { world.flash(1.5); sfx('thunder', 1); banner('STORM SURGE', ev.text || 'The weather turns on everyone.', 2400); G.stormSurge = 30; }
    else if (ev.type === 'quake') { G.shake = 1.2; G.quakeT = 3; sfx('slam', 1); sfx('thunder', 0.7); banner('TREMOR', ev.text || 'The ground is moving.', 2400); }
    else if (ev.type === 'supply_drop') { const p = randomFreePoint(G.player.pos.x, G.player.pos.z, 35) || { x: 0, z: 0 }; addPickup(p.x, p.z, 70, true); banner('SUPPLY DROP', ev.text || 'Med supplies dropped nearby. Follow the flare.', 2600); }
  }
}
/* ---------- strategy subagents: one per squad (same team + same strategy) ---------- */
function buildSquads() {
  const by = new Map();
  for (const e of G.entities) {
    if (e.kind !== 'soldier' || e.isPlayer) continue;
    const key = (campaign.mode === 'tdm' ? e.team : 'ffa') + '|' + e.persona.strategy;
    if (!by.has(key)) by.set(key, { key, strategy: e.persona.strategy, team: campaign.mode === 'tdm' ? e.team : 'solo', members: [], t: 0, busy: false, intent: '', src: '', calls: 0 });
    by.get(key).members.push(e);
  }
  G.squads = [...by.values()]; G.squadOf = {};
  G.squads.forEach((sq, i) => { sq.t = 5 + i * 3.5; sq.members.forEach(m => G.squadOf[m.id] = sq); });
  renderSquads();
}
function squadSnapshot(sq) {
  const alive = sq.members.filter(m => m.alive);
  const contacts = new Map();
  for (const m of alive) for (const [id, mem] of m.brain.memory) {
    const ent = mem.ent; if (!ent.alive || ent.kind === 'flyer') continue;
    const age = Math.round(G.t - mem.t); const prev = contacts.get(id); if (prev && prev.ageS <= age) continue;
    contacts.set(id, { id: ent.kind === 'titan' ? 'creature' : id, kind: ent.isPlayer ? 'player' : ent.kind === 'soldier' ? 'operator' : 'creature', name: ent.isPlayer ? campaign.callsign : ent.kind === 'soldier' ? ent.name : ent.kind, x: Math.round(mem.x), z: Math.round(mem.z), ageS: age });
  }
  const allies = campaign.mode === 'tdm' ? G.entities.filter(o => o.kind === 'soldier' && o.alive && o.team === sq.team && !sq.members.includes(o)).slice(0, 8).map(o => ({ id: o.id, name: o.isPlayer ? campaign.callsign : o.name, x: Math.round(o.pos.x), z: Math.round(o.pos.z) })) : [];
  const c = G.titan && G.titan.alive && alive.some(m => m.pos.distanceTo(G.titan.pos) < 120) ? G.titan : null;
  return { t: G.t, mode: campaign.mode, B: Math.round(world.B), strategy: sq.strategy, team: sq.team,
    world: { title: spec.title, archetype: spec.archetype, weather: spec.weather, timeOfDay: spec.timeOfDay },
    squad: alive.map(e => ({ id: e.id, name: e.name, role: e.persona.role, x: Math.round(e.pos.x), z: Math.round(e.pos.z), hp: Math.round(100 * e.hp / e.maxHp), ammo: Math.round(100 * e.mag / e.magSize), morale: Math.round(100 * e.brain.morale), action: e.brain.action, quirk: e.persona.quirk })),
    contacts: [...contacts.values()].filter(c2 => c2.kind !== 'creature' || c2.id === 'creature').slice(0, 10), allies,
    creature: c ? { type: 'titan_ape', name: c.name, x: Math.round(c.pos.x), z: Math.round(c.pos.z), hp: Math.round(100 * c.hp / c.maxHp) } : null,
    recent: G.recent.slice(-4) };
}
async function subagentTick(sq) {
  sq.busy = true; sq.calls++;
  const snap = squadSnapshot(sq);
  const live = aiMode === 'claude' || aiMode === 'server';
  const res = snap.squad.length ? (live && aiGap <= 0 ? await askSubagent(snap) : { ...AG.offlineSubagent(snap), src: 'offline' }) : { orders: [], intent: '' };
  sq.busy = false;
  if (!G || G.ended) return;
  sq.src = res.src; if (res.intent) sq.intent = res.intent;
  let delay = 0;
  for (const o of res.orders) { const e = G.entities.find(x => x.id === o.id); if (!e || !e.alive) continue;
    e.brain.order = { action: o.action, target: o.target, moveTo: o.moveTo, until: G.t + 24 }; e.brain.decideT = 0; e.brain.goal = null; e.brain.coverAt = null;
    if (o.say) { setTimeout(() => { if (e.alive && G && !G.ended) comms(e, o.say, res.src === 'claude'); }, delay); delay += 1300; } }
  renderSquads();
}
function updateSubagents(dt) {
  aiGap -= dt;
  const live = aiMode === 'claude' || aiMode === 'server';
  for (const sq of G.squads) {
    if (sq.busy || !sq.members.some(m => m.alive)) continue;
    sq.t -= dt; if (sq.t > 0) continue;
    if (live && aiGap > 0) continue; // spread Claude calls out; offline ones run freely
    // squads in contact think more often
    const inContact = sq.members.some(m => m.alive && m.brain.vis);
    sq.t = live ? (inContact ? 16 : 24) + G.squads.length * 1.5 : (inContact ? 8 : 12);
    if (live) aiGap = 3.5;
    subagentTick(sq);
  }
}
function renderSquads() {
  const box = $('#squads'); if (!box || !G || !G.squads) return; box.textContent = '';
  for (const sq of G.squads) {
    const ST = AG.STRATEGIES[sq.strategy]; const alive = sq.members.filter(m => m.alive).length;
    const row = document.createElement('div'); row.className = 'sq' + (alive ? '' : ' dead');
    const tag = document.createElement('b'); tag.textContent = ST.short; tag.style.color = ST.color;
    const meta = document.createElement('span'); meta.className = 'm'; meta.textContent = `${alive}/${sq.members.length} ${sq.team === 'A' ? 'ALLY' : sq.team === 'H' ? 'HOSTILE' : ''}${sq.src ? ' · ' + (sq.src === 'claude' ? 'Claude' : 'offline') : ''}`;
    const it = document.createElement('i'); it.textContent = alive ? (sq.intent || 'Planning…') : 'Squad wiped out';
    row.append(tag, meta, it); box.append(row);
  }
}

/* =============================== HUD =============================== */
function comms(e, text, speakIt = false) {
  if (!text) return; const el = document.createElement('div'); const n = document.createElement('b'); n.textContent = e.name.toUpperCase(); n.style.color = e.team === 'A' ? '#7cc8ff' : '#ff8a7a';
  const st = document.createElement('small'); if (e.strat) { st.textContent = ' ' + e.strat.short; st.style.color = e.strat.color; }
  el.append(n, st, document.createTextNode(' ' + text)); const box = $('#comms'); box.append(el); while (box.children.length > 5) box.firstChild.remove(); setTimeout(() => el.classList.add('old'), 7000);
  G.recent.push(`${e.name}: "${text}"`);
  if (speakIt || Math.random() < 0.4) if (e.pos.distanceTo(G.player.pos) < 60 || e.team === 'A') speak(text, e.voice);
}
function feed(k, v) {
  const el = document.createElement('div'); const a = document.createElement('span'), b = document.createElement('span');
  const nm = x => !x ? 'the world' : x.kind === 'titan' ? x.name : x.kind === 'raptor' ? 'predator' : x.kind === 'flyer' ? 'flyer' : x.name;
  const col = x => !x ? '#ccc' : x.isPlayer ? '#f2c14e' : x.kind !== 'soldier' ? '#ffa24a' : x.team === 'A' ? '#7cc8ff' : '#ff8a7a';
  a.textContent = nm(k); a.style.color = col(k); b.textContent = nm(v); b.style.color = col(v); el.append(a, document.createTextNode('  ✕  '), b);
  const f = $('#killfeed'); f.prepend(el); while (f.children.length > 5) f.lastChild.remove(); setTimeout(() => el.remove(), 7000);
  G.recent.push(`${nm(k)} killed ${nm(v)}`);
}
let bannerTimer = 0;
function banner(t, s, ms) { $('#bannerText').textContent = t; $('#bannerSub').textContent = s || ''; $('#banner').classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => $('#banner').classList.remove('show'), ms); }
let subTimer = 0;
function subtitle(t) { const el = $('#subtitle'); el.textContent = t; el.classList.add('show'); clearTimeout(subTimer); subTimer = setTimeout(() => el.classList.remove('show'), 5000); }
const radar = $('#radar'), rctx = radar.getContext('2d');
const hud = {};
function updateHUD(dt) {
  const p = G.player; const hpF = Math.max(0, p.hp / p.maxHp);
  if (hud.hp !== Math.round(hpF * 200)) { hud.hp = Math.round(hpF * 200); $('#hHp').style.width = (hpF * 100) + '%'; $('#hHp').style.background = hpF < 0.3 ? 'var(--danger)' : 'var(--fg)'; }
  const am = p.reload > 0 ? '··' : p.mag; if (hud.am !== am) { hud.am = am; $('#hAmmo').firstChild.textContent = am; }
  const left = G.entities.filter(e => e.kind === 'soldier' && !e.isPlayer && e.alive && e.team !== 'A').length; if (hud.left !== left) { hud.left = left; $('#hostiles').textContent = `${left} HOSTILE${left === 1 ? '' : 'S'} REMAINING`; }
  // compass
  const deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360; $('#compassStrip').style.transform = `translateX(${-deg * 3 - 540}px)`;
  // crosshair
  const ch = $('#cross'); ch.classList.toggle('ads', input.ads); ch.classList.toggle('hit', G.hitT > 0); ch.classList.toggle('kill', G.hitKill > 0); ch.classList.toggle('head', G.headT > 0);
  const spread = input.ads ? 4 : 10 + Math.hypot(p.vel.x, p.vel.z) * 2 + G.recoil * 300; ch.style.setProperty('--s', spread + 'px');
  // damage direction
  const dd = $('#dmgDir'); if (G.dmgDirT > 0) { dd.style.opacity = Math.min(1, G.dmgDirT); dd.style.transform = `translate(-50%,-50%) rotate(${(-(G.dmgDir - p.yaw) * 180 / Math.PI) + 180}deg)`; } else dd.style.opacity = 0;
  $('#vignette').style.opacity = clamp(Math.max(G.hurtT * 2, (1 - hpF) - 0.35), 0, 0.9);
  // radar
  const R = radar.width / 2, scale = R / 55; rctx.clearRect(0, 0, radar.width, radar.height); rctx.save(); rctx.translate(R, R);
  rctx.fillStyle = 'rgba(8,12,8,.55)'; rctx.beginPath(); rctx.arc(0, 0, R - 1, 0, 7); rctx.fill(); rctx.strokeStyle = 'rgba(255,255,255,.18)'; rctx.lineWidth = 1; for (const r of [R * 0.5, R - 1]) { rctx.beginPath(); rctx.arc(0, 0, r, 0, 7); rctx.stroke(); }
  rctx.rotate(p.yaw);
  const dot = (x, z, c, r) => { const dx = (x - p.pos.x) * scale, dz = (z - p.pos.z) * scale; if (dx * dx + dz * dz > (R - 4) ** 2) return; rctx.fillStyle = c; rctx.beginPath(); rctx.arc(dx, dz, r, 0, 7); rctx.fill(); };
  for (const e of G.entities) { if (!e.alive || e.isPlayer) continue; if (e.kind === 'soldier') { if (e.team === 'A') dot(e.pos.x, e.pos.z, '#7cc8ff', 3); else if (G.t - e.lastShotT < 1.8) dot(e.pos.x, e.pos.z, '#ff5a4a', 3); } else if (e.kind === 'titan') dot(e.pos.x, e.pos.z, '#ffa24a', 7); else if (e.kind === 'raptor' && G.t % 1 < 0.6) dot(e.pos.x, e.pos.z, '#ffa24a', 2.5); }
  for (const k of G.pickups) if (k.alive) dot(k.pos.x, k.pos.z, '#6bff9a', 2.5);
  rctx.restore(); rctx.fillStyle = '#f2c14e'; rctx.beginPath(); rctx.moveTo(R, R - 6); rctx.lineTo(R - 4, R + 4); rctx.lineTo(R + 4, R + 4); rctx.fill();
  $('#suppress').style.opacity = G.suppress ? 0.5 * G.suppress : 0;
}

/* =============================== pickups =============================== */
function addPickup(x, z, heal = 45, flare = false) {
  const g = new THREE.Group(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.4), new THREE.MeshStandardMaterial({ color: '#e8e8e0', roughness: 0.4 })); box.castShadow = true; g.add(box);
  const cr = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#30ff7a', emissiveIntensity: 3 }); const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.08), cr); c1.position.y = 0.18; g.add(c1); const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.3), cr); c2.position.y = 0.18; g.add(c2);
  const y = world.heightAt(x, z); g.position.set(x, y + 0.3, z); scene.add(g);
  if (flare) { const l = new THREE.PointLight('#ff3a2a', 40, 18, 2); l.position.y = 1; g.add(l); const fm = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ emissive: '#ff3a2a', emissiveIntensity: 6, color: '#000' })); fm.position.y = 0.4; g.add(fm); }
  G.pickups.push({ pos: V(x, y, z), mesh: g, alive: true, heal });
}

/* =============================== level lifecycle =============================== */
function clearLevel() {
  if (G) { for (const e of G.entities) if (e.model) scene.remove(e.model.root); for (const k of G.pickups) scene.remove(k.mesh); if (G.vm) camera.remove(G.vm.root); }
  if (world) { world.dispose(); world = null; }
  G = null; stopMusic();
}
function prepareLevel(s) {
  clearLevel(); spec = s;
  world = buildWorld(scene, renderer, spec, quality);
  renderer.toneMappingExposure = world.exposure;
  if (!fx.parts) initFX();
  G = { t: 0, entities: [], pickups: [], noise: [], recent: [], stats: { shots: 0, hits: 0, dmgTaken: 0, titan: false }, shake: 0, recoil: 0, bob: 0, stepT: 1, hitT: 0, hitKill: 0, headT: 0, hurtT: 0, dmgDirT: 0, suppress: 0,
    vmKick: 0, flashT: 0, barkGlobal: 2, reinf: 0, blackout: 0, ended: false, intro: 0, cmdT: 7, pathBudget: 4, mode: 'preview', orbit: 0 };
  spec.events.forEach(e => e.done = false);
  const sp = spawnAll(); G.player = sp.player; G.entities = sp.ents;
  for (let k = 0; k < 3; k++) { const p = randomFreePoint(0, 0, world.B * 0.8, G.entities.map(e => e.pos), 12); if (p) addPickup(p.x, p.z); }
  const ct = spec.creature.type;
  if (ct === 'titan_ape' && !spec.events.some(e => e.type === 'titan_arrives')) { spawnTitan(false); }
  if (ct === 'raptor_pack') spawnRaptors(3 + Math.min(4, campaign.level));
  if (ct === 'sky_beasts' || spec.archetype === 'primeval_island' || spec.archetype === 'desert_colossi') spawnFlyers(ct === 'sky_beasts' ? 6 : 3);
  buildSquads();
  G.vm = viewModel(); camera.add(G.vm.root); G.vm.root.visible = false;
  for (const e of G.entities) if (e.kind === 'soldier' && !e.isPlayer) animateSoldier(e, 0);
}
function startIntro() {
  G.mode = 'intro'; G.intro = 0; initAudio(); startMusic(spec.music.mood); show(null); $('#letterbox').classList.add('on');
  $('#introTitle').textContent = spec.title; $('#introSub').textContent = `LEVEL ${campaign.level} OF ${campaign.total} · ${spec.tagline}`; $('#intro').classList.add('show');
}
function beginPlay() {
  G.mode = 'play'; $('#letterbox').classList.remove('on'); $('#intro').classList.remove('show'); $('#hud').hidden = false; G.vm.root.visible = true; camera.fov = 74;
  $('#hTitle').textContent = spec.title; $('#hSub').textContent = `LEVEL ${campaign.level}/${campaign.total} · THREAT ${spec.difficulty.rating}/10 · ${AG.ARCHETYPES[spec.archetype].label.toUpperCase()}`;
  $('#hObj').textContent = campaign.mode === 'tdm' ? `Lead your squad. Eliminate the ${spec.factions.hostile.name}.` : 'Be the last operator standing.';
  $('#hCreature').textContent = spec.creature.type !== 'none' ? `${spec.creature.type === 'titan_ape' ? 'Titan' : spec.creature.type === 'raptor_pack' ? 'Predators' : 'Flyers'}: ${spec.creature.name || 'unknown'}` : '';
  $('#comms').innerHTML = ''; $('#killfeed').innerHTML = '';
  lockPointer();
  banner('', `${G.squads.length} squad subagents are planning their attack…`, 2400);
}
function endLevel(won, msg) {
  if (G.ended) return; G.ended = true; G.won = won; G.endT = 2.4; G.deathMsg = G.deathMsg || msg;
  banner(won ? 'AREA SECURED' : 'K.I.A.', won ? 'All hostiles neutralized' : (G.deathMsg || 'Mission failed'), 2400);
  if (document.pointerLockElement) document.exitPointerLock();
}
function finishLevel() {
  G.mode = 'done'; $('#hud').hidden = true; G.vm.root.visible = false;
  const p = G.player, acc = G.stats.shots ? G.stats.hits / G.stats.shots : 0, hpLeft = Math.max(0, p.hp), rating = spec.difficulty.rating;
  const score = Math.round((p.kills * 120 + acc * 400 + (G.won ? 600 + hpLeft * 3 + Math.max(0, 400 - G.t) : 0) + (G.stats.titan ? 2000 : 0)) * (1 + rating / 10));
  campaign.score += score;
  campaign.perf = { won: G.won, kills: p.kills, acc, time: G.t, hpLeftPct: hpLeft / p.maxHp, rating };
  campaign.history.push({ title: spec.title, archetype: spec.archetype, time: spec.timeOfDay, weather: spec.weather, creature: spec.creature.type, rating });
  const last = campaign.level >= campaign.total;
  $('#dEyebrow').textContent = `Level ${campaign.level} of ${campaign.total} · ${spec.title}`;
  $('#dTitle').textContent = G.won ? (last ? 'CAMPAIGN COMPLETE' : 'MISSION COMPLETE') : 'MISSION FAILED';
  $('#dText').textContent = G.won ? (last ? `All ${campaign.total} levels cleared, ${campaign.callsign}. Final score ${campaign.score.toLocaleString()}.` : 'The director has watched you play. The next film is already being written around how you fight.') : `${G.deathMsg || 'You went down.'} The director will rewrite this level from scratch and adjust the odds.`;
  $('#dKills').textContent = p.kills; $('#dAcc').textContent = Math.round(acc * 100) + '%'; $('#dTime').textContent = Math.floor(G.t / 60) + ':' + String(Math.floor(G.t % 60)).padStart(2, '0');
  $('#dHp').textContent = Math.round(hpLeft); $('#dScore').textContent = score.toLocaleString(); $('#dTotal').textContent = campaign.score.toLocaleString();
  const nb = $('#nextBtn');
  if (G.won && last) { nb.textContent = 'New campaign'; nb.onclick = () => { clearLevel(); show('menu'); }; }
  else if (G.won) { nb.textContent = `Direct level ${campaign.level + 1}`; nb.onclick = () => { campaign.level++; generate(); }; }
  else { nb.textContent = `Retry level ${campaign.level} (new world)`; nb.onclick = () => generate(); }
  show('debrief'); G.mode = 'preview'; nb.focus();
}

/* =============================== main loop =============================== */
let last = performance.now(), paused = false;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G || !world) { renderer.setClearColor('#050605'); renderer.clear(); return; }
  if (G.mode === 'preview' || G.mode === 'done') { // slow cinematic orbit behind menus
    G.orbit += dt * 0.05; const r = world.B * 0.9, cx = Math.cos(G.orbit) * r, cz = Math.sin(G.orbit) * r; camera.position.set(cx, world.heightAt(cx, cz) + 18 + (world.terrainType === 'pit' ? 0 : 6), cz); camera.lookAt(0, 4, 0); camera.fov = 60; camera.updateProjectionMatrix();
    world.update(dt, (G.wt = (G.wt || 0) + dt), camera); for (const e of G.entities) { if (e.kind === 'flyer') updateFlyer(e, dt); if (e.kind === 'titan' && e.model) { e.model.root.position.copy(e.pos); } }
    render(); return;
  }
  if (G.mode === 'intro') {
    G.intro += dt; const k = Math.min(1, G.intro / 6); const e = k * k * (3 - 2 * k); const p = G.player;
    const pit = world.terrainType === 'pit'; const start = pit ? V(0, 11, 0) : V(p.pos.x + Math.sin(p.yaw) * 70, p.pos.y + 45, p.pos.z + Math.cos(p.yaw) * 70), end = V(p.pos.x, p.pos.y + PLAYER.eye, p.pos.z);
    const a = Math.atan2(start.x - end.x, start.z - end.z) + e * (pit ? 0.4 : 1.8); const dist = lerp(Math.hypot(start.x - end.x, start.z - end.z), 0.01, e);
    camera.position.set(end.x + Math.sin(a) * dist, lerp(start.y, end.y, e), end.z + Math.cos(a) * dist);
    const look = V(lerp(0, end.x - Math.sin(p.yaw) * 10, e), lerp(pit ? -90 : 2, end.y, e), lerp(0, end.z - Math.cos(p.yaw) * 10, e)); camera.lookAt(look); camera.fov = lerp(55, 74, e); camera.updateProjectionMatrix();
    world.update(dt, (G.wt = (G.wt || 0) + dt), camera);
    for (const en of G.entities) { if (en.kind === 'soldier' && !en.isPlayer) animateSoldier(en, dt); if (en.kind === 'flyer') updateFlyer(en, dt); if (en.kind === 'titan') { en.model.root.position.copy(en.pos); } if (en.kind === 'raptor') updateRaptor(en, 0); }
    render(); if (G.intro > 6.2) beginPlay(); return;
  }
  if (paused) { render(); return; }
  const _t0 = performance.now();
  G.t += dt; G.pathBudget = 4; G.barkGlobal -= dt; G.hitT -= dt; G.hitKill -= dt; G.headT -= dt; G.hurtT -= dt; G.dmgDirT -= dt; G.blackout -= dt; G.suppress = Math.max(0, G.suppress - dt * 1.5);
  if (G.quakeT > 0) { G.quakeT -= dt; G.shake = Math.max(G.shake, 0.6); }
  G.shake = Math.max(0, G.shake - dt * 1.4);
  const ev = world.update(dt, G.t, camera); if (ev === 'thunder') setTimeout(() => sfx('thunder', 0.9), 300 + Math.random() * 900);
  if (G.stormSurge > 0) { G.stormSurge -= dt; if (Math.random() < dt * 0.4) { world.flash(1); setTimeout(() => sfx('thunder', 1), 400); } }
  G.noise = G.noise.filter(n => G.t - n.t < 0.5);
  if (!G.ended) updatePlayer(dt);
  for (const e of G.entities) {
    if (e.kind === 'soldier' && !e.isPlayer) { if (e.alive && !G.ended) { e.fireCd -= dt; if (e.reload > 0) { e.reload -= dt; if (e.reload <= 0) e.mag = e.magSize; } updateNPC(e, dt); const hz = world.hazardAt(e.pos.x, e.pos.z, e.pos.y); if (hz === 'lava') damage(e, 30 * dt, null, null); } animateSoldier(e, dt); }
    else if (e.kind === 'titan') updateTitan(e, G.ended ? 0 : dt);
    else if (e.kind === 'raptor') updateRaptor(e, G.ended ? 0 : dt);
    else if (e.kind === 'flyer') updateFlyer(e, dt);
  }
  for (const k of G.pickups) if (k.alive) { k.mesh.rotation.y += dt; k.mesh.position.y = k.pos.y + 0.35 + Math.sin(G.t * 3) * 0.08; }
  runEvents();
  if (!G.ended) updateSubagents(dt);
  G.squadT = (G.squadT || 0) - dt; if (G.squadT <= 0) { G.squadT = 1; renderSquads(); }
  updateFX(dt); updateHUD(dt);
  if (G.ended) { G.endT -= dt; if (G.endT <= 0) finishLevel(); }
  const _t1 = performance.now(); render(); G.prof = { update: Math.round(_t1 - _t0), render: Math.round(performance.now() - _t1) };
}
requestAnimationFrame(loop);

/* =============================== UI flow =============================== */
const screens = ['menu', 'briefing', 'debrief', 'paused'];
function show(id) { screens.forEach(s => $('#' + s).hidden = s !== id); if (id) $('#hud').hidden = true; else if (G && G.mode === 'play') $('#hud').hidden = false; }
let mode = 'ffa';
function setMode(m) { mode = m; $('#modeFfa').setAttribute('aria-pressed', m === 'ffa'); $('#modeTdm').setAttribute('aria-pressed', m === 'tdm'); $('#modeHint').textContent = m === 'ffa' ? 'Every operator fights everyone, you included. Last one standing clears the level.' : 'Half the operators join your squad (blue). Wipe out the hostile team (red).'; }
$('#modeFfa').onclick = () => setMode('ffa'); $('#modeTdm').onclick = () => setMode('tdm');
$('#npcs').oninput = e => $('#npcOut').textContent = e.target.value; $('#levels').oninput = e => $('#lvlOut').textContent = e.target.value;
$('#qualHigh').onclick = () => { quality.high = true; $('#qualHigh').setAttribute('aria-pressed', 'true'); $('#qualLow').setAttribute('aria-pressed', 'false'); resize(); };
$('#qualLow').onclick = () => { quality.high = false; $('#qualLow').setAttribute('aria-pressed', 'true'); $('#qualHigh').setAttribute('aria-pressed', 'false'); resize(); };
if (!quality.high) $('#qualLow').click();
try { const s = JSON.parse(localStorage.getItem('kh3-setup') || 'null'); if (s) { $('#callsign').value = s.callsign || 'REAPER'; $('#npcs').value = s.npcs; $('#npcOut').textContent = s.npcs; $('#levels').value = s.levels; $('#lvlOut').textContent = s.levels; setMode(s.mode === 'tdm' ? 'tdm' : 'ffa'); } } catch (e) {}
$('#startBtn').onclick = () => {
  initAudio(); const callsign = ($('#callsign').value || 'REAPER').toUpperCase().slice(0, 14);
  campaign = { callsign, npcs: +$('#npcs').value, total: +$('#levels').value, mode, level: 1, history: [], perf: null, score: 0 };
  try { localStorage.setItem('kh3-setup', JSON.stringify({ callsign, npcs: campaign.npcs, levels: campaign.total, mode })); } catch (e) {}
  generate();
};
$('#cancelGen').onclick = () => { forceOffline = true; if (genCtl) genCtl.abort(); };
$('#regenBtn').onclick = () => generate();
$('#deployBtn').onclick = () => { initAudio(); startIntro(); };
$('#menuBtn1').onclick = $('#menuBtn2').onclick = () => { clearLevel(); show('menu'); };
$('#resumeBtn').onclick = () => { setPaused(false); lockPointer(); };
$('#abortBtn').onclick = () => { paused = false; clearLevel(); show('menu'); };
$('#muteBtn').onclick = () => { audio.muted = !audio.muted; $('#muteBtn').textContent = audio.muted ? 'Sound: off' : 'Sound: on'; if (audio.ctx) audio.music.gain.setTargetAtTime(audio.muted ? 0 : 0.16, audio.ctx.currentTime, 0.2); };
$('#voiceBtn').onclick = () => { audio.voices = !audio.voices; $('#voiceBtn').textContent = audio.voices ? 'Radio voices: on' : 'Radio voices: off'; if (!audio.voices && 'speechSynthesis' in window) speechSynthesis.cancel(); };

function termLog() { const term = $('#term'); term.textContent = ''; let raw = null; return (msg, cls) => { if (cls === 'raw') { if (!raw) { raw = document.createElement('div'); raw.className = 'raw'; term.append(raw); } raw.textContent = msg; } else { const d = document.createElement('div'); if (cls) d.className = cls; d.textContent = msg; term.append(d); raw = null; } term.scrollTop = term.scrollHeight; }; }
let genToken = 0;
async function generate() {
  const token = ++genToken; forceOffline = false; clearLevel();
  show('briefing'); $('#bLoading').hidden = false; $('#bReady').hidden = true; $('#briefing').classList.remove('poster');
  $('#bEyebrow').textContent = `Level ${campaign.level} of ${campaign.total} · ${campaign.mode === 'tdm' ? 'Team deathmatch' : 'Free-for-all'} · ${campaign.npcs} operators`;
  const log = termLog();
  const ctx = { level: campaign.level, total: campaign.total, npcs: campaign.npcs, mode: campaign.mode, history: campaign.history, perf: campaign.perf, seed: Math.floor(Math.random() * 1e9).toString(36) };
  const s = await askWorld(ctx, log); if (token !== genToken) return;
  log(`“${s.title}” is written. Building the world: ${AG.ARCHETYPES[s.archetype].label.toLowerCase()}, ${s.timeOfDay}, ${s.weather}…`, 'hi');
  await new Promise(r => setTimeout(r, 60));
  try { prepareLevel(s); } catch (err) { console.error(err); log('World build failed: ' + err.message + '. Trying another world.', 'hi'); const f = AG.proceduralWorld(ctx); f.source = 'Composed by the offline director'; prepareLevel(f); }
  if (token !== genToken) return;
  renderPoster(spec);
}
function renderPoster(s) {
  $('#bLoading').hidden = true; $('#bReady').hidden = false; $('#briefing').classList.add('poster');
  $('#pGenre').textContent = `${s.genre} · ${AG.ARCHETYPES[s.archetype].label} · ${s.timeOfDay} · ${s.weather}`;
  $('#pTitle').textContent = s.title; $('#pTag').textContent = s.tagline; $('#pLog').textContent = s.logline;
  const cast = $('#pCast'); cast.innerHTML = ''; const allies = campaign.mode === 'tdm' ? Math.floor(campaign.npcs / 2) : 0;
  s.operators.forEach((o, i) => { const li = document.createElement('li'); const n = document.createElement('b'); n.textContent = o.name; n.className = i < allies ? 'ally' : 'foe'; const ST = AG.STRATEGIES[o.strategy]; const sg = document.createElement('em'); sg.textContent = ' ' + (ST ? ST.label : ''); if (ST) sg.style.color = ST.color; const r = document.createElement('span'); r.textContent = ` ${o.role} · ${o.bio}`; li.title = o.quirk; li.append(n, sg, r); cast.append(li); });
  $('#pCreature').textContent = s.creature.type !== 'none' ? `and introducing ${s.creature.name || 'the beast'} as the ${s.creature.type === 'titan_ape' ? 'titan' : s.creature.type === 'raptor_pack' ? 'pack' : 'flock'}` : '';
  $('#pFactions').textContent = campaign.mode === 'tdm' ? `${s.factions.ally.name} vs ${s.factions.hostile.name}` : `${s.factions.hostile.name} contract · free-for-all`;
  const D = s.difficulty; $('#iRating').textContent = D.rating + '/10'; $('#iAcc').textContent = Math.round(D.enemyAccuracy * 100) + '%'; $('#iReact').textContent = Math.round(D.enemyReactionMs) + 'ms'; $('#iEhp').textContent = D.enemyHealth; $('#iPhp').textContent = D.playerHealth;
  $('#iEvents').textContent = s.events.length ? s.events.map(e => e.type.replace('_', ' ')).join(', ') : 'none';
  $('#pWhy').textContent = s.reasoning; $('#pSource').textContent = s.source || '';
  $('#deployBtn').focus();
}
let pausedAt = 0;
function setPaused(v) { if (!G || G.mode !== 'play' || G.ended) return; if (v) pausedAt = performance.now(); paused = v; show(v ? 'paused' : null); if (v) { input.fire = false; keys.clear(); } }

/* =============================== input =============================== */
function lockPointer() { if (isTouch) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && G && G.mode === 'play' && !G.ended && !paused) setPaused(true); });
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (G && G.mode === 'intro' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { beginPlay(); return; }
  if (G && G.mode === 'play') { if (e.code === 'Escape' || e.code === 'KeyP') { if (performance.now() - pausedAt > 350) setPaused(!paused); e.preventDefault(); return; } if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); }
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); input.fire = false; if (G && G.mode === 'play' && !G.ended) setPaused(true); });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => { if (!G) return; initAudio(); if (G.mode === 'intro') { beginPlay(); return; } if (G.mode !== 'play' || paused) return; if (!document.pointerLockElement) lockPointer(); if (e.button === 0) input.fire = true; if (e.button === 2) input.ads = true; });
addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; if (e.button === 2) input.ads = false; });
addEventListener('mousemove', e => { if (G && G.mode === 'play' && !paused && !isTouch) { input.dx += clamp(e.movementX || 0, -120, 120); input.dy += clamp(e.movementY || 0, -120, 120); } });
// touch: left half moves, right half looks; buttons fire / ads / jump
canvas.addEventListener('touchstart', e => { if (!G) return; if (G.mode === 'intro') { beginPlay(); return; } for (const t of e.changedTouches) { const o = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY }; if (t.clientX < innerWidth / 2) { if (!input.touchMove) input.touchMove = o; } else if (!input.touchLook) input.touchLook = o; } e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', e => { for (const t of e.changedTouches) { if (input.touchMove && t.identifier === input.touchMove.id) { input.touchMove.x = t.clientX; input.touchMove.y = t.clientY; } if (input.touchLook && t.identifier === input.touchLook.id) { input.dx += (t.clientX - input.touchLook.lx) * 2.2; input.dy += (t.clientY - input.touchLook.ly) * 2.2; input.touchLook.lx = t.clientX; input.touchLook.ly = t.clientY; } } e.preventDefault(); }, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) { if (input.touchMove && t.identifier === input.touchMove.id) input.touchMove = null; if (input.touchLook && t.identifier === input.touchLook.id) input.touchLook = null; } };
canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
const tb = (id, on, off) => { const el = $(id); if (!el) return; el.addEventListener('touchstart', e => { on(); e.preventDefault(); }, { passive: false }); el.addEventListener('touchend', e => { off(); e.preventDefault(); }); };
tb('#tFire', () => input.fire = true, () => input.fire = false); tb('#tAds', () => input.ads = !input.ads, () => {}); tb('#tJump', () => input.jump = true, () => {}); tb('#tReload', () => G && startReload(G.player), () => {});
if (isTouch) document.body.classList.add('touch');
$('#pauseBtn').onclick = () => setPaused(true);

(() => { const st = $('#compassStrip'); const L = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = -180; d <= 540; d += 15) { const n = ((d % 360) + 360) % 360, x = (d + 180) * 3; if (L[n] !== undefined) { const b = document.createElement('b'); b.textContent = L[n]; if (n % 90 === 0) b.className = 'c'; b.style.left = x + 'px'; st.append(b); } else { const i = document.createElement('i'); i.style.left = x + 'px'; st.append(i); } } })();
show('menu');
window.__kh = { get G() { return G; }, get world() { return world; }, get spec() { return spec; }, DEBUG }; // debug handle
