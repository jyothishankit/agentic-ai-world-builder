// World Director endpoint.
// GET  /api/director        -> {ok, model}  (the game checks this to know a live director exists)
// POST /api/director {ctx}  -> {level}      (raw world spec; the browser validates and clamps every field)
import { directorPrompt } from '../public/agents.js';
import { clampInt, clampNum, clean, rateLimited, readBody, askClaude } from './_lib.js';

const MODEL = process.env.DIRECTOR_MODEL || 'claude-sonnet-5-5';
const ARCH = ['primeval_island', 'vertical_pit', 'neon_megacity', 'frozen_station', 'desert_colossi', 'volcanic_forge', 'shadow_realm', 'drowned_city'];

// Rebuild the context from bounded values; never forward free text from the client into the prompt.
function sanitize(ctx = {}) {
  const history = Array.isArray(ctx.history) ? ctx.history.slice(-10).map(h => ({
    title: clean(h?.title, 48), archetype: ARCH.includes(h?.archetype) ? h.archetype : 'primeval_island', time: clean(h?.time, 10),
    weather: clean(h?.weather, 12), creature: clean(h?.creature, 14), rating: clampInt(h?.rating, 1, 10, 5),
  })) : [];
  const p = ctx.perf;
  const perf = p && typeof p === 'object' ? { won: !!p.won, kills: clampInt(p.kills, 0, 99, 0), acc: clampNum(p.acc, 0, 1, 0), time: clampInt(p.time, 0, 3600, 0), hpLeftPct: clampNum(p.hpLeftPct, 0, 1, 0), rating: clampInt(p.rating, 1, 10, 5) } : null;
  return { level: clampInt(ctx.level, 1, 10, 1), total: clampInt(ctx.total, 1, 10, 3), npcs: clampInt(ctx.npcs, 1, 16, 6), mode: ctx.mode === 'tdm' ? 'tdm' : 'ffa', history, perf, seed: clean(ctx.seed, 16) || Math.random().toString(36).slice(2, 8) };
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: !!process.env.ANTHROPIC_API_KEY, model: MODEL });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Director not configured' });
  if (rateLimited(req, 6)) return res.status(429).json({ error: 'Too many levels requested; wait a minute.' });
  try {
    const level = await askClaude(directorPrompt(sanitize(readBody(req).ctx)), { model: MODEL, maxTokens: 4000 });
    if (!level) return res.status(502).json({ error: 'Director returned no level' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ level });
  } catch (e) {
    return res.status(502).json({ error: 'Director failed', status: e.status || 0 });
  }
}
