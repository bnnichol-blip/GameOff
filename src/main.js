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

// ============================================================================
// Game Constants
// ============================================================================

// Display canvas (actual screen size)
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 900;

// Virtual world dimensions (2x larger, rendered at 0.5x scale)
const VIRTUAL_WIDTH = 3840;
const VIRTUAL_HEIGHT = 1800;
const WORLD_SCALE = CANVAS_WIDTH / VIRTUAL_WIDTH;  // 0.5

const NUM_PLAYERS = 5;  // Support 5-6 players
const DEFAULT_GRAVITY = 0.15;   // Lower gravity for longer flight paths in larger world
const MAX_POWER = 28;           // Adjusted for 2x world size
const CHARGE_RATE = 0.012;      // Slower charge for more precise timing (~3 sec for full)
const DEBUG_SHOW_VELOCITY = false;  // Set true to show muzzle velocity debug
const VOID_RISE_PER_ROUND = 0;  // Disabled - was causing premature game ends
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
const SHOP_OFFERING_COUNT = 6;

// Player colors for up to 6 players
const PLAYER_COLORS = [
    '#00ffff',  // Cyan - P1
    '#ff00ff',  // Magenta - P2
    '#00ff00',  // Green - P3
    '#ffaa00',  // Orange - P4
    '#ff4444',  // Red - P5
    '#8888ff'   // Blue - P6
];

/**
 * Generate spawn X positions evenly spaced across the virtual world
 */
function getSpawnPositions(numPlayers) {
    const margin = 800;  // Large margin for 2x world (keeps tanks away from edges)
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
function createPlayers(numPlayers, isAIGame = false) {
    const spawnXs = getSpawnPositions(numPlayers);
    const players = [];
    for (let i = 0; i < numPlayers; i++) {
        players.push({
            x: spawnXs[i],
            y: 0,  // Will be set by terrain
            vy: 0,
            angle: i < numPlayers / 2 ? 45 : 135,  // Left side aims right, right side aims left
            power: 0,
            charging: false,
            health: 100,
            color: PLAYER_COLORS[i % PLAYER_COLORS.length],
            archetype: null,      // Tank archetype (ability)
            tankType: null,       // Legacy - kept for compatibility
            isAI: isAIGame && i > 0,  // In AI mode, all except P1 are AI
            shield: 0,
            coins: STARTING_COINS,
            weapon: 'BABY_SHOT',
            voidGraceTimer: 0     // For VOIDBORN ability
        });
    }
    return players;
}

// ============================================================================
// Weapons Data
// ============================================================================

const WEAPON_TIERS = {
    CHEAP: { min: 15, max: 30 },
    MID: { min: 40, max: 70 },
    PREMIUM: { min: 80, max: 120 },
    SPECTACLE: { min: 130, max: 180 }
};

const WEAPONS = {
    // === CHEAP TIER (15-30 coins) ===
    // NOTE: All damage values doubled (×2) for increased lethality, except Napalm
    BABY_SHOT: {
        name: 'Baby Shot',
        description: 'Weak but accurate',
        cost: 15,
        tier: 'CHEAP',
        damage: 40,        // Was 20, doubled
        blastRadius: 40,
        bounces: 1,
        projectileRadius: 5,
        projectileSpeed: 1.0,
        color: '#88ffff'
    },
    BOUNCER: {
        name: 'Bouncer',
        description: '4 bounces, trick shots',
        cost: 20,
        tier: 'CHEAP',
        damage: 50,        // Was 25, doubled
        blastRadius: 35,
        bounces: 4,
        projectileRadius: 5,
        projectileSpeed: 1.1,
        color: '#ffff44'
    },
    DIRT_BALL: {
        name: 'Dirt Ball',
        description: 'Builds terrain mound',
        cost: 20,
        tier: 'CHEAP',
        damage: 10,        // Was 5, doubled
        blastRadius: 45,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.75,
        color: '#aa7744',
        terrainEffect: 'build'
    },
    DIGGER: {
        name: 'Digger',
        description: 'Removes terrain',
        cost: 25,
        tier: 'CHEAP',
        damage: 0,         // No damage, unchanged
        blastRadius: 70,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 0.9,
        color: '#996633',
        terrainEffect: 'dig'
    },
    ROLLER: {
        name: 'Roller',
        description: 'Rolls along terrain',
        cost: 30,
        tier: 'CHEAP',
        damage: 60,        // Was 30, doubled
        blastRadius: 45,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85,
        color: '#aaaaaa',
        behavior: 'roller'
    },

    // === MID TIER (40-70 coins) ===
    MORTAR: {
        name: 'Mortar',
        description: 'Large blast, reliable',
        cost: 40,
        tier: 'MID',
        damage: 80,        // Was 40, doubled
        blastRadius: 80,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.95,
        color: '#00ffff'
    },
    SPLITTER: {
        name: 'Splitter',
        description: 'Splits into 3 on bounce',
        cost: 45,
        tier: 'MID',
        damage: 40,        // Was 20, doubled
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 1.0,
        color: '#ff8844',
        behavior: 'splitter',
        splitCount: 3
    },
    HEAVY_SHELL: {
        name: 'Heavy Shell',
        description: 'Slow, massive damage',
        cost: 50,
        tier: 'MID',
        damage: 140,       // Was 70, doubled
        blastRadius: 60,
        bounces: 1,
        projectileRadius: 10,
        projectileSpeed: 0.6,
        color: '#ff4444'
    },
    DRILL: {
        name: 'Drill',
        description: 'Pierces terrain',
        cost: 55,
        tier: 'MID',
        damage: 90,        // Was 45, doubled
        blastRadius: 40,
        bounces: 0,
        projectileRadius: 5,
        projectileSpeed: 1.2,
        color: '#cccccc',
        behavior: 'drill'
    },
    SHIELD: {
        name: 'Shield',
        description: '50% damage reduction',
        cost: 55,
        tier: 'MID',
        damage: 0,         // No damage, unchanged
        blastRadius: 40,
        bounces: 0,
        projectileRadius: 10,
        projectileSpeed: 0.6,
        color: '#44ffff',
        behavior: 'shield',
        shieldReduction: 0.5
    },
    SEEKER: {
        name: 'Seeker',
        description: 'Slight homing',
        cost: 60,
        tier: 'MID',
        damage: 70,        // Was 35, doubled
        blastRadius: 45,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 0.9,
        color: '#ff44ff',
        behavior: 'seeker',
        seekStrength: 0.02
    },
    CLUSTER: {
        name: 'Cluster',
        description: 'Splits into 5 bomblets',
        cost: 65,
        tier: 'MID',
        damage: 30,        // Was 15, doubled
        blastRadius: 35,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85,
        color: '#ffaa00',
        behavior: 'cluster',
        clusterCount: 5
    },

    // === PREMIUM TIER (80-120 coins) ===
    RAILGUN: {
        name: 'Railgun',
        description: 'Direct hit bonus',
        cost: 80,
        tier: 'PREMIUM',
        damage: 190,       // Was 95, doubled
        blastRadius: 30,
        bounces: 2,
        projectileRadius: 5,
        projectileSpeed: 1.35,
        color: '#ffffff',
        directHitRadius: 12,
        directHitBonus: 1.5,
        minDamageFalloff: 0.4
    },
    MIRV: {
        name: 'MIRV',
        description: '3 clusters of 3',
        cost: 90,
        tier: 'PREMIUM',
        damage: 20,        // Was 10, doubled
        blastRadius: 25,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#ff6600',
        behavior: 'mirv',
        splitCount: 3,
        clusterCount: 3
    },
    QUAKE: {
        name: 'Quake',
        description: 'Hurts grounded enemies',
        cost: 100,
        tier: 'PREMIUM',
        damage: 80,        // Was 40, doubled
        blastRadius: 100,
        bounces: 0,
        projectileRadius: 9,
        projectileSpeed: 0.7,
        color: '#886644',
        behavior: 'quake'
    },
    TELEPORTER: {
        name: 'Teleporter',
        description: 'Warp to impact point',
        cost: 100,
        tier: 'PREMIUM',
        damage: 0,         // No damage, unchanged
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 1.0,
        color: '#aa44ff',
        behavior: 'teleporter'
    },
    VOID_RIFT: {
        name: 'Void Rift',
        description: 'Raises void +60px',
        cost: 110,
        tier: 'PREMIUM',
        damage: 40,        // Was 20, doubled
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#8800ff',
        behavior: 'voidRift',
        voidRise: 60
    },

    // === SPECTACLE TIER (130-180 coins) ===
    NAPALM: {
        name: 'Napalm',
        description: 'Burning field 8 sec',
        cost: 130,
        tier: 'SPECTACLE',
        damage: 15,        // UNCHANGED - Napalm exempt from damage boost
        blastRadius: 60,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#ff4400',
        behavior: 'napalm',
        fieldDuration: 8,
        fieldDamage: 10
    },
    CHAIN_LIGHTNING: {
        name: 'Chain Lightning',
        description: 'Arcs to nearby target',
        cost: 150,
        tier: 'SPECTACLE',
        damage: 80,        // Was 40, doubled
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 1.3,
        color: '#44ffff',
        behavior: 'chainLightning',
        chainDamage: 50,   // Was 25, doubled
        chainRange: 200
    },
    NUKE: {
        name: 'Nuke',
        description: 'Massive blast, 3s fuse',
        cost: 180,
        tier: 'SPECTACLE',
        damage: 160,       // Was 80, doubled
        blastRadius: 350,  // Was 150, more than doubled for cinematic effect
        bounces: 0,
        projectileRadius: 12,
        projectileSpeed: 0.5,
        color: '#ffff00',
        behavior: 'nuke',
        fuseTime: 3
    }
};

// Weapon keys for iteration
const WEAPON_KEYS = Object.keys(WEAPONS);

// ============================================================================
// Tank Types (kept for visual shapes, will use WEAPONS for stats)
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
        projectileSpeed: 0.95,  // Slightly slower for lobbed mortar feel
        shape: 6  // hexagon
    },
    PHANTOM: {
        name: 'PHANTOM',
        description: 'Railgun - Devastating direct hits',
        weapon: 'Railgun',
        damage: 95,           // High base damage
        blastRadius: 30,      // Slightly larger for more forgiving hits
        bounces: 2,
        projectileRadius: 5,  // Slightly larger projectile
        projectileSpeed: 1.35, // Fast but not overwhelming
        shape: 3,             // triangle
        // Railgun-specific properties
        directHitRadius: 12,  // "Core" zone for bonus damage
        directHitBonus: 1.5,  // 50% bonus damage on direct hits
        minDamageFalloff: 0.4 // Minimum 40% damage even at edge (reduced falloff)
    },
    CHAOS: {
        name: 'CHAOS',
        description: 'Cluster - Splits into 5 bomblets',
        weapon: 'Cluster',
        damage: 15,  // Per bomblet
        blastRadius: 35,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85, // Slower cluster for spread visibility
        shape: 5,  // pentagon
        clusterCount: 5
    },
    DIGGER: {
        name: 'DIGGER',
        description: 'Excavator - Removes terrain, no damage',
        weapon: 'Excavator',
        damage: 0,            // No damage
        blastRadius: 70,      // Large dig radius
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 0.9, // Utility speed
        shape: 4,             // square/diamond
        isTerrainWeapon: true,
        terrainEffect: 'dig'
    },
    BUILDER: {
        name: 'BUILDER',
        description: 'Dirt Bomb - Adds terrain mound',
        weapon: 'Dirt Bomb',
        damage: 5,            // Tiny damage (dirt impact)
        blastRadius: 55,      // Mound size
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.75, // Heavy lobbed projectile
        shape: 4,             // square/diamond
        isTerrainWeapon: true,
        terrainEffect: 'build'
    },
    SHIELD: {
        name: 'SHIELD',
        description: 'Force Field - 50% damage reduction next hit',
        weapon: 'Force Field',
        damage: 0,            // No damage
        blastRadius: 40,      // Shield visual radius
        bounces: 0,           // Doesn't bounce - deploys on impact
        projectileRadius: 10,
        projectileSpeed: 0.6, // Slow deploy - defensive choice
        shape: 8,             // Octagon (shield-like)
        isUtilityWeapon: true,
        utilityEffect: 'shield',
        shieldReduction: 0.5  // 50% damage reduction
    }
};

// ============================================================================
// Tank Archetypes (Abilities + Visuals)
// ============================================================================

const TANK_ARCHETYPES = {
    GUARDIAN: {
        name: 'GUARDIAN',
        description: 'Defensive specialist',
        abilityName: 'Energy Shield',
        abilityDesc: 'Start with 25 shield, +5 per turn (max 50)',
        abilityRules: { startShield: 25, shieldPerTurn: 5, maxShield: 50 },
        palette: { base: '#00aaff', glow: '#00ddff' },  // Light blue
        chassisShape: 8,   // Octagon - defensive
        turretLength: 30,
        turretWidth: 6
    },
    STRIKER: {
        name: 'STRIKER',
        description: 'Offensive powerhouse',
        abilityName: 'Overdrive',
        abilityDesc: '+20% damage on all weapons',
        abilityRules: { damageBonus: 0.20 },
        palette: { base: '#ff4444', glow: '#ff6666' },  // Red
        chassisShape: 3,   // Triangle - aggressive
        turretLength: 38,
        turretWidth: 5
    },
    SPECTER: {
        name: 'SPECTER',
        description: 'Aerial mobility',
        abilityName: 'Hover Jets',
        abilityDesc: 'Fall 50% slower, reduced fall damage',
        abilityRules: { fallSpeedMult: 0.5, fallDamageReduction: 0.5 },
        palette: { base: '#aa44ff', glow: '#cc66ff' },  // Purple
        chassisShape: 5,   // Pentagon - floaty
        turretLength: 32,
        turretWidth: 4
    },
    FORTRESS: {
        name: 'FORTRESS',
        description: 'Immovable anchor',
        abilityName: 'Stabilizers',
        abilityDesc: 'Immune to knockback and recoil',
        abilityRules: { knockbackImmune: true },
        palette: { base: '#888888', glow: '#aaaaaa' },  // Gray
        chassisShape: 4,   // Square - solid
        turretLength: 28,
        turretWidth: 8
    },
    HUNTER: {
        name: 'HUNTER',
        description: 'Precision tracker',
        abilityName: 'Target Lock',
        abilityDesc: 'All projectiles have slight homing',
        abilityRules: { homingStrength: 0.015 },
        palette: { base: '#ffaa00', glow: '#ffcc00' },  // Orange
        chassisShape: 6,   // Hexagon - tactical
        turretLength: 35,
        turretWidth: 4
    },
    RICOCHET: {
        name: 'RICOCHET',
        description: 'Bounce master',
        abilityName: 'Elastic Rounds',
        abilityDesc: '+1 bounce on all weapons',
        abilityRules: { bonusBounces: 1 },
        palette: { base: '#00ff88', glow: '#44ffaa' },  // Teal/green
        chassisShape: 5,   // Pentagon
        turretLength: 34,
        turretWidth: 5
    },
    VOIDBORN: {
        name: 'VOIDBORN',
        description: 'Void-touched survivor',
        abilityName: 'Void Resistance',
        abilityDesc: 'Survive void contact for 1 second',
        abilityRules: { voidGracePeriod: 1.0 },  // seconds
        palette: { base: '#ff00ff', glow: '#ff44ff' },  // Magenta
        chassisShape: 6,   // Hexagon
        turretLength: 30,
        turretWidth: 6
    },
    MERCHANT: {
        name: 'MERCHANT',
        description: 'Economic advantage',
        abilityName: 'Trade Routes',
        abilityDesc: '+15 bonus coins per turn',
        abilityRules: { bonusCoins: 15 },
        palette: { base: '#ffff00', glow: '#ffff66' },  // Yellow/gold
        chassisShape: 4,   // Square - merchant cart
        turretLength: 26,
        turretWidth: 7
    }
};

const ARCHETYPE_KEYS = Object.keys(TANK_ARCHETYPES);

// ============================================================================
// Game State
// ============================================================================

const state = {
    players: createPlayers(NUM_PLAYERS),
    currentPlayer: 0,
    turnCount: 0,
    phase: 'title',  // 'title' | 'mode_select' | 'select_p1' | 'select_p2' | 'aiming' | 'firing' | 'resolving' | 'shop' | 'gameover'
    selectIndex: 0,  // Current selection in menus
    gameMode: null,  // '1p' | '2p'
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
    buffNotification: null  // { playerIndex, buffType, timer }
};

// Tank type keys for selection
const TANK_TYPE_KEYS = Object.keys(TANK_TYPES);

// Derived value (Codex suggestion)
function getCurrentRound() {
    const playersAlive = state.players.filter(p => p.health > 0).length;
    return Math.floor(state.turnCount / Math.max(playersAlive, 1)) + 1;
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
 * Apply turn-start abilities (GUARDIAN shield regen, MERCHANT coins)
 */
function applyTurnStartAbilities(player) {
    const arch = getArchetype(player);
    if (!arch) return;

    // GUARDIAN: Shield regeneration
    if (arch.abilityRules.shieldPerTurn) {
        const maxShield = arch.abilityRules.maxShield || 50;
        player.shield = Math.min(player.shield + arch.abilityRules.shieldPerTurn, maxShield);
    }

    // MERCHANT: Bonus coins
    if (arch.abilityRules.bonusCoins) {
        player.coins += arch.abilityRules.bonusCoins;
    }
}

/**
 * Apply initial abilities when game starts (GUARDIAN starting shield)
 */
function applyGameStartAbilities(player) {
    const arch = getArchetype(player);
    if (!arch) return;

    // GUARDIAN: Starting shield
    if (arch.abilityRules.startShield) {
        player.shield = arch.abilityRules.startShield;
    }
}

/**
 * Get damage multiplier from archetype (STRIKER)
 */
function getArchetypeDamageMultiplier(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.damageBonus) {
        return 1 + arch.abilityRules.damageBonus;
    }
    return 1;
}

/**
 * Get bonus bounces from archetype (RICOCHET)
 */
function getArchetypeBonusBounces(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.bonusBounces) {
        return arch.abilityRules.bonusBounces;
    }
    return 0;
}

/**
 * Get homing strength from archetype (HUNTER)
 */
function getArchetypeHomingStrength(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.homingStrength) {
        return arch.abilityRules.homingStrength;
    }
    return 0;
}

/**
 * Get fall speed multiplier from archetype (SPECTER)
 */
function getArchetypeFallSpeedMult(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.fallSpeedMult) {
        return arch.abilityRules.fallSpeedMult;
    }
    return 1;
}

/**
 * Check if player is immune to knockback (FORTRESS)
 */
function isKnockbackImmune(player) {
    const arch = getArchetype(player);
    return arch && arch.abilityRules.knockbackImmune;
}

/**
 * Get void grace period from archetype (VOIDBORN)
 */
function getVoidGracePeriod(player) {
    const arch = getArchetype(player);
    if (arch && arch.abilityRules.voidGracePeriod) {
        return arch.abilityRules.voidGracePeriod;
    }
    return 0;
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

    // SAVAGE TERRAIN DESTRUCTION
    const deathBlastRadius = isVoidDeath ? 80 : 120;
    terrain.destroy(x, y, deathBlastRadius);

    // MULTI-STAGE EXPLOSION
    if (isVoidDeath) {
        // Void death: purple/magenta themed explosion being sucked into void
        particles.explosion(x, y, 150, COLORS.magenta, 100);
        particles.explosion(x, y, 100, '#8800ff', 80);
        particles.explosion(x, y, 80, color, 60);
        particles.sparks(x, y, 60, COLORS.magenta);
        // Downward particle trail as if being pulled into void
        for (let i = 0; i < 20; i++) {
            setTimeout(() => {
                particles.sparks(x + (Math.random() - 0.5) * 40, y + i * 5, 5, '#8800ff');
            }, i * 20);
        }
    } else {
        // Combat death: brilliant white-hot explosion
        particles.explosion(x, y, 200, COLORS.white, 150);
        particles.explosion(x, y, 150, color, 120);
        particles.explosion(x, y, 100, COLORS.orange, 80);
        particles.sparks(x, y, 80, COLORS.yellow);
        particles.sparks(x, y, 60, color);
    }

    // Delayed secondary explosions (debris)
    setTimeout(() => {
        particles.explosion(x - 30, y - 20, 40, COLORS.orange, 40);
        particles.sparks(x + 40, y, 30, COLORS.yellow);
    }, 100);
    setTimeout(() => {
        particles.explosion(x + 25, y + 15, 35, color, 35);
        terrain.destroy(x, y + 30, 40);  // Additional terrain damage
    }, 200);

    // Screen effects
    renderer.addScreenShake(isVoidDeath ? 40 : 50);
    renderer.flash(isVoidDeath ? COLORS.magenta : COLORS.white, 0.5);
    setTimeout(() => renderer.flash(color, 0.25), 100);

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
}

function resetGame() {
    const isAIGame = state.gameMode === '1p';

    // Create players and get spawn positions
    state.players = createPlayers(NUM_PLAYERS, isAIGame);
    const spawnXs = getSpawnPositions(NUM_PLAYERS);

    // Generate terrain with spawn positions for balancing (use virtual dimensions)
    terrain.generate(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, spawnXs);

    // Position tanks on terrain
    state.players.forEach(p => {
        p.y = terrain.getHeightAt(p.x) - TANK_RADIUS;
    });

    // Reset shop arrays for N players
    state.shopSelections = new Array(NUM_PLAYERS).fill(0);
    state.shopReady = new Array(NUM_PLAYERS).fill(false);

    state.currentPlayer = 0;
    state.turnCount = 0;
    state.phase = 'select_p1';
    state.selectIndex = 0;
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
    state.wind = 0;
    state.extraBounces = 0;
    state.recoilPending = false;
    state.voidSurgePending = false;
    // Reset UFO buffs
    state.ufoBuffs = Array.from({ length: NUM_PLAYERS }, () => ({ damage: 0, blast: 0, bounces: 0 }));
    state.buffNotification = null;
    // Reset shop state
    state.shopOfferings = [];
    state.shopSelections = Array(NUM_PLAYERS).fill(0);
    state.shopReady = Array(NUM_PLAYERS).fill(false);
    // Reset persistent fields
    state.fields = [];
    // Reset active nukes
    state.nukes = [];
    state.nukeShockwave = null;
}

function startGame() {
    // Called after both players select tanks
    state.phase = 'aiming';

    // Apply initial archetype abilities (e.g., GUARDIAN starting shield)
    state.players.forEach(p => applyGameStartAbilities(p));

    // Roll initial glitch event for round 1 (both players will share it)
    rollNewGlitchEvent();

    // If AI's turn first (shouldn't happen normally), prepare AI
    if (getCurrentPlayer().isAI) {
        prepareAITurn();
    }
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

    // Apply nonlinear charge curve for better range at high charge
    const effectivePower = chargeToPower(player.power);
    // Apply velocity multiplier from events (TIME DILATION, MUZZLE OVERCHARGE/DAMPEN)
    const speed = effectivePower * MAX_POWER * weapon.projectileSpeed * state.velocityMultiplier;

    // Get UFO buffs for current player
    const buffs = state.ufoBuffs[state.currentPlayer];
    const damageMultiplier = 1 + (buffs.damage * (UFO_BUFF_TYPES.DAMAGE.multiplier - 1));
    const blastBonus = buffs.blast * UFO_BUFF_TYPES.BLAST.bonus;
    const bounceBonus = buffs.bounces * UFO_BUFF_TYPES.BOUNCES.bonus;

    state.projectile = {
        x: player.x,
        y: player.y - 20,
        vx: Math.cos(angleRad) * speed,
        vy: -Math.sin(angleRad) * speed,
        radius: weapon.projectileRadius,
        color: weapon.color || player.color,
        bounces: 0,
        // Apply extra bounces from ELASTIC WORLD event + UFO buff + archetype (RICOCHET)
        maxBounces: weapon.bounces + state.extraBounces + bounceBonus + getArchetypeBonusBounces(player),
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

    // SEEKER behavior - slight homing toward nearest enemy
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (weapon && weapon.behavior === 'seeker' && !proj.isRolling) {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;

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
                const seekStrength = weapon.seekStrength || 0.02;
                proj.vx += (dx / dist) * seekStrength;
                proj.vy += (dy / dist) * seekStrength;
            }
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

        // Wall bounce while rolling (use virtual dimensions)
        if (proj.x < proj.radius) {
            proj.x = proj.radius;
            proj.vx = -proj.vx * 0.7;  // Bounce with energy loss
            particles.sparks(proj.x, proj.y, 15, COLORS.yellow);
            audio.playBounce();
        }
        if (proj.x > VIRTUAL_WIDTH - proj.radius) {
            proj.x = VIRTUAL_WIDTH - proj.radius;
            proj.vx = -proj.vx * 0.7;  // Bounce with energy loss
            particles.sparks(proj.x, proj.y, 15, COLORS.yellow);
            audio.playBounce();
        }

        return; // Skip normal physics while rolling
    }

    // Move
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Spawn trail particles occasionally
    if (Math.random() < 0.3) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

    // Bounce off walls
    if (proj.x < proj.radius) {
        proj.x = proj.radius;
        proj.vx = -proj.vx * 0.9;
        onBounce(proj);
    }
    if (proj.x > VIRTUAL_WIDTH - proj.radius) {
        proj.x = VIRTUAL_WIDTH - proj.radius;
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

        // DRILL behavior - pierce through terrain
        if (projWeapon && projWeapon.behavior === 'drill') {
            // Track that we're in terrain
            proj.inTerrain = true;
            // Slow down slightly while drilling
            proj.vx *= 0.99;
            proj.vy *= 0.99;
            // Spawn drill particles
            if (Math.random() < 0.5) {
                particles.sparks(proj.x, proj.y, 3, '#886644');
            }
            // Check for player collision while drilling (instant kill zone)
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

        // NUKE behavior - land and start fuse timer instead of exploding
        if (projWeapon && projWeapon.behavior === 'nuke') {
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
            // Clear projectile and end turn
            state.projectile = null;
            endTurn();
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

    // SPLITTER behavior - split into multiple projectiles on first bounce
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
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
                endTurn();
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
    const effectiveDamage = weapon.damage * buffDamageMultiplier * archetypeDamageMultiplier;

    // ENHANCED Visual effects - scale with blast radius
    // RAILGUN gets special high-impact visuals
    const isRailgun = proj.weaponKey === 'RAILGUN' || proj.tankType === 'PHANTOM';

    if (isRailgun) {
        // Railgun: Focused, intense impact - bright white core with colored burst
        particles.explosion(proj.x, proj.y, 80, COLORS.white, effectiveBlastRadius * 0.6);
        particles.explosion(proj.x, proj.y, 50, proj.color, effectiveBlastRadius);
        particles.sparks(proj.x, proj.y, 60, COLORS.cyan);
        renderer.addScreenShake(20);  // Punchy shake
        renderer.flash(COLORS.white, 0.35);  // Bright flash
        renderer.flash(proj.color, 0.2);  // Colored afterflash
    } else if (weapon.terrainEffect) {
        // Terrain weapons: Unique visual effects
        if (weapon.terrainEffect === 'dig') {
            // DIGGER: Brown/orange digging effect
            particles.explosion(proj.x, proj.y, 60, '#aa6633', effectiveBlastRadius);
            particles.sparks(proj.x, proj.y, 40, '#886622');
            renderer.addScreenShake(15);
            renderer.flash('#553311', 0.2);
        } else {
            // BUILDER: Earthy mound effect
            particles.explosion(proj.x, proj.y, 50, '#996644', effectiveBlastRadius * 0.7);
            particles.sparks(proj.x, proj.y, 30, '#664422');
            renderer.addScreenShake(12);
            renderer.flash('#442211', 0.15);
        }
    } else if (weapon.behavior === 'shield') {
        // SHIELD: Cyan forcefield effect at player position (not impact point)
        const owner = state.players[proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer];
        // Grant shield to the player who fired
        owner.shield = weapon.shieldReduction || 0.5;
        // Visual effect at owner's position
        particles.explosion(owner.x, owner.y, 60, COLORS.cyan, 50);
        particles.sparks(owner.x, owner.y, 30, COLORS.white);
        renderer.addScreenShake(8);
        renderer.flash(COLORS.cyan, 0.25);
        // Also small effect at impact point
        particles.sparks(proj.x, proj.y, 20, COLORS.cyan);
    } else {
        // Normal explosion for other weapons
        const particleCount = Math.floor(effectiveBlastRadius * 1.5);
        particles.explosion(proj.x, proj.y, particleCount, proj.color, effectiveBlastRadius);
        renderer.addScreenShake(effectiveBlastRadius / 2.5);
        renderer.flash(proj.color, 0.25);
    }

    // Handle terrain modification based on weapon type
    if (weapon.terrainEffect === 'build') {
        // BUILDER/DIRT_BALL: Add terrain mound
        terrain.raise(proj.x, proj.y, effectiveBlastRadius);
    } else {
        // Normal weapons and DIGGER: Destroy terrain
        terrain.destroy(proj.x, proj.y, effectiveBlastRadius);
    }

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

    // QUAKE behavior - damage grounded enemies (even outside blast radius)
    if (weapon.behavior === 'quake') {
        for (let i = 0; i < state.players.length; i++) {
            const player = state.players[i];
            if (player.health <= 0) continue;

            // Check if player is on terrain (grounded)
            const terrainY = terrain.getHeightAt(player.x);
            const isGrounded = Math.abs(player.y - terrainY + TANK_RADIUS) < 10;

            if (isGrounded) {
                // Already damaged by normal explosion? Add bonus ground damage
                const dist = distance(proj.x, proj.y, player.x, player.y);
                if (dist >= effectiveBlastRadius) {
                    // Outside blast radius but grounded - apply quake damage
                    const quakeDamage = effectiveDamage * 0.5;
                    player.health = Math.max(0, player.health - quakeDamage);
                    hitOccurred = true;

                    // Track damage for coins
                    if (i !== firingPlayerIndex) {
                        totalEnemyDamage += quakeDamage;
                    }

                    // Visual feedback
                    particles.sparks(player.x, player.y, 20, '#886644');
                    renderer.addScreenShake(8);
                }
            }
        }

        // Quake visual - ground ripple effect
        particles.explosion(proj.x, proj.y + 20, 30, '#886644', 150);
        renderer.addScreenShake(20);
    }

    // TELEPORTER behavior - warp firing player to impact point
    if (weapon.behavior === 'teleporter') {
        const owner = state.players[firingPlayerIndex];
        if (owner && owner.health > 0) {
            // Find safe landing position on terrain
            const landingY = terrain.getHeightAt(proj.x) - TANK_RADIUS;

            // Visual effect at old position
            particles.explosion(owner.x, owner.y, 40, weapon.color, 30);

            // Teleport
            owner.x = proj.x;
            owner.y = landingY;

            // Visual effect at new position
            particles.explosion(owner.x, owner.y, 50, weapon.color, 40);
            particles.sparks(owner.x, owner.y, 30, COLORS.white);
            renderer.flash(weapon.color, 0.3);
            renderer.addScreenShake(15);
        }
    }

    // VOID RIFT behavior - raise the void
    if (weapon.behavior === 'voidRift') {
        const voidRiseAmount = weapon.voidRise || 60;
        state.voidY -= voidRiseAmount;

        // Visual feedback - ominous void pulse
        particles.explosion(proj.x, state.voidY, 60, '#8800ff', 80);
        renderer.flash('#8800ff', 0.4);
        renderer.addScreenShake(18);

        // Consume terrain below the new void level
        // (This happens naturally when void renders over terrain)
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

    // CHAIN LIGHTNING behavior - arc to secondary target
    if (weapon.behavior === 'chainLightning') {
        const chainRange = weapon.chainRange || 200;
        const chainDamage = weapon.chainDamage || 25;

        // Find nearest enemy that wasn't the primary target (or any enemy if primary missed)
        let secondaryTarget = null;
        let minDist = chainRange;

        for (const player of state.players) {
            if (player.health <= 0) continue;
            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < minDist && dist > 0) {
                minDist = dist;
                secondaryTarget = player;
            }
        }

        if (secondaryTarget) {
            // Deal chain damage
            secondaryTarget.health = Math.max(0, secondaryTarget.health - chainDamage);

            // Track for coins
            const targetIndex = state.players.indexOf(secondaryTarget);
            if (targetIndex !== firingPlayerIndex) {
                totalEnemyDamage += chainDamage;
            }

            // Store lightning arc for rendering
            state.lightningArc = {
                x1: proj.x,
                y1: proj.y,
                x2: secondaryTarget.x,
                y2: secondaryTarget.y,
                timer: 0.5,  // Display for 0.5 seconds
                color: weapon.color
            };

            // Visual feedback
            particles.sparks(secondaryTarget.x, secondaryTarget.y, 30, weapon.color);
            particles.sparks(secondaryTarget.x, secondaryTarget.y, 20, COLORS.white);
            renderer.flash(weapon.color, 0.25);

            // Check for killing blow
            if (secondaryTarget.health <= 0) {
                killingBlow = true;
                hitPlayer = secondaryTarget;
                if (targetIndex !== firingPlayerIndex) {
                    firingPlayer.coins += KILL_BONUS;
                }
            }
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
 * Spawn MIRV projectiles - first stage (3 projectiles that will each split into 3 more)
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

function endTurn() {
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

        // Apply turn-start archetype abilities to current player (GUARDIAN shield, MERCHANT coins)
        const currentPlayer = state.players[state.currentPlayer];
        if (currentPlayer.health > 0) {
            applyTurnStartAbilities(currentPlayer);
        }

        // Full round = all players have had a turn (use player count)
        const playersAlive = state.players.filter(p => p.health > 0).length;
        const isNewRound = state.turnCount % Math.max(playersAlive, 1) === 0;

        if (isNewRound) {
            state.voidY -= VOID_RISE_PER_ROUND;

            // Revert previous round's event
            if (state.activeEvent) {
                events.revertEvent(state);
                state.activeEvent = null;
            }

            // Transition to shop phase (skip shop on round 1)
            if (state.turnCount >= state.players.length) {
                enterShopPhase();
                return;  // Don't continue to aiming yet
            }

            // Roll new glitch event for this round
            rollNewGlitchEvent();
        }

        state.phase = 'aiming';

        // Prepare AI if next player is AI
        if (getCurrentPlayer().isAI) {
            prepareAITurn();
        }
    }, TURN_DELAY_MS);
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
// Shop System
// ============================================================================

/**
 * Generate random weapon offerings for the shop
 * Ensures mix of tiers: 1 cheap, 2 mid, 2 premium, 1 spectacle
 */
function generateShopOfferings() {
    const offerings = [];
    const byTier = {
        CHEAP: [],
        MID: [],
        PREMIUM: [],
        SPECTACLE: []
    };

    // Sort weapons by tier
    for (const key of WEAPON_KEYS) {
        const weapon = WEAPONS[key];
        byTier[weapon.tier].push(key);
    }

    // Shuffle each tier
    for (const tier in byTier) {
        byTier[tier].sort(() => Math.random() - 0.5);
    }

    // Pick: 1 cheap, 2 mid, 2 premium, 1 spectacle
    if (byTier.CHEAP.length > 0) offerings.push(byTier.CHEAP[0]);
    if (byTier.MID.length > 0) offerings.push(byTier.MID[0]);
    if (byTier.MID.length > 1) offerings.push(byTier.MID[1]);
    if (byTier.PREMIUM.length > 0) offerings.push(byTier.PREMIUM[0]);
    if (byTier.PREMIUM.length > 1) offerings.push(byTier.PREMIUM[1]);
    if (byTier.SPECTACLE.length > 0) offerings.push(byTier.SPECTACLE[0]);

    // Sort by cost for display
    offerings.sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost);

    return offerings;
}

/**
 * Enter the shop phase between rounds
 */
function enterShopPhase() {
    state.phase = 'shop';
    state.shopOfferings = generateShopOfferings();
    state.shopSelections = new Array(state.players.length).fill(0);
    state.shopReady = new Array(state.players.length).fill(false);

    // All AI players auto-select, and dead players are auto-ready
    for (let i = 0; i < state.players.length; i++) {
        if (state.players[i].health <= 0) {
            state.shopReady[i] = true;  // Dead players skip shop
        } else if (state.players[i].isAI) {
            aiShopSelectFor(i);
        }
    }

    checkShopComplete();
}

/**
 * AI weapon selection for a specific player index
 */
function aiShopSelectFor(playerIndex) {
    const ai = state.players[playerIndex];
    if (ai.health <= 0) {
        state.shopReady[playerIndex] = true;
        return;
    }

    let bestIndex = -1;
    let bestCost = 0;

    // Find most expensive weapon AI can afford
    for (let i = 0; i < state.shopOfferings.length; i++) {
        const weapon = WEAPONS[state.shopOfferings[i]];
        if (weapon.cost <= ai.coins && weapon.cost > bestCost) {
            bestCost = weapon.cost;
            bestIndex = i;
        }
    }

    // If found affordable weapon, buy it
    if (bestIndex >= 0) {
        state.shopSelections[playerIndex] = bestIndex;
        const weaponKey = state.shopOfferings[bestIndex];
        ai.coins -= WEAPONS[weaponKey].cost;
        ai.weapon = weaponKey;
        audio.playPurchase();
    }

    state.shopReady[playerIndex] = true;
}

/**
 * Handle player shop input
 */
function handleShopInput() {
    const playerIndex = 0;  // Only P1 uses manual shop (P2 is auto if AI)
    const player = state.players[playerIndex];

    if (state.shopReady[playerIndex]) return;

    // Navigate selection
    if (input.wasPressed('ArrowUp')) {
        state.shopSelections[playerIndex]--;
        if (state.shopSelections[playerIndex] < 0) {
            state.shopSelections[playerIndex] = state.shopOfferings.length;  // +1 for "Keep Current"
        }
        audio.playSelect();
    }
    if (input.wasPressed('ArrowDown')) {
        state.shopSelections[playerIndex]++;
        if (state.shopSelections[playerIndex] > state.shopOfferings.length) {
            state.shopSelections[playerIndex] = 0;
        }
        audio.playSelect();
    }

    // Confirm selection with Space or Enter
    if (input.spaceReleased || input.enter) {
        const selection = state.shopSelections[playerIndex];

        if (selection < state.shopOfferings.length) {
            // Buying a weapon
            const weaponKey = state.shopOfferings[selection];
            const weapon = WEAPONS[weaponKey];

            if (player.coins >= weapon.cost) {
                player.coins -= weapon.cost;
                player.weapon = weaponKey;
                state.shopReady[playerIndex] = true;
                audio.playPurchase();
            } else {
                // Can't afford - play error sound
                audio.playError();
            }
        } else {
            // Keep current weapon
            state.shopReady[playerIndex] = true;
            audio.playConfirm();
        }

        checkShopComplete();
    }
}

/**
 * Check if all players are ready to exit shop
 */
function checkShopComplete() {
    // Check if all players are ready
    const allReady = state.shopReady.every(ready => ready);
    if (allReady) {
        exitShopPhase();
    }
}

/**
 * Exit shop and continue to next round
 */
function exitShopPhase() {
    // Roll new glitch event for this round
    rollNewGlitchEvent();

    state.phase = 'aiming';

    // Prepare AI if next player is AI
    if (getCurrentPlayer().isAI) {
        prepareAITurn();
    }
}

// ============================================================================
// AI System
// ============================================================================

function prepareAITurn() {
    const ai = getCurrentPlayer();

    // Find nearest living enemy
    let target = null;
    let minDist = Infinity;
    for (let i = 0; i < state.players.length; i++) {
        if (i === state.currentPlayer) continue;
        const p = state.players[i];
        if (p.health <= 0) continue;
        const d = Math.abs(p.x - ai.x);
        if (d < minDist) {
            minDist = d;
            target = p;
        }
    }
    if (!target) return;  // No valid targets

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
    // AI needs to charge higher due to nonlinear curve (0.7 charge ≈ 0.5 effective)
    const basePower = clamp(dist / 600, 0.5, 0.98);
    const powerError = (Math.random() - 0.5) * 0.15;
    state.aiTargetPower = clamp(basePower + powerError, 0.4, 1.0);

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
    // Check for void deaths first (mark players as dead)
    // VOIDBORN archetype has a grace period before dying to void
    for (const player of state.players) {
        if (player.health > 0 && player.y + TANK_RADIUS > state.voidY) {
            const gracePeriod = getVoidGracePeriod(player);
            if (gracePeriod > 0) {
                // VOIDBORN: Start or continue grace timer
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
    // === HORIZONTAL BOUNDARY CLAMPING ===
    // Keep tanks within playfield (use virtual world dimensions)
    if (player.x < TANK_RADIUS) {
        player.x = TANK_RADIUS;
    }
    if (player.x > VIRTUAL_WIDTH - TANK_RADIUS) {
        player.x = VIRTUAL_WIDTH - TANK_RADIUS;
    }

    // === VERTICAL PHYSICS (falling) ===
    const groundY = terrain.getHeightAt(player.x);
    const tankBottom = player.y + TANK_RADIUS;

    if (tankBottom < groundY) {
        // Tank is above ground — fall
        // SPECTER archetype: Reduced fall speed (hover jets)
        const fallMult = getArchetypeFallSpeedMult(player);
        player.vy += state.gravity * fallMult;
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

    // Always update ambient world systems (clouds, UFOs, weather) for all phases
    const ambient = getAmbient();
    if (ambient) {
        ambient.update(dt, state.voidY);
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

    // Tank archetype selection phases
    if (state.phase === 'select_p1' || state.phase === 'select_p2') {
        // Auto-select for AI player
        if (state.phase === 'select_p2' && state.players[1].isAI) {
            // AI picks a random archetype after short delay
            setTimeout(() => {
                const aiChoice = ARCHETYPE_KEYS[Math.floor(Math.random() * ARCHETYPE_KEYS.length)];
                state.players[1].archetype = aiChoice;
                audio.playConfirm();
                startGame();
            }, 500);
            state.phase = 'ai_selecting';  // Temporary state to prevent re-triggering
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
            if (state.phase === 'select_p1') {
                state.players[0].archetype = selectedArchetype;
                // Assign random archetypes to all AI players and start
                for (let i = 1; i < state.players.length; i++) {
                    if (state.players[i].isAI) {
                        state.players[i].archetype = ARCHETYPE_KEYS[Math.floor(Math.random() * ARCHETYPE_KEYS.length)];
                    }
                }
                // Check if any human players remain to select
                const humanPlayersLeft = state.players.slice(1).some(p => !p.isAI && !p.archetype);
                if (humanPlayersLeft) {
                    state.phase = 'select_p2';
                    state.selectIndex = 0;
                } else {
                    startGame();
                }
            } else {
                state.players[1].archetype = selectedArchetype;
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

    // Shop phase
    if (state.phase === 'shop') {
        handleShopInput();
        // DON'T return early - let nukes update during shop!
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

    // Decay event notification timer
    if (state.activeEvent && state.activeEvent.timer > 0) {
        state.activeEvent.timer -= dt;
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

    // Update nuke shockwave effect
    if (state.nukeShockwave) {
        state.nukeShockwave.timer += dt;
        const progress = state.nukeShockwave.timer / state.nukeShockwave.duration;
        state.nukeShockwave.radius = state.nukeShockwave.maxRadius * progress;
        if (state.nukeShockwave.timer >= state.nukeShockwave.duration) {
            state.nukeShockwave = null;
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

        // Spawn fire particles
        if (Math.random() < 0.3) {
            const px = field.x + (Math.random() - 0.5) * field.radius * 1.5;
            const py = field.y - Math.random() * 30;
            particles.trail(px, py, Math.random() < 0.5 ? '#ff4400' : '#ffaa00');
        }

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
        maxRadius: effectiveBlastRadius * 2.0,  // Bigger shockwave
        timer: 0,
        duration: 1.2  // Slower, more dramatic expansion
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
}

function updateClusterBomblet(proj, dt) {
    // Store trail position
    proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
    if (proj.trail.length > 10) proj.trail.shift();

    // Apply gravity
    proj.vy += state.gravity;

    // Apply wind (WIND BLAST event)
    if (state.wind !== 0) {
        proj.vx += state.wind;
    }

    // Move
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

    // Trail particles
    if (Math.random() < 0.2) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Bounce off walls (use virtual dimensions)
    if (proj.x < proj.radius || proj.x > VIRTUAL_WIDTH - proj.radius) {
        proj.vx = -proj.vx * 0.9;
        proj.x = clamp(proj.x, proj.radius, VIRTUAL_WIDTH - proj.radius);
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

    // Check termination (use virtual dimensions)
    if (terrain.isPointBelowTerrain(proj.x, proj.y) ||
        proj.y > state.voidY ||
        proj.y > VIRTUAL_HEIGHT + 100 ||
        proj.bounces >= proj.maxBounces) {
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

    // Move
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Spawn trail particles (purple for anomaly)
    if (Math.random() < 0.4) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Bounce off walls (use virtual dimensions)
    if (proj.x < proj.radius) {
        proj.x = proj.radius;
        proj.vx = -proj.vx * 0.9;
        onAnomalyBounce(proj);
    }
    if (proj.x > VIRTUAL_WIDTH - proj.radius) {
        proj.x = VIRTUAL_WIDTH - proj.radius;
        proj.vx = -proj.vx * 0.9;
        onAnomalyBounce(proj);
    }

    // Bounce off ceiling
    if (proj.y < proj.radius) {
        proj.y = proj.radius;
        proj.vy = -proj.vy * 0.9;
        onAnomalyBounce(proj);
    }

    // Check termination: terrain, void, or out of bounds (use virtual dimensions)
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
    const tankType = TANK_TYPES.SIEGE;  // Uses SIEGE explosion stats

    // ENHANCED Visual effects - anomaly has eerie purple explosion
    particles.explosion(proj.x, proj.y, 80, proj.color, tankType.blastRadius);
    renderer.addScreenShake(25);
    renderer.flash(proj.color, 0.35);

    // Destroy terrain
    terrain.destroy(proj.x, proj.y, tankType.blastRadius);

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

    // Tank selection screen (including AI selecting)
    if (state.phase === 'select_p1' || state.phase === 'select_p2' || state.phase === 'ai_selecting') {
        renderTankSelect();
        renderer.endFrame();
        return;
    }

    // Shop phase
    if (state.phase === 'shop') {
        renderShop();
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
    terrain.draw(renderer);

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

    // Draw nuke shockwave
    if (state.nukeShockwave) {
        drawNukeShockwave(state.nukeShockwave);
    }

    // Draw all tanks
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
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

    // UFO buff notification (when a UFO is destroyed)
    if (state.buffNotification && state.buffNotification.timer > 0) {
        const notif = state.buffNotification;
        const alpha = Math.min(1, notif.timer);
        const buffInfo = UFO_BUFF_TYPES[notif.buffType];
        const playerColor = state.players[notif.playerIndex].color;

        renderer.ctx.globalAlpha = alpha;
        // Float upward animation
        const floatY = notif.y - (2 - notif.timer) * 30;
        renderer.drawText(`P${notif.playerIndex + 1} ${buffInfo.name}`, notif.x, floatY, buffInfo.color, 18, 'center', true);
        renderer.ctx.globalAlpha = 1;
    }

    // Controls hint
    if (state.phase === 'aiming') {
        const hintText = getCurrentPlayer().isAI ? 'AI is thinking...' : '← → to aim, HOLD SPACE to charge, RELEASE to fire';
        renderer.drawText(hintText, 20, CANVAS_HEIGHT - 30, '#666666', 12, 'left', false);
    } else if (state.phase === 'gameover') {
        renderer.drawText('ENTER: Rematch | ESC: Title', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50, COLORS.white, 16, 'center', true);
    }

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
    // Use weapon data for speed, fallback to tank type
    const weapon = WEAPONS[player.weapon];
    if (!weapon) return;

    // Calculate launch velocity (same as fireProjectile)
    const angleRad = degToRad(180 - player.angle);
    const effectivePower = chargeToPower(player.power);
    const speed = effectivePower * MAX_POWER * weapon.projectileSpeed * state.velocityMultiplier;

    // Initial position and velocity
    let x = player.x;
    let y = player.y - 20;
    let vx = Math.cos(angleRad) * speed;
    let vy = -Math.sin(angleRad) * speed;

    // Simulation parameters
    const maxSteps = 300;  // Maximum simulation steps
    const stepSize = 1;    // Physics step (lower = smoother but slower)
    const dotSpacing = 8;  // Pixels between dots
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

        // Stop conditions:
        // 1. Hit terrain
        if (terrain.isPointBelowTerrain(x, y)) {
            break;
        }

        // 2. Hit left/right walls (could bounce, but we show ballistic only)
        if (x < 0 || x > CANVAS_WIDTH) {
            break;
        }

        // 3. Hit ceiling
        if (y < 0) {
            break;
        }

        // 4. Hit void
        if (y > state.voidY) {
            break;
        }

        // 5. Gone way off screen
        if (y > CANVAS_HEIGHT + 100) {
            break;
        }
    }

    // Draw the arc as faint dots
    const ctx = renderer.ctx;
    ctx.save();
    ctx.globalAlpha = 0.3;

    // Use player color for the tracer
    const tracerColor = player.color;
    renderer.setGlow(tracerColor, 6);

    for (let i = 1; i < points.length; i++) {
        const point = points[i];
        // Fade dots further along the arc
        const fadeT = i / points.length;
        ctx.globalAlpha = 0.4 * (1 - fadeT * 0.5);

        // Draw small dot
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
        ctx.fillStyle = tracerColor;
        ctx.fill();
    }

    renderer.clearGlow();
    ctx.restore();
}

function drawProjectile(proj) {
    const isRailgun = proj.tankType === 'PHANTOM';

    // Trail
    for (let i = 0; i < proj.trail.length; i++) {
        const point = proj.trail[i];
        const t = i / proj.trail.length;

        if (isRailgun) {
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
    if (isRailgun) {
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

    // Flickering fire effect
    const flicker = 0.7 + Math.random() * 0.3;
    const currentRadius = field.radius * (0.5 + progress * 0.5);

    // Draw gradient fire glow
    const gradient = ctx.createRadialGradient(
        field.x, field.y, 0,
        field.x, field.y, currentRadius
    );
    gradient.addColorStop(0, `rgba(255, 100, 0, ${0.6 * flicker * progress})`);
    gradient.addColorStop(0.4, `rgba(255, 60, 0, ${0.4 * flicker * progress})`);
    gradient.addColorStop(1, 'rgba(255, 30, 0, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(field.x, field.y - 10, currentRadius, currentRadius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing edge
    renderer.setGlow('#ff4400', 20 * flicker);
    ctx.strokeStyle = `rgba(255, 170, 0, ${0.5 * progress})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(field.x, field.y - 10, currentRadius * 0.8, currentRadius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
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

function renderShop() {
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
    const round = getCurrentRound();
    const p1 = state.players[0];  // Human player for shop input

    // Header
    renderer.setGlow(COLORS.yellow, 15);
    renderer.drawText('SHOP', CANVAS_WIDTH / 2, 50, COLORS.yellow, 36, 'center', true);
    renderer.clearGlow();
    renderer.drawText(`ROUND ${round}`, CANVAS_WIDTH / 2, 85, '#888888', 16, 'center', false);

    // Player info strip across top - compact for multiple players
    const playerSpacing = Math.min(150, (CANVAS_WIDTH - 100) / state.players.length);
    for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i];
        const x = 80 + i * playerSpacing;
        const label = p.isAI ? `AI${i + 1}` : `P${i + 1}`;
        const weaponName = WEAPONS[p.weapon]?.name || 'None';
        const isDead = p.health <= 0;

        renderer.drawText(label, x, 50, isDead ? '#444' : p.color, 14, 'center', !isDead);
        renderer.drawText(`${p.coins}`, x, 68, isDead ? '#444' : COLORS.yellow, 11, 'center', false);
        if (state.shopReady[i]) {
            renderer.drawText('✓', x + 30, 58, COLORS.green, 14, 'left', false);
        }
    }

    // Weapon list
    const startY = 130;
    const spacing = 65;
    const offerings = state.shopOfferings;
    const selection = state.shopSelections[0];

    for (let i = 0; i < offerings.length; i++) {
        const weaponKey = offerings[i];
        const weapon = WEAPONS[weaponKey];
        const y = startY + i * spacing;
        const isSelected = i === selection;
        const canAfford = p1.coins >= weapon.cost;

        // Selection highlight
        if (isSelected) {
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 250, y - 25, 500, 55, COLORS.cyan, 2, true);

            // Animated projectile preview
            const previewX = CANVAS_WIDTH / 2 - 230;
            const bounce = Math.sin(state.time * 8) * 3;
            const pulse = 0.8 + Math.sin(state.time * 6) * 0.2;
            const previewRadius = (weapon.projectileRadius || 6) * pulse;

            renderer.setGlow(weapon.color, 15);
            renderer.drawCircle(previewX, y + bounce, previewRadius, weapon.color, true);
            renderer.clearGlow();

            // Trail effect
            for (let t = 1; t <= 3; t++) {
                const trailX = previewX - t * 8;
                const alpha = 0.4 - t * 0.1;
                renderer.ctx.globalAlpha = alpha;
                renderer.drawCircle(trailX, y + bounce, previewRadius * (1 - t * 0.2), weapon.color, true);
            }
            renderer.ctx.globalAlpha = 1;
        }

        // Weapon name
        let nameColor = isSelected ? COLORS.white : '#888888';
        if (!canAfford) nameColor = '#444444';
        renderer.drawText(weapon.name, CANVAS_WIDTH / 2 - 200, y - 5, nameColor, isSelected ? 20 : 16, 'left', isSelected);

        // Weapon description
        const descColor = isSelected ? '#aaaaaa' : '#555555';
        renderer.drawText(weapon.description, CANVAS_WIDTH / 2 - 200, y + 15, canAfford ? descColor : '#333333', 11, 'left', false);

        // Cost
        const costColor = canAfford ? COLORS.yellow : '#663333';
        renderer.drawText(`${weapon.cost}`, CANVAS_WIDTH / 2 + 200, y, costColor, 18, 'right', canAfford && isSelected);

        // Stats
        const statsColor = canAfford ? '#666666' : '#333333';
        renderer.drawText(`DMG:${weapon.damage} BLS:${weapon.blastRadius} BNC:${weapon.bounces}`, CANVAS_WIDTH / 2 + 200, y + 18, statsColor, 9, 'right', false);
    }

    // "Keep Current" option
    const keepY = startY + offerings.length * spacing;
    const isKeepSelected = selection === offerings.length;
    if (isKeepSelected) {
        renderer.drawRectOutline(CANVAS_WIDTH / 2 - 250, keepY - 25, 500, 55, COLORS.cyan, 2, true);
    }
    renderer.drawText('Keep Current Weapon', CANVAS_WIDTH / 2, keepY, isKeepSelected ? COLORS.white : '#888888', isKeepSelected ? 20 : 16, 'center', isKeepSelected);
    renderer.drawText('(Save your coins)', CANVAS_WIDTH / 2, keepY + 20, '#555555', 11, 'center', false);

    // Controls hint
    renderer.drawText('↑↓ SELECT   SPACE BUY   ENTER KEEP', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 25, '#555555', 12, 'center', false);
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

    // Initialize ambient world systems (clouds, UFOs, weather) - use virtual dimensions
    initAmbient(VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    // Generate terrain for title screen background (use virtual dimensions)
    terrain.generate(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, getSpawnPositions(NUM_PLAYERS));

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
