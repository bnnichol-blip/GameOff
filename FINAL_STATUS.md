# VOID ARTILLERY - Final Status
*Game Jam Entry - January 24, 2026*

---

## Game Overview

**VOID ARTILLERY** is a 2D artillery duel with unique mechanics:
- **Ricochet** - Infinite wall bounces
- **Rising Void** - Arena shrinks each round
- **Cosmic Lottery** - Pick 1 of 3 weapons each turn
- **Tank Archetypes** - 5 unique playstyles
- **Glitch Events** - Random modifiers each round

**Players:** 1-4 (humans and/or AI)

---

## Core Systems - ALL COMPLETE

### Cosmic Lottery System
- [x] Replaces shop - activates every turn
- [x] 3 random weapon cards (no duplicates)
- [x] Rarity: Common 50%, Rare 25%, Epic 15%, Legendary 10%
- [x] Progressive unlock by round:
  - Round 1: Common only
  - Round 2: Common + Rare
  - Round 3: + Epic
  - Round 4+: + Legendary
- [x] Pity system (rare+ guaranteed after 5 common-only turns)
- [x] AI instant selection

### Weapon System - 30 WEAPONS WORKING
| Tier | Count | Examples |
|------|-------|----------|
| Common | 6 | Plasma Bolt, Bouncer, Scatter Shell, Roller, Dirt Ball, Digger |
| Rare | 10 | Mortar, Splitter, Seeker, Cluster, Drill, Heavy Shell, Fissure Charge, Gravity Mortar, Bouncing Betty, Void Splitter |
| Epic | 9 | Napalm, Quake, Teleporter, Solar Flare, Black Hole Grenade, Chain Lightning, Meteor Shower, Singularity Drill, Void Cannon |
| Legendary | 4 | Nuke, Railgun, Orbital Beacon, Strafing Run |
| Special | 1 | Dying Star |

### Turn Flow
- [x] Effects fully resolve before next turn
- [x] Orbital beams, nukes, strafing runs complete before lottery
- [x] Safety timeout prevents stuck games

### Audio
- [x] Procedural sound effects (Web Audio API)
- [x] 4-track background music playlist (auto-advances)
- [x] Charge, fire, bounce, explosion sounds

### Visual Polish
- [x] Screen shake (scales with damage)
- [x] Particle system (explosions, trails, sparks)
- [x] Glow/bloom effects
- [x] Animated NAPALM fire fields
- [x] Nuke mushroom cloud
- [x] Railgun charge telegraph
- [x] Void pulsing gradient

---

## Tank Archetypes

| Archetype | Ability |
|-----------|---------|
| STRIKER | +33% damage dealt |
| FORTRESS | -33% damage taken |
| HUNTER | Projectile homing |
| MERCHANT | +20 coins per turn |
| SPECTER | Hover above terrain |

---

## Glitch Events

Random modifiers each round:
- Gravity Flux (low/high/reverse gravity)
- Arsenal Glitch (random weapon swap)
- Void Surge (extra void rise)
- Elastic World (extra bounces)
- Time Dilation (speed changes)

---

## Controls

| Key | Action |
|-----|--------|
| ← → | Aim |
| ↑ ↓ | Fine aim |
| Space (hold) | Charge power |
| Space (release) | Fire |
| Enter | Confirm |
| Esc | Pause |

---

## Debug Keys (During Gameplay)

| Key | Action |
|-----|--------|
| M | Meteor Shower |
| N | Nuke |
| O | Orbital Beacon |
| S | Strafing Run |
| Q | Quake |
| G | Void Cannon |
| D | Dying Star |
| B | Spawn beacon |
| C | +500 coins |
| H | Heal |
| K | Kill enemy |
| V | Raise void |

---

## Recent Session Changes (Jan 24)

1. **Cosmic Lottery** - Full implementation replacing shop
2. **13 Weapon Fixes** - Stats and behaviors tuned
3. **Turn Flow** - Waits for all effects to resolve
4. **NAPALM Visual** - Animated flame columns
5. **VOID_CANNON** - Carves to void
6. **SINGULARITY_DRILL** - Tunnels and erupts
7. **METEOR_SHOWER** - Fixed sky explosion bug
8. **Music Playlist** - 4 tracks looping
9. **Progressive Rarity** - Unlocks by round
10. **No Duplicate Cards** - Guaranteed unique options

---

## Known Working Well
- All 30 weapons tested
- AI plays competently
- 4-player matches stable
- Orbital weapons cinematic
- Particle effects juicy

---

## Polish Opportunities
- [ ] Slow-mo on kills
- [ ] Skip track button
- [ ] Volume sliders
- [ ] More glitch events
- [ ] Additional weapons

---

## Tech Stack
- Vanilla JavaScript
- HTML5 Canvas
- Web Audio API
- No dependencies

---

*Ready for final polish phase!*
