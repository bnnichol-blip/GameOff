# VOID ARTILLERY — Core Phase Implementation Plan

## Goal
Complete the **Core phase (Hours 1-5)** to reach a playable prototype: two tanks, terrain, turns, damage, and win conditions.

---

## Current State
**Already built:**
- Game loop, renderer with glow/shake/flash
- Particle system (explosions, sparks, trails)
- Input handling (keyboard + mouse)
- Single tank with aim + power charge
- Projectile physics with wall/ceiling bouncing
- Rising void with gradient + glitch effect

**Missing for playable:**
- Terrain system
- Second player + turn system
- Health + damage
- Win conditions

---

## Implementation Steps

### Step 1: Terrain System
**File:** `src/terrain.js`

**Create terrain module with:**
- `heights` — Float32Array of Y values, length = `CANVAS_WIDTH` (dynamic, not hardcoded)
- `generate(width)` — rolling hills using layered sine waves
- `getHeightAt(x)` — returns terrain Y with interpolation
- `isPointBelowTerrain(x, y)` — collision check
- `destroy(x, y, radius)` — carve semicircular crater
- `draw(renderer)` — dark fill + glowing edge line

**Generation formula:**
```javascript
function generate(width) {
    heights = new Float32Array(width);
    const baseY = 500;
    for (let x = 0; x < width; x++) {
        let y = baseY
            + 80 * Math.sin(x * 0.005)      // Large hills
            + 40 * Math.sin(x * 0.015)      // Medium variation
            + 15 * Math.sin(x * 0.04);      // Small bumps

        // Clamp to valid range (Gemini suggestion)
        y = Math.max(150, Math.min(y, CANVAS_HEIGHT - 50));
        heights[x] = y;
    }
}
```

**Crater destruction (explicit formula per Codex):**
```javascript
function destroy(cx, cy, radius) {
    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(heights.length - 1, Math.ceil(cx + radius));

    for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        // Semicircle depth calculation
        const depth = Math.sqrt(radius * radius - dx * dx);
        const craterBottom = cy + depth;

        // Only lower terrain, never raise it
        if (craterBottom > heights[x]) {
            heights[x] = craterBottom;
        }
    }
}
```

**Integration in main.js:**
1. Import terrain
2. Call `terrain.generate(CANVAS_WIDTH)` in `init()`
3. Replace temp ground line with `terrain.draw(renderer)`
4. Update projectile to explode on terrain contact

---

### Step 2: Two-Player State
**File:** `src/main.js` (refactor state object)

**New state structure:**
```javascript
const state = {
    players: [
        { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan },
        { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta }
    ],
    currentPlayer: 0,
    turnCount: 0,              // Total turns taken (for round calculation)
    phase: 'aiming',           // 'aiming' | 'firing' | 'resolving' | 'gameover'
    projectile: null,
    voidY: CANVAS_HEIGHT + 50,
    winner: null
};

// Derived value (Codex suggestion)
function getCurrentRound() {
    return Math.floor(state.turnCount / 2) + 1;
}
```

**Tank positioning:**
- Set each tank's Y to terrain height at spawn: `player.y = terrain.getHeightAt(player.x) - TANK_RADIUS`
- Player 1: left third (~200px from left)
- Player 2: right third (~200px from right)

**Self-damage: ENABLED** — Players can damage themselves (adds skill ceiling)

---

### Step 3: Turn System
**File:** `src/main.js` (update loop)

**Phase flow:**
1. **aiming:** Active player controls aim/charge, space release fires
2. **firing:** Projectile in flight, no input accepted
3. **resolving:** On projectile end → apply damage, destroy terrain, check win, **wait 800ms**, then switch turn
4. **gameover:** Display winner, wait for restart input

**Input gating (Gemini suggestion):**
```javascript
function update(dt) {
    // Only accept aim/charge input during aiming phase
    if (state.phase === 'aiming') {
        if (input.left) player.angle = clamp(player.angle + 2, 0, 180);
        if (input.right) player.angle = clamp(player.angle - 2, 0, 180);
        // ... charging logic
    }
}
```

**Projectile termination rules (Codex suggestion):**
Projectile ends (triggers resolving phase) when ANY of:
- Hits terrain (`terrain.isPointBelowTerrain(x, y)`)
- Hits void (`y > state.voidY`)
- Goes out of bounds (`y > CANVAS_HEIGHT + 100`)
- Exceeds max bounces (already implemented)

**Turn transition with delay (Claude/Gemini suggestion):**
```javascript
function endTurn() {
    state.phase = 'resolving';

    setTimeout(() => {
        state.turnCount++;
        state.currentPlayer = 1 - state.currentPlayer;

        // Void rises every full round (after both players fire)
        const newRound = getCurrentRound();
        if (state.turnCount % 2 === 0) {
            state.voidY -= VOID_RISE_PER_ROUND;  // 30 pixels
        }

        state.phase = 'aiming';
    }, 800);  // 800ms delay for visual feedback
}
```

---

### Step 4: Damage System
**File:** `src/main.js` (in onExplode)

**On explosion:**
1. `terrain.destroy(x, y, BLAST_RADIUS)`
2. For each player (including self), calculate distance from blast center
3. Apply damage with linear falloff, **clamped to 0** (Codex suggestion):
   ```javascript
   const damage = Math.max(0, MAX_DAMAGE * (1 - dist / BLAST_RADIUS));
   ```
4. Clamp health to 0 minimum

**Constants:**
- `BLAST_RADIUS = 60`
- `MAX_DAMAGE = 50`

---

### Step 5: Win Conditions & Tank Falling
**File:** `src/main.js`

**Check after each turn resolves:**
1. Health ≤ 0 → opponent wins
2. Tank Y + radius > voidY → opponent wins
3. Tank falling (no ground beneath) → track fall until void or land

**Tank falling logic (complete, per Claude/Codex):**
```javascript
function updateTankPhysics(player, dt) {
    const groundY = terrain.getHeightAt(player.x);
    const tankBottom = player.y + TANK_RADIUS;

    if (tankBottom < groundY) {
        // Tank is above ground — fall
        player.vy += GRAVITY;
        player.y += player.vy;

        // Check if landed
        if (player.y + TANK_RADIUS >= groundY) {
            player.y = groundY - TANK_RADIUS;  // Snap to ground
            player.vy = 0;                      // Stop falling
        }
    }
}
```

---

### Step 6: Basic UI Updates
**File:** `src/main.js` (render function)

**Add:**
- Health bars above each tank (small rect, fill proportional to health)
- "PLAYER 1 TURN" / "PLAYER 2 TURN" indicator (use player's color)
- Game over overlay: "PLAYER X WINS - Press ENTER to restart"

**Tank rendering note:** Player 2's angle (135°) should render turret facing left. The existing formula `180 - tank.angle` handles this — verify during testing.

---

### Step 7: Game Reset
**File:** `src/main.js`

**resetGame() function (Claude suggestion):**
```javascript
function resetGame() {
    terrain.generate(CANVAS_WIDTH);

    state.players[0] = { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan };
    state.players[1] = { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta };

    // Position tanks on new terrain
    state.players.forEach(p => {
        p.y = terrain.getHeightAt(p.x) - TANK_RADIUS;
    });

    state.currentPlayer = 0;
    state.turnCount = 0;
    state.phase = 'aiming';
    state.projectile = null;
    state.voidY = CANVAS_HEIGHT + 50;
    state.winner = null;
}
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/terrain.js` | CREATE — terrain system |
| `src/main.js` | MODIFY — state, turns, damage, win conditions, UI, reset |

---

## Verification

1. **Open `index.html` in browser**
2. **Test terrain:**
   - Hills visible with glowing edge
   - Terrain heights stay within screen bounds
   - Projectile explodes on terrain contact
   - Crater appears where explosion hit (semicircular shape)
3. **Test turns:**
   - Player 1 fires, ~800ms delay, then Player 2's turn
   - Input ignored during firing/resolving phases
   - Void rises after both players have fired (every full round)
4. **Test damage:**
   - Health bar decreases on hit
   - Near-hit deals less damage than direct hit
   - Self-damage works (shoot yourself)
   - No negative damage (healing)
5. **Test win conditions:**
   - Reduce health to 0 → game over screen
   - Tank touches void → game over screen
   - Destroy ground under tank → tank falls, lands or dies
6. **Test restart:**
   - Press ENTER on game over → new terrain, reset positions/health

---

## After Core Phase
With this complete, you'll have a **playable 2-player artillery game** — ugly but functional. Next phases:
- **Hooks (6-9):** Already have ricochet; polish void behavior
- **Tanks (10-12):** Three weapon types, tank select
- **Juice (13-16):** More particles, freeze frames, audio
- **Polish (17-19):** Title screen, AI, visual cleanup
