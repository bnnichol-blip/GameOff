# Weapon Rebalancing Progress

**Started:** January 25, 2026
**Status:** ALL PHASES COMPLETE ✅

---

## Completed Phases

### Phase 1: Simple Value Tweaks ✅

| Weapon | Change | Status |
|--------|--------|--------|
| MORTAR | damage: 80 → 75 | ✅ Done |
| PLASMA_BOLT | damage: 50 → 25 | ✅ Done |
| SEEKER | seekStrength: 0.25 → 0.5, lockOnDelay: 0.5 → 0.25 | ✅ Done |
| BOUNCER | damage: 80 → 70 | ✅ Done |
| STRAFING_RUN | tier: 'ORBITAL' → 'SPECTACLE' (Epic rarity) | ✅ Done |

### Phase 2: Value Tweaks + Minor Behavior ✅

| Weapon | Change | Status |
|--------|--------|--------|
| CLUSTER | damage: 25 → 35, blastRadius: 30 → 50, bomblets 2x height | ✅ Done |
| BOUNCING_BETTY | blastRadius scales with bounces (55 → 125 max) | ✅ Done |
| VOID_CANNON | pullStrength: 0.5 → 0.75 | ✅ Done |
| SINGULARITY_DRILL → VOID_DRILL | Renamed | ✅ Done |
| METEOR_SHOWER | Turret locks straight up (90°) when selected | ✅ Done |

### Phase 3: Deletions + Renames + Behavior Changes ✅

| Item | Change | Status |
|------|--------|--------|
| FISSURE_CHARGE | DELETED from game | ✅ Done |
| NAPALM | DELETED from game | ✅ Done |
| SCATTER_SHELL → BUCK_SHOT | Renamed, cone 60° → 30°, speed 2.6, 800px max range | ✅ Done |
| ROLLER | Boulder momentum physics, falls off edges, explodes earlier | ✅ Done |
| SPLITTER | Airburst inherits 60% momentum from parent shell | ✅ Done |

**Phase 3 Follow-up Fixes:**
- BUCK_SHOT: Doubled speed (1.3 → 2.6) and range (400 → 800px)
- ROLLER: Fixed edge behavior (falls off instead of bouncing), explodes earlier (velocity threshold 1.5, timer 0.3s)

### Phase 4: Medium Reworks ✅

| Item | Change | Status |
|------|--------|--------|
| DRILL | Carve 40px tunnel path, pass through terrain | ✅ Done |
| DYING_STAR | All 5 lottery cards become Dying Star when unlocked | ✅ Done |
| GRAVITY_MORTAR | Fly to apex, drop straight down, damage/radius scales 50→150 | ✅ Done |
| VOID_SPLITTER | Land → pause → 3 fragments float up → home to targets (60 dmg, 120 radius each) | ✅ Done |
| QUAKE | Radial cracks (3-5), epicenter-based damage | ✅ Done |

**Phase 4 Follow-up Fixes:**
- DRILL: Added drillTime tracking to prevent immediate explosion on terrain contact
- VOID_SPLITTER: Added collision detection for fragments, increased damage 2x (30→60) and radius 3x (40→120)

### Phase 5: Major Reworks

*No items listed in original plan for Phase 5 - was placeholder*

### Phase 6: Global Cleanup ✅

| Item | Change | Status |
|------|--------|--------|
| Remove `cost:` property | Removed from all 28 weapons in weaponData.js | ✅ Done |

---

## Key Files Modified

| File | Changes |
|------|---------|
| `src/weaponData.js` | Weapon stats, deletions, renames, new properties |
| `src/main.js` | Behavior code for cluster height, bouncing betty radius scaling, meteor shower aim lock, buck shot range limit, roller momentum physics, splitter momentum inheritance |

---

## Design Decisions Made

1. **ROLLER:** Heavy boulder feel - slow friction (0.995), strong slope effect (0.25), max speed 15, falls off edges, explodes at velocity < 1.5 after 0.3s
2. **SPLITTER:** Fragments inherit 60% parent momentum + 50% spread velocity
3. **BUCK_SHOT:** Fragments fizzle out (small sparks) when exceeding max range instead of exploding
4. **Deleted weapons:** Behavior code left in main.js (harmless, never triggered)

---

---

*Last Updated: January 25, 2026 - ALL PHASES COMPLETE*
