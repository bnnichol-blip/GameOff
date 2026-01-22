/**
 * VOID ARTILLERY - Main Entry Point
 *
 * Two-player artillery duel with ricochet physics and rising void.
 * Core Phase Implementation per consensus plan.
 */

import { input } from './input.js';
import { Renderer, COLORS } from './renderer.js';
import { particles } from './particles.js';
import { terrain } from './terrain.js';
import { audio } from './audio.js';
import { degToRad, clamp, distance } from './utils.js';

// ============================================================================
// Game Constants
// ============================================================================

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const GRAVITY = 0.3;
const MAX_POWER = 15;
const CHARGE_RATE = 0.02;
const VOID_RISE_PER_ROUND = 30;
const TANK_RADIUS = 25;
const TURN_DELAY_MS = 800;

// Juice constants
const FREEZE_FRAME_MS = 60;
const SLOW_MO_DURATION_MS = 600;
const SLOW_MO_FACTOR = 0.25;
const CAMERA_ZOOM_AMOUNT = 0.05;
const CAMERA_ZOOM_DECAY = 0.92;

// ============================================================================
// Tank Types
// ============================================================================

const TANK_TYPES = {
    SIEGE: {
        name: 'SIEGE',
        description: 'Mortar - Large blast, forgiving',
        weapon: 'Mortar',
        damage: 40,
        blastRadius: 80,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 1.0,
        shape: 6  // hexagon
    },
    PHANTOM: {
        name: 'PHANTOM',
        description: 'Railgun - Direct hit, high damage',
        weapon: 'Railgun',
        damage: 70,
        blastRadius: 15,  // Small blast, essentially direct hit
        bounces: 2,
        projectileRadius: 4,
        projectileSpeed: 1.3,
        shape: 3  // triangle
    },
    CHAOS: {
        name: 'CHAOS',
        description: 'Cluster - Splits into 5 bomblets',
        weapon: 'Cluster',
        damage: 15,  // Per bomblet
        blastRadius: 35,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        shape: 5,  // pentagon
        clusterCount: 5
    }
};

// ============================================================================
// Game State
// ============================================================================

const state = {
    players: [
        { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan, tankType: null, isAI: false },
        { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta, tankType: null, isAI: false }
    ],
    currentPlayer: 0,
    turnCount: 0,
    phase: 'title',  // 'title' | 'mode_select' | 'select_p1' | 'select_p2' | 'aiming' | 'firing' | 'resolving' | 'gameover'
    selectIndex: 0,  // Current selection in menus
    gameMode: null,  // '1p' | '2p'
    projectile: null,
    projectiles: [],  // For cluster bombs (multiple projectiles)
    voidY: CANVAS_HEIGHT + 50,
    winner: null,
    time: 0,
    // Juice state
    freezeUntil: 0,      // Timestamp when freeze ends
    slowMoUntil: 0,      // Timestamp when slow-mo ends
    cameraZoom: 0,       // Current zoom offset (0 = normal)
    lastHitPos: null,    // Position of last hit for camera focus
    // AI state
    aiThinkTime: 0,      // Delay before AI acts
    aiTargetAngle: 0,    // Angle AI is aiming for
    aiTargetPower: 0     // Power AI will use
};

// Tank type keys for selection
const TANK_TYPE_KEYS = Object.keys(TANK_TYPES);

// Derived value (Codex suggestion)
function getCurrentRound() {
    return Math.floor(state.turnCount / 2) + 1;
}

// Get current player object
function getCurrentPlayer() {
    return state.players[state.currentPlayer];
}

// ============================================================================
// Game Reset
// ============================================================================

function resetToTitle() {
    state.phase = 'title';
    state.gameMode = null;
    state.selectIndex = 0;
}

function resetGame() {
    terrain.generate(CANVAS_WIDTH);

    const isP2AI = state.gameMode === '1p';
    state.players[0] = { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan, tankType: null, isAI: false };
    state.players[1] = { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta, tankType: null, isAI: isP2AI };

    // Position tanks on terrain
    state.players.forEach(p => {
        p.y = terrain.getHeightAt(p.x) - TANK_RADIUS;
    });

    state.currentPlayer = 0;
    state.turnCount = 0;
    state.phase = 'select_p1';
    state.selectIndex = 0;
    state.projectile = null;
    state.projectiles = [];
    state.voidY = CANVAS_HEIGHT + 50;
    state.winner = null;
    state.aiThinkTime = 0;
    state.aiTargetAngle = 0;
    state.aiTargetPower = 0;
}

function startGame() {
    // Called after both players select tanks
    state.phase = 'aiming';

    // If AI's turn first (shouldn't happen normally), prepare AI
    if (getCurrentPlayer().isAI) {
        prepareAITurn();
    }
}

// ============================================================================
// Projectile
// ============================================================================

function fireProjectile() {
    const player = getCurrentPlayer();
    const tankType = TANK_TYPES[player.tankType];
    const angleRad = degToRad(180 - player.angle);
    const speed = player.power * MAX_POWER * tankType.projectileSpeed;

    state.projectile = {
        x: player.x,
        y: player.y - 20,
        vx: Math.cos(angleRad) * speed,
        vy: -Math.sin(angleRad) * speed,
        radius: tankType.projectileRadius,
        color: player.color,
        bounces: 0,
        maxBounces: tankType.bounces,
        trail: [],
        tankType: player.tankType,
        isCluster: false  // Main projectile, not a bomblet
    };

    // Reset charge and switch to firing phase
    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
}

function updateProjectile(dt) {
    const proj = state.projectile;
    if (!proj) return;

    // Store trail position
    proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
    if (proj.trail.length > 20) proj.trail.shift();

    // Age trail
    for (const point of proj.trail) {
        point.age += dt;
    }

    // Apply gravity
    proj.vy += GRAVITY;

    // Move
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Spawn trail particles occasionally
    if (Math.random() < 0.3) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Bounce off walls
    if (proj.x < proj.radius) {
        proj.x = proj.radius;
        proj.vx = -proj.vx * 0.9;
        onBounce(proj);
    }
    if (proj.x > CANVAS_WIDTH - proj.radius) {
        proj.x = CANVAS_WIDTH - proj.radius;
        proj.vx = -proj.vx * 0.9;
        onBounce(proj);
    }

    // Bounce off ceiling
    if (proj.y < proj.radius) {
        proj.y = proj.radius;
        proj.vy = -proj.vy * 0.9;
        onBounce(proj);
    }

    // Check projectile termination conditions (Codex suggestion)
    // 1. Hits terrain
    if (terrain.isPointBelowTerrain(proj.x, proj.y)) {
        onExplode(proj);
        state.projectile = null;
        return;
    }

    // 2. Hits void
    if (proj.y > state.voidY) {
        onExplode(proj);
        state.projectile = null;
        return;
    }

    // 3. Goes out of bounds
    if (proj.y > CANVAS_HEIGHT + 100) {
        onExplode(proj);
        state.projectile = null;
        return;
    }
}

function onBounce(proj) {
    proj.bounces++;
    particles.sparks(proj.x, proj.y, 15, COLORS.yellow);
    renderer.addScreenShake(5);
    audio.playBounce();

    // Destroy if out of bounces
    if (proj.bounces >= proj.maxBounces) {
        onExplode(proj);
        state.projectile = null;
    }
}

function onExplode(proj) {
    const tankType = TANK_TYPES[proj.tankType];

    // Check if this is CHAOS and should spawn cluster bombs (only for main projectile)
    if (proj.tankType === 'CHAOS' && !proj.isCluster) {
        spawnClusterBombs(proj);
        // Don't end turn yet - wait for cluster bombs
        return;
    }

    // Visual effects - scale with blast radius
    const particleCount = Math.floor(tankType.blastRadius * 0.8);
    particles.explosion(proj.x, proj.y, particleCount, proj.color);
    renderer.addScreenShake(tankType.blastRadius / 4);
    renderer.flash(proj.color, 0.15);

    // Destroy terrain
    terrain.destroy(proj.x, proj.y, tankType.blastRadius);

    // Track if anyone was hit for juice effects
    let hitOccurred = false;
    let killingBlow = false;

    // Apply damage to all players (including self-damage)
    for (const player of state.players) {
        const dist = distance(proj.x, proj.y, player.x, player.y);
        if (dist < tankType.blastRadius) {
            // Linear falloff, clamped to 0
            const damage = Math.max(0, tankType.damage * (1 - dist / tankType.blastRadius));
            if (damage > 0) {
                hitOccurred = true;
                state.lastHitPos = { x: proj.x, y: proj.y };

                // Check if this will be a killing blow
                if (player.health > 0 && player.health - damage <= 0) {
                    killingBlow = true;
                }
            }
            player.health = Math.max(0, player.health - damage);
        }
    }

    // Play explosion sound (scale intensity with blast radius)
    const explosionIntensity = tankType.blastRadius / 60;
    audio.playExplosion(explosionIntensity);

    // Juice effects on hit
    if (hitOccurred) {
        const now = performance.now();

        // Freeze frame - brief pause for impact
        state.freezeUntil = now + FREEZE_FRAME_MS;

        // Extra screen shake for hits
        renderer.addScreenShake(15);

        // Camera punch zoom
        state.cameraZoom = CAMERA_ZOOM_AMOUNT;

        // Slow-mo for killing blow
        if (killingBlow) {
            state.slowMoUntil = now + SLOW_MO_DURATION_MS;
            renderer.addScreenShake(25);
            renderer.flash(COLORS.white, 0.4);
            audio.playKill();
        }
    }

    // If this was a cluster bomblet, check if all bomblets are done
    if (proj.isCluster) {
        // Remove this bomblet from the array
        const idx = state.projectiles.indexOf(proj);
        if (idx > -1) state.projectiles.splice(idx, 1);

        // Only end turn when all bomblets are done
        if (state.projectiles.length === 0) {
            endTurn();
        }
        return;
    }

    // Start resolving phase
    endTurn();
}

function spawnClusterBombs(proj) {
    const tankType = TANK_TYPES.CHAOS;
    const count = tankType.clusterCount;

    // Clear main projectile
    state.projectile = null;

    // Spawn bomblets in a spread pattern
    for (let i = 0; i < count; i++) {
        const spreadAngle = ((i / (count - 1)) - 0.5) * Math.PI * 0.6;  // Spread 60 degrees
        const baseAngle = Math.atan2(proj.vy, proj.vx);
        const angle = baseAngle + spreadAngle;
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) * 0.7;

        state.projectiles.push({
            x: proj.x,
            y: proj.y,
            vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 2,
            vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 2,
            radius: 4,
            color: proj.color,
            bounces: 0,
            maxBounces: tankType.bounces,
            trail: [],
            tankType: 'CHAOS',
            isCluster: true
        });
    }

    // Visual feedback for split
    particles.sparks(proj.x, proj.y, 20, COLORS.yellow);
    renderer.addScreenShake(8);
}

// ============================================================================
// Turn System
// ============================================================================

function endTurn() {
    state.phase = 'resolving';

    // Check win conditions before switching
    const winResult = checkWinCondition();
    if (winResult) {
        state.winner = winResult.winner;
        state.phase = 'gameover';
        return;
    }

    // Delay before switching turns (Claude/Gemini suggestion)
    setTimeout(() => {
        state.turnCount++;
        state.currentPlayer = 1 - state.currentPlayer;

        // Void rises every full round (after both players fire)
        if (state.turnCount % 2 === 0) {
            state.voidY -= VOID_RISE_PER_ROUND;
        }

        state.phase = 'aiming';

        // Prepare AI if next player is AI
        if (getCurrentPlayer().isAI) {
            prepareAITurn();
        }
    }, TURN_DELAY_MS);
}

// ============================================================================
// AI System
// ============================================================================

function prepareAITurn() {
    const ai = getCurrentPlayer();
    const target = state.players[1 - state.currentPlayer];

    // Calculate angle to target (simple ballistic estimation)
    const dx = target.x - ai.x;
    const dy = target.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Simple angle calculation with some randomness for imperfection
    // Higher arc for longer distances
    let baseAngle = Math.atan2(-dy, dx) * (180 / Math.PI);

    // Add arc compensation (longer distance = higher angle)
    const arcBonus = (dist / CANVAS_WIDTH) * 30;
    baseAngle += arcBonus;

    // Add some randomness for imperfect AI (-15 to +15 degrees)
    const randomError = (Math.random() - 0.5) * 30;
    state.aiTargetAngle = clamp(180 - baseAngle + randomError, 10, 170);

    // Power based on distance with some randomness
    const basePower = clamp(dist / 800, 0.3, 0.95);
    const powerError = (Math.random() - 0.5) * 0.2;
    state.aiTargetPower = clamp(basePower + powerError, 0.25, 1.0);

    // Think time before acting (1-2 seconds)
    state.aiThinkTime = 1000 + Math.random() * 1000;
}

function updateAI(dt) {
    const ai = getCurrentPlayer();
    if (!ai.isAI || state.phase !== 'aiming') return;

    // Wait for think time
    state.aiThinkTime -= dt * 1000;
    if (state.aiThinkTime > 0) return;

    // Gradually adjust angle toward target
    const angleDiff = state.aiTargetAngle - ai.angle;
    if (Math.abs(angleDiff) > 1) {
        ai.angle += Math.sign(angleDiff) * 2;
        return;
    }

    // Start charging if not already
    if (!ai.charging) {
        ai.charging = true;
        audio.startCharge();
    }

    // Charge up
    ai.power = clamp(ai.power + CHARGE_RATE, 0, 1);
    audio.updateCharge(ai.power);

    // Fire when reached target power
    if (ai.power >= state.aiTargetPower) {
        audio.stopCharge();
        audio.playFire();
        fireProjectile();
    }
}

// ============================================================================
// Win Conditions
// ============================================================================

function checkWinCondition() {
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];

        // Health death
        if (player.health <= 0) {
            return { winner: 1 - i, reason: 'destroyed' };
        }

        // Void death (tank bottom touches void)
        if (player.y + TANK_RADIUS > state.voidY) {
            return { winner: 1 - i, reason: 'void' };
        }
    }
    return null;
}

// ============================================================================
// Tank Physics (Falling)
// ============================================================================

function updateTankPhysics(player) {
    const groundY = terrain.getHeightAt(player.x);
    const tankBottom = player.y + TANK_RADIUS;

    if (tankBottom < groundY) {
        // Tank is above ground — fall
        player.vy += GRAVITY;
        player.y += player.vy;

        // Check if landed
        if (player.y + TANK_RADIUS >= groundY) {
            player.y = groundY - TANK_RADIUS;
            player.vy = 0;
        }
    } else {
        // Ensure tank stays on ground (in case terrain was raised somehow)
        player.y = groundY - TANK_RADIUS;
        player.vy = 0;
    }
}

// ============================================================================
// Update
// ============================================================================

function update(dt) {
    state.time += dt;

    // Title screen
    if (state.phase === 'title') {
        if (input.spaceReleased || input.enter) {
            audio.init();  // Initialize audio on first user interaction
            audio.startBackgroundMusic();  // Explicitly start music
            audio.playConfirm();
            state.phase = 'mode_select';
            state.selectIndex = 0;
        }
        input.endFrame();
        return;
    }

    // Mode selection (1P vs AI or 2P local)
    if (state.phase === 'mode_select') {
        if (input.wasPressed('ArrowUp') || input.wasPressed('ArrowLeft')) {
            state.selectIndex = 1 - state.selectIndex;
            audio.playSelect();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('ArrowRight')) {
            state.selectIndex = 1 - state.selectIndex;
            audio.playSelect();
        }
        if (input.spaceReleased || input.enter) {
            audio.playConfirm();
            state.gameMode = state.selectIndex === 0 ? '1p' : '2p';
            resetGame();  // This sets up players with AI flag based on gameMode
        }
        input.endFrame();
        return;
    }

    // Tank selection phases
    if (state.phase === 'select_p1' || state.phase === 'select_p2') {
        // Auto-select for AI player
        if (state.phase === 'select_p2' && state.players[1].isAI) {
            // AI picks a random tank after short delay
            setTimeout(() => {
                const aiChoice = TANK_TYPE_KEYS[Math.floor(Math.random() * TANK_TYPE_KEYS.length)];
                state.players[1].tankType = aiChoice;
                audio.playConfirm();
                startGame();
            }, 500);
            state.phase = 'ai_selecting';  // Temporary state to prevent re-triggering
            input.endFrame();
            return;
        }

        // Navigate with up/down or left/right
        if (input.wasPressed('ArrowUp') || input.wasPressed('ArrowLeft')) {
            state.selectIndex = (state.selectIndex - 1 + TANK_TYPE_KEYS.length) % TANK_TYPE_KEYS.length;
            audio.playSelect();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('ArrowRight')) {
            state.selectIndex = (state.selectIndex + 1) % TANK_TYPE_KEYS.length;
            audio.playSelect();
        }

        // Confirm selection with Space or Enter
        if (input.spaceReleased || input.enter) {
            const selectedType = TANK_TYPE_KEYS[state.selectIndex];
            audio.playConfirm();
            if (state.phase === 'select_p1') {
                state.players[0].tankType = selectedType;
                state.phase = 'select_p2';
                state.selectIndex = 0;
            } else {
                state.players[1].tankType = selectedType;
                startGame();
            }
        }

        input.endFrame();
        return;
    }

    // AI selecting state (just wait)
    if (state.phase === 'ai_selecting') {
        input.endFrame();
        return;
    }

    const player = getCurrentPlayer();

    // Input gating by phase (Gemini suggestion)
    if (state.phase === 'aiming') {
        // AI takes control if it's AI's turn
        if (player.isAI) {
            updateAI(dt);
        } else {
            // Human controls
            // Aim with arrow keys
            if (input.left) player.angle = clamp(player.angle + 2, 0, 180);
            if (input.right) player.angle = clamp(player.angle - 2, 0, 180);

            // Charge with space
            if (input.space && !state.projectile && state.projectiles.length === 0) {
                // Start charge sound when beginning to charge
                if (!player.charging) {
                    audio.startCharge();
                }
                player.charging = true;
                player.power = clamp(player.power + CHARGE_RATE, 0, 1);
                // Update charge sound pitch
                audio.updateCharge(player.power);
            }

            // Fire on space release
            if (input.spaceReleased && player.charging && !state.projectile) {
                audio.stopCharge();
                audio.playFire();
                fireProjectile();
            }
        }
    }

    // Game over: Enter for rematch, Escape for title
    if (state.phase === 'gameover') {
        if (input.enter) {
            resetGame();  // Rematch with same mode
        }
        if (input.escape) {
            resetToTitle();  // Back to title
        }
    }

    // Update projectile
    if (state.phase === 'firing') {
        updateProjectile(dt);

        // Update cluster bomblets
        for (const bomblet of [...state.projectiles]) {
            updateClusterBomblet(bomblet, dt);
        }
    }

    // Update tank physics (falling) for all players
    for (const p of state.players) {
        updateTankPhysics(p);
    }

    // Check win conditions continuously (for void/falling deaths)
    if (state.phase !== 'gameover' && state.phase !== 'select_p1' && state.phase !== 'select_p2') {
        const winResult = checkWinCondition();
        if (winResult) {
            state.winner = winResult.winner;
            state.phase = 'gameover';
            // Play appropriate death sound
            if (winResult.reason === 'void') {
                audio.playVoidTouch();
            } else {
                audio.playKill();
            }
        }
    }

    // Update particles
    particles.update(dt);

    // Clear input state for next frame
    input.endFrame();
}

function updateClusterBomblet(proj, dt) {
    // Store trail position
    proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
    if (proj.trail.length > 10) proj.trail.shift();

    // Apply gravity
    proj.vy += GRAVITY;

    // Move
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Trail particles
    if (Math.random() < 0.2) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Bounce off walls
    if (proj.x < proj.radius || proj.x > CANVAS_WIDTH - proj.radius) {
        proj.vx = -proj.vx * 0.9;
        proj.x = clamp(proj.x, proj.radius, CANVAS_WIDTH - proj.radius);
        proj.bounces++;
        particles.sparks(proj.x, proj.y, 8, COLORS.yellow);
    }

    // Bounce off ceiling
    if (proj.y < proj.radius) {
        proj.vy = -proj.vy * 0.9;
        proj.y = proj.radius;
        proj.bounces++;
        particles.sparks(proj.x, proj.y, 8, COLORS.yellow);
    }

    // Check termination
    if (terrain.isPointBelowTerrain(proj.x, proj.y) ||
        proj.y > state.voidY ||
        proj.y > CANVAS_HEIGHT + 100 ||
        proj.bounces >= proj.maxBounces) {
        onExplode(proj);
    }
}

// ============================================================================
// Render
// ============================================================================

function render() {
    renderer.beginFrame();

    // Title screen
    if (state.phase === 'title') {
        renderTitle();
        renderer.endFrame();
        return;
    }

    // Mode selection
    if (state.phase === 'mode_select') {
        renderModeSelect();
        renderer.endFrame();
        return;
    }

    // Tank selection screen (including AI selecting)
    if (state.phase === 'select_p1' || state.phase === 'select_p2' || state.phase === 'ai_selecting') {
        renderTankSelect();
        renderer.endFrame();
        return;
    }

    // Apply camera zoom (punch-in effect on hits)
    if (state.cameraZoom > 0) {
        const zoomScale = 1 + state.cameraZoom;
        // Zoom toward the hit position or center of screen
        const focusX = state.lastHitPos ? state.lastHitPos.x : CANVAS_WIDTH / 2;
        const focusY = state.lastHitPos ? state.lastHitPos.y : CANVAS_HEIGHT / 2;

        renderer.ctx.save();
        renderer.ctx.translate(focusX, focusY);
        renderer.ctx.scale(zoomScale, zoomScale);
        renderer.ctx.translate(-focusX, -focusY);
    }

    // Background grid
    renderer.drawGrid(50, '#0a0a15');

    // Draw terrain
    terrain.draw(renderer);

    // Draw void
    renderer.drawVoid(state.voidY);

    // Draw both tanks
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        const isActive = i === state.currentPlayer && state.phase === 'aiming';
        const tankType = TANK_TYPES[player.tankType];
        const shape = tankType ? tankType.shape : 6;

        // Tank body (shape based on tank type)
        renderer.drawRegularPolygon(player.x, player.y, TANK_RADIUS, shape, 0, player.color, true);

        // Turret
        const turretLength = 40;
        const angleRad = degToRad(180 - player.angle);
        const turretX = player.x + Math.cos(angleRad) * turretLength;
        const turretY = player.y - 20 - Math.sin(angleRad) * turretLength;
        renderer.drawLine(player.x, player.y - 20, turretX, turretY, player.color, 4, true);

        // Power meter (only for active player when charging)
        if (isActive && (player.charging || player.power > 0)) {
            const meterWidth = 60;
            const meterHeight = 8;
            const meterX = player.x - meterWidth / 2;
            const meterY = player.y - 60;

            renderer.drawRectOutline(meterX, meterY, meterWidth, meterHeight, '#333333', 1, false);
            const fillColor = player.power > 0.8 ? COLORS.orange : COLORS.yellow;
            renderer.drawRect(meterX + 1, meterY + 1, (meterWidth - 2) * player.power, meterHeight - 2, fillColor, true);
        }

        // Health bar above tank
        const healthBarWidth = 50;
        const healthBarHeight = 6;
        const healthBarX = player.x - healthBarWidth / 2;
        const healthBarY = player.y - 50;

        // Background
        renderer.drawRectOutline(healthBarX, healthBarY, healthBarWidth, healthBarHeight, '#333333', 1, false);
        // Fill (green to red based on health)
        const healthPercent = player.health / 100;
        const healthColor = healthPercent > 0.5 ? COLORS.green : (healthPercent > 0.25 ? COLORS.orange : COLORS.magenta);
        renderer.drawRect(healthBarX + 1, healthBarY + 1, (healthBarWidth - 2) * healthPercent, healthBarHeight - 2, healthColor, true);

        // Tank type label
        if (tankType) {
            renderer.drawText(tankType.name, player.x, player.y + 45, player.color, 10, 'center', false);
        }
    }

    // Draw projectile
    const proj = state.projectile;
    if (proj) {
        drawProjectile(proj);
    }

    // Draw cluster bomblets
    for (const bomblet of state.projectiles) {
        drawProjectile(bomblet);
    }

    // Draw particles
    particles.draw(renderer);

    // Restore from camera zoom before HUD
    if (state.cameraZoom > 0) {
        renderer.ctx.restore();
    }

    // HUD
    renderer.drawText('VOID ARTILLERY', 20, 30, COLORS.cyan, 20, 'left', true);

    // Turn indicator
    const turnText = state.phase === 'gameover'
        ? `PLAYER ${state.winner + 1} WINS!`
        : `PLAYER ${state.currentPlayer + 1} TURN`;
    const turnColor = state.phase === 'gameover'
        ? state.players[state.winner].color
        : getCurrentPlayer().color;
    renderer.drawText(turnText, CANVAS_WIDTH / 2, 30, turnColor, 20, 'center', true);

    // Round indicator
    renderer.drawText(`Round ${getCurrentRound()}`, CANVAS_WIDTH - 20, 30, COLORS.white, 14, 'right', false);

    // Player stats with tank type
    const p1Type = state.players[0].tankType ? TANK_TYPES[state.players[0].tankType].weapon : '';
    const p2Type = state.players[1].tankType ? TANK_TYPES[state.players[1].tankType].weapon : '';
    renderer.drawText(`P1: ${Math.round(state.players[0].health)}% [${p1Type}]`, 20, 60, state.players[0].color, 14, 'left', false);
    renderer.drawText(`P2: ${Math.round(state.players[1].health)}% [${p2Type}]`, 20, 80, state.players[1].color, 14, 'left', false);

    // Controls hint
    if (state.phase === 'aiming') {
        const hintText = getCurrentPlayer().isAI ? 'AI is thinking...' : '← → to aim, HOLD SPACE to charge, RELEASE to fire';
        renderer.drawText(hintText, 20, CANVAS_HEIGHT - 30, '#666666', 12, 'left', false);
    } else if (state.phase === 'gameover') {
        renderer.drawText('ENTER: Rematch | ESC: Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50, COLORS.white, 16, 'center', true);
    }

    renderer.endFrame();
}

function drawProjectile(proj) {
    // Trail
    for (let i = 0; i < proj.trail.length; i++) {
        const point = proj.trail[i];
        const alpha = (i / proj.trail.length) * 0.5;
        const radius = proj.radius * (i / proj.trail.length) * 0.7;
        renderer.ctx.globalAlpha = alpha;
        renderer.drawCircle(point.x, point.y, radius, proj.color, true);
    }
    renderer.ctx.globalAlpha = 1;

    // Main projectile
    renderer.drawCircle(proj.x, proj.y, proj.radius, proj.color, true);
}

function renderTitle() {
    // Background with subtle animation
    renderer.drawGrid(50, '#0a0a15');

    // Animated void at bottom
    const voidY = CANVAS_HEIGHT - 100 + Math.sin(state.time * 2) * 20;
    renderer.drawVoid(voidY);

    // Main title with glow
    renderer.drawText('VOID', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80, COLORS.magenta, 72, 'center', true);
    renderer.drawText('ARTILLERY', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, COLORS.cyan, 72, 'center', true);

    // Tagline
    renderer.drawText('One Button Away From Victory', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60, '#888888', 16, 'center', false);

    // Animated prompt
    const alpha = 0.5 + Math.sin(state.time * 4) * 0.5;
    renderer.ctx.globalAlpha = alpha;
    renderer.drawText('PRESS SPACE TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 140, COLORS.white, 20, 'center', true);
    renderer.ctx.globalAlpha = 1;

    // Credits
    renderer.drawText('Game Off 2024 Jam Entry', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40, '#444444', 12, 'center', false);
}

function renderModeSelect() {
    renderer.drawGrid(50, '#0a0a15');

    // Title
    renderer.drawText('VOID ARTILLERY', CANVAS_WIDTH / 2, 80, COLORS.cyan, 40, 'center', true);
    renderer.drawText('SELECT MODE', CANVAS_WIDTH / 2, 140, COLORS.white, 24, 'center', false);

    // Mode options
    const modes = [
        { name: '1 PLAYER', desc: 'Battle against AI', color: COLORS.cyan },
        { name: '2 PLAYERS', desc: 'Local multiplayer', color: COLORS.magenta }
    ];

    const startY = 280;
    const spacing = 150;

    for (let i = 0; i < modes.length; i++) {
        const mode = modes[i];
        const y = startY + i * spacing;
        const isSelected = i === state.selectIndex;

        // Selection highlight
        if (isSelected) {
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 200, y - 40, 400, 100, mode.color, 3, true);
        }

        // Mode name
        const textColor = isSelected ? COLORS.white : '#666666';
        renderer.drawText(mode.name, CANVAS_WIDTH / 2, y, textColor, 32, 'center', isSelected);

        // Mode description
        renderer.drawText(mode.desc, CANVAS_WIDTH / 2, y + 35, '#666666', 14, 'center', false);
    }

    // Controls hint
    renderer.drawText('↑↓ to select, SPACE to confirm', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50, '#666666', 14, 'center', false);
}

function renderTankSelect() {
    const isP1 = state.phase === 'select_p1';
    const isAISelecting = state.phase === 'ai_selecting';
    const playerNum = isP1 ? 1 : 2;
    const playerColor = isP1 ? COLORS.cyan : COLORS.magenta;

    // Title
    renderer.drawText('VOID ARTILLERY', CANVAS_WIDTH / 2, 60, COLORS.cyan, 32, 'center', true);
    const subtitle = isAISelecting ? 'AI IS CHOOSING...' : `PLAYER ${playerNum} - SELECT YOUR TANK`;
    renderer.drawText(subtitle, CANVAS_WIDTH / 2, 120, playerColor, 24, 'center', true);

    // Tank options
    const startY = 200;
    const spacing = 150;

    for (let i = 0; i < TANK_TYPE_KEYS.length; i++) {
        const key = TANK_TYPE_KEYS[i];
        const tankType = TANK_TYPES[key];
        const y = startY + i * spacing;
        const isSelected = i === state.selectIndex;

        // Selection highlight
        if (isSelected) {
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 250, y - 50, 500, 120, playerColor, 3, true);
        }

        // Tank preview shape
        const previewX = CANVAS_WIDTH / 2 - 180;
        const previewColor = isSelected ? playerColor : '#666666';
        renderer.drawRegularPolygon(previewX, y, 35, tankType.shape, 0, previewColor, true);

        // Tank name
        const textColor = isSelected ? COLORS.white : '#888888';
        renderer.drawText(tankType.name, CANVAS_WIDTH / 2 - 100, y - 15, textColor, 24, 'left', isSelected);

        // Tank description (constrained to not overlap stats)
        renderer.drawText(tankType.description, CANVAS_WIDTH / 2 - 100, y + 15, '#666666', 14, 'left', false);

        // Stats (right-aligned at box edge to avoid overlap)
        const statsX = CANVAS_WIDTH / 2 + 230;
        renderer.drawText(`DMG: ${tankType.damage}`, statsX, y - 20, '#888888', 12, 'right', false);
        renderer.drawText(`BLAST: ${tankType.blastRadius}`, statsX, y, '#888888', 12, 'right', false);
        renderer.drawText(`BOUNCES: ${tankType.bounces}`, statsX, y + 20, '#888888', 12, 'right', false);
    }

    // Controls hint
    renderer.drawText('↑↓ to select, SPACE to confirm', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50, '#666666', 14, 'center', false);
}

// ============================================================================
// Game Loop
// ============================================================================

let renderer;
let lastTime = 0;

function gameLoop(currentTime) {
    const now = performance.now();
    let dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    // Freeze frame - skip update entirely
    if (now < state.freezeUntil) {
        render();
        requestAnimationFrame(gameLoop);
        return;
    }

    // Slow-mo - reduce dt
    if (now < state.slowMoUntil) {
        dt *= SLOW_MO_FACTOR;
    }

    // Decay camera zoom
    if (state.cameraZoom > 0.001) {
        state.cameraZoom *= CAMERA_ZOOM_DECAY;
    } else {
        state.cameraZoom = 0;
    }

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// ============================================================================
// Initialize
// ============================================================================

function init() {
    const canvas = document.getElementById('game');
    renderer = new Renderer(canvas);
    renderer.resize(CANVAS_WIDTH, CANVAS_HEIGHT);

    // Generate terrain for title screen background
    terrain.generate(CANVAS_WIDTH);

    // Start at title screen
    state.phase = 'title';

    // Start game loop
    requestAnimationFrame(gameLoop);

    console.log('VOID ARTILLERY initialized');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
