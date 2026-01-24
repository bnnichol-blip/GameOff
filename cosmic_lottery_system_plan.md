# VOID ARTILLERY: Cosmic Lottery System
## Simplified Design Document (v3.0)

---

## Overview

The **Cosmic Lottery** replaces the traditional shop. At the start of each turn, players pick one of 3 weapon cards — that weapon is used for THIS turn only. Next turn, pick again.

### Core Fantasy
Players scavenge from the space battle overhead. Debris and weapons rain down, and you grab what you can for your next shot.

### Design Goals
1. Create excitement at the start of every turn
2. Deliver "rare drop" moments through rarity visuals
3. Keep it fast — selection takes ~2 seconds
4. Simple: no inventory, no ammo tracking

### What This System Is NOT
- Not a build system (no passives, no stacking)
- Not inventory management (no ammo counts)
- Just: pick weapon → fire it → repeat

---

## Core Mechanic

### The Loop
```
Turn starts
  → 3 weapon cards appear
  → Player picks one (or rerolls once)
  → Player fires that weapon
  → Turn ends
  → Next player's turn starts
  → Repeat
```

### Key Rules
- **1 shot per weapon** — you pick it, you fire it, done
- **Every turn has lottery** — no skipping, even Round 1
- **1 reroll per player per game** — use it wisely
- **AI picks instantly** — floating text shows their choice

---

## Rarity System

### Drop Rates
| Rarity | Color | Drop Rate |
|--------|-------|-----------|
| Common | White/Gray | 50% |
| Uncommon | Green | 30% |
| Rare | Blue | 15% |
| Epic | Purple | 4% |
| Legendary | Gold | 1% |

### Visual Treatment
| Rarity | Card Border | Effect |
|--------|-------------|--------|
| Common | Thin white line | None |
| Uncommon | Green glow | Subtle pulse |
| Rare | Blue glow | Sparkle particles |
| Epic | Purple electricity | Arc lightning |
| Legendary | Golden aura | Screen shake + particles |

### Pity System (Simple)
- If 5 turns pass without seeing Rare+, guarantee one Rare card
- Counter resets when ANY Rare+ card is shown

---

## Weapon Pool

Weapons mapped from `weaponData.js` tiers:

### Common (CHEAP Tier)
| Weapon | Description |
|--------|-------------|
| Bouncer | Pinball chaos, explodes on bounces |
| Dirt Ball | Creates terrain mound |
| Digger | Carves crater |
| Roller | Shockwaves while rolling |
| Plasma Bolt | Fast shot, small splash |
| Scatter Shell | 5 cone fragments |

### Uncommon (MID Tier)
| Weapon | Description |
|--------|-------------|
| Mortar | Reliable AoE baseline |
| Splitter | Chain-split mayhem |
| Heavy Shell | High damage + aftershock |
| Drill | Pierces terrain |
| Seeker | Lock-on homing |
| Cluster | Wide spray of bomblets |
| Gravity Mortar | Drops bomblets at apex |
| Void Splitter | Homing fragments |
| Bouncing Betty | Gains damage per bounce |
| Fissure Charge | 400px terrain crack |

### Rare (PREMIUM Tier)
| Weapon | Description |
|--------|-------------|
| Quake | Devastating earthquake |
| Teleporter | Warp to impact point |
| Solar Flare | Rise and rain fire |
| Singularity Drill | Burrow, seek, erupt |

### Epic (SPECTACLE Tier)
| Weapon | Description |
|--------|-------------|
| Napalm | Lingering fire field |
| Chain Lightning | Huge hit + chain jump |
| Meteor Shower | 5 random meteors |
| Black Hole Grenade | Pull in, then collapse |
| Void Cannon | Orbital beam from target |

### Legendary (ORBITAL Tier)
| Weapon | Description |
|--------|-------------|
| Nuke | Cinematic multi-stage detonation |
| Railgun | Charge beam with ricochet |
| Orbital Beacon | Capital ship beam strike |
| Strafing Run | Fighter carpet bomb |

### Excluded
- **DYING_STAR** — Special reward from desperation beacons only

---

## Player Actions

### Selection
- Press **1, 2, or 3** to pick card
- Or: Arrow keys to highlight + Enter/Space to confirm

### Reroll
- Press **R** to reroll (once per game)
- All 3 cards replaced with new random cards
- Cannot reroll after using your one reroll

### No Other Actions
- No skip option
- No banish system
- Keep it simple

---

## Visual Sequence

```
1. "INCOMING SALVAGE" text appears (0.3s)
2. Three cards descend from top (0.5s)
3. Cards lock into position with THUNK (0.3s)
4. Cards reveal contents (0.3s)
5. Player selects → chosen card glows
6. Unchosen cards dissolve (0.3s)
7. Weapon assigned, enter aiming phase
```

Total: ~1.5-2 seconds

### AI Behavior
- AI picks instantly (no animation delay)
- Floating text appears: "AI picked [Weapon Name]" 
- Text fades after 1 second

---

## Audio Requirements

| Event | Sound |
|-------|-------|
| Salvage incoming | Descending whoosh |
| Card lock | Metallic THUNK |
| Common reveal | Simple chime |
| Uncommon reveal | Energy surge |
| Rare reveal | Dramatic chord |
| Epic reveal | Orchestra hit |
| Legendary reveal | Full fanfare + bass |
| Selection confirm | Confirmation tone |
| Cards dismissed | Whoosh away |
| Reroll | Shuffle sound |

---

## UI Layout

```
┌────────────────────────────────────────────────────────────┐
│                    INCOMING SALVAGE                         │
│                                                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐           │
│   │ [RARE]  │      │[COMMON] │      │[UNCOMM] │           │
│   │         │      │         │      │         │           │
│   │ Quake   │      │ Bouncer │      │ Mortar  │           │
│   │         │      │         │      │         │           │
│   │ DMG:140 │      │ DMG:80  │      │ DMG:80  │           │
│   └─────────┘      └─────────┘      └─────────┘           │
│       [1]              [2]              [3]                │
│                                                             │
│                    Reroll: 1 remaining                      │
│                                                             │
│              Press 1, 2, or 3 to select                    │
│                     R to reroll                             │
└────────────────────────────────────────────────────────────┘
```

---

## Configuration

```javascript
const LOTTERY_CONFIG = {
    rarityRates: {
        common: 50,
        uncommon: 30,
        rare: 15,
        epic: 4,
        legendary: 1
    },
    
    pityThreshold: 5,      // Turns without rare+ before guarantee
    rerollsPerPlayer: 1,   // One reroll per player per game
    
    timing: {
        incomingText: 300,
        cardDescent: 500,
        cardLock: 300,
        cardReveal: 300,
        dismissal: 300
    }
};
```

---

## What Was Removed

From original v1.0 plan:
- Ammo system (weapons are 1-shot now)
- Passive upgrades
- Evolutions
- Cursed offerings
- Consumable items
- Banish system
- Skip mechanic
- Hot Streak / On Fire events
- Divine Intervention
- Jackpot event
- Mercy system
- Multiple rerolls

---

*Document Version: 3.0*
*Last Updated: January 2026*
