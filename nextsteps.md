# VOID ARTILLERY - Current Status & Next Steps

## Current Status

### Completed Features

**Core Game (from initial commit)**
- Two-player artillery combat with turn-based gameplay
- Ricochet physics (bounces off walls and ceiling)
- Destructible terrain
- Three tank types with unique shapes (visual only now)
- AI opponent for single-player mode
- Title screen, mode select, tank select UI

**Glitch Events System**
- 15 unique events affecting physics/gameplay each round
- Events include: gravity changes, wind, velocity modifiers, extra bounces, etc.
- Audio/visual feedback when events trigger

**Ambient World**
- Clouds (parallax layers)
- Destructible UFOs that grant buffs + coins
- Weather effects (rain, snow, embers)
- Background particles

**Weapons & Economy (NEW)**
- 20 weapons across 4 tiers:
  - **Cheap (15-30):** Baby Shot, Bouncer, Dirt Ball, Digger, Roller
  - **Mid (40-70):** Mortar, Splitter, Heavy Shell, Drill, Shield, Seeker, Cluster
  - **Premium (80-120):** Railgun, MIRV, Quake, Teleporter, Void Rift
  - **Spectacle (130-180):** Napalm, Chain Lightning, Nuke
- Economy system:
  - Earn coins from damage (1 per 5 dmg), kills (+50), UFO destruction (+30), survival (+10)
  - Start with 60 coins and Baby Shot
- Between-round shop:
  - 6 random weapons offered (1 cheap, 2 mid, 2 premium, 1 spectacle)
  - Navigate with arrows, Space to buy, Enter to keep current
  - AI auto-buys best affordable weapon

**Disabled Features**
- Rising void (was causing premature game ends) - set to 0
- Camera zoom on hits (felt like lag)
- Freeze frames on hits (felt like lag)

---

## Next Steps (Phase 3-4)

### Phase 3: Weapon Behaviors (~2.5 hrs)

Most weapons currently use basic explosion mechanics. These need unique behaviors:

| Weapon | Behavior Needed |
|--------|-----------------|
| **Roller** | Roll along terrain surface after landing |
| **Splitter** | Split into 3 projectiles on first bounce |
| **Drill** | Pierce through terrain, explode on open air/player |
| **Seeker** | Slight homing toward nearest player |
| **MIRV** | Split into 3, each splits into 3 more (9 total) |
| **Quake** | Damage enemies touching terrain (ground-pound) |
| **Teleporter** | Player warps to impact point |
| **Void Rift** | Raise void +60px at impact column |

**Implementation approach:**
- Add behavior checks in `updateProjectile()` for movement behaviors (Roller, Seeker, Drill)
- Add behavior checks in `onExplode()` for explosion behaviors (Splitter, MIRV, Quake, Teleporter, Void Rift)

### Phase 4: New Systems (~2 hrs)

**Napalm - Persistent Fire Fields**
```javascript
state.fields = []; // Already added to state

// Need to implement:
// - Spawn field on Napalm explosion
// - Update fields each frame (tick damage, shrink, expire)
// - Render fields as flickering fire particles
// - Clean up fields when void rises through them
```

**Chain Lightning - Arc Targeting**
```javascript
// On Chain Lightning hit:
// 1. Deal 40 damage to primary target
// 2. Find nearest valid target within 200px
// 3. Draw lightning arc visual
// 4. Deal 25 damage to secondary target
```

### Phase 5: Polish (~1.5 hrs)
- Shop purchase sound effect
- Weapon preview animation in shop
- Balance tuning (costs, damage numbers)
- Edge cases (can't afford anything, etc.)

---

## File Structure

```
src/
  main.js      - Game logic, weapons data, shop system (~2700 lines)
  renderer.js  - Drawing functions
  particles.js - Particle effects
  terrain.js   - Heightmap terrain with destroy/raise
  audio.js     - Sound effects
  input.js     - Keyboard handling
  events.js    - Glitch event system
  ambient.js   - Clouds, UFOs, weather
  utils.js     - Math helpers
```

---

## Quick Test Checklist

- [ ] Start game, select tanks
- [ ] Fire shots, verify damage awards coins
- [ ] Complete round 1, verify shop appears
- [ ] Buy a weapon, verify it's equipped
- [ ] Keep current weapon, verify coins saved
- [ ] AI buys weapon automatically
- [ ] New round starts with new glitch event
- [ ] UFO destruction awards +30 coins

---

## Git History

```
ef872db Add 20-weapon shop system with economy
cbe0624 Add glitch events, ambient systems, terrain weapons, and shop design
f45170e Initial commit: VOID ARTILLERY game jam entry
```
