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
import * as events from './events.js';
import { initAmbient, getAmbient, UFO_BUFF_TYPES } from './ambient.js';
import { postfx, initPostFX, applyAllPostFX, triggerChromatic, activateGlitch, deactivateGlitch, ENABLE_POSTFX } from './postfx.js';
// Import weapon data and tank types from extracted module
import { WEAPON_TIERS, WEAPONS, WEAPON_KEYS, ORBITAL_WEAPON_KEYS, TANK_TYPES, TANK_ARCHETYPES,
         LOTTERY_RARITY_RATES, LOTTERY_RARITY_COLORS, WEAPONS_BY_RARITY, WEAPON_RARITY_MAP } from './weaponData.js';

// ============================================================================
// Biome Color Themes
// ============================================================================

const BIOMES = {
    CYBER_VOID: { name: 'Cyber Void', hue: 0, sat: 1.0, terrain: '#050510', edge: '#00ffff', voidColor: '#ff00ff' },
    ICE_FIELD: { name: 'Ice Field', hue: 180, sat: 0.8, terrain: '#0a1520', edge: '#00ffff', voidColor: '#00ddff' },
    LAVA_CORE: { name: 'Lava Core', hue: -15, sat: 1.4, terrain: '#1a0a05', edge: '#ff4400', voidColor: '#ff2200' },
    TOXIC_ZONE: { name: 'Toxic Zone', hue: 90, sat: 1.3, terrain: '#051a0a', edge: '#44ff00', voidColor: '#88ff00' },
    VOID_RIFT: { name: 'Void Rift', hue: 270, sat: 1.2, terrain: '#100520', edge: '#8800ff', voidColor: '#aa00ff' }
};

const BIOME_KEYS = Object.keys(BIOMES);

// ============================================================================
// Game Constants
// ============================================================================

// Display canvas (actual screen size) - smaller to fit typical browser windows
const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

// Virtual world dimensions (2x larger, rendered at 0.5x scale)
const VIRTUAL_WIDTH = CANVAS_WIDTH * 2;   // 2560
const VIRTUAL_HEIGHT = CANVAS_HEIGHT * 2; // 1440
const WORLD_SCALE = CANVAS_WIDTH / VIRTUAL_WIDTH;  // 0.5

// === HARD WORLD BOUNDARIES ===
// Walls at 20px from edges - same as working bounce code in events.js
// Terrain is pushed down at edges so projectiles won't hit it after bouncing
const WALL_MARGIN = 20;
const WORLD_LEFT = WALL_MARGIN;
const WORLD_RIGHT = VIRTUAL_WIDTH - WALL_MARGIN;
const WORLD_TOP = WALL_MARGIN;
const WORLD_BOTTOM = VIRTUAL_HEIGHT;

const NUM_PLAYERS = 4;  // Support up to 4 players
const DEFAULT_GRAVITY = 0.15;   // Lower gravity for longer flight paths in larger world
const MAX_POWER = 28;           // Adjusted for 2x world size
const CHARGE_RATE = 0.012;      // Slower charge for more precise timing (~3 sec for full)
const DEBUG_SHOW_VELOCITY = false;  // Set true to show muzzle velocity debug
const VOID_RISE_PER_ROUND = 50;  // Void rises 50px per round (~3% of arena height)
const TANK_RADIUS = 25;
const TURN_DELAY_MS = 800;

// Juice constants
const FREEZE_FRAME_MS = 0;  // Disabled - felt like lag
const SLOW_MO_DURATION_MS = 0;  // Disabled - felt like lag
const SLOW_MO_FACTOR = 0.25;
const CAMERA_ZOOM_AMOUNT = 0;  // Disabled for testing - may feel like lag
const CAMERA_ZOOM_DECAY = 0.92;

// Economy constants
const STARTING_COINS = 60;
const COINS_PER_DAMAGE = 0.2;      // 1 coin per 5 damage
const KILL_BONUS = 50;
const SURVIVAL_BONUS = 25;  // Per turn, all players
const UFO_DESTROY_BONUS = 30;

// Player colors for up to 6 players
const PLAYER_COLORS = [
    '#00ffff',  // Cyan - P1
    '#ff00ff',  // Magenta - P2
    '#00ff00',  // Green - P3
    '#ffaa00',  // Orange - P4
    '#ff4444',  // Red - P5
    '#8888ff'   // Blue - P6
];

// ============================================================================
// BOUNDARY ENFORCEMENT - Keep everything inside the world box
// ============================================================================

/**
 * Safety backup: enforce world boundaries on a projectile
 * Main bounce logic is in update functions, this is just a safety clamp
 */
function enforceProjectileBounds(proj) {
    // Simple clamp - main bounce logic handles the actual bouncing
    if (proj.x < WORLD_LEFT) proj.x = WORLD_LEFT;
    if (proj.x > WORLD_RIGHT) proj.x = WORLD_RIGHT;
    // NO ceiling clamp - projectiles can arc high above the screen
}

/**
 * Enforce world boundaries on a tank (hard clamp, no bounce)
 * Call this EVERY FRAME for EVERY player
 */
function enforceTankBounds(player) {
    // LEFT WALL
    if (player.x < WORLD_LEFT + TANK_RADIUS) {
        player.x = WORLD_LEFT + TANK_RADIUS;
        player.vx = 0;
    }

    // RIGHT WALL
    if (player.x > WORLD_RIGHT - TANK_RADIUS) {
        player.x = WORLD_RIGHT - TANK_RADIUS;
        player.vx = 0;
    }

    // TOP (shouldn't happen but just in case)
    if (player.y < WORLD_TOP + TANK_RADIUS) {
        player.y = WORLD_TOP + TANK_RADIUS;
        player.vy = 0;
    }
}

/**
 * Generate spawn X positions evenly spaced across the virtual world
 */
function getSpawnPositions(numPlayers) {
    const margin = 400;  // Keep tanks away from edges (scaled for smaller world)
    const spacing = (VIRTUAL_WIDTH - margin * 2) / (numPlayers - 1);
    const positions = [];
    for (let i = 0; i < numPlayers; i++) {
        positions.push(margin + i * spacing);
    }
    return positions;
}

/**
 * Create initial player objects
 */
function createPlayers(numPlayers, humanCount = numPlayers) {
    const spawnXs = getSpawnPositions(numPlayers);
    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({
            x: spawnXs[i],
            y: 0,  // Will be set by terrain
            vx: 0,  // Horizontal velocity (knockback)
            vy: 0,
            angle: i < numPlayers / 2 ? 45 : 135,  // Left side aims right, right side aims left
            power: 0,
            charging: false,
            health: 100,
            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
            archetype: null,      // Tank archetype (ability)
            tankType: null,       // Legacy - kept for compatibility
            isAI: i >= humanCount,  // Players beyond human count are AI
            shield: 0,
            coins: STARTING_COINS,
            weapon: 'MORTAR',
            voidGraceTimer: 0,    // Legacy field
            rerollsRemaining: 1   // Cosmic Lottery rerolls (1 per player per game)
        });
    }
    return players;
}

// NOTE: WEAPON_TIERS, WEAPONS, WEAPON_KEYS, ORBITAL_WEAPON_KEYS are now imported from weaponData.js

// NOTE: TANK_TYPES and TANK_ARCHETYPES are now imported from weaponData.js

const ARCHETYPE_KEYS = Object.keys(TANK_ARCHETYPES);

// ============================================================================
// Game State
// ============================================================================

const state = {
    players: createPlayers(NUM_PLAYERS),
    currentPlayer: 0,
    turnCount: 0,
    round: 1,        // Stable round counter (incremented after all NUM_PLAYERS have taken a turn)
    phase: 'title',  // 'title' | 'mode_select' | 'archetype_select' | 'lottery' | 'aiming' | 'firing' | 'resolving' | 'gameover'
    selectIndex: 0,  // Current selection in menus
    gameMode: null,  // '1p' | 'mp' (multiplayer)
    humanPlayerCount: 2,      // Number of human players (1-4)
    selectingPlayerIndex: 0,  // Which player is currently selecting archetype (0-3)
    projectile: null,
    projectiles: [],  // For cluster bombs (multiple projectiles)
    // Cosmic Lottery state
    lottery: {
        active: false,
        cards: [],              // Array of 3 card objects { weaponKey, rarity, name, damage, blastRadius, description }
        selectedIndex: 0,       // Currently highlighted card (0-2)
        animationPhase: 'none', // 'descending' | 'revealing' | 'selecting' | 'dismissing'
        animationTimer: 0,
        pityCounter: 0          // Turns since rare+ shown (for pity system)
    },
    // AI pick notifications for lottery
    lotteryNotifications: [],  // { text, color, x, y, timer, rarity }
    // Persistent fields (napalm, etc.)
    fields: [],  // { x, y, radius, duration, damagePerSec, color, type, timer }
    // Active nukes with fuse timers
    nukes: [],   // { x, y, fuseTimer, firedByPlayer, weaponKey, color }
    // Nuke shockwave effect
    nukeShockwave: null,  // { x, y, radius, maxRadius, timer, duration }
    mushroomCloud: null,  // { x, y, timer, duration, radius, stemWidth, riseSpeed, capY }
    // Railgun charging state
    railgunCharge: null,  // { timer, maxTime, player, angle, beamPath }
    railgunBeam: null,    // { path: [{x,y}], timer, damage, color }
    voidY: VIRTUAL_HEIGHT + 100,
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
    aiTargetPower: 0,    // Power AI will use
    // Physics
    gravity: DEFAULT_GRAVITY,
    // Glitch event state
    activeEvent: null,        // { name, color, timer }
    originalTankType: null,   // For ARSENAL GLITCH revert
    originalGravity: undefined,// For GRAVITY FLUX revert
    anomalyProjectile: null,  // For VOID ANOMALY
    // New physics event state
    velocityMultiplier: 1.0,  // For TIME DILATION, MUZZLE OVERCHARGE/DAMPEN
    baseWind: 0,              // Persistent wind (changes each round)
    wind: 0,                  // Active wind = baseWind (or amplified during WIND BLAST)
    windShiftPending: false,  // Show "WIND SHIFT" announcement
    windShiftTimer: 0,        // Animation timer for wind shift announcement
    extraBounces: 0,          // For ELASTIC WORLD
    recoilPending: false,     // For RECOIL KICK
    voidSurgePending: false,  // For VOID SURGE
    // UFO buff state (per player, stackable, one-turn duration)
    ufoBuffs: Array.from({ length: NUM_PLAYERS }, () => ({ damage: 0, blast: 0, bounces: 0 })),
    // Radiation status effect (per player) - from PLASMA_BOLT
    radiation: Array.from({ length: NUM_PLAYERS }, () => ({ turnsRemaining: 0, damagePerTurn: 0, sourcePlayer: -1 })),
    // UFO buff notification
    buffNotification: null,  // { playerIndex, buffType, timer }

    // === ORBITAL STRIKE SYSTEMS ===
    orbitalStock: {
        ORBITAL_BEACON: { total: 2, remaining: 2 },
        STRAFING_RUN: { total: 3, remaining: 3 },
        RAILGUN: { total: 3, remaining: 3 },
        NUKE: { total: 2, remaining: 2 }
    },
    orbitalBeacons: [],      // Active beacon sequences { x, y, phase, timer, targetingShip, firedByPlayer }
    strafingRuns: [],        // Active strafing runs { targetX, phase, timer, direction, fighters, firedByPlayer }
    desperationBeacons: [],  // Falling/landed beacons { x, y, vy, landed, timer, maxTime, claimed, claimedBy }

    // Dying Light tracking (per player)
    dyingStarTurns: Array.from({ length: NUM_PLAYERS }, () => 0),  // Turns remaining for dying light
    storedWeapons: Array.from({ length: NUM_PLAYERS }, () => null),  // Previous weapon before dying light

    // Turn flow safety (prevents race conditions)
    turnEndLocked: false,   // Prevents multiple endTurn() calls
    firingStartTime: 0,     // For safety timeout

    // === NEW WEAPON SYSTEMS STATE ===

    // Active black holes (BLACK_HOLE_GRENADE)
    blackHoles: [],  // { x, y, pullRadius, pullStrength, timer, duration, ownerId, color }

    // Pending meteors (METEOR_SHOWER)
    pendingMeteors: [],  // { x, delay, timer, ownerId }

    // Void cannon beams (VOID_CANNON)
    voidCannonBeams: [],  // { x, delay, timer, ownerId, color }

    // Lightning arc for chain lightning
    lightningArc: null,  // { x1, y1, x2, y2, timer, color }

    // Biome system (visual theme)
    currentBiome: null,  // Set at game start from BIOMES

    // Death notifications for kill celebrations
    deathNotifications: []  // { text, x, y, color, timer }
};

// Tank type keys for selection
const TANK_TYPE_KEYS = Object.keys(TANK_TYPES);

/**
 * Get current round number.
 * Uses stable round counter based on NUM_PLAYERS, not living players.
 * This fixes the bug where killing a player triggered premature phase transitions.
 */
function getCurrentRound() {
    return state.round;
}

// Get current player object
function getCurrentPlayer() {
    return state.players[state.currentPlayer];
}

// ============================================================================
// Archetype Ability Helpers
// ============================================================================

/**
 * Get a player's archetype data (or null if none selected)
 */
function getArchetype(player) {
    return player.archetype ? TANK_ARCHETYPES[player.archetype] : null;
}

/**
 * Apply turn-start abilities (MERCHANT: +20 coins per turn)
 */
function applyTurnStartAbilities(player) {
    const arch = getArchetype(player);
    if (!arch) return;

    // MERCHANT: Bonus coins each turn
    if (arch.abilityRules.bonusCoins) {
        player.coins += arch.abilityRules.bonusCoins;
    }
}

/**
 * Apply radiation damage at turn start (from PLASMA_BOLT)
 */
function applyRadiationDamage(playerIndex) {
    const rad = state.radiation[playerIndex];
    if (rad.turnsRemaining <= 0) return;

    const player = state.players[playerIndex];
    if (player.health <= 0) return;

    // Apply radiation damage
    const damage = rad.damagePerTurn;
    player.health = Math.max(0, player.health - damage);

    // Award coins to source player
    if (rad.sourcePlayer >= 0 && rad.sourcePlayer !== playerIndex) {
        state.players[rad.sourcePlayer].coins += Math.floor(damage * COINS_PER_DAMAGE);
    }

    // Visual feedback - green sparks for radiation
    particles.sparks(player.x, player.y - 10, 20, '#00ff88');
    particles.sparks(player.x, player.y - 10, 10, '#00ffaa');

    // Decrement turns
    rad.turnsRemaining--;

    // Check for kill
    if (player.health <= 0) {
        if (rad.sourcePlayer >= 0 && rad.sourcePlayer !== playerIndex) {
            state.players[rad.sourcePlayer].coins += KILL_BONUS;
            state.players[rad.sourcePlayer].kills++;
        }
        triggerDeathExplosion(player, false);
        audio.playKill();
    }
}

/**
 * Apply initial abilities when game starts (currently no start abilities)
 */
function applyGameStartAbilities(player) {
    // All 5 archetypes have passive abilities, no start setup needed
}

/**
 * Get damage multiplier from archetype (STRIKER: +33% damage dealt)
 */
function getArchetypeDamageMultiplier(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.damageBonus) {
        return 1 + arch.abilityRules.damageBonus;
    }
    return 1;
}

/**
 * Get damage reduction from archetype (FORTRESS: -33% damage taken)
 */
function getArchetypeDamageReduction(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.damageReduction) {
        return arch.abilityRules.damageReduction;
    }
    return 0;
}

/**
 * Get homing strength from archetype (HUNTER: slight homing)
 */
function getArchetypeHomingStrength(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.homingStrength) {
        return arch.abilityRules.homingStrength;
    }
    return 0;
}

/**
 * Get hover height from archetype (SPECTER: hover 20px above terrain)
 */
function getArchetypeHoverHeight(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.hoverHeight) {
        return arch.abilityRules.hoverHeight;
    }
    return 0;
}

/**
 * Legacy functions kept for compatibility - return neutral values
 */
function getArchetypeBonusBounces(player) { return 0; }
function getArchetypeFallSpeedMult(player) { return 1; }
function isKnockbackImmune(player) { return false; }
function getVoidGracePeriod(player) { return 0; }

/**
 * Apply radial blast knockback to all players within range
 * @param {number} epicenterX - Explosion center X
 * @param {number} epicenterY - Explosion center Y
 * @param {number} blastRadius - Radius of effect
 * @param {number} maxForce - Maximum knockback force at epicenter
 * @param {number} excludePlayer - Player index to exclude (e.g., firing player), or -1 for none
 */
function applyBlastKnockback(epicenterX, epicenterY, blastRadius, maxForce, excludePlayer = -1) {
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        if (player.health <= 0) continue;
        if (i === excludePlayer) continue;
        if (isKnockbackImmune(player)) continue;

        const dx = player.x - epicenterX;
        const dy = player.y - epicenterY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < blastRadius && dist > 0) {
            // Falloff: stronger at center, weaker at edge
            const falloff = 1 - (dist / blastRadius);
            const force = maxForce * falloff;

            // Normalize direction and apply force
            const dirX = dx / dist;
            const dirY = dy / dist;

            // Apply impulse to player velocity
            player.vx += dirX * force;
            player.vy += dirY * force * 0.5;  // Less vertical knockback (feels better)

            // Visual feedback
            particles.sparks(player.x, player.y, Math.floor(force * 2), '#ffaa00');
        }
    }
}

/**
 * Trigger brilliant tank death explosion with terrain destruction
 * @param {Object} player - The player who died
 * @param {boolean} isVoidDeath - True if death was from void contact
 */
function triggerDeathExplosion(player, isVoidDeath = false) {
    const x = player.x;
    const y = player.y;
    const color = player.color;

    // MASSIVE TERRAIN DESTRUCTION (2-3x bigger)
    const deathBlastRadius = isVoidDeath ? 150 : 200;
    terrain.destroy(x, y, deathBlastRadius);

    // SPECTACULAR MULTI-STAGE EXPLOSION (3x particles)
    if (isVoidDeath) {
        // Void death: purple/magenta themed explosion being sucked into void
        particles.explosion(x, y, 300, COLORS.magenta, 200);
        particles.explosion(x, y, 200, '#8800ff', 150);
        particles.explosion(x, y, 150, color, 100);
        particles.sparks(x, y, 120, COLORS.magenta);
        particles.sparks(x, y, 80, '#8800ff');
        // Downward particle trail as if being pulled into void
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                particles.sparks(x + (Math.random() - 0.5) * 60, y + i * 6, 8, '#8800ff');
            }, i * 15);
        }
    } else {
        // Combat death: MASSIVE white-hot explosion (3x particles)
        particles.explosion(x, y, 400, COLORS.white, 300);
        particles.explosion(x, y, 300, color, 200);
        particles.explosion(x, y, 200, COLORS.orange, 150);
        particles.explosion(x, y, 150, COLORS.yellow, 100);
        particles.sparks(x, y, 150, COLORS.yellow);
        particles.sparks(x, y, 100, color);
        particles.sparks(x, y, 80, COLORS.white);
    }

    // Delayed secondary explosions (bigger debris chain)
    setTimeout(() => {
        particles.explosion(x - 50, y - 30, 80, COLORS.orange, 60);
        particles.sparks(x + 60, y, 50, COLORS.yellow);
        terrain.destroy(x - 40, y, 50);
    }, 80);
    setTimeout(() => {
        particles.explosion(x + 40, y + 20, 70, color, 50);
        terrain.destroy(x + 30, y + 20, 60);
    }, 160);
    setTimeout(() => {
        particles.explosion(x, y - 40, 60, COLORS.orange, 40);
        particles.sparks(x, y, 40, COLORS.white);
    }, 240);

    // INTENSE screen effects (stronger shake and flash)
    renderer.addScreenShake(isVoidDeath ? 60 : 80);
    renderer.flash(isVoidDeath ? COLORS.magenta : COLORS.white, 0.7);
    setTimeout(() => renderer.flash(color, 0.4), 80);
    setTimeout(() => renderer.flash(COLORS.orange, 0.2), 160);

    // Chromatic aberration on death (maximum intensity)
    triggerChromatic(5);

    // Sync space battle to player death
    const ambient = getAmbient();
    if (ambient) {
        ambient.triggerPlayerKillSync(x);
    }

    // Death notification (ELIMINATED text rising from corpse)
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

// ============================================================================
// Game Reset
// ============================================================================

function resetToTitle() {
    state.phase = 'title';
    state.gameMode = null;
    state.selectIndex = 0;
    state.humanPlayerCount = 2;  // Reset to default
}

function resetGame() {
    const humanCount = state.humanPlayerCount || 1;

    // Create players and get spawn positions
    state.players = createPlayers(NUM_PLAYERS, humanCount);
    const spawnXs = getSpawnPositions(NUM_PLAYERS);

    // Generate terrain with spawn positions for balancing (use virtual dimensions)
    terrain.generate(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, spawnXs, 250);  // Large edge margin to push terrain down at walls
    terrain.generateProps();  // Add stylized props (trees, buildings, pylons)

    // Position tanks on terrain
    state.players.forEach(p => {
        p.y = terrain.getHeightAt(p.x) - TANK_RADIUS;
    });

    // Reset lottery state
    state.lottery.active = false;
    state.lottery.cards = [];
    state.lottery.selectedIndex = 0;
    state.lottery.animationPhase = 'none';
    state.lottery.animationTimer = 0;
    state.lottery.pityCounter = 0;
    state.lotteryNotifications = [];

    state.currentPlayer = 0;
    state.turnCount = 0;
    state.round = 1;  // Reset stable round counter
    state.phase = 'archetype_select';
    state.selectIndex = 0;
    state.selectingPlayerIndex = 0;  // Reset archetype selection index
    state.projectile = null;
    state.projectiles = [];
    state.voidY = VIRTUAL_HEIGHT + 100;
    state.winner = null;
    state.aiThinkTime = 0;
    state.aiTargetAngle = 0;
    state.aiTargetPower = 0;
    // Reset event state
    state.gravity = DEFAULT_GRAVITY;
    state.activeEvent = null;
    state.originalTankType = null;
    state.originalGravity = undefined;
    state.anomalyProjectile = null;
    // Reset new physics event state
    state.velocityMultiplier = 1.0;
    state.baseWind = 0;
    state.wind = 0;
    state.windShiftPending = false;
    state.windShiftTimer = 0;
    state.extraBounces = 0;
    state.recoilPending = false;
    state.voidSurgePending = false;
    // Reset UFO buffs
    state.ufoBuffs = Array.from({ length: NUM_PLAYERS }, () => ({ damage: 0, blast: 0, bounces: 0 }));
    state.buffNotification = null;
    // Reset radiation status
    state.radiation = Array.from({ length: NUM_PLAYERS }, () => ({ turnsRemaining: 0, damagePerTurn: 0, sourcePlayer: -1 }));
    // Reset player rerolls for lottery
    state.players.forEach(p => p.rerollsRemaining = 1);
    // Reset persistent fields
    state.fields = [];
    // Reset active nukes
    state.nukes = [];
    state.nukeShockwave = null;
    state.mushroomCloud = null;

    // Reset orbital strike systems
    state.orbitalStock = {
        ORBITAL_BEACON: { total: 2, remaining: 2 },
        STRAFING_RUN: { total: 3, remaining: 3 },
        RAILGUN: { total: 3, remaining: 3 },
        NUKE: { total: 2, remaining: 2 }
    };
    state.orbitalBeacons = [];
    state.strafingRuns = [];
    state.desperationBeacons = [];
    state.dyingStarTurns = Array.from({ length: NUM_PLAYERS }, () => 0);
    state.storedWeapons = Array.from({ length: NUM_PLAYERS }, () => null);
    // Reset turn flow safety state
    state.turnEndLocked = false;
    state.firingStartTime = 0;

    // Reset new weapon systems
    state.blackHoles = [];
    state.pendingMeteors = [];
    state.voidCannonBeams = [];
    state.lightningArc = null;

    // Reset death notifications
    state.deathNotifications = [];

    // Select random biome for this game
    const biomeKey = BIOME_KEYS[Math.floor(Math.random() * BIOME_KEYS.length)];
    state.currentBiome = BIOMES[biomeKey];
    terrain.setBiomeColors(state.currentBiome);
    console.log(`[BIOME] Selected: ${state.currentBiome.name}`);
}

/**
 * Advance to next player in archetype selection, or start game if all done
 */
function advanceArchetypeSelection() {
    state.selectingPlayerIndex++;
    state.selectIndex = 0;  // Reset menu selection for next player

    // Check if all players have selected
    if (state.selectingPlayerIndex >= NUM_PLAYERS) {
        startGame();
    }
    // Otherwise, stay in archetype_select phase for next player
}

function startGame() {
    // Called after all players select archetypes

    // Apply initial archetype abilities (if any)
    state.players.forEach(p => applyGameStartAbilities(p));

    // Roll initial glitch event for round 1
    rollNewGlitchEvent();

    // Roll initial wind for round 1 (no announcement - nothing to shift from)
    state.baseWind = rollNewWind();
    state.wind = state.baseWind;
    state.windShiftPending = false;

    // Start with Cosmic Lottery for first turn
    startLottery();
}

// ============================================================================
// Projectile
// ============================================================================

/**
 * Convert linear charge (0-1) to nonlinear power curve
 * Gives more velocity boost in the upper charge range
 */
function chargeToPower(linearCharge) {
    // Quadratic curve: more power at high charge
    // At 0.5 charge: 0.35 power, at 1.0 charge: 1.0 power
    return linearCharge * (0.4 + 0.6 * linearCharge);
}

function fireProjectile() {
    const player = getCurrentPlayer();
    // Use weapon data from WEAPONS object
    const weapon = WEAPONS[player.weapon];
    if (!weapon) return;  // Safety check

    const angleRad = degToRad(180 - player.angle);

    // RAILGUN BEAM - special handling (instant fire, no charging)
    if (weapon.behavior === 'railgunBeam' || weapon.behavior === 'railgunInstant') {
        fireRailgunBeam(player, weapon, angleRad);
        return;
    }

    // PLASMA BEAM - hitscan with radiation effect
    if (weapon.behavior === 'plasmaBeam') {
        firePlasmaBeam(player, weapon, angleRad);
        return;
    }

    // METEOR SHOWER UP - fires straight up regardless of aim
    if (weapon.behavior === 'meteorShowerUp') {
        fireMeteorShowerUp(player, weapon);
        return;
    }

    // SCATTER SHELL - shotgun: fire 5 fragments in cone immediately
    if (weapon.behavior === 'scatterCone') {
        fireScatterShell(player, weapon, angleRad);
        return;
    }

    // Apply nonlinear charge curve for better range at high charge
    const effectivePower = chargeToPower(player.power);
    // Apply velocity multiplier from events (TIME DILATION, MUZZLE OVERCHARGE/DAMPEN)
    const speed = effectivePower * MAX_POWER * weapon.projectileSpeed * state.velocityMultiplier;

    // Get UFO buffs for current player
    const buffs = state.ufoBuffs[state.currentPlayer];
    const damageMultiplier = 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1));
    const blastBonus = buffs.blast * UFO_BUFF_TYPES.BLAST.bonus;
    const bounceBonus = buffs.bounces * UFO_BUFF_TYPES.BOUNCES.bonus;

    // BOUNCER: randomize bounces between 4-7
    let weaponBounces = weapon.bounces;
    if (weapon.behavior === 'bouncer' && weapon.bouncesMin && weapon.bouncesMax) {
        weaponBounces = weapon.bouncesMin + Math.floor(Math.random() * (weapon.bouncesMax - weapon.bouncesMin + 1));
    }

    state.projectile = {
        x: player.x,
        y: player.y - 20,
        vx: Math.cos(angleRad) * speed,
        vy: -Math.sin(angleRad) * speed,
        radius: weapon.projectileRadius,
        color: weapon.color || player.color,
        bounces: 0,
        // Apply extra bounces from ELASTIC WORLD event + UFO buff
        maxBounces: weaponBounces + state.extraBounces + bounceBonus + getArchetypeBonusBounces(player),
        trail: [],
        weaponKey: player.weapon,  // Store weapon key for explosion handling
        tankType: player.tankType, // Keep for backwards compatibility
        isCluster: false,  // Main projectile, not a bomblet
        // Store buffed stats for explosion
        buffedDamageMultiplier: damageMultiplier,
        buffedBlastBonus: blastBonus,
        firedByPlayer: state.currentPlayer  // Track who fired for buff clearing
    };

    // Clear buffs NOW (after applying to projectile) - buffs gained mid-flight persist until next shot
    state.ufoBuffs[state.currentPlayer] = { damage: 0, blast: 0, bounces: 0 };

    // Restore weapon after firing Dying Light
    if (player.weapon === 'DYING_STAR') {
        player.weapon = state.storedWeapons[state.currentPlayer] || 'MORTAR';
        state.storedWeapons[state.currentPlayer] = null;
        state.dyingStarTurns[state.currentPlayer] = 0;
    }

    // Apply RECOIL KICK - push tank backward from shot direction
    // FORTRESS archetype is immune to knockback
    if (state.recoilPending && !isKnockbackImmune(player)) {
        const recoilForce = 8;
        // Recoil is opposite to shot direction
        player.x -= Math.cos(angleRad) * recoilForce;
        // Add some visual feedback
        particles.sparks(player.x, player.y, 15, player.color);
        renderer.addScreenShake(8);
    }

    // Reset charge and switch to firing phase
    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
    state.firingStartTime = performance.now();  // For safety timeout
}

/**
 * Fire the RAILGUN beam weapon - instant beam with ricochet and line damage
 */
function fireRailgunBeam(player, weapon, angleRad) {
    // Get buffs
    const buffs = state.ufoBuffs[state.currentPlayer];
    const damageMultiplier = 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1));
    const archetypeDmgMult = getArchetypeDamageMultiplier(player);
    const effectiveDamage = weapon.damage * damageMultiplier * archetypeDmgMult;

    // Trace beam path with bounces
    const maxLength = weapon.maxBeamLength || 3000;
    const maxBounces = weapon.bounces + (buffs.bounces * UFO_BUFF_TYPES.BOUNCES.bonus);
    const beamPath = traceBeamPath(player.x, player.y - 20, angleRad, maxLength, maxBounces);

    // Store beam for rendering
    state.railgunBeam = {
        path: beamPath.points,
        timer: 0.5,  // Display for 0.5 seconds
        maxTimer: 0.5,
        damage: effectiveDamage,
        color: weapon.color,
        width: weapon.beamWidth || 8
    };

    // Apply line damage to all players along the beam path
    let totalEnemyDamage = 0;
    const hitPlayers = new Set();

    for (let i = 0; i < beamPath.points.length - 1; i++) {
        const p1 = beamPath.points[i];
        const p2 = beamPath.points[i + 1];

        // Check each player for intersection with beam segment
        for (let pi = 0; pi < state.players.length; pi++) {
            if (pi === state.currentPlayer) continue;  // Don't hit yourself
            const target = state.players[pi];
            if (target.health <= 0) continue;
            if (hitPlayers.has(target)) continue;  // Only hit each player once

            // Check if player is within beam segment
            const dist = pointToSegmentDistance(target.x, target.y, p1.x, p1.y, p2.x, p2.y);
            if (dist < TANK_RADIUS + weapon.beamWidth) {
                hitPlayers.add(target);

                // Deal damage
                const dmg = effectiveDamage;
                target.health = Math.max(0, target.health - dmg);

                // Track enemy damage for coins
                if (pi !== state.currentPlayer) {
                    totalEnemyDamage += dmg;
                }

                // Visual hit effect
                particles.explosion(target.x, target.y, 50, COLORS.white, 30);
                particles.sparks(target.x, target.y, 40, weapon.color);
                particles.sparks(target.x, target.y, 30, COLORS.cyan);

                // Check for kill
                if (target.health <= 0) {
                    if (pi !== state.currentPlayer) {
                        player.coins += KILL_BONUS;
                    }
                    triggerDeathExplosion(target, false);
                    audio.playKill();
                }
            }
        }
    }

    // Award coins for damage
    if (totalEnemyDamage > 0) {
        player.coins += Math.floor(totalEnemyDamage * COINS_PER_DAMAGE);
    }

    // Terrain damage at terminus point
    const terminus = beamPath.points[beamPath.points.length - 1];
    terrain.destroy(terminus.x, terminus.y, weapon.blastRadius);

    // Visual effects
    renderer.addScreenShake(25);
    renderer.flash(COLORS.white, 0.5);
    renderer.flash(weapon.color, 0.3);
    triggerChromatic(3);  // Chromatic on railgun hit
    audio.playExplosion(1.2);

    // Particles along beam
    for (const point of beamPath.points) {
        particles.sparks(point.x, point.y, 15, weapon.color);
    }

    // Clear buffs
    state.ufoBuffs[state.currentPlayer] = { damage: 0, blast: 0, bounces: 0 };

    // Reset charge and end turn
    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
    state.firingStartTime = performance.now();  // For safety timeout

    // Schedule turn end (let beam display)
    setTimeout(() => {
        if (state.phase === 'firing') {
            tryEndTurn();  // Check for other pending effects
        }
    }, 400);
}

/**
 * Fire PLASMA BEAM - hitscan that stops at terrain/walls and irradiates targets
 */
function firePlasmaBeam(player, weapon, angleRad) {
    const buffs = state.ufoBuffs[state.currentPlayer];
    const damageMultiplier = 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1));
    const archetypeDmgMult = getArchetypeDamageMultiplier(player);
    const effectiveDamage = weapon.damage * damageMultiplier * archetypeDmgMult;

    // Trace beam path - no bounces, stops at terrain
    const maxLength = 2500;
    const beamPath = tracePlasmaBeamPath(player.x, player.y - 20, angleRad, maxLength);

    // Store beam for rendering (green plasma visual)
    state.railgunBeam = {
        path: beamPath.points,
        timer: 0.4,
        maxTimer: 0.4,
        damage: effectiveDamage,
        color: weapon.color,
        width: weapon.beamWidth || 6
    };

    // Apply damage and radiation to hit players
    let totalEnemyDamage = 0;
    for (let pi = 0; pi < state.players.length; pi++) {
        if (pi === state.currentPlayer) continue;
        const target = state.players[pi];
        if (target.health <= 0) continue;

        // Check if player is along beam path
        for (let i = 0; i < beamPath.points.length - 1; i++) {
            const p1 = beamPath.points[i];
            const p2 = beamPath.points[i + 1];
            const dist = pointToSegmentDistance(target.x, target.y, p1.x, p1.y, p2.x, p2.y);

            if (dist < TANK_RADIUS + (weapon.beamWidth || 6)) {
                // Deal direct damage
                target.health = Math.max(0, target.health - effectiveDamage);
                totalEnemyDamage += effectiveDamage;

                // Apply radiation status effect
                state.radiation[pi] = {
                    turnsRemaining: weapon.radiationTurns || 2,
                    damagePerTurn: weapon.radiationDamage || 20,
                    sourcePlayer: state.currentPlayer
                };

                // Visual hit effect - green radiation
                particles.explosion(target.x, target.y, 40, '#00ff88', 25);
                particles.sparks(target.x, target.y, 30, weapon.color);
                particles.sparks(target.x, target.y, 20, '#00ffaa');

                // Check for kill
                if (target.health <= 0) {
                    player.coins += KILL_BONUS;
                    player.kills++;
                    triggerDeathExplosion(target, false);
                    audio.playKill();
                }
                break; // Only hit each player once
            }
        }
    }

    // Award coins for damage
    if (totalEnemyDamage > 0) {
        player.coins += Math.floor(totalEnemyDamage * COINS_PER_DAMAGE);
    }

    // Small terrain damage at terminus
    const terminus = beamPath.points[beamPath.points.length - 1];
    terrain.destroy(terminus.x, terminus.y, weapon.blastRadius || 25);

    // Visual effects
    renderer.addScreenShake(12);
    renderer.flash(weapon.color, 0.3);
    audio.playExplosion(0.8);

    // Particles along beam
    for (const point of beamPath.points) {
        if (Math.random() < 0.3) {
            particles.sparks(point.x, point.y, 10, weapon.color);
        }
    }

    // Clear buffs and end turn
    state.ufoBuffs[state.currentPlayer] = { damage: 0, blast: 0, bounces: 0 };
    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
    state.firingStartTime = performance.now();

    setTimeout(() => {
        if (state.phase === 'firing') {
            tryEndTurn();  // Check for other pending effects
        }
    }, 350);
}

/**
 * Trace plasma beam path - stops at terrain or walls (no bounces)
 */
function tracePlasmaBeamPath(startX, startY, angle, maxLength) {
    const points = [{ x: startX, y: startY }];
    let x = startX;
    let y = startY;
    const dx = Math.cos(angle);
    const dy = -Math.sin(angle);
    const stepSize = 5;
    let traveled = 0;

    while (traveled < maxLength) {
        x += dx * stepSize;
        y += dy * stepSize;
        traveled += stepSize;

        // Check wall boundaries
        if (x < 0 || x > VIRTUAL_WIDTH) {
            points.push({ x: Math.max(0, Math.min(VIRTUAL_WIDTH, x)), y });
            break;
        }

        // Check ceiling
        if (y < 0) {
            points.push({ x, y: 0 });
            break;
        }

        // Check terrain collision
        const terrainHeight = terrain.getHeightAt(x);
        if (y >= terrainHeight) {
            points.push({ x, y: terrainHeight });
            break;
        }

        // Check void
        if (y >= state.voidY) {
            points.push({ x, y: state.voidY });
            break;
        }
    }

    // Add final point if we ran out of range
    if (traveled >= maxLength) {
        points.push({ x, y });
    }

    return { points };
}

/**
 * Fire METEOR SHOWER UP - fires straight up, then meteors rain across map
 */
function fireMeteorShowerUp(player, weapon) {
    const buffs = state.ufoBuffs[state.currentPlayer];

    // Create signal flare going straight up
    state.projectile = {
        x: player.x,
        y: player.y - 20,
        vx: 0,
        vy: -weapon.projectileSpeed * MAX_POWER,  // Straight up
        radius: weapon.projectileRadius,
        color: weapon.color,
        bounces: 0,
        maxBounces: 0,
        trail: [],
        weaponKey: player.weapon,
        isCluster: false,
        isSignalFlare: true,  // Mark as signal flare
        buffedDamageMultiplier: 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1)),
        buffedBlastBonus: buffs.blast * UFO_BUFF_TYPES.BLAST.bonus,
        firedByPlayer: state.currentPlayer
    };

    // Clear buffs
    state.ufoBuffs[state.currentPlayer] = { damage: 0, blast: 0, bounces: 0 };

    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
    state.firingStartTime = performance.now();
}

/**
 * Fire SCATTER SHELL - shotgun style, fires multiple fragments in cone immediately
 */
function fireScatterShell(player, weapon, angleRad) {
    const buffs = state.ufoBuffs[state.currentPlayer];
    const damageMultiplier = 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1));
    const blastBonus = buffs.blast * UFO_BUFF_TYPES.BLAST.bonus;

    // Apply nonlinear charge curve for better range at high charge
    const effectivePower = chargeToPower(player.power);
    const baseSpeed = effectivePower * MAX_POWER * weapon.projectileSpeed * state.velocityMultiplier;

    const fragmentCount = weapon.fragmentCount || 5;
    const coneAngle = (weapon.coneAngle || 60) * Math.PI / 180;

    // Fire all fragments immediately in a cone
    for (let i = 0; i < fragmentCount; i++) {
        // Spread evenly across the cone
        const spreadOffset = (i / (fragmentCount - 1) - 0.5) * coneAngle;
        const fragmentAngle = angleRad + spreadOffset;

        // Slight speed variation for natural spread
        const speedVariation = 0.85 + Math.random() * 0.3;
        const speed = baseSpeed * speedVariation;

        state.projectiles.push({
            x: player.x,
            y: player.y - 20,
            vx: Math.cos(fragmentAngle) * speed,
            vy: -Math.sin(fragmentAngle) * speed,
            radius: 5,
            color: weapon.color,
            bounces: 0,
            maxBounces: weapon.bounces + state.extraBounces,
            trail: [],
            weaponKey: null,  // Prevent special behaviors on impact
            isCluster: true,
            isFragment: true,
            firedByPlayer: state.currentPlayer,
            buffedDamageMultiplier: damageMultiplier,
            buffedBlastBonus: blastBonus,
            fragmentDamage: weapon.damage,
            fragmentBlastRadius: weapon.blastRadius
        });
    }

    // Visual/audio feedback
    particles.sparks(player.x, player.y - 20, 20, weapon.color);
    audio.playExplosion(0.5);

    // Clear buffs
    state.ufoBuffs[state.currentPlayer] = { damage: 0, blast: 0, bounces: 0 };

    player.power = 0;
    player.charging = false;
    state.phase = 'firing';
    state.firingStartTime = performance.now();
}

/**
 * Trace a beam path with wall/ceiling bounces
 * @returns {{ points: Array<{x, y}> }}
 */
function traceBeamPath(startX, startY, angle, maxLength, maxBounces) {
    const points = [{ x: startX, y: startY }];
    let x = startX;
    let y = startY;
    let dx = Math.cos(angle);
    let dy = -Math.sin(angle);  // Note: negative because canvas Y increases downward
    let remainingLength = maxLength;
    let bounces = 0;

    while (remainingLength > 0 && bounces <= maxBounces) {
        // Step along beam checking for collisions
        const stepSize = 5;
        let hitSomething = false;

        for (let step = 0; step < remainingLength / stepSize; step++) {
            const nextX = x + dx * stepSize;
            const nextY = y + dy * stepSize;

            // Check wall bounce (left/right)
            if (nextX < WORLD_LEFT || nextX > WORLD_RIGHT) {
                x = nextX < WORLD_LEFT ? WORLD_LEFT : WORLD_RIGHT;
                y = nextY;
                points.push({ x, y });
                dx = -dx;  // Reflect horizontally
                bounces++;
                hitSomething = true;
                remainingLength -= step * stepSize;
                break;
            }

            // Check ceiling bounce
            if (nextY < WORLD_TOP) {
                x = nextX;
                y = WORLD_TOP;
                points.push({ x, y });
                dy = -dy;  // Reflect vertically
                bounces++;
                hitSomething = true;
                remainingLength -= step * stepSize;
                break;
            }

            // Railgun melts through terrain - destroy it and continue
            if (terrain.isPointBelowTerrain(nextX, nextY)) {
                // Carve a path through the terrain
                terrain.destroy(nextX, nextY, 15);  // Small radius carve as beam passes
                // Continue - don't stop the beam
            }

            // Check void hit (terminates beam)
            if (nextY > state.voidY) {
                points.push({ x: nextX, y: state.voidY });
                return { points };  // Beam stops at void
            }

            x = nextX;
            y = nextY;
            remainingLength -= stepSize;
        }

        if (!hitSomething) {
            // Ran out of length without hitting anything
            points.push({ x, y });
            break;
        }
    }

    return { points };
}

/**
 * Calculate distance from point to line segment
 */
function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) {
        param = dot / lenSq;
    }

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
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
    proj.vy += state.gravity;

    // Apply wind (WIND BLAST event)
    if (state.wind !== 0) {
        proj.vx += state.wind;
    }

    // Apply black hole pull (during active black holes)
    for (const hole of state.blackHoles) {
        const dx = hole.x - proj.x;
        const dy = hole.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hole.pullRadius && dist > 10) {
            const force = hole.pullStrength * (1 - dist / hole.pullRadius);
            proj.vx += (dx / dist) * force;
            proj.vy += (dy / dist) * force;
        }
    }

    // HUNTER archetype - slight homing on all projectiles
    const firingPlayerForHoming = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
    const homingStrength = getArchetypeHomingStrength(state.players[firingPlayerForHoming]);
    if (homingStrength > 0 && !proj.isRolling) {
        // Find nearest living enemy for homing
        let homingTarget = null;
        let minHomingDist = Infinity;
        for (let i = 0; i < state.players.length; i++) {
            if (i === firingPlayerForHoming) continue;
            const p = state.players[i];
            if (p.health <= 0) continue;
            const d = distance(proj.x, proj.y, p.x, p.y);
            if (d < minHomingDist) {
                minHomingDist = d;
                homingTarget = p;
            }
        }
        if (homingTarget) {
            const hdx = homingTarget.x - proj.x;
            const hdy = homingTarget.y - proj.y;
            const hdist = Math.sqrt(hdx * hdx + hdy * hdy);
            if (hdist > 0) {
                proj.vx += (hdx / hdist) * homingStrength;
                proj.vy += (hdy / hdist) * homingStrength;
            }
        }
    }

    // Get weapon for behavior checks
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // SPLITTER AIRBURST behavior - chain-split up to maxSplitLevel
    if (weapon && weapon.behavior === 'splitterAirburst') {
        const splitLevel = proj.splitLevel || 0;
        const maxLevel = weapon.maxSplitLevel || 4;

        // Only split if we haven't reached max depth
        if (splitLevel < maxLevel) {
            proj.airburstTimer = (proj.airburstTimer || 0) + dt;

            // First split uses longer delay, subsequent splits are faster
            const delay = splitLevel === 0
                ? (weapon.airburstDelay || 0.8)
                : (weapon.subsequentDelay || 0.3);

            if (proj.airburstTimer >= delay) {
                // Determine fragment count: first split = 4, rest = 2
                const fragmentCount = splitLevel === 0
                    ? (weapon.splitCount || 4)
                    : (weapon.subsequentSplitCount || 2);

                const isFinalLevel = (splitLevel + 1) >= maxLevel;
                spawnAirburstFragments(proj, fragmentCount, isFinalLevel, splitLevel + 1);

                // Remove this projectile
                if (splitLevel === 0) {
                    state.projectile = null;
                } else {
                    const idx = state.projectiles.indexOf(proj);
                    if (idx >= 0) state.projectiles.splice(idx, 1);
                }
                return;
            }
        }
    }

    // SEEKER LOCK-ON behavior - locks on at apex then strong homing
    if (weapon && (weapon.behavior === 'seeker' || weapon.behavior === 'seekerLockOn') && !proj.isRolling) {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;

        // Track flight time for lock-on delay
        proj.flightTime = (proj.flightTime || 0) + dt;

        // Detect apex (when vertical velocity changes from negative to positive)
        if (!proj.hasLockedOn && proj.vy >= 0 && proj.flightTime > 0.1) {
            proj.hasLockedOn = true;
            // Visual lock-on indicator
            particles.sparks(proj.x, proj.y, 20, '#ff44ff');
            audio.playBounce();  // Click sound for lock
        }

        // Find nearest living enemy
        let targetPlayer = null;
        let minDist = Infinity;
        for (let i = 0; i < state.players.length; i++) {
            if (i === firingPlayer) continue;
            const p = state.players[i];
            if (p.health <= 0) continue;
            const d = distance(proj.x, proj.y, p.x, p.y);
            if (d < minDist) {
                minDist = d;
                targetPlayer = p;
            }
        }

        if (targetPlayer) {
            const dx = targetPlayer.x - proj.x;
            const dy = targetPlayer.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                // Use strong homing ONLY after lock-on
                const seekStrength = proj.hasLockedOn ? (weapon.seekStrength || 0.15) : 0.01;
                proj.vx += (dx / dist) * seekStrength;
                proj.vy += (dy / dist) * seekStrength;

                // Trail effect while homing
                if (proj.hasLockedOn && Math.random() < 0.5) {
                    particles.trail(proj.x, proj.y, '#ff44ff');
                }
            }
        }
    }

    // APEX CLUSTER behavior (GRAVITY_MORTAR) - spawn cluster at apex
    if (weapon && weapon.behavior === 'apexCluster' && !proj.isRolling && !proj.hasTriggeredApex) {
        proj.flightTime = (proj.flightTime || 0) + dt;
        // Detect apex (when vertical velocity changes from negative to positive)
        if (proj.vy >= 0 && proj.flightTime > 0.1) {
            proj.hasTriggeredApex = true;
            // Spawn cluster bomblets falling down
            const clusterCount = weapon.clusterCount || 4;
            spawnApexClusterBombs(proj, clusterCount, true);  // true = gravity mortar style (fall down)
            // Remove parent projectile
            state.projectile = null;
            return;
        }
    }

    // PROXIMITY SPLIT behavior (VOID_SPLITTER) - split when near enemy
    if (weapon && weapon.behavior === 'proximitySplit' && !proj.isRolling && !proj.hasSplitProximity) {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        const proximityRadius = weapon.proximityRadius || 200;

        // Check distance to nearest enemy
        for (let i = 0; i < state.players.length; i++) {
            if (i === firingPlayer) continue;
            const player = state.players[i];
            if (player.health <= 0) continue;

            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < proximityRadius) {
                proj.hasSplitProximity = true;
                // Spawn homing fragments toward this enemy
                const splitCount = weapon.splitCount || 3;
                spawnProximityHomingFragments(proj, player, splitCount, weapon.homingStrength || 0.08);
                // Remove parent projectile
                state.projectile = null;
                return;
            }
        }
    }

    // UNDERGROUND SEEKER behavior - burrow then seek
    if (weapon && weapon.behavior === 'undergroundSeeker') {
        if (proj.isBurrowing) {
            // Move through ground toward nearest enemy
            const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
            let targetPlayer = null;
            let minDist = Infinity;
            for (let i = 0; i < state.players.length; i++) {
                if (i === firingPlayer) continue;
                const p = state.players[i];
                if (p.health <= 0) continue;
                const d = Math.abs(p.x - proj.x);
                if (d < minDist && d < (weapon.seekRange || 300)) {
                    minDist = d;
                    targetPlayer = p;
                }
            }

            // Move toward target X
            if (targetPlayer) {
                const dx = targetPlayer.x - proj.x;
                proj.vx = Math.sign(dx) * (weapon.burrowSpeed || 8);
            }
            proj.vy = 0;  // Stay underground
            proj.y = terrain.getHeightAt(proj.x) + 30;

            // Carve tunnel
            terrain.destroy(proj.x, proj.y, 25);

            // Visual underground indicator
            if (Math.random() < 0.3) {
                particles.sparks(proj.x, terrain.getHeightAt(proj.x), 5, '#440088');
            }

            // Check if under a player to erupt
            for (let i = 0; i < state.players.length; i++) {
                if (i === firingPlayer) continue;
                const player = state.players[i];
                if (player.health <= 0) continue;
                if (Math.abs(player.x - proj.x) < 40) {
                    // ERUPT beneath enemy - deal damage and explode!
                    const eruptX = proj.x;
                    const eruptY = terrain.getHeightAt(proj.x) - 20;  // Just below surface

                    // Massive upward explosion visual
                    particles.explosion(eruptX, eruptY, 80, '#8800ff', 80);
                    particles.explosion(eruptX, eruptY - 50, 60, '#ffffff', 60);
                    particles.explosion(eruptX, eruptY - 100, 40, '#ff00ff', 40);
                    renderer.addScreenShake(35);
                    audio.playExplosion(1.0);

                    // Deal damage to all players in blast radius
                    const blastRadius = weapon.blastRadius || 70;
                    const damage = weapon.damage || 90;
                    for (let j = 0; j < state.players.length; j++) {
                        if (j === firingPlayer) continue;
                        const target = state.players[j];
                        if (target.health <= 0) continue;
                        const dist = distance(eruptX, eruptY, target.x, target.y);
                        if (dist < blastRadius) {
                            const falloff = 1 - (dist / blastRadius) * 0.5;
                            const dmg = damage * falloff;
                            target.health = Math.max(0, target.health - dmg);
                            particles.sparks(target.x, target.y, 30, '#ffffff');
                            if (target.health <= 0) {
                                state.players[firingPlayer].coins += KILL_BONUS;
                                triggerDeathExplosion(target, false);
                            }
                        }
                    }

                    // Destroy terrain - carve upward crater
                    terrain.destroy(eruptX, eruptY, blastRadius * 0.8);

                    // End projectile and turn
                    state.projectile = null;
                    endTurn();
                    return;
                }
            }

            // Timeout - erupt in place after 3 seconds
            proj.burrowTimer = (proj.burrowTimer || 0) + dt;
            if (proj.burrowTimer > 3) {
                // Timeout eruption - smaller explosion at current position
                const eruptX = proj.x;
                const eruptY = terrain.getHeightAt(proj.x);
                particles.explosion(eruptX, eruptY, 50, '#8800ff', 50);
                renderer.addScreenShake(15);
                audio.playExplosion(0.6);
                terrain.destroy(eruptX, eruptY, 40);
                state.projectile = null;
                endTurn();
                return;
            }
        }
    }

    // SOLAR FLARE RAIN behavior - rains fire projectiles along trajectory
    if (weapon && (weapon.behavior === 'solarFlare' || weapon.behavior === 'solarFlareRain') && !proj.isCluster) {
        // Initialize fire rain timer
        if (proj.fireRainTimer === undefined) {
            proj.fireRainTimer = 0;
            proj.fireRainCount = 0;
        }
        proj.fireRainTimer += dt;

        const firstDelay = weapon.fireRainDelay || 0.2;
        const interval = weapon.fireRainInterval || 0.1;

        // Calculate next fire time
        const nextFireTime = proj.fireRainCount === 0 ? firstDelay : firstDelay + (proj.fireRainCount - 1) * interval + interval;

        // Drop fire projectile when timer reaches next fire time
        if (proj.fireRainTimer >= nextFireTime && proj.y > 0 && proj.y < state.voidY) {
            proj.fireRainCount++;

            // Spawn fire projectile dropping straight down
            state.projectiles.push({
                x: proj.x,
                y: proj.y,
                vx: (Math.random() - 0.5) * 2,
                vy: 8 + Math.random() * 3,  // Falls down
                radius: 5,
                color: '#ff6600',
                bounces: 0,
                maxBounces: 0,
                trail: [],
                weaponKey: null,  // CRITICAL: Prevent recursion
                isCluster: true,
                isFragment: true,
                isFireRain: true,  // Mark for napalm effect
                fragmentDamage: weapon.fireRainDamage || 15,
                fragmentBlastRadius: weapon.fireRainRadius || 30,
                firedByPlayer: proj.firedByPlayer,
                buffedDamageMultiplier: 1,
                buffedBlastBonus: 0,
                leavesNapalm: weapon.leavesNapalm,
                napalmDuration: weapon.napalmDuration || 4,
                napalmDamage: weapon.napalmDamage || 8
            });

            // Visual feedback
            particles.sparks(proj.x, proj.y, 8, '#ffaa00');
        }
    }

    // ROLLER behavior - roll along terrain surface
    if (proj.isRolling) {
        // Apply friction
        proj.vx *= 0.98;

        // Follow terrain slope
        const terrainY = terrain.getHeightAt(proj.x);
        const slopeAhead = terrain.getHeightAt(proj.x + Math.sign(proj.vx || 1) * 5);
        const slopeDiff = slopeAhead - terrainY;
        proj.vx += slopeDiff * 0.1; // Roll downhill

        // Actually move the roller!
        proj.x += proj.vx;

        // Keep on terrain surface
        proj.y = terrain.getHeightAt(proj.x) - proj.radius;
        proj.vy = 0;

        // === ROLLER SHOCKWAVES ===
        // Emit shockwaves every 0.3s while rolling
        const rollerWeapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
        if (rollerWeapon && rollerWeapon.shockwaveInterval) {
            proj.shockwaveTimer = (proj.shockwaveTimer || 0) + dt;
            if (proj.shockwaveTimer >= rollerWeapon.shockwaveInterval) {
                proj.shockwaveTimer = 0;

                const swDamage = rollerWeapon.shockwaveDamage || 20;
                const swRadius = rollerWeapon.shockwaveRadius || 20;

                // Visual shockwave effect
                particles.sparks(proj.x, proj.y, 15, '#aaaaff');
                renderer.addScreenShake(5);

                // Small terrain damage
                terrain.destroy(proj.x, proj.y, swRadius * 0.5);

                // Apply shockwave damage to nearby players
                const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
                for (const player of state.players) {
                    if (player.health <= 0) continue;
                    const dist = distance(proj.x, proj.y, player.x, player.y);
                    if (dist < swRadius * 2) {
                        const falloff = 1 - (dist / (swRadius * 2));
                        const dmg = swDamage * falloff;
                        player.health = Math.max(0, player.health - dmg);
                        if (dmg > 5) {
                            particles.sparks(player.x, player.y, 8, '#aaaaff');
                        }
                    }
                }
            }
        }

        // Check for player collision while rolling
        for (const player of state.players) {
            const dist = Math.sqrt((proj.x - player.x) ** 2 + (proj.y - player.y) ** 2);
            if (dist < proj.radius + TANK_RADIUS) {
                onExplode(proj);
                state.projectile = null;
                return;
            }
        }

        // Stop rolling if slow enough
        if (Math.abs(proj.vx) < 0.5) {
            proj.rollTimer = (proj.rollTimer || 0) + dt;
            if (proj.rollTimer > 0.5) {
                onExplode(proj);
                state.projectile = null;
                return;
            }
        } else {
            proj.rollTimer = 0;
        }

        // === ENFORCE WORLD BOUNDARIES WHILE ROLLING ===
        enforceProjectileBounds(proj);

        return; // Skip normal physics while rolling
    }

    // Move first (same pattern as working events.js bounce code)
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Wall bounces - INFINITE ricochets (don't count toward weapon's maxBounces)
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        // Wall bounces don't call onBounce() - only terrain impacts do
        particles.sparks(proj.x, proj.y, 10, proj.color);
        renderer.addScreenShake(3);
        audio.playBounce();
    }

    // NO ceiling bounce - projectiles can arc high and fall back down
    // (Removed ceiling bounce to allow skillful high-arc shots)

    // METEOR SHOWER SIGNAL FLARE - trigger meteors when going off-screen
    if (proj.isSignalFlare && proj.y < -100) {
        triggerMeteorShower(proj);
        state.projectile = null;
        return;
    }

    // Spawn trail particles occasionally
    if (Math.random() < 0.3) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

    // BOUNCING BETTY - explode on enemy contact
    const bettyWeapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (bettyWeapon && bettyWeapon.behavior === 'bouncingBetty' && bettyWeapon.explodesOnEnemyContact) {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        for (let i = 0; i < state.players.length; i++) {
            if (i === firingPlayer) continue;  // Don't hit self
            const player = state.players[i];
            if (player.health <= 0) continue;

            const dist = Math.sqrt((proj.x - player.x) ** 2 + (proj.y - player.y) ** 2);
            if (dist < proj.radius + TANK_RADIUS) {
                // Direct enemy contact - explode!
                particles.sparks(proj.x, proj.y, 25, '#ff8888');
                onExplode(proj);
                state.projectile = null;
                return;
            }
        }
    }

    // Check projectile termination conditions (Codex suggestion)
    // 1. Hits terrain
    if (terrain.isPointBelowTerrain(proj.x, proj.y)) {
        const projWeapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

        // ROLLER behavior - start rolling on terrain instead of exploding
        if (projWeapon && projWeapon.behavior === 'roller' && !proj.isRolling) {
            proj.isRolling = true;
            // Preserve horizontal momentum, kill vertical
            proj.vy = 0;
            // Place on surface
            proj.y = terrain.getHeightAt(proj.x) - proj.radius;
            // Visual feedback
            particles.sparks(proj.x, proj.y, 15, proj.color);
            audio.playBounce();
            return;
        }

        // BOUNCER behavior - bounce off terrain like a pinball
        if (projWeapon && projWeapon.behavior === 'bouncer') {
            // Calculate terrain slope for reflection
            const sampleDist = 10;
            const heightLeft = terrain.getHeightAt(proj.x - sampleDist);
            const heightRight = terrain.getHeightAt(proj.x + sampleDist);
            const heightCenter = terrain.getHeightAt(proj.x);

            // Terrain slope (rise over run)
            const slope = (heightRight - heightLeft) / (sampleDist * 2);

            // Calculate terrain normal (perpendicular to surface, pointing up)
            // Normal = normalize(-slope, 1) for a surface with slope dy/dx
            const normalLen = Math.sqrt(slope * slope + 1);
            const nx = -slope / normalLen;
            const ny = -1 / normalLen;  // Negative because y increases downward

            // Reflect velocity: v' = v - 2(v·n)n
            const dot = proj.vx * nx + proj.vy * ny;
            proj.vx = (proj.vx - 2 * dot * nx) * 0.85;  // Energy loss on bounce
            proj.vy = (proj.vy - 2 * dot * ny) * 0.85;

            // Ensure minimum upward velocity so it doesn't get stuck
            if (proj.vy > -3) proj.vy = -3;

            // Move projectile above terrain surface
            proj.y = heightCenter - proj.radius - 2;

            // Trigger bounce effects (explosion on every bounce for bouncer)
            onBounce(proj);
            particles.sparks(proj.x, proj.y, 20, proj.color);
            particles.sparks(proj.x, proj.y, 10, '#ffffff');
            audio.playBounce();

            // Check if out of bounces
            if (proj.bounces >= proj.maxBounces) {
                proj.isFinalBounce = true;
                onExplode(proj);
                state.projectile = null;
            }
            return;
        }

        // DRILL behavior - pierce through terrain, carving a tunnel
        if (projWeapon && projWeapon.behavior === 'drill') {
            // Track that we're in terrain
            proj.inTerrain = true;

            // Carve tunnel while drilling - continuous terrain destruction
            const tunnelWidth = projWeapon.tunnelWidth || 40;
            terrain.destroy(proj.x, proj.y, tunnelWidth * 0.5);

            // Slow down slightly while drilling
            proj.vx *= 0.995;
            proj.vy *= 0.995;

            // Spawn drill particles (more dramatic)
            if (Math.random() < 0.6) {
                particles.sparks(proj.x, proj.y, 5, '#886644');
                particles.sparks(proj.x, proj.y, 3, '#aa8866');
            }

            // Visual drill glow
            if (Math.random() < 0.3) {
                particles.trail(proj.x, proj.y, '#cccccc');
            }

            // Small screen shake while drilling
            if (Math.random() < 0.1) {
                renderer.addScreenShake(2);
            }

            // Check for player collision while drilling (direct hit)
            for (const player of state.players) {
                const dist = Math.sqrt((proj.x - player.x) ** 2 + (proj.y - player.y) ** 2);
                if (dist < proj.radius + TANK_RADIUS * 0.5) {
                    onExplode(proj);
                    state.projectile = null;
                    return;
                }
            }
            return; // Don't explode, keep drilling
        }

        // UNDERGROUND SEEKER behavior - start burrowing
        if (projWeapon && projWeapon.behavior === 'undergroundSeeker' && !proj.isBurrowing) {
            proj.isBurrowing = true;
            proj.burrowTimer = 0;
            particles.explosion(proj.x, proj.y, 30, '#440088', 40);
            renderer.addScreenShake(10);
            return;
        }

        // BOUNCING BETTY / BOUNCE DAMAGE UP behavior - bounces across map with increasing damage
        if (projWeapon && (projWeapon.behavior === 'bounceDamageUp' || projWeapon.behavior === 'bouncingBetty')) {
            // Reflect off terrain like bouncer
            const sampleDist = 10;
            const heightLeft = terrain.getHeightAt(proj.x - sampleDist);
            const heightRight = terrain.getHeightAt(proj.x + sampleDist);
            const heightCenter = terrain.getHeightAt(proj.x);
            const slope = (heightRight - heightLeft) / (sampleDist * 2);
            const normalLen = Math.sqrt(slope * slope + 1);
            const nx = -slope / normalLen;
            const ny = -1 / normalLen;
            const dot = proj.vx * nx + proj.vy * ny;
            proj.vx = (proj.vx - 2 * dot * nx) * 0.9;  // Less energy loss for more bounces
            proj.vy = (proj.vy - 2 * dot * ny) * 0.9;
            if (proj.vy > -4) proj.vy = -4;  // Ensure good bounce height
            proj.y = heightCenter - proj.radius - 2;

            // Track damage modifier
            proj.accumulatedDamageBonus = (proj.accumulatedDamageBonus || 0) + (projWeapon.bounceDamageModifier || 0);

            onBounce(proj);
            particles.sparks(proj.x, proj.y, 15, proj.color);
            audio.playBounce();

            if (proj.bounces >= proj.maxBounces) {
                proj.isFinalBounce = true;
                onExplode(proj);
                state.projectile = null;
            }
            return;
        }

        // NUKE behavior - land and start fuse timer instead of exploding
        if (projWeapon && (projWeapon.behavior === 'nuke' || projWeapon.behavior === 'nukeCinematic')) {
            const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
            // Place nuke on terrain surface
            const landY = terrain.getHeightAt(proj.x) - proj.radius;
            state.nukes.push({
                x: proj.x,
                y: landY,
                fuseTimer: projWeapon.fuseTime || 3,
                firedByPlayer: firingPlayer,
                weaponKey: proj.weaponKey,
                color: proj.color,
                radius: proj.radius,
                // Store buff bonuses from projectile
                buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
                buffedBlastBonus: proj.buffedBlastBonus || 0
            });
            // Visual feedback - nuke lands with ominous thud
            particles.sparks(proj.x, landY, 30, '#ffff00');
            particles.sparks(proj.x, landY, 20, '#ff8800');
            renderer.addScreenShake(15);
            audio.playBounce();
            // Clear projectile - turn ends when nuke explodes (in triggerCinematicNukeExplosion)
            state.projectile = null;
            state.firingStartTime = performance.now();  // Reset timeout for fuse duration
            return;
        }

        // ORBITAL BEACON behavior - land and start targeting sequence
        if (projWeapon && projWeapon.behavior === 'orbitalBeacon') {
            const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
            const landY = terrain.getHeightAt(proj.x) - proj.radius;
            const ambient = getAmbient();
            const targetShip = ambient ? ambient.findNearestCapitalShip(proj.x) : null;
            state.orbitalBeacons.push({
                x: proj.x,
                y: landY,
                phase: 'landed',
                timer: 0,
                targetingShip: targetShip,
                firedByPlayer: firingPlayer,
                weaponKey: proj.weaponKey,
                color: proj.color
            });
            // Restore previous weapon (orbital weapons are one-time use)
            const player = state.players[firingPlayer];
            if (state.storedWeapons[firingPlayer]) {
                player.weapon = state.storedWeapons[firingPlayer];
                state.storedWeapons[firingPlayer] = null;
            } else {
                player.weapon = 'MORTAR';  // Fallback
            }
            // Visual feedback - beacon lands
            particles.sparks(proj.x, landY, 25, '#ff6600');
            particles.sparks(proj.x, landY, 15, '#ffffff');
            renderer.addScreenShake(10);
            audio.playBounce();
            state.projectile = null;
            // Note: Don't end turn yet - beacon sequence needs to complete first
            // tryEndTurn() will wait for orbitalBeacons to resolve
            tryEndTurn();
            return;
        }

        // STRAFING RUN behavior - mark target area and start warning
        if (projWeapon && projWeapon.behavior === 'strafingRun') {
            const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
            const direction = Math.random() < 0.5 ? 1 : -1;
            const fighterCount = projWeapon.fighterCount || 4;
            const fighters = [];
            // Spawn fighters off-screen
            for (let i = 0; i < fighterCount; i++) {
                fighters.push({
                    x: direction === 1 ? -100 - i * 60 : VIRTUAL_WIDTH + 100 + i * 60,
                    y: VIRTUAL_HEIGHT * 0.12 + (Math.random() - 0.5) * 50,
                    shotsFired: 0
                });
            }
            state.strafingRuns.push({
                targetX: proj.x,
                phase: 'warning',
                timer: 0,
                direction: direction,
                fighters: fighters,
                firedByPlayer: firingPlayer,
                weaponKey: proj.weaponKey,
                color: proj.color,
                coverageWidth: projWeapon.coverageWidth || 400,
                pendingTurnEnd: true  // Turn ends when strafing run completes
            });
            // Restore previous weapon (orbital weapons are one-time use)
            const player = state.players[firingPlayer];
            if (state.storedWeapons[firingPlayer]) {
                player.weapon = state.storedWeapons[firingPlayer];
                state.storedWeapons[firingPlayer] = null;
            } else {
                player.weapon = 'MORTAR';  // Fallback
            }
            // Visual feedback - marker lands
            particles.sparks(proj.x, proj.y, 20, '#ffff00');
            renderer.addScreenShake(8);
            audio.playBounce();
            state.projectile = null;
            // Stay in firing phase - turn ends when strafing run completes
            state.phase = 'firing';
            state.firingStartTime = performance.now();  // For safety timeout
            return;
        }

        onExplode(proj);
        state.projectile = null;
        return;
    } else {
        // DRILL behavior - explode when exiting terrain into open air
        const projWeapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
        if (projWeapon && projWeapon.behavior === 'drill' && proj.inTerrain) {
            // Just exited terrain - explode
            onExplode(proj);
            state.projectile = null;
            return;
        }
    }

    // 2. Hits void
    if (proj.y > state.voidY) {
        onExplode(proj);
        state.projectile = null;
        return;
    }

    // 3. Goes out of bounds (use virtual dimensions)
    if (proj.y > VIRTUAL_HEIGHT + 100) {
        onExplode(proj);
        state.projectile = null;
        return;
    }
}

/**
 * Check if projectile hits any UFO and grant buffs to current player
 */
function checkUFOCollision(px, py, radius) {
    const ambient = getAmbient();
    if (!ambient) return;

    const result = ambient.checkProjectileHitUFO(px, py, radius, state.currentPlayer);
    if (result) {
        // Award coins for UFO destruction
        state.players[state.currentPlayer].coins += UFO_DESTROY_BONUS;

        // Grant buff to current player
        const buffType = result.buffType;
        const playerBuffs = state.ufoBuffs[state.currentPlayer];

        if (buffType === 'DAMAGE') {
            playerBuffs.damage += 1;  // Stack count
        } else if (buffType === 'BLAST') {
            playerBuffs.blast += 1;
        } else if (buffType === 'BOUNCES') {
            playerBuffs.bounces += 1;
        }

        // Visual feedback
        particles.explosion(result.x, result.y, 60, result.color, 50);
        renderer.addScreenShake(15);
        renderer.flash(result.color, 0.3);
        audio.playExplosion(0.8);

        // Show buff notification (now includes coin bonus)
        state.buffNotification = {
            playerIndex: state.currentPlayer,
            buffType: buffType,
            timer: 2.0,
            x: result.x,
            y: result.y,
            coins: UFO_DESTROY_BONUS
        };
    }
}

function onBounce(proj) {
    proj.bounces++;

    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // BOUNCER behavior - Mortar-level explosion on EVERY bounce
    if (weapon && weapon.behavior === 'bouncer') {
        // Trigger a Mortar-level explosion at bounce point
        const mortarDamage = WEAPONS.MORTAR.damage;
        const mortarRadius = WEAPONS.MORTAR.blastRadius;

        // Visual explosion (Mortar-level)
        particles.explosion(proj.x, proj.y, 80, proj.color, mortarRadius);
        particles.sparks(proj.x, proj.y, 40, COLORS.yellow);
        renderer.addScreenShake(15);
        renderer.flash(proj.color, 0.2);
        audio.playExplosion(0.7);

        // Terrain damage (same as Mortar)
        terrain.destroy(proj.x, proj.y, mortarRadius);

        // Apply damage to players
        const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        for (const player of state.players) {
            if (player.health <= 0) continue;
            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < mortarRadius) {
                const falloff = 1 - (dist / mortarRadius);
                const dmg = mortarDamage * falloff;
                player.health = Math.max(0, player.health - dmg);
                particles.sparks(player.x, player.y, 20, COLORS.white);
            }
        }

        // Check if out of bounces - final explosion with 2x blast radius
        if (proj.bounces >= proj.maxBounces) {
            proj.isFinalBounce = true;  // Mark for enhanced final explosion
            onExplode(proj);
            state.projectile = null;
            return;
        }

        // Continue bouncing
        audio.playBounce();
        return;
    }

    // SPLITTER behavior - split into multiple projectiles on first bounce (legacy - now airburst)
    if (weapon && weapon.behavior === 'splitter' && proj.bounces === 1 && !proj.isSplit) {
        spawnSplitProjectiles(proj, weapon.splitCount || 3);
        state.projectile = null;
        return;
    }

    // Enhanced bounce feedback - more sparks, small flash
    particles.sparks(proj.x, proj.y, 25, COLORS.yellow);
    renderer.addScreenShake(8);
    renderer.flash(COLORS.yellow, 0.08);  // Subtle flash
    audio.playBounce();

    // Destroy if out of bounces
    if (proj.bounces >= proj.maxBounces) {
        onExplode(proj);
        state.projectile = null;
    }
}

function onExplode(proj) {
    // === CLAMP EXPLOSION POSITION TO VALID BOUNDS ===
    // Use WORLD boundaries to match the bounce walls
    proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
    proj.y = Math.max(WORLD_TOP, Math.min(VIRTUAL_HEIGHT, proj.y));

    // === CHECK IF EXPLOSION CLAIMS A DESPERATION BEACON ===
    const beaconClaimPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
    const beaconWeapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : TANK_TYPES[proj.tankType];
    const beaconBlastRadius = beaconWeapon ? (beaconWeapon.blastRadius || 50) : 50;
    checkExplosionClaimsBeacon(proj.x, proj.y, beaconBlastRadius, beaconClaimPlayer);

    // === STRAFING BULLET EXPLOSION - Handle before weapon lookup ===
    // BUFFED: 3x blast radius, 2x damage, bigger visuals
    if (proj.isStrafeBullet) {
        const damage = proj.damage || 20;        // 2x damage (was 10)
        const blastRadius = proj.blastRadius || 75;  // 3x radius (was 25)
        const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;

        // Destroy terrain - bigger craters
        terrain.destroy(proj.x, proj.y, blastRadius * 0.6);

        // Apply damage to nearby players
        for (let i = 0; i < state.players.length; i++) {
            const player = state.players[i];
            if (player.health <= 0) continue;
            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < blastRadius) {
                const falloff = 1 - (dist / blastRadius);
                const dmg = damage * falloff;
                // Apply FORTRESS damage reduction
                const reduction = getArchetypeDamageReduction(player);
                const finalDmg = dmg * (1 - reduction);
                player.health = Math.max(0, player.health - finalDmg);
                particles.sparks(player.x, player.y, 20, '#ffaa00');
                particles.explosion(player.x, player.y, 15, '#ff6600', 30);  // Hit feedback
                if (player.health <= 0) {
                    triggerDeathExplosion(player, false);
                }
            }
        }

        // Visual effects - MUCH BIGGER explosions
        particles.explosion(proj.x, proj.y, 40, '#ffaa00', blastRadius * 0.7);  // Main blast
        particles.explosion(proj.x, proj.y, 25, '#ff6600', blastRadius * 0.5);  // Inner fire
        particles.sparks(proj.x, proj.y, 20, '#ffff00');  // More sparks
        renderer.addScreenShake(12);  // More shake
        audio.playExplosion(0.5);  // Louder

        // Remove from projectiles array
        const idx = state.projectiles.indexOf(proj);
        if (idx > -1) state.projectiles.splice(idx, 1);

        return;  // Done - don't fall through to normal weapon handling
    }

    // Handle fragments (sub-projectiles without weaponKey) - simple explosion
    if (proj.isFragment && !proj.weaponKey) {
        const damage = proj.fragmentDamage || 20;
        const blastRadius = proj.fragmentBlastRadius || 35;
        const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;

        // Destroy terrain
        terrain.destroy(proj.x, proj.y, blastRadius);

        // Apply damage to players
        for (let i = 0; i < state.players.length; i++) {
            const player = state.players[i];
            if (player.health <= 0) continue;
            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < blastRadius) {
                const falloff = 1 - (dist / blastRadius);
                let dmg = damage * falloff * (proj.buffedDamageMultiplier || 1);
                // Apply FORTRESS damage reduction
                const reduction = getArchetypeDamageReduction(player);
                dmg *= (1 - reduction);
                player.health = Math.max(0, player.health - dmg);
                particles.sparks(player.x, player.y, 15, proj.color || '#ffaa00');
                if (player.health <= 0) {
                    triggerDeathExplosion(player, false);
                    if (i !== firingPlayerIdx) {
                        state.players[firingPlayerIdx].coins += KILL_BONUS;
                    }
                }
            }
        }

        // Visual effects
        particles.explosion(proj.x, proj.y, 30, proj.color || '#ffaa00', blastRadius);
        renderer.addScreenShake(8);
        audio.playExplosion(0.4);

        // Fire rain leaves napalm fields
        if (proj.isFireRain && proj.leavesNapalm) {
            state.fields.push({
                x: proj.x,
                y: terrain.getHeightAt(proj.x),
                radius: blastRadius * 0.8,
                duration: proj.napalmDuration || 4,
                timer: proj.napalmDuration || 4,
                damagePerSec: proj.napalmDamage || 8,
                color: '#ff4400',
                type: 'fire',
                firedByPlayer: firingPlayerIdx
            });
        }

        // Remove from projectiles array
        const idx = state.projectiles.indexOf(proj);
        if (idx > -1) state.projectiles.splice(idx, 1);

        return;
    }

    // Get weapon data - prefer weaponKey (new system), fallback to tankType (legacy)
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : TANK_TYPES[proj.tankType];
    if (!weapon) return;

    // Check if this is CLUSTER and should spawn cluster bombs (only for main projectile)
    if (weapon.behavior === 'cluster' && !proj.isCluster) {
        spawnClusterBombs(proj);
        // Don't end turn yet - wait for cluster bombs
        return;
    }

    // MIRV behavior - split into 3, then each splits into 3 more
    if (weapon.behavior === 'mirv') {
        // Main projectile spawns first stage
        if (!proj.isCluster && !proj.isMIRVStage1 && !proj.isMIRVStage2) {
            spawnMIRVProjectiles(proj);
            return;
        }
        // Stage 1 projectiles spawn stage 2
        if (proj.isMIRVStage1) {
            spawnMIRVStage2(proj);
            // Check if any projectiles left
            if (state.projectiles.length === 0) {
                tryEndTurn();  // Check for other pending effects
            }
            return;
        }
        // Stage 2 projectiles explode normally (fall through)
    }

    // Apply UFO buffs and archetype bonuses to damage and blast radius
    const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
    const firingPlayerForDamage = state.players[firingPlayerIdx];
    const buffDamageMultiplier = proj.buffedDamageMultiplier || 1;
    const archetypeDamageMultiplier = getArchetypeDamageMultiplier(firingPlayerForDamage);
    const blastBonus = proj.buffedBlastBonus || 0;
    const effectiveBlastRadius = weapon.blastRadius + blastBonus;
    // Add accumulated damage bonus for bouncing betty (20 base + bounces * 20)
    const bounceDamageBonus = proj.accumulatedDamageBonus || 0;
    const effectiveDamage = (weapon.damage + bounceDamageBonus) * buffDamageMultiplier * archetypeDamageMultiplier;

    // Sync space battle to big explosions (blastRadius > 60)
    if (effectiveBlastRadius > 60) {
        const ambient = getAmbient();
        if (ambient && ambient.triggerExplosionSync) {
            const intensity = Math.min(1, effectiveBlastRadius / 150);  // Scale 60-150 to 0.4-1.0
            ambient.triggerExplosionSync(proj.x, intensity);
        }
    }

    // ENHANCED Visual effects - scale with blast radius
    // RAILGUN gets special high-impact visuals
    const isRailgun = proj.weaponKey === 'RAILGUN' || proj.tankType === 'PHANTOM';

    // BOUNCER final explosion - 2x blast radius with spectacular effects
    let finalBlastRadius = effectiveBlastRadius;
    if (weapon.behavior === 'bouncer' && proj.isFinalBounce) {
        finalBlastRadius = effectiveBlastRadius * (weapon.finalBlastMultiplier || 2.0);
        // Spectacular final explosion
        particles.explosion(proj.x, proj.y, 150, COLORS.white, finalBlastRadius * 0.5);
        particles.explosion(proj.x, proj.y, 120, proj.color, finalBlastRadius);
        particles.sparks(proj.x, proj.y, 80, COLORS.yellow);
        particles.sparks(proj.x, proj.y, 60, COLORS.orange);
        renderer.addScreenShake(35);
        renderer.flash(COLORS.white, 0.4);
        renderer.flash(proj.color, 0.3);
        audio.playExplosion(1.0);
    } else if (isRailgun) {
        // Railgun: Focused, intense impact - bright white core with colored burst
        particles.explosion(proj.x, proj.y, 80, COLORS.white, effectiveBlastRadius * 0.6);
        particles.explosion(proj.x, proj.y, 50, proj.color, effectiveBlastRadius);
        particles.sparks(proj.x, proj.y, 60, COLORS.cyan);
        renderer.addScreenShake(20);  // Punchy shake
        renderer.flash(COLORS.white, 0.35);  // Bright flash
        renderer.flash(proj.color, 0.2);  // Colored afterflash
    } else if (weapon.terrainEffect) {
        // Terrain weapons: Unique visual effects
        if (weapon.terrainEffect === 'dig' || weapon.terrainEffect === 'digJagged') {
            // DIGGER: Brown/orange digging effect
            particles.explosion(proj.x, proj.y, 80, '#aa6633', effectiveBlastRadius);
            particles.sparks(proj.x, proj.y, 50, '#886622');
            renderer.addScreenShake(20);
            renderer.flash('#553311', 0.25);
        } else {
            // DIRT_BALL: Earthy mound effect
            particles.explosion(proj.x, proj.y, 70, '#996644', effectiveBlastRadius * 0.7);
            particles.sparks(proj.x, proj.y, 40, '#664422');
            renderer.addScreenShake(18);
            renderer.flash('#442211', 0.2);
        }
    } else if (proj.isSplitterFragment) {
        // SPLITTER fragments: Reduced effects to prevent screen overload with 32+ explosions
        const splitLevel = proj.splitLevel || 1;
        const effectScale = Math.max(0.25, 1 - (splitLevel - 1) * 0.2);
        const particleCount = Math.floor(effectiveBlastRadius * 0.8 * effectScale);
        particles.explosion(proj.x, proj.y, particleCount, proj.color, effectiveBlastRadius * 0.7);
        renderer.addScreenShake(Math.max(2, effectiveBlastRadius / 5 * effectScale));
        // Only flash for early split levels to prevent whiteout
        if (splitLevel <= 2) {
            renderer.flash(proj.color, 0.08 * effectScale);
        }
    } else {
        // Normal explosion for other weapons
        const particleCount = Math.floor(effectiveBlastRadius * 1.5);
        particles.explosion(proj.x, proj.y, particleCount, proj.color, effectiveBlastRadius);
        renderer.addScreenShake(effectiveBlastRadius / 2.5);
        renderer.flash(proj.color, 0.25);
    }

    // Handle terrain modification based on weapon type
    if (weapon.terrainEffect === 'buildJagged') {
        // DIRT_BALL: Create massive jagged peak
        terrain.raiseJagged(proj.x, proj.y, effectiveBlastRadius, state.voidY);
        // Check if any tanks should be lifted to top of peak
        for (const player of state.players) {
            const dist = Math.abs(player.x - proj.x);
            if (dist < effectiveBlastRadius * 0.5) {
                // Lift tank to top of new terrain
                player.y = terrain.getHeightAt(player.x) - TANK_RADIUS;
            }
        }
    } else if (weapon.terrainEffect === 'digJagged') {
        // DIGGER: Create massive jagged crater (can reach void)
        terrain.digJagged(proj.x, proj.y, effectiveBlastRadius, state.voidY);
    } else if (weapon.terrainEffect === 'build') {
        // Legacy rounded mound
        terrain.raise(proj.x, proj.y, effectiveBlastRadius);
    } else {
        // Normal weapons: Destroy terrain
        // Use finalBlastRadius for BOUNCER final explosion
        terrain.destroy(proj.x, proj.y, weapon.behavior === 'bouncer' ? finalBlastRadius : effectiveBlastRadius);
    }

    // === BLAST KNOCKBACK ===
    // Scale knockback force with blast radius (bigger explosions = more push)
    const knockbackForce = effectiveBlastRadius * 0.08;  // Tune this for feel
    applyBlastKnockback(proj.x, proj.y, effectiveBlastRadius * 1.2, knockbackForce, firingPlayerIdx);

    // Track if anyone was hit for juice effects
    let hitOccurred = false;
    let killingBlow = false;
    let hitPlayer = null;

    // Track damage dealt for coin rewards
    const firingPlayerIndex = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
    const firingPlayer = state.players[firingPlayerIndex];
    let totalEnemyDamage = 0;

    // Apply damage to all players (including self-damage)
    // Railgun has special damage mechanics (isRailgun defined above)
    const directHitRadius = weapon.directHitRadius || 0;
    const directHitBonus = weapon.directHitBonus || 1;
    const minDamageFalloff = weapon.minDamageFalloff || 0;

    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        const dist = distance(proj.x, proj.y, player.x, player.y);
        if (dist < effectiveBlastRadius) {
            // Calculate base damage with falloff
            let falloffMultiplier = 1 - dist / effectiveBlastRadius;

            // Railgun: minimum damage falloff (stays powerful even at edge)
            if (minDamageFalloff > 0) {
                falloffMultiplier = Math.max(minDamageFalloff, falloffMultiplier);
            }

            let damage = effectiveDamage * falloffMultiplier;

            // Railgun: Direct hit bonus for close-range precision
            let isDirectHit = false;
            if (isRailgun && dist < directHitRadius) {
                damage *= directHitBonus;
                isDirectHit = true;
            }

            if (damage > 0) {
                hitOccurred = true;
                hitPlayer = player;
                state.lastHitPos = { x: proj.x, y: proj.y };

                // Apply FORTRESS damage reduction (-33% damage taken)
                const damageReduction = getArchetypeDamageReduction(player);
                if (damageReduction > 0) {
                    damage *= (1 - damageReduction);
                    // Visual feedback for armor
                    particles.sparks(player.x, player.y, 15, '#888888');
                }

                // Apply shield damage reduction if player has a shield
                if (player.shield > 0) {
                    const reducedDamage = damage * (1 - player.shield);
                    // Visual feedback for shield absorption
                    particles.sparks(player.x, player.y, 25, COLORS.cyan);
                    renderer.flash(COLORS.cyan, 0.15);
                    damage = reducedDamage;
                    // Shield is consumed after blocking
                    player.shield = 0;
                }

                // Track enemy damage for coins (not self-damage)
                if (i !== firingPlayerIndex) {
                    totalEnemyDamage += damage;
                }

                // Check if this will be a killing blow (after shield reduction)
                if (player.health > 0 && player.health - damage <= 0) {
                    killingBlow = true;
                    // Award kill bonus (only for enemy kills, not suicide)
                    if (i !== firingPlayerIndex) {
                        firingPlayer.coins += KILL_BONUS;
                    }
                }

                // Railgun direct hit feedback
                if (isDirectHit) {
                    particles.sparks(player.x, player.y, 40, COLORS.white);
                    renderer.flash(COLORS.white, 0.4);
                    renderer.addScreenShake(25);
                }
            }
            player.health = Math.max(0, player.health - damage);
        }
    }

    // MINI NUKE behavior - tight multi-stage fireball explosion
    if (weapon.behavior === 'miniNuke') {
        const stageCount = weapon.explosionStages || 3;
        const stageDelay = (weapon.stageDelay || 0.15) * 1000;
        const screenShake = weapon.screenShake || 25;

        // Massive initial shake
        renderer.addScreenShake(screenShake);
        renderer.flash('#ff4400', 0.4);
        renderer.flash('#ffaa00', 0.3);

        // Multi-stage tight explosions
        for (let stage = 1; stage < stageCount; stage++) {
            setTimeout(() => {
                // Each stage creates concentric explosion rings
                const stageRadius = effectiveBlastRadius * (0.5 + stage * 0.2);
                particles.explosion(proj.x, proj.y, 50 + stage * 20, '#ff6600', stageRadius * 0.8);
                particles.explosion(proj.x, proj.y, 30 + stage * 15, '#ffaa00', stageRadius * 0.5);
                particles.sparks(proj.x, proj.y, 30 + stage * 10, '#ff4444');

                renderer.addScreenShake(screenShake * (1 - stage * 0.2));
                audio.playExplosion(0.8 - stage * 0.15);

                // Additional damage in stages (diminishing)
                const stageDamage = effectiveDamage * 0.15 * (1 - stage * 0.3);
                for (let i = 0; i < state.players.length; i++) {
                    const player = state.players[i];
                    if (player.health <= 0) continue;

                    const dist = distance(proj.x, proj.y, player.x, player.y);
                    if (dist < stageRadius) {
                        const falloff = 1 - (dist / stageRadius);
                        const dmg = stageDamage * falloff;
                        player.health = Math.max(0, player.health - dmg);
                        particles.sparks(player.x, player.y, 10, '#ff6600');

                        // Check for kill
                        if (player.health <= 0 && i !== firingPlayerIndex) {
                            state.players[firingPlayerIndex].coins += KILL_BONUS;
                            state.players[firingPlayerIndex].kills++;
                            triggerDeathExplosion(player, false);
                            audio.playKill();
                        }
                    }
                }
            }, stage * stageDelay);
        }
    }

    // QUAKE behavior - DEVASTATING earthquake with terrain fissures
    if (weapon.behavior === 'quake' || weapon.behavior === 'quakeSpread') {
        const shockwaveCount = weapon.shockwaveCount || 5;
        const shockwaveDelay = (weapon.shockwaveDelay || 0.12) * 1000;
        const falloffPerRing = weapon.shockwaveFalloff || 0.18;
        const trenchLength = weapon.trenchLength || 300;
        const trenchDepth = weapon.trenchDepth || 45;
        const groundedMult = weapon.groundedMultiplier || 1.6;

        // === MASSIVE INITIAL IMPACT ===
        // Heavy screen shake - this is an EARTHQUAKE
        renderer.addScreenShake(50);

        // Main impact explosion with earthy colors
        particles.explosion(proj.x, proj.y, 60, '#cc8844', effectiveBlastRadius * 1.2);
        particles.explosion(proj.x, proj.y + 15, 40, '#886644', effectiveBlastRadius);

        // Dust cloud rising from impact
        for (let i = 0; i < 30; i++) {
            const dustAngle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.8; // Upward spread
            const dustSpeed = 2 + Math.random() * 4;
            const dustX = proj.x + (Math.random() - 0.5) * 60;
            particles.spawn(dustX, proj.y + Math.random() * 20, {
                angle: dustAngle,
                speed: dustSpeed,
                life: 0.8 + Math.random() * 0.6,
                color: Math.random() < 0.5 ? '#aa8866' : '#887755',
                radius: 4 + Math.random() * 6,
                gravity: 0.15
            });
        }

        // === CARVE TERRAIN FISSURE ===
        const fissurePoints = terrain.carveFissure(proj.x, proj.y, trenchLength, trenchDepth);

        // Create visual crack effects along fissure
        if (fissurePoints && fissurePoints.length > 0) {
            // Dust bursts along the fissure
            for (let i = 0; i < fissurePoints.length; i++) {
                const fp = fissurePoints[i];
                const delay = i * 20; // Staggered for crack-spreading effect

                setTimeout(() => {
                    // Small dust burst at each fissure point
                    particles.sparks(fp.x, fp.y, 8, '#aa8866');

                    // Rock debris particles
                    for (let j = 0; j < 4; j++) {
                        const debrisAngle = -Math.PI/2 + (Math.random() - 0.5) * 1.2; // Mostly upward
                        const debrisSpeed = 3 + Math.random() * 3;
                        particles.spawn(fp.x + (Math.random() - 0.5) * 10, fp.y, {
                            angle: debrisAngle,
                            speed: debrisSpeed,
                            life: 0.4 + Math.random() * 0.3,
                            color: '#665544',
                            radius: 2 + Math.random() * 3,
                            gravity: 0.25
                        });
                    }

                    // Mini screen shake for crack propagation
                    renderer.addScreenShake(3);
                }, delay);
            }
        }

        // === SPREADING SHOCKWAVE RINGS ===
        for (let ring = 1; ring <= shockwaveCount; ring++) {
            const ringRadius = effectiveBlastRadius + ring * 100; // Wider spread
            const ringDamage = effectiveDamage * Math.max(0.15, 1 - ring * falloffPerRing);
            const delay = ring * shockwaveDelay;

            setTimeout(() => {
                // Visual shockwave - dust erupting in a ring
                const ringParticleCount = 12 + (shockwaveCount - ring) * 3;
                for (let p = 0; p < ringParticleCount; p++) {
                    const ringAngle = (p / ringParticleCount) * Math.PI * 2;
                    const px = proj.x + Math.cos(ringAngle) * ringRadius * 0.7;
                    const py = terrain.getHeightAt(px);

                    // Particle moves outward and upward
                    const particleAngle = -Math.PI/2 + (Math.random() - 0.5) * 0.8;
                    particles.spawn(px, py, {
                        angle: particleAngle,
                        speed: 2 + Math.random() * 2,
                        life: 0.5 + Math.random() * 0.3,
                        color: '#998877',
                        radius: 3 + Math.random() * 3,
                        gravity: 0.2
                    });
                }

                // Rumbling screen shake
                renderer.addScreenShake(Math.max(5, 20 - ring * 3));

                // Damage grounded tanks in this ring - HEAVILY punished
                for (let i = 0; i < state.players.length; i++) {
                    const player = state.players[i];
                    if (player.health <= 0) continue;

                    const terrainY = terrain.getHeightAt(player.x);
                    const isGrounded = Math.abs(player.y - terrainY + TANK_RADIUS) < 20; // Slightly more generous check

                    const dist = distance(proj.x, proj.y, player.x, player.y);
                    const innerRadius = effectiveBlastRadius + (ring - 1) * 100;
                    const outerRadius = ringRadius;

                    if (dist >= innerRadius && dist < outerRadius) {
                        const falloff = 1 - ((dist - innerRadius) / (outerRadius - innerRadius)) * 0.4;
                        let dmg = ringDamage * falloff;

                        // GROUNDED TANKS TAKE EXTRA DAMAGE
                        if (isGrounded) {
                            dmg *= groundedMult;
                            // Extra visual feedback for grounded hit
                            particles.sparks(player.x, player.y, 20, '#ffaa44');
                            particles.explosion(player.x, player.y + 10, 15, '#cc8844', 30);
                        } else {
                            // Airborne takes reduced damage
                            dmg *= 0.5;
                            particles.sparks(player.x, player.y, 8, '#cc9966');
                        }

                        player.health = Math.max(0, player.health - dmg);

                        // Track damage for coins
                        if (i !== firingPlayerIndex) {
                            totalEnemyDamage += dmg;
                        }
                        hitOccurred = true;
                    }
                }
            }, delay);
        }

        // === FINAL AFTERSHOCK ===
        setTimeout(() => {
            renderer.addScreenShake(15);
            particles.explosion(proj.x, proj.y, 25, '#775533', effectiveBlastRadius * 0.6);
        }, shockwaveCount * shockwaveDelay + 200);
    }

    // TELEPORTER behavior - warp firing player to impact point
    if (weapon.behavior === 'teleporter') {
        const owner = state.players[firingPlayerIndex];
        if (owner && owner.health > 0) {
            // Clamp teleport destination to valid bounds
            const clampedX = Math.max(TANK_RADIUS, Math.min(VIRTUAL_WIDTH - TANK_RADIUS, proj.x));

            // Find safe landing position on terrain
            const landingY = terrain.getHeightAt(clampedX) - TANK_RADIUS;

            // Visual effect at old position
            particles.explosion(owner.x, owner.y, 40, weapon.color, 30);

            // Teleport (to clamped position)
            owner.x = clampedX;
            owner.y = landingY;

            // Visual effect at new position
            particles.explosion(owner.x, owner.y, 50, weapon.color, 40);
            particles.sparks(owner.x, owner.y, 30, COLORS.white);
            renderer.flash(weapon.color, 0.3);
            renderer.addScreenShake(15);
        }
    }

    // NAPALM behavior - spawn persistent fire field
    if (weapon.behavior === 'napalm') {
        state.fields.push({
            x: proj.x,
            y: terrain.getHeightAt(proj.x),  // Sit on terrain surface
            radius: effectiveBlastRadius * 1.2,
            duration: weapon.fieldDuration || 8,
            timer: weapon.fieldDuration || 8,
            damagePerSec: weapon.fieldDamage || 10,
            color: weapon.color,
            type: 'fire',
            firedByPlayer: firingPlayerIndex
        });

        // Extra fire particles on spawn
        particles.explosion(proj.x, proj.y, 80, '#ff6600', effectiveBlastRadius);
        particles.explosion(proj.x, proj.y, 40, '#ffaa00', effectiveBlastRadius * 0.6);
    }

    // CHAIN LIGHTNING OVERLOAD behavior - huge first hit, one jump at 50% damage
    if (weapon.behavior === 'chainLightning' || weapon.behavior === 'chainLightningOverload') {
        const chainRange = weapon.chainRange || 250;
        const chainDamage = weapon.chainDamage || 70;  // 50% of first hit
        const maxChains = weapon.maxChains || 1;

        // Find nearest enemy for chain (different from primary target if possible)
        let chainTargets = [];
        let alreadyHit = new Set();

        // Mark primary target area as already considered
        for (const player of state.players) {
            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < effectiveBlastRadius) {
                alreadyHit.add(player);
            }
        }

        // Find chain targets
        let currentX = proj.x;
        let currentY = proj.y;

        for (let chain = 0; chain < maxChains; chain++) {
            let bestTarget = null;
            let bestDist = chainRange;

            for (const player of state.players) {
                if (player.health <= 0) continue;
                if (alreadyHit.has(player)) continue;

                const dist = distance(currentX, currentY, player.x, player.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestTarget = player;
                }
            }

            if (bestTarget) {
                chainTargets.push({
                    target: bestTarget,
                    fromX: currentX,
                    fromY: currentY
                });
                alreadyHit.add(bestTarget);
                currentX = bestTarget.x;
                currentY = bestTarget.y;
            }
        }

        // Apply chain damage and visual effects
        for (let i = 0; i < chainTargets.length; i++) {
            const { target, fromX, fromY } = chainTargets[i];
            const dmg = chainDamage;  // 50% of first hit (already configured in weapon)

            target.health = Math.max(0, target.health - dmg);

            // Track for coins
            const targetIndex = state.players.indexOf(target);
            if (targetIndex !== firingPlayerIndex) {
                totalEnemyDamage += dmg;
            }

            // Store lightning arc for rendering (chain effect)
            state.lightningArc = {
                x1: fromX,
                y1: fromY,
                x2: target.x,
                y2: target.y,
                timer: 0.6,
                color: weapon.color
            };

            // Visual feedback - electric burst
            particles.sparks(target.x, target.y, 40, weapon.color);
            particles.sparks(target.x, target.y, 25, COLORS.white);
            renderer.flash(weapon.color, 0.3);
            renderer.addScreenShake(12);

            // Check for killing blow
            if (target.health <= 0) {
                killingBlow = true;
                hitPlayer = target;
                if (targetIndex !== firingPlayerIndex) {
                    firingPlayer.coins += KILL_BONUS;
                }
            }
        }

        // Extra overload visual at impact
        particles.explosion(proj.x, proj.y, 60, weapon.color, 40);
        particles.sparks(proj.x, proj.y, 50, COLORS.white);
    }

    // DYING LIGHT behavior - ULTIMATE DEVASTATION
    if (weapon.behavior === 'dyingStar') {
        // 1. TERRAIN DEVASTATION - Extra large terrain destruction
        const devastationRadius = effectiveBlastRadius * (weapon.terrainDevastation || 2.5);
        terrain.destroy(proj.x, proj.y, devastationRadius);

        // 2. VOID PULSE - Raise the void
        if (weapon.voidRise) {
            state.voidY -= weapon.voidRise;
            // Ominous void visual
            for (let i = 0; i < 30; i++) {
                const px = Math.random() * VIRTUAL_WIDTH;
                particles.sparks(px, state.voidY, 8, '#aa00ff');
            }
            renderer.flash('#8800ff', 0.3);
        }

        // 3. SCREEN-WIDE SHOCKWAVE - Damages everyone on screen
        if (weapon.shockwaveRadius && weapon.shockwaveDamage) {
            for (let i = 0; i < state.players.length; i++) {
                const player = state.players[i];
                if (player.health <= 0) continue;
                if (i === firingPlayerIndex) continue;  // Don't hit self with shockwave

                const dist = distance(proj.x, proj.y, player.x, player.y);
                if (dist < weapon.shockwaveRadius) {
                    const falloff = 1 - (dist / weapon.shockwaveRadius);
                    const shockDmg = weapon.shockwaveDamage * falloff;
                    // Apply damage reduction
                    const reduction = getArchetypeDamageReduction(player);
                    const finalShockDmg = shockDmg * (1 - reduction);
                    player.health = Math.max(0, player.health - finalShockDmg);
                    totalEnemyDamage += finalShockDmg;

                    // Shockwave hit visual
                    particles.sparks(player.x, player.y, 25, '#ffffff');
                    renderer.addScreenShake(8);

                    if (player.health <= 0 && !killingBlow) {
                        killingBlow = true;
                        hitPlayer = player;
                        if (i !== firingPlayerIndex) {
                            firingPlayer.coins += KILL_BONUS;
                        }
                    }
                }
            }

            // Shockwave visual - expanding ring
            particles.explosion(proj.x, proj.y, 200, '#ffffff', weapon.shockwaveRadius * 0.3);
            particles.explosion(proj.x, proj.y, 150, '#ffcc00', weapon.shockwaveRadius * 0.5);
        }

        // 4. MULTI-EXPLOSION - Chain of delayed explosions
        if (weapon.chainExplosions) {
            const chainCount = weapon.chainExplosions;
            const chainDelay = 150;  // ms between explosions
            const chainRadius = effectiveBlastRadius * 0.6;
            const chainDamage = effectiveDamage * 0.4;

            for (let chain = 1; chain <= chainCount; chain++) {
                setTimeout(() => {
                    // Random offset from original impact
                    const offsetX = (Math.random() - 0.5) * effectiveBlastRadius * 1.5;
                    const offsetY = (Math.random() - 0.5) * effectiveBlastRadius * 0.8;
                    const chainX = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x + offsetX));
                    const chainY = Math.max(WORLD_TOP, Math.min(state.voidY, proj.y + offsetY));

                    // Chain explosion visuals
                    particles.explosion(chainX, chainY, 80, '#ffaa00', chainRadius);
                    particles.explosion(chainX, chainY, 50, '#ffffff', chainRadius * 0.5);
                    particles.sparks(chainX, chainY, 40, '#ffcc00');
                    renderer.addScreenShake(20);
                    renderer.flash('#ffaa00', 0.2);
                    audio.playExplosion(0.7);

                    // Chain terrain destruction
                    terrain.destroy(chainX, chainY, chainRadius);

                    // Chain damage to players
                    for (let i = 0; i < state.players.length; i++) {
                        const player = state.players[i];
                        if (player.health <= 0) continue;

                        const dist = distance(chainX, chainY, player.x, player.y);
                        if (dist < chainRadius) {
                            const falloff = 1 - (dist / chainRadius);
                            let dmg = chainDamage * falloff;
                            // Apply damage reduction
                            const reduction = getArchetypeDamageReduction(player);
                            dmg *= (1 - reduction);
                            player.health = Math.max(0, player.health - dmg);
                            particles.sparks(player.x, player.y, 20, '#ff6600');

                            if (player.health <= 0) {
                                triggerDeathExplosion(player, false);
                                if (i !== firingPlayerIndex) {
                                    firingPlayer.coins += KILL_BONUS;
                                }
                            }
                        }
                    }
                }, chain * chainDelay);
            }
        }

        // 5. SPECTACULAR VISUALS - Golden apocalypse
        particles.explosion(proj.x, proj.y, 250, '#ffffff', effectiveBlastRadius);
        particles.explosion(proj.x, proj.y, 200, '#ffcc00', effectiveBlastRadius * 1.5);
        particles.explosion(proj.x, proj.y, 150, '#ff8800', effectiveBlastRadius * 2);
        particles.sparks(proj.x, proj.y, 100, '#ffff00');
        particles.sparks(proj.x, proj.y, 80, '#ffffff');
        renderer.addScreenShake(50);  // Massive shake
        renderer.flash('#ffffff', 0.5);
        renderer.flash('#ffcc00', 0.4);
        audio.playExplosion(1.5);  // Extra loud
    }

    // ========== NEW WEAPON EXPLOSION BEHAVIORS ==========

    // SCATTER SHELL - now fires on launch (shotgun style), no impact behavior needed

    // FISSURE - carve terrain crack
    if (weapon.behavior === 'fissure') {
        const length = weapon.fissureLength || 400;
        const depth = weapon.fissureDepth || 60;
        terrain.carveFissure(proj.x, proj.y, length, depth);
        particles.explosion(proj.x, proj.y, 60, '#996633', 80);
        renderer.addScreenShake(25);
    }

    // BLACK HOLE GRENADE - spawn black hole with powerful tank pull
    if (weapon.behavior === 'blackHole') {
        state.blackHoles.push({
            x: proj.x,
            y: proj.y,
            pullRadius: weapon.pullRadius || 250,
            pullStrength: weapon.pullStrength || 0.3,
            timer: 0,
            duration: weapon.pullDuration || 1.5,
            pullsTanks: weapon.pullsTanks || true,
            tankPullMultiplier: weapon.tankPullMultiplier || 1,
            ownerId: firingPlayerIndex,
            color: weapon.color
        });
        particles.explosion(proj.x, proj.y, 40, '#220044', 60);
        // Initial visual impact
        renderer.addScreenShake(15);
        audio.playExplosion(0.7);
    }

    // VOID CANNON BEAM - spawn delayed vertical beam
    if (weapon.behavior === 'voidCannonBeam') {
        state.voidCannonBeams.push({
            x: proj.x,
            y: terrain.getHeightAt(proj.x),
            delay: weapon.beamDelay || 1.5,
            timer: 0,
            ownerId: firingPlayerIndex,
            color: weapon.color
        });
        // Warning effect
        particles.sparks(proj.x, proj.y, 30, weapon.color);
    }

    // METEOR SHOWER - spawn random meteors (only from original projectile, not sub-meteors)
    if (weapon.behavior === 'meteorShower' && !proj.isCluster) {
        const count = weapon.meteorCount || 5;

        // Signal flare visual - indicates meteor shower incoming
        particles.explosion(proj.x, proj.y, 40, '#ffcc00', 60);
        particles.sparks(proj.x, proj.y, 50, '#ff6600');
        renderer.flash('#ffaa00', 0.2);
        renderer.addScreenShake(10);

        // Create a vertical "flare" trail upward
        for (let y = proj.y; y > WORLD_TOP; y -= 40) {
            setTimeout(() => {
                particles.trail(proj.x + (Math.random() - 0.5) * 20, y, '#ffcc00');
            }, (proj.y - y) * 2);
        }

        for (let i = 0; i < count; i++) {
            state.pendingMeteors.push({
                x: WORLD_LEFT + Math.random() * (WORLD_RIGHT - WORLD_LEFT),
                delay: 0.8 + i * 0.4,  // Slightly longer delay to let flare rise
                timer: 0,
                ownerId: firingPlayerIndex
            });
        }
    }

    // BOUNCING BETTY / BOUNCE DAMAGE modifiers - accumulated bonus already applied to effectiveDamage
    if ((weapon.behavior === 'bounceDamageUp' || weapon.behavior === 'bouncingBetty') && proj.accumulatedDamageBonus) {
        // Extra visual feedback for high-bounce explosions
        if (proj.accumulatedDamageBonus >= 100) {
            particles.explosion(proj.x, proj.y, 80, '#ff8888', effectiveBlastRadius);
            renderer.addScreenShake(20);
        }
    }

    // Award coins for damage dealt to enemies
    if (totalEnemyDamage > 0) {
        const coinsEarned = Math.floor(totalEnemyDamage * COINS_PER_DAMAGE);
        firingPlayer.coins += coinsEarned;
    }

    // Play explosion sound (scale intensity with blast radius)
    const explosionIntensity = effectiveBlastRadius / 50;  // Slightly louder
    audio.playExplosion(explosionIntensity);

    // ENHANCED Juice effects on hit (no freeze frames - they feel like lag)
    if (hitOccurred) {
        const now = performance.now();

        // Extra explosion particles at hit location
        particles.sparks(proj.x, proj.y, 30, COLORS.white);

        // Strong screen shake for hits
        renderer.addScreenShake(18 + weapon.damage / 4);

        // Bright flash on hit
        renderer.flash(COLORS.white, 0.3);

        // Camera punch zoom
        state.cameraZoom = CAMERA_ZOOM_AMOUNT * 1.3;

        // Death effects for killing blow - BRILLIANT TANK EXPLOSION
        if (killingBlow && hitPlayer) {
            // Brief slow-mo for kills only
            state.slowMoUntil = now + SLOW_MO_DURATION_MS;

            // Trigger the death explosion with terrain destruction
            triggerDeathExplosion(hitPlayer, false);
        }
    }

    // If this was a cluster bomblet, check if all bomblets are done
    if (proj.isCluster) {
        // Remove this bomblet from the array
        const idx = state.projectiles.indexOf(proj);
        if (idx > -1) state.projectiles.splice(idx, 1);

        // Strafing bullets don't control turn flow - they fire across turns
        if (proj.isStrafeBullet) {
            return;
        }

        // Only end turn when all bomblets are done
        if (state.projectiles.length === 0) {
            tryEndTurn();  // Check for other pending effects
        }
        return;
    }

    // Start resolving phase - use tryEndTurn to check for pending effects
    tryEndTurn();
}

function spawnClusterBombs(proj) {
    // Get weapon data (prefer new system, fallback to legacy)
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : TANK_TYPES.CHAOS;
    const count = weapon.clusterCount || 5;

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
            // Apply extra bounces from ELASTIC WORLD event + UFO buff (inherited from parent)
            maxBounces: (weapon.bounces || 1) + state.extraBounces + (proj.buffedBlastBonus ? Math.floor(proj.buffedBlastBonus / UFO_BUFF_TYPES.BLAST.bonus) : 0),
            trail: [],
            weaponKey: proj.weaponKey,  // Inherit weapon key
            tankType: 'CHAOS',  // Keep for backwards compatibility
            isCluster: true,
            // Inherit buffed stats from parent projectile
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer
        });
    }

    // ENHANCED Visual feedback for cluster split - satisfying pop!
    particles.sparks(proj.x, proj.y, 40, COLORS.yellow);
    particles.sparks(proj.x, proj.y, 25, proj.color);
    renderer.addScreenShake(12);
    renderer.flash(COLORS.yellow, 0.15);
    audio.playBounce();  // Satisfying pop sound
}

/**
 * Spawn split projectiles for SPLITTER weapon (on first bounce)
 */
function spawnSplitProjectiles(proj, count) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // Clear main projectile
    state.projectile = null;

    // Spawn split projectiles in a spread pattern
    for (let i = 0; i < count; i++) {
        const spreadAngle = ((i / (count - 1)) - 0.5) * Math.PI * 0.5;  // Spread 45 degrees
        const baseAngle = Math.atan2(proj.vy, proj.vx);
        const angle = baseAngle + spreadAngle;
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) * 0.85;

        state.projectiles.push({
            x: proj.x,
            y: proj.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: proj.radius * 0.8,
            color: proj.color,
            bounces: 1,  // Already bounced once
            maxBounces: proj.maxBounces + 1,  // Allow one more bounce after split
            trail: [],
            weaponKey: proj.weaponKey,
            isSplit: true,  // Mark as split so it doesn't split again
            isCluster: true,  // Use cluster system for multi-projectile handling
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer
        });
    }

    // Visual feedback for split
    particles.sparks(proj.x, proj.y, 35, proj.color);
    particles.sparks(proj.x, proj.y, 20, COLORS.white);
    renderer.addScreenShake(10);
    renderer.flash(proj.color, 0.12);
    audio.playBounce();
}

/**
 * Spawn airburst fragments for SPLITTER weapon (chain-split up to 4 levels)
 * @param {Object} proj - Parent projectile
 * @param {number} count - Number of fragments
 * @param {boolean} isFinalStage - Whether this is the final split level
 * @param {number} newSplitLevel - The split level of the new fragments
 */
function spawnAirburstFragments(proj, count, isFinalStage, newSplitLevel) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // Spawn fragments in a radial burst pattern
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 2;  // Some variation

        // Inherit some of parent's velocity
        const inheritFactor = 0.5;

        // Fragments get progressively smaller
        const sizeScale = Math.max(0.4, 1 - newSplitLevel * 0.15);

        state.projectiles.push({
            x: proj.x + Math.cos(angle) * 5,
            y: proj.y + Math.sin(angle) * 5,
            vx: proj.vx * inheritFactor + Math.cos(angle) * speed,
            vy: proj.vy * inheritFactor + Math.sin(angle) * speed,
            radius: proj.radius * sizeScale,
            color: proj.color,
            bounces: 0,
            maxBounces: 1,
            trail: [],
            weaponKey: proj.weaponKey,
            isSplit: true,
            splitLevel: newSplitLevel,  // Track split depth
            airburstTimer: 0,           // Reset timer for next split
            isCluster: true,  // Use cluster system
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer,
            isSplitterFragment: true    // Mark for reduced explosion effects
        });
    }

    // Visual feedback - scale down for later splits to prevent screen overload
    // Level 1: full effects, Level 2-4: progressively reduced
    const effectScale = Math.max(0.3, 1 - (newSplitLevel - 1) * 0.25);
    const sparkCount = Math.floor(20 * effectScale);
    particles.sparks(proj.x, proj.y, sparkCount, proj.color);
    particles.sparks(proj.x, proj.y, Math.floor(sparkCount * 0.5), COLORS.white);
    renderer.addScreenShake(Math.max(3, 10 * effectScale));
    if (newSplitLevel <= 2) {
        renderer.flash(proj.color, 0.12 * effectScale);  // Only flash for early splits
    }
    audio.playBounce();
}

/**
 * Spawn gravity mortar cluster bombs (fall down from apex)
 * @param {Object} proj - Parent projectile
 * @param {number} count - Number of bomblets
 * @param {boolean} gravityStyle - If true, bomblets fall down (gravity mortar style)
 */
function spawnApexClusterBombs(proj, count, gravityStyle = false) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // Visual feedback
    particles.sparks(proj.x, proj.y, 30, proj.color);
    renderer.addScreenShake(8);
    audio.playBounce();

    // Spawn bomblets
    for (let i = 0; i < count; i++) {
        const spreadX = (Math.random() - 0.5) * 60;
        state.projectiles.push({
            x: proj.x + spreadX,
            y: proj.y,
            vx: (Math.random() - 0.5) * 3,
            vy: gravityStyle ? 2 : Math.sin((i / count) * Math.PI) * -4,  // Fall down or spread
            radius: 5,
            color: proj.color,
            bounces: 0,
            maxBounces: 1,
            trail: [],
            weaponKey: proj.weaponKey,
            isCluster: true,
            firedByPlayer: proj.firedByPlayer,
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0
        });
    }
}

/**
 * Spawn proximity-triggered homing fragments (VOID_SPLITTER)
 * @param {Object} proj - Parent projectile
 * @param {Object} target - Target player to home toward
 * @param {number} count - Number of fragments
 * @param {number} homingStrength - Homing strength per frame
 */
function spawnProximityHomingFragments(proj, target, count, homingStrength) {
    // Visual split effect
    particles.explosion(proj.x, proj.y, 40, '#aa00ff', 60);
    particles.sparks(proj.x, proj.y, 25, '#ffffff');
    renderer.addScreenShake(10);
    audio.playBounce();

    // Calculate angle to target
    const angleToTarget = Math.atan2(target.y - proj.y, target.x - proj.x);

    for (let i = 0; i < count; i++) {
        const spreadAngle = angleToTarget + (i - (count - 1) / 2) * 0.3;
        const speed = 5 + Math.random() * 2;

        state.projectiles.push({
            x: proj.x,
            y: proj.y,
            vx: Math.cos(spreadAngle) * speed,
            vy: Math.sin(spreadAngle) * speed,
            radius: 6,
            color: '#aa00ff',
            bounces: 0,
            maxBounces: 3,
            trail: [],
            weaponKey: proj.weaponKey,
            isCluster: true,
            isHomingFragment: true,
            homingTarget: target,
            homingStrength: homingStrength,
            firedByPlayer: proj.firedByPlayer,
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0
        });
    }
}

/**
 * Spawn MIRV projectiles - first stage (3 projectiles that will each split into 3 more)
 * NOTE: MIRV has been removed from weapons roster
 */
function spawnMIRVProjectiles(proj) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    const count = weapon ? weapon.splitCount || 3 : 3;

    // Clear main projectile
    state.projectile = null;

    // Spawn first-stage MIRV projectiles
    for (let i = 0; i < count; i++) {
        const spreadAngle = ((i / (count - 1)) - 0.5) * Math.PI * 0.4;  // Spread 36 degrees
        const baseAngle = Math.atan2(proj.vy, proj.vx);
        const angle = baseAngle + spreadAngle;
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy) * 0.8;

        state.projectiles.push({
            x: proj.x,
            y: proj.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: proj.radius * 0.7,
            color: proj.color,
            bounces: 0,
            maxBounces: 1,
            trail: [],
            weaponKey: proj.weaponKey,
            isMIRVStage1: true,  // First stage - will split again
            isCluster: true,
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer
        });
    }

    // Visual feedback for MIRV deployment
    particles.sparks(proj.x, proj.y, 40, proj.color);
    particles.sparks(proj.x, proj.y, 30, COLORS.yellow);
    renderer.addScreenShake(12);
    renderer.flash(proj.color, 0.15);
    audio.playBounce();
}

/**
 * Spawn MIRV stage 2 projectiles (the final bomblets)
 */
function spawnMIRVStage2(proj) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    const count = weapon ? weapon.clusterCount || 3 : 3;

    // Remove this stage 1 projectile from array
    const idx = state.projectiles.indexOf(proj);
    if (idx > -1) state.projectiles.splice(idx, 1);

    // Spawn final bomblets
    for (let i = 0; i < count; i++) {
        const spreadAngle = ((i / (count - 1)) - 0.5) * Math.PI * 0.5;
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
            maxBounces: 1,
            trail: [],
            weaponKey: proj.weaponKey,
            isMIRVStage2: true,  // Final stage
            isCluster: true,
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer
        });
    }

    // Small pop effect
    particles.sparks(proj.x, proj.y, 20, proj.color);
    audio.playBounce();
}

// ============================================================================
// Turn System
// ============================================================================

/**
 * Check if there are any pending weapon effects that need to resolve
 * before the turn can end. This includes orbital weapons, nukes, etc.
 */
function hasPendingEffects() {
    // Check for active projectiles (including bomblets, strafe bullets, etc.)
    if (state.projectile) return true;
    if (state.projectiles && state.projectiles.length > 0) return true;

    // Check for pending orbital/delayed weapons
    if (state.nukes && state.nukes.length > 0) return true;
    if (state.voidCannonBeams && state.voidCannonBeams.length > 0) return true;
    if (state.strafingRuns && state.strafingRuns.length > 0) return true;
    if (state.pendingMeteors && state.pendingMeteors.length > 0) return true;
    if (state.blackHoles && state.blackHoles.length > 0) return true;

    // Check for railgun beam (has timer)
    if (state.railgunBeam) return true;

    // Check for active orbital beacons (targeting → firing sequence)
    if (state.orbitalBeacons && state.orbitalBeacons.length > 0) return true;

    // Check for active orbital strikes (beacon called but not yet fired)
    if (state.orbitalStrikes && state.orbitalStrikes.length > 0) return true;

    return false;
}

/**
 * Attempt to end the turn - only proceeds if no pending effects
 * Call this instead of endTurn() when a weapon effect completes
 */
function tryEndTurn() {
    // If there are still pending effects, don't end yet
    if (hasPendingEffects()) {
        return;
    }

    // All effects resolved, actually end the turn
    endTurn();
}

function endTurn() {
    // Prevent multiple calls in same resolution window (race condition guard)
    if (state.turnEndLocked) return;

    // Phase guard: Don't end turn during lottery, awaiting, or if already resolving/gameover
    if (state.phase === 'lottery' || state.phase === 'gameover' || state.phase === 'resolving' || state.phase === 'awaiting_next_turn') {
        return;
    }

    // NEW: Check for pending effects - if any exist, wait for them
    if (hasPendingEffects()) {
        // Mark that we're waiting for effects to resolve
        state.phase = 'firing';  // Stay in firing phase
        return;
    }

    state.turnEndLocked = true;

    state.phase = 'resolving';

    // Note: UFO buffs are cleared in fireProjectile() after being applied to the shot
    // This allows buffs gained mid-flight to persist until the player's next turn

    // Apply VOID SURGE - extra void rise after shot resolves
    if (state.voidSurgePending) {
        state.voidY -= VOID_RISE_PER_ROUND * 2;  // Double the normal rise
        renderer.flash('#aa00aa', 0.3);
        renderer.addScreenShake(12);
    }

    // Check win conditions before switching
    const winResult = checkWinCondition();
    if (winResult) {
        state.winner = winResult.winner;
        state.phase = 'gameover';
        // Revert event on game over
        if (state.activeEvent) {
            events.revertEvent(state);
            state.activeEvent = null;
        }
        return;
    }

    // Delay before switching turns (Claude/Gemini suggestion)
    setTimeout(() => {
        state.turnCount++;

        // Advance to next living player (cycle through all players)
        let attempts = 0;
        do {
            state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
            attempts++;
        } while (state.players[state.currentPlayer].health <= 0 && attempts < state.players.length);

        // Award survival bonus to all living players every turn
        state.players.forEach(p => {
            if (p.health > 0) {
                p.coins += SURVIVAL_BONUS;
            }
        });

        // Apply turn-start archetype abilities to current player (MERCHANT coins)
        const currentPlayer = state.players[state.currentPlayer];
        if (currentPlayer.health > 0) {
            applyTurnStartAbilities(currentPlayer);
        }

        // Apply radiation damage to current player (PLASMA_BOLT)
        applyRadiationDamage(state.currentPlayer);

        // Handle Dying Light expiration for current player
        if (state.dyingStarTurns[state.currentPlayer] > 0) {
            state.dyingStarTurns[state.currentPlayer]--;
            if (state.dyingStarTurns[state.currentPlayer] <= 0 &&
                currentPlayer.weapon === 'DYING_STAR') {
                // Restore previous weapon
                currentPlayer.weapon = state.storedWeapons[state.currentPlayer] || 'MORTAR';
                state.storedWeapons[state.currentPlayer] = null;
            }
        }

        // Full round = every NUM_PLAYERS turns (stable, regardless of deaths)
        // FIX: Use NUM_PLAYERS instead of playersAlive for stable round progression
        const isNewRound = state.turnCount > 0 && state.turnCount % NUM_PLAYERS === 0;

        if (isNewRound) {
            // Increment stable round counter
            state.round++;

            state.voidY -= VOID_RISE_PER_ROUND;

            // Visual feedback for void rising
            if (VOID_RISE_PER_ROUND > 0) {
                // Purple flash and rumble
                renderer.flash('#660088', 0.25);
                renderer.addScreenShake(8);
                // Particle effect along the void line
                for (let i = 0; i < 20; i++) {
                    const px = Math.random() * VIRTUAL_WIDTH;
                    particles.sparks(px, state.voidY, 5, '#aa00ff');
                }
                audio.playGlitch();
            }

            // Spawn desperation beacon on rounds 2-4 if none active
            if (state.round >= 2 && state.round <= 4 && state.desperationBeacons.length === 0) {
                spawnGuaranteedDesperationBeacon();
            }

            // Revert previous round's event
            if (state.activeEvent) {
                events.revertEvent(state);
                state.activeEvent = null;
            }

            // Roll new glitch event for this round
            rollNewGlitchEvent();

            // Roll new wind for this round
            const previousWind = state.baseWind;
            state.baseWind = rollNewWind();
            state.wind = state.baseWind;
            // Show announcement if wind changed
            if (previousWind !== state.baseWind) {
                state.windShiftPending = true;
                state.windShiftTimer = 1.5; // 1.5 second announcement
            }
        }

        // Wait for player to press space before starting next turn
        state.turnEndLocked = false;  // Unlock turn guard
        state.phase = 'awaiting_next_turn';
    }, TURN_DELAY_MS);
}

/**
 * Called when player presses space to start the next turn
 */
function confirmNextTurn() {
    if (state.phase !== 'awaiting_next_turn') return;
    audio.playConfirm();
    startLottery();  // This will set phase to 'lottery' or 'aiming' (for AI)
}

/**
 * Roll and apply a new glitch event
 */
function rollNewGlitchEvent() {
    const event = events.rollForEvent();
    if (event) {
        events.applyEvent(state, event, TANK_TYPES, terrain, CANVAS_WIDTH, TANK_RADIUS);
        state.activeEvent = { name: event.name, color: event.color, timer: 2.5 };
        audio.playGlitch();
        renderer.flash(event.color, 0.3);
    }
}

// ============================================================================
// Cosmic Lottery System
// ============================================================================

/**
 * Get available rarities based on current round
 * Round 1: Common only
 * Round 2: Common + Rare
 * Round 3: Common + Rare + Epic
 * Round 4+: All rarities
 */
function getAvailableRarities() {
    const round = state.round || 1;
    if (round <= 1) return ['common'];
    if (round === 2) return ['common', 'rare'];
    if (round === 3) return ['common', 'rare', 'epic'];
    return ['common', 'rare', 'epic', 'legendary'];
}

/**
 * Roll a rarity based on configured rates, limited by current round
 * Returns: 'common' | 'rare' | 'epic' | 'legendary'
 */
function rollRarity() {
    const availableRarities = getAvailableRarities();

    // If only common available, return common
    if (availableRarities.length === 1) return 'common';

    // Calculate total weight for available rarities
    let totalWeight = 0;
    for (const rarity of availableRarities) {
        totalWeight += LOTTERY_RARITY_RATES[rarity];
    }

    // Roll within the available weight range
    const roll = Math.random() * totalWeight;

    // Check rarities from rarest to most common (order matters for cumulative check)
    let cumulative = 0;
    const rarityOrder = ['legendary', 'epic', 'rare', 'common'];

    for (const rarity of rarityOrder) {
        if (!availableRarities.includes(rarity)) continue;
        cumulative += LOTTERY_RARITY_RATES[rarity];
        if (roll < cumulative) return rarity;
    }

    return 'common';
}

/**
 * Generate a single lottery card of a specific rarity
 */
function rollCardOfRarity(rarity) {
    const pool = WEAPONS_BY_RARITY[rarity];
    if (!pool || pool.length === 0) {
        // Fallback to common if rarity pool is empty
        const fallbackPool = WEAPONS_BY_RARITY.common;
        const weaponKey = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        return createCard(weaponKey, 'common');
    }
    const weaponKey = pool[Math.floor(Math.random() * pool.length)];
    return createCard(weaponKey, rarity);
}

/**
 * Create a card object from weapon key and rarity
 */
function createCard(weaponKey, rarity) {
    const weapon = WEAPONS[weaponKey];
    return {
        weaponKey,
        rarity,
        name: weapon.name,
        damage: weapon.damage,
        blastRadius: weapon.blastRadius,
        description: weapon.description || ''
    };
}

/**
 * Roll a card, excluding specific weapon keys to avoid duplicates
 */
function rollCardExcluding(excludeKeys) {
    const rarity = rollRarity();
    const pool = WEAPONS_BY_RARITY[rarity];

    if (!pool || pool.length === 0) {
        // Fallback to common
        const fallbackPool = WEAPONS_BY_RARITY.common.filter(k => !excludeKeys.includes(k));
        if (fallbackPool.length === 0) {
            // Extreme edge case: just pick any common
            const weaponKey = WEAPONS_BY_RARITY.common[0];
            return createCard(weaponKey, 'common');
        }
        const weaponKey = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
        return createCard(weaponKey, 'common');
    }

    // Filter out excluded weapons
    const availablePool = pool.filter(k => !excludeKeys.includes(k));

    if (availablePool.length === 0) {
        // All weapons of this rarity already picked, try another rarity
        const allRarities = ['common', 'rare', 'epic', 'legendary'];
        for (const fallbackRarity of allRarities) {
            const fallbackPool = WEAPONS_BY_RARITY[fallbackRarity]?.filter(k => !excludeKeys.includes(k)) || [];
            if (fallbackPool.length > 0) {
                const weaponKey = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
                return createCard(weaponKey, fallbackRarity);
            }
        }
        // Absolute fallback (should never happen with 30+ weapons)
        const weaponKey = pool[0];
        return createCard(weaponKey, rarity);
    }

    const weaponKey = availablePool[Math.floor(Math.random() * availablePool.length)];
    return createCard(weaponKey, rarity);
}

/**
 * Generate 3 random lottery cards + 1 guaranteed Mortar (4 total)
 * Pity system ensures rare+ every 5 turns - NO DUPLICATES
 */
function generateLotteryCards() {
    const cards = [];
    const usedWeapons = ['MORTAR'];  // Exclude Mortar from random pool (it's guaranteed)

    // Roll 3 unique random cards
    for (let i = 0; i < 3; i++) {
        const card = rollCardExcluding(usedWeapons);
        cards.push(card);
        usedWeapons.push(card.weaponKey);
    }

    // Pity system: guarantee rare+ if 5 turns without one (only if rare is available)
    const availableRarities = getAvailableRarities();
    if (state.lottery.pityCounter >= 5 && availableRarities.includes('rare')) {
        const hasRarePlus = cards.some(c =>
            c.rarity === 'rare' || c.rarity === 'epic' || c.rarity === 'legendary'
        );
        if (!hasRarePlus) {
            // Upgrade the first card to rare (excluding other cards' weapons)
            const otherWeapons = [cards[1].weaponKey, cards[2].weaponKey, 'MORTAR'];
            const rarePool = WEAPONS_BY_RARITY.rare?.filter(k => !otherWeapons.includes(k)) || [];
            if (rarePool.length > 0) {
                const weaponKey = rarePool[Math.floor(Math.random() * rarePool.length)];
                cards[0] = createCard(weaponKey, 'rare');
            }
        }
    }

    // Update pity counter
    const hasRarePlus = cards.some(c =>
        c.rarity === 'rare' || c.rarity === 'epic' || c.rarity === 'legendary'
    );
    state.lottery.pityCounter = hasRarePlus ? 0 : state.lottery.pityCounter + 1;

    // Add guaranteed Mortar as 1st card (always common rarity, marked as guaranteed)
    const mortarCard = createCard('MORTAR', 'common');
    mortarCard.guaranteed = true;  // Mark as guaranteed fallback
    cards.unshift(mortarCard);

    return cards;
}

/**
 * AI selects the best card from lottery options
 * Strategy: prefer higher rarity, then higher damage
 */
function aiSelectBestCard(cards) {
    const rarityOrder = { legendary: 4, epic: 3, rare: 2, common: 1 };

    return cards.reduce((best, card) => {
        const bestRank = rarityOrder[best.rarity] || 0;
        const cardRank = rarityOrder[card.rarity] || 0;

        if (cardRank > bestRank) return card;
        if (cardRank === bestRank && card.damage > best.damage) return card;
        return best;
    }, cards[0]);
}

/**
 * Show floating notification when AI picks a card
 */
function showAIPickNotification(player, card, playerIndex) {
    state.lotteryNotifications.push({
        text: `P${playerIndex + 1} picked ${card.name}`,
        color: player.color,
        x: player.x,
        y: player.y - 80,
        timer: 2.0,
        rarity: card.rarity
    });
}

/**
 * Start the lottery for the current player
 */
function startLottery() {
    const player = getCurrentPlayer();
    const playerIndex = state.currentPlayer;

    // Skip dead players
    if (player.health <= 0) {
        // Move directly to aiming (will skip in update)
        state.phase = 'aiming';
        if (player.isAI) {
            prepareAITurn();
        }
        return;
    }

    // AI picks instantly - no animation
    if (player.isAI) {
        const cards = generateLotteryCards();
        const bestCard = aiSelectBestCard(cards);
        player.weapon = bestCard.weaponKey;

        // Show floating notification
        showAIPickNotification(player, bestCard, playerIndex);

        // Skip to aiming
        state.phase = 'aiming';
        prepareAITurn();
        return;
    }

    // Human player gets full lottery UI
    state.phase = 'lottery';
    state.lottery.active = true;
    state.lottery.cards = generateLotteryCards();
    state.lottery.selectedIndex = 0;
    state.lottery.animationPhase = 'descending';
    state.lottery.animationTimer = 0;
}

/**
 * Select a card from the lottery
 */
function selectLotteryCard(index) {
    const card = state.lottery.cards[index];
    const player = getCurrentPlayer();

    // Assign weapon for this turn
    player.weapon = card.weaponKey;

    // Play sound based on rarity
    if (card.rarity === 'legendary') {
        audio.playExplosion();  // Big fanfare
        renderer.addScreenShake(10);
    } else if (card.rarity === 'epic') {
        audio.playConfirm();
    } else {
        audio.playSelect();
    }

    // Begin dismiss animation
    state.lottery.animationPhase = 'dismissing';
    state.lottery.animationTimer = 0;
}

/**
 * Handle lottery input
 */
function handleLotteryInput() {
    // Only process input during selection phase
    if (state.lottery.animationPhase !== 'selecting') return;

    const player = getCurrentPlayer();

    // Number keys for direct selection (1-4 for 4 cards)
    if (input.wasPressed('Digit1') || input.wasPressed('Numpad1')) {
        selectLotteryCard(0);
        return;
    }
    if (input.wasPressed('Digit2') || input.wasPressed('Numpad2')) {
        selectLotteryCard(1);
        return;
    }
    if (input.wasPressed('Digit3') || input.wasPressed('Numpad3')) {
        selectLotteryCard(2);
        return;
    }
    if (input.wasPressed('Digit4') || input.wasPressed('Numpad4')) {
        selectLotteryCard(3);  // Guaranteed Mortar
        return;
    }

    // Reroll with R
    if (input.wasPressed('KeyR') && player.rerollsRemaining > 0) {
        player.rerollsRemaining--;
        state.lottery.cards = generateLotteryCards();
        state.lottery.animationPhase = 'descending';
        state.lottery.animationTimer = 0;
        audio.playSelect();
        return;
    }

    // Arrow key navigation (0-3 for 4 cards)
    if (input.wasPressed('ArrowLeft')) {
        state.lottery.selectedIndex = Math.max(0, state.lottery.selectedIndex - 1);
        audio.playSelect();
    }
    if (input.wasPressed('ArrowRight')) {
        state.lottery.selectedIndex = Math.min(3, state.lottery.selectedIndex + 1);
        audio.playSelect();
    }

    // Confirm with Enter/Space
    if (input.wasPressed('Enter') || input.spaceReleased) {
        selectLotteryCard(state.lottery.selectedIndex);
    }
}

/**
 * Update lottery animation state
 */
function updateLottery(dt) {
    if (!state.lottery.active) return;

    state.lottery.animationTimer += dt * 1000;  // Convert to ms

    switch (state.lottery.animationPhase) {
        case 'descending':
            if (state.lottery.animationTimer >= 400) {
                state.lottery.animationPhase = 'revealing';
                state.lottery.animationTimer = 0;
            }
            break;

        case 'revealing':
            if (state.lottery.animationTimer >= 300) {
                state.lottery.animationPhase = 'selecting';
                state.lottery.animationTimer = 0;
            }
            break;

        case 'selecting':
            // Wait for player input (handled in handleLotteryInput)
            break;

        case 'dismissing':
            if (state.lottery.animationTimer >= 300) {
                state.lottery.active = false;
                state.lottery.animationPhase = 'none';
                state.phase = 'aiming';
            }
            break;
    }
}

/**
 * Update lottery notifications (floating text)
 */
function updateLotteryNotifications(dt) {
    for (let i = state.lotteryNotifications.length - 1; i >= 0; i--) {
        const notif = state.lotteryNotifications[i];
        notif.timer -= dt;
        notif.y -= dt * 30;  // Float upward
        if (notif.timer <= 0) {
            state.lotteryNotifications.splice(i, 1);
        }
    }
}

// ============================================================================
// AI System - Smart ballistic solver with event awareness
// ============================================================================

/**
 * Get current gravity adjusted for events
 */
/**
 * Roll new wind value for the round
 * Returns 0 (15% calm) or ±0.02 to ±0.08
 */
function rollNewWind() {
    if (Math.random() < 0.15) return 0; // 15% calm
    const magnitude = Math.random() * 0.15; // 0 to 0.15
    const direction = Math.random() < 0.5 ? -1 : 1;
    return magnitude * direction;
}

function getEffectiveGravity() {
    return state.gravity || DEFAULT_GRAVITY;
}

/**
 * Get current wind (base wind or amplified during WIND BLAST)
 */
function getEffectiveWind() {
    return state.wind || 0;
}

/**
 * Simulate a hitscan beam (instant, straight line) with wall bounces
 * Used for Railgun, Plasma Bolt, and other instant-hit weapons
 * Returns { hitX, hitY, hitsTarget, distance, bounces } or null if OOB
 */
function simulateHitscan(startX, startY, angleDeg, targetX, targetY, targetRadius, weaponOverride = null) {
    const weapon = weaponOverride || WEAPONS[getCurrentPlayer().weapon] || WEAPONS.RAILGUN;
    const angleRad = degToRad(180 - angleDeg);
    const maxBounces = (weapon.bounces || 1) + state.extraBounces;

    let x = startX;
    let y = startY - 20;  // Barrel offset
    let dx = Math.cos(angleRad);
    let dy = -Math.sin(angleRad);

    // Normalize direction
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;

    // Step size for ray tracing
    const stepSize = 5;
    const maxSteps = 2000;  // Enough to cross the map multiple times
    let bounces = 0;

    for (let step = 0; step < maxSteps; step++) {
        // Move along the ray
        x += dx * stepSize;
        y += dy * stepSize;

        // Wall bounces
        if (x < WORLD_LEFT && bounces < maxBounces) {
            x = WORLD_LEFT;
            dx = -dx;
            bounces++;
        }
        if (x > WORLD_RIGHT && bounces < maxBounces) {
            x = WORLD_RIGHT;
            dx = -dx;
            bounces++;
        }

        // Check if beam hits target tank
        const distToTarget = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
        if (distToTarget < targetRadius + 5) {  // Small buffer for hit detection
            return {
                hitX: x,
                hitY: y,
                hitsTarget: true,
                distance: 0,  // Direct hit
                bounces: bounces
            };
        }

        // Check terrain hit
        const groundY = terrain.getHeightAt(x);
        if (y >= groundY) {
            // Hit terrain - return distance to target
            return {
                hitX: x,
                hitY: y,
                hitsTarget: false,
                distance: distToTarget,
                bounces: bounces
            };
        }

        // Check void
        if (y > state.voidY) {
            return {
                hitX: x,
                hitY: y,
                hitsTarget: false,
                distance: Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2),
                bounces: bounces
            };
        }

        // Out of bounds (above screen is OK for beams going up)
        if (x < -200 || x > VIRTUAL_WIDTH + 200 || y > VIRTUAL_HEIGHT + 200) {
            return null;
        }
    }

    return null;  // Timeout
}

/**
 * Simulate a projectile trajectory with full physics
 * Returns { hitX, hitY, hitsTarget, nearMiss, distance, bounces } or null if OOB
 */
function simulateTrajectory(startX, startY, angleDeg, power, targetX, targetY, targetRadius, weaponOverride = null) {
    const weapon = weaponOverride || WEAPONS[getCurrentPlayer().weapon] || WEAPONS.MORTAR;
    const angleRad = degToRad(180 - angleDeg);
    const effectivePower = chargeToPower(power);
    const speed = effectivePower * MAX_POWER * (weapon.projectileSpeed || 1.0) * state.velocityMultiplier;

    let x = startX;
    let y = startY - 20;  // Barrel offset
    let vx = Math.cos(angleRad) * speed;
    let vy = -Math.sin(angleRad) * speed;

    const gravity = getEffectiveGravity();
    const wind = getEffectiveWind();
    const maxBounces = (weapon.bounces || 1) + state.extraBounces;
    let bounces = 0;

    // Increased steps for larger 3840px world
    const maxSteps = 900;

    for (let step = 0; step < maxSteps; step++) {
        // Apply gravity
        vy += gravity;

        // Apply wind (must match updateProjectile exactly: proj.vx += state.wind)
        if (wind !== 0) {
            vx += wind;
        }

        // Move
        x += vx;
        y += vy;

        // Wall bounces - INFINITE ricochets (track for AI info, but no limit)
        if (x < WORLD_LEFT) {
            x = WORLD_LEFT;
            vx = -vx * 0.9;
            bounces++;  // Track for AI bank shot detection, but no limit
        }
        if (x > WORLD_RIGHT) {
            x = WORLD_RIGHT;
            vx = -vx * 0.9;
            bounces++;  // Track for AI bank shot detection, but no limit
        }
        // NO ceiling bounce - projectiles can arc high and fall back down

        // Check terrain hit
        const groundY = terrain.getHeightAt(x);
        if (y >= groundY) {
            // Hit terrain - check distance to target
            const distToTarget = Math.sqrt((x - targetX) ** 2 + (y - targetY) ** 2);
            const blastRadius = weapon.blastRadius || 80;
            return {
                hitX: x,
                hitY: y,
                hitsTarget: distToTarget < blastRadius + targetRadius,
                nearMiss: distToTarget < blastRadius * 1.5 + targetRadius,
                distance: distToTarget,
                bounces: bounces
            };
        }

        // Check void
        if (y > state.voidY) {
            return null;  // Lost to void
        }

        // Out of bounds check
        if (x < -200 || x > VIRTUAL_WIDTH + 200 || y > VIRTUAL_HEIGHT + 200) {
            return null;
        }
    }

    return null;  // Timeout
}

/**
 * Find the optimal angle and power to hit a target using grid search
 * Includes bank shot consideration (wall bounces)
 */
function findOptimalShot(ai, target, weapon) {
    const dx = target.x - ai.x;
    const dy = target.y - ai.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Determine which direction to shoot
    const shootingRight = dx > 0;

    // Calculate a smart default angle toward the target (used as fallback)
    // ANGLE SYSTEM: angleDeg 95-165 shoots RIGHT, angleDeg 15-85 shoots LEFT
    // (because angleRad = 180 - angleDeg, and cos(angleRad) determines vx direction)
    const directAngle = Math.atan2(-dy, Math.abs(dx)) * (180 / Math.PI);
    const smartDefaultAngle = shootingRight
        ? clamp(130 - directAngle * 0.5, 95, 165)  // Right: higher angleDeg = shoots right
        : clamp(50 + directAngle * 0.5, 15, 85);   // Left: lower angleDeg = shoots left

    // Smart default power based on distance (scaled for 3840px world)
    const smartDefaultPower = clamp(0.45 + (dist / 3000), 0.5, 0.92);

    // Search for best angle and power combination
    let bestAngle = smartDefaultAngle;
    let bestPower = smartDefaultPower;
    let bestDistance = Infinity;
    let foundHit = false;

    // CORRECTED angle ranges:
    // To shoot RIGHT (vx > 0): angleDeg must be 95-165 (so 180-angle is 15-85, cos positive)
    // To shoot LEFT (vx < 0): angleDeg must be 15-85 (so 180-angle is 95-165, cos negative)
    const angleMin = shootingRight ? 95 : 15;
    const angleMax = shootingRight ? 165 : 85;

    // Bank shots (opposite direction - bounce off wall)
    const bankAngleMin = shootingRight ? 15 : 95;
    const bankAngleMax = shootingRight ? 85 : 165;

    // Adjust power range based on distance and gravity (scaled for 3840px world)
    const gravityFactor = getEffectiveGravity() / DEFAULT_GRAVITY;
    const basePowerMin = 0.4;
    const basePowerMax = 0.98;

    // Direct shots - 30x20 grid for better accuracy on 2560px world
    for (let angleStep = 0; angleStep <= 30; angleStep++) {
        const testAngle = angleMin + (angleMax - angleMin) * (angleStep / 30);

        for (let powerStep = 0; powerStep <= 20; powerStep++) {
            const testPower = basePowerMin + (powerStep / 20) * (basePowerMax - basePowerMin);

            const result = simulateTrajectory(
                ai.x, ai.y, testAngle, testPower,
                target.x, target.y, TANK_RADIUS, weapon
            );

            if (result && result.distance < bestDistance) {
                bestDistance = result.distance;
                bestAngle = testAngle;
                bestPower = testPower;

                if (result.hitsTarget) {
                    foundHit = true;
                }
            }
        }
    }

    // Bank shots (if direct shot not found or for variety)
    if (!foundHit || Math.random() < 0.2) {
        for (let angleStep = 0; angleStep <= 12; angleStep++) {
            const testAngle = bankAngleMin + (bankAngleMax - bankAngleMin) * (angleStep / 12);

            for (let powerStep = 0; powerStep <= 12; powerStep++) {
                const testPower = 0.5 + (powerStep / 12) * 0.45;

                const result = simulateTrajectory(
                    ai.x, ai.y, testAngle, testPower,
                    target.x, target.y, TANK_RADIUS, weapon
                );

                if (result && result.bounces > 0 && result.distance < bestDistance) {
                    bestDistance = result.distance;
                    bestAngle = testAngle;
                    bestPower = testPower;

                    if (result.hitsTarget) {
                        foundHit = true;
                    }
                }
            }
        }
    }

    // Fine-tune around best found solution with tighter window
    if (bestDistance < Infinity) {
        for (let fineAngle = bestAngle - 3; fineAngle <= bestAngle + 3; fineAngle += 0.3) {
            for (let finePower = bestPower - 0.06; finePower <= bestPower + 0.06; finePower += 0.015) {
                const result = simulateTrajectory(
                    ai.x, ai.y, fineAngle, clamp(finePower, 0.3, 0.98),
                    target.x, target.y, TANK_RADIUS, weapon
                );

                if (result && result.distance < bestDistance) {
                    bestDistance = result.distance;
                    bestAngle = fineAngle;
                    bestPower = clamp(finePower, 0.3, 0.98);

                    if (result.hitsTarget) {
                        foundHit = true;
                    }
                }
            }
        }
    }

    // SAFETY FALLBACK: If simulation found nothing useful, use smart defaults
    // This ensures AI always has a reasonable shot toward the target
    if (bestDistance === Infinity) {
        bestAngle = smartDefaultAngle;
        bestPower = smartDefaultPower;
        foundHit = false;  // Not guaranteed to hit
    }

    return { angle: bestAngle, power: bestPower, perfect: foundHit, distance: bestDistance };
}

/**
 * Evaluate if AI should use orbital weapon (or other special weapons)
 */
function shouldUseOrbitalWeapon(ai, enemies) {
    const weapon = WEAPONS[ai.weapon];
    if (!weapon) return false;

    // ORBITAL BEACON: Use when enemy is stationary or in crater
    if (ai.weapon === 'ORBITAL_BEACON') {
        // Always use if we have it - it's powerful
        return enemies.length > 0;
    }

    // STRAFING RUN: Use when enemies are spread horizontally
    if (ai.weapon === 'STRAFING_RUN') {
        if (enemies.length >= 2) {
            const xs = enemies.map(p => p.x);
            const spread = Math.max(...xs) - Math.min(...xs);
            return spread > 200;  // Enemies spread out enough for strafing
        }
        return enemies.length > 0;  // Use even for single target
    }

    // NUKE: Always use it - it's devastating
    if (ai.weapon === 'NUKE') {
        return enemies.length > 0;
    }

    // RAILGUN: Not orbital-style, use normal aiming (returns false)
    // Railgun uses direct beam, handled by normal shot logic
    if (ai.weapon === 'RAILGUN') {
        return false;  // Use normal aiming for precision beam
    }

    return false;
}

/**
 * Get target position for orbital weapon
 */
function getOrbitalTarget(ai, enemies) {
    if (enemies.length === 0) return { x: VIRTUAL_WIDTH / 2, y: VIRTUAL_HEIGHT / 2 };

    // For strafing run, target the center of enemies
    if (ai.weapon === 'STRAFING_RUN') {
        const avgX = enemies.reduce((sum, p) => sum + p.x, 0) / enemies.length;
        return { x: avgX, y: enemies[0].y };
    }

    // For NUKE, target cluster of enemies for maximum devastation
    if (ai.weapon === 'NUKE') {
        // If multiple enemies, target the center for maximum splash
        if (enemies.length >= 2) {
            const avgX = enemies.reduce((sum, p) => sum + p.x, 0) / enemies.length;
            const avgY = enemies.reduce((sum, p) => sum + p.y, 0) / enemies.length;
            return { x: avgX, y: avgY };
        }
        // Single enemy - target them directly
        return { x: enemies[0].x, y: enemies[0].y };
    }

    // For orbital beacon, target the lowest health enemy
    const target = enemies.reduce((best, p) => p.health < best.health ? p : best, enemies[0]);
    return { x: target.x, y: target.y };
}

function prepareAITurn() {
    const ai = getCurrentPlayer();
    const weapon = WEAPONS[ai.weapon] || WEAPONS.MORTAR;

    // Find all living enemies
    const enemies = [];
    for (let i = 0; i < state.players.length; i++) {
        if (i === state.currentPlayer) continue;
        const p = state.players[i];
        if (p.health <= 0) continue;
        enemies.push({ ...p, index: i });
    }

    // No valid targets - set a default shot (straight up, low power) and return
    if (enemies.length === 0) {
        state.aiTargetAngle = 90;  // Straight up
        state.aiTargetPower = 0.5;
        state.aiThinkTime = 500;
        return;
    }

    // Check if AI should use orbital weapon
    if (shouldUseOrbitalWeapon(ai, enemies)) {
        const orbitalTarget = getOrbitalTarget(ai, enemies);
        // Aim at orbital target with high arc
        const dx = orbitalTarget.x - ai.x;
        const shootingRight = dx > 0;
        state.aiTargetAngle = shootingRight ? 60 : 120;  // High arc for orbital drop
        state.aiTargetPower = clamp(Math.abs(dx) / 800, 0.4, 0.85);
        state.aiThinkTime = 600 + Math.random() * 400;
        return;
    }

    // Helper: Check if enemy is in a "hole" (terrain around them is higher)
    const isInHole = (enemy) => {
        const enemyGroundY = terrain.getHeightAt(enemy.x);
        const leftGroundY = terrain.getHeightAt(enemy.x - 80);
        const rightGroundY = terrain.getHeightAt(enemy.x + 80);
        // Enemy is in a hole if terrain on both sides is at least 40px higher
        return leftGroundY < enemyGroundY - 40 && rightGroundY < enemyGroundY - 40;
    };

    // Helper: Check if there's clear line-of-sight to target
    const hasClearLOS = (enemy) => {
        const dx = enemy.x - ai.x;
        const dy = enemy.y - ai.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(dist / 20);

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const checkX = ai.x + dx * t;
            const checkY = ai.y + dy * t;
            const groundY = terrain.getHeightAt(checkX);
            if (checkY > groundY - 10) {
                return false;  // Terrain blocks LOS
            }
        }
        return true;
    };

    // Find best target with situational scoring
    let target = null;
    let bestScore = -Infinity;
    for (const enemy of enemies) {
        // Base score: heavily prefer low health, secondary prefer close distance
        const healthScore = (100 - enemy.health) * 15;  // Lower health = much higher score
        const distScore = -Math.abs(enemy.x - ai.x) / 50;  // Closer = higher score

        // Bonus for enemies near void
        const voidProximity = (state.voidY - enemy.y) < 150 ? 200 : 0;

        // Bonus for clear LOS with hitscan weapon
        const isHitscanWeapon = weapon.projectileSpeed === 0;
        const losBonus = (isHitscanWeapon && hasClearLOS(enemy)) ? 150 : 0;

        // Bonus for enemies in holes with splash weapons
        const isSplashWeapon = (weapon.blastRadius || 0) >= 80;
        const holeBonus = (isSplashWeapon && isInHole(enemy)) ? 100 : 0;

        const score = healthScore + distScore + voidProximity + losBonus + holeBonus;

        if (score > bestScore) {
            bestScore = score;
            target = enemy;
        }
    }

    // No target found - set default and return (shouldn't happen but safety first)
    if (!target) {
        state.aiTargetAngle = ai.angle;  // Keep current angle
        state.aiTargetPower = 0.6;
        state.aiThinkTime = 500;
        return;
    }

    // === WEAPON-SPECIFIC SHOT LOGIC ===

    // HITSCAN WEAPONS: Instant beam - use simulateHitscan for accurate targeting
    const isHitscan = weapon.projectileSpeed === 0 ||
                      weapon.behavior === 'railgunBeam' ||
                      weapon.behavior === 'plasmaBeam' ||
                      weapon.behavior === 'instantBeam';

    if (isHitscan) {
        const dx = target.x - ai.x;
        const shootingRight = dx > 0;

        // CORRECTED angle ranges:
        // To shoot RIGHT: angleDeg 95-165
        // To shoot LEFT: angleDeg 15-85
        let bestHitscanAngle = shootingRight ? 130 : 50;  // Smart defaults toward target

        // Grid search for best angle using proper hitscan simulation
        const angleMin = shootingRight ? 95 : 15;
        const angleMax = shootingRight ? 165 : 85;

        let bestHitscanDist = Infinity;
        let foundDirectHit = false;

        // Direct shots - finer grid for precision weapons
        for (let testAngle = angleMin; testAngle <= angleMax; testAngle += 2) {
            const result = simulateHitscan(ai.x, ai.y, testAngle, target.x, target.y, TANK_RADIUS, weapon);
            if (result) {
                if (result.hitsTarget) {
                    // Direct hit found!
                    bestHitscanAngle = testAngle;
                    bestHitscanDist = 0;
                    foundDirectHit = true;
                    break;  // Can't do better than a direct hit
                } else if (result.distance < bestHitscanDist) {
                    bestHitscanDist = result.distance;
                    bestHitscanAngle = testAngle;
                }
            }
        }

        // Also try bank shots off walls (if no direct hit and weapon has bounces)
        if (!foundDirectHit && (weapon.bounces || 0) > 0) {
            const bankAngleMin = shootingRight ? 15 : 95;
            const bankAngleMax = shootingRight ? 85 : 165;
            for (let testAngle = bankAngleMin; testAngle <= bankAngleMax; testAngle += 3) {
                const result = simulateHitscan(ai.x, ai.y, testAngle, target.x, target.y, TANK_RADIUS, weapon);
                if (result && result.bounces > 0) {
                    if (result.hitsTarget) {
                        bestHitscanAngle = testAngle;
                        bestHitscanDist = 0;
                        foundDirectHit = true;
                        break;
                    } else if (result.distance < bestHitscanDist) {
                        bestHitscanDist = result.distance;
                        bestHitscanAngle = testAngle;
                    }
                }
            }
        }

        // Accuracy: 85% for hitscan weapons (they're precision tools)
        // Scale accuracy with distance - harder to hit far targets
        const distanceToTarget = Math.sqrt((target.x - ai.x) ** 2 + (target.y - ai.y) ** 2);
        const distancePenalty = Math.min(distanceToTarget / 2000, 0.15);  // Up to 15% penalty for far targets
        const accuracy = 0.85 - distancePenalty;

        const willHit = Math.random() < accuracy;
        if (willHit && foundDirectHit) {
            state.aiTargetAngle = bestHitscanAngle;
        } else {
            // Near miss - add small error (tighter for close targets)
            const errorScale = foundDirectHit ? 4 : 8;
            state.aiTargetAngle = bestHitscanAngle + (Math.random() - 0.5) * errorScale;
        }
        state.aiTargetPower = 0.5;  // Power doesn't affect hitscan
        state.aiThinkTime = 700 + Math.random() * 400;  // Slightly longer think for precision
        applyEventAdjustments();
        return;
    }

    // Find the optimal shot using trajectory simulation
    const optimalShot = findOptimalShot(ai, target, weapon);

    // 80% chance of perfect shot - AI is a real threat
    const willHit = Math.random() < 0.80;

    if (willHit && optimalShot.perfect) {
        // Use the calculated optimal shot
        state.aiTargetAngle = optimalShot.angle;
        state.aiTargetPower = optimalShot.power;
    } else {
        // Near miss - tight error range so AI still gets close
        const angleError = (Math.random() - 0.5) * 6;  // ±3 degrees
        const powerError = (Math.random() - 0.5) * 0.06;  // ±3% power
        state.aiTargetAngle = clamp(optimalShot.angle + angleError, 10, 170);
        state.aiTargetPower = clamp(optimalShot.power + powerError, 0.35, 0.98);
    }

    // Apply event-aware adjustments
    applyEventAdjustments();

    // Self-damage avoidance: Check if shot would land too close to AI
    const selfDamageCheck = simulateTrajectory(
        ai.x, ai.y, state.aiTargetAngle, state.aiTargetPower,
        ai.x, ai.y, TANK_RADIUS, weapon
    );
    if (selfDamageCheck) {
        const distToSelf = Math.sqrt(
            (selfDamageCheck.hitX - ai.x) ** 2 + (selfDamageCheck.hitY - ai.y) ** 2
        );
        const dangerRadius = (weapon.blastRadius || 80) + TANK_RADIUS;

        if (distToSelf < dangerRadius) {
            // Shot would damage self - adjust power or angle
            if (state.aiTargetPower < 0.8) {
                state.aiTargetPower = clamp(state.aiTargetPower + 0.15, 0.5, 0.95);
            } else {
                // Adjust angle to shoot higher arc
                const adjustment = (state.aiTargetAngle > 90) ? -10 : 10;
                state.aiTargetAngle = clamp(state.aiTargetAngle + adjustment, 20, 160);
            }
        }
    }

    // Think time before acting (0.6-1.2 seconds - faster)
    state.aiThinkTime = 600 + Math.random() * 600;

    // Debug: Log AI decision
    console.log(`[AI] P${state.currentPlayer + 1} targeting at angle=${state.aiTargetAngle.toFixed(1)}° power=${(state.aiTargetPower * 100).toFixed(0)}% (perfect=${optimalShot.perfect}, dist=${optimalShot.distance.toFixed(0)})`);
}

/**
 * Adjust AI shot based on active glitch events and persistent wind
 */
function applyEventAdjustments() {
    const eventName = state.activeEvent?.name;

    // Gravity adjustments
    if (eventName === 'GRAVITY FLUX' || eventName === 'HEAVY GRAVITY') {
        // Higher gravity = need more power and higher angle
        if (state.gravity > DEFAULT_GRAVITY) {
            state.aiTargetPower = clamp(state.aiTargetPower * 1.15, 0.4, 0.98);
            state.aiTargetAngle = clamp(state.aiTargetAngle + 5, 10, 170);
        }
    }

    if (eventName === 'LOW GRAVITY' || eventName === 'MOON GRAVITY') {
        // Lower gravity = need less power
        if (state.gravity < DEFAULT_GRAVITY) {
            state.aiTargetPower = clamp(state.aiTargetPower * 0.85, 0.35, 0.95);
        }
    }

    // Wind compensation - applies to ALL wind (persistent + event amplification)
    if (state.wind !== 0) {
        // Base compensation: aim opposite to wind direction
        const baseCompensation = -state.wind * 3;

        // Add ±10% imperfection so AI isn't perfect
        const imperfection = 0.9 + Math.random() * 0.2;  // 0.9 to 1.1
        const windCompensation = baseCompensation * imperfection;

        state.aiTargetAngle = clamp(state.aiTargetAngle + windCompensation, 10, 170);
    }

    // Velocity multiplier events
    if (eventName === 'TIME DILATION' || eventName === 'MUZZLE OVERCHARGE') {
        if (state.velocityMultiplier > 1) {
            state.aiTargetPower = clamp(state.aiTargetPower * 0.9, 0.35, 0.95);
        }
    }

    if (eventName === 'MUZZLE DAMPEN') {
        if (state.velocityMultiplier < 1) {
            state.aiTargetPower = clamp(state.aiTargetPower * 1.1, 0.4, 0.98);
        }
    }
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
    // Check for void deaths first (mark players as dead)
    for (const player of state.players) {
        if (player.health > 0 && player.y + TANK_RADIUS > state.voidY) {
            const gracePeriod = getVoidGracePeriod(player);
            if (gracePeriod > 0) {
                // Start or continue void grace timer (if any)
                if (player.voidGraceTimer === undefined || player.voidGraceTimer <= 0) {
                    player.voidGraceTimer = gracePeriod;
                }
                // Decrement timer (dt not available here, use approximation)
                player.voidGraceTimer -= 0.016;  // ~60fps
                if (player.voidGraceTimer <= 0) {
                    triggerDeathExplosion(player, true);  // Void death explosion
                    player.health = 0;  // Grace period expired
                }
                // Visual warning effect while in grace period
                particles.sparks(player.x, player.y, 8, '#ff00ff');
                particles.sparks(player.x, player.y, 5, COLORS.magenta);
            } else {
                triggerDeathExplosion(player, true);  // Void death explosion
                player.health = 0;  // Kill player who touched void
            }
        } else {
            // Reset grace timer when not in void
            player.voidGraceTimer = 0;
        }
    }

    // Count living players
    const livingPlayers = [];
    for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].health > 0) {
            livingPlayers.push(i);
        }
    }

    // If only one player remains, they win
    if (livingPlayers.length === 1) {
        return { winner: livingPlayers[0], reason: 'last_standing' };
    }

    // If no players remain (draw), first player wins by default
    if (livingPlayers.length === 0) {
        return { winner: 0, reason: 'draw' };
    }

    return null;
}

// ============================================================================
// Tank Physics (Falling)
// ============================================================================

function updateTankPhysics(player) {
    // === HORIZONTAL MOVEMENT (knockback sliding) ===
    if (player.vx && Math.abs(player.vx) > 0.1) {
        // Apply horizontal velocity
        player.x += player.vx;

        // Friction/damping (ground friction stronger than air)
        const groundY = terrain.getHeightAt(player.x);
        const isGrounded = player.y + TANK_RADIUS >= groundY - 5;
        const friction = isGrounded ? 0.85 : 0.95;  // More friction on ground
        player.vx *= friction;

        // Stop if very slow
        if (Math.abs(player.vx) < 0.1) {
            player.vx = 0;
        }
    }

    // === ENFORCE WORLD BOUNDARIES ===
    enforceTankBounds(player);

    // === VERTICAL PHYSICS (falling) ===
    const groundY = terrain.getHeightAt(player.x);
    const hoverHeight = getArchetypeHoverHeight(player);  // SPECTER hovers above terrain
    const targetY = groundY - TANK_RADIUS - hoverHeight;  // Target position (on ground or hovering)
    const tankBottom = player.y + TANK_RADIUS;

    if (hoverHeight > 0) {
        // SPECTER: Smoothly hover at fixed height above terrain
        // Don't apply gravity - just smoothly move toward target hover height
        const diff = targetY - player.y;
        player.y += diff * 0.15;  // Smooth interpolation
        player.vy = 0;  // No falling velocity
    } else if (tankBottom < groundY) {
        // Normal tank: above ground — fall
        player.vy += state.gravity;
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

    // === FINAL SAFETY CHECK - ALWAYS ENFORCE BOUNDS ===
    // This runs at the END to catch ANY edge case
    enforceTankBounds(player);
}

// ============================================================================
// Update
// ============================================================================

function update(dt) {
    state.time += dt;

    // Always update ambient world systems (clouds, UFOs, weather, wind streaks) for all phases
    const ambient = getAmbient();
    if (ambient) {
        const isWindBlast = state.activeEvent && state.activeEvent.name === 'WIND BLAST';
        ambient.update(dt, state.voidY, state.players, state.wind, isWindBlast);
    }

    // Update terrain circuit pulse animations
    terrain.updateCircuitPulses(dt);

    // Update terrain crater glow decay
    terrain.updateCraters(dt);

    // Update lottery notifications (floating text from AI picks)
    updateLotteryNotifications(dt);

    // Update death notifications (ELIMINATED text)
    for (const notif of state.deathNotifications) {
        notif.timer -= dt;
    }

    // ========================================================================
    // DEBUG COMMANDS (active during gameplay phases)
    // ========================================================================
    if (state.phase === 'aiming' || state.phase === 'firing' || state.phase === 'lottery') {
        // D = Give current player DYING LIGHT
        if (input.wasPressed('KeyD')) {
            const player = getCurrentPlayer();
            state.storedWeapons[state.currentPlayer] = player.weapon;
            player.weapon = 'DYING_STAR';
            state.dyingStarTurns[state.currentPlayer] = 99;  // Infinite uses in debug
            console.log(`[DEBUG] P${state.currentPlayer + 1} got DYING LIGHT`);
            audio.playPurchase();
        }

        // B = Spawn desperation BEACON
        if (input.wasPressed('KeyB')) {
            spawnGuaranteedDesperationBeacon();
            console.log('[DEBUG] Spawned desperation beacon');
        }

        // C = Give current player 500 COINS
        if (input.wasPressed('KeyC')) {
            const player = getCurrentPlayer();
            player.coins += 500;
            console.log(`[DEBUG] P${state.currentPlayer + 1} got 500 coins (total: ${player.coins})`);
            audio.playPurchase();
        }

        // H = HEAL current player to full
        if (input.wasPressed('KeyH')) {
            const player = getCurrentPlayer();
            player.health = 100;
            console.log(`[DEBUG] P${state.currentPlayer + 1} healed to full`);
            particles.sparks(player.x, player.y, 30, '#00ff00');
        }

        // K = KILL next enemy (cycle through)
        if (input.wasPressed('KeyK')) {
            for (let i = 0; i < state.players.length; i++) {
                if (i !== state.currentPlayer && state.players[i].health > 0) {
                    state.players[i].health = 0;
                    triggerDeathExplosion(state.players[i], false);
                    console.log(`[DEBUG] Killed P${i + 1}`);
                    break;
                }
            }
        }

        // V = Raise VOID by 100
        if (input.wasPressed('KeyV')) {
            state.voidY -= 100;
            console.log(`[DEBUG] Void raised to ${state.voidY}`);
            renderer.flash('#8800ff', 0.3);
        }

        // N = Give current player NUKE
        if (input.wasPressed('KeyN')) {
            const player = getCurrentPlayer();
            player.weapon = 'NUKE';
            console.log(`[DEBUG] P${state.currentPlayer + 1} got NUKE`);
            audio.playPurchase();
        }

        // Q = Give current player QUAKE
        if (input.wasPressed('KeyQ')) {
            const player = getCurrentPlayer();
            player.weapon = 'QUAKE';
            console.log(`[DEBUG] P${state.currentPlayer + 1} got QUAKE`);
            audio.playPurchase();
        }

        // O = Give current player ORBITAL BEACON
        if (input.wasPressed('KeyO')) {
            const player = getCurrentPlayer();
            player.weapon = 'ORBITAL_BEACON';
            state.orbitalStock.ORBITAL_BEACON.remaining = 99;
            console.log(`[DEBUG] P${state.currentPlayer + 1} got ORBITAL BEACON`);
            audio.playPurchase();
        }

        // S = Give current player STRAFING RUN
        if (input.wasPressed('KeyS') && !input.space) {
            const player = getCurrentPlayer();
            player.weapon = 'STRAFING_RUN';
            state.orbitalStock.STRAFING_RUN.remaining = 99;
            console.log(`[DEBUG] P${state.currentPlayer + 1} got STRAFING RUN`);
            audio.playPurchase();
        }

        // M = Give current player METEOR_SHOWER
        if (input.wasPressed('KeyM')) {
            const player = getCurrentPlayer();
            player.weapon = 'METEOR_SHOWER';
            console.log(`[DEBUG] P${state.currentPlayer + 1} got METEOR SHOWER`);
            audio.playPurchase();
        }

        // G = Give current player VOID_CANNON
        if (input.wasPressed('KeyG')) {
            const player = getCurrentPlayer();
            player.weapon = 'VOID_CANNON';
            console.log(`[DEBUG] P${state.currentPlayer + 1} got VOID CANNON`);
            audio.playPurchase();
        }

        // X = Give current player VOID_SPLITTER
        if (input.wasPressed('KeyX')) {
            const player = getCurrentPlayer();
            player.weapon = 'VOID_SPLITTER';
            console.log(`[DEBUG] P${state.currentPlayer + 1} got VOID SPLITTER`);
            audio.playPurchase();
        }

        // 1-9 = Cycle through weapons
        for (let i = 1; i <= 9; i++) {
            if (input.wasPressed(`Digit${i}`)) {
                const weaponKeys = Object.keys(WEAPONS);
                const weaponIndex = (i - 1) % weaponKeys.length;
                const player = getCurrentPlayer();
                player.weapon = weaponKeys[weaponIndex];
                console.log(`[DEBUG] P${state.currentPlayer + 1} got ${WEAPONS[player.weapon].name}`);
                audio.playSelect();
            }
        }

        // P = Toggle post-processing effects
        if (input.wasPressed('KeyP')) {
            const enabled = postfx.togglePostFX();
            console.log(`[DEBUG] Post-FX: ${enabled ? 'ON' : 'OFF'}`);
        }
    }

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

    // Mode selection (1P-4P)
    if (state.phase === 'mode_select') {
        const numModes = 4;
        if (input.wasPressed('ArrowUp') || input.wasPressed('ArrowLeft')) {
            state.selectIndex = (state.selectIndex - 1 + numModes) % numModes;
            audio.playSelect();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('ArrowRight')) {
            state.selectIndex = (state.selectIndex + 1) % numModes;
            audio.playSelect();
        }
        if (input.spaceReleased || input.enter) {
            audio.playConfirm();
            // Map index to human player count: 0→1, 1→2, 2→3, 3→4
            state.humanPlayerCount = state.selectIndex + 1;
            state.gameMode = state.humanPlayerCount === 1 ? '1p' : 'mp';
            resetGame();  // This sets up players with AI flag based on humanPlayerCount
        }
        input.endFrame();
        return;
    }

    // Tank archetype selection (dynamic for 1-4 players)
    if (state.phase === 'archetype_select') {
        const selectingPlayer = state.players[state.selectingPlayerIndex];

        // If current selecting player is AI, auto-select and advance
        if (selectingPlayer.isAI) {
            const aiChoice = ARCHETYPE_KEYS[Math.floor(Math.random() * ARCHETYPE_KEYS.length)];
            selectingPlayer.archetype = aiChoice;
            advanceArchetypeSelection();
            input.endFrame();
            return;
        }

        // Navigate with up/down or left/right
        if (input.wasPressed('ArrowUp') || input.wasPressed('ArrowLeft')) {
            state.selectIndex = (state.selectIndex - 1 + ARCHETYPE_KEYS.length) % ARCHETYPE_KEYS.length;
            audio.playSelect();
        }
        if (input.wasPressed('ArrowDown') || input.wasPressed('ArrowRight')) {
            state.selectIndex = (state.selectIndex + 1) % ARCHETYPE_KEYS.length;
            audio.playSelect();
        }

        // Confirm selection with Space or Enter
        if (input.spaceReleased || input.enter) {
            const selectedArchetype = ARCHETYPE_KEYS[state.selectIndex];
            audio.playConfirm();
            selectingPlayer.archetype = selectedArchetype;
            advanceArchetypeSelection();
        }

        input.endFrame();
        return;
    }

    // Awaiting next turn - press space to continue
    if (state.phase === 'awaiting_next_turn') {
        if (input.space || input.enter) {
            confirmNextTurn();
        }
        input.endFrame();
        // Don't return - let effects continue updating
    }

    // Lottery phase
    if (state.phase === 'lottery') {
        handleLotteryInput();
        updateLottery(dt);
        // DON'T return early - let nukes update during lottery!
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

            // Charge with space (oscillates up and down for skill-based timing)
            if (input.space && !state.projectile && state.projectiles.length === 0) {
                // Start charge sound when beginning to charge
                if (!player.charging) {
                    audio.startCharge();
                    player.chargeDir = 1;  // Start going up
                }
                player.charging = true;

                // Oscillate power up and down
                player.power += CHARGE_RATE * player.chargeDir;
                if (player.power >= 1) {
                    player.power = 1;
                    player.chargeDir = -1;  // Reverse to go down
                } else if (player.power <= 0.1) {
                    player.power = 0.1;  // Don't go below 10%
                    player.chargeDir = 1;   // Reverse to go up
                }

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
            console.log('[DEBUG] Escape pressed in gameover - returning to title');
            resetToTitle();  // Back to title
        }
        // Also allow Space to return to title for convenience
        if (input.spaceReleased) {
            console.log('[DEBUG] Space released in gameover - returning to title');
            resetToTitle();
        }
    }

    // Update projectile (also update in 'resolving' phase for cluster bomblets)
    if (state.phase === 'firing' || state.phase === 'resolving') {
        // Safety timeout - force turn end if stuck for 30 seconds
        if (state.firingStartTime > 0) {
            const firingDuration = (performance.now() - state.firingStartTime) / 1000;
            if (firingDuration > 30) {
                console.warn('Safety timeout: forcing turn end after', firingDuration.toFixed(1), 'seconds');
                state.projectile = null;
                state.projectiles = [];
                state.strafingRuns = [];
                state.firingStartTime = 0;
                endTurn();
            }
        }

        updateProjectile(dt);

        // === EXTRA SAFETY: Enforce bounds on main projectile ===
        if (state.projectile) {
            enforceProjectileBounds(state.projectile);
        }

        // Update cluster bomblets and strafing bullets
        for (const bomblet of [...state.projectiles]) {
            updateClusterBomblet(bomblet, dt);
            enforceProjectileBounds(bomblet);
        }
    }

    // Update tank physics (falling) for all players
    for (const p of state.players) {
        updateTankPhysics(p);
    }

    // === EXTRA SAFETY: Enforce bounds on ALL players every frame ===
    for (const p of state.players) {
        enforceTankBounds(p);
    }

    // Check win conditions continuously (for void/falling deaths)
    if (state.phase !== 'gameover' && state.phase !== 'archetype_select') {
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

    // Decay event notification timer
    if (state.activeEvent && state.activeEvent.timer > 0) {
        state.activeEvent.timer -= dt;
    }

    // Decay wind shift announcement timer
    if (state.windShiftPending && state.windShiftTimer > 0) {
        state.windShiftTimer -= dt;
        if (state.windShiftTimer <= 0) {
            state.windShiftPending = false;
        }
    }

    // Decay UFO buff notification timer
    if (state.buffNotification && state.buffNotification.timer > 0) {
        state.buffNotification.timer -= dt;
    }

    // Update anomaly projectile (from VOID ANOMALY event)
    if (state.anomalyProjectile) {
        updateAnomalyProjectile(dt);
    }

    // Update fire fields (Napalm)
    updateFields(dt);

    // Update active nukes (fuse countdown)
    updateNukes(dt);

    // Update orbital strike systems
    updateOrbitalBeacons(dt);
    updateStrafingRuns(dt);
    updateDesperationBeacons(dt);

    // Update new weapon systems
    updateBlackHoles(dt);
    updatePendingMeteors(dt);
    updateVoidCannonBeams(dt);
    updateLightningArc(dt);

    // Check if all weapon effects have resolved and we can end the turn
    // This catches cases where endTurn() was called but effects were still pending
    if (state.phase === 'firing' && !hasPendingEffects()) {
        tryEndTurn();
    }

    // Update nuke shockwave effect
    if (state.nukeShockwave) {
        state.nukeShockwave.timer += dt;
        const progress = state.nukeShockwave.timer / state.nukeShockwave.duration;
        state.nukeShockwave.radius = state.nukeShockwave.maxRadius * progress;
        if (state.nukeShockwave.timer >= state.nukeShockwave.duration) {
            state.nukeShockwave = null;
        }
    }

    // Update mushroom cloud effect (rises slowly, fades out)
    if (state.mushroomCloud) {
        state.mushroomCloud.timer += dt;
        // Rise the mushroom cap
        state.mushroomCloud.capY -= state.mushroomCloud.riseSpeed * dt;
        // Expand the cap slightly as it rises
        state.mushroomCloud.radius *= 1 + 0.2 * dt;
        // Check if done
        if (state.mushroomCloud.timer >= state.mushroomCloud.duration) {
            state.mushroomCloud = null;
        }
    }

    // Update railgun beam display
    if (state.railgunBeam) {
        state.railgunBeam.timer -= dt;
        if (state.railgunBeam.timer <= 0) {
            state.railgunBeam = null;
        }
    }

    // Update lightning arc display timer
    if (state.lightningArc) {
        state.lightningArc.timer -= dt;
        if (state.lightningArc.timer <= 0) {
            state.lightningArc = null;
        }
    }

    // Clear input state for next frame
    input.endFrame();
}

/**
 * Update fire fields (Napalm) - tick damage and expire
 */
function updateFields(dt) {
    for (let i = state.fields.length - 1; i >= 0; i--) {
        const field = state.fields[i];

        // Decrement timer
        field.timer -= dt;

        // Remove expired fields or fields consumed by void
        if (field.timer <= 0 || field.y > state.voidY) {
            state.fields.splice(i, 1);
            continue;
        }

        // Spawn fire particles across the burn area (increased for visual polish)
        // Multiple particles per frame to match the wider erosion area
        const particleChance = 0.5;  // Higher spawn rate
        for (let p = 0; p < 3; p++) {  // Up to 3 particles per frame
            if (Math.random() < particleChance) {
                const px = field.x + (Math.random() - 0.5) * field.radius * 2;
                const py = terrain.getHeightAt(px) - Math.random() * 25;
                particles.trail(px, py, Math.random() < 0.5 ? '#ff4400' : '#ffaa00');
            }
        }

        // LINEAR TERRAIN BURN: Slow, even erosion across the entire fire radius
        // 1.5 pixels/second = ~12 pixels total over 8 second duration
        terrain.burn(field.x, field.radius, 1.5 * dt);

        // Update field Y position as terrain burns away (use center height)
        field.y = terrain.getHeightAt(field.x);

        // Deal damage to players standing in the field
        for (let p = 0; p < state.players.length; p++) {
            const player = state.players[p];
            if (player.health <= 0) continue;

            const dist = Math.abs(player.x - field.x);
            if (dist < field.radius) {
                // Apply damage over time (scaled by dt)
                const damage = field.damagePerSec * dt;
                player.health = Math.max(0, player.health - damage);

                // Award coins if damaging enemy
                if (p !== field.firedByPlayer && damage > 0) {
                    state.players[field.firedByPlayer].coins += Math.floor(damage * COINS_PER_DAMAGE);
                }

                // Visual feedback (occasional sparks on player)
                if (Math.random() < 0.1) {
                    particles.sparks(player.x, player.y, 5, '#ff6600');
                }

                // NO knockback - fire just burns, doesn't push

                // Check for kill
                if (player.health <= 0) {
                    if (p !== field.firedByPlayer) {
                        state.players[field.firedByPlayer].coins += KILL_BONUS;
                    }
                    triggerDeathExplosion(player, false);
                    audio.playKill();
                }
            }
        }
    }
}

/**
 * Update active nukes - tick fuse timers and trigger cinematic explosions
 */
function updateNukes(dt) {
    for (let i = state.nukes.length - 1; i >= 0; i--) {
        const nuke = state.nukes[i];

        // Decrement fuse timer
        nuke.fuseTimer -= dt;

        // Pulsing warning effect while counting down
        if (Math.random() < 0.4) {
            const pulseIntensity = 1 - (nuke.fuseTimer / 3);  // Gets stronger as timer decreases
            particles.sparks(
                nuke.x + (Math.random() - 0.5) * 30,
                nuke.y - Math.random() * 20,
                Math.floor(5 + pulseIntensity * 10),
                Math.random() < 0.5 ? '#ffff00' : '#ff8800'
            );
        }

        // Screen shake builds as fuse runs down
        if (nuke.fuseTimer < 1.0 && Math.random() < 0.3) {
            renderer.addScreenShake(3 + (1 - nuke.fuseTimer) * 5);
        }

        // DETONATE when timer reaches zero
        if (nuke.fuseTimer <= 0) {
            triggerCinematicNukeExplosion(nuke);
            state.nukes.splice(i, 1);
        }
    }
}

// ============================================================================
// New Weapon Systems Updates
// ============================================================================

/**
 * Update black holes - pull everything, then collapse and explode
 */
function updateBlackHoles(dt) {
    for (let i = state.blackHoles.length - 1; i >= 0; i--) {
        const hole = state.blackHoles[i];

        // Increment timer
        hole.timer += dt;

        // Pull projectiles toward center
        if (state.projectile) {
            const dx = hole.x - state.projectile.x;
            const dy = hole.y - state.projectile.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < hole.pullRadius && dist > 10) {
                const force = hole.pullStrength * (1 - dist / hole.pullRadius);
                state.projectile.vx += (dx / dist) * force;
                state.projectile.vy += (dy / dist) * force;
            }
        }
        for (const proj of state.projectiles) {
            const dx = hole.x - proj.x;
            const dy = hole.y - proj.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < hole.pullRadius && dist > 10) {
                const force = hole.pullStrength * (1 - dist / hole.pullRadius);
                proj.vx += (dx / dist) * force;
                proj.vy += (dy / dist) * force;
            }
        }

        // Pull tanks if enabled - POWERFUL PULL to drag tanks into explosion
        if (hole.pullsTanks) {
            const tankMult = hole.tankPullMultiplier || 1;
            for (const player of state.players) {
                if (player.health <= 0) continue;
                const dx = hole.x - player.x;
                const dy = hole.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < hole.pullRadius && dist > 20) {
                    // Strong pull that increases as timer progresses
                    const timeScale = 1 + (hole.timer / hole.duration);
                    const force = hole.pullStrength * (1 - dist / hole.pullRadius) * tankMult * timeScale;
                    player.vx += (dx / dist) * force;
                    player.vy += (dy / dist) * force * 0.5;  // Also pull vertically

                    // Visual feedback - tank being pulled
                    if (Math.random() < 0.2) {
                        particles.sparks(player.x, player.y, 5, '#8800ff');
                    }
                }
            }
        }

        // Visual vortex effect
        if (Math.random() < 0.6) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * hole.pullRadius;
            const px = hole.x + Math.cos(angle) * dist;
            const py = hole.y + Math.sin(angle) * dist;
            particles.trail(px, py, Math.random() < 0.5 ? hole.color : '#8800ff');
        }

        // Growing visual
        renderer.addScreenShake(1 + hole.timer * 2);

        // Collapse and explode after duration
        if (hole.timer >= hole.duration) {
            // MASSIVE explosion
            const weapon = WEAPONS.BLACK_HOLE_GRENADE;
            const damage = weapon.damage;
            const blastRadius = weapon.blastRadius;

            particles.explosion(hole.x, hole.y, 150, '#ffffff', blastRadius);
            particles.explosion(hole.x, hole.y, 100, '#8800ff', blastRadius * 0.8);
            particles.sparks(hole.x, hole.y, 80, '#ff00ff');
            renderer.addScreenShake(40);
            renderer.flash('#8800ff', 0.5);
            triggerChromatic(4);  // Strong chromatic on black hole collapse
            audio.playExplosion(1.0);

            // Damage all players in blast
            for (let p = 0; p < state.players.length; p++) {
                const player = state.players[p];
                if (player.health <= 0) continue;
                const dist = distance(hole.x, hole.y, player.x, player.y);
                if (dist < blastRadius) {
                    const falloff = 1 - (dist / blastRadius);
                    const dmg = damage * falloff;
                    player.health = Math.max(0, player.health - dmg);
                    if (dmg > 0) {
                        particles.sparks(player.x, player.y, 20, '#ffffff');
                    }
                    if (player.health <= 0) {
                        if (p !== hole.ownerId) {
                            state.players[hole.ownerId].coins += KILL_BONUS;
                        }
                        triggerDeathExplosion(player, false);
                    }
                }
            }

            // Massive terrain destruction
            terrain.destroy(hole.x, hole.y, blastRadius * 1.5);

            state.blackHoles.splice(i, 1);
        }
    }
}

/**
 * Trigger meteor shower - schedule meteors across the entire map
 */
function triggerMeteorShower(proj) {
    const weapon = WEAPONS.METEOR_SHOWER;
    const count = weapon.meteorCount || 6;
    const baseDelay = weapon.meteorDelay || 0.3;

    // Visual feedback - signal flare explodes
    particles.explosion(proj.x, proj.y, 50, weapon.color, 30);
    renderer.addScreenShake(10);
    audio.playExplosion(0.5);

    // Schedule meteors across entire map
    for (let i = 0; i < count; i++) {
        // Random X across the entire playable width
        const meteorX = WORLD_LEFT + Math.random() * (WORLD_RIGHT - WORLD_LEFT);

        state.pendingMeteors.push({
            x: meteorX,
            delay: 0.5 + i * baseDelay,  // Stagger the meteors
            timer: 0,
            ownerId: proj.firedByPlayer,
            meteorDamage: weapon.meteorDamage || 80,
            blastRadius: weapon.blastRadius || 120
        });
    }

    // Note: Turn will end automatically when all meteors resolve
    // (handled by tryEndTurn in update loop checking hasPendingEffects)
}

/**
 * Update pending meteors - spawn from sky after delay
 */
function updatePendingMeteors(dt) {
    for (let i = state.pendingMeteors.length - 1; i >= 0; i--) {
        const meteor = state.pendingMeteors[i];

        // Increment timer
        meteor.timer += dt;

        // Warning indicator
        if (meteor.timer < meteor.delay) {
            if (Math.random() < 0.3) {
                particles.trail(meteor.x, WORLD_TOP + 50, '#ff6600');
            }
        }

        // Spawn meteor after delay
        if (meteor.timer >= meteor.delay) {
            const weapon = WEAPONS.METEOR_SHOWER;
            state.projectiles.push({
                x: meteor.x,
                y: WORLD_TOP + 20,
                vx: (Math.random() - 0.5) * 3,
                vy: 12 + Math.random() * 5,  // Fast falling
                radius: 14,  // Larger visual for meteors
                color: weapon.color,
                bounces: 0,
                maxBounces: 1,  // FIX: Set to 1 so meteors don't explode immediately
                trail: [],
                weaponKey: null,  // CRITICAL: Prevent recursion - meteors don't trigger behaviors
                isCluster: true,
                isFragment: true,
                fragmentDamage: meteor.meteorDamage || weapon.meteorDamage || 80,
                fragmentBlastRadius: meteor.blastRadius || weapon.blastRadius || 120,
                firedByPlayer: meteor.ownerId,
                buffedDamageMultiplier: 1,
                buffedBlastBonus: 0,
                isMeteor: true  // Visual flag for rendering
            });

            // Meteor entry effect
            particles.sparks(meteor.x, WORLD_TOP + 20, 30, '#ff6600');
            particles.explosion(meteor.x, WORLD_TOP + 20, 15, '#ffaa00', 20);
            state.pendingMeteors.splice(i, 1);
        }
    }
}

/**
 * Update void cannon beams - fire after delay, pull tanks during warning, cut to void
 */
function updateVoidCannonBeams(dt) {
    for (let i = state.voidCannonBeams.length - 1; i >= 0; i--) {
        const beam = state.voidCannonBeams[i];

        // Increment timer
        beam.timer += dt;

        const weapon = WEAPONS.VOID_CANNON;
        const beamWidth = weapon.beamWidth || 60;
        const pullRadius = weapon.pullRadius || 120;
        const pullStrength = weapon.pullStrength || 0.5;

        // Warning indicator (targeting laser from sky) + PULL EFFECT
        if (beam.timer < beam.delay) {
            // Pulsing target circle
            if (Math.random() < 0.5) {
                particles.trail(beam.x + (Math.random() - 0.5) * 20, beam.y, beam.color);
            }
            // Warning line from sky
            if (Math.random() < 0.2) {
                for (let py = WORLD_TOP; py < beam.y; py += 50) {
                    particles.trail(beam.x, py, beam.color);
                }
            }

            // Pull tanks toward beam during warning (black hole effect)
            if (weapon.hasPullEffect) {
                const pullProgress = beam.timer / beam.delay;  // Gets stronger as beam charges
                for (const player of state.players) {
                    if (player.health <= 0) continue;
                    const dx = beam.x - player.x;
                    const dy = beam.y - player.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < pullRadius + beamWidth && dist > 10) {
                        const force = pullStrength * (1 - dist / (pullRadius + beamWidth)) * (0.3 + pullProgress * 0.7);
                        player.vx += (dx / dist) * force;
                        player.vy += (dy / dist) * force * 0.3;

                        // Visual feedback
                        if (Math.random() < 0.15) {
                            particles.sparks(player.x, player.y, 3, beam.color);
                        }
                    }
                }
            }
        }

        // Fire beam after delay
        if (beam.timer >= beam.delay) {
            const damage = weapon.damage;
            const blastRadius = weapon.blastRadius;

            // Massive vertical beam effect - full column to void
            particles.explosion(beam.x, beam.y, 100, '#ffffff', blastRadius);
            particles.explosion(beam.x, beam.y, 80, beam.color, blastRadius * 0.8);
            for (let py = WORLD_TOP; py < state.voidY; py += 40) {
                particles.sparks(beam.x, py, 15, beam.color);
                particles.sparks(beam.x, py, 10, '#ffffff');
            }
            renderer.addScreenShake(45);
            renderer.flash(beam.color, 0.5);
            renderer.flash('#ffffff', 0.3);
            audio.playExplosion(1.2);

            // Damage players in vertical column and blast radius
            for (let p = 0; p < state.players.length; p++) {
                const player = state.players[p];
                if (player.health <= 0) continue;

                // Check if in beam column - full height
                const inColumn = Math.abs(player.x - beam.x) < beamWidth / 2;
                const dist = distance(beam.x, beam.y, player.x, player.y);
                const inBlast = dist < blastRadius;

                if (inColumn || inBlast) {
                    const falloff = inColumn ? 1 : (1 - dist / blastRadius);
                    const dmg = damage * falloff;
                    player.health = Math.max(0, player.health - dmg);
                    if (dmg > 0) {
                        particles.sparks(player.x, player.y, 25, '#ffffff');
                    }
                    if (player.health <= 0) {
                        if (p !== beam.ownerId) {
                            state.players[beam.ownerId].coins += KILL_BONUS;
                        }
                        triggerDeathExplosion(player, false);
                    }
                }
            }

            // TERRAIN DESTRUCTION - cuts ALL the way to the void
            if (weapon.cutsToVoid) {
                // Carve a vertical column straight down to the void
                terrain.carveToVoid(beam.x, beamWidth, state.voidY);
            } else {
                terrain.destroy(beam.x, beam.y, blastRadius);
                terrain.digJagged(beam.x, beam.y - 100, beamWidth, state.voidY);
            }

            state.voidCannonBeams.splice(i, 1);
            tryEndTurn();  // Let tryEndTurn check for other pending effects
        }
    }
}

/**
 * Update lightning arc effect (decay timer)
 */
function updateLightningArc(dt) {
    if (state.lightningArc) {
        state.lightningArc.timer -= dt;
        if (state.lightningArc.timer <= 0) {
            state.lightningArc = null;
        }
    }
}

// ============================================================================
// Orbital Strike System Updates
// ============================================================================

/**
 * Update orbital beacons - targeting sequence then devastating beam
 */
function updateOrbitalBeacons(dt) {
    const ambient = getAmbient();

    for (let i = state.orbitalBeacons.length - 1; i >= 0; i--) {
        const beacon = state.orbitalBeacons[i];
        beacon.timer += dt;

        if (beacon.phase === 'landed' && beacon.timer > 0.5) {
            // Transition to targeting phase
            beacon.phase = 'targeting';
            beacon.timer = 0;
            // Find nearest capital ship if not already found
            if (!beacon.targetingShip && ambient) {
                beacon.targetingShip = ambient.findNearestCapitalShip(beacon.x);
            }
        }

        if (beacon.phase === 'targeting') {
            // Pulsing beacon effect
            if (Math.random() < 0.5) {
                particles.sparks(beacon.x, beacon.y, 3, '#ff6600');
            }

            // After 2 seconds, fire the beam
            if (beacon.timer > 2.0) {
                beacon.phase = 'firing';
                beacon.timer = 0;
                // Sync space battle to orbital strike
                if (ambient && ambient.triggerOrbitalSync) {
                    ambient.triggerOrbitalSync();
                }
            }
        }

        if (beacon.phase === 'firing') {
            // Deal damage on first frame
            if (beacon.timer < dt * 2) {
                const weapon = WEAPONS[beacon.weaponKey];
                const damage = weapon ? weapon.damage : 75;
                const blastRadius = weapon ? weapon.blastRadius : 150;
                const edgeDamage = weapon ? weapon.edgeDamage : 50;

                // Destroy terrain
                terrain.destroy(beacon.x, beacon.y, blastRadius * 0.8);

                // Deal damage to all players
                for (const player of state.players) {
                    if (player.health <= 0) continue;
                    const dist = distance(beacon.x, beacon.y, player.x, player.y);
                    if (dist < blastRadius) {
                        const falloff = 1 - (dist / blastRadius);
                        const dmg = edgeDamage + (damage - edgeDamage) * falloff;
                        player.health = Math.max(0, player.health - dmg);
                        particles.sparks(player.x, player.y, 30, '#ffffff');
                        if (player.health <= 0) {
                            triggerDeathExplosion(player, false);
                        }
                    }
                }

                // Massive visual effects
                renderer.addScreenShake(50);
                renderer.flash('#ffffff', 0.9);
                audio.playOrbitalBeam ? audio.playOrbitalBeam() : audio.playExplosion(4.0);
                particles.explosion(beacon.x, beacon.y, 200, '#ffffff', blastRadius);
                particles.explosion(beacon.x, beacon.y, 150, '#ff6600', blastRadius * 0.7);
                particles.sparks(beacon.x, beacon.y, 100, '#ffcc00');
            }

            // Beam lasts 0.8 seconds
            if (beacon.timer > 0.8) {
                beacon.phase = 'done';
            }
        }

        if (beacon.phase === 'done') {
            state.orbitalBeacons.splice(i, 1);
        }
    }
}

/**
 * Update strafing runs - warning phase then fighter strafe
 */
function updateStrafingRuns(dt) {
    for (let i = state.strafingRuns.length - 1; i >= 0; i--) {
        const run = state.strafingRuns[i];
        run.timer += dt;

        if (run.phase === 'warning') {
            // Warning indicator pulsing
            if (Math.random() < 0.3) {
                const offsetX = (Math.random() - 0.5) * run.coverageWidth;
                particles.sparks(run.targetX + offsetX, VIRTUAL_HEIGHT * 0.15, 2, '#ff4444');
            }

            // After 1.5 seconds, start strafing
            if (run.timer > 1.5) {
                run.phase = 'strafing';
                run.timer = 0;
                audio.playExplosion(1.0);  // Fighter engines approaching
            }
        }

        if (run.phase === 'strafing') {
            const weapon = WEAPONS[run.weaponKey];
            const bulletsPerFighter = weapon ? weapon.bulletsPerFighter : 5;
            const damagePerBullet = weapon ? weapon.damagePerBullet : 10;
            const fighterSpeed = 800;  // pixels per second
            const halfWidth = run.coverageWidth / 2;

            // Move fighters across the screen
            let allDone = true;
            for (const fighter of run.fighters) {
                fighter.x += run.direction * fighterSpeed * dt;

                // Check if fighter is in strafe zone
                const inZone = Math.abs(fighter.x - run.targetX) < halfWidth;

                // Fire bullets as fighter crosses zone
                if (inZone && fighter.shotsFired < bulletsPerFighter) {
                    const fireRate = bulletsPerFighter / (run.coverageWidth / fighterSpeed);
                    if (Math.random() < fireRate * dt) {
                        fighter.shotsFired++;
                        // Create strafe bullet projectile - BUFFED: 3x blast radius, 2x damage
                        const bulletX = fighter.x + (Math.random() - 0.5) * 40;
                        const bulletY = fighter.y;
                        const bulletBlastRadius = weapon.bulletBlastRadius || 75; // 3x bigger (was 25)
                        state.projectiles.push({
                            x: bulletX,
                            y: bulletY,
                            vx: (Math.random() - 0.5) * 3,
                            vy: 12,  // Fast downward (frame-based physics)
                            radius: 6,  // Bigger bullets
                            color: '#ffaa00',  // Orange-yellow
                            damage: damagePerBullet,
                            blastRadius: bulletBlastRadius,
                            maxBounces: 99,  // High so bounce limit doesn't trigger - explodes on terrain/void
                            bounces: 0,
                            trail: [],
                            firedByPlayer: run.firedByPlayer,
                            isStrafeBullet: true,
                            isCluster: true,  // Process like cluster bombs for proper explosion
                            weaponKey: 'STRAFING_RUN',
                            createdAt: performance.now(),  // For lifetime tracking
                            maxLifetime: 5000  // 5 second max lifetime
                        });
                        particles.sparks(bulletX, bulletY, 8, '#ffaa00');  // More sparks
                        audio.playFire();  // Gunfire sound
                    }
                }

                // Check if fighter has crossed the entire screen
                if (run.direction === 1 && fighter.x < VIRTUAL_WIDTH + 200) allDone = false;
                if (run.direction === -1 && fighter.x > -200) allDone = false;
            }

            if (allDone) {
                run.phase = 'done';
            }
        }

        if (run.phase === 'done') {
            // Check if all strafing bullets have resolved
            const strafeBullets = state.projectiles.filter(p => p.isStrafeBullet);
            if (strafeBullets.length === 0) {
                state.strafingRuns.splice(i, 1);
                // Let tryEndTurn check for other pending effects
                if (run.pendingTurnEnd) {
                    tryEndTurn();
                }
            }
            // If bullets still flying, wait for them
        }
    }
}

/**
 * Update desperation beacons - falling from critical ships
 */
function updateDesperationBeacons(dt) {
    for (let i = state.desperationBeacons.length - 1; i >= 0; i--) {
        const beacon = state.desperationBeacons[i];

        if (!beacon.landed) {
            // Apply gravity
            beacon.vy += state.gravity * 60 * dt;
            beacon.y += beacon.vy * dt;

            // Check for terrain collision
            if (terrain.isPointBelowTerrain(beacon.x, beacon.y)) {
                beacon.landed = true;
                beacon.y = terrain.getHeightAt(beacon.x) - 10;
                beacon.vy = 0;
                beacon.timer = 0;
                particles.sparks(beacon.x, beacon.y, 30, '#ffcc00');
                audio.playBounce();
            }

            // Check for void
            if (beacon.y > state.voidY) {
                state.desperationBeacons.splice(i, 1);
                continue;
            }
        } else {
            // Countdown timer while landed
            beacon.timer += dt;

            // Pulsing effect
            if (Math.random() < 0.4) {
                const pulse = Math.sin(state.time * 10) * 0.5 + 0.5;
                particles.sparks(beacon.x, beacon.y - 5, 2 + pulse * 3, '#ffcc00');
            }

            // Expire after maxTime
            if (beacon.timer >= beacon.maxTime) {
                particles.explosion(beacon.x, beacon.y, 30, '#ffcc00', 40);
                state.desperationBeacons.splice(i, 1);
                continue;
            }
        }

        // Check for projectile collision to claim beacon (can claim while falling OR landed)
        if (!beacon.claimed) {
            const claimRadius = 50;  // Generous hitbox for claiming

            // Check main projectile
            if (state.projectile) {
                const proj = state.projectile;
                const dist = distance(proj.x, proj.y, beacon.x, beacon.y);
                if (dist < claimRadius) {
                    claimDesperationBeacon(beacon, proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer);
                }
            }

            // Check cluster projectiles
            for (const proj of state.projectiles) {
                const dist = distance(proj.x, proj.y, beacon.x, beacon.y);
                if (dist < claimRadius) {
                    claimDesperationBeacon(beacon, proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer);
                    break;
                }
            }
        }
    }
}

/**
 * Check if an explosion hits any desperation beacon and claims it
 * Called from explosion/damage dealing code
 */
function checkExplosionClaimsBeacon(x, y, blastRadius, playerIndex) {
    for (const beacon of state.desperationBeacons) {
        if (beacon.claimed) continue;

        const dist = distance(x, y, beacon.x, beacon.y);
        if (dist < blastRadius + 30) {  // Explosion radius + beacon size
            claimDesperationBeacon(beacon, playerIndex);
            break;  // Only claim one beacon per explosion
        }
    }
}

/**
 * Grant Dying Light weapon to a player who claimed a desperation beacon
 */
function claimDesperationBeacon(beacon, playerIndex) {
    if (beacon.claimed) return;

    beacon.claimed = true;
    beacon.claimedBy = playerIndex;

    const player = state.players[playerIndex];
    if (!player || player.health <= 0) return;

    // Store current weapon and grant Dying Light
    state.storedWeapons[playerIndex] = player.weapon;
    player.weapon = 'DYING_STAR';
    state.dyingStarTurns[playerIndex] = 3;

    // Visual and audio feedback
    renderer.flash('#ffcc00', 0.5);
    audio.playPurchase();
    particles.explosion(beacon.x, beacon.y, 100, '#ffcc00', 80);
    particles.sparks(beacon.x, beacon.y, 60, '#ffffff');

    // Show notification (include beacon position for floating text)
    state.buffNotification = {
        playerIndex: playerIndex,
        buffType: 'DYING_STAR',
        timer: 2.5,
        x: beacon.x * WORLD_SCALE,  // Convert to screen coordinates
        y: beacon.y * WORLD_SCALE
    };

    // Remove the beacon
    const idx = state.desperationBeacons.indexOf(beacon);
    if (idx !== -1) {
        state.desperationBeacons.splice(idx, 1);
    }
}

/**
 * Drop a desperation beacon from a critically damaged capital ship
 */
function dropDesperationBeacon(shipX, shipY) {
    // Convert from ambient sky coordinates to game world coordinates
    // Beacon starts falling from where the ship is
    state.desperationBeacons.push({
        x: shipX,
        y: shipY,
        vy: 0,
        landed: false,
        timer: 0,
        maxTime: 15,
        claimed: false,
        claimedBy: -1
    });

    // Visual effect
    particles.sparks(shipX, shipY, 40, '#ffcc00');
    particles.sparks(shipX, shipY, 30, '#ff6600');
}

/**
 * Spawn a guaranteed desperation beacon at a random position (for rounds 2-4)
 */
function spawnGuaranteedDesperationBeacon() {
    // Spawn at random X position, falling from top of screen
    const spawnX = VIRTUAL_WIDTH * 0.2 + Math.random() * VIRTUAL_WIDTH * 0.6;  // Middle 60% of screen
    const spawnY = 50;  // Start near top

    state.desperationBeacons.push({
        x: spawnX,
        y: spawnY,
        vy: 0,
        landed: false,
        timer: 0,
        maxTime: 20,  // Longer time for guaranteed beacons
        claimed: false,
        claimedBy: -1
    });

    // Visual and audio announcement
    particles.sparks(spawnX, spawnY, 60, '#ffcc00');
    particles.sparks(spawnX, spawnY, 40, '#ff6600');
    renderer.flash('#ffcc00', 0.3);
    audio.playGlitch();
}

/**
 * Trigger a cinematic multi-stage nuke explosion - THE BIG ONE
 */
function triggerCinematicNukeExplosion(nuke) {
    const weapon = WEAPONS[nuke.weaponKey];
    if (!weapon) return;

    // Apply buffs to blast radius and damage
    const blastBonus = nuke.buffedBlastBonus || 0;
    const effectiveBlastRadius = weapon.blastRadius + blastBonus;
    const damageMultiplier = nuke.buffedDamageMultiplier || 1;
    const effectiveDamage = weapon.damage * damageMultiplier;

    // === STAGE 1: BLINDING WHITE FLASH ===
    renderer.flash('#ffffff', 1.0);  // FULL white flash
    renderer.addScreenShake(80);     // Massive shake
    audio.playExplosion(4.0);        // VERY loud boom

    // Sync space battle to nuke - CHAOS IN THE SKY
    const ambient = getAmbient();
    if (ambient) {
        ambient.triggerNukeSync(nuke.x);
        triggerChromatic(4);  // Strong chromatic on nuke
    }

    // Huge white core - the initial detonation point
    particles.explosion(nuke.x, nuke.y, 300, '#ffffff', effectiveBlastRadius * 0.4);
    particles.sparks(nuke.x, nuke.y, 100, '#ffffff');

    // === STAGE 2: EXPANDING FIREBALL (multiple layers) ===
    // Inner white-hot core
    particles.explosion(nuke.x, nuke.y, 250, '#ffffaa', effectiveBlastRadius * 0.5);
    // Yellow ring
    particles.explosion(nuke.x, nuke.y, 350, '#ffff00', effectiveBlastRadius * 0.7);
    // Orange ring
    particles.explosion(nuke.x, nuke.y, 300, '#ffaa00', effectiveBlastRadius * 0.85);
    // Red outer ring
    particles.explosion(nuke.x, nuke.y, 200, '#ff4400', effectiveBlastRadius);
    // Dark smoke outer edge
    particles.explosion(nuke.x, nuke.y, 150, '#ff2200', effectiveBlastRadius * 1.1);

    // === STAGE 3: MASSIVE SHOCKWAVE ===
    state.nukeShockwave = {
        x: nuke.x,
        y: nuke.y,
        radius: 0,
        maxRadius: effectiveBlastRadius * 2.5,  // Even bigger shockwave
        timer: 0,
        duration: 1.5  // Slower, more dramatic expansion
    };

    // === STAGE 3.5: MUSHROOM CLOUD ===
    // Create lingering mushroom cloud effect
    state.mushroomCloud = {
        x: nuke.x,
        y: nuke.y,
        timer: 0,
        duration: weapon.mushroomCloudDuration || 2.0,
        radius: effectiveBlastRadius * 0.6,
        stemWidth: effectiveBlastRadius * 0.3,
        riseSpeed: 80,
        capY: nuke.y  // Will rise over time
    };

    // === STAGE 4: RADIAL SECONDARY EXPLOSIONS ===
    // Multiple rings of secondary blasts
    for (let ring = 0; ring < 3; ring++) {
        const ringDelay = ring * 80;
        const ringDist = effectiveBlastRadius * (0.3 + ring * 0.25);
        const burstCount = 6 + ring * 2;

        setTimeout(() => {
            for (let burst = 0; burst < burstCount; burst++) {
                const angle = (burst / burstCount) * Math.PI * 2 + ring * 0.3;
                const bx = nuke.x + Math.cos(angle) * ringDist;
                const by = nuke.y + Math.sin(angle) * ringDist;
                particles.explosion(bx, by, 60, '#ff6600', effectiveBlastRadius * 0.25);
                particles.sparks(bx, by, 40, '#ffff00');
            }
            renderer.addScreenShake(30 - ring * 8);
            audio.playExplosion(2.0 - ring * 0.5);
        }, ringDelay);
    }

    // === STAGE 5: DEBRIS FOUNTAIN ===
    // Upward debris spray
    for (let i = 0; i < 50; i++) {
        const angle = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.8;
        const speed = 5 + Math.random() * 10;
        particles.sparks(
            nuke.x + (Math.random() - 0.5) * 40,
            nuke.y,
            3,
            Math.random() < 0.3 ? '#ffffff' : (Math.random() < 0.5 ? '#ffff00' : '#ff8800')
        );
    }

    // === DAMAGE CALCULATION ===
    const firingPlayer = state.players[nuke.firedByPlayer];
    let totalEnemyDamage = 0;

    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        if (player.health <= 0) continue;

        const dist = distance(nuke.x, nuke.y, player.x, player.y);
        if (dist < effectiveBlastRadius) {
            // Nuke has LESS falloff - devastating even at edge
            const falloff = 0.4 + 0.6 * (1 - dist / effectiveBlastRadius);
            let damage = effectiveDamage * falloff;

            // Apply shield reduction if player has one
            if (player.shield) {
                damage *= (1 - player.shield);
            }

            player.health = Math.max(0, player.health - damage);

            // Track enemy damage for coins
            if (i !== nuke.firedByPlayer) {
                totalEnemyDamage += damage;
            }

            // INTENSE visual feedback on hit players
            particles.explosion(player.x, player.y, 60, '#ffffff', 30);
            particles.sparks(player.x, player.y, 80, '#ffff00');
            particles.sparks(player.x, player.y, 50, '#ffffff');

            // Check for kill
            if (player.health <= 0) {
                if (i !== nuke.firedByPlayer && firingPlayer) {
                    firingPlayer.coins += KILL_BONUS;
                }
                triggerDeathExplosion(player, false);
                audio.playKill();
            }
        }
    }

    // Award coins for damage
    if (totalEnemyDamage > 0 && firingPlayer) {
        firingPlayer.coins += Math.floor(totalEnemyDamage * COINS_PER_DAMAGE);
    }

    // === TERRAIN DESTRUCTION ===
    terrain.destroy(nuke.x, nuke.y, effectiveBlastRadius);

    // === MASSIVE BLAST KNOCKBACK ===
    // Nuke has much stronger knockback than regular explosions
    const knockbackForce = effectiveBlastRadius * 0.15;  // Nearly double normal force
    applyBlastKnockback(nuke.x, nuke.y, effectiveBlastRadius * 1.5, knockbackForce, nuke.firedByPlayer);

    // === EXTENDED LINGERING EFFECTS ===
    // Longer slow-mo for dramatic effect
    state.slowMoUntil = performance.now() + 800;

    // Multiple delayed aftershocks
    setTimeout(() => {
        renderer.flash('#ffaa00', 0.6);
        renderer.addScreenShake(50);
        particles.explosion(nuke.x, nuke.y, 100, '#ff4400', effectiveBlastRadius * 0.5);
    }, 200);

    setTimeout(() => {
        renderer.flash('#ff6600', 0.4);
        renderer.addScreenShake(35);
        audio.playExplosion(2.5);
    }, 400);

    setTimeout(() => {
        renderer.addScreenShake(25);
        audio.playExplosion(1.8);
    }, 600);

    setTimeout(() => {
        renderer.addScreenShake(15);
        audio.playExplosion(1.2);
    }, 800);

    // Final rumble
    setTimeout(() => {
        renderer.addScreenShake(10);
    }, 1000);

    // End turn after all nuke effects complete
    setTimeout(() => {
        if (state.nukes.length === 0 && state.phase === 'firing') {
            tryEndTurn();  // Let tryEndTurn check for other pending effects
        }
    }, 1200);
}

function updateClusterBomblet(proj, dt) {
    // Safety: check lifetime for strafing bullets that might get stuck
    if (proj.createdAt && proj.maxLifetime) {
        const age = performance.now() - proj.createdAt;
        if (age > proj.maxLifetime) {
            onExplode(proj);  // Force explosion
            return;
        }
    }

    // Store trail position
    proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
    if (proj.trail.length > 10) proj.trail.shift();

    // Apply gravity
    proj.vy += state.gravity;

    // Apply wind (WIND BLAST event)
    if (state.wind !== 0) {
        proj.vx += state.wind;
    }

    // Apply black hole pull
    for (const hole of state.blackHoles) {
        const dx = hole.x - proj.x;
        const dy = hole.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hole.pullRadius && dist > 10) {
            const force = hole.pullStrength * (1 - dist / hole.pullRadius);
            proj.vx += (dx / dist) * force;
            proj.vy += (dy / dist) * force;
        }
    }

    // Apply homing for proximity-split fragments
    if (proj.isHomingFragment && proj.homingTarget && proj.homingTarget.health > 0) {
        const target = proj.homingTarget;
        const dx = target.x - proj.x;
        const dy = target.y - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const strength = proj.homingStrength || 0.08;
            proj.vx += (dx / dist) * strength;
            proj.vy += (dy / dist) * strength;
            // Trail effect
            if (Math.random() < 0.5) {
                particles.trail(proj.x, proj.y, '#aa00ff');
            }
        }
    }

    // Move first
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Wall bounces - INFINITE ricochets (don't count toward maxBounces)
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        // Don't increment proj.bounces - wall bounces are free
        particles.sparks(proj.x, proj.y, 8, proj.color);
        audio.playBounce();
    }

    // NO ceiling bounce - projectiles can arc high and fall back down
    // (Removed ceiling bounce to allow skillful high-arc shots)

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

    // Trail particles
    if (Math.random() < 0.2) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // SPLITTER chain-split behavior (for fragments in projectiles array)
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (weapon && weapon.behavior === 'splitterAirburst') {
        const splitLevel = proj.splitLevel || 0;
        const maxLevel = weapon.maxSplitLevel || 4;

        // Only split if we haven't reached max depth
        if (splitLevel < maxLevel) {
            proj.airburstTimer = (proj.airburstTimer || 0) + dt;

            // Subsequent splits use faster delay
            const delay = weapon.subsequentDelay || 0.3;

            if (proj.airburstTimer >= delay) {
                const fragmentCount = weapon.subsequentSplitCount || 2;
                const isFinalLevel = (splitLevel + 1) >= maxLevel;
                spawnAirburstFragments(proj, fragmentCount, isFinalLevel, splitLevel + 1);

                // Remove this fragment
                const idx = state.projectiles.indexOf(proj);
                if (idx >= 0) state.projectiles.splice(idx, 1);

                // Check if all projectiles are done
                if (state.projectiles.length === 0 && !state.projectile) {
                    tryEndTurn();  // Check for other pending effects
                }
                return;
            }
        }
    }

    // Check termination
    // FIX: Only check bounce limit if maxBounces > 0 (prevents meteors with maxBounces=0 from instant exploding)
    const hitBounceLimitCheck = proj.maxBounces > 0 && proj.bounces >= proj.maxBounces;
    if (terrain.isPointBelowTerrain(proj.x, proj.y) ||
        proj.y > state.voidY ||
        proj.y > VIRTUAL_HEIGHT + 100 ||
        hitBounceLimitCheck) {
        onExplode(proj);
    }
}

function updateAnomalyProjectile(dt) {
    const proj = state.anomalyProjectile;
    if (!proj) return;

    // Store trail position
    proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
    if (proj.trail.length > 15) proj.trail.shift();

    // Age trail
    for (const point of proj.trail) {
        point.age += dt;
    }

    // Apply gravity
    proj.vy += state.gravity;

    // Apply wind (WIND BLAST event)
    if (state.wind !== 0) {
        proj.vx += state.wind;
    }

    // Move first
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Wall bounces - INFINITE ricochets (don't count toward maxBounces)
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        // Wall bounces don't call onAnomalyBounce() - direct effects only
        particles.sparks(proj.x, proj.y, 20, '#8800ff');
        renderer.addScreenShake(5);
        audio.playBounce();
    }

    // NO ceiling bounce - projectiles can arc high and fall back down

    // Spawn trail particles (purple for anomaly)
    if (Math.random() < 0.4) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Check termination: terrain, void, or out of bounds
    if (terrain.isPointBelowTerrain(proj.x, proj.y) ||
        proj.y > state.voidY ||
        proj.y > VIRTUAL_HEIGHT + 100) {
        onAnomalyExplode(proj);
    }
}

function onAnomalyBounce(proj) {
    proj.bounces++;
    // Enhanced anomaly bounce - eerie purple sparks
    particles.sparks(proj.x, proj.y, 20, '#8800ff');
    renderer.addScreenShake(7);
    renderer.flash('#8800ff', 0.06);
    audio.playBounce();

    // Destroy if out of bounces
    if (proj.bounces >= proj.maxBounces) {
        onAnomalyExplode(proj);
    }
}

function onAnomalyExplode(proj) {
    // === CLAMP EXPLOSION POSITION TO VALID BOUNDS ===
    proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
    proj.y = Math.max(WORLD_TOP, Math.min(VIRTUAL_HEIGHT, proj.y));

    const tankType = TANK_TYPES.SIEGE;  // Uses SIEGE explosion stats

    // ENHANCED Visual effects - anomaly has eerie purple explosion
    particles.explosion(proj.x, proj.y, 80, proj.color, tankType.blastRadius);
    renderer.addScreenShake(25);
    renderer.flash(proj.color, 0.35);

    // Destroy terrain
    terrain.destroy(proj.x, proj.y, tankType.blastRadius);

    // Apply knockback (anomaly affects everyone)
    applyBlastKnockback(proj.x, proj.y, tankType.blastRadius * 1.2, tankType.blastRadius * 0.1, -1);

    // Apply damage to ALL players (neutral projectile)
    let hitOccurred = false;
    for (const player of state.players) {
        const dist = distance(proj.x, proj.y, player.x, player.y);
        if (dist < tankType.blastRadius) {
            const damage = Math.max(0, tankType.damage * (1 - dist / tankType.blastRadius));
            if (damage > 0) {
                hitOccurred = true;
                state.lastHitPos = { x: proj.x, y: proj.y };
                // Extra sparks at player position
                particles.sparks(player.x, player.y, 25, proj.color);
                renderer.addScreenShake(15);
            }
            player.health = Math.max(0, player.health - damage);
        }
    }

    if (hitOccurred) {
        renderer.flash(COLORS.white, 0.25);
    }

    audio.playExplosion(1.0);

    // Clear the anomaly projectile
    state.anomalyProjectile = null;
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

    // Tank selection screen
    if (state.phase === 'archetype_select') {
        renderTankSelect();
        renderer.endFrame();
        return;
    }

    // Lottery phase
    if (state.phase === 'lottery') {
        renderLottery();
        renderer.endFrame();
        return;
    }

    // ========================================================================
    // WORLD RENDERING (scaled to fit virtual world in canvas)
    // ========================================================================
    const ctx = renderer.ctx;
    ctx.save();

    // Apply 0.5x world scale to fit 3840x1800 virtual world into 1920x900 canvas
    ctx.scale(WORLD_SCALE, WORLD_SCALE);

    // Biome color filter disabled for performance
    // The terrain/edge colors already provide biome theming
    // Uncomment if needed: ctx.filter = `hue-rotate(${state.currentBiome?.hue || 0}deg)`;


    // Apply camera zoom (punch-in effect on hits) - works in virtual coordinates
    if (state.cameraZoom > 0) {
        const zoomScale = 1 + state.cameraZoom;
        // Zoom toward the hit position or center of virtual world
        const focusX = state.lastHitPos ? state.lastHitPos.x : VIRTUAL_WIDTH / 2;
        const focusY = state.lastHitPos ? state.lastHitPos.y : VIRTUAL_HEIGHT / 2;

        ctx.save();
        ctx.translate(focusX, focusY);
        ctx.scale(zoomScale, zoomScale);
        ctx.translate(-focusX, -focusY);
    }

    // Background grid (larger spacing for virtual world)
    renderer.drawGrid(100, '#0a0a15');

    // Draw ambient background (far clouds, dust particles)
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
    }

    // Draw terrain
    terrain.draw(renderer, state.voidY);

    // Draw terrain props (trees, buildings, pylons, rocks)
    terrain.drawProps(renderer);

    // === DRAW VISIBLE WORLD BOUNDARIES (bright for debugging) ===
    ctx.strokeStyle = '#ffff00';  // Bright yellow - very visible
    ctx.lineWidth = 6;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ffff00';
    // Left wall
    ctx.beginPath();
    ctx.moveTo(WORLD_LEFT, WORLD_TOP);
    ctx.lineTo(WORLD_LEFT, WORLD_BOTTOM);
    ctx.stroke();
    // Right wall
    ctx.beginPath();
    ctx.moveTo(WORLD_RIGHT, WORLD_TOP);
    ctx.lineTo(WORLD_RIGHT, WORLD_BOTTOM);
    ctx.stroke();
    // NO ceiling line - projectiles can arc above the screen
    // (Removed ceiling boundary for skillful high-arc shots)
    // Clear glow
    ctx.shadowBlur = 0;

    // Draw ambient midground (near clouds - after terrain for depth)
    if (ambient) {
        ambient.drawMidground(renderer);
    }

    // Draw void
    renderer.drawVoid(state.voidY);

    // Draw fire fields (Napalm)
    for (const field of state.fields) {
        drawFireField(field);
    }

    // Draw active nukes (with countdown)
    for (const nuke of state.nukes) {
        drawNuke(nuke);
    }

    // Draw orbital strike systems
    renderOrbitalBeacons();
    renderStrafingRuns();
    renderDesperationBeacons();

    // Draw new weapon systems
    renderBlackHoles();
    renderLightningArc();
    renderVoidCannonWarnings();
    renderMeteorWarnings();

    // Draw nuke shockwave
    if (state.nukeShockwave) {
        drawNukeShockwave(state.nukeShockwave);
    }

    // Draw mushroom cloud
    if (state.mushroomCloud) {
        drawMushroomCloud(state.mushroomCloud);
    }

    // Draw railgun beam
    if (state.railgunBeam) {
        drawRailgunBeam(state.railgunBeam);
    }

    // Draw all tanks (skip dead tanks - they're gone!)
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];

        // SKIP DEAD TANKS - they exploded and are gone
        if (player.health <= 0) continue;

        const isActive = i === state.currentPlayer && state.phase === 'aiming';

        // Get archetype visuals (fallback to defaults)
        const archetype = player.archetype ? TANK_ARCHETYPES[player.archetype] : null;
        const shape = archetype ? archetype.chassisShape : 6;
        const tankColor = archetype ? archetype.palette.base : player.color;
        const turretLen = archetype ? archetype.turretLength : 40;
        const turretWid = archetype ? archetype.turretWidth : 6;

        // Tank body (shape based on archetype)
        renderer.drawRegularPolygon(player.x, player.y, TANK_RADIUS, shape, 0, tankColor, true);

        // Shield indicator (glowing ring around tank when shielded)
        if (player.shield > 0) {
            const shieldRadius = TANK_RADIUS + 10;
            const ctx = renderer.ctx;
            ctx.save();
            // Pulsing glow effect
            const pulse = 0.7 + Math.sin(state.time * 6) * 0.3;
            renderer.setGlow(COLORS.cyan, 15 * pulse);
            ctx.globalAlpha = 0.6 * pulse;
            ctx.beginPath();
            ctx.arc(player.x, player.y, shieldRadius, 0, Math.PI * 2);
            ctx.strokeStyle = COLORS.cyan;
            ctx.lineWidth = 3;
            ctx.stroke();
            // Inner ring
            ctx.globalAlpha = 0.3 * pulse;
            ctx.beginPath();
            ctx.arc(player.x, player.y, shieldRadius - 4, 0, Math.PI * 2);
            ctx.stroke();
            renderer.clearGlow();
            ctx.restore();
        }

        // Turret (uses archetype-specific length and width)
        const turretLength = turretLen;
        const angleRad = degToRad(180 - player.angle);
        const turretX = player.x + Math.cos(angleRad) * turretLength;
        const turretY = player.y - 20 - Math.sin(angleRad) * turretLength;
        renderer.drawLine(player.x, player.y - 20, turretX, turretY, tankColor, turretWid, true);

        // Power meter (only for active player when charging)
        if (isActive && (player.charging || player.power > 0)) {
            const meterWidth = 60;
            const meterHeight = 8;
            const meterX = player.x - meterWidth / 2;
            const meterY = player.y - 60;

            renderer.drawRectOutline(meterX, meterY, meterWidth, meterHeight, '#333333', 1, false);
            const fillColor = player.power > 0.8 ? COLORS.orange : COLORS.yellow;
            renderer.drawRect(meterX + 1, meterY + 1, (meterWidth - 2) * player.power, meterHeight - 2, fillColor, true);

            // Debug velocity display
            const weapon = player.weapon ? WEAPONS[player.weapon] : null;
            if (DEBUG_SHOW_VELOCITY && weapon) {
                const effectivePower = chargeToPower(player.power);
                const velocity = effectivePower * MAX_POWER * weapon.projectileSpeed;
                renderer.drawText(`v=${velocity.toFixed(1)}`, player.x, meterY - 12, '#ffff00', 10, 'center', false);
            }
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

        // Archetype label
        if (archetype) {
            renderer.drawText(archetype.name, player.x, player.y + 45, tankColor, 10, 'center', false);
        }
    }

    // Draw tracer preview arc (only during aiming phase)
    if (state.phase === 'aiming') {
        drawTracerPreview();
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

    // Draw anomaly projectile (from VOID ANOMALY event)
    if (state.anomalyProjectile) {
        drawProjectile(state.anomalyProjectile);
    }

    // Draw lightning arc (Chain Lightning)
    if (state.lightningArc) {
        drawLightningArc(state.lightningArc);
    }

    // Draw particles
    particles.draw(renderer);

    // Draw ambient foreground (UFOs, weather, glitch specks)
    if (ambient) {
        ambient.drawForeground(renderer);
        // Occasional lightning flash during rain
        ambient.triggerLightning(renderer);
    }

    // Restore from camera zoom
    if (state.cameraZoom > 0) {
        ctx.restore();
    }

    // Restore from world scale - HUD rendered at 1:1
    ctx.restore();

    // Clear biome filter before HUD rendering
    ctx.filter = 'none';

    // ========================================================================
    // HUD RENDERING (at 1:1 scale, pinned to screen)
    // ========================================================================
    renderer.drawText('VOID ARTILLERY', 20, 30, COLORS.cyan, 20, 'left', true);

    // Turn indicator
    const turnText = state.phase === 'gameover'
        ? `PLAYER ${state.winner + 1} WINS!`
        : `PLAYER ${state.currentPlayer + 1} TURN`;
    const turnColor = state.phase === 'gameover'
        ? state.players[state.winner].color
        : getCurrentPlayer().color;
    renderer.drawText(turnText, CANVAS_WIDTH / 2, 30, turnColor, 20, 'center', true);

    // Round indicator + FPS (for debugging)
    renderer.drawText(`Round ${getCurrentRound()}`, CANVAS_WIDTH - 20, 30, COLORS.white, 14, 'right', false);
    renderer.drawText(`FPS: ${fpsCounter.fps}`, CANVAS_WIDTH - 20, 50, fpsCounter.fps < 50 ? COLORS.magenta : '#666666', 10, 'right', false);

    // Wind indicator (persistent, below turn indicator)
    renderWindIndicator();

    // Player stats - compact horizontal strip for 5-6 players
    const statsStartX = 20;
    const statsY = 60;
    const playerSpacing = 220;  // Wider for archetype info

    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i];
        const x = statsStartX + i * playerSpacing;
        const weaponName = p.weapon ? WEAPONS[p.weapon]?.name : '';
        const archetype = p.archetype ? TANK_ARCHETYPES[p.archetype] : null;
        const isDead = p.health <= 0;
        const isActive = i === state.currentPlayer && state.phase === 'aiming';

        // Player label with health and archetype
        const labelColor = isDead ? '#444444' : (archetype ? archetype.palette.base : p.color);
        const archetypeName = archetype ? archetype.name : '';
        const label = `P${i + 1} ${archetypeName}: ${isDead ? 'X' : Math.round(p.health) + '%'}`;
        renderer.drawText(label, x, statsY, labelColor, isActive ? 14 : 12, 'left', isActive);

        // Weapon, coins, and shield (smaller, below)
        if (!isDead) {
            let statusText = `[${weaponName}] $${p.coins}`;
            if (p.shield > 0) {
                statusText += ` 🛡${Math.round(p.shield * 100)}%`;
            }
            renderer.drawText(statusText, x, statsY + 15, '#888888', 10, 'left', false);
        }
    }

    // Event notification (glitch events)
    if (state.activeEvent && state.activeEvent.timer > 0) {
        const alpha = Math.min(1, state.activeEvent.timer);
        renderer.ctx.globalAlpha = alpha;
        // Draw "ROUND GLITCH" banner (glitch persists for both players this round)
        renderer.drawText('ROUND GLITCH', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 110, '#666666', 14, 'center', false);
        // Draw event name with glow
        renderer.drawText(state.activeEvent.name, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80, state.activeEvent.color, 36, 'center', true);

        // Draw event-specific info
        const eventName = state.activeEvent.name;
        let infoText = '';
        if (eventName === 'GRAVITY FLUX' || eventName === 'HYPER GRAVITY' || eventName === 'ZERO-G' || eventName === 'INVERTED GRAVITY') {
            infoText = `Gravity: ${state.gravity.toFixed(2)}`;
        } else if (eventName === 'WIND BLAST') {
            const dir = state.wind > 0 ? '>>>' : '<<<';
            infoText = `Wind: ${dir} ${Math.abs(state.wind).toFixed(2)}`;
        } else if (eventName === 'TIME DILATION' || eventName === 'MUZZLE OVERCHARGE' || eventName === 'MUZZLE DAMPEN') {
            infoText = `Velocity: ${Math.round(state.velocityMultiplier * 100)}%`;
        } else if (eventName === 'ELASTIC WORLD') {
            infoText = `+${state.extraBounces} bounces`;
        } else if (eventName === 'VOID SURGE') {
            infoText = 'Void will surge after shot!';
        } else if (eventName === 'RECOIL KICK') {
            infoText = 'Firing will push you back!';
        }
        if (infoText) {
            renderer.drawText(infoText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40, '#888888', 16, 'center', false);
        }
        renderer.ctx.globalAlpha = 1;
    }

    // Wind shift announcement (when wind changes between rounds)
    if (state.windShiftPending && state.windShiftTimer > 0) {
        const alpha = Math.min(1, state.windShiftTimer);
        renderer.ctx.globalAlpha = alpha;

        // "WIND SHIFT" title
        renderer.setGlow(COLORS.cyan, 15);
        renderer.drawText('WIND SHIFT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50, COLORS.cyan, 28, 'center', true);
        renderer.clearGlow();

        // Show new wind value
        let windText;
        if (Math.abs(state.baseWind) < 0.005) {
            windText = '~ CALM ~';
        } else {
            const arrows = Math.abs(state.baseWind) > 0.10 ? '>>>' : (Math.abs(state.baseWind) > 0.05 ? '>>' : '>');
            const direction = state.baseWind > 0 ? arrows : arrows.split('').map(() => '<').join('');
            windText = `${direction} ${Math.abs(state.baseWind).toFixed(2)}`;
        }
        renderer.drawText(windText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 80, '#ffffff', 20, 'center', false);

        renderer.ctx.globalAlpha = 1;
    }

    // UFO buff notification (when a UFO is destroyed or desperation beacon claimed)
    if (state.buffNotification && state.buffNotification.timer > 0) {
        const notif = state.buffNotification;
        const alpha = Math.min(1, notif.timer);
        const buffInfo = UFO_BUFF_TYPES[notif.buffType];
        const playerColor = state.players[notif.playerIndex].color;

        renderer.ctx.globalAlpha = alpha;

        // Handle special notifications (like DYING_STAR) that aren't in UFO_BUFF_TYPES
        if (buffInfo) {
            // Standard UFO buff notification
            const floatY = notif.y - (2 - notif.timer) * 30;
            renderer.drawText(`P${notif.playerIndex + 1} ${buffInfo.name}`, notif.x, floatY, buffInfo.color, 18, 'center', true);
        } else if (notif.buffType === 'DYING_STAR') {
            // Special notification for desperation beacon
            const floatY = (notif.y || CANVAS_HEIGHT / 2) - (2.5 - notif.timer) * 20;
            renderer.drawText(`P${notif.playerIndex + 1} DYING LIGHT!`, notif.x || CANVAS_WIDTH / 2, floatY, '#ffcc00', 22, 'center', true);
            renderer.drawText('3 turns of ultimate power', notif.x || CANVAS_WIDTH / 2, floatY + 25, '#ffaa00', 14, 'center', false);
        }

        renderer.ctx.globalAlpha = 1;
    }

    // Lottery notifications (AI weapon picks)
    for (const notif of state.lotteryNotifications) {
        const alpha = Math.min(1, notif.timer);
        renderer.ctx.globalAlpha = alpha;

        // Get rarity color for glow
        const rarityColors = LOTTERY_RARITY_COLORS[notif.rarity] || LOTTERY_RARITY_COLORS.common;

        // Convert world coords to screen coords
        const screenX = notif.x * WORLD_SCALE;
        const screenY = notif.y * WORLD_SCALE;

        renderer.setGlow(rarityColors.glow, 10);
        renderer.drawText(notif.text, screenX, screenY, notif.color, 16, 'center', true);
        renderer.clearGlow();

        renderer.ctx.globalAlpha = 1;
    }

    // Controls hint
    if (state.phase === 'aiming') {
        const hintText = getCurrentPlayer().isAI ? 'AI is thinking...' : '← → to aim, HOLD SPACE to charge, RELEASE to fire';
        renderer.drawText(hintText, 20, CANVAS_HEIGHT - 30, '#666666', 12, 'left', false);
    } else if (state.phase === 'gameover') {
        renderer.drawText('ENTER: Rematch | ESC: Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50, COLORS.white, 16, 'center', true);
    } else if (state.phase === 'awaiting_next_turn') {
        // Draw "Start Next Turn?" prompt
        const nextPlayer = state.players[state.currentPlayer];
        const playerColor = nextPlayer.color || COLORS.cyan;

        // Semi-transparent backdrop
        renderer.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        renderer.ctx.fillRect(CANVAS_WIDTH / 2 - 200, CANVAS_HEIGHT / 2 - 60, 400, 120);

        // Glowing border
        renderer.setGlow(playerColor, 20);
        renderer.ctx.strokeStyle = playerColor;
        renderer.ctx.lineWidth = 2;
        renderer.ctx.strokeRect(CANVAS_WIDTH / 2 - 200, CANVAS_HEIGHT / 2 - 60, 400, 120);
        renderer.clearGlow();

        // Player indicator
        const playerLabel = nextPlayer.isAI ? `Player ${state.currentPlayer + 1} (AI)` : `Player ${state.currentPlayer + 1}`;
        renderer.setGlow(playerColor, 15);
        renderer.drawText(playerLabel, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30, playerColor, 20, 'center', true);
        renderer.clearGlow();

        // Main prompt
        renderer.setGlow('#ffffff', 10);
        renderer.drawText('Start Next Turn?', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5, '#ffffff', 28, 'center', true);
        renderer.clearGlow();

        // Instruction
        const pulseAlpha = 0.5 + Math.sin(state.time * 5) * 0.3;
        renderer.ctx.globalAlpha = pulseAlpha;
        renderer.drawText('Press SPACE to continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 40, '#aaaaaa', 14, 'center', false);
        renderer.ctx.globalAlpha = 1;
    }

    // Draw death notifications (kill celebrations)
    for (let i = state.deathNotifications.length - 1; i >= 0; i--) {
        const notif = state.deathNotifications[i];
        if (notif.timer <= 0) {
            state.deathNotifications.splice(i, 1);
            continue;
        }
        const alpha = Math.min(1, notif.timer);
        const rise = (1.5 - notif.timer) * 30;  // Rise up as it fades
        renderer.ctx.globalAlpha = alpha;
        renderer.setGlow(notif.color, 20);
        renderer.drawText(notif.text, notif.x * WORLD_SCALE, (notif.y - rise) * WORLD_SCALE, notif.color, 24, 'center', true);
        renderer.clearGlow();
        renderer.ctx.globalAlpha = 1;
    }

    // Apply post-processing effects (bloom, vignette, chromatic aberration)
    applyAllPostFX(renderer.canvas, renderer.ctx, CANVAS_WIDTH, CANVAS_HEIGHT);

    renderer.endFrame();
}

/**
 * Draw active buff icons for a player
 */
function drawPlayerBuffs(playerIndex, x, y) {
    const buffs = state.ufoBuffs[playerIndex];
    let offsetX = 0;

    // Draw damage buff stacks
    if (buffs.damage > 0) {
        renderer.setGlow(UFO_BUFF_TYPES.DAMAGE.color, 8);
        renderer.drawText(`DMG×${buffs.damage}`, x + offsetX, y, UFO_BUFF_TYPES.DAMAGE.color, 10, 'left', false);
        renderer.clearGlow();
        offsetX += 50;
    }

    // Draw blast buff stacks
    if (buffs.blast > 0) {
        renderer.setGlow(UFO_BUFF_TYPES.BLAST.color, 8);
        renderer.drawText(`BLT×${buffs.blast}`, x + offsetX, y, UFO_BUFF_TYPES.BLAST.color, 10, 'left', false);
        renderer.clearGlow();
        offsetX += 50;
    }

    // Draw bounce buff stacks
    if (buffs.bounces > 0) {
        renderer.setGlow(UFO_BUFF_TYPES.BOUNCES.color, 8);
        renderer.drawText(`BNC×${buffs.bounces}`, x + offsetX, y, UFO_BUFF_TYPES.BOUNCES.color, 10, 'left', false);
        renderer.clearGlow();
    }
}

/**
 * Draw a faint preview arc showing the projectile trajectory
 * Uses exact same physics as actual projectiles: gravity, wind, velocity multiplier
 */
function drawTracerPreview() {
    const player = getCurrentPlayer();

    // Don't show tracer for AI players
    if (player.isAI) return;

    // Use weapon data for speed, fallback to tank type
    const weapon = WEAPONS[player.weapon];
    if (!weapon) return;

    // Calculate launch velocity (same as fireProjectile)
    const angleRad = degToRad(180 - player.angle);
    const effectivePower = chargeToPower(player.power);
    const speed = effectivePower * MAX_POWER * (weapon.projectileSpeed || 1.0) * state.velocityMultiplier;

    // Initial position and velocity
    let x = player.x;
    let y = player.y - 20;
    let vx = Math.cos(angleRad) * speed;
    let vy = -Math.sin(angleRad) * speed;

    // Simulation parameters (use virtual world coordinates)
    const maxSteps = 400;  // Maximum simulation steps
    const stepSize = 1;    // Physics step (lower = smoother but slower)
    const dotSpacing = 12; // Pixels between dots (in virtual space)
    let distanceTraveled = 0;

    // Collect points along the arc
    const points = [];
    points.push({ x, y });

    for (let step = 0; step < maxSteps; step++) {
        // Apply gravity (same as updateProjectile)
        vy += state.gravity * stepSize;

        // Apply wind (same as updateProjectile)
        if (state.wind !== 0) {
            vx += state.wind * stepSize;
        }

        // Move
        const prevX = x;
        const prevY = y;
        x += vx * stepSize;
        y += vy * stepSize;

        // Track distance for dot spacing
        distanceTraveled += distance(prevX, prevY, x, y);

        // Add point at regular intervals
        if (distanceTraveled >= dotSpacing) {
            points.push({ x, y });
            distanceTraveled = 0;
        }

        // Stop conditions (use VIRTUAL/WORLD coordinates):
        // 1. Hit terrain
        if (terrain.isPointBelowTerrain(x, y)) {
            points.push({ x, y });  // Add final point at impact
            break;
        }

        // 2. Hit left/right walls (use world boundaries)
        if (x < WORLD_LEFT || x > WORLD_RIGHT) {
            break;
        }

        // 3. NO ceiling - projectiles can arc above screen and fall back
        // (Just skip points that are off-screen for drawing)

        // 4. Hit void
        if (y > state.voidY) {
            break;
        }

        // 5. Gone way off screen (use virtual dimensions)
        if (y > VIRTUAL_HEIGHT + 100) {
            break;
        }
    }

    // Need at least 2 points to draw
    if (points.length < 2) return;

    // Draw the arc as faint dots
    const ctx = renderer.ctx;
    ctx.save();
    ctx.globalAlpha = 0.3;

    // Use player color for the tracer
    const tracerColor = player.color;
    renderer.setGlow(tracerColor, 8);

    for (let i = 1; i < points.length; i++) {
        const point = points[i];
        // Fade dots further along the arc
        const fadeT = i / points.length;
        ctx.globalAlpha = 0.5 * (1 - fadeT * 0.6);

        // Draw small dot (slightly larger for visibility)
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = tracerColor;
        ctx.fill();
    }

    // Draw impact marker at end point
    const endPoint = points[points.length - 1];
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(endPoint.x, endPoint.y, 8, 0, Math.PI * 2);
    ctx.strokeStyle = tracerColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    renderer.clearGlow();
    ctx.restore();
}

function drawProjectile(proj) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    const isRailgun = proj.tankType === 'PHANTOM';
    const isDyingLight = proj.weaponKey === 'DYING_STAR';
    const isQuake = proj.weaponKey === 'QUAKE';
    const isMeteor = proj.isMeteor;

    // Trail
    for (let i = 0; i < proj.trail.length; i++) {
        const point = proj.trail[i];
        const t = i / proj.trail.length;

        if (isMeteor) {
            // METEOR: Fiery trail with orange/red glow
            const alpha = t * 0.8;
            const radius = proj.radius * t * 1.1;
            renderer.ctx.globalAlpha = alpha;
            // Outer red glow
            renderer.drawCircle(point.x, point.y, radius * 2, '#ff3300', true);
            // Middle orange
            renderer.ctx.globalAlpha = alpha * 0.8;
            renderer.drawCircle(point.x, point.y, radius * 1.3, '#ff6600', true);
            // Inner yellow core
            renderer.ctx.globalAlpha = alpha * 0.6;
            renderer.drawCircle(point.x, point.y, radius * 0.7, '#ffcc00', true);
        } else if (isQuake) {
            // QUAKE: Heavy earthen trail with dust particles
            const alpha = t * 0.6;
            const radius = proj.radius * t * 0.9;
            renderer.ctx.globalAlpha = alpha;
            // Rocky outer layer
            renderer.drawCircle(point.x, point.y, radius * 1.4, '#886644', true);
            // Earthy inner
            renderer.ctx.globalAlpha = alpha * 0.7;
            renderer.drawCircle(point.x, point.y, radius * 0.8, '#aa7755', true);
        } else if (isDyingLight) {
            // DYING LIGHT: Spectacular golden comet trail
            const alpha = t * 0.9;
            const radius = proj.radius * t * 1.2;
            renderer.ctx.globalAlpha = alpha;
            // Outer orange glow
            renderer.drawCircle(point.x, point.y, radius * 2, '#ff6600', true);
            // Middle gold
            renderer.ctx.globalAlpha = alpha * 0.9;
            renderer.drawCircle(point.x, point.y, radius * 1.3, '#ffcc00', true);
            // Inner white core
            renderer.ctx.globalAlpha = alpha * 0.7;
            renderer.drawCircle(point.x, point.y, radius * 0.6, '#ffffff', true);
        } else if (isRailgun) {
            // Railgun: Bright, streaky trail with white core
            const alpha = t * 0.7;
            const radius = proj.radius * t * 0.5;
            renderer.ctx.globalAlpha = alpha;
            // Outer colored glow
            renderer.drawCircle(point.x, point.y, radius * 1.5, proj.color, true);
            // Inner white core
            renderer.ctx.globalAlpha = alpha * 0.8;
            renderer.drawCircle(point.x, point.y, radius * 0.8, COLORS.white, true);
        } else {
            // Normal trail
            const alpha = t * 0.5;
            const radius = proj.radius * t * 0.7;
            renderer.ctx.globalAlpha = alpha;
            renderer.drawCircle(point.x, point.y, radius, proj.color, true);
        }
    }
    renderer.ctx.globalAlpha = 1;

    // Main projectile
    if (isDyingLight) {
        // DYING LIGHT: Pulsing golden sun with multiple layers
        const pulse = Math.sin(state.time * 15) * 0.3 + 1;
        const outerPulse = Math.sin(state.time * 10) * 0.2 + 1;

        // Massive outer glow
        renderer.setGlow('#ffcc00', 50 * outerPulse);
        renderer.drawCircle(proj.x, proj.y, proj.radius * 3 * outerPulse, '#ff8800', true);
        // Middle golden layer
        renderer.setGlow('#ffffff', 30);
        renderer.drawCircle(proj.x, proj.y, proj.radius * 1.8 * pulse, '#ffcc00', true);
        // Bright white core
        renderer.setGlow('#ffffff', 40);
        renderer.drawCircle(proj.x, proj.y, proj.radius * 0.8, '#ffffff', true);
        renderer.clearGlow();

        // Emit sparks while flying
        if (Math.random() < 0.3) {
            particles.sparks(proj.x, proj.y, 3, '#ffcc00');
        }
    } else if (isQuake) {
        // QUAKE: Heavy seismic boulder with cracks
        const rumble = Math.sin(state.time * 20) * 2; // Slight vibration

        // Earthy outer glow
        renderer.setGlow('#cc8844', 15);
        renderer.drawCircle(proj.x + rumble, proj.y, proj.radius * 1.5, '#886644', true);

        // Rocky surface with cracks
        renderer.setGlow('#ffaa66', 8);
        renderer.drawCircle(proj.x + rumble, proj.y, proj.radius * 1.1, '#aa7755', true);

        // Inner molten core showing through cracks
        renderer.setGlow('#ffcc88', 12);
        renderer.drawCircle(proj.x + rumble, proj.y, proj.radius * 0.5, '#ffaa44', true);
        renderer.clearGlow();

        // Emit dust while flying
        if (Math.random() < 0.25) {
            particles.spawn(
                proj.x + (Math.random() - 0.5) * proj.radius,
                proj.y + (Math.random() - 0.5) * proj.radius,
                {
                    angle: Math.random() * Math.PI * 2,
                    speed: 1 + Math.random(),
                    life: 0.3 + Math.random() * 0.2,
                    color: '#998877',
                    radius: 2 + Math.random() * 2,
                    gravity: 0.1
                }
            );
        }
    } else if (isRailgun) {
        // Railgun: Bright white core with colored outer ring
        renderer.setGlow(COLORS.white, 25);
        renderer.drawCircle(proj.x, proj.y, proj.radius * 1.3, proj.color, false);
        renderer.drawCircle(proj.x, proj.y, proj.radius * 0.7, COLORS.white, false);
        renderer.clearGlow();
    } else {
        renderer.drawCircle(proj.x, proj.y, proj.radius, proj.color, true);
    }
}

/**
 * Draw a fire field (Napalm)
 */
function drawFireField(field) {
    const ctx = renderer.ctx;
    const progress = field.timer / field.duration;  // 1 = full, 0 = expired
    const currentRadius = field.radius * (0.5 + progress * 0.5);
    const time = Date.now() * 0.003;  // Animation time

    // Number of flame columns based on radius
    const numFlames = Math.floor(currentRadius / 20) + 5;

    // Draw base glow on ground
    const baseGradient = ctx.createRadialGradient(
        field.x, field.y, 0,
        field.x, field.y, currentRadius
    );
    baseGradient.addColorStop(0, `rgba(255, 100, 0, ${0.4 * progress})`);
    baseGradient.addColorStop(0.6, `rgba(255, 50, 0, ${0.2 * progress})`);
    baseGradient.addColorStop(1, 'rgba(255, 20, 0, 0)');
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.ellipse(field.x, field.y, currentRadius, currentRadius * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Draw animated flame columns
    for (let i = 0; i < numFlames; i++) {
        const t = i / numFlames;
        const offsetX = (t - 0.5) * currentRadius * 2;
        const flameX = field.x + offsetX;
        const groundY = terrain.getHeightAt(flameX);

        // Flame height varies with animation and position
        const baseHeight = 30 + Math.sin(time + i * 0.7) * 10;
        const heightVariation = Math.sin(time * 2 + i * 1.3) * 8;
        const flameHeight = (baseHeight + heightVariation) * progress;

        // Flame width narrows toward top
        const flameWidth = 12 + Math.sin(time * 1.5 + i) * 4;

        // Draw flame as gradient from bottom to top
        const flameGradient = ctx.createLinearGradient(
            flameX, groundY, flameX, groundY - flameHeight
        );
        flameGradient.addColorStop(0, `rgba(255, 80, 0, ${0.8 * progress})`);
        flameGradient.addColorStop(0.3, `rgba(255, 150, 0, ${0.7 * progress})`);
        flameGradient.addColorStop(0.6, `rgba(255, 200, 50, ${0.5 * progress})`);
        flameGradient.addColorStop(1, `rgba(255, 255, 100, 0)`);

        // Draw wavy flame shape
        ctx.beginPath();
        ctx.moveTo(flameX - flameWidth / 2, groundY);

        // Left edge of flame (wavy)
        const wavePoints = 5;
        for (let j = 0; j <= wavePoints; j++) {
            const py = groundY - (flameHeight * j / wavePoints);
            const waveOffset = Math.sin(time * 3 + j + i) * (flameWidth * 0.2);
            const narrowing = 1 - (j / wavePoints) * 0.8;
            ctx.lineTo(flameX - flameWidth / 2 * narrowing + waveOffset, py);
        }

        // Right edge of flame (wavy, going back down)
        for (let j = wavePoints; j >= 0; j--) {
            const py = groundY - (flameHeight * j / wavePoints);
            const waveOffset = Math.sin(time * 3 + j + i + 2) * (flameWidth * 0.2);
            const narrowing = 1 - (j / wavePoints) * 0.8;
            ctx.lineTo(flameX + flameWidth / 2 * narrowing + waveOffset, py);
        }

        ctx.closePath();
        ctx.fillStyle = flameGradient;

        // Add glow to flames
        renderer.setGlow('#ff6600', 15 * progress);
        ctx.fill();
        renderer.clearGlow();
    }

    // Draw hot core embers (bright spots at base)
    renderer.setGlow('#ffaa00', 25 * progress);
    const numEmbers = Math.floor(currentRadius / 15);
    for (let i = 0; i < numEmbers; i++) {
        const emberX = field.x + (Math.random() - 0.5) * currentRadius * 1.5;
        const emberY = terrain.getHeightAt(emberX) - Math.random() * 15;
        const emberSize = 3 + Math.random() * 4;
        const emberAlpha = (0.5 + Math.random() * 0.5) * progress;

        ctx.fillStyle = `rgba(255, 255, 150, ${emberAlpha})`;
        ctx.beginPath();
        ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
        ctx.fill();
    }
    renderer.clearGlow();
}

/**
 * Draw an active nuke with countdown timer
 */
function drawNuke(nuke) {
    const ctx = renderer.ctx;
    const timeLeft = Math.ceil(nuke.fuseTimer);
    const pulsePhase = (nuke.fuseTimer % 1);  // 0-1 within each second
    const urgency = 1 - (nuke.fuseTimer / 3);  // Gets more urgent as timer decreases

    // Pulsing glow intensity
    const pulseIntensity = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2 * 3);  // Faster pulse as time runs out
    const glowSize = 30 + urgency * 40 + pulseIntensity * 20;

    // Draw outer danger glow
    renderer.setGlow('#ff0000', glowSize);
    ctx.fillStyle = `rgba(255, ${Math.floor(100 - urgency * 100)}, 0, ${0.3 + pulseIntensity * 0.3})`;
    ctx.beginPath();
    ctx.arc(nuke.x, nuke.y, nuke.radius * 2 + urgency * 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw nuke body
    renderer.setGlow('#ffff00', 20);
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(nuke.x, nuke.y, nuke.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(nuke.x, nuke.y, nuke.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
    renderer.clearGlow();

    // Draw countdown number
    ctx.save();
    ctx.font = `bold ${32 + urgency * 16}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Text glow
    renderer.setGlow('#ff0000', 15);
    ctx.fillStyle = urgency > 0.66 ? '#ff0000' : (urgency > 0.33 ? '#ffaa00' : '#ffff00');
    ctx.fillText(timeLeft.toString(), nuke.x, nuke.y - 50);
    renderer.clearGlow();
    ctx.restore();

    // Warning rings expanding outward
    if (urgency > 0.5) {
        const ringPhase = (performance.now() / 500) % 1;
        ctx.strokeStyle = `rgba(255, 0, 0, ${0.5 * (1 - ringPhase)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(nuke.x, nuke.y, nuke.radius * 2 + ringPhase * 50, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// ============================================================================
// Wind System Rendering
// ============================================================================

/**
 * Render wind indicator in HUD
 * Shows arrow direction and strength, cyan normally, magenta during WIND BLAST
 */
function renderWindIndicator() {
    const wind = state.wind;
    const isWindBlast = state.activeEvent && state.activeEvent.name === 'WIND BLAST';

    // Determine display text
    let windText;
    if (Math.abs(wind) < 0.005) {
        windText = '~ CALM ~';
    } else {
        const arrows = Math.abs(wind) > 0.10 ? '>>>' : (Math.abs(wind) > 0.05 ? '>>' : '>');
        const direction = wind > 0 ? arrows : arrows.split('').map(() => '<').join('');
        windText = `${direction} ${Math.abs(wind).toFixed(2)}`;
    }

    // Color: cyan normally, magenta during WIND BLAST
    const color = isWindBlast ? COLORS.magenta : COLORS.cyan;

    // Pulsing glow effect
    const pulse = 0.6 + Math.sin(state.time * 3) * 0.4;

    // Position in top right quadrant, same height as player stats
    const x = CANVAS_WIDTH - 120;
    const y = 60;

    // Draw with subtle glow
    if (Math.abs(wind) >= 0.005 || isWindBlast) {
        renderer.setGlow(color, 8 * pulse);
    }
    renderer.drawText(`WIND: ${windText}`, x, y, color, 12, 'right', false);
    renderer.clearGlow();
}

// ============================================================================
// Orbital Strike System Rendering
// ============================================================================

/**
 * Render orbital beacons (landed, targeting laser, and firing beam)
 */
function renderOrbitalBeacons() {
    const ctx = renderer.ctx;

    for (const beacon of state.orbitalBeacons) {
        if (beacon.phase === 'landed' || beacon.phase === 'targeting') {
            // Draw pulsing beacon on ground
            const pulse = Math.sin(state.time * 8) * 0.3 + 0.7;
            renderer.setGlow('#ff6600', 20 * pulse);
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 10 * pulse, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 4, 0, Math.PI * 2);
            ctx.fill();
            renderer.clearGlow();

            // Targeting laser from ship (if targeting)
            if (beacon.phase === 'targeting' && beacon.targetingShip) {
                const ship = beacon.targetingShip;
                const dashPhase = (state.time * 5) % 1;

                ctx.save();
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.setLineDash([10, 10]);
                ctx.lineDashOffset = -dashPhase * 20;
                ctx.globalAlpha = 0.5 + Math.sin(state.time * 10) * 0.3;

                ctx.beginPath();
                ctx.moveTo(ship.x, ship.y);
                ctx.lineTo(beacon.x, beacon.y);
                ctx.stroke();

                ctx.setLineDash([]);
                ctx.restore();

                // Countdown text
                const timeLeft = Math.ceil(2 - beacon.timer);
                if (timeLeft > 0) {
                    ctx.save();
                    ctx.font = 'bold 24px monospace';
                    ctx.textAlign = 'center';
                    renderer.setGlow('#ff6600', 10);
                    ctx.fillStyle = '#ff6600';
                    ctx.fillText(timeLeft.toString(), beacon.x, beacon.y - 30);
                    renderer.clearGlow();
                    ctx.restore();
                }
            }
        }

        if (beacon.phase === 'firing') {
            // Draw massive beam from sky to ground
            const beamAlpha = 1 - (beacon.timer / 0.8);  // Fade out over 0.8s
            const beamWidth = 60 + Math.sin(state.time * 30) * 10;

            // Outer glow
            renderer.setGlow('#00ffff', 50);
            ctx.globalAlpha = beamAlpha * 0.5;
            ctx.fillStyle = '#00ffff';
            ctx.fillRect(beacon.x - beamWidth, -100, beamWidth * 2, beacon.y + 200);

            // Inner white core
            ctx.globalAlpha = beamAlpha * 0.8;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(beacon.x - beamWidth * 0.5, -100, beamWidth, beacon.y + 200);

            // Bright center line
            ctx.globalAlpha = beamAlpha;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(beacon.x - 5, -100, 10, beacon.y + 200);

            renderer.clearGlow();
            ctx.globalAlpha = 1;

            // Ground impact circle
            renderer.setGlow('#ff6600', 40);
            ctx.strokeStyle = '#ff6600';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 80 + beacon.timer * 100, 0, Math.PI * 2);
            ctx.stroke();
            renderer.clearGlow();
        }
    }
}

/**
 * Render strafing runs (warning zone and fighters)
 */
function renderStrafingRuns() {
    const ctx = renderer.ctx;

    for (const run of state.strafingRuns) {
        const halfWidth = run.coverageWidth / 2;

        if (run.phase === 'warning') {
            // Draw red danger zone
            const flash = Math.sin(state.time * 8) * 0.2 + 0.3;
            ctx.globalAlpha = flash;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(run.targetX - halfWidth, 0, run.coverageWidth, state.voidY);
            ctx.globalAlpha = 1;

            // Direction arrows
            const arrowY = VIRTUAL_HEIGHT * 0.15;
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            for (let i = 0; i < 3; i++) {
                const arrowX = run.targetX + (i - 1) * 100;
                const dir = run.direction;
                ctx.beginPath();
                ctx.moveTo(arrowX - dir * 20, arrowY - 10);
                ctx.lineTo(arrowX + dir * 20, arrowY);
                ctx.lineTo(arrowX - dir * 20, arrowY + 10);
                ctx.stroke();
            }

            // "INCOMING" text
            ctx.save();
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            renderer.setGlow('#ff0000', 10);
            ctx.fillStyle = '#ff0000';
            ctx.fillText('INCOMING', run.targetX, VIRTUAL_HEIGHT * 0.08);
            renderer.clearGlow();
            ctx.restore();
        }

        if (run.phase === 'strafing') {
            // Draw fighters
            for (const fighter of run.fighters) {
                ctx.save();
                ctx.translate(fighter.x, fighter.y);

                // Fighter body (small triangle)
                renderer.setGlow('#ffff00', 10);
                ctx.fillStyle = '#888888';
                ctx.beginPath();
                if (run.direction === 1) {
                    ctx.moveTo(25, 0);
                    ctx.lineTo(-15, -12);
                    ctx.lineTo(-15, 12);
                } else {
                    ctx.moveTo(-25, 0);
                    ctx.lineTo(15, -12);
                    ctx.lineTo(15, 12);
                }
                ctx.closePath();
                ctx.fill();

                // Engine glow
                ctx.fillStyle = '#ffaa00';
                const engineX = run.direction === 1 ? -20 : 20;
                ctx.beginPath();
                ctx.arc(engineX, 0, 5, 0, Math.PI * 2);
                ctx.fill();

                renderer.clearGlow();
                ctx.restore();

                // Engine trail
                for (let t = 1; t <= 5; t++) {
                    const trailX = fighter.x - run.direction * t * 15;
                    ctx.globalAlpha = 0.4 - t * 0.07;
                    ctx.fillStyle = '#ff6600';
                    ctx.beginPath();
                    ctx.arc(trailX, fighter.y, 4 - t * 0.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
            }
        }
    }
}

/**
 * Render desperation beacons (falling or landed, waiting to be claimed)
 */
function renderDesperationBeacons() {
    const ctx = renderer.ctx;

    for (const beacon of state.desperationBeacons) {
        const pulse = Math.sin(state.time * 6) * 0.3 + 0.7;

        // Outer glow
        renderer.setGlow('#ffcc00', 25 * pulse);

        if (!beacon.landed) {
            // Falling beacon with trail
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 8, 0, Math.PI * 2);
            ctx.fill();

            // Trail
            for (let t = 1; t <= 6; t++) {
                ctx.globalAlpha = 0.5 - t * 0.08;
                ctx.fillStyle = '#ff6600';
                ctx.beginPath();
                ctx.arc(beacon.x, beacon.y - beacon.vy * t * 0.02, 6 - t * 0.8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else {
            // Landed beacon
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 12 * pulse, 0, Math.PI * 2);
            ctx.fill();

            // Inner core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(beacon.x, beacon.y, 5, 0, Math.PI * 2);
            ctx.fill();

            // Timer bar
            const timeLeft = beacon.maxTime - beacon.timer;
            const barWidth = 40;
            const barHeight = 6;
            const fillWidth = (timeLeft / beacon.maxTime) * barWidth;

            ctx.fillStyle = '#333333';
            ctx.fillRect(beacon.x - barWidth / 2, beacon.y - 25, barWidth, barHeight);

            const urgency = 1 - (timeLeft / beacon.maxTime);
            ctx.fillStyle = urgency > 0.7 ? '#ff0000' : (urgency > 0.4 ? '#ffaa00' : '#ffcc00');
            ctx.fillRect(beacon.x - barWidth / 2, beacon.y - 25, fillWidth, barHeight);

            // "CLAIM!" text
            ctx.save();
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffcc00';
            ctx.fillText('CLAIM!', beacon.x, beacon.y - 35);
            ctx.restore();
        }

        renderer.clearGlow();
    }
}

// ============================================================================
// New Weapon Systems Rendering
// ============================================================================

/**
 * Render black holes (BLACK_HOLE_GRENADE)
 */
function renderBlackHoles() {
    const ctx = renderer.ctx;

    for (const hole of state.blackHoles) {
        const progress = hole.timer / hole.duration;
        const intensity = 0.5 + progress * 0.5;

        // Dark center
        const gradient = ctx.createRadialGradient(
            hole.x, hole.y, 0,
            hole.x, hole.y, hole.pullRadius * 0.5
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        gradient.addColorStop(0.5, 'rgba(34, 0, 68, 0.6)');
        gradient.addColorStop(1, 'rgba(136, 0, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, hole.pullRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Accretion disk effect
        renderer.setGlow('#8800ff', 30 * intensity);
        ctx.strokeStyle = '#8800ff';
        ctx.lineWidth = 4 + progress * 4;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, 20 + progress * 10, 0, Math.PI * 2);
        ctx.stroke();

        // Swirling particles
        for (let i = 0; i < 8; i++) {
            const angle = state.time * 4 + (i / 8) * Math.PI * 2;
            const dist = hole.pullRadius * (0.2 + 0.6 * Math.abs(Math.sin(state.time * 2 + i)));
            const px = hole.x + Math.cos(angle) * dist;
            const py = hole.y + Math.sin(angle) * dist;

            ctx.globalAlpha = 0.6 * (1 - dist / hole.pullRadius);
            ctx.fillStyle = '#aa00ff';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
}

/**
 * Render lightning arc (chain lightning)
 */
function renderLightningArc() {
    if (!state.lightningArc) return;

    const ctx = renderer.ctx;
    const arc = state.lightningArc;
    const alpha = arc.timer / 0.6;

    renderer.setGlow(arc.color, 25);
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = 4;
    ctx.globalAlpha = alpha;

    // Draw jagged lightning
    ctx.beginPath();
    ctx.moveTo(arc.x1, arc.y1);

    const segments = 8;
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = arc.x1 + (arc.x2 - arc.x1) * t;
        const baseY = arc.y1 + (arc.y2 - arc.y1) * t;
        const jitter = (Math.random() - 0.5) * 30;
        ctx.lineTo(baseX + jitter, baseY + jitter);
    }

    ctx.lineTo(arc.x2, arc.y2);
    ctx.stroke();

    // Bright core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Render void cannon beam warnings
 */
function renderVoidCannonWarnings() {
    const ctx = renderer.ctx;

    for (const beam of state.voidCannonBeams) {
        if (beam.timer >= beam.delay) continue;  // Skip if already firing

        const flash = Math.sin(state.time * 10) * 0.3 + 0.5;
        const progress = beam.timer / beam.delay;

        // Targeting circle
        ctx.globalAlpha = flash * (1 - progress * 0.5);
        ctx.strokeStyle = beam.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, 40 - progress * 20, 0, Math.PI * 2);
        ctx.stroke();

        // Warning line from sky
        ctx.globalAlpha = flash * 0.3;
        ctx.strokeStyle = beam.color;
        ctx.lineWidth = 10 + progress * 30;
        ctx.beginPath();
        ctx.moveTo(beam.x, WORLD_TOP);
        ctx.lineTo(beam.x, beam.y);
        ctx.stroke();

        ctx.globalAlpha = 1;
    }
}

/**
 * Render meteor shower warnings
 */
function renderMeteorWarnings() {
    const ctx = renderer.ctx;

    for (const meteor of state.pendingMeteors) {
        if (meteor.timer >= meteor.delay) continue;

        const flash = Math.sin(state.time * 8) * 0.3 + 0.5;

        // Warning indicator at top
        ctx.globalAlpha = flash;
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(meteor.x, WORLD_TOP + 20);
        ctx.lineTo(meteor.x - 10, WORLD_TOP + 40);
        ctx.lineTo(meteor.x + 10, WORLD_TOP + 40);
        ctx.closePath();
        ctx.fill();

        // Dashed line showing drop path
        ctx.globalAlpha = flash * 0.3;
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(meteor.x, WORLD_TOP + 50);
        ctx.lineTo(meteor.x, terrain.getHeightAt(meteor.x));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 1;
    }
}

/**
 * Draw expanding nuke shockwave
 */
function drawNukeShockwave(shockwave) {
    const ctx = renderer.ctx;
    const progress = shockwave.timer / shockwave.duration;
    const alpha = 1 - progress;  // Fade out as it expands

    // Multiple shockwave rings for thickness
    for (let ring = 0; ring < 3; ring++) {
        const ringOffset = ring * 15;
        const ringRadius = shockwave.radius - ringOffset;
        if (ringRadius < 0) continue;

        const ringAlpha = alpha * (1 - ring * 0.3);
        const lineWidth = 8 - ring * 2;

        // Outer glow
        renderer.setGlow('#ffaa00', 30 * ringAlpha);
        ctx.strokeStyle = `rgba(255, ${150 + ring * 50}, 0, ${ringAlpha})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.arc(shockwave.x, shockwave.y, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Inner white flash ring
    if (progress < 0.3) {
        const flashAlpha = 1 - (progress / 0.3);
        renderer.setGlow('#ffffff', 40 * flashAlpha);
        ctx.strokeStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(shockwave.x, shockwave.y, shockwave.radius * 0.5, 0, Math.PI * 2);
        ctx.stroke();
    }

    renderer.clearGlow();
}

/**
 * Draw cinematic mushroom cloud
 */
function drawMushroomCloud(cloud) {
    const ctx = renderer.ctx;
    const progress = cloud.timer / cloud.duration;
    const alpha = Math.max(0, 1 - progress * 0.8);  // Slower fade

    // Stem of mushroom cloud
    const stemTop = cloud.capY + cloud.radius * 0.3;
    const stemBottom = cloud.y;
    const stemWidth = cloud.stemWidth * (1 - progress * 0.3);

    // Draw stem (fire column rising)
    const stemGradient = ctx.createLinearGradient(cloud.x, stemBottom, cloud.x, stemTop);
    stemGradient.addColorStop(0, `rgba(255, 100, 0, ${alpha * 0.6})`);
    stemGradient.addColorStop(0.5, `rgba(255, 150, 0, ${alpha * 0.7})`);
    stemGradient.addColorStop(1, `rgba(255, 200, 50, ${alpha * 0.5})`);

    ctx.fillStyle = stemGradient;
    ctx.beginPath();
    ctx.moveTo(cloud.x - stemWidth * 0.5, stemBottom);
    ctx.lineTo(cloud.x + stemWidth * 0.5, stemBottom);
    ctx.lineTo(cloud.x + stemWidth * 0.8, stemTop);
    ctx.lineTo(cloud.x - stemWidth * 0.8, stemTop);
    ctx.closePath();
    ctx.fill();

    // Cap of mushroom cloud
    const capRadius = cloud.radius;
    const capY = cloud.capY;

    // Outer dark smoke ring
    renderer.setGlow('#ff4400', 40 * alpha);
    ctx.fillStyle = `rgba(80, 40, 20, ${alpha * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(cloud.x, capY, capRadius * 1.3, capRadius * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Middle orange layer
    ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(cloud.x, capY - capRadius * 0.1, capRadius * 1.0, capRadius * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    renderer.setGlow('#ffff00', 60 * alpha);
    ctx.fillStyle = `rgba(255, 200, 50, ${alpha * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(cloud.x, capY - capRadius * 0.15, capRadius * 0.6, capRadius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hot white center
    if (progress < 0.5) {
        const whiteAlpha = (1 - progress * 2) * alpha;
        ctx.fillStyle = `rgba(255, 255, 200, ${whiteAlpha})`;
        ctx.beginPath();
        ctx.ellipse(cloud.x, capY - capRadius * 0.2, capRadius * 0.3, capRadius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    renderer.clearGlow();
}

/**
 * Draw railgun beam with glow effect
 */
function drawRailgunBeam(beam) {
    const ctx = renderer.ctx;
    const alpha = beam.timer / beam.maxTimer;

    if (beam.path.length < 2) return;

    // Draw multiple passes for glow effect
    for (let pass = 0; pass < 4; pass++) {
        const width = pass === 0 ? beam.width * 3 : (pass === 1 ? beam.width * 2 : (pass === 2 ? beam.width : beam.width * 0.5));
        const passAlpha = pass === 0 ? alpha * 0.2 : (pass === 1 ? alpha * 0.4 : (pass === 2 ? alpha * 0.8 : alpha));
        const color = pass < 2 ? beam.color : (pass === 2 ? '#aaffff' : '#ffffff');

        ctx.save();
        ctx.globalAlpha = passAlpha;
        renderer.setGlow(beam.color, 40);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(beam.path[0].x, beam.path[0].y);
        for (let i = 1; i < beam.path.length; i++) {
            ctx.lineTo(beam.path[i].x, beam.path[i].y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Draw impact points at bounces
    for (let i = 1; i < beam.path.length - 1; i++) {
        const p = beam.path[i];
        ctx.globalAlpha = alpha;
        renderer.setGlow(beam.color, 30);
        ctx.fillStyle = COLORS.white;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw terminus explosion
    const terminus = beam.path[beam.path.length - 1];
    const explosionSize = 15 + (1 - alpha) * 30;
    ctx.globalAlpha = alpha * 0.8;
    renderer.setGlow(beam.color, 50);
    ctx.fillStyle = COLORS.white;
    ctx.beginPath();
    ctx.arc(terminus.x, terminus.y, explosionSize, 0, Math.PI * 2);
    ctx.fill();

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw a lightning arc (Chain Lightning)
 */
function drawLightningArc(arc) {
    const ctx = renderer.ctx;
    const segments = 8;
    const jitter = 15;

    // Multiple passes for glow effect
    for (let pass = 0; pass < 3; pass++) {
        const width = pass === 0 ? 6 : (pass === 1 ? 3 : 1);
        const alpha = pass === 0 ? 0.3 : (pass === 1 ? 0.6 : 1);
        const color = pass === 2 ? COLORS.white : arc.color;

        ctx.save();
        ctx.globalAlpha = alpha * (arc.timer / 0.5);  // Fade out
        renderer.setGlow(arc.color, 30);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(arc.x1, arc.y1);

        // Draw jagged lightning path
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const baseX = arc.x1 + (arc.x2 - arc.x1) * t;
            const baseY = arc.y1 + (arc.y2 - arc.y1) * t;

            if (i < segments) {
                // Add random jitter to middle points
                const offsetX = (Math.random() - 0.5) * jitter * 2;
                const offsetY = (Math.random() - 0.5) * jitter * 2;
                ctx.lineTo(baseX + offsetX, baseY + offsetY);
            } else {
                // End at target
                ctx.lineTo(arc.x2, arc.y2);
            }
        }

        ctx.stroke();
        renderer.clearGlow();
        ctx.restore();
    }

    // Bright flash at endpoints
    renderer.setGlow(COLORS.white, 20);
    renderer.drawCircle(arc.x1, arc.y1, 8, arc.color, true);
    renderer.drawCircle(arc.x2, arc.y2, 10, arc.color, true);
    renderer.clearGlow();
}

function renderTitle() {
    const ctx = renderer.ctx;

    // World elements at scaled coordinates
    ctx.save();
    ctx.scale(WORLD_SCALE, WORLD_SCALE);

    // Background with subtle animation
    renderer.drawGrid(100, '#0a0a15');

    // Draw ambient background (far clouds, dust)
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
    }

    // Animated void at bottom
    const voidY = VIRTUAL_HEIGHT - 100 + Math.sin(state.time * 2) * 20;
    renderer.drawVoid(voidY);

    // Draw ambient foreground (UFOs, weather)
    if (ambient) {
        ambient.drawForeground(renderer);
        ambient.triggerLightning(renderer);
    }

    ctx.restore();

    // UI elements at 1:1 scale
    // Main title with glow
    renderer.drawText('VOID', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80, COLORS.magenta, 72, 'center', true);
    renderer.drawText('ARTILLERY', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, COLORS.cyan, 72, 'center', true);

    // Tagline
    renderer.drawText('One Button Away From Victory', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60, '#888888', 16, 'center', false);

    // Animated prompt
    const alpha = 0.5 + Math.sin(state.time * 4) * 0.5;
    ctx.globalAlpha = alpha;
    renderer.drawText('PRESS SPACE TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 140, COLORS.white, 20, 'center', true);
    ctx.globalAlpha = 1;

    // Credits
    renderer.drawText('Game Off 2026 Jam Entry', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 40, '#444444', 12, 'center', false);
}

function renderModeSelect() {
    const ctx = renderer.ctx;

    // World elements at scaled coordinates
    ctx.save();
    ctx.scale(WORLD_SCALE, WORLD_SCALE);
    renderer.drawGrid(100, '#0a0a15');

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }
    ctx.restore();

    // UI at 1:1 scale
    // Title
    renderer.drawText('VOID ARTILLERY', CANVAS_WIDTH / 2, 80, COLORS.cyan, 40, 'center', true);
    renderer.drawText('SELECT MODE', CANVAS_WIDTH / 2, 140, COLORS.white, 24, 'center', false);

    // Mode options
    const modes = [
        { name: '1 PLAYER', desc: 'Battle against AI', color: COLORS.cyan, humans: 1 },
        { name: '2 PLAYERS', desc: 'Local multiplayer', color: COLORS.magenta, humans: 2 },
        { name: '3 PLAYERS', desc: 'Local multiplayer', color: '#00ff00', humans: 3 },
        { name: '4 PLAYERS', desc: 'Local multiplayer', color: '#ffaa00', humans: 4 }
    ];

    const startY = 220;
    const spacing = 100;

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
    const playerIdx = state.selectingPlayerIndex;
    const selectingPlayer = state.players[playerIdx];
    const playerNum = playerIdx + 1;
    const playerColor = selectingPlayer.color;
    const isAISelecting = selectingPlayer.isAI;

    const ctx = renderer.ctx;

    // World elements at scaled coordinates
    ctx.save();
    ctx.scale(WORLD_SCALE, WORLD_SCALE);
    renderer.drawGrid(100, '#0a0a15');

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }
    ctx.restore();

    // UI at 1:1 scale
    // Title
    renderer.drawText('VOID ARTILLERY', CANVAS_WIDTH / 2, 50, COLORS.cyan, 28, 'center', true);
    const subtitle = isAISelecting ? 'AI IS CHOOSING...' : `PLAYER ${playerNum} - SELECT YOUR TANK`;
    renderer.drawText(subtitle, CANVAS_WIDTH / 2, 90, playerColor, 20, 'center', true);

    // Calculate adaptive layout based on number of archetypes
    const headerHeight = 120;  // Space for title + subtitle
    const footerHeight = 50;   // Space for controls hint
    const availableHeight = CANVAS_HEIGHT - headerHeight - footerHeight;
    const archetypeCount = ARCHETYPE_KEYS.length;

    // Calculate spacing to fit all archetypes
    const maxSpacing = 90;
    const minSpacing = 65;
    const calculatedSpacing = Math.min(maxSpacing, Math.max(minSpacing, availableHeight / archetypeCount));

    // Center the list vertically in available space
    const totalListHeight = (archetypeCount - 1) * calculatedSpacing;
    const startY = headerHeight + (availableHeight - totalListHeight) / 2;

    for (let i = 0; i < archetypeCount; i++) {
        const key = ARCHETYPE_KEYS[i];
        const archetype = TANK_ARCHETYPES[key];
        const y = startY + i * calculatedSpacing;
        const isSelected = i === state.selectIndex;

        // Selection highlight box with archetype color
        const boxColor = isSelected ? archetype.palette.glow : '#333333';
        if (isSelected) {
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 320, y - 30, 640, 60, boxColor, 2, true);
        }

        // Tank preview shape with unique archetype visuals
        const previewX = CANVAS_WIDTH / 2 - 260;
        const previewColor = isSelected ? archetype.palette.base : '#444444';
        const previewSize = isSelected ? 26 : 22;
        renderer.drawRegularPolygon(previewX, y, previewSize, archetype.chassisShape, 0, previewColor, isSelected);

        // Draw turret/barrel
        const turretAngle = Math.PI / 4;  // 45 degrees
        const turretLength = archetype.turretLength * (isSelected ? 0.8 : 0.6);
        const turretEndX = previewX + Math.cos(turretAngle) * turretLength;
        const turretEndY = y - Math.sin(turretAngle) * turretLength;
        renderer.drawLine(previewX, y, turretEndX, turretEndY, previewColor, archetype.turretWidth * (isSelected ? 1 : 0.8), isSelected);

        // Archetype name
        const textColor = isSelected ? COLORS.white : '#666666';
        const nameX = CANVAS_WIDTH / 2 - 180;
        renderer.drawText(archetype.name, nameX, y - 10, textColor, isSelected ? 18 : 16, 'left', isSelected);

        // Archetype description
        const descColor = isSelected ? '#888888' : '#444444';
        renderer.drawText(archetype.description, nameX, y + 8, descColor, 11, 'left', false);

        // Ability name and description (right side)
        const abilityX = CANVAS_WIDTH / 2 + 50;
        const abilityColor = isSelected ? archetype.palette.glow : '#555555';
        renderer.drawText(archetype.abilityName, abilityX, y - 10, abilityColor, isSelected ? 14 : 12, 'left', isSelected);
        const abilityDescColor = isSelected ? '#aaaaaa' : '#444444';
        renderer.drawText(archetype.abilityDesc, abilityX, y + 8, abilityDescColor, 10, 'left', false);
    }

    // Controls hint (at bottom with padding)
    renderer.drawText('↑↓ SELECT   SPACE CONFIRM', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 25, '#555555', 12, 'center', false);
}

function renderLottery() {
    const ctx = renderer.ctx;

    // World elements at scaled coordinates (background)
    ctx.save();
    ctx.scale(WORLD_SCALE, WORLD_SCALE);
    renderer.drawGrid(100, '#0a0a15');

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }
    ctx.restore();

    // Dim overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // UI at 1:1 scale
    const player = getCurrentPlayer();
    const playerIndex = state.currentPlayer;

    // Header with glow
    renderer.setGlow(COLORS.cyan, 20);
    renderer.drawText('INCOMING SALVAGE', CANVAS_WIDTH / 2, 60, COLORS.cyan, 32, 'center', true);
    renderer.clearGlow();

    // Show current player
    renderer.drawText(`PLAYER ${playerIndex + 1}`, CANVAS_WIDTH / 2, 95, player.color, 18, 'center', true);

    // Card dimensions and positioning (4 cards now)
    const cardWidth = 160;    // Slightly narrower to fit 4
    const cardHeight = 220;   // Slightly shorter
    const cardSpacing = 30;   // Tighter spacing
    const totalWidth = cardWidth * 4 + cardSpacing * 3;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const cardY = CANVAS_HEIGHT / 2 - cardHeight / 2;

    // Animation offset for descending cards
    let yOffset = 0;
    if (state.lottery.animationPhase === 'descending') {
        const progress = state.lottery.animationTimer / 400;
        yOffset = -400 * (1 - easeOutBounce(progress));
    }

    // Render all 4 cards (3 random + 1 guaranteed Mortar)
    const revealed = state.lottery.animationPhase !== 'descending';
    for (let i = 0; i < 4; i++) {
        const card = state.lottery.cards[i];
        if (!card) continue;

        const x = startX + i * (cardWidth + cardSpacing);
        const y = cardY + yOffset;
        const isSelected = i === state.lottery.selectedIndex;

        renderLotteryCard(card, x, y, cardWidth, cardHeight, isSelected, i + 1, revealed);
    }

    // Reroll indicator
    const rerolls = player.rerollsRemaining;
    const rerollText = rerolls > 0 ? `Reroll: ${rerolls} remaining [R]` : 'No rerolls left';
    const rerollColor = rerolls > 0 ? '#888888' : '#444444';
    renderer.drawText(rerollText, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 80, rerollColor, 16, 'center', false);

    // Controls hint
    renderer.drawText('Press 1-4 to select  |  ← → to highlight  |  SPACE to confirm  |  1 = Default', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50, '#666666', 14, 'center', false);
}

/**
 * Render a single lottery card
 */
function renderLotteryCard(card, x, y, width, height, isSelected, number, revealed) {
    const colors = revealed ? LOTTERY_RARITY_COLORS[card.rarity] : LOTTERY_RARITY_COLORS.common;

    // Card background
    renderer.ctx.fillStyle = colors.bg;
    renderer.ctx.fillRect(x, y, width, height);

    // Selection glow and border
    if (isSelected && revealed) {
        renderer.setGlow(colors.glow, 25);
    }

    // Border
    const borderWidth = isSelected ? 4 : 2;
    renderer.ctx.strokeStyle = revealed ? colors.border : '#444444';
    renderer.ctx.lineWidth = borderWidth;
    renderer.ctx.strokeRect(x, y, width, height);
    renderer.clearGlow();

    // Card back (unrevealed)
    if (!revealed) {
        renderer.drawText('?', x + width / 2, y + height / 2 + 15, '#444444', 64, 'center', false);
        renderer.drawText(`[${number}]`, x + width / 2, y + height - 30, '#333333', 18, 'center', false);
        return;
    }

    // === REVEALED CARD ===

    // Rarity label at top
    const rarityLabel = card.rarity.toUpperCase();
    renderer.drawText(rarityLabel, x + width / 2, y + 20, colors.border, 11, 'center', false);

    // Show "SAFE PICK" for guaranteed Mortar card
    if (card.guaranteed) {
        renderer.drawText('DEFAULT WEAPON', x + width / 2, y + 35, '#00ff88', 10, 'center', false);
    }

    // Weapon name with glow
    renderer.setGlow(colors.glow, 10);
    renderer.drawText(card.name, x + width / 2, y + 55, '#ffffff', 16, 'center', true);
    renderer.clearGlow();

    // Animated projectile preview
    const weapon = WEAPONS[card.weaponKey];
    if (weapon) {
        const previewY = y + 85;
        const bounce = Math.sin(state.time * 6) * 3;
        const pulse = 0.8 + Math.sin(state.time * 5) * 0.2;
        const previewRadius = (weapon.projectileRadius || 6) * pulse * 1.3;

        renderer.setGlow(weapon.color || colors.glow, 15);
        renderer.drawCircle(x + width / 2, previewY + bounce, previewRadius, weapon.color || '#ffffff', true);
        renderer.clearGlow();

        // Trail effect
        for (let t = 1; t <= 3; t++) {
            const trailX = x + width / 2 - t * 8;
            const alpha = 0.4 - t * 0.1;
            renderer.ctx.globalAlpha = alpha;
            renderer.drawCircle(trailX, previewY + bounce, previewRadius * (1 - t * 0.2), weapon.color || '#ffffff', true);
        }
        renderer.ctx.globalAlpha = 1;
    }

    // Stats
    const statsY = y + 115;
    renderer.drawText(`DMG: ${card.damage}`, x + width / 2, statsY, '#aaaaaa', 12, 'center', false);
    renderer.drawText(`Radius: ${card.blastRadius}`, x + width / 2, statsY + 16, '#aaaaaa', 12, 'center', false);

    // Description (truncated if too long - shorter for narrower cards)
    const desc = card.description && card.description.length > 20
        ? card.description.slice(0, 17) + '...'
        : (card.description || '');
    renderer.drawText(desc, x + width / 2, statsY + 38, '#666666', 9, 'center', false);

    // Selection number at bottom
    const numColor = isSelected ? '#ffffff' : '#555555';
    renderer.drawText(`[${number}]`, x + width / 2, y + height - 20, numColor, 18, 'center', isSelected);

    // Rarity-specific visual effects
    if (card.rarity === 'legendary' && isSelected) {
        // Golden particles around the card
        const particleCount = 3;
        for (let i = 0; i < particleCount; i++) {
            const angle = state.time * 2 + (i * Math.PI * 2 / particleCount);
            const px = x + width / 2 + Math.cos(angle) * (width / 2 + 10);
            const py = y + height / 2 + Math.sin(angle) * (height / 2 + 10);
            renderer.setGlow('#ffdd00', 10);
            renderer.drawCircle(px, py, 3, '#ffaa00', true);
            renderer.clearGlow();
        }
    } else if (card.rarity === 'epic' && isSelected) {
        // Purple lightning effect at corners
        renderer.ctx.strokeStyle = '#cc44ff';
        renderer.ctx.lineWidth = 1;
        renderer.ctx.globalAlpha = 0.5 + Math.sin(state.time * 10) * 0.3;
        renderer.ctx.beginPath();
        renderer.ctx.moveTo(x, y);
        renderer.ctx.lineTo(x + 15 + Math.random() * 5, y + 15 + Math.random() * 5);
        renderer.ctx.stroke();
        renderer.ctx.globalAlpha = 1;
    }
}

/**
 * Easing function for card animation
 */
function easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
        return n1 * t * t;
    } else if (t < 2 / d1) {
        return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
        return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
}

// ============================================================================
// Game Loop
// ============================================================================

let renderer;
let lastTime = 0;
let fpsCounter = { frames: 0, lastCheck: 0, fps: 60 };

function gameLoop(currentTime) {
    const now = performance.now();
    let dt = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;

    // FPS counter
    fpsCounter.frames++;
    if (now - fpsCounter.lastCheck >= 1000) {
        fpsCounter.fps = fpsCounter.frames;
        fpsCounter.frames = 0;
        fpsCounter.lastCheck = now;
    }

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

    // Initialize post-processing effects
    initPostFX(CANVAS_WIDTH, CANVAS_HEIGHT);

    // Initialize ambient world systems (clouds, UFOs, weather) - use virtual dimensions
    const ambient = initAmbient(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Set up damage callbacks for UFO shots and lightning
    ambient.setDamageCallbacks(
        // Terrain damage callback
        (x, y, radius) => {
            terrain.destroy(x, y, radius);
            particles.sparks(x, y, 15, '#ffaa00');
        },
        // Tank damage callback
        (player, damage, x, y) => {
            if (player.health > 0) {
                // Apply FORTRESS damage reduction
                const reduction = getArchetypeDamageReduction(player);
                const finalDamage = damage * (1 - reduction);
                player.health = Math.max(0, player.health - finalDamage);
                particles.sparks(x, y, 20, '#ff0000');
                renderer.addScreenShake(8);
                // Check for death
                if (player.health <= 0) {
                    triggerDeathExplosion(player, false);
                }
            }
        }
    );

    // Set up desperation beacon drop callback
    ambient.setBeaconDropCallback((shipX, shipY) => {
        dropDesperationBeacon(shipX, shipY);
    });

    // Generate terrain for title screen background (use virtual dimensions)
    terrain.generate(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, getSpawnPositions(NUM_PLAYERS), 250);
    terrain.generateProps();  // Add stylized props

    // Position initial players on terrain (for title screen preview)
    state.players.forEach(p => {
        p.y = terrain.getHeightAt(p.x) - TANK_RADIUS;
    });

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
