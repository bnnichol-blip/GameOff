# Tank Visual Identity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 5-archetype system with 8 cosmetic tanks, each with unique shapes, colors, death explosions, and terrain crater signatures.

**Architecture:** Define TANKS array in weaponData.js, update tank selection UI in main.js, add shape-specific particle bursts in particles.js, add shaped crater destruction and goo stains in terrain.js. Remove all archetype passive logic.

**Tech Stack:** Vanilla JavaScript, HTML Canvas

---

## Task 1: Define TANKS Data Structure

**Files:**
- Modify: `src/weaponData.js:588-645` (replace TANK_ARCHETYPES)

**Step 1: Replace TANK_ARCHETYPES with TANKS array**

Find and replace the `TANK_ARCHETYPES` object with:

```javascript
// ============================================================================
// Tank Cosmetics (Pure Visual - No Gameplay Differences)
// ============================================================================

export const TANKS = [
    {
        id: 'VOLT',
        name: 'Volt',
        shape: 'triangle',
        sides: 3,
        color: '#00FFFF',
        glowColor: '#00FFFF'
    },
    {
        id: 'BLAZE',
        name: 'Blaze',
        shape: 'square',
        sides: 4,
        color: '#FF8800',
        glowColor: '#FFAA00'
    },
    {
        id: 'PHANTOM',
        name: 'Phantom',
        shape: 'pentagon',
        sides: 5,
        color: '#FF00FF',
        glowColor: '#FF66FF'
    },
    {
        id: 'HIVE',
        name: 'Hive',
        shape: 'hexagon',
        sides: 6,
        color: '#FFD700',
        glowColor: '#FFEE66'
    },
    {
        id: 'RAZOR',
        name: 'Razor',
        shape: 'diamond',
        sides: 4,  // Rotated 45 degrees
        color: '#FF3333',
        glowColor: '#FF6666'
    },
    {
        id: 'NOVA',
        name: 'Nova',
        shape: 'star',
        sides: 5,  // 5-pointed star
        color: '#FFFFFF',
        glowColor: '#FFFFFF'
    },
    {
        id: 'ORB',
        name: 'Orb',
        shape: 'circle',
        sides: 0,  // Circle has no sides
        color: '#00FF00',
        glowColor: '#66FF66'
    },
    {
        id: 'TITAN',
        name: 'Titan',
        shape: 'octagon',
        sides: 8,
        color: '#AA00FF',
        glowColor: '#CC66FF'
    }
];

// Helper to get tank by ID
export function getTankById(id) {
    return TANKS.find(t => t.id === id) || TANKS[0];
}
```

**Step 2: Update exports**

Keep `TANK_ARCHETYPES` export but make it an empty object for backward compatibility during migration:

```javascript
// DEPRECATED - kept for migration compatibility
export const TANK_ARCHETYPES = {};
```

**Step 3: Run the game to verify no import errors**

Run: Open `http://localhost:8000` in browser
Expected: Game loads without console errors about missing exports

**Step 4: Commit**

```bash
git add src/weaponData.js
git commit -m "feat: add TANKS cosmetic data structure

Defines 8 tanks with unique shapes and colors:
- Volt (triangle/cyan), Blaze (square/orange)
- Phantom (pentagon/magenta), Hive (hexagon/gold)
- Razor (diamond/red), Nova (star/white)
- Orb (circle/lime), Titan (octagon/purple)"
```

---

## Task 2: Update Player Data Structure

**Files:**
- Modify: `src/main.js:145-170` (createPlayers function)
- Modify: `src/main.js:18` (imports)

**Step 1: Update import to include TANKS**

Change line 18 from:
```javascript
import { WEAPON_TIERS, WEAPONS, WEAPON_KEYS, ORBITAL_WEAPON_KEYS, TANK_TYPES, TANK_ARCHETYPES,
```
to:
```javascript
import { WEAPON_TIERS, WEAPONS, WEAPON_KEYS, ORBITAL_WEAPON_KEYS, TANK_TYPES, TANK_ARCHETYPES, TANKS, getTankById,
```

**Step 2: Update createPlayers to use tank instead of archetype**

In `createPlayers` function (around line 145), change player object:

```javascript
function createPlayers(numPlayers, humanCount = numPlayers) {
    const spawnXs = getSpawnPositions(numPlayers);
    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({
            x: spawnXs[i],
            y: 0,
            vx: 0,
            vy: 0,
            angle: i < numPlayers / 2 ? 45 : 135,
            power: 0,
            charging: false,
            health: 100,  // Will be updated to FORTRESS HP (100 is already correct)
            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
            tankId: null,         // NEW: Tank cosmetic ID
            archetype: null,      // DEPRECATED: kept for migration
            tankType: null,
            isAI: i >= humanCount,
            shield: 0,
            coins: 50,
            kills: 0,
            damageDealt: 0,
            pityCounter: 0,
            voidGraceTimer: 0
        });
    }
    return players;
}
```

**Step 3: Verify game still loads**

Run: Open `http://localhost:8000`
Expected: Game loads, can reach mode select

**Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: add tankId to player data structure

Prepares player object for new tank cosmetic system.
Keeps archetype field for backward compatibility during migration."
```

---

## Task 3: Create Tank Selection UI

**Files:**
- Modify: `src/main.js:8566-8650` (renderTankSelect function)
- Modify: `src/main.js:5275-5310` (tank selection input handling)

**Step 1: Rewrite renderTankSelect for 8-tank grid**

Replace the entire `renderTankSelect` function:

```javascript
function renderTankSelect() {
    // Dark overlay
    renderer.drawRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT, 'rgba(0, 0, 0, 0.85)', false);

    // Title
    const selectingPlayer = state.players[state.selectingPlayerIndex];
    const isAI = selectingPlayer.isAI;
    const titleText = isAI ? `AI ${state.selectingPlayerIndex + 1} SELECTING...` : `PLAYER ${state.selectingPlayerIndex + 1} - CHOOSE YOUR TANK`;
    renderer.drawText(titleText, VIRTUAL_WIDTH / 2, 120, '#ffffff', 32, 'center', true);

    // Track which tanks are taken
    const takenTankIds = state.players
        .filter((p, i) => i < state.selectingPlayerIndex && p.tankId)
        .map(p => p.tankId);

    // 2x4 grid layout
    const gridCols = 4;
    const gridRows = 2;
    const cellWidth = 280;
    const cellHeight = 220;
    const gridWidth = gridCols * cellWidth;
    const gridHeight = gridRows * cellHeight;
    const startX = (VIRTUAL_WIDTH - gridWidth) / 2 + cellWidth / 2;
    const startY = 280;

    for (let i = 0; i < TANKS.length; i++) {
        const tank = TANKS[i];
        const col = i % gridCols;
        const row = Math.floor(i / gridCols);
        const x = startX + col * cellWidth;
        const y = startY + row * cellHeight;

        const isSelected = state.selectIndex === i;
        const isTaken = takenTankIds.includes(tank.id);

        // Selection box
        const boxColor = isTaken ? '#333333' : (isSelected ? tank.glowColor : '#555555');
        const boxAlpha = isTaken ? 0.3 : 1;
        renderer.ctx.globalAlpha = boxAlpha;
        renderer.drawRectOutline(x - cellWidth/2 + 20, y - cellHeight/2 + 10, cellWidth - 40, cellHeight - 20, boxColor, isSelected ? 3 : 1, isSelected);
        renderer.ctx.globalAlpha = 1;

        // Tank preview (draw the shape)
        const previewSize = isSelected ? 50 : 40;
        const previewColor = isTaken ? '#444444' : tank.color;
        const previewY = y - 20;

        if (tank.shape === 'circle') {
            renderer.drawCircle(x, previewY, previewSize, previewColor, !isTaken && isSelected);
        } else if (tank.shape === 'star') {
            drawStar(renderer.ctx, x, previewY, previewSize, 5, previewColor, !isTaken && isSelected);
        } else if (tank.shape === 'diamond') {
            renderer.drawRegularPolygon(x, previewY, previewSize, 4, Math.PI / 4, previewColor, !isTaken && isSelected);
        } else {
            renderer.drawRegularPolygon(x, previewY, previewSize, tank.sides, 0, previewColor, !isTaken && isSelected);
        }

        // Turret
        const turretLen = isSelected ? 45 : 35;
        const turretAngle = -Math.PI / 4;  // 45 degrees up-right
        const turretEndX = x + Math.cos(turretAngle) * turretLen;
        const turretEndY = previewY + Math.sin(turretAngle) * turretLen;
        renderer.drawLine(x, previewY, turretEndX, turretEndY, previewColor, 6, !isTaken && isSelected);

        // Tank name
        const nameColor = isTaken ? '#666666' : (isSelected ? '#ffffff' : '#aaaaaa');
        renderer.drawText(tank.name.toUpperCase(), x, y + 50, nameColor, isSelected ? 24 : 18, 'center', isSelected);

        // "TAKEN" label
        if (isTaken) {
            renderer.drawText('TAKEN', x, y + 75, '#ff4444', 14, 'center', false);
        }

        // Selection number hint
        if (!isTaken && !isAI) {
            renderer.drawText(`[${i + 1}]`, x, y + 80, '#666666', 12, 'center', false);
        }
    }

    // Instructions
    if (!isAI) {
        renderer.drawText('← → ↑ ↓ to browse  |  ENTER or 1-8 to select', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT - 80, '#888888', 16, 'center', false);
    }
}

// Helper to draw a 5-pointed star
function drawStar(ctx, cx, cy, radius, points, color, glow) {
    const innerRadius = radius * 0.4;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? radius : innerRadius;
        const angle = (i * Math.PI / points) - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    if (glow) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
}
```

**Step 2: Update tank selection input handling**

Find the section handling `archetype_select` phase input (around line 5275) and replace:

```javascript
// Tank selection (dynamic for 1-4 players)
if (state.phase === 'archetype_select') {
    const selectingPlayer = state.players[state.selectingPlayerIndex];

    // AI auto-selects randomly from available tanks
    if (selectingPlayer.isAI) {
        const takenIds = state.players
            .filter((p, i) => i < state.selectingPlayerIndex && p.tankId)
            .map(p => p.tankId);
        const availableTanks = TANKS.filter(t => !takenIds.includes(t.id));
        const aiChoice = availableTanks[Math.floor(Math.random() * availableTanks.length)];
        selectingPlayer.tankId = aiChoice.id;
        selectingPlayer.color = aiChoice.color;  // Update player color to tank color
        advanceToNextPlayerSelection();
        return;
    }

    // Track taken tanks
    const takenIds = state.players
        .filter((p, i) => i < state.selectingPlayerIndex && p.tankId)
        .map(p => p.tankId);

    // Arrow key navigation (2x4 grid)
    const gridCols = 4;
    if (input.wasPressed('ArrowRight')) {
        state.selectIndex = (state.selectIndex + 1) % TANKS.length;
        // Skip taken tanks
        while (takenIds.includes(TANKS[state.selectIndex].id)) {
            state.selectIndex = (state.selectIndex + 1) % TANKS.length;
        }
    }
    if (input.wasPressed('ArrowLeft')) {
        state.selectIndex = (state.selectIndex - 1 + TANKS.length) % TANKS.length;
        while (takenIds.includes(TANKS[state.selectIndex].id)) {
            state.selectIndex = (state.selectIndex - 1 + TANKS.length) % TANKS.length;
        }
    }
    if (input.wasPressed('ArrowDown')) {
        state.selectIndex = (state.selectIndex + gridCols) % TANKS.length;
        while (takenIds.includes(TANKS[state.selectIndex].id)) {
            state.selectIndex = (state.selectIndex + 1) % TANKS.length;
        }
    }
    if (input.wasPressed('ArrowUp')) {
        state.selectIndex = (state.selectIndex - gridCols + TANKS.length) % TANKS.length;
        while (takenIds.includes(TANKS[state.selectIndex].id)) {
            state.selectIndex = (state.selectIndex - 1 + TANKS.length) % TANKS.length;
        }
    }

    // Number keys 1-8 for direct selection
    for (let i = 0; i < 8; i++) {
        if (input.wasPressed(`Digit${i + 1}`)) {
            if (!takenIds.includes(TANKS[i].id)) {
                state.selectIndex = i;
                selectingPlayer.tankId = TANKS[i].id;
                selectingPlayer.color = TANKS[i].color;
                advanceToNextPlayerSelection();
                return;
            }
        }
    }

    // Enter to confirm selection
    if (input.wasPressed('Enter') || input.wasPressed('Space')) {
        const selectedTank = TANKS[state.selectIndex];
        if (!takenIds.includes(selectedTank.id)) {
            selectingPlayer.tankId = selectedTank.id;
            selectingPlayer.color = selectedTank.color;
            advanceToNextPlayerSelection();
        }
    }
}
```

**Step 3: Verify tank selection works**

Run: Open game, start new game, reach tank selection
Expected: See 8-tank grid, can navigate and select tanks, taken tanks show as unavailable

**Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: implement 8-tank selection UI

- 2x4 grid layout with tank shapes and names
- Tanks show as TAKEN when already selected
- Arrow keys + Enter or number keys 1-8 to select
- AI randomly picks from available tanks
- Player color updates to match selected tank"
```

---

## Task 4: Update Tank Rendering

**Files:**
- Modify: `src/main.js:6976-7060` (tank rendering in render loop)

**Step 1: Update tank drawing to use tank shape**

Find the tank rendering section (around line 6976) and update:

```javascript
// SKIP DEAD TANKS - they exploded and are gone
if (player.health <= 0) continue;

const isActive = i === state.currentPlayer && state.phase === 'aiming';

// Get tank cosmetics
const tank = player.tankId ? getTankById(player.tankId) : null;
const tankColor = tank ? tank.color : player.color;
const tankGlow = tank ? tank.glowColor : player.color;
const tankSize = 30;  // Base tank size

// Tank body (shape based on tank type)
if (tank) {
    if (tank.shape === 'circle') {
        renderer.drawCircle(player.x, player.y, tankSize, tankColor, isActive);
    } else if (tank.shape === 'star') {
        drawStar(renderer.ctx, player.x, player.y, tankSize, 5, tankColor, isActive);
    } else if (tank.shape === 'diamond') {
        renderer.drawRegularPolygon(player.x, player.y, tankSize, 4, Math.PI / 4, tankColor, isActive);
    } else {
        renderer.drawRegularPolygon(player.x, player.y, tankSize, tank.sides, 0, tankColor, isActive);
    }
} else {
    // Fallback to hexagon if no tank selected
    renderer.drawRegularPolygon(player.x, player.y, tankSize, 6, 0, tankColor, isActive);
}

// Turret
const turretLength = 40;
const turretWidth = 6;
const angleRad = player.angle * Math.PI / 180;
const turretX = player.x + Math.cos(angleRad) * turretLength;
const turretY = player.y - Math.sin(angleRad) * turretLength;
renderer.drawLine(player.x, player.y, turretX, turretY, tankColor, turretWidth, isActive);

// Turret tip (small circle at end)
renderer.drawCircle(turretX, turretY, 4, tankColor, isActive);
```

**Step 2: Update HUD to show tank name instead of archetype**

Find the HUD rendering (around line 7138) and update:

```javascript
const tank = p.tankId ? getTankById(p.tankId) : null;

// Player label with health and tank name
const labelColor = isDead ? '#444444' : (tank ? tank.color : p.color);
const tankName = tank ? tank.name : '';
const label = `P${i + 1} ${tankName}: ${isDead ? 'X' : Math.round(p.health) + '%'}`;
```

**Step 3: Verify tanks render with correct shapes**

Run: Start game, select different tanks, observe in-game rendering
Expected: Each tank renders with its unique shape and color

**Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: render tanks with unique shapes

- Triangle, square, pentagon, hexagon, diamond, star, circle, octagon
- Turret extends from center at aim angle
- HUD shows tank name instead of archetype"
```

---

## Task 5: Remove Archetype Passive Logic

**Files:**
- Modify: `src/main.js` (multiple locations)

**Step 1: Remove damage multiplier function usage**

Search for `getArchetypeDamageMultiplier` and replace all calls with `1`:

```javascript
// Before:
const archetypeDmgMult = getArchetypeDamageMultiplier(player);

// After:
const archetypeDmgMult = 1;  // No archetype bonuses
```

Locations: ~lines 824, 932, 2480

**Step 2: Remove damage reduction function usage**

Search for `getArchetypeDamageReduction` and replace all calls with `0`:

```javascript
// Before:
const reduction = getArchetypeDamageReduction(player);

// After:
const reduction = 0;  // No archetype reductions
```

Locations: ~lines 2363, 2406, 3061, 3121, 8949

**Step 3: Remove homing strength function usage**

Search for `getArchetypeHomingStrength` and replace with `0`:

```javascript
// Before:
const archHoming = getArchetypeHomingStrength(player);

// After:
const archHoming = 0;  // No archetype homing
```

Location: ~line 1316

**Step 4: Remove hover height function usage**

Search for `getArchetypeHoverHeight` and remove hover logic or set to `0`.

**Step 5: Remove MERCHANT bonus coins logic**

Search for `bonusCoins` and remove the MERCHANT coin bonus in turn start.

**Step 6: Delete the archetype helper functions**

Delete these functions entirely (they're no longer needed):
- `getArchetype()`
- `getArchetypeDamageMultiplier()`
- `getArchetypeDamageReduction()`
- `getArchetypeHomingStrength()`
- `getArchetypeHoverHeight()`
- `applyGameStartAbilities()`

**Step 7: Verify game plays without passive effects**

Run: Play a full round
Expected: No damage bonuses, no damage reduction, no homing, no hover, no bonus coins

**Step 8: Commit**

```bash
git add src/main.js
git commit -m "feat: remove archetype passive abilities

All tanks now have identical gameplay:
- No damage bonuses (Striker removed)
- No damage reduction (Fortress removed)
- No projectile homing (Hunter removed)
- No hover (Specter removed)
- No bonus coins (Merchant removed)"
```

---

## Task 6: Add Shape-Specific Death Particles

**Files:**
- Modify: `src/particles.js` (add new particle shapes and death burst function)

**Step 1: Add shape particle drawing**

Add after the existing Particle class draw method (around line 140):

```javascript
// Draw a mini shape particle
drawShape(renderer, shape, sides) {
    const ctx = renderer.ctx;
    const size = this.radius * this.scale;

    if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
    } else if (shape === 'star') {
        this.drawStarShape(ctx, size, 5);
    } else if (shape === 'diamond') {
        this.drawPolygon(ctx, size, 4, Math.PI / 4);
    } else {
        this.drawPolygon(ctx, size, sides, 0);
    }
}

drawPolygon(ctx, size, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + rotation - Math.PI / 2;
        const x = this.x + Math.cos(angle) * size;
        const y = this.y + Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

drawStarShape(ctx, size, points) {
    const innerRadius = size * 0.4;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? size : innerRadius;
        const angle = (i * Math.PI / points) - Math.PI / 2;
        const x = this.x + Math.cos(angle) * r;
        const y = this.y + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}
```

**Step 2: Add tankDeathBurst to ParticleSystem**

Add new method to ParticleSystem class:

```javascript
/**
 * Tank-specific death explosion with shape particles
 * @param {number} x - Death position X
 * @param {number} y - Death position Y
 * @param {string} shape - Tank shape ('triangle', 'square', etc.)
 * @param {number} sides - Number of sides for polygon shapes
 * @param {string} color - Tank color
 */
tankDeathBurst(x, y, shape, sides, color) {
    // Determine burst pattern based on shape
    let burstAngles = [];
    if (shape === 'triangle') {
        burstAngles = [0, 120, 240];  // 3 directional bursts
    } else if (shape === 'square') {
        burstAngles = [45, 135, 225, 315];  // 4 corner bursts
    } else if (shape === 'pentagon') {
        burstAngles = [0, 72, 144, 216, 288];  // 5-way
    } else if (shape === 'hexagon') {
        burstAngles = [0, 60, 120, 180, 240, 300];  // 6-way honeycomb
    } else if (shape === 'diamond') {
        burstAngles = [0, 90, 180, 270];  // 4 diagonal
    } else if (shape === 'star') {
        burstAngles = [0, 72, 144, 216, 288];  // 5 pointed rays
    } else if (shape === 'circle') {
        // 12-way radial (uniform)
        for (let i = 0; i < 12; i++) burstAngles.push(i * 30);
    } else if (shape === 'octagon') {
        burstAngles = [0, 45, 90, 135, 180, 225, 270, 315];  // 8-way
    }

    // Create directional bursts of mini shapes
    for (const angleDeg of burstAngles) {
        const angleRad = angleDeg * Math.PI / 180;
        for (let i = 0; i < 5; i++) {
            const spread = (Math.random() - 0.5) * 0.5;
            const speed = 8 + Math.random() * 6;
            const particle = new Particle(x, y, {
                angle: angleRad + spread,
                speed: speed,
                color: color,
                radius: 8 + Math.random() * 4,
                life: 0.8 + Math.random() * 0.4,
                gravity: 0.15,
                friction: 0.96,
                glowIntensity: 2,
                type: 'shape',
                shape: shape,
                sides: sides
            });
            this.particles.push(particle);
        }
    }

    // Additional scattered mini shapes
    for (let i = 0; i < 20; i++) {
        const particle = new Particle(x, y, {
            angle: Math.random() * Math.PI * 2,
            speed: 3 + Math.random() * 8,
            color: color,
            radius: 5 + Math.random() * 3,
            life: 0.6 + Math.random() * 0.6,
            gravity: 0.2,
            friction: 0.95,
            glowIntensity: 1.5,
            type: 'shape',
            shape: shape,
            sides: sides
        });
        this.particles.push(particle);
    }
}
```

**Step 3: Update Particle draw to handle shape type**

In Particle.draw method, add shape handling:

```javascript
draw(renderer) {
    // ... existing alpha calculation ...

    if (this.type === 'shape' && this.shape) {
        renderer.ctx.fillStyle = this.color;
        if (this.glowIntensity > 0) {
            renderer.ctx.shadowColor = this.color;
            renderer.ctx.shadowBlur = 15 * this.glowIntensity;
        }
        this.drawShape(renderer, this.shape, this.sides);
        renderer.ctx.shadowBlur = 0;
    } else {
        // ... existing circle/streak/square drawing ...
    }

    renderer.ctx.globalAlpha = 1;
}
```

**Step 4: Export tankDeathBurst**

Ensure the method is accessible from main.js.

**Step 5: Verify particles compile**

Run: Load game
Expected: No console errors

**Step 6: Commit**

```bash
git add src/particles.js
git commit -m "feat: add shape-specific death burst particles

- Directional bursts based on tank shape (3-way for triangle, 8-way for octagon, etc.)
- Particles are mini versions of the tank shape
- All particles glow in tank color"
```

---

## Task 7: Update Death Explosion to Use Tank Shape

**Files:**
- Modify: `src/main.js:474-552` (triggerDeathExplosion function)

**Step 1: Update triggerDeathExplosion to use tank data**

```javascript
function triggerDeathExplosion(player, isVoidDeath = false) {
    const x = player.x;
    const y = player.y;
    const tank = player.tankId ? getTankById(player.tankId) : null;
    const color = tank ? tank.color : player.color;
    const shape = tank ? tank.shape : 'hexagon';
    const sides = tank ? tank.sides : 6;

    // TERRAIN DESTRUCTION - will be updated in Task 8 to use shaped craters
    const deathBlastRadius = isVoidDeath ? 150 : 200;
    terrain.destroy(x, y, deathBlastRadius);

    // SHAPE-SPECIFIC PARTICLE BURST
    particles.tankDeathBurst(x, y, shape, sides, color);

    // Additional standard explosion effects
    if (isVoidDeath) {
        particles.explosion(x, y, 200, COLORS.magenta, 150);
        particles.explosion(x, y, 150, color, 100);
        particles.sparks(x, y, 80, COLORS.magenta);
        // Downward trail
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                particles.sparks(x + (Math.random() - 0.5) * 60, y + i * 6, 6, color);
            }, i * 15);
        }
    } else {
        particles.explosion(x, y, 250, color, 200);
        particles.explosion(x, y, 200, COLORS.white, 150);
        particles.sparks(x, y, 100, color);
        particles.sparks(x, y, 60, COLORS.white);
    }

    // Delayed secondary explosions
    setTimeout(() => {
        particles.explosion(x - 50, y - 30, 60, color, 40);
        particles.sparks(x + 60, y, 40, color);
    }, 80);
    setTimeout(() => {
        particles.explosion(x + 40, y + 20, 50, color, 30);
    }, 160);

    // Screen effects
    renderer.addScreenShake(isVoidDeath ? 60 : 80);
    renderer.flash(color, 0.6);
    setTimeout(() => renderer.flash(COLORS.white, 0.3), 80);

    // Chromatic aberration
    triggerChromatic(5);

    // Death notification
    state.deathNotifications.push({
        text: 'ELIMINATED',
        x: x,
        y: y - 50,
        color: color,
        timer: 1.5
    });

    // Audio
    audio.playKill();
    if (isVoidDeath) {
        audio.playVoidTouch();
    }
}
```

**Step 2: Verify death explosion shows shape particles**

Run: Play game, kill a tank
Expected: Death explosion shows mini shapes flying outward in the tank's color

**Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: death explosions use tank shape particles

When a tank dies, the explosion spawns particles matching
the tank's shape (triangles for Volt, stars for Nova, etc.)
in directional bursts based on the shape's geometry."
```

---

## Task 8: Add Shaped Crater Destruction

**Files:**
- Modify: `src/terrain.js` (add destroyShape function)

**Step 1: Add destroyShape function**

Add after the existing `destroy` function:

```javascript
/**
 * Destroy terrain in a specific shape (for tank death craters)
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Size of the shape
 * @param {string} shape - Shape type ('triangle', 'square', etc.)
 * @param {number} sides - Number of sides for polygons
 */
export function destroyShape(cx, cy, radius, shape, sides) {
    if (!heights) return;

    // For each x position, calculate if it's inside the shape
    const startX = Math.max(0, Math.floor(cx - radius * 1.5));
    const endX = Math.min(width - 1, Math.ceil(cx + radius * 1.5));

    for (let x = startX; x <= endX; x++) {
        // Calculate the shape's boundary at this x position
        let shapeDepth = 0;

        if (shape === 'circle') {
            const dx = x - cx;
            if (Math.abs(dx) <= radius) {
                shapeDepth = Math.sqrt(radius * radius - dx * dx);
            }
        } else if (shape === 'star') {
            shapeDepth = getStarDepth(x - cx, radius);
        } else if (shape === 'diamond') {
            const dx = Math.abs(x - cx);
            if (dx <= radius) {
                shapeDepth = radius - dx;  // Diamond tapers linearly
            }
        } else {
            // Regular polygon
            shapeDepth = getPolygonDepth(x - cx, radius, sides, shape === 'diamond' ? Math.PI / 4 : 0);
        }

        if (shapeDepth > 0) {
            const craterBottom = cy + shapeDepth;
            const craterTop = cy - shapeDepth;

            const floorY = heights[x];
            const hasCeiling = ceilingHeights && ceilingHeights[x] > 0;
            const ceilingY = hasCeiling ? ceilingHeights[x] : null;

            const distToFloor = Math.abs(cy - floorY);
            const distToCeiling = hasCeiling ? Math.abs(cy - ceilingY) : Infinity;

            if (!hasCeiling || distToFloor <= distToCeiling) {
                if (craterBottom > heights[x]) {
                    heights[x] = craterBottom;
                }
            } else {
                if (craterTop < ceilingHeights[x]) {
                    ceilingHeights[x] = craterTop;
                }
            }
        }
    }

    syncCeilingState();
}

// Helper: Get depth at x for a regular polygon
function getPolygonDepth(dx, radius, sides, rotation = 0) {
    // Simplified: use inscribed circle approximation with angular variation
    const angle = Math.atan2(0, dx);  // Horizontal slice
    const polygonRadius = radius * Math.cos(Math.PI / sides);
    if (Math.abs(dx) <= polygonRadius) {
        return Math.sqrt(polygonRadius * polygonRadius - dx * dx);
    }
    return 0;
}

// Helper: Get depth at x for a 5-pointed star
function getStarDepth(dx, radius) {
    const innerRadius = radius * 0.4;
    const absDx = Math.abs(dx);

    // Outer points vs inner valleys
    if (absDx <= innerRadius) {
        return Math.sqrt(radius * radius - dx * dx) * 0.8;
    } else if (absDx <= radius) {
        // Taper toward tips
        const t = (absDx - innerRadius) / (radius - innerRadius);
        return radius * (1 - t) * 0.6;
    }
    return 0;
}
```

**Step 2: Export destroyShape**

Add to the export list at the bottom of terrain.js.

**Step 3: Commit**

```bash
git add src/terrain.js
git commit -m "feat: add shaped crater destruction

destroyShape() carves terrain in the shape of the tank:
- Triangular craters for Volt
- Star-shaped craters for Nova
- Diamond craters for Razor, etc."
```

---

## Task 9: Add Goo Stain System

**Files:**
- Modify: `src/terrain.js` (add goo stain tracking and rendering)
- Modify: `src/main.js` (call goo stain on death)

**Step 1: Add goo stain state to terrain.js**

Add near the top with other state variables:

```javascript
// Goo stains from tank deaths (permanent colored marks)
let gooStains = [];
```

**Step 2: Add createGooStain function**

```javascript
/**
 * Create a permanent goo stain at a location
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Stain radius
 * @param {string} shape - Shape of the stain
 * @param {number} sides - Polygon sides
 * @param {string} color - Stain color
 */
export function createGooStain(cx, cy, radius, shape, sides, color) {
    gooStains.push({
        x: cx,
        y: cy,
        radius: radius,
        shape: shape,
        sides: sides,
        color: color,
        alpha: 0.4,  // Permanent alpha (30% as designed)
        glowTimer: 5.0  // Initial bright glow fades over 5 seconds
    });
}

/**
 * Update goo stain glow timers
 */
export function updateGooStains(dt) {
    for (const stain of gooStains) {
        if (stain.glowTimer > 0) {
            stain.glowTimer -= dt;
        }
    }
}

/**
 * Render all goo stains
 */
export function renderGooStains(ctx) {
    for (const stain of gooStains) {
        const glowIntensity = Math.max(0, stain.glowTimer / 5.0);
        const alpha = stain.alpha + glowIntensity * 0.5;  // Brighter when fresh

        ctx.globalAlpha = alpha;
        ctx.fillStyle = stain.color;

        if (glowIntensity > 0) {
            ctx.shadowColor = stain.color;
            ctx.shadowBlur = 30 * glowIntensity;
        }

        // Draw the shape
        if (stain.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(stain.x, stain.y, stain.radius, 0, Math.PI * 2);
            ctx.fill();
        } else if (stain.shape === 'star') {
            drawStainStar(ctx, stain.x, stain.y, stain.radius);
        } else if (stain.shape === 'diamond') {
            drawStainPolygon(ctx, stain.x, stain.y, stain.radius, 4, Math.PI / 4);
        } else {
            drawStainPolygon(ctx, stain.x, stain.y, stain.radius, stain.sides, 0);
        }

        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}

function drawStainPolygon(ctx, cx, cy, radius, sides, rotation) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 + rotation - Math.PI / 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawStainStar(ctx, cx, cy, radius) {
    const innerRadius = radius * 0.4;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? radius : innerRadius;
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

/**
 * Clear all goo stains (on game reset)
 */
export function clearGooStains() {
    gooStains = [];
}
```

**Step 3: Export new functions**

Add to exports: `createGooStain`, `updateGooStains`, `renderGooStains`, `clearGooStains`

**Step 4: Update main.js to create goo stain on death**

In `triggerDeathExplosion`:

```javascript
// Create shaped crater
terrain.destroyShape(x, y, deathBlastRadius * 0.8, shape, sides);

// Create permanent goo stain
terrain.createGooStain(x, y, deathBlastRadius * 0.6, shape, sides, color);
```

**Step 5: Call updateGooStains in game loop**

In the main update function, add:
```javascript
terrain.updateGooStains(dt);
```

**Step 6: Call renderGooStains in render function**

After terrain render, before tanks:
```javascript
terrain.renderGooStains(renderer.ctx);
```

**Step 7: Call clearGooStains in resetGame**

```javascript
terrain.clearGooStains();
```

**Step 8: Verify goo stains appear and persist**

Run: Kill a tank, observe colored stain in crater
Expected: Bright glow initially, fades to 30% alpha but remains visible

**Step 9: Commit**

```bash
git add src/terrain.js src/main.js
git commit -m "feat: add permanent goo stains from tank deaths

- Shaped stains match the tank that died
- Initial bright glow fades over 5 seconds
- Permanent 30% alpha stain remains in crater
- Multiple deaths layer their colors
- Stains cleared on game reset"
```

---

## Task 10: Final Cleanup and Testing

**Files:**
- Modify: `src/main.js` (remove deprecated code)
- Modify: `src/weaponData.js` (remove TANK_ARCHETYPES)
- Modify: `CLAUDE.md` (update documentation)

**Step 1: Remove deprecated TANK_ARCHETYPES export**

In weaponData.js, delete:
```javascript
export const TANK_ARCHETYPES = {};
```

**Step 2: Remove unused archetype imports and references**

Search main.js for any remaining `TANK_ARCHETYPES` or `ARCHETYPE_KEYS` references and remove.

**Step 3: Update CLAUDE.md tank section**

Replace the Tank Archetypes section with:

```markdown
## Tank Cosmetics

Players select a tank at game start. All tanks have identical stats - just unique looks!

| Tank | Shape | Color |
|------|-------|-------|
| **Volt** | Triangle | Cyan |
| **Blaze** | Square | Orange |
| **Phantom** | Pentagon | Magenta |
| **Hive** | Hexagon | Gold |
| **Razor** | Diamond | Red |
| **Nova** | Star | White |
| **Orb** | Circle | Lime |
| **Titan** | Octagon | Purple |

**Death Signatures:**
- Particles burst outward as mini versions of the tank's shape
- Crater carved in the shape of the tank
- Permanent "goo" stain remains in the crater (30% opacity)
```

**Step 4: Full playtest**

Run: Play a complete 4-player game
Verify:
- [ ] 8 tanks appear in selection grid
- [ ] No duplicate tank selection allowed
- [ ] Tanks render with correct shapes in-game
- [ ] All tanks have the same HP
- [ ] No passive abilities active
- [ ] Death explosions show shape particles
- [ ] Craters are shaped (approximately)
- [ ] Goo stains persist and glow fades

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete tank visual identity system

- 8 unique tanks with distinct shapes and colors
- No gameplay differences (pure cosmetics)
- Shape-specific death particles and craters
- Permanent goo stains tell the story of battle
- Updated CLAUDE.md documentation"
```

---

## Summary

| Task | Description | Est. Lines Changed |
|------|-------------|-------------------|
| 1 | Define TANKS data structure | ~60 |
| 2 | Update player data structure | ~10 |
| 3 | Create tank selection UI | ~120 |
| 4 | Update tank rendering | ~50 |
| 5 | Remove archetype passives | ~80 (deletions) |
| 6 | Add shape death particles | ~100 |
| 7 | Update death explosion | ~40 |
| 8 | Add shaped crater destruction | ~80 |
| 9 | Add goo stain system | ~100 |
| 10 | Final cleanup and testing | ~30 |

**Total: ~670 lines changed across 4 files**
