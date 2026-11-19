# Costa Serena — a 3D open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dodcoin/gta6-01-v5-repo/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dodcoin/gta6-01-v5-repo/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Costa Serena** is an original 3D open-world crime game that runs entirely in the
browser — no build step, no downloads, no network. You arrive in a sun-soaked tropical
island city with $120, a borrowed pair of shoes and a phone number: **Marina Sol**, a
fixer who always needs one more favour. Steal the car, run the package, clear the pier,
rob the casino van and lose the heat. Then keep the money moving with side gigs.

The city is a deterministic procedural build (seeded, default seed 7): a 600×600 m grid
of streets and blocks with painted-canvas roads and facades, palm trees, street lamps,
beach umbrellas, a beach and animated water on the east shore, the docks in the
north-east, a police station, a hospital and a neon-crowned beachfront casino — all of
it lit like the last hour of a very good day.

## What's in the game

- **On foot & behind the wheel** — a low-poly character with WASD + mouse-orbit camera,
  sprinting, building/car collision; walk up to any car and press **E** to steal it,
  from parked kerbside sedans to moving traffic (the driver objects) to police cars.
- **Arcade driving** — acceleration, braking/reverse, speed-sensitive steering and a
  handbrake, with a smooth chase camera and a km/h readout.
- **Living traffic** — AI cars keep their lane on the street grid, turn at
  intersections, brake for obstacles, and panic when the shooting starts.
- **Pedestrians** — sidewalk strollers who flee gunfire and kerb-mounting cars, and go
  down (ragdoll-lite: tip over, fade, respawn across town) when hit.
- **Wanted system** — 0–5 stars. Theft, crashes, hit-and-runs and gunfire raise it
  (witnessed crimes count in full); break line of sight and stay hidden and it decays.
- **Police** — patrol cars spawn at the city edge with flashing light bars and sirens,
  ram and pursue, drop officers who chase you on foot and fill the **BUSTED** meter,
  and open fire at 3+ stars. Get busted and you pay a fine at the station; get wasted
  and you wake up at Serena General with a hospital bill.
- **Combat** — a hitscan pistol with tracers, muzzle flash and headshots; guards and
  officers shoot back.
- **A four-mission story** from Marina Sol, with gold pillar objective markers and a
  minimap blip: *First Wheels*, *Hot Package* (timed, rising heat), *Dockside Trouble*
  (a pier firefight) and *Getaway* (rob the casino van, lose four stars) — plus
  repeatable side gigs (press **G** when offered) between and after story missions.
- **Full HUD** — health bar, cash, wanted stars, circular minimap (roads, traffic,
  flashing police blips, objective diamond), objective line, contextual prompts,
  mission banners, phone-message toasts, mission timer, BUSTED meter.
- **Procedural audio** — everything is synthesized WebAudio: engine hum tied to speed,
  police sirens, gunshots, crashes, chimes, a mission jingle and a lazy pentatonic
  ambient loop. **M** mutes.
- **Saving** — cash, story progress and position persist in `localStorage`; the title
  screen offers Continue, and New Game wipes the slate.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | Move / drive |
| Mouse (click game to lock) | Orbit camera |
| Shift | Run |
| E | Enter / exit car |
| Right mouse | Aim pistol |
| Left click or F | Shoot |
| Space | Handbrake |
| G | Take the offered side gig |
| P / Esc | Pause |
| M | Mute |

## Run it locally

```sh
node serve.ts
```

then open <http://localhost:8080>. That's the whole setup — the game is static files
under `game/`, with three.js vendored at `game/vendor/three.module.min.js` and loaded
through an import map, so it also works opened straight from any static file server,
fully offline.

Append `?seed=N` to the URL for a different city layout, and `?shot=cover|chase|foot|mission&seed=7`
to boot straight into one of the staged screenshot scenes (the game sets
`window.__shotReady` when the scene is rendered — that's how the screenshots in
`screenshots/` were captured).

## Hand-in

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set outside the grader) copies `game/` and
`screenshots/` into the output directory and writes `dossier.json` via the vendored
make.fun library in `vendor/`.

## Tech notes

- Plain ES modules, zero build tooling; the only dependency is the vendored three.js.
- The whole street plan and every building facade are painted onto canvases at boot —
  the city draws in a few hundred meshes with shared materials.
- Layout, buildings, palms, parked cars and traffic all derive from one seeded RNG
  stream per system, so a seed reproduces the same city every time.
- No audio files: every sound is an oscillator/noise graph built on the first click.
