# Terrain Persistence Analysis - Resolution

**Date:** January 25, 2026
**Status:** Resolved (architectural limitation accepted)

---

## Issue Summary

**Request:** Make terrain persist independently - destroying the base of terrain should NOT cause terrain above it to disappear ("Worms-style floating terrain").

**Finding:** The terrain system **cannot support floating terrain chunks** due to fundamental architectural limitations. The 1D heightmap architecture stores only ONE height value per X coordinate.

---

## Root Cause: 1D Heightmap Architecture

### Current Data Structure
```javascript
// src/terrain.js
let heights = null;           // Float32Array - ONE value per X pixel
let ceilingHeights = null;    // Float32Array - ONE value per X pixel (separate layer)
```

**Example:**
```
X=500: heights[500] = 200  (terrain surface at Y=200)

After explosion at base:
X=500: heights[500] = 600  (crater bottom at Y=600)

The old value (200) is OVERWRITTEN - there's no way to store both.
```

### What Would Be Needed for Floating Terrain
```javascript
// Hypothetical multi-layer system (NOT implemented)
let layers = []; // Array of terrain segments per X coordinate

X=500: layers[500] = [
  { top: 200, bottom: 350 },  // Floating chunk (old pillar top)
  { top: 600, bottom: 900 }   // Ground floor (crater bottom to void)
]
```

This would require rewriting most of terrain.js - not feasible for a game jam.

---

## Why the Ceiling System Doesn't Help

The game has `ceilingHeights[]` for cave overhangs, but:

1. **Ceilings are a SEPARATE layer** - they represent rock hanging from above, not floating floor chunks
2. **Ceilings are rendered UP to screen top** - they fill from ceiling surface to Y=0
3. **Ceilings don't interact with floor destruction** - destroying floor doesn't create ceiling chunks

---

## Resolution

### Changes Made

1. **Restored skylight logic in `syncCeilingState()`** (terrain.js)
   - When floor destruction meets ceiling, the ceiling is cleared to prevent visual artifacts
   - Minimum 60px gap enforced between floor and ceiling

2. **Removed DRILL weapon** (weaponData.js)
   - Drill created the most noticeable terrain disappearance issues
   - Void Drill (undergroundSeeker behavior) and Singularity Drill remain - they're designed differently

3. **Removed drill handling code** (main.js, weaponBehaviors.js)
   - All `behavior === 'drill'` checks removed
   - Ceiling tunnel carving removed
   - Exit detection removed

### Files Modified
- `src/terrain.js` - Restored skylight logic in `syncCeilingState()`, updated comments in `destroy()`
- `src/weaponData.js` - Removed DRILL weapon definition
- `src/main.js` - Removed drill behavior handling (3 sections)
- `src/weaponBehaviors.js` - Removed drill behavior handler

---

## What Works

- **Cave overhangs** work correctly (ceilings can be destroyed independently)
- **Void Drill** works (burrowing seeker that erupts from below)
- **Singularity Drill** works (similar to Void Drill)
- **Digger** works (creates craters, not tunnels)
- **All explosion-based weapons** work normally

---

## Why "Worms-Style" Isn't Possible Here

In Worms games, if you destroy the base of a pillar:
- The pillar TOP remains floating in the air
- Tanks on the floating chunk stay on it
- The floating chunk can be destroyed independently

**In Void Artillery:**
- `heights[x]` stores ONE value - the terrain surface at that X
- Destroying terrain OVERWRITES the old value
- There's nowhere to store "floating chunk" data
- The renderer fills from surface DOWN - can't draw gaps

---

## Alternatives Considered

| Option | Effort | Feasibility |
|--------|--------|-------------|
| Accept limitation | None | Done |
| Convert terrain to ceiling | Medium | Partial (tanks fall, collision differs) |
| Full polygon terrain | Very High | Not for game jam |

---

*Analysis complete. The 1D heightmap is a fundamental design choice that enables fast collision detection and simple rendering. True floating terrain would require a complete architectural overhaul.*
