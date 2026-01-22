# Weapons System Design

## Overview

Expand Void Artillery from 6 tank types to a 20-weapon roster with between-round shop economy. Players earn currency through combat and spend it on randomized weapon offerings each round.

---

## Economy

### Earning Currency

| Action | Coins |
|--------|-------|
| Damage dealt | 1 coin per 5 damage |
| Kill enemy | +50 bonus |
| Destroy UFO | +30 coins |
| Survive a round | +10 base income |

### Starting Conditions

- Both players start with **60 coins**
- Both start with **Baby Shot** equipped (free baseline)
- First shop appears after Round 1

---

## Shop Phase

### Flow

```
Round ends
    ↓
Void rises
    ↓
SHOP PHASE (both players simultaneously)
    ├─ Show 6 random weapons (1 cheap, 2 mid, 2 premium, 1 spectacle)
    ├─ Display: current coins, current weapon
    ├─ Player selects weapon OR keeps current
    ├─ "READY" button when done
    ↓
Both ready → Next round begins
```

### UI Layout

```
┌─────────────────────────────────────┐
│  SHOP - ROUND 2          Coins: 89  │
├─────────────────────────────────────┤
│  [Bouncer]      20   ← selected     │
│  [Splitter]     45                  │
│  [Heavy Shell]  50                  │
│  [Cluster]      65                  │
│  [Railgun]      80                  │
│  [Napalm]      130   (can't afford) │
├─────────────────────────────────────┤
│  Current: Mortar                    │
│  ↑↓ Select   SPACE Buy   ENTER Skip │
└─────────────────────────────────────┘
```

- Weapons you can't afford shown grayed out
- Buying replaces current weapon (no inventory)
- Skipping keeps current weapon, saves coins

---

## Weapon Roster (20 weapons)

### Cheap Tier (15-30 coins)

| Weapon | Cost | Damage | Blast | Bounces | Mechanic |
|--------|------|--------|-------|---------|----------|
| Baby Shot | 15 | 20 | 40 | 1 | Weak but accurate. Fallback option. |
| Bouncer | 20 | 25 | 35 | 4 | Low damage, many bounces. Trick shots. |
| Dirt Ball | 20 | 5 | 45 | 1 | Builds small terrain mound. |
| Digger | 25 | 0 | 70 | 1 | Removes terrain, no damage. |
| Roller | 30 | 30 | 45 | 1 | Rolls along terrain after landing. |

### Mid Tier (40-70 coins)

| Weapon | Cost | Damage | Blast | Bounces | Mechanic |
|--------|------|--------|-------|---------|----------|
| Mortar | 40 | 40 | 80 | 1 | Reliable AoE. Current SIEGE. |
| Splitter | 45 | 20×3 | 30 | 1 | Splits into 3 on first bounce. |
| Heavy Shell | 50 | 70 | 60 | 1 | Slow (0.6x), high damage. |
| Drill | 55 | 45 | 40 | 0 | Pierces terrain, explodes on air/player. |
| Shield | 55 | 0 | 40 | 0 | 50% damage reduction next hit. |
| Seeker | 60 | 35 | 45 | 1 | Slight homing toward nearest player. |
| Cluster | 65 | 15×5 | 35 | 1 | Splits into 5 bomblets. Current CHAOS. |

### Premium Tier (80-120 coins)

| Weapon | Cost | Damage | Blast | Bounces | Mechanic |
|--------|------|--------|-------|---------|----------|
| Railgun | 80 | 95 | 30 | 2 | Direct hit bonus. Current PHANTOM. |
| MIRV | 90 | 10×9 | 25 | 1 | Splits into 3, each splits into 3. |
| Quake | 100 | 40 | 100 | 0 | Damages enemies touching terrain. |
| Teleporter | 100 | 0 | 30 | 1 | Player teleports to impact point. |
| Void Rift | 110 | 20 | 50 | 1 | Raises void +60px at impact column. |

### Spectacle Tier (130-180 coins)

| Weapon | Cost | Damage | Blast | Bounces | Mechanic | New System |
|--------|------|--------|-------|---------|----------|------------|
| Napalm | 130 | 10/sec | 60 | 1 | Burning field for 8 seconds. | Persistent fields |
| Chain Lightning | 150 | 40+25 | 30 | 1 | Arcs to nearest target within 200px. | Chain targeting |
| Nuke | 180 | 80 | 150 | 0 | Massive blast, 3 sec fuse delay. | None |

---

## New Systems

### Persistent Fields (Napalm)

```javascript
// State addition
state.fields = [];  // { x, y, radius, duration, damagePerSec, color, type }

// Behavior
- Spawns on Napalm explosion at terrain level
- Lasts 8 seconds, radius shrinks over time
- Damage tick every 0.5 sec (not every frame)
- Renders as flickering orange/yellow particles
- Destroyed when void rises through it
```

### Chain Lightning

```javascript
// On hit:
1. Deal 40 damage to primary target
2. Find nearest valid target within 200px (player, UFO)
3. If found: draw arc, deal 25 damage
4. No further chaining

// Visual:
- White/cyan jagged line between targets (~200ms)
- Sparks at both endpoints
```

---

## File Changes

| File | Changes |
|------|---------|
| `src/main.js` | WEAPONS object, shop state, economy logic, field system, chain lightning |
| `src/renderer.js` | `drawShop()`, `drawField()`, `drawLightningArc()` |
| `src/particles.js` | `fireField()` emitter for napalm |
| `src/audio.js` | `playPurchase()`, `playChainLightning()`, `playFireLoop()` |

---

## Implementation Phases

### Phase 1: Data & Economy (1.5 hrs)
- Define WEAPONS object with all 20 weapons
- Add coins to player state
- Add currency earning in onExplode/endTurn
- Add UFO destroy reward

### Phase 2: Shop Phase (2 hrs)
- Add 'shop' to game phases
- Shop state: offerings[], selections[]
- Random weapon selection with tier weighting
- Shop UI rendering
- Input handling for shop

### Phase 3: Weapon Behaviors (2.5 hrs)
- Refactor onExplode to read from WEAPONS
- Implement: Roller, Splitter, Drill, Seeker, MIRV
- Implement: Quake, Teleporter, Void Rift
- Hook existing weapons into new system

### Phase 4: New Systems (2 hrs)
- Persistent fields (state.fields array)
- Napalm weapon + fire field visuals
- Chain Lightning targeting + arc render
- Field cleanup when void rises

### Phase 5: Polish (1.5 hrs)
- Shop purchase feedback (sound, flash)
- Weapon preview in shop
- Balance tuning
- Edge cases

**Total: ~9.5 hours**

---

## Design Decisions

1. **Random shop offerings** — Shows 6 weapons per round instead of full list. Adds variety, reduces UI complexity.

2. **No inventory** — Buying replaces current weapon. Keeps decisions simple, no ammo management.

3. **Damage-based economy** — Rewards aggression and accuracy. UFO/environment destruction adds alternative income paths.

4. **Two new systems max** — Napalm fields and chain lightning are the only major additions. Everything else composes existing mechanics.
