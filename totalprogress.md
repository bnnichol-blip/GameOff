# VOID ARTILLERY — Development Progress Summary

## Session Overview
This document summarizes all implementation work completed for the Glitch Events system and particle effects enhancements.

---

## Feature 1: Glitch Events System

### New File: `src/events.js`
Created a complete glitch events system with 15 unique events that add unpredictability to gameplay.

### Original Events (5)
| Event | Effect |
|-------|--------|
| **ARSENAL GLITCH** | Randomizes current player's tank type for the round |
| **VOID WARP** | Teleports active player to random X position on terrain |
| **GRAVITY FLUX** | Sets gravity to random value (0.1-0.5) for the round |
| **VOID ANOMALY** | Spawns neutral purple projectile from sky that damages both players |
| **VOID SIPHON** | Steals 15 HP from opponent, gives to active player |

### New Physics-Heavy Events (10)
| Event | Effect |
|-------|--------|
| **TIME DILATION** | Projectile velocity scaled to 60% |
| **HYPER GRAVITY** | Gravity set to 0.6-0.9 (extreme pull) |
| **ZERO-G** | Gravity set to 0.02 (floaty shots) |
| **INVERTED GRAVITY** | Gravity becomes -0.2 (shots arc upward) |
| **WIND BLAST** | Constant horizontal force ±0.15-0.35 applied to projectiles |
| **ELASTIC WORLD** | +2 extra bounces for all projectiles |
| **MUZZLE OVERCHARGE** | Launch velocity boosted +50% |
| **MUZZLE DAMPEN** | Launch velocity reduced -40% |
| **RECOIL KICK** | Firing tank gets pushed backward on shot |
| **VOID SURGE** | Void rises 2x extra after the shot resolves |

### Event System Behavior
- **100% trigger rate** — Every round has a glitch event
- **Round persistence** — Same glitch applies to BOTH players in a round
  - Player 1's turn: New glitch rolled
  - Player 2's turn: Same glitch persists
  - Next round: New glitch rolled
- **Automatic reversion** — Temporary effects (gravity, velocity, bounces) reset at round end

### State Properties Added to `main.js`
```javascript
// In state object:
gravity: DEFAULT_GRAVITY,      // Dynamic gravity (was constant)
activeEvent: null,             // { name, color, timer }
originalTankType: null,        // For ARSENAL GLITCH revert
originalGravity: undefined,    // For gravity event revert
anomalyProjectile: null,       // For VOID ANOMALY
velocityMultiplier: 1.0,       // For velocity events
wind: 0,                       // For WIND BLAST
extraBounces: 0,               // For ELASTIC WORLD
recoilPending: false,          // For RECOIL KICK
voidSurgePending: false        // For VOID SURGE
```

### Integration Points in `main.js`
- `fireProjectile()`: Applies velocity multiplier, extra bounces, recoil kick
- `updateProjectile()`: Applies wind force
- `updateClusterBomblet()`: Applies wind force
- `updateAnomalyProjectile()`: Applies wind force, handles anomaly physics
- `endTurn()`: Reverts events at round end, rolls new events at round start
- `startGame()`: Rolls initial glitch event
- `rollNewGlitchEvent()`: Helper function to apply events with audio/visual feedback

### UI Additions
- "ROUND GLITCH" banner displayed when event is active
- Event name shown in event's color with glow
- Event-specific info displayed:
  - Gravity value for gravity events
  - Wind direction arrows for WIND BLAST
  - Velocity percentage for muzzle events
  - Bounce count for ELASTIC WORLD
  - Warning text for VOID SURGE and RECOIL KICK

### Audio Addition in `src/audio.js`
- `playGlitch()`: Distorted multi-oscillator sound with rapid frequency changes and noise burst

---

## Feature 2: Enhanced Particle Effects

### Complete Overhaul of `src/particles.js`

#### New Particle Types
- **`'circle'`** — Standard glowing particle (default)
- **`'streak'`** — Velocity-based line for debris and fast sparks
- **`'square'`** — Rotating debris chunks
- **`'glow'`** — Extra bloom/soft glow particles

#### New Shockwave Class
```javascript
class Shockwave {
    // Expanding ring effect with fade
    // Properties: x, y, radius, maxRadius, expandSpeed, color, lineWidth, life
}
```

#### Enhanced Particle Properties
- `type` — Particle shape type
- `rotation` / `rotationSpeed` — For spinning debris
- `glowIntensity` — Controls bloom amount
- `fadeInTime` — Delay before full opacity
- `scale` / `scaleDecay` — Size animation

#### Explosion Method — 7 Layered Effects
1. **Core flash** — Bright white glow particles at center
2. **Main explosion** — Mixed circles and squares in weapon color
3. **Hot core** — Yellow/white center particles
4. **Debris streaks** — Fast, thin lines flying outward
5. **Smoke plume** — Slow, rising gray particles
6. **Shockwave rings** — Two expanding rings (color + white)
7. **Scatter sparks** — Delayed yellow streaks

#### Enhanced Methods
| Method | Enhancement |
|--------|-------------|
| `explosion()` | 2.5x particles, 7 layers, scales with blast radius |
| `sparks()` | 2x particles, streak-based, mini shockwave |
| `trail()` | Glow particles with occasional white sparkles |

#### Performance Limits
- `MAX_PARTICLES = 800`
- `MAX_SHOCKWAVES = 10`
- Hard cap with array slice if exceeded

### Changes to `src/main.js` for Particles

#### `onExplode()` Enhancements
- 1.5x particle count
- Passes `blastRadius` to explosion for scaling
- Stronger screen shake: `blastRadius / 2.5` (was `/4`)
- Brighter flash: `0.25` alpha (was `0.15`)
- Extra sparks on player hit
- Extra explosion at player position on kill

#### Bounce Enhancements
- 25 sparks (was 15)
- Screen shake 8 (was 5)
- Subtle yellow flash added

#### Cluster Split Enhancements
- 40 yellow sparks + 25 color sparks
- Screen shake 12 (was 8)
- Yellow flash + pop sound

#### Anomaly Explosion Enhancements
- 80 particles (was 50)
- Screen shake 25 (was 15)
- Brighter flash

### Changes to `src/renderer.js`
- Max screen shake increased: `30 → 50`

---

## Feature 3: Removed Time Effects (Felt Like Lag)

### Disabled Constants
```javascript
const FREEZE_FRAME_MS = 0;      // Was 60 - disabled
const SLOW_MO_DURATION_MS = 0;  // Was 600 - disabled
```

### Reasoning
- Freeze frames on hit felt like performance lag, not impact
- Slow-mo on kills also felt unresponsive
- Screen shake and visual particles provide enough feedback

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/events.js` | **CREATED** | Complete glitch events system (15 events) |
| `src/main.js` | **MODIFIED** | Event integration, particle enhancements, disabled time effects |
| `src/audio.js` | **MODIFIED** | Added `playGlitch()` sound |
| `src/particles.js` | **MODIFIED** | Complete overhaul with layered effects |
| `src/renderer.js` | **MODIFIED** | Increased max screen shake |

---

## Testing Checklist

### Glitch Events
- [ ] Events trigger every round (100%)
- [ ] Same event persists for both players in a round
- [ ] New event rolls at start of each round
- [ ] All 15 events function correctly
- [ ] Event notification displays with correct color and info
- [ ] Events revert properly at round end

### Particle Effects
- [ ] Explosions have visible shockwave rings
- [ ] Debris streaks fly outward
- [ ] Smoke rises from explosions
- [ ] Sparks on bounces feel impactful
- [ ] Cluster split has satisfying pop effect
- [ ] Performance remains stable (check particle count)

### Screen Feedback
- [ ] Screen shake feels impactful, not excessive
- [ ] No pause/freeze on hits (should feel instant)
- [ ] No slow-mo (disabled)
- [ ] Flashes provide hit confirmation

---

## Known Issues / Notes
- Favicon 404 is harmless (no icon file exists)
- Browser may cache old particles.js — hard refresh (Ctrl+Shift+R) if effects don't appear
