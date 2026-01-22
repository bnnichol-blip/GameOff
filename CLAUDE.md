# VOID ARTILLERY

*A game jam entry for "Game Off" January 2026*

**Theme:** "One Button Away"  
**Deadline:** Wednesday 11:59pm CT  
**Time Budget:** 20 hours maximum  
**Target:** Win the $300 prize

---

## The Game

**VOID ARTILLERY** is a 2D artillery duel with two hooks that set it apart:

1. **Ricochet** — All projectiles bounce off walls and ceiling
2. **The Rising Void** — After each round, the floor rises, shrinking the arena

Two players (or player vs AI). Take turns. Aim, charge, fire. Last tank standing wins.

### Core Loop
1. Adjust aim (arrow keys or mouse)
2. HOLD [Space] to charge power
3. RELEASE to fire — *one button, committed*
4. Watch the shot arc, bounce, and (hopefully) connect
5. Opponent's turn
6. **Void rises**
7. Repeat until someone dies

### Win Conditions
- Enemy health reaches 0
- Enemy touches the void
- Enemy's terrain is destroyed and they fall into the void

---

## Visual Style

**Geometry Wars meets Tron.** No sprites. No art assets. Just shapes, glow, and particles.

- **Background:** Pure black with subtle grid
- **Tanks:** Angular geometric shapes (hexagons, triangles)
- **Terrain:** Dark fill with bright neon edge lines
- **Projectiles:** Glowing shapes with particle trails
- **Void:** Pulsing gradient, corrupted/glitchy edge, rises from below
- **Explosions:** Particle bursts, screen flash, bloom

**Color palette:**
- Cyan `#00ffff` — Player 1, UI elements
- Magenta `#ff00ff` — Player 2, danger
- Yellow `#ffff00` — Highlights, charge meter
- White `#ffffff` — Explosions, impacts
- Deep purple `#1a0033` — Void gradient top
- Black `#000000` — Background

**Glow effect (critical for the look):**
```javascript
ctx.shadowBlur = 20;
ctx.shadowColor = '#00ffff';
// Everything drawn now glows
```

---

## The Tanks

Three tanks, three weapons, three playstyles:

| Tank | Weapon | Damage | Blast Radius | Bounces | Character |
|------|--------|--------|--------------|---------|-----------|
| **SIEGE** | Mortar | Medium | Large | 1 | Forgiving, consistent, area denial |
| **PHANTOM** | Railgun | High | None (direct hit only) | 2 | Precision, trick shots, high skill |
| **CHAOS** | Cluster | Low × 5 | Small × 5 | 1 each | Spray, chaos, chip damage |

### Balance Philosophy
- **SIEGE** is the beginner pick — easy to deal damage, hard to master
- **PHANTOM** is the skill pick — feast or famine, highlight reel potential
- **CHAOS** is the wild card — low individual damage but hard to fully dodge

---

## Mechanics Detail

### Aiming & Firing
- Aim angle: 0° (flat right) to 180° (flat left)
- Power: 0-100%, controlled by hold duration
- Charge time: ~2 seconds for full power
- Visual: Power meter fills, charging SFX rises in pitch
- On release: Projectile spawns, turn is committed

### Projectile Physics
- Gravity pulls projectiles down (standard parabolic arc)
- Bounces preserve energy (or lose ~10% per bounce for feel)
- Bounce limit is per-weapon (see tank table)
- Projectile despawns after final bounce + 2 seconds or leaving arena

### Ricochet Rules
- Bounces off left wall, right wall, and ceiling
- Does NOT bounce off terrain (explodes on terrain contact)
- Does NOT bounce off void (explodes/despawns)
- Bounce angle = reflection angle (angle of incidence)
- Brief flash/particle burst on bounce for visual feedback

### The Rising Void
- Starts below the visible arena
- Rises by fixed amount after each ROUND (both players have fired)
- Rise amount: ~5% of arena height per round
- Visual: Pulsing, corrupted gradient with glitchy edge
- Audio: Ambient hum that increases in pitch/intensity as it rises
- Contact = instant death (no damage, just death)
- Also destroys terrain it touches

### Terrain
- Generated or preset terrain shapes
- Destructible: Explosions remove terrain in blast radius
- Tanks sit on terrain; if terrain beneath them is destroyed, they fall
- Terrain does NOT regenerate

### Health
- Each tank has 100 HP
- Damage is dealt by explosions based on distance from blast center
- Siege mortar: 50 damage at center, falloff to 10 at edge
- Phantom railgun: 70 damage (direct hit or nothing)
- Chaos cluster: 15 damage per bomblet at center

---

## Juice Checklist

These effects make impacts feel IMPACTFUL:

- [ ] **Screen shake** — intensity scales with damage dealt
- [ ] **Freeze frame** — 50-80ms pause on hit, before explosion plays
- [ ] **Slow-mo** — killing blow plays at 25% speed for 500ms
- [ ] **Particles** — 50+ particles per explosion, inherit some velocity
- [ ] **Glow/bloom** — all neon elements have shadowBlur
- [ ] **Projectile trails** — fading trail behind moving projectiles
- [ ] **Charge SFX** — rising tone while holding fire button
- [ ] **Impact SFX** — bass-heavy boom, varies by weapon
- [ ] **Bounce SFX** — sharp ping/ricochet sound
- [ ] **Void hum** — ambient drone, pitch rises as void rises
- [ ] **Flash on hit** — screen flashes white/weapon color briefly
- [ ] **Camera zoom** — subtle punch zoom on explosions

---

## Technical Approach

**Stack:** Vanilla JavaScript + HTML Canvas

Why:
- No engine overhead
- Perfect for geometry-based visuals
- Fast iteration
- Easy web build for judges
- Claude generates clean canvas code

### File Structure
```
/void-artillery
  index.html          # Entry point
  /src
    main.js           # Game initialization, loop
    game.js           # Game state, turn management
    tank.js           # Tank class, aiming, firing
    projectile.js     # Projectile physics, bouncing
    terrain.js        # Terrain generation, destruction
    void.js           # Rising void logic
    particles.js      # Particle system
    renderer.js       # All drawing code
    input.js          # Keyboard/mouse handling
    audio.js          # Sound effects, music
    ui.js             # Menus, HUD, health bars
    utils.js          # Math helpers, collision detection
  /assets
    /audio            # Sound files (can generate or use freesound.org)
  README.md
```

### Architecture Notes
- Separate game logic from rendering (helps Claude code score)
- Game state is a plain object, easy to inspect/debug
- Renderer takes state and draws it — no side effects
- Input system queues actions, game loop processes them
- Keep classes focused — a Tank doesn't know about rendering

### Key Math
```javascript
// Parabolic motion
x = x0 + vx * t
y = y0 + vy * t + 0.5 * gravity * t²

// Reflection (bounce)
vx = -vx  // horizontal wall
vy = -vy  // ceiling

// Distance for damage falloff
dist = Math.sqrt((x1-x2)² + (y1-y2)²)
damage = maxDamage * (1 - dist / blastRadius)
```

---

## Hour Budget

| Phase | Hours | Deliverable |
|-------|-------|-------------|
| **Core** | 1-5 | Two tanks, aiming, power charge, firing, gravity, terrain, hit detection, turn system, win condition |
| **Hooks** | 6-9 | Ricochet physics (walls + ceiling), rising void, void death, terrain destruction |
| **Tanks** | 10-12 | Three tank types with unique weapons, tank select screen |
| **Juice** | 13-16 | Particles, screen shake, freeze frames, glow, trails, SFX |
| **Polish** | 17-19 | Title screen, music, AI opponent (simple), visual polish |
| **Ship** | 20 | README, code cleanup, final testing, GitHub push |

### Scope Rules
- **Hour 5 checkpoint:** The game must be playable (ugly is fine)
- **Hour 12 checkpoint:** All three tanks working, both hooks functional
- If behind schedule, cut AI opponent first, then cut tank #3
- Never cut juice — it's worth more points than features

---

## Scoring Priorities

The contest scores on:

| Category | Points | Owner | Priority |
|----------|--------|-------|----------|
| Fun | 25 | Connor | 🔥 HIGHEST |
| Game Design | 30 | Connor (15) + Claude (15) | High |
| Code Quality | 10 | Claude | Medium |
| Architecture | 10 | Claude | Medium |
| Presentation | 10 | Connor | Medium |
| Documentation | 5 | Claude | Low |

**Translation:**
1. Make it FUN first — "would I play again?" is 25% of the score
2. Make it JUICY — this is what makes it fun and impressive
3. Keep code clean and organized — Claude is judging
4. Polish the presentation — title screen, consistent style
5. Write a good README — easy points

---

## AI Opponent (if time allows)

Simple but functional:
- Random angle within reasonable range toward player
- Random power 50-80%
- Maybe bias toward higher angle (mortar-style)
- No pathfinding, no terrain analysis
- Just needs to be a credible opponent for solo play

---

## README Template

```markdown
# VOID ARTILLERY

A neon artillery dueling game where the void is rising.

## Play
[Link to playable web build]

## Controls
- **Arrow Keys / Mouse** — Aim
- **Hold Space** — Charge shot power
- **Release Space** — Fire

## How to Play
1. Select your tank
2. Aim your shot
3. Hold space to charge, release to fire
4. Shots bounce off walls and ceiling
5. After each round, the void rises
6. Last tank standing wins

## Tanks
- **SIEGE** — Mortar with large blast radius (1 bounce)
- **PHANTOM** — Railgun with high damage, direct hit only (2 bounces)
- **CHAOS** — Cluster bomb that splits into 5 bomblets (1 bounce each)

## Credits
- Developed by [Name] for Game Off January 2026
- Sound effects from [source]
- Built with vanilla JavaScript + HTML Canvas

## Dev Log Summary
- Total hours: XX/20
- [Link to daily dev log posts]
```

---

## Dev Log Template

Post daily in Discord:

```
**Day X — [Date]**
Hours today: X
Total hours: X/20

What I did:
- [Accomplishment 1]
- [Accomplishment 2]

Tomorrow:
- [Next priority]

[Optional: Screenshot or GIF]
```

---

## Quick Reference

### Keyboard
| Key | Action |
|-----|--------|
| ← → | Aim left/right |
| ↑ ↓ | Aim up/down (alternate) |
| Space (hold) | Charge power |
| Space (release) | Fire |
| Enter | Confirm selection |
| Esc | Pause/menu |

### Game Constants (tweak for feel)
```javascript
const GRAVITY = 0.3;
const MAX_POWER = 15;
const CHARGE_RATE = 0.02;        // 0-1 over ~2 sec
const VOID_RISE_PER_ROUND = 30;  // pixels
const SCREEN_SHAKE_DECAY = 0.9;
const FREEZE_FRAME_MS = 60;
```

---

## Remember

1. **Fun is the goal.** Every decision should serve "would I play this again?"
2. **Juice is not optional.** Screen shake, particles, and sound make a mediocre game feel good.
3. **Commit often.** Git push at the end of every session.
4. **Playtest early.** Get the core loop working before adding features.
5. **Scope down, not up.** A polished small game beats an ambitious broken one.

---

*Good luck. Make something fun.*
