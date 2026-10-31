// Killhouse agents: the World Director (designs each level) and the Battle Commander
// (gives every NPC orders and radio lines during play). Pure functions, no DOM, so the
// same prompts run in the browser (Claude in claude.ai) and on the server (/api/*).

export const ARCHETYPES = {
  primeval_island: { label: 'Primeval island', terrain: 'island', kit: 'ruins', veg: 'jungle',
    weather: ['clear', 'rain', 'fog'], time: ['day', 'golden', 'dawn'], creature: ['titan_ape', 'titan_ape', 'sky_beasts'],
    sky: '#86b9e0', fog: '#a9c2b4', palette: { primary: '#4d6a37', secondary: '#7d6b52', accent: '#f2b84b', emissive: '#ffb347' } },
  vertical_pit: { label: 'Vertical pit', terrain: 'pit', kit: 'brutalist', veg: 'none',
    weather: ['clear', 'fog'], time: ['night'], creature: ['none', 'raptor_pack'],
    sky: '#05060a', fog: '#1a1714', palette: { primary: '#8b857c', secondary: '#4a4642', accent: '#ff3b2f', emissive: '#ffd9a0' } },
  neon_megacity: { label: 'Neon megacity', terrain: 'flat', kit: 'city', veg: 'none',
    weather: ['rain', 'storm', 'fog'], time: ['night', 'dusk'], creature: ['titan_ape', 'sky_beasts', 'none'],
    sky: '#120a24', fog: '#2a1840', palette: { primary: '#22252e', secondary: '#3a3f4d', accent: '#ff2e88', emissive: '#29e6ff' } },
  frozen_station: { label: 'Frozen station', terrain: 'hills', kit: 'modules', veg: 'tundra',
    weather: ['snow', 'fog', 'clear'], time: ['night', 'dawn', 'day'], creature: ['none', 'titan_ape', 'raptor_pack'],
    sky: '#9cc4e4', fog: '#c9d8e4', palette: { primary: '#e8eef2', secondary: '#9aa9b4', accent: '#ff6a2a', emissive: '#7fffd4' } },
  desert_colossi: { label: 'Desert of colossi', terrain: 'dunes', kit: 'colossi', veg: 'dead',
    weather: ['sandstorm', 'clear'], time: ['golden', 'dusk', 'day'], creature: ['raptor_pack', 'sky_beasts', 'none'],
    sky: '#e8b47a', fog: '#d9a76c', palette: { primary: '#d2a66a', secondary: '#9c7448', accent: '#ffdd8a', emissive: '#ffb347' } },
  volcanic_forge: { label: 'Volcanic forge', terrain: 'lava', kit: 'forge', veg: 'dead',
    weather: ['ash', 'storm'], time: ['night', 'dusk'], creature: ['raptor_pack', 'titan_ape'],
    sky: '#2a0d08', fog: '#3a1a12', palette: { primary: '#2b2422', secondary: '#4a3a33', accent: '#ff5a1f', emissive: '#ff7a1a' } },
  shadow_realm: { label: 'Shadow realm', terrain: 'hills', kit: 'inverted', veg: 'fungal',
    weather: ['spores', 'storm'], time: ['night'], creature: ['raptor_pack', 'titan_ape'],
    sky: '#0a0510', fog: '#2a0c18', palette: { primary: '#1d1a24', secondary: '#3b2236', accent: '#ff2a3a', emissive: '#ff3355' } },
  drowned_city: { label: 'Drowned city', terrain: 'flatwater', kit: 'drowned', veg: 'jungle',
    weather: ['rain', 'fog', 'clear'], time: ['dawn', 'day', 'dusk'], creature: ['titan_ape', 'sky_beasts', 'none'],
    sky: '#9fb3c2', fog: '#8fa6a8', palette: { primary: '#6f7d74', secondary: '#55615a', accent: '#5ff0c8', emissive: '#ffe08a' } },
};
export const WEATHERS = ['clear', 'rain', 'storm', 'snow', 'sandstorm', 'fog', 'ash', 'spores'];
export const TIMES = ['dawn', 'day', 'golden', 'dusk', 'night'];
export const CREATURES = ['none', 'titan_ape', 'raptor_pack', 'sky_beasts'];
export const EVENTS = ['titan_arrives', 'blackout', 'reinforcements', 'storm_surge', 'quake', 'supply_drop'];
export const ROLES = ['assault', 'sniper', 'support', 'flanker', 'berserker'];
export const MOODS = ['dread', 'epic', 'pulse', 'melancholy', 'tension'];
export const ACTIONS = ['engage', 'flank', 'cover', 'hunt', 'retreat', 'regroup', 'ambush', 'evade', 'hold', 'lure'];

// Attack strategies. Each squad of operators sharing a team and a strategy is run by its own subagent,
// and the same doctrine also tunes each NPC's local brain (range, speed, fire discipline, cover use).
export const STRATEGIES = {
  blitz: { label: 'Shock Assault', short: 'BLITZ', color: '#ff6b3d',
    doctrine: 'Close the distance fast and overwhelm the target with continuous fire. Rush across open ground, push right into the enemy, and only take cover when nearly dead.',
    range: 6, speed: 1.3, engage: 0.45, cover: -0.5, flank: 0, hunt: 0.35, ambush: -0.3, fireCd: 0.1, burst: [7, 12], spread: 1.25 },
  pincer: { label: 'Pincer', short: 'PINCER', color: '#ffc23d',
    doctrine: 'Split up and hit one target from two sides at once. Members circle wide on opposite flanks, then open fire together so the target cannot face both.',
    range: 14, speed: 1.1, engage: 0, cover: 0, flank: 0.55, hunt: 0.15, ambush: 0, fireCd: 0.12, burst: [4, 7], spread: 1 },
  overwatch: { label: 'Overwatch', short: 'OVERWATCH', color: '#7fd3ff',
    doctrine: 'Hold long sightlines from cover or high ground, fire slow precise shots, and relocate to a new perch after every hit or when spotted.',
    range: 42, speed: 0.9, engage: -0.1, cover: 0.45, flank: -0.3, hunt: -0.2, ambush: 0.2, fireCd: 0.75, burst: [1, 2], spread: 0.45, stillFire: true, relocateOnHit: 5 },
  ambush: { label: 'Ambush', short: 'AMBUSH', color: '#b98bff',
    doctrine: 'Hide on the route the enemy will take, stay crouched and silent, hold fire until the target is close, then unload everything at once.',
    range: 10, speed: 1, engage: -0.15, cover: 0.2, flank: -0.1, hunt: -0.3, ambush: 0.65, fireCd: 0.11, burst: [8, 14], spread: 1, holdFireBeyond: 22 },
  guerrilla: { label: 'Hit and Run', short: 'HIT&RUN', color: '#6bff9a',
    doctrine: 'Strike in short bursts of two to three seconds, then break line of sight and reposition before the enemy can answer. Never fight from the same spot twice.',
    range: 18, speed: 1.2, engage: 0.15, cover: 0.15, flank: 0.2, hunt: 0.1, ambush: 0, fireCd: 0.11, burst: [4, 7], spread: 1, engageWindow: 2.8, relocate: 4 },
  suppress: { label: 'Suppress and Advance', short: 'SUPPRESS', color: '#ff7ab8',
    doctrine: 'One member pins the target with sustained fire while the others advance under that cover, then they swap and leapfrog forward.',
    range: 24, speed: 1, engage: 0.1, cover: 0.1, flank: 0.15, hunt: 0.15, ambush: -0.2, fireCd: 0.075, burst: [12, 20], spread: 1.5, suppressor: true },
  beastlure: { label: 'Beast Baiters', short: 'BAIT', color: '#ffa24a',
    doctrine: 'Use the creature as a weapon. Draw it with gunfire, then run so its path goes through enemy positions, and stay out of its reach.',
    range: 20, speed: 1.15, engage: 0, cover: 0, flank: 0, hunt: 0.1, ambush: 0, fireCd: 0.12, burst: [3, 6], spread: 1, lure: 0.55 },
};
const ROLE_STRATEGY = { sniper: 'overwatch', flanker: 'pincer', berserker: 'blitz', support: 'suppress', assault: 'guerrilla' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (v !== null && v !== '' && v !== undefined && Number.isFinite(+v)) ? +v : d;
const str = (v, d, n = 160) => (typeof v === 'string' && v.trim()) ? v.trim().replace(/\s+/g, ' ').slice(0, n) : d;
const oneOf = (v, list, d) => { const s = String(v ?? '').toLowerCase().trim(); return list.includes(s) ? s : d; };
const hex = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim())) ? v.trim().toLowerCase() : null;
function rngFrom(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ===================== World Director ===================== */

export function directorPrompt(ctx) {
  const hist = (ctx.history || []).map((h, i) => `L${i + 1}: "${h.title}" (${h.archetype}, ${h.time}, ${h.weather}, creature ${h.creature}, threat ${h.rating}/10)`).join('; ');
  const p = ctx.perf;
  const perf = p ? `${p.won ? 'CLEARED' : 'FAILED (player killed)'}; kills ${p.kills}; accuracy ${Math.round(p.acc * 100)}%; time ${Math.round(p.time)}s; health left ${Math.round(p.hpLeftPct * 100)}%; threat was ${p.rating}/10` : 'none yet (first level)';
  const allies = ctx.mode === 'tdm' ? Math.floor(ctx.npcs / 2) : 0;
  return `You are the World Director agent for "Killhouse", a cinematic 3D first-person military shooter. Each level is staged like a different blockbuster film. Design ONE brand-new level.

Context:
- Level ${ctx.level} of ${ctx.total}. Mode: ${ctx.mode === 'tdm' ? `Team deathmatch: the player leads ${allies} allied operators against ${ctx.npcs - allies} hostiles` : `Free-for-all: ${ctx.npcs} operators, every one fighting everyone`}.
- Already played this campaign (do NOT reuse their archetype or title; make the mood and look clearly different): ${hist || 'none'}.
- Player's last mission: ${perf}.
- Variation seed: ${ctx.seed}.

World archetypes the engine can stage (pick one not used yet if possible):
primeval_island (giant jungle island, ancient ruins), vertical_pit (brutalist prison shaft with a central void plunging hundreds of levels down), neon_megacity (rain-soaked cyberpunk streets), frozen_station (polar research base under aurora), desert_colossi (dunes with half-buried colossal statues), volcanic_forge (lava rivers, iron foundry), shadow_realm (inverted nightmare dimension, floating ruins, red lightning), drowned_city (flooded ruined metropolis, overgrown).

Creatures: titan_ape (a colossal ape that attacks anyone near and is drawn to gunfire), raptor_pack (fast pack predators), sky_beasts (giant flyers circling overhead), none.
Scripted events (1-3, at 20-150 seconds): titan_arrives, blackout, reinforcements, storm_surge, quake, supply_drop. Only use titan_arrives if creature is titan_ape.

Difficulty: rise steadily with level number; ease off if the player failed or ended with low health; push harder if they dominated.

Cast: write exactly ${ctx.npcs} operators${ctx.mode === 'tdm' ? ` (the first ${allies} are the player's allies, the rest hostile)` : ''}. Give each a memorable callsign, a role (assault|sniper|support|flanker|berserker), an attack strategy (blitz|pincer|overwatch|ambush|guerrilla|suppress|beastlure; beastlure only if there is a titan_ape or raptor_pack), traits 0-1, a one-line bio and a quirk that shows in how they talk on the radio. Operators on the same side who share a strategy fight as one squad under their own tactical subagent, so use at least three different strategies and give most squads two or more members. All names and factions are original fiction.

Reply with only this JSON object (real values, no comments):
{"title":"FILM-STYLE TITLE","tagline":"poster tagline","logline":"2 sentences that set up the level like a movie","genre":"e.g. monster epic","archetype":"one of the archetypes","timeOfDay":"dawn|day|golden|dusk|night","weather":"clear|rain|storm|snow|sandstorm|fog|ash|spores","sky":{"sunElevation":25,"sunAzimuth":140,"turbidity":6,"tint":"#rrggbb"},"fog":{"color":"#rrggbb","density":0.4},"palette":{"primary":"#rrggbb","secondary":"#rrggbb","accent":"#rrggbb","emissive":"#rrggbb"},"landmark":"name of the set-piece landmark","pois":[{"x":0.3,"z":-0.5,"type":"bunker|tower|ruin|wreck|statue|crates"}],"creature":{"type":"titan_ape","name":"what locals call it","size":1.0,"temper":0.6},"events":[{"at":60,"type":"reinforcements","text":"short alert line"}],"factions":{"hostile":{"name":"","color":"#rrggbb"},"ally":{"name":"","color":"#rrggbb"}},"operators":[{"name":"","role":"assault","strategy":"pincer","aggression":0.6,"caution":0.4,"teamwork":0.5,"bio":"","quirk":""}],"music":{"mood":"dread|epic|pulse|melancholy|tension"},"density":{"vegetation":0.6,"structures":0.5,"cover":0.6},"difficulty":{"rating":3,"enemyAccuracy":0.45,"enemyReactionMs":600,"enemyHealth":100,"playerHealth":130,"aggression":0.5},"reasoning":"one sentence on the difficulty choice"}
Ranges: sunElevation -15..80 (negative is night), sunAzimuth 0..360, turbidity 1..20, fog density 0..1, poi x/z -0.85..0.85 (4-7 pois), creature size 0.7..1.5, temper 0..1, rating 1..10, enemyAccuracy 0.2..0.9, enemyReactionMs 180..900, enemyHealth 70..200, playerHealth 90..170.`;
}

const T1 = ['THE', 'BENEATH THE', 'BEYOND THE', 'NIGHT OF THE', 'RETURN TO THE', 'ASHES OF THE', 'SIEGE OF THE', 'LAST LIGHT OVER THE'];
const T2 = { primeval_island: ['SKULL TIDE', 'GREEN ABYSS', 'ISLAND OF TEETH', 'FIRST JUNGLE'], vertical_pit: ['DESCENT', 'HOLE', 'LEVEL 333', 'HUNGER SHAFT'], neon_megacity: ['NEON RAIN', 'GLASS CITY', 'CHROME SAINTS', 'MIDNIGHT GRID'],
  frozen_station: ['WHITEOUT', 'POLAR SIGNAL', 'LONG NIGHT', 'ICE DEAD'], desert_colossi: ['STONE KINGS', 'SAND GIANTS', 'DUST EMPIRE', 'SLEEPING GODS'], volcanic_forge: ['FURNACE', 'IRON CALDERA', 'MOLTEN CROWN', 'EMBER HOUND'],
  shadow_realm: ['OTHER SIDE', 'HOLLOW SKY', 'RED VEIL', 'UNDERNEATH'], drowned_city: ['SUNKEN CROWN', 'TIDEFALL', 'GREEN FLOOD', 'LOST HARBOR'] };
const TAGS = ['Every level down is a level closer to hell.', 'Something older than war is waking up.', 'Nobody walks out twice.', 'The storm is the least of it.', 'Trust no one. Not even the sky.', 'The city never sleeps. Neither will you.', 'Hold the line. Then hold your breath.', 'Born in fire. Settled in blood.'];
const NAMES = ['Viper', 'Rook', 'Havoc', 'Nomad', 'Kestrel', 'Brick', 'Saber', 'Jinx', 'Talon', 'Wraith', 'Echo', 'Bishop', 'Raven', 'Diesel', 'Onyx', 'Mako', 'Hex', 'Vandal', 'Cobalt', 'Dusk', 'Grim', 'Lark'];
const QUIRKS = ['quotes scripture under fire', 'counts every shot out loud', 'hums old jazz on the radio', 'never stops complaining about the weather', 'talks to their rifle', 'speaks in clipped two-word sentences', 'makes bad jokes when scared', 'calls everyone "kid"'];
const FACTIONS = [['Ashen Directorate', 'Wolfpack Reserve'], ['Black Meridian', 'Task Force Lantern'], ['Iron Choir', 'Ghostline Unit'], ['Crimson Syndicate', 'Northgate Rangers'], ['Hollow Order', 'Sable Company']];
const CREATURE_NAMES = { titan_ape: ['Old Thunder', 'the Mountain That Walks', 'Grey King', 'the Warden'], raptor_pack: ['the Sickle Pack', 'Night Runners', 'the Clatter'], sky_beasts: ['the Wardens Above', 'Shrike Flock', 'Stormwings'], none: [''] };

export function proceduralWorld(ctx) {
  const rng = rngFrom((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const pick = a => a[Math.floor(rng() * a.length)];
  const used = new Set((ctx.history || []).map(h => h.archetype));
  let keys = Object.keys(ARCHETYPES).filter(k => !used.has(k)); if (!keys.length) keys = Object.keys(ARCHETYPES);
  const archetype = pick(keys), A = ARCHETYPES[archetype];
  const t = ctx.total > 1 ? (ctx.level - 1) / (ctx.total - 1) : 0.45;
  let adj = 0, why = 'Opening level: the enemy is beatable while you learn the ground.';
  if (ctx.perf) {
    if (!ctx.perf.won) { adj = -0.12; why = 'You fell last time, so enemies react slower and aim worse here.'; }
    else if (ctx.perf.hpLeftPct > 0.6) { adj = 0.08; why = 'You won with health to spare, so the enemy is sharper and more aggressive.'; }
    else { adj = 0.02; why = 'A close win; difficulty climbs on the normal curve.'; }
  }
  const d = clamp(0.18 + 0.66 * t + adj, 0.08, 1);
  const timeOfDay = pick(A.time), weather = pick(A.weather);
  const creatureType = pick(A.creature);
  const [hostileName, allyName] = pick(FACTIONS);
  const names = NAMES.slice().sort(() => rng() - 0.5);
  const operators = Array.from({ length: ctx.npcs }, (_, i) => {
    const role = pick(ROLES);
    return { name: names[i % names.length] + (i >= names.length ? '-' + i : ''), role, strategy: ROLE_STRATEGY[role], aggression: +(0.3 + rng() * 0.6).toFixed(2), caution: +(0.2 + rng() * 0.6).toFixed(2), teamwork: +(0.2 + rng() * 0.7).toFixed(2),
      bio: `${role[0].toUpperCase() + role.slice(1)} with ${2 + Math.floor(rng() * 14)} years in the field.`, quirk: pick(QUIRKS) };
  });
  // form real squads: each side split into groups of 2-3 that share a strategy
  const allyN = ctx.mode === 'tdm' ? Math.floor(ctx.npcs / 2) : 0;
  const doctrines = ['pincer', 'overwatch', 'blitz', 'ambush', 'guerrilla', 'suppress'].sort(() => rng() - 0.5);
  if (['titan_ape', 'raptor_pack'].includes(creatureType)) doctrines.splice(1, 0, 'beastlure');
  let di = 0; const assign = (from, to) => { for (let i = from; i < to;) { const size = Math.min(to - i, to - i === 4 ? 2 : 2 + Math.floor(rng() * 2)); const st = doctrines[di++ % doctrines.length]; for (let k = 0; k < size; k++) operators[i++].strategy = st; } };
  assign(0, allyN); assign(allyN, operators.length);
  const events = [];
  if (creatureType === 'titan_ape' && rng() < 0.6) events.push({ at: Math.round(35 + rng() * 50), type: 'titan_arrives', text: 'Seismic contact. Something huge is coming.' });
  events.push({ at: Math.round(60 + rng() * 60), type: pick(['reinforcements', 'storm_surge', 'quake', 'supply_drop', 'blackout']), text: '' });
  const elev = timeOfDay === 'night' ? -8 : timeOfDay === 'dusk' ? 3 : timeOfDay === 'dawn' ? 6 : timeOfDay === 'golden' ? 10 : 45;
  return normalizeWorld({
    title: pick(T1) + ' ' + pick(T2[archetype]), tagline: pick(TAGS),
    logline: `${operators.length} operators drop into ${A.label.toLowerCase()} for a job nobody explained. ${creatureType !== 'none' ? 'They are not the deadliest thing out there.' : 'Only one side walks out.'}`,
    genre: archetype === 'primeval_island' ? 'monster epic' : archetype === 'vertical_pit' ? 'dystopian thriller' : archetype === 'neon_megacity' ? 'neon noir' : 'survival action',
    archetype, timeOfDay, weather,
    sky: { sunElevation: elev, sunAzimuth: Math.round(rng() * 360), turbidity: 3 + rng() * 8, tint: A.sky },
    fog: { color: A.fog, density: weather === 'fog' || weather === 'sandstorm' ? 0.75 : 0.35 + rng() * 0.2 },
    palette: A.palette, landmark: '',
    pois: Array.from({ length: 5 }, () => ({ x: (rng() - 0.5) * 1.5, z: (rng() - 0.5) * 1.5, type: pick(['bunker', 'tower', 'ruin', 'wreck', 'statue', 'crates']) })),
    creature: { type: creatureType, name: pick(CREATURE_NAMES[creatureType]), size: 0.9 + rng() * 0.4, temper: 0.4 + rng() * 0.5 },
    events, factions: { hostile: { name: hostileName, color: '#ff4a3a' }, ally: { name: allyName, color: '#4ab8ff' } }, operators,
    music: { mood: pick(MOODS) }, density: { vegetation: 0.4 + rng() * 0.5, structures: 0.4 + rng() * 0.5, cover: 0.5 + rng() * 0.4 },
    difficulty: { rating: Math.max(1, Math.round(d * 10)), enemyAccuracy: 0.28 + 0.5 * d, enemyReactionMs: Math.round(850 - 600 * d), enemyHealth: Math.round(75 + 90 * d), playerHealth: Math.round(160 - 50 * d), aggression: 0.25 + 0.6 * d },
    reasoning: why, seed: Math.floor(rng() * 1e9),
  }, ctx, true);
}

export function normalizeWorld(raw, ctx, isFallback = false) {
  const fb = isFallback ? null : proceduralWorld(ctx);
  const F = fb || raw;
  if (!raw || typeof raw !== 'object') return fb;
  const archetype = oneOf(raw.archetype, Object.keys(ARCHETYPES), F.archetype);
  const A = ARCHETYPES[archetype];
  const S = raw.sky || {}, Fg = raw.fog || {}, P = raw.palette || {}, D = raw.difficulty || {}, C = raw.creature || {}, De = raw.density || {};
  const fd = (fb && fb.difficulty) || {};
  const creatureType = oneOf(C.type, CREATURES, fb ? fb.creature.type : 'none');
  let ops = Array.isArray(raw.operators) ? raw.operators.slice(0, ctx.npcs) : [];
  const fbOps = fb ? fb.operators : [];
  const seen = new Set();
  ops = Array.from({ length: ctx.npcs }, (_, i) => {
    const o = ops[i] || {}, f = fbOps[i] || { name: 'Op-' + (i + 1), role: 'assault', aggression: 0.5, caution: 0.5, teamwork: 0.5, bio: '', quirk: '' };
    let name = str(o.name, f.name, 18); if (seen.has(name.toLowerCase())) name = name + '-' + (i + 1); seen.add(name.toLowerCase());
    return { name, role: oneOf(o.role, ROLES, f.role), strategy: oneOf(o.strategy, Object.keys(STRATEGIES), null), aggression: clamp(num(o.aggression, f.aggression), 0, 1), caution: clamp(num(o.caution, f.caution), 0, 1), teamwork: clamp(num(o.teamwork, f.teamwork), 0, 1),
      bio: str(o.bio, f.bio, 140), quirk: str(o.quirk, f.quirk, 90) };
  });
  { // fill missing strategies, drop beast-baiting with no beast, and make sure the cast mixes doctrines
    const pool = ['pincer', 'overwatch', 'blitz', 'ambush', 'guerrilla', 'suppress'];
    ops.forEach((o, i) => { if (!o.strategy || (o.strategy === 'beastlure' && !['titan_ape', 'raptor_pack'].includes(creatureType))) o.strategy = o.strategy && o.strategy !== 'beastlure' ? o.strategy : ROLE_STRATEGY[o.role] || pool[i % pool.length]; });
    const distinct = new Set(ops.map(o => o.strategy)).size, want = Math.min(3, Math.ceil(ops.length / 2));
    if (distinct < want) ops.forEach((o, i) => { o.strategy = pool[(i >> 1) % pool.length]; }); // pairs, varied
  }
  let events = Array.isArray(raw.events) ? raw.events.slice(0, 4).map(e => ({ at: clamp(num(e && e.at, 60), 15, 240), type: oneOf(e && e.type, EVENTS, null), text: str(e && e.text, '', 90) })).filter(e => e.type) : (fb ? fb.events : []);
  if (creatureType !== 'titan_ape') events = events.filter(e => e.type !== 'titan_arrives');
  const pois = Array.isArray(raw.pois) && raw.pois.length >= 2 ? raw.pois.slice(0, 8).map(p => ({ x: clamp(num(p && p.x, 0), -0.85, 0.85), z: clamp(num(p && p.z, 0), -0.85, 0.85), type: oneOf(p && p.type, ['bunker', 'tower', 'ruin', 'wreck', 'statue', 'crates'], 'crates') })) : (fb ? fb.pois : []);
  const fa = raw.factions || {};
  return {
    title: str(raw.title, F.title, 48).toUpperCase(), tagline: str(raw.tagline, F.tagline, 90), logline: str(raw.logline, F.logline, 320), genre: str(raw.genre, F.genre || 'action', 40),
    archetype, timeOfDay: oneOf(raw.timeOfDay, TIMES, F.timeOfDay), weather: oneOf(raw.weather, WEATHERS, F.weather),
    sky: { sunElevation: clamp(num(S.sunElevation, fb ? fb.sky.sunElevation : 30), -15, 80), sunAzimuth: ((num(S.sunAzimuth, fb ? fb.sky.sunAzimuth : 140) % 360) + 360) % 360, turbidity: clamp(num(S.turbidity, 6), 1, 20), tint: hex(S.tint) || A.sky },
    fog: { color: hex(Fg.color) || A.fog, density: clamp(num(Fg.density, 0.4), 0, 1) },
    palette: { primary: hex(P.primary) || A.palette.primary, secondary: hex(P.secondary) || A.palette.secondary, accent: hex(P.accent) || A.palette.accent, emissive: hex(P.emissive) || A.palette.emissive },
    landmark: str(raw.landmark, '', 60), pois,
    creature: { type: creatureType, name: str(C.name, fb ? fb.creature.name : 'the beast', 40), size: clamp(num(C.size, 1), 0.7, 1.5), temper: clamp(num(C.temper, 0.6), 0, 1) },
    events,
    factions: { hostile: { name: str(fa.hostile && fa.hostile.name, fb ? fb.factions.hostile.name : 'Hostiles', 32), color: hex(fa.hostile && fa.hostile.color) || '#ff4a3a' }, ally: { name: str(fa.ally && fa.ally.name, fb ? fb.factions.ally.name : 'Allies', 32), color: hex(fa.ally && fa.ally.color) || '#4ab8ff' } },
    operators: ops,
    music: { mood: oneOf(raw.music && raw.music.mood, MOODS, fb ? fb.music.mood : 'tension') },
    density: { vegetation: clamp(num(De.vegetation, 0.6), 0, 1), structures: clamp(num(De.structures, 0.5), 0, 1), cover: clamp(num(De.cover, 0.6), 0.2, 1) },
    difficulty: { rating: Math.round(clamp(num(D.rating, fd.rating ?? 5), 1, 10)), enemyAccuracy: clamp(num(D.enemyAccuracy, fd.enemyAccuracy ?? 0.5), 0.2, 0.9), enemyReactionMs: clamp(num(D.enemyReactionMs, fd.enemyReactionMs ?? 550), 180, 900),
      enemyHealth: Math.round(clamp(num(D.enemyHealth, fd.enemyHealth ?? 110), 70, 200)), playerHealth: Math.round(clamp(num(D.playerHealth, fd.playerHealth ?? 130), 90, 170)), aggression: clamp(num(D.aggression, fd.aggression ?? 0.5), 0, 1) },
    reasoning: str(raw.reasoning, F.reasoning || '', 220),
    seed: Math.floor(num(raw.seed, Math.random() * 1e9)) >>> 0,
  };
}

/* ===================== Battle Commander ===================== */
// snapshot: {t, world:{title, archetype, weather, timeOfDay}, mode, player:{x,z,hp,lastSeenBy:[ids]}, npcs:[{id,name,role,team,x,z,hp,ammo,morale,sees:[ids],quirk}], creature:{type,name,x,z,hp}|null, recent:[strings]}
export function commanderPrompt(snap) {
  return `You are the Battle Commander agent in "Killhouse", a cinematic 3D shooter titled "${snap.world.title}" (${snap.world.archetype.replace('_', ' ')}, ${snap.world.timeOfDay}, ${snap.world.weather}). Every ~20 seconds you read the battlefield and give each NPC operator a tactical order plus one short radio line in their own voice. ${snap.mode === 'tdm' ? 'Teams: "A" is the player\'s squad, "H" is hostile.' : 'Free-for-all: every operator is on their own team and fights everyone, including the player.'}

Battlefield at t=${Math.round(snap.t)}s (metres; x east, z south; map spans about -90..90):
PLAYER (callsign ${snap.player.name}, team A): pos (${snap.player.x},${snap.player.z}), hp ${snap.player.hp}%.
${snap.creature ? `CREATURE ${snap.creature.type} "${snap.creature.name}": pos (${snap.creature.x},${snap.creature.z}), hp ${snap.creature.hp}%. It attacks anyone near and is drawn to gunfire.` : 'No creature active.'}
OPERATORS:
${snap.npcs.map(n => `${n.id} ${n.name} [${n.role}, team ${n.team}] pos (${n.x},${n.z}) hp ${n.hp}% ammo ${n.ammo}% morale ${n.morale}% sees ${n.sees.length ? n.sees.join(',') : 'nobody'}; quirk: ${n.quirk}`).join('\n')}
Recent: ${snap.recent.length ? snap.recent.join(' | ') : 'quiet'}

Actions: engage (attack target), flank (circle to target's side), cover (hide from target, peek and shoot), hunt (move to target's last known position), retreat (fall back and recover), regroup (move to nearest teammates), ambush (hold a spot near target's path and wait), evade (get away from the creature), hold (stay put, guard).
Targets: "player", an operator id like "n3", "creature", or null.
Think like a smart squad leader: use roles (snipers hold far, flankers flank, berserkers rush), protect wounded units, exploit the creature (lure it onto enemies), and never send everyone the same way.

Reply with only JSON: {"orders":[{"id":"n0","action":"flank","target":"player","say":"radio line under 12 words, in character"}],"narration":"optional one-line trailer-voice comment"}`;
}

export function normalizeOrders(raw, snap) {
  const ids = new Set(snap.npcs.map(n => n.id));
  const validTarget = t => t === 'player' || t === 'creature' || ids.has(t) ? t : null;
  const orders = Array.isArray(raw && raw.orders) ? raw.orders : [];
  const out = [];
  for (const o of orders) {
    if (!o || !ids.has(o.id)) continue;
    out.push({ id: o.id, action: oneOf(o.action, ACTIONS, 'hold'), target: validTarget(o.target), say: str(o.say, '', 90) });
  }
  return { orders: out, narration: str(raw && raw.narration, '', 120) };
}

const BARKS = {
  engage: ['Contact front, engaging!', 'Eyes on target. Lighting them up.', 'Weapons free.'],
  flank: ['Moving to flank. Keep them busy.', 'Going wide, cover me.', 'Swinging round the side.'],
  cover: ['Taking cover!', 'Too hot, getting low.', 'Pinned. Need a second.'],
  hunt: ['Lost visual. Tracking last position.', 'They went this way. Pushing.', 'Hunting.'],
  retreat: ['I\'m hit bad, falling back!', 'Breaking contact!', 'Need to patch up. Pulling out.'],
  regroup: ['Regrouping on you.', 'Stack up, stack up.', 'Coming to you.'],
  ambush: ['Setting up. They\'ll walk right into it.', 'Quiet now. Let them come.', 'Holding the angle.'],
  evade: ['That thing is coming, move!', 'Big contact! Get clear!', 'Don\'t draw its eye!'],
  hold: ['Holding here.', 'Position locked.', 'Watching my sector.'],
};
// Heuristic commander used when no AI is reachable: still role- and situation-aware.
export function offlineCommander(snap) {
  const orders = snap.npcs.map(n => {
    let action = 'hunt', target = null;
    const creatureNear = snap.creature && Math.hypot(snap.creature.x - n.x, snap.creature.z - n.z) < 30;
    const foes = snap.mode === 'tdm' ? (n.team === 'A' ? snap.npcs.filter(o => o.team === 'H').map(o => o.id) : ['player', ...snap.npcs.filter(o => o.team === 'A').map(o => o.id)]) : ['player', ...snap.npcs.filter(o => o.id !== n.id).map(o => o.id)];
    const seen = n.sees.filter(s => foes.includes(s));
    if (creatureNear) action = 'evade';
    else if (n.hp < 30) action = 'retreat';
    else if (seen.length) {
      target = seen[0];
      action = n.role === 'flanker' ? 'flank' : n.role === 'sniper' ? 'cover' : n.role === 'support' && Math.random() < 0.4 ? 'cover' : 'engage';
    } else {
      target = foes[Math.floor(Math.random() * foes.length)] || null;
      action = n.role === 'sniper' ? 'ambush' : n.role === 'support' ? 'regroup' : 'hunt';
    }
    const lines = BARKS[action];
    return { id: n.id, action, target, say: Math.random() < 0.45 ? lines[Math.floor(Math.random() * lines.length)] : '' };
  });
  return { orders, narration: '' };
}
export function bark(action) { const l = BARKS[action] || BARKS.hold; return l[Math.floor(Math.random() * l.length)]; }


/* ===================== Strategy subagents ===================== */
// snap: {t, mode, B, world:{title,archetype,weather,timeOfDay}, strategy, team, creature:{type,name,x,z,hp}|null,
//        squad:[{id,name,role,x,z,hp,ammo,morale,action,quirk}], contacts:[{id,kind,name,x,z,ageS}], allies:[{id,name,x,z}], recent:[]}
export function subagentPrompt(snap) {
  const S = STRATEGIES[snap.strategy] || STRATEGIES.guerrilla;
  const side = snap.mode === 'tdm' ? (snap.team === 'A' ? "the player's squad (team A)" : 'the hostile team (team H)') : 'a free-for-all; your operators are rivals who each fight alone, but all follow your doctrine';
  return `You are the "${S.label}" tactical subagent in "Killhouse", a 3D shooter level titled "${snap.world.title}" (${snap.world.archetype.replace('_', ' ')}, ${snap.world.timeOfDay}, ${snap.world.weather}). You fight for ${side}.
Your doctrine: ${S.doctrine}

Map: x and z run from -${snap.B} to ${snap.B} metres. Time ${Math.round(snap.t)}s.
YOUR OPERATORS (you command only these):
${snap.squad.map(m => `${m.id} ${m.name} [${m.role}] at (${m.x},${m.z}) hp ${m.hp}% ammo ${m.ammo}% morale ${m.morale}% doing ${m.action}; voice: ${m.quirk}`).join('\n')}
${snap.allies.length ? `FRIENDLY UNITS (not yours): ${snap.allies.map(a => `${a.name} (${a.x},${a.z})`).join(', ')}` : ''}
WHAT YOUR SQUAD KNOWS ABOUT ENEMIES (last seen positions; may be stale):
${snap.contacts.length ? snap.contacts.map(c => `${c.id} ${c.name} [${c.kind}] at (${c.x},${c.z}), seen ${c.ageS}s ago`).join('\n') : 'No contacts. Search where enemies are likely to be.'}
${snap.creature ? `CREATURE ${snap.creature.type} "${snap.creature.name}" at (${snap.creature.x},${snap.creature.z}), hp ${snap.creature.hp}%. It attacks whoever is nearest and is drawn to gunfire.` : ''}
Recent: ${snap.recent.length ? snap.recent.join(' | ') : 'quiet'}

Apply your doctrine to this exact situation. Give every operator one order and place them precisely with moveTo (a flank point, ambush spot, sniper perch, fallback position or rush target).
Actions: engage, flank, cover, hunt, retreat, regroup, ambush, evade, hold${snap.creature ? ', lure (drag the creature onto enemies)' : ''}.
Targets: a contact id from the list above, "creature", or null.

Reply with only JSON: {"intent":"one short line describing the squad's plan","orders":[{"id":"${snap.squad[0] ? snap.squad[0].id : 'n0'}","action":"flank","target":"player","moveTo":{"x":0,"z":0},"say":"radio line under 12 words, in that operator's voice"}]}`;
}

export function normalizeSubOrders(raw, snap) {
  const mine = new Set(snap.squad.map(m => m.id)), contacts = new Set(snap.contacts.map(c => c.id));
  const B = snap.B || 84;
  const orders = [];
  for (const o of (Array.isArray(raw && raw.orders) ? raw.orders : [])) {
    if (!o || !mine.has(o.id)) continue;
    const t = o.target === 'creature' || contacts.has(o.target) ? o.target : null;
    const mt = o.moveTo && Number.isFinite(+o.moveTo.x) && Number.isFinite(+o.moveTo.z) ? { x: clamp(+o.moveTo.x, -B, B), z: clamp(+o.moveTo.z, -B, B) } : null;
    let action = oneOf(o.action, ACTIONS, 'hold'); if (action === 'lure' && !snap.creature) action = 'engage';
    orders.push({ id: o.id, action, target: t, moveTo: mt, say: str(o.say, '', 90) });
  }
  return { orders, intent: str(raw && raw.intent, '', 110) };
}

const SUB_LINES = {
  blitz: ['Go go go! Straight down their throat!', 'Charging! Keep firing!', 'No cover, no mercy. Move!'],
  pincer: ['Taking the left side.', 'Swinging right. Wait for my mark.', 'In position. Hit them together!'],
  overwatch: ['Glass on target. Sending.', 'Relocating to a new perch.', 'I have the long angle. Hold still.'],
  ambush: ['Nobody fire. Let them walk in.', 'Holding. Not yet...', 'Now! Light them up!'],
  guerrilla: ['Hit them and fade!', 'Burst and move, burst and move.', 'Breaking contact. New angle.'],
  suppress: ['Keep their heads down!', 'Suppressing! Move up, move up!', 'Covering fire, go!'],
  beastlure: ['Wake the big one up!', 'Run it into their lines!', 'Got its attention. Moving!'],
};
// Offline subagent: the same doctrines as deterministic geometry, so squads still fight differently without an AI.
export function offlineSubagent(snap) {
  const st = snap.strategy, B = snap.B || 84, sq = snap.squad; if (!sq.length) return { orders: [], intent: '' };
  const cx = sq.reduce((a, m) => a + m.x, 0) / sq.length, cz = sq.reduce((a, m) => a + m.z, 0) / sq.length;
  const foes = snap.contacts.filter(c => c.kind !== 'creature');
  const tgt = foes.slice().sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0] || null;
  const P = (x, z) => ({ x: clamp(Math.round(x), -B, B), z: clamp(Math.round(z), -B, B) });
  const line = () => { const l = SUB_LINES[st] || SUB_LINES.guerrilla; return Math.random() < 0.5 ? l[Math.floor(Math.random() * l.length)] : ''; };
  if (!tgt) return { intent: 'No contacts. Sweeping toward the centre.', orders: sq.map((m, i) => ({ id: m.id, action: 'hunt', target: null, moveTo: P(m.x * 0.4 + (i - sq.length / 2) * 8, m.z * 0.4), say: i === 0 ? line() : '' })) };
  const dx = tgt.x - cx, dz = tgt.z - cz, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, px = -uz, pz = ux;
  const half = Math.floor(snap.t / 8) % 2;
  const orders = sq.map((m, i) => {
    let action = 'engage', moveTo = P(tgt.x, tgt.z);
    if (st === 'pincer') { const side = i % 2 ? 1 : -1; action = 'flank'; moveTo = P(tgt.x + px * 16 * side - ux * 4, tgt.z + pz * 16 * side - uz * 4); }
    else if (st === 'overwatch') { action = 'cover'; const r = Math.min(40, Math.max(28, L)); moveTo = P(tgt.x - ux * r + px * (i - sq.length / 2) * 10, tgt.z - uz * r + pz * (i - sq.length / 2) * 10); }
    else if (st === 'ambush') { action = 'ambush'; moveTo = P(cx + ux * L * 0.35 + px * (i % 2 ? 7 : -7), cz + uz * L * 0.35 + pz * (i % 2 ? 7 : -7)); }
    else if (st === 'guerrilla') { action = half ? 'engage' : 'cover'; moveTo = half ? P(tgt.x - ux * 18 + px * 10 * (i % 2 ? 1 : -1), tgt.z - uz * 18 + pz * 10 * (i % 2 ? 1 : -1)) : P(m.x + px * 14 * (i % 2 ? 1 : -1), m.z + pz * 14 * (i % 2 ? 1 : -1)); }
    else if (st === 'suppress') { const lead = (i + Math.floor(snap.t / 10)) % sq.length === 0; action = lead ? 'hold' : 'flank'; moveTo = lead ? P(m.x, m.z) : P(tgt.x - ux * 10 + px * 8 * (i % 2 ? 1 : -1), tgt.z - uz * 10 + pz * 8 * (i % 2 ? 1 : -1)); }
    else if (st === 'beastlure' && snap.creature) { action = 'lure'; const kx = tgt.x - snap.creature.x, kz = tgt.z - snap.creature.z, kl = Math.hypot(kx, kz) || 1; moveTo = P(tgt.x + kx / kl * 14, tgt.z + kz / kl * 14); }
    if (m.hp < 25 && st !== 'blitz') { action = 'retreat'; moveTo = P(m.x - ux * 20, m.z - uz * 20); }
    return { id: m.id, action, target: tgt.id, moveTo, say: i === 0 || Math.random() < 0.25 ? line() : '' };
  });
  const intent = { blitz: `Rushing ${tgt.name} head-on.`, pincer: `Closing on ${tgt.name} from both sides.`, overwatch: `Covering ${tgt.name}'s approach from long range.`, ambush: `Lying in wait on ${tgt.name}'s route.`,
    guerrilla: half ? `Striking ${tgt.name}, then fading.` : 'Breaking contact to reposition.', suppress: `Pinning ${tgt.name} while the rest advance.`, beastlure: snap.creature ? `Dragging ${snap.creature.name} onto ${tgt.name}.` : `Pressing ${tgt.name}.` }[st] || '';
  return { orders, intent };
}
