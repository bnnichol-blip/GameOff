# Void Artillery - Project Status

**Date:** January 23, 2026
**Next Session:** January 24, 2026

---

## Executive Summary

We have two major workstreams:

1. **Weapon Stabilization** - 35 new weapons added, most untested
2. **Cosmic Lottery** - Complete shop system replacement

**Recommended Order of Operations:**
1. First: Stabilize existing weapons (they become the lottery reward pool)
2. Second: Implement Cosmic Lottery MVP
3. Third: Add passives, cursed items, evolutions

---

## PART 1: Weapon Stabilization

### Status: ~90% Infrastructure Complete, ~5% Tested

We added 35 new weapons. The core systems are in place but individual weapons need verification.

### Critical Fixes Applied
- [x] Recursion prevention (`!proj.isCluster` guards)
- [x] Sub-projectiles use `weaponKey: null` and `isFragment: true`
- [x] Shop stability fixes
- [x] Meteor Shower marker damage fix
- [x] Cascade explosion boundary clamping
- [x] Particle capping (MAX_PARTICLES=800)

### Weapons by Test Status

#### Tested & Working
| Weapon | Notes |
|--------|-------|
| DYING_STAR | Ultimate weapon, verified |

#### Partially Tested (Fixes Applied)
| Weapon | Notes |
|--------|-------|
| METEOR_SHOWER | Fixed marker speed/damage, needs in-game verification |
| ARMAGEDDON_PROTOCOL | Recursion fixed, needs verification |
| CLUSTER_VOID | Recursion fixed, needs verification |
| SOLAR_FLARE | Recursion fixed, needs verification |

#### Not Tested (35 weapons)
All other weapons in CHEAP, MID, PREMIUM, SPECTACLE tiers need individual testing.

### Testing Protocol
1. Give weapon via debug command
2. Fire at empty terrain - check flight/behavior
3. Fire at enemy - check damage
4. Check edge cases - walls, void, self-damage
5. Verify sub-projectiles don't recurse

### Debug Commands
| Key | Action |
|-----|--------|
| M | METEOR_SHOWER |
| A | ARMAGEDDON_PROTOCOL |
| D | DYING_STAR |
| N | NUKE |
| Q | QUAKE |
| O | ORBITAL_BEACON |
| S | STRAFING_RUN |
| C | +500 coins |
| 1-9 | Cycle weapons |

---

## PART 2: Cosmic Lottery Implementation

### Concept
Replace the round-based shop with a per-turn "Cosmic Lottery" where players pick from 3 randomized reward cards at the start of each turn.

### Design Documents
- `cosmic_lottery_system_plan.md` - Full design (620 lines)
- `CosmicLotteryImplementationPlan.md` - Technical integration

### Core Fantasy
> Players scavenge from the space battle overhead. Debris, weapons, and tech rain down from destroyed ships.

### Phase 1: MVP (Target for Tomorrow)

**Goal:** Basic lottery loop working with existing weapons

#### New Files to Create
```
src/lotteryData.js    - Rarity config, reward pools
src/lottery.js        - Lottery state machine, card generation
```

#### State Changes (src/main.js or src/state.js)
```javascript
state.lottery = {
    active: false,
    phase: 'inactive', // 'spinning' | 'selecting' | 'inactive'
    cards: [],         // Array of 3 card objects
    selectedIndex: -1,
    timer: 0
};

// Per-player additions
player.rerollsRemaining = 2;
player.banishesRemaining = 1;
player.passives = [];
player.weaponAmmo = {};  // { METEOR_SHOWER: 3, PLASMA_BOLT: 2 }
```

#### Phase Flow Change
```
Current:  RESOLVING -> (every N turns) SHOP -> AIMING
New:      RESOLVING -> LOTTERY -> AIMING (every turn)
```

#### MVP Features
- [ ] 3 cards shown at turn start
- [ ] Simple rarity system (Common/Uncommon/Rare/Epic/Legendary)
- [ ] Existing WEAPONS as reward pool (remapped to rarities)
- [ ] Player picks card with 1/2/3 keys
- [ ] AI auto-selects highest rarity
- [ ] Ammo system for weapons

#### MVP Skip (Add Later)
- Passives (damage boost, HP, bounces)
- Cursed items
- Evolutions
- Reroll/Banish mechanics
- Pity system
- Elaborate animations
- Hot streak / On Fire events

### Phase 2: Passives & Polish

**Goal:** Add permanent upgrades and polish lottery experience

#### Passive Categories
1. **Offense**: +damage, +blast radius, +bounces, homing
2. **Defense**: +HP, shields, dodge, regen
3. **Utility**: +rerolls, +card draw, +rarity chance

#### Animation Sequence (Target)
```
0.0s - "INCOMING SALVAGE" text
0.3s - 3 cards descend from top
0.8s - Cards shuffle/spin
1.5s - Cards SLAM into place (left, center, right)
2.1s - Cards flip to reveal
2.4s - Player selection phase
```

### Phase 3: Advanced Features

- Cursed offerings (risk/reward)
- Evolution combinations
- Jackpot event (all Epic+)
- Divine intervention (critical HP bonus)
- Full audio implementation

### Rarity Distribution
| Rarity | Rate | Card Border |
|--------|------|-------------|
| Common | 50% | White |
| Uncommon | 30% | Green glow |
| Rare | 15% | Blue glow + sparkles |
| Epic | 4% | Purple + lightning |
| Legendary | 1% | Gold aura + particles |

### Weapon Rarity Mapping (Existing Weapons)
```
CHEAP tier (20-40)      -> Common/Uncommon
MID tier (45-70)        -> Uncommon/Rare
PREMIUM tier (75-120)   -> Rare/Epic
SPECTACLE tier (130+)   -> Epic/Legendary
```

### Key Design Decisions Needed

1. **Duplicate passives** - Stack or auto-upgrade?
2. **Max passives** - Unlimited or capped?
3. **Weapon ammo cap** - Max stack limit?
4. **Lottery skip option** - Allow for fast players?
5. **Spectator visibility** - See others' cards?
6. **Orbital weapon integration** - How do beacons/nukes fit?

---

## PART 3: Order of Operations

### Day 1 (January 24)

**Morning: Weapon Verification**
1. Test METEOR_SHOWER fix in-game
2. Test ARMAGEDDON_PROTOCOL fix
3. Quick pass through CHEAP tier weapons
4. Document any broken weapons

**Afternoon: Lottery MVP**
1. Create `lotteryData.js` with rarity config
2. Add lottery state to game state
3. Implement `startLottery()` and `updateLottery()`
4. Remap existing weapons to rarity tiers
5. Basic card UI (no animation yet)
6. Player selection with 1/2/3 keys
7. AI auto-selection
8. Ammo system integration

### Day 2 (If Needed)

**Lottery Polish**
1. Add card animations
2. Implement reroll/banish
3. Add pity system
4. First batch of passives

**Weapon Fixes**
1. Fix any broken weapons found in testing
2. Balance pass on damage values

---

## Files Reference

### Modified This Session
- `src/main.js` - Behavior handlers, debug commands, stability fixes
- `src/state.js` - New arrays, exported constants
- `src/weaponData.js` - 35 weapon definitions, METEOR_SHOWER fix

### To Create Tomorrow
- `src/lotteryData.js` - Rarity config, reward pools
- `src/lottery.js` - Lottery system (optional, could be in main.js)

### Reference Documents
- `cosmic_lottery_system_plan.md` - Full design spec
- `CosmicLotteryImplementationPlan.md` - Technical integration
- `plan.md` - Original 35 weapons plan

---

## Session Log

### January 23, 2026 (Today)
- Fixed multiple weapon recursion bugs
- Stabilized shop system
- Fixed Meteor Shower self-damage
- Added debug commands (M, A)
- Created comprehensive status documentation
- Reviewed Cosmic Lottery plans
- Defined implementation phases

**Next Action:** Start with weapon verification, then Lottery MVP

---

## Quick Start Tomorrow

```bash
# 1. Start the dev server
npx live-server

# 2. Open browser to localhost:8080

# 3. Test Meteor Shower
#    - Start game, press M to get weapon
#    - Fire and verify no self-damage
#    - Verify meteors spawn correctly

# 4. If weapons work, begin Lottery implementation
```

---

*Last Updated: January 23, 2026, 11:00 PM*
