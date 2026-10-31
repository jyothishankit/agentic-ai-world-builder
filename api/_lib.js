// Shared helpers for the agent endpoints: input sanitizing, Claude call, tolerant JSON parse, rate limit.
export const clampInt = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
export const clampNum = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
export const clean = (s, n = 60) => String(s ?? '').replace(/[^\p{L}\p{N} .,'!?:\-/"]/gu, '').slice(0, n);

const hits = new Map(); // best-effort per-instance limiter; use Upstash/Redis for a shared one
export function rateLimited(req, max, windowMs = 60_000) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) return true;
  recent.push(now); hits.set(ip, recent); return false;
}

export function readBody(req) {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
}

export function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

export async function askClaude(prompt, { model, maxTokens }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw Object.assign(new Error('upstream ' + r.status), { status: r.status });
  const data = await r.json();
  return parseJSON((data.content || []).map(b => b.text || '').join(''));
}
