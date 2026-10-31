# Killhouse: an agentic AI world builder

Demo link: https://www.youtube.com/watch?v=X0oEfGyjB8Y

A cinematic, first-person 3D shooter in the browser (three.js / WebGL). Every level is staged like a different film, and three layers of AI run it:

| Agent | Runs | What it decides |
|---|---|---|
| **World Director** | once per level (`/api/director`) | Film title, tagline, logline and genre; one of 8 world archetypes; sun position, sky tint, fog, weather and time of day; colour palette; landmark and points of interest; the creature (titan ape, raptor pack, sky beasts); 1–3 scripted mid-level events; a named cast of NPCs with role, traits, bio and radio quirk; soundtrack mood; difficulty, adapted to how you played the last level |
| **Strategy subagents** | one per squad, every ~16–24 s during play (`/api/subagent`) | Operators on the same side who share an attack strategy form a squad, and each squad has its own Claude subagent playing that doctrine. It sees only what its own squad has perceived (last-known enemy positions, allies, the creature) and returns, per operator, an action, a target, an exact `moveTo` position (flank point, ambush spot, sniper perch) and a radio line in that operator's voice |
| **NPC brains** | every frame, in the browser | Each operator perceives (field of view, line of sight, hearing gunfire), keeps a memory of enemy positions, shares callouts with teammates, scores actions with utility AI shaped by its squad's doctrine and biased by the subagent's latest order, finds cover, plans A* paths around obstacles, peeks, reloads, heals and loses morale when allies fall |

### Attack strategies

The director assigns every operator a strategy. Each one is both a Claude subagent prompt and a set of local brain modifiers, so squads fight differently even when Claude is offline.

| Strategy | Doctrine | How the NPC brain changes |
|---|---|---|
| **Shock Assault** (`blitz`) | Close fast and overwhelm with continuous fire | 6 m engage range, 1.3× speed, long bursts, ignores cover until nearly dead |
| **Pincer** (`pincer`) | Hit one target from two sides at once | Squad members flank on opposite sides (by squad index), then converge |
| **Overwatch** (`overwatch`) | Long sightlines from cover, slow precise shots | 42 m range, fires only when stationary, tight spread, relocates after every hit |
| **Ambush** (`ambush`) | Hide on the enemy's route and hold fire | Crouched and silent; won't fire beyond 22 m until sprung, then unloads |
| **Hit and Run** (`guerrilla`) | Strike for 2–3 s, then break line of sight | Engagement timer forces relocation and holds fire while repositioning |
| **Suppress and Advance** (`suppress`) | One pins the target while the rest advance | Rotating suppressor with sustained, wide fire; the others flank forward |
| **Beast Baiters** (`beastlure`) | Use the creature as a weapon | Tags the titan from range, then runs so its path crosses enemy positions |

### The eight worlds

`primeval_island` (jungle island, stepped temple, titan ape) · `vertical_pit` (brutalist prison shaft with a feast platform travelling the void) · `neon_megacity` (rain-soaked streets, neon, holo billboards) · `frozen_station` (polar base under an aurora) · `desert_colossi` (dunes, colossal statues, sandstorms) · `volcanic_forge` (lava rivers, iron towers) · `shadow_realm` (inverted floating city, tendrils, red lightning) · `drowned_city` (flooded ruins, colossal torch-bearer)

Rendering: physically based materials, an atmospheric sky (or a starfield at night), image-based lighting, soft shadows, exponential fog, ACES tone mapping and bloom. Particle weather (rain, snow, sand, ash, spores), lightning, aurora shaders and animated lava/water, plus a procedural score and positional sound effects.

## Agentic workflow

A campaign is a loop of three stages. Claude makes two kinds of decisions: the **World Director** designs each level and assigns every operator an attack strategy, and a **strategy subagent per squad** plans that squad's attack every ~16–24 seconds, using only what its own members have seen. Each NPC's brain runs every frame in the browser, shaped by its doctrine and biased by its subagent's orders. Every agent output passes through a validator (`normalizeWorld`, `normalizeSubOrders`) before it can affect the game, and each agent has an offline fallback.

```mermaid
flowchart TB
    START(["Player picks NPC count, levels, mode"]) --> CTX

    subgraph PRE["1 · Before each level"]
        direction TB
        CTX["Campaign context<br/>level, history, last-mission stats, seed"] --> DIR{{"World Director agent<br/>Claude"}}
        DIR -->|world spec JSON| NW["normalizeWorld()<br/>validate + clamp every field"]
        DIR -. unavailable .-> OFF1["Offline director<br/>procedural spec"] --> NW
        NW --> WB["World builder<br/>terrain, sky, light, weather,<br/>structures, colliders, nav grid"]
        WB --> POS["Film-poster briefing + spawn<br/>cast, creature, events"]
    end

    POS --> PER

    subgraph MATCH["2 · During the match"]
        direction TB
        subgraph BRAIN["Each NPC brain · every frame"]
            direction LR
            PER["Perceive<br/>sight, hearing"] --> MEM["Remember<br/>last-known enemies,<br/>team callouts"] --> DEC["Decide<br/>utility AI"] --> ACT["Act<br/>A* path, cover,<br/>aim, fire"]
        end
        ACT --> WS["World state<br/>health, kills, creature,<br/>scripted events"]
        WS --> PER
        WS -->|"each squad's own view<br/>every ~16-24 s"| SUB{{"Strategy subagents · Claude<br/>one per squad: blitz, pincer, overwatch,<br/>ambush, hit and run, suppress, beast bait"}}
        SUB -->|"orders, moveTo positions,<br/>radio lines"| NO["normalizeSubOrders()"]
        SUB -. unavailable .-> OFF2["Offline doctrine<br/>same strategy as geometry"] --> NO
        NO -->|order biases decisions| DEC
        DOC["Doctrine modifiers<br/>range, speed, fire discipline,<br/>bursts, cover, relocation"] --> DEC
    end

    WS --> END{"Level over?"}
    subgraph POST["3 · After the level"]
        direction TB
        END -->|won or lost| STATS["Debrief stats<br/>kills, accuracy, time, health left"]
        STATS --> NEXT(["Next level: stats + history<br/>become the director's new context"])
    end
```

### Where the Claude calls go

Inside claude.ai the game calls Claude on the viewer's own account. On a Vercel deploy it calls your `/api` functions, which call the Anthropic API with your key. With neither available, the offline agents take over.

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser game
    participant C as Claude in claude.ai
    participant S as Your server /api
    participant A as Anthropic API
    Note over B: At load: Claude in claude.ai, else your server, else offline agents
    alt opened as a claude.ai artifact
        B->>C: directorPrompt(ctx)
        C-->>B: world spec JSON
    else deployed on Vercel
        B->>S: POST /api/director {ctx}
        S->>S: sanitize, rate limit
        S->>A: Messages API, DIRECTOR_MODEL
        A-->>S: world spec JSON
        S-->>B: {level}
    end
    B->>B: normalizeWorld, build 3D world, play
    loop each squad, staggered, every ~16-24 s of play
        alt claude.ai artifact
            B->>C: subagentPrompt(squad view, doctrine)
            C-->>B: intent + orders JSON
        else Vercel deploy
            B->>S: POST /api/subagent {squad view}
            S->>A: Messages API, SUBAGENT_MODEL
            A-->>S: intent + orders JSON
            S-->>B: {intent, orders}
        end
        B->>B: normalizeSubOrders, move squad to positions, radio lines
    end
    B->>B: level ends, stats feed the next director call
```

## Architecture

```
public/
  index.html   UI shell: menu, film-poster briefing, intro, HUD
  game.js      renderer, player, NPC brains, creatures, combat, audio, agent clients
  world.js     turns a world spec into a lit 3D level + colliders + nav grid
  agents.js    director + strategy subagent prompts, validators, offline fallbacks (shared with the server)
api/
  director.js  POST {ctx}  -> {level}
  subagent.js  POST {snap} -> {intent, orders}   (one squad, one doctrine)
  _lib.js      sanitizing, rate limiting, Anthropic call, tolerant JSON parse
```

The browser picks an agent backend at runtime: **Claude inside claude.ai** (when opened as a claude.ai artifact) → **your server** (`GET /api/director` returns `{ok:true}`) → **offline agents** (procedural director + geometric doctrine for each squad), so the game never breaks. Every value an agent returns is validated and clamped (`normalizeWorld`, `normalizeOrders`) before it touches the game.

No build step. three.js loads from jsDelivr through an import map.

## Deploy to a production URL (Vercel)

1. **Get an API key.** Create one at https://console.anthropic.com and set a monthly spend limit there.
2. **Push to GitHub.**
   ```bash
   git add . && git commit -m "Killhouse 3D: AI director, commander and agentic NPCs"
   git branch -M main
   git remote add origin git@github.com:<you>/agentic-ai-world-builder.git   # skip if it already exists
   git push -u origin main
   ```
3. **Import into Vercel.** At https://vercel.com/new, import the repo. Framework preset: **Other**. Leave the build command empty. Vercel serves `public/` and turns `api/*.js` into serverless functions (files starting with `_` are not routes).
4. **Set environment variables** (Project → Settings → Environment Variables), then redeploy:
   - `ANTHROPIC_API_KEY` (required)
   - `DIRECTOR_MODEL` (optional, default `claude-sonnet-5-5`; richer worlds)
   - `SUBAGENT_MODEL` (optional, default `claude-haiku-5-5`; fast squad tactics)
5. **Verify.** `https://<project>.vercel.app/api/director` should return `{"ok":true,...}`, and the game menu should say *"Agents online: Claude via the game server"*.
6. **Custom domain** (optional): Project → Settings → Domains.

Local development: `cp .env.example .env.local`, add your key, run `npx vercel dev`, then open http://localhost:3000.

### Costs and limits

One director call per level (~3–4k output tokens) plus one subagent call per squad every ~16–24 s of play (~1k tokens each; with 4 squads that is roughly 10–15 calls a minute). Subagent calls are spaced at least 3.5 s apart and back off for 45 s when rate-limited, falling back to the offline doctrine. The built-in limiter allows 6 levels and 30 subagent turns per minute per IP, per instance. For real traffic, swap it for Upstash Redis (`@upstash/ratelimit`) or Vercel Firewall rules.

## Next steps

- **Real multiplayer:** add a WebSocket room server (PartyKit, Colyseus, or a small Node + `ws` service on Fly.io/Render) so several humans share one director-built world, with the NPC brains running on the server.
- **Leaderboards:** Vercel KV or Supabase keyed by world seed.
- **Asset upgrade:** swap the procedural meshes for glTF models (e.g. CC0 packs from Quaternius or Kenney) loaded with `GLTFLoader`; the director keeps choosing which kit to stage.
- **Director tool use:** expose `spawn_wave`, `move_creature` and `trigger_event` as tools so the director keeps directing live during play, not just at the start.

## Controls

WASD move · mouse look · left click fire · right click aim down sights · Shift sprint · C crouch · Space jump · R reload · Esc pause.
Touch: left thumb moves, right thumb looks, on-screen fire / aim / reload / jump buttons.
