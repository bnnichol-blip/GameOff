# VOID ARTILLERY

*A game jam entry for "Game Off" January 2026*

**Theme:** "One Button Away"
**Status:** Active Development
**Target:** Win the $300 prize

---

## The Game

**VOID ARTILLERY** is a 2D artillery duel with unique hooks:

1. **Ricochet** — Projectiles bounce off walls (infinite bounces)
2. **The Rising Void** — After each round, the floor rises, shrinking the arena
3. **Tank Archetypes** — 5 unique playstyles with passive abilities
4. **Weapon Economy** — Shop system with 40+ weapons (transitioning to Cosmic Lottery)
5. **Glitch Events** — Random modifiers that change gameplay each round

**Players:** 1-4 (humans and/or AI)
**Mode:** Turn-based artillery combat

### Core Loop
1. Select archetype at game start
2. Each turn: Aim with arrow keys, HOLD Space to charge, RELEASE to fire
3. Projectiles bounce off walls, explode on terrain/players
4. After each round: Shop for new weapons (or upcoming: Cosmic Lottery)
5. Void rises, arena shrinks
6. Last tank standing wins

### Win Conditions
- All enemies reach 0 HP
- Enemies fall into the void
- Be the last survivor

---

## Visual Style

**Geometry Wars meets Tron.** No sprites. Just shapes, glow, and particles.

- **Background:** Black with space battle ambient effects
- **Tanks:** Geometric shapes with archetype-specific designs
- **Terrain:** Dark fill with neon edge lines, destructible
- **Projectiles:** Glowing shapes with particle trails
- **Void:** Pulsing magenta gradient, glitchy edge
- **Explosions:** Particle bursts, screen shake, bloom

**Color Palette:**
- Cyan `#00ffff` — Player 1
- Magenta `#ff00ff` — Player 2, void, danger
- Green `#00ff00` — Player 3
- Orange `#ffaa00` — Player 4
- Yellow `#ffff00` — Highlights, charge meter
- White `#ffffff` — Explosions, impacts

---

## Tank Archetypes

Players select an archetype at game start. Each has a passive ability:

| Archetype | Ability | Playstyle |
|-----------|---------|-----------|
| **STRIKER** | +33% damage dealt | Aggressive, glass cannon |
| **FORTRESS** | -33% damage taken | Defensive, outlast opponents |
| **HUNTER** | Slight projectile homing | Precision, never miss |
| **MERCHANT** | +20 coins per turn | Economic, buy better weapons |
| **SPECTER** | Hover above terrain | Mobile, avoid void longer |

---

## Weapon System

### Current: Shop System
- Opens every 3 rounds
- Players spend coins to buy weapons
- Weapons organized by tier (CHEAP → SPECTACLE)

### Upcoming: Cosmic Lottery
- Activates at START of every turn
- 3 random reward cards appear
- Player picks one (weapon, passive, or item)
- Rarity system: Common → Legendary
- See `cosmic_lottery_system_plan.md` for full design

### Weapon Categories (40+ weapons)

**Standard Ordnance:** Plasma Bolt, Scatter Shell, Neutron Blast, Tracer Round

**Multi-Stage:** Cluster bombs, MIRV, Splitter, Gravity Mortar

**Terrain Manipulation:** Terrain Eater, Fissure Charge, Matter Constructor, Singularity Drill

**Bounce Specialists:** Bouncing Betty, Ricochet Storm, Angle Amplifier

**Void/Space Themed:** Meteor Shower, Black Hole Grenade, Solar Flare, Cosmic Ray

**Orbital Weapons:** Nuke, Railgun, Orbital Beacon, Strafing Run

**Ultimate:** Dying Star, Supernova, Armageddon Protocol, Void Cannon

---

## Game Systems

### Glitch Events
Random modifiers that activate each round:
- **Gravity Flux** — Gravity changes (low/high/reverse)
- **Arsenal Glitch** — Random weapon swap
- **Void Surge** — Extra void rise after shots
- **Elastic World** — Extra bounces for all projectiles
- **Time Dilation** — Projectile speed changes

### Orbital Strike System
Special weapons called from orbiting ships:
- **Orbital Beacon** — Marks location for precision strike
- **Strafing Run** — Fighter jets strafe across the field
- **Railgun** — Charging beam with telegraph
- **Nuke** — Massive explosion with mushroom cloud

### Desperation Beacons
When orbital weapons are used, beacons fall from the sky. Players can claim them by shooting them for free orbital strikes.

---

## Technical Architecture

**Stack:** Vanilla JavaScript + HTML Canvas

### Actual File Structure
```
/void-artillery
  index.html           # Entry point
  /src
    main.js            # Game loop, state, all game logic (~8000 lines)
    input.js           # Keyboard handling
    renderer.js        # Base drawing utilities
    particles.js       # Particle system
    terrain.js         # Terrain generation/destruction
    audio.js           # Sound effects
    utils.js           # Math helpers
    events.js          # Glitch event system
    ambient.js         # Background space battle
    weaponData.js      # All weapon definitions
    state.js           # Shared state and constants
  PROJECT_STATUS.md    # Current development status
  CLAUDE.md            # This file
```

### Key Constants
```javascript
const VIRTUAL_WIDTH = 2560;
const VIRTUAL_HEIGHT = 1440;
const NUM_PLAYERS = 4;
const GRAVITY = 0.3;
const MAX_POWER = 15;
const VOID_RISE_PER_ROUND = 30;
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
| B | Spawn desperation beacon |
| C | +500 coins |
| H | Heal to full |
| K | Kill next enemy |
| V | Raise void by 100 |
| 1-9 | Cycle through weapons |

---

## AI System

The AI is functional and makes strategic decisions:
- Calculates optimal angles to hit enemies
- Considers terrain obstacles
- Prioritizes low-HP targets
- Uses appropriate weapons for situations
- Participates in shop/archetype selection

---

## Implemented Juice

- [x] Screen shake (scales with damage)
- [x] Particles (explosions, trails, sparks)
- [x] Glow/bloom (shadowBlur on all elements)
- [x] Projectile trails (fading trail effect)
- [x] Bounce effects (flash, particles, sound)
- [x] Void visual (pulsing gradient, glitch edge)
- [x] Camera zoom (punch zoom on explosions)
- [x] Weapon-specific effects (meteor trails, railgun charge, nuke mushroom cloud)
- [ ] Freeze frames (disabled - felt like lag)
- [ ] Slow-mo on kills (not implemented)

---

## Current Development Focus

### Immediate (See PROJECT_STATUS.md)
1. **Weapon Stabilization** — 35 new weapons need individual testing
2. **Cosmic Lottery MVP** — Replace shop with per-turn lottery

### Known Issues
- Some weapons may have untested edge cases
- Recursion bugs in cluster weapons (mostly fixed)
- Shop can hang in edge cases (mostly fixed)

---

## Controls

| Key | Action |
|-----|--------|
| ← → | Aim left/right |
| ↑ ↓ | Fine aim adjustment |
| Space (hold) | Charge power |
| Space (release) | Fire |
| Enter | Confirm selection |
| Esc | Pause/menu |

---

## Reference Documents

- `PROJECT_STATUS.md` — Current tasks and progress
- `cosmic_lottery_system_plan.md` — Full lottery design
- `CosmicLotteryImplementationPlan.md` — Technical integration
- `plan.md` — 35 weapons implementation plan

---

## Philosophy

1. **Fun is the goal.** Every feature should make the game more enjoyable.
2. **Juice matters.** Screen shake, particles, and sound elevate everything.
3. **Test incrementally.** Verify each weapon/feature works before moving on.
4. **Scope wisely.** A polished small game beats an ambitious broken one.

---

*Last Updated: January 23, 2026*
