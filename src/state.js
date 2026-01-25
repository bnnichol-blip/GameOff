// ============================================================================
// state.js - Game State and Helper Functions
// ============================================================================

import { TANK_ARCHETYPES } from './weaponData.js';

// Constants needed for state initialization (exported for other modules)
export const VIRTUAL_WIDTH = 2560;
export const VIRTUAL_HEIGHT = 1440;
export const NUM_PLAYERS = 4;
export const DEFAULT_GRAVITY = 0.3;

// ============================================================================
// Biome Color Themes
// ============================================================================

export const BIOMES = {
    CYBER_VOID: { name: 'Cyber Void', hue: 0, sat: 1.0, terrain: '#050510', edge: '#00ffff', voidColor: '#ff00ff' },
    ICE_FIELD: { name: 'Ice Field', hue: 180, sat: 0.8, terrain: '#0a1520', edge: '#00ffff', voidColor: '#00ddff' },
    LAVA_CORE: { name: 'Lava Core', hue: -15, sat: 1.4, terrain: '#1a0a05', edge: '#ff4400', voidColor: '#ff2200' },
    TOXIC_ZONE: { name: 'Toxic Zone', hue: 90, sat: 1.3, terrain: '#051a0a', edge: '#44ff00', voidColor: '#88ff00' },
    VOID_RIFT: { name: 'Void Rift', hue: 270, sat: 1.2, terrain: '#100520', edge: '#8800ff', voidColor: '#aa00ff' }
};

export const BIOME_KEYS = Object.keys(BIOMES);

// Player creation function
function createPlayers(count) {
    const players = [];
    const startPositions = [
        VIRTUAL_WIDTH * 0.15,
        VIRTUAL_WIDTH * 0.85,
        VIRTUAL_WIDTH * 0.35,
        VIRTUAL_WIDTH * 0.65
    ];
    const colors = ['#00ffff', '#ff00ff', '#00ff00', '#ffaa00'];

    for (let i = 0; i < count; i++) {
        players.push({
            x: startPositions[i],
            y: 0,
            vx: 0,
            vy: 0,
            health: 100,
            maxHealth: 100,
            angle: i % 2 === 0 ? Math.PI / 4 : (3 * Math.PI) / 4,
            power: 0,
            charging: false,
            color: colors[i],
            type: 'SIEGE',
            archetype: null,
            isAI: i >= 2,  // Players beyond first 2 are AI by default
            coins: 0,
            kills: 0,
            damageDealt: 0,
            shotsFired: 0,
            inventory: [],
            ultimateMeter: 0,
            ultimateReady: false
        });
    }
    return players;
}

// ============================================================================
// Game State
// ============================================================================

export const state = {
    players: createPlayers(NUM_PLAYERS),
    currentPlayer: 0,
    turnCount: 0,
    round: 1,        // Stable round counter (incremented after all NUM_PLAYERS have taken a turn)
    phase: 'title',  // 'title' | 'mode_select' | 'archetype_select' | 'aiming' | 'firing' | 'resolving' | 'shop' | 'gameover'
    selectIndex: 0,  // Current selection in menus
    gameMode: null,  // '1p' | 'mp' (multiplayer)
    humanPlayerCount: 2,      // Number of human players (1-4)
    selectingPlayerIndex: 0,  // Which player is currently selecting archetype (0-3)
    shoppingPlayerIndex: 0,   // Which human player is currently shopping
    projectile: null,
    projectiles: [],  // For cluster bombs (multiple projectiles)
    // Shop state
    shopOfferings: [],     // Array of weapon keys available this round
    shopSelections: new Array(NUM_PLAYERS).fill(0), // Selected index for each player in shop
    shopReady: new Array(NUM_PLAYERS).fill(false), // Whether each player is ready
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
    wind: 0,                  // For WIND BLAST (horizontal force)
    extraBounces: 0,          // For ELASTIC WORLD
    recoilPending: false,     // For RECOIL KICK
    voidSurgePending: false,  // For VOID SURGE
    // UFO buff state (per player, stackable, one-turn duration)
    ufoBuffs: Array.from({ length: NUM_PLAYERS }, () => ({ damage: 0, blast: 0, bounces: 0 })),
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

    // Dying Star tracking (per player)
    dyingStarTurns: Array.from({ length: NUM_PLAYERS }, () => 0),  // Turns remaining for dying star
    storedWeapons: Array.from({ length: NUM_PLAYERS }, () => null),  // Previous weapon before dying star

    // Turn flow safety (prevents race conditions)
    turnEndLocked: false,   // Prevents multiple endTurn() calls
    firingStartTime: 0,     // For safety timeout

    // === NEW WEAPON SYSTEMS ===

    // Black Hole System - intense gravity pull then collapse
    blackHoles: [],  // { x, y, pullRadius, pullStrength, timer, duration, ownerId, color }

    // Meteor Shower System - delayed meteor impacts
    pendingMeteors: [],  // { x, delay, timer, ownerId }

    // Void Cannon Beam System - vertical orbital beams
    voidCannonBeams: [],  // { x, delay, timer, ownerId, color }

    // Lightning Arc visual effect
    lightningArc: null,  // { x1, y1, x2, y2, timer, color }

    // Biome system (visual theme)
    currentBiome: null,  // Set at game start from BIOMES

    // Death notifications for kill celebrations
    deathNotifications: []  // { text, x, y, color, timer }
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current round number.
 * Uses stable round counter that increments based on NUM_PLAYERS, not living players.
 * This fixes the bug where killing a player could trigger premature shop phases.
 */
export function getCurrentRound() {
    return state.round;
}

/**
 * Check if a new round has started (all NUM_PLAYERS have had a turn).
 * Uses stable calculation based on initial player count, not living players.
 */
export function isNewRoundComplete() {
    return state.turnCount > 0 && state.turnCount % NUM_PLAYERS === 0;
}

/**
 * Increment the round counter. Called at end of each full round.
 */
export function incrementRound() {
    state.round++;
}

/**
 * Get current player object
 */
export function getCurrentPlayer() {
    return state.players[state.currentPlayer];
}

/**
 * Get a player's archetype data (or null if none selected)
 */
export function getArchetype(player) {
    return player.archetype ? TANK_ARCHETYPES[player.archetype] : null;
}

/**
 * Get damage multiplier from archetype (STRIKER: +33% damage dealt)
 */
export function getArchetypeDamageMultiplier(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.damageBonus) {
        return 1 + arch.abilityRules.damageBonus;
    }
    return 1;
}

/**
 * Get damage reduction from archetype (FORTRESS: -33% damage taken)
 */
export function getArchetypeDamageReduction(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.damageReduction) {
        return arch.abilityRules.damageReduction;
    }
    return 0;
}

/**
 * Get homing strength from archetype (HUNTER: slight homing)
 */
export function getArchetypeHomingStrength(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.homingStrength) {
        return arch.abilityRules.homingStrength;
    }
    return 0;
}

/**
 * Get hover height from archetype (SPECTER: hover 20px above terrain)
 */
export function getArchetypeHoverHeight(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.hoverHeight) {
        return arch.abilityRules.hoverHeight;
    }
    return 0;
}

/**
 * Legacy functions kept for compatibility - return neutral values
 */
export function getArchetypeBonusBounces(player) { return 0; }
export function getArchetypeFallSpeedMult(player) { return 1; }
