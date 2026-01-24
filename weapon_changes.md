# Weapon Changes - Review January 24, 2026

## Summary
- **30 weapons reviewed**
- **17 weapons working as intended** (no changes)
- **13 weapons needed changes** (stat adjustments, behavior fixes, or visual updates)
- **✅ ALL CHANGES IMPLEMENTED**

---

## STAT CHANGES ✅ ALL IMPLEMENTED

### COMMON TIER

#### DIRT_BALL ✅
- **Terrain height**: Double (100% more rise)
- *Implementation*: terrain.js - `peakHeight = radius * 3.6`

#### DIGGER ✅
- **Crater depth**: Double (100% deeper)
- *Implementation*: terrain.js - `baseDepth = ... * radius * 3.0`

#### ROLLER ✅
- **Final explosion damage**: 60 → 80
- **Blast radius**: 50 → 75
- **Shockwave damage**: 20 → 40
- **Shockwave radius**: 20 → 30
- *Implementation*: weaponData.js

---

### RARE TIER

#### MORTAR (new baseline) ✅
- **Damage**: 80 → 100
- **Blast radius**: 80 → 100
- *Implementation*: weaponData.js

#### SEEKER ✅
- **Homing strength**: 0.15 → 0.25
- **Damage**: 70 → 80
- **Blast radius**: 50 → 75
- *Implementation*: weaponData.js

#### GRAVITY_MORTAR ✅
- **Damage per bomblet**: 35 → 50
- *Implementation*: weaponData.js

#### FISSURE_CHARGE ✅
- **Damage**: 40 → 80
- **Fissure length**: 400px → 600px
- **Fissure depth**: 60px → 120px
- *Implementation*: weaponData.js

---

### EPIC TIER

#### QUAKE ✅
- **Damage**: 140 → 90
- **Blast radius**: 120 → 60
- **Trench length**: 300px → 900px
- *Implementation*: weaponData.js

#### CHAIN_LIGHTNING ✅
- **Bounces**: 1 → 2
- *Implementation*: weaponData.js

---

### LEGENDARY TIER

#### STRAFING_RUN ✅
- **Damage per bullet**: 20 → 45
- *Implementation*: weaponData.js

---

## BEHAVIOR FIXES

### SCATTER_SHELL (COMMON) ✅ IMPLEMENTED
**Current**: Fires one shell that splits into 5 fragments on impact
**Desired**: Fire 5 fragments immediately in a cone on launch (shotgun style)
**Implementation**: Added `fireScatterShell()` function in main.js

### SINGULARITY_DRILL (EPIC) ✅ IMPLEMENTED
**Current**: Not tunneling properly
**Desired**: Should tunnel through terrain and erupt upward beneath enemy tanks (stats are correct: 90 damage, 70 radius)
**Implementation**: Fixed eruption to deal damage, destroy terrain, and end turn properly

### METEOR_SHOWER (EPIC) ✅ IMPLEMENTED
**Bug**: Meteors explode in the sky instead of falling
**Fix**:
1. `updateClusterBomblet()`: Added check `proj.maxBounces > 0` to bounce limit termination
2. `updatePendingMeteors()`: Set `maxBounces: 1` when spawning meteors instead of `0`

### VOID_CANNON (EPIC) ✅ IMPLEMENTED
**Current**: Small blast radius only
**Desired**: Beam should carve terrain all the way down to the void
**Implementation**: Added `carveToVoid()` function in terrain.js, used by VOID_CANNON beam

---

## VISUAL FIXES

### NAPALM (EPIC) ✅ IMPLEMENTED
**Current**: Fire field is just a red circle
**Desired**: Fire field should use Solar Flare's visual fire effect style
**Implementation**: Rewrote `drawFireField()` with animated wavy flame columns, gradients, and hot embers

---

## WEAPONS CONFIRMED WORKING

### COMMON (2/6)
- BOUNCER
- PLASMA_BOLT

### RARE (5/10)
- SPLITTER
- HEAVY_SHELL
- DRILL
- CLUSTER
- VOID_SPLITTER
- BOUNCING_BETTY

### EPIC (3/9)
- TELEPORTER
- SOLAR_FLARE (noted as awesome!)
- BLACK_HOLE_GRENADE

### LEGENDARY (3/4)
- RAILGUN
- NUKE
- ORBITAL_BEACON

### SPECIAL (1/1)
- DYING_STAR

---

## DEBUG KEYS ADDED
- **G** = VOID_CANNON

---

*Review completed: January 24, 2026*
