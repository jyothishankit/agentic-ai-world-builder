// Strategy subagent endpoint: each squad (same team + same attack strategy) posts what it can see,
// and Claude, playing that squad's doctrine, returns an order, a position and a radio line per operator.
// POST /api/subagent {snap} -> {intent, orders:[{id, action, target, moveTo:{x,z}, say}]}
import { subagentPrompt, STRATEGIES } from '../public/agents.js';
import { clampInt, clean, rateLimited, readBody, askClaude } from './_lib.js';

const MODEL = process.env.SUBAGENT_MODEL || 'claude-haiku-5-5';
const ARCH = ['primeval_island', 'vertical_pit', 'neon_megacity', 'frozen_station', 'desert_colossi', 'volcanic_forge', 'shadow_realm', 'drowned_city'];
const ROLES = ['assault', 'sniper', 'support', 'flanker', 'berserker'];
const ACTIONS = ['engage', 'flank', 'cover', 'hunt', 'retreat', 'regroup', 'ambush', 'evade', 'hold', 'lure'];
const id = s => /^(n\d{1,3}|player|creature)$/.test(String(s)) ? String(s) : null;
const xz = v => clampInt(v, -400, 400, 0);

// Rebuild the snapshot from bounded values; free text from the browser never reaches the prompt unfiltered.
function sanitize(s = {}) {
  const w = s.world || {};
  const squad = (Array.isArray(s.squad) ? s.squad : []).slice(0, 16).map(m => ({
    id: id(m?.id) || 'n0', name: clean(m?.name, 18) || 'Op', role: ROLES.includes(m?.role) ? m.role : 'assault', x: xz(m?.x), z: xz(m?.z),
    hp: clampInt(m?.hp, 0, 100, 100), ammo: clampInt(m?.ammo, 0, 100, 100), morale: clampInt(m?.morale, 0, 100, 100),
    action: ACTIONS.includes(m?.action) ? m.action : 'hold', quirk: clean(m?.quirk, 90),
  }));
  const contacts = (Array.isArray(s.contacts) ? s.contacts : []).slice(0, 10).map(c => ({
    id: id(c?.id) || 'player', kind: ['player', 'operator', 'creature'].includes(c?.kind) ? c.kind : 'operator', name: clean(c?.name, 18) || 'contact', x: xz(c?.x), z: xz(c?.z), ageS: clampInt(c?.ageS, 0, 600, 0),
  }));
  const allies = (Array.isArray(s.allies) ? s.allies : []).slice(0, 8).map(a => ({ id: id(a?.id) || 'n0', name: clean(a?.name, 18), x: xz(a?.x), z: xz(a?.z) }));
  const c = s.creature;
  return {
    t: clampInt(s.t, 0, 3600, 0), mode: s.mode === 'tdm' ? 'tdm' : 'ffa', B: clampInt(s.B, 20, 200, 84),
    strategy: STRATEGIES[s.strategy] ? s.strategy : 'guerrilla', team: ['A', 'H', 'solo'].includes(s.team) ? s.team : 'solo',
    world: { title: clean(w.title, 48), archetype: ARCH.includes(w.archetype) ? w.archetype : 'primeval_island', weather: clean(w.weather, 12), timeOfDay: clean(w.timeOfDay, 10) },
    squad, contacts, allies,
    creature: c ? { type: 'titan_ape', name: clean(c.name, 40), x: xz(c.x), z: xz(c.z), hp: clampInt(c.hp, 0, 100, 100) } : null,
    recent: (Array.isArray(s.recent) ? s.recent : []).slice(-4).map(r => clean(r, 100)),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Subagents not configured' });
  if (rateLimited(req, 30)) return res.status(429).json({ error: 'Subagent rate limited' });
  const snap = sanitize(readBody(req).snap);
  if (!snap.squad.length) return res.status(200).json({ intent: '', orders: [] });
  try {
    const out = await askClaude(subagentPrompt(snap), { model: MODEL, maxTokens: 1200 });
    if (!out) return res.status(502).json({ error: 'Subagent returned nothing' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out); // the browser runs normalizeSubOrders() on this
  } catch (e) {
    return res.status(502).json({ error: 'Subagent failed', status: e.status || 0 });
  }
}
