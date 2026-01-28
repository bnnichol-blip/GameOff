# VOID ARTILLERY

*A game jam entry for "Game Off" January 2026*

**Theme:** "One Button Away"
**Status:** Feature Complete, Polish Phase
**Target:** Win the $300 prize

> **PRIORITY FOR NEXT SESSION:** Fix ceiling collision bugs for NUKE and ORBITAL_BEACON.
> See `CeilingCollisionDebug.md` for full analysis. Same bug pattern as Strafing Run fix.

---

## The Game

**VOID ARTILLERY** is a 2D artillery duel with unique hooks:

1. **Ricochet** — Projectiles bounce off walls (configurable per weapon)
2. **The Rising Void** — After each round, the floor rises, shrinking the arena
3. **Tank Cosmetics** — 8 unique tanks with distinct shapes and colors
4. **Cosmic Lottery** — Per-turn card selection replaces traditional shop
5. **Glitch Events** — Random modifiers that change gameplay each round
6. **Cave Systems** — Destructible ceiling overhangs with full collision

**Players:** 1-4 (humans and/or AI)
**Mode:** Turn-based artillery combat

### Core Loop
1. Select tank at game start
2. **Cosmic Lottery**: Pick 1 of 5 cards (weapons with rarities)
3. Aim with arrow keys, HOLD Space to charge, RELEASE to fire
4. Projectiles bounce off walls, explode on terrain/players
5. Void rises, arena shrinks
6. Last tank standing wins

### Win Conditions
- All enemies reach 0 HP
- Enemies fall into the void
- Be the last survivor

---

## Visual Style

**Geometry Wars meets Tron.** No sprites. Just shapes, glow, and particles.

- **Background:** Black (space battle and UFOs currently disabled)
- **Tanks:** Geometric shapes with tank-specific designs
- **Terrain:** Dark fill with neon edge lines, destructible with cave overhangs
- **Projectiles:** Glowing shapes with particle trails
- **Void:** Pulsing magenta gradient, glitchy edge
- **Explosions:** Particle bursts, screen shake, bloom

**Biomes (5 color themes):**
- CYBER_VOID — Purple/cyan
- ICE_FIELD — Blue/cyan
- LAVA_CORE — Orange/red
- TOXIC_ZONE — Green/yellow
- VOID_RIFT — Purple/magenta

---

## Tank Cosmetics

Players select a tank at game start. All tanks have identical stats - just unique looks!

| Tank | Shape | Color |
|------|-------|-------|
| **Volt** | Triangle | Cyan |
| **Blaze** | Square | Orange |
| **Phantom** | Pentagon | Magenta |
| **Hive** | Hexagon | Gold |
| **Razor** | Diamond | Red |
| **Nova** | Star | White |
| **Orb** | Circle | Lime |
| **Titan** | Octagon | Purple |

**Death Signatures:**
- Particles burst outward as mini versions of the tank's shape
- Crater carved in the shape of the tank
- Permanent "goo" stain remains in the crater (40% opacity)

---

## Cosmic Lottery (IMPLEMENTED)

The shop system has been **fully replaced** with the Cosmic Lottery:

- Activates at the START of every turn
- **5 cards displayed**: Mortar (guaranteed) + 3 random + Teleporter (guaranteed)
- Player picks with 1-5 keys
- AI auto-selects highest rarity card

### Rarity System
| Rarity | Rate | Unlock |
|--------|------|--------|
| Common | 50% | Round 1+ |
| Uncommon | 30% | Round 1+ |
| Rare | 15% | Round 3+ |
| Epic | 4% | Round 5+ |
| Legendary | 1% | Round 7+ |

### Pity System
After 5 consecutive common-only turns, guarantees a Rare+ weapon.

---

## Weapon System (41 weapons)

### By Tier

**CHEAP:** Mortar, Bouncer, Dirt Ball, Digger, Roller, Plasma Bolt

**MID:** Splitter, Seeker, Cluster, Drill, Heavy Shell, Scatter Shell, Gravity Mortar, Bouncing Betty

**PREMIUM:** Railgun, Quake, Teleporter, Chain Lightning, Void Splitter

**SPECTACLE:** Napalm, Fissure Charge, Solar Flare, Singularity Drill, Meteor Shower

**ORBITAL/SPECIAL:** Orbital Beacon, Strafing Run, Dying Star, Black Hole Grenade, Void Cannon, Nuke

### Weapon Behaviors
- **Standard** — Simple projectiles
- **Cluster/Split** — Break into sub-projectiles
- **Terrain Tools** — Digger, Dirt Ball, Fissure
- **Bouncer** — Pinball physics, explodes on each bounce
- **Roller** — Rolls along terrain surface
- **Drill** — Tunnels through terrain
- **Orbital** — Called from space, special targeting

---

## Terrain System

### Generation Types (6)
- **Rolling Hills** — Gentle sine wave terrain
- **Canyon** — Deep trenches with ledges
- **Plateau** — Flat elevated sections with cliffs
- **Islands** — Floating terrain chunks
- **Caves** — Full ceiling coverage (30% chance for massive tunnel)
- **Bridge** — Spanning structure over gap

### Features
- **Cavern Overhangs** — Partial ceilings with destructible walls
- **Stalactites/Stalagmites** — Cave decorations
- **Jagged Variation** — Micro-noise for natural feel

### Ceiling System (Recently Fixed)
- Ceilings extend visually to top of screen (solid rock roof)
- Full collision detection including vertical sides
- Destruction works from any angle
- `syncCeilingState()` prevents ghost terrain artifacts

---

## Game Systems

### Glitch Events
Random modifiers that activate each round:
- **Gravity Flux** — Low/high/reverse gravity
- **Arsenal Glitch** — Random weapon swap
- **Void Surge** — Extra void rise after shots
- **Elastic World** — Extra bounces for all projectiles
- **Time Dilation** — Projectile speed changes

### Orbital Strike System
- **Orbital Beacon** — Marks location for precision strike
- **Strafing Run** — Fighter jets strafe across the field
- **Railgun** — Charging beam with telegraph
- **Nuke** — Massive explosion with mushroom cloud

### Desperation Beacons
When orbital weapons are used, beacons fall from the sky. Players can claim them by shooting them.

### Grappling Hook System
- Each tank starts with **3 hooks** per game
- Press **G** to launch hook toward aim direction
- Hook attaches to terrain floor or ceiling
- Press **G** again to release with preserved momentum
- Can chain hooks while flying (consumes ammo)
- Hook misses (off-screen) don't consume ammo
- AI players skip grapple (MVP)

---

## Technical Architecture

**Stack:** Vanilla JavaScript + HTML Canvas (no dependencies)

### File Structure
```
/void-artillery
  index.html              # Entry point
  /src
    main.js               # Game loop, state, lottery, all logic (~8600 lines)
    terrain.js            # Terrain generation/destruction/collision (~2700 lines)
    ambient.js            # Background effects, weather (~2550 lines)
    weaponData.js         # Weapon definitions + tank cosmetics
    weaponBehaviors.js    # Complex weapon behavior handlers
    particles.js          # Particle system
    events.js             # Glitch event system
    postfx.js             # Post-processing (chromatic, glitch, vignette)
    audio.js              # Sound effects + music playlist
    renderer.js           # Base drawing utilities
    input.js              # Keyboard handling
    state.js              # Shared state and constants
    utils.js              # Math helpers
  STATUS.md               # Current project status
  CLAUDE.md               # This file
```

### Key Constants
```javascript
const VIRTUAL_WIDTH = 2560;
const VIRTUAL_HEIGHT = 1440;
const DISPLAY_SCALE = 0.5;  // Renders at 1280x720
const NUM_PLAYERS = 4;
const GRAVITY = 0.15;
const MAX_POWER = 28;
const VOID_RISE_PER_ROUND = 50;
```

---

## Debug Commands

Active during gameplay (aiming/firing phases):

| Key | Action |
|-----|--------|
| M | Give Meteor Shower |
| A | Give Armageddon Protocol |
| D | Give Dying Star |
| N | Give Nuke |
| Q | Give Quake |
| O | Give Orbital Beacon |
| S | Give Strafing Run |
| Y | Give Void Cannon |
| X | Give Void Splitter |
| B | Spawn desperation beacon |
| C | +500 coins |
| H | Heal to full |
| K | Kill next enemy |
| V | Raise void by 100 |
| T | Toggle terrain debug overlay |
| 1-2 | Cycle through weapons |

---

## Controls

| Key | Action |
|-----|--------|
| ← → | Aim left/right |
| ↑ ↓ | Fine aim adjustment |
| Space (hold) | Charge power |
| Space (release) | Fire |
| G | Grapple (launch/release/chain) |
| 1-5 | Select lottery card |
| Enter | Confirm selection |
| Esc | Pause/menu |

---

## AI System

The AI is functional and competitive:
- Calculates optimal angles to hit enemies
- Considers terrain obstacles and bounces
- Prioritizes low-HP targets
- Auto-selects highest rarity lottery card
- Participates in tank selection

---

## Implemented Polish

- [x] Screen shake (scales with damage)
- [x] Particles (explosions, trails, sparks, fire fields)
- [x] Glow/bloom (shadowBlur on all elements)
- [x] Projectile trails (fading trail effect)
- [x] Bounce effects (flash, particles, sound)
- [x] Void visual (pulsing gradient, glitch edge)
- [x] Camera zoom (punch zoom on explosions)
- [x] Post-processing (chromatic aberration, vignette)
- [x] Nuke mushroom cloud with stems
- [x] Railgun charge telegraph
- [x] Napalm animated fire fields
- [x] 4-track music playlist

---

## Disabled Features (Performance)

- Space battle background (toggle: `DISABLE_SPACE_BATTLE`)
- UFO system (toggle: `DISABLE_UFOS`)
- Lightning flashes during rain (disabled in code)

---

## Planned But Not Implemented

- **Wind System** — Design complete in `docs/plans/2026-01-25-wind-system-design.md`
- **Passives** — Damage boost, HP, bounces (lottery expansion)
- **Cursed Items** — Risk/reward choices
- **Weapon Evolutions** — Combine weapons for upgrades

---

## Reference Documents

- `STATUS.md` — Current project status (latest)
- `cosmic_lottery_system_plan.md` — Original lottery design
- `docs/plans/2026-01-25-wind-system-design.md` — Wind mechanics

---

## Philosophy

1. **Fun is the goal.** Every feature should make the game more enjoyable.
2. **Juice matters.** Screen shake, particles, and sound elevate everything.
3. **Test incrementally.** Verify each weapon/feature works before moving on.
4. **Scope wisely.** A polished small game beats an ambitious broken one.

---

*Last Updated: January 27, 2026*
