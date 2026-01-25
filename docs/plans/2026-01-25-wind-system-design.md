# Wind System Design

**Date:** 2026-01-25
**Status:** Ready for Implementation

---

## Overview

A persistent wind system that increases the game's skill cap by requiring players to mentally compensate for projectile drift. Wind changes each round, affecting all players equally. The existing WIND BLAST glitch event becomes an amplifier that creates brutal conditions.

---

## Core Mechanics

### Wind State
- New `state.baseWind` value ranging from **-0.08 to +0.08**
- Negative = leftward force, Positive = rightward force
- Zero wind possible (~15% chance for calm rounds)
- Wind applies every frame to all projectiles: `proj.vx += state.wind`

### Wind Value Generation
```javascript
function rollNewWind() {
    if (Math.random() < 0.15) return 0; // 15% calm
    const magnitude = 0.02 + Math.random() * 0.06; // 0.02 to 0.08
    const direction = Math.random() < 0.5 ? -1 : 1;
    return magnitude * direction;
}
```

### Round Transitions
- At the start of each round, roll new wind value
- Display "WIND SHIFT" announcement for ~1.5 seconds before first player's turn
- Show arrow direction and strength: `"<<< 0.06"` or `">> 0.04"` or `"~ CALM ~"`
- Round 1: No announcement (nothing to shift from), but wind is active

### WIND BLAST Glitch Integration
- When WIND BLAST glitch is active, multiply base wind by **3x** AND add random ±0.10
- Results in brutal conditions (effective wind up to ±0.34)
- If base wind was calm, WIND BLAST creates sudden strong wind (±0.12 to ±0.18)
- Clamp to ±0.35 max to prevent broken physics

```javascript
// During WIND BLAST activation:
state.wind = state.baseWind * 3 + (Math.random() - 0.5) * 0.2;
state.wind = Math.max(-0.35, Math.min(0.35, state.wind));

// When glitch ends:
state.wind = state.baseWind;
```

### Trajectory Preview
- Existing aiming line ignores wind entirely
- Shows the "ideal" no-wind trajectory
- Players must mentally compensate for drift
- This is intentional for higher skill ceiling

---

## Visualization

### HUD Wind Indicator
- **Position:** Top-center of screen, below round/turn info
- **Format:** Arrow symbols + numeric value
- **Examples:**
  - `"<<< 0.07"` (strong left wind)
  - `"> 0.02"` (light right wind)
  - `"~ CALM ~"` (no wind)
- **Color:** Cyan (`#00ffff`) for normal, Magenta (`#ff00ff`) during WIND BLAST
- Subtle pulsing glow to draw attention without distraction

### Wind Streak Particles
- Horizontal particle lines drifting across the screen
- Spawn from upwind edge, travel to downwind edge
- Speed and density scale with wind intensity:
  - **Calm:** No particles
  - **Light (0.01-0.03):** Sparse, slow wisps
  - **Moderate (0.04-0.06):** Regular streaks
  - **Strong (0.07+):** Dense, fast streaks
- **Color:** White with low opacity (`rgba(255,255,255,0.15)`)
- **During WIND BLAST:** Magenta tint, higher opacity, more chaotic motion

### Wind Shift Announcement
- Full-screen text: `"WIND SHIFT"` with new indicator below
- Duration: 1.5 seconds, fades out
- Plays during pause between rounds (before lottery)

---

## AI Behavior

### Wind Compensation
- AI already has wind compensation code (main.js line 4301-4304)
- Extend to handle persistent wind, not just glitch events
- Compensation formula: `aiTargetAngle += -wind * compensationFactor`
- Add slight randomness to AI compensation (±10%) so AI isn't perfect
- Stronger AI difficulty = better wind reading

---

## Implementation Plan

### Files to Modify

| Component | File | Changes |
|-----------|------|---------|
| Wind state | `main.js` | Add `state.baseWind`, modify `state.wind` calculation |
| Roll new wind | `main.js` | Call `rollNewWind()` in `startNewRound()` |
| Apply to projectiles | `main.js` | Already exists (line 1222), ensure `state.wind = state.baseWind` |
| HUD indicator | `main.js` | New `renderWindIndicator()` in render loop |
| Wind particles | `ambient.js` | New `updateWindStreaks()` / `renderWindStreaks()` |
| Announcement | `main.js` | Add to round transition flow |
| AI compensation | `main.js` | Extend existing code (line 4301) |
| WIND BLAST glitch | `events.js` or `main.js` | Modify to amplify base wind |

### Implementation Steps

1. **Add wind state** - `state.baseWind`, `rollNewWind()` function
2. **Hook into round start** - Roll wind in `startNewRound()`, set `state.wind = state.baseWind`
3. **Add HUD indicator** - `renderWindIndicator()` showing direction/strength
4. **Add wind particles** - Streaks in `ambient.js` based on `state.wind`
5. **Add wind shift announcement** - Brief overlay during round transitions
6. **Update WIND BLAST** - Amplify base wind instead of setting arbitrary value
7. **Extend AI compensation** - Apply to persistent wind, add imperfection

---

## Special Weapon Considerations

| Weapon | Wind Behavior |
|--------|---------------|
| Railgun (hitscan) | Unaffected - instant beam |
| Meteor Shower | Falling meteors affected by wind |
| Seeker/homing | Wind applies, but homing corrects |
| Orbital strikes | Unaffected - coming from space |
| All others | Normal wind physics |

---

## Verification Checklist

- [ ] Wind indicator visible and updating each round
- [ ] Wind streaks match indicator direction/intensity
- [ ] Projectiles visibly curve in wind
- [ ] Trajectory preview does NOT show wind curve
- [ ] AI compensates reasonably (not perfectly)
- [ ] WIND BLAST creates dramatically stronger conditions
- [ ] Calm rounds feel distinct (no particles, "CALM" indicator)
- [ ] Round 1 has wind active but no "WIND SHIFT" announcement

---

## Design Rationale

**Why persistent wind?**
- Increases skill cap without adding complexity
- Classic artillery game mechanic players expect
- Enables "impossible" trick shots around terrain

**Why variable intensity with calm rounds?**
- Keeps each round feeling fresh
- Calm rounds provide relief and contrast
- Brutal conditions reserved for WIND BLAST glitch (special, not constant)

**Why no-wind trajectory preview?**
- Higher skill ceiling - rewards experience and intuition
- Mental compensation is satisfying when mastered
- Differentiates skilled players from beginners

---

*Last Updated: 2026-01-25*
