// Battle Commander endpoint: the game posts a battlefield snapshot every ~20 s and gets back
// one tactical order and radio line per NPC.
// POST /api/commander {snap} -> {orders:[{id,action,target,say}], narration}
import { commanderPrompt } from '../public/agents.js';
import { clampInt, clean, rateLimited, readBody, askClaude } from './_lib.js';

const MODEL = process.env.COMMANDER_MODEL || 'claude-haiku-5-5';
const ARCH = ['primeval_island', 'vertical_pit', 'neon_megacity', 'frozen_station', 'desert_colossi', 'volcanic_forge', 'shadow_realm', 'drowned_city'];
const ROLES = ['assault', 'sniper', 'support', 'flanker', 'berserker'];
const id = s => /^(n\d{1,3}|player|creature)$/.test(String(s)) ? String(s) : null;

function sanitize(s = {}) {
  const w = s.world || {};
  const npcs = Array.isArray(s.npcs) ? s.npcs.slice(0, 24).map(n => ({
    id: id(n?.id) || 'n0', name: clean(n?.name, 18) || 'Op', role: ROLES.includes(n?.role) ? n.role : 'assault',
    team: ['A', 'H', 'solo'].includes(n?.team) ? n.team : 'solo', x: clampInt(n?.x, -400, 400, 0), z: clampInt(n?.z, -400, 400, 0),
    hp: clampInt(n?.hp, 0, 100, 100), ammo: clampInt(n?.ammo, 0, 100, 100), morale: clampInt(n?.morale, 0, 100, 100),
    sees: Array.isArray(n?.sees) ? n.sees.map(id).filter(Boolean).slice(0, 4) : [], quirk: clean(n?.quirk, 90),
  })) : [];
  const c = s.creature;
  return {
    t: clampInt(s.t, 0, 3600, 0), mode: s.mode === 'tdm' ? 'tdm' : 'ffa',
    world: { title: clean(w.title, 48), archetype: ARCH.includes(w.archetype) ? w.archetype : 'primeval_island', weather: clean(w.weather, 12), timeOfDay: clean(w.timeOfDay, 10) },
    player: { name: clean(s.player?.name, 14) || 'PLAYER', x: clampInt(s.player?.x, -400, 400, 0), z: clampInt(s.player?.z, -400, 400, 0), hp: clampInt(s.player?.hp, 0, 100, 100) },
    npcs, creature: c ? { type: 'titan_ape', name: clean(c.name, 40), x: clampInt(c.x, -400, 400, 0), z: clampInt(c.z, -400, 400, 0), hp: clampInt(c.hp, 0, 100, 100) } : null,
    recent: Array.isArray(s.recent) ? s.recent.slice(-5).map(r => clean(r, 100)) : [],
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Commander not configured' });
  if (rateLimited(req, 10)) return res.status(429).json({ error: 'Commander rate limited' });
  const snap = sanitize(readBody(req).snap);
  if (!snap.npcs.length) return res.status(200).json({ orders: [], narration: '' });
  try {
    const out = await askClaude(commanderPrompt(snap), { model: MODEL, maxTokens: 1500 });
    if (!out) return res.status(502).json({ error: 'Commander returned nothing' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out); // the browser runs normalizeOrders() on this
  } catch (e) {
    return res.status(502).json({ error: 'Commander failed', status: e.status || 0 });
  }
}
