# Tank Visual Identity Design

**Date:** January 27, 2026
**Status:** Ready to implement

---

## Overview

Replace the 5-archetype system with 8 cosmetic tanks. No passives, no hidden mechanics—just distinct shapes and colors that players identify with.

**Why this change:**
- Simpler to balance (no hidden mechanics affecting combat)
- Clearer player identity (you ARE the cyan triangle)
- More memorable moments (star-shaped craters tell a story)
- Fits the Geometry Dash aesthetic perfectly

---

## Core Changes

**Removing:**
- The 5 archetype system (Striker, Fortress, Hunter, Specter, Merchant)
- All passive abilities (+damage, -damage taken, homing, hover, +coins)
- Variable HP between tank types

**Adding:**
- 8 cosmetic tank options defined by shape and color
- Unified HP pool (current Fortress HP value) for all tanks
- Unique death explosions per tank
- Shaped terrain craters as kill signatures
- Permanent "goo" stains in craters

---

## The 8 Tanks

Each tank is a geometric primitive with a signature neon color. All render with glowing edges (shadowBlur).

| Tank | Shape | Color | Hex Code |
|------|-------|-------|----------|
| **Volt** | Triangle | Cyan | `#00FFFF` |
| **Blaze** | Square | Orange | `#FF8800` |
| **Phantom** | Pentagon | Magenta | `#FF00FF` |
| **Hive** | Hexagon | Gold | `#FFD700` |
| **Razor** | Diamond | Red | `#FF3333` |
| **Nova** | Star (5-pointed) | White | `#FFFFFF` |
| **Orb** | Circle | Lime | `#00FF00` |
| **Titan** | Octagon | Purple | `#AA00FF` |

**Rendering notes:**
- All shapes centered on tank position
- Turret/barrel extends from center toward aim direction
- Shapes sized to match current tank hitbox (~40px diameter)
- Glow intensity consistent across all tanks

---

## Death Explosions

When a tank is eliminated, two things happen: a particle burst and a terrain crater.

### Particle Burst

- 20-30 mini shapes explode outward from the death position
- Each particle is a small version of the tank's shape (~8-12px)
- All particles use the tank's signature color with glow
- Particles spread in all directions with randomized velocity
- Fade out over ~1 second

### Shape-Specific Patterns

| Tank | Pattern |
|------|---------|
| **Volt** (Triangle) | 3 stronger directional bursts from vertices |
| **Blaze** (Square) | 4 corner bursts |
| **Phantom** (Pentagon) | 5-way radial burst |
| **Hive** (Hexagon) | 6-way honeycomb pattern |
| **Razor** (Diamond) | 4 diagonal rays |
| **Nova** (Star) | 5 pointed rays extending outward |
| **Orb** (Circle) | Uniform radial spread |
| **Titan** (Octagon) | 8-way burst |

### Terrain Crater

- Crater carved in the shape of the tank (not circular)
- Size: roughly 2x the tank's dimensions
- Initial bright glow on crater edges (full intensity)
- Glow dims over 3-5 seconds to ~30% intensity
- **Permanent "goo" remains** — faint colored stain inside the crater that never fades
- Multiple deaths in same area layer their colors

The battlefield accumulates colorful scars as tanks fall. By late game, the terrain tells the story of the fight.

---

## Tank Selection Screen

### Layout

- 8 tanks displayed in a 2x4 grid (or single row)
- Each tank shown at full size with its shape and glow
- Tank name displayed below each
- No stats or ability text (all identical mechanically)

### Selection Flow

- Players pick in order (Player 1, then Player 2, etc.)
- Selected tanks get a highlight ring or "TAKEN" overlay
- **No duplicates** — each tank can only be picked once per match
- With 8 tanks and max 4 players, always plenty of choice

### AI Selection

- AI randomly picks from remaining available tanks

---

## Implementation

### Files to Modify

**`weaponData.js` (or new `tanks.js`):**
- Remove `ARCHETYPES` object
- Add `TANKS` array with 8 tank definitions (shape, color, name)

**`main.js`:**
- Replace archetype selection UI with tank picker grid
- Remove passive ability logic (damage modifiers, homing, hover, coins)
- Set all tanks to Fortress HP value
- Track which tanks are taken during selection
- Update tank rendering to draw geometric shapes

**`terrain.js`:**
- Add shaped crater carving function (not just circular)
- Add permanent goo stain rendering (colored fill inside craters)
- Track goo stains in terrain state

**`particles.js`:**
- Add shape-specific death burst patterns
- Add mini-shape particle type (triangle, square, star, etc.)

### Code to Delete

- Archetype passive code (Striker damage boost, Hunter homing, Specter hover, Merchant coins)
- Archetype selection descriptions
- Variable HP per archetype

---

## Success Criteria

- [ ] 8 distinct tank shapes render correctly with glow
- [ ] All tanks have identical HP (Fortress value)
- [ ] No passive abilities remain in codebase
- [ ] Selection screen shows 8 tanks, tracks "taken" status
- [ ] Death explosions spawn shape-specific particles
- [ ] Terrain craters match tank shape
- [ ] Goo stains persist in craters after death
- [ ] AI randomly selects from available tanks
