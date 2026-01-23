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

const NUM_PLAYERS = 3;  // Reduced for smaller world
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
    if (proj.y < WORLD_TOP) proj.y = WORLD_TOP;
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
function createPlayers(numPlayers, isAIGame = false) {
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
            isAI: isAIGame && i > 0,  // In AI mode, all except P1 are AI
            shield: 0,
            coins: STARTING_COINS,
            weapon: 'MORTAR',
            voidGraceTimer: 0     // Legacy field
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
    // REMOVED: BABY_SHOT, MIRV, SHIELD
    BOUNCER: {
        name: 'Bouncer',
        description: 'Pinball chaos - explodes on every bounce',
        cost: 20,
        tier: 'CHEAP',
        damage: 80,        // Mortar-level damage on each bounce
        blastRadius: 80,   // Mortar-level blast radius
        bounces: 4,        // Base bounces (randomized 4-7 at fire time)
        bouncesMin: 4,     // Minimum random bounces
        bouncesMax: 7,     // Maximum random bounces
        projectileRadius: 6,
        projectileSpeed: 1.1,
        color: '#ffff44',
        behavior: 'bouncer',
        finalBlastMultiplier: 2.0  // 2x blast radius on final explosion
    },
    DIRT_BALL: {
        name: 'Dirt Ball',
        description: 'Creates massive jagged peak',
        cost: 20,
        tier: 'CHEAP',
        damage: 0,         // Utility only - no damage
        blastRadius: 120,  // Same size as Digger
        bounces: 1,
        projectileRadius: 10,
        projectileSpeed: 0.7,
        color: '#aa7744',
        terrainEffect: 'buildJagged',
        behavior: 'dirtBall'
    },
    DIGGER: {
        name: 'Digger',
        description: 'Massive jagged crater to void',
        cost: 25,
        tier: 'CHEAP',
        damage: 0,         // Utility only - no direct damage
        blastRadius: 120,  // Large crater
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#996633',
        terrainEffect: 'digJagged',
        behavior: 'digger'
    },
    ROLLER: {
        name: 'Roller',
        description: 'Shockwaves while rolling',
        cost: 30,
        tier: 'CHEAP',
        damage: 60,        // Final explosion damage
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#aaaaaa',
        behavior: 'roller',
        shockwaveInterval: 0.3,   // Emit shockwave every 0.3s
        shockwaveDamage: 20,      // ~25% of Mortar damage
        shockwaveRadius: 20       // ~25% of Mortar radius
    },

    // === MID TIER (40-70 coins) ===
    MORTAR: {
        name: 'Mortar',
        description: 'Reliable AoE baseline',
        cost: 40,
        tier: 'MID',
        damage: 80,        // THE baseline damage
        blastRadius: 80,   // THE baseline blast radius
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.95,
        color: '#00ffff'
    },
    SPLITTER: {
        name: 'Splitter',
        description: 'Double airburst split',
        cost: 45,
        tier: 'MID',
        damage: 35,        // Per fragment damage
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#ff8844',
        behavior: 'splitterAirburst',
        splitCount: 4,         // First split count
        secondSplitCount: 2,   // Each fragment splits again
        airburstDelay: 0.8     // Seconds before first split
    },
    HEAVY_SHELL: {
        name: 'Heavy Shell',
        description: 'Siege + aftershock',
        cost: 50,
        tier: 'MID',
        damage: 150,       // Very high damage
        blastRadius: 120,  // 1.5x Mortar radius for terrain carve
        bounces: 1,
        projectileRadius: 12,
        projectileSpeed: 0.5,  // Very slow
        color: '#ff4444',
        behavior: 'heavyShell',
        aftershockDamage: 20,   // ~25% of Mortar damage
        aftershockRadius: 200   // Wide but weak
    },
    DRILL: {
        name: 'Drill',
        description: 'Tunnel borer - pierces terrain',
        cost: 55,
        tier: 'MID',
        damage: 80,        // Normal mid-tier damage on exit
        blastRadius: 50,
        bounces: 0,
        projectileRadius: 6,
        projectileSpeed: 1.1,
        color: '#cccccc',
        behavior: 'drill',
        tunnelWidth: 40    // Medium-width tunnel carve
    },
    // REMOVED: SHIELD weapon
    SEEKER: {
        name: 'Seeker',
        description: 'Lock-on homing missile',
        cost: 60,
        tier: 'MID',
        damage: 70,
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85,
        color: '#ff44ff',
        behavior: 'seekerLockOn',
        seekStrength: 0.15,       // Strong homing after lock
        lockOnDelay: 0.5,         // Seconds to reach apex and lock
        ignoresTerrain: true      // Keeps chasing through terrain
    },
    CLUSTER: {
        name: 'Cluster',
        description: 'Wide spray of bomblets',
        cost: 65,
        tier: 'MID',
        damage: 25,        // Low damage each
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#ffaa00',
        behavior: 'cluster',
        clusterCount: 8    // Many bomblets, wide spray
    },

    // === PREMIUM TIER (80-120 coins) ===
    RAILGUN: {
        name: 'Railgun',
        description: 'Charge beam with ricochet',
        cost: 80,
        tier: 'PREMIUM',
        damage: 120,       // Line damage to everything along path
        blastRadius: 20,   // Small explosion at terminus
        bounces: 2,        // Beam bounces off walls/ceiling
        projectileRadius: 4,
        projectileSpeed: 0,  // Instant beam (handled specially)
        color: '#ffffff',
        behavior: 'railgunBeam',
        chargeTime: 1.5,       // Seconds to charge
        beamWidth: 8,
        maxBeamLength: 3000    // Long range
    },
    // REMOVED: MIRV weapon
    QUAKE: {
        name: 'Quake',
        description: 'Spreading ground shockwaves',
        cost: 100,
        tier: 'PREMIUM',
        damage: 80,        // Impact damage
        blastRadius: 60,   // Initial impact radius
        bounces: 0,
        projectileRadius: 10,
        projectileSpeed: 0.65,
        color: '#886644',
        behavior: 'quakeSpread',
        shockwaveCount: 4,     // Number of shockwave rings
        shockwaveDelay: 0.15,  // Delay between rings
        shockwaveFalloff: 0.25 // Damage reduction per ring
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
        description: 'Lingering fire field x2 radius',
        cost: 130,
        tier: 'SPECTACLE',
        damage: 15,        // UNCHANGED - Napalm exempt from damage boost
        blastRadius: 120,  // Field radius x2 (was 60)
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#ff4400',
        behavior: 'napalm',
        fieldDuration: 8,  // Duration unchanged
        fieldDamage: 10    // Damage per second unchanged
    },
    CHAIN_LIGHTNING: {
        name: 'Chain Lightning',
        description: 'Overload - huge first hit, one jump',
        cost: 150,
        tier: 'SPECTACLE',
        damage: 140,       // Huge damage on first target (Overload)
        blastRadius: 25,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 1.3,
        color: '#44ffff',
        behavior: 'chainLightningOverload',
        chainDamage: 70,   // 50% of first hit damage
        chainRange: 250,   // Good range for the jump
        maxChains: 1       // Only one additional jump
    },
    NUKE: {
        name: 'Nuke',
        description: 'Cinematic multi-stage detonation',
        cost: 180,
        tier: 'SPECTACLE',
        damage: 180,       // Massive damage
        blastRadius: 400,  // Huge blast
        bounces: 0,
        projectileRadius: 14,
        projectileSpeed: 0.45,  // Very slow approach
        color: '#ffff00',
        behavior: 'nukeCinematic',
        fuseTime: 3,
        // Multi-stage detonation
        stageCount: 4,         // Number of explosion stages
        stageDelay: 0.25,      // Delay between stages
        mushroomCloudDuration: 2.0,  // How long the mushroom cloud lingers
        slowMoFactor: 0.3      // Slow motion during detonation
    },

    // === ORBITAL TIER (Limited Stock - purchased from space battle) ===
    ORBITAL_BEACON: {
        name: 'Orbital Beacon',
        description: 'Call down devastating beam from capital ship (2.5s delay)',
        cost: 300,
        tier: 'ORBITAL',
        damage: 75,
        blastRadius: 150,
        edgeDamage: 50,
        bounces: 0,
        projectileRadius: 8,
        projectileSpeed: 0.9,
        color: '#ff6600',
        behavior: 'orbitalBeacon'
    },
    STRAFING_RUN: {
        name: 'Strafing Run',
        description: 'Call in fighters to strafe 400px area (1.5s warning)',
        cost: 200,
        tier: 'ORBITAL',
        damagePerBullet: 10,
        damage: 10,  // For display
        blastRadius: 400,  // Coverage width for display
        bounces: 0,
        projectileRadius: 6,
        projectileSpeed: 1.0,
        color: '#ffff00',
        behavior: 'strafingRun',
        fighterCount: 4,
        bulletsPerFighter: 5,
        coverageWidth: 400
    },
    // Dying Light is granted by desperation beacon, not purchasable
    DYING_LIGHT: {
        name: 'Dying Light',
        description: 'Final strike from dying ship. Use within 3 turns!',
        cost: 0,
        tier: 'SPECIAL',
        damage: 90,
        blastRadius: 180,
        bounces: 1,
        projectileRadius: 12,
        projectileSpeed: 1.0,
        color: '#ffcc00',
        behavior: 'dyingLight'
    }
};

// Weapon keys for iteration (exclude non-purchasable and orbital weapons from regular rotation)
const WEAPON_KEYS = Object.keys(WEAPONS).filter(k =>
    WEAPONS[k].tier !== 'SPECIAL' && WEAPONS[k].tier !== 'ORBITAL'
);
// Orbital weapons handled separately in shop with limited stock
const ORBITAL_WEAPON_KEYS = Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'ORBITAL');

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
    STRIKER: {
        name: 'STRIKER',
        description: 'Offensive powerhouse',
        abilityName: 'Overdrive',
        abilityDesc: '+33% damage dealt',
        abilityRules: { damageBonus: 0.33 },
        palette: { base: '#ff4444', glow: '#ff6666' },  // Red
        chassisShape: 3,   // Triangle - aggressive
        turretLength: 38,
        turretWidth: 5
    },
    FORTRESS: {
        name: 'FORTRESS',
        description: 'Immovable anchor',
        abilityName: 'Armor Plating',
        abilityDesc: '-33% damage taken',
        abilityRules: { damageReduction: 0.33 },
        palette: { base: '#888888', glow: '#aaaaaa' },  // Gray
        chassisShape: 4,   // Square - solid
        turretLength: 28,
        turretWidth: 8
    },
    HUNTER: {
        name: 'HUNTER',
        description: 'Precision tracker',
        abilityName: 'Target Lock',
        abilityDesc: 'All projectiles home slightly',
        abilityRules: { homingStrength: 0.02 },
        palette: { base: '#ffaa00', glow: '#ffcc00' },  // Orange
        chassisShape: 6,   // Hexagon - tactical
        turretLength: 35,
        turretWidth: 4
    },
    SPECTER: {
        name: 'SPECTER',
        description: 'Aerial phantom',
        abilityName: 'Hover Jets',
        abilityDesc: 'Hover 20px above terrain',
        abilityRules: { hoverHeight: 20 },
        palette: { base: '#aa44ff', glow: '#cc66ff' },  // Purple
        chassisShape: 5,   // Pentagon - floaty
        turretLength: 32,
        turretWidth: 4
    },
    MERCHANT: {
        name: 'MERCHANT',
        description: 'Economic advantage',
        abilityName: 'Trade Routes',
        abilityDesc: '+20 bonus coins per turn',
        abilityRules: { bonusCoins: 20 },
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
        STRAFING_RUN: { total: 3, remaining: 3 }
    },
    orbitalBeacons: [],      // Active beacon sequences { x, y, phase, timer, targetingShip, firedByPlayer }
    strafingRuns: [],        // Active strafing runs { targetX, phase, timer, direction, fighters, firedByPlayer }
    desperationBeacons: [],  // Falling/landed beacons { x, y, vy, landed, timer, maxTime, claimed, claimedBy }

    // Dying Light tracking (per player)
    dyingLightTurns: Array.from({ length: NUM_PLAYERS }, () => 0),  // Turns remaining for dying light
    storedWeapons: Array.from({ length: NUM_PLAYERS }, () => null),  // Previous weapon before dying light

    // Turn flow safety (prevents race conditions)
    turnEndLocked: false,   // Prevents multiple endTurn() calls
    firingStartTime: 0      // For safety timeout
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
    terrain.generate(VIRTUAL_WIDTH, VIRTUAL_HEIGHT, spawnXs, 250);  // Large edge margin to push terrain down at walls
    terrain.generateProps();  // Add stylized props (trees, buildings, pylons)

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
    state.mushroomCloud = null;

    // Reset orbital strike systems
    state.orbitalStock = {
        ORBITAL_BEACON: { total: 2, remaining: 2 },
        STRAFING_RUN: { total: 3, remaining: 3 }
    };
    state.orbitalBeacons = [];
    state.strafingRuns = [];
    state.desperationBeacons = [];
    state.dyingLightTurns = Array.from({ length: NUM_PLAYERS }, () => 0);
    state.storedWeapons = Array.from({ length: NUM_PLAYERS }, () => null);
    // Reset turn flow safety state
    state.turnEndLocked = false;
    state.firingStartTime = 0;
}

function startGame() {
    // Called after both players select tanks
    state.phase = 'aiming';

    // Apply initial archetype abilities (if any)
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

    // RAILGUN BEAM - special handling
    if (weapon.behavior === 'railgunBeam') {
        fireRailgunBeam(player, weapon, angleRad);
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
    if (player.weapon === 'DYING_LIGHT') {
        player.weapon = state.storedWeapons[state.currentPlayer] || 'MORTAR';
        state.storedWeapons[state.currentPlayer] = null;
        state.dyingLightTurns[state.currentPlayer] = 0;
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
            endTurn();
        }
    }, 400);
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

    // SPLITTER AIRBURST behavior - split in midair after delay
    if (weapon && weapon.behavior === 'splitterAirburst' && !proj.isSplit && !proj.isAirburstFragment) {
        proj.airburstTimer = (proj.airburstTimer || 0) + dt;
        if (proj.airburstTimer >= (weapon.airburstDelay || 0.8)) {
            // First airburst split
            spawnAirburstFragments(proj, weapon.splitCount || 4, false);
            state.projectile = null;
            return;
        }
    }

    // SPLITTER second-stage airburst (fragments split again)
    if (weapon && weapon.behavior === 'splitterAirburst' && proj.isAirburstFragment && !proj.hasSecondSplit) {
        proj.secondAirburstTimer = (proj.secondAirburstTimer || 0) + dt;
        if (proj.secondAirburstTimer >= 0.4) {  // Shorter delay for second split
            proj.hasSecondSplit = true;
            spawnAirburstFragments(proj, weapon.secondSplitCount || 2, true);
            // Remove this fragment from projectiles array
            const idx = state.projectiles.indexOf(proj);
            if (idx >= 0) state.projectiles.splice(idx, 1);
            return;
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

    // Wall bounces - simple pattern that works
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        onBounce(proj);
        particles.sparks(proj.x, proj.y, 10, proj.color);
        audio.playBounce();
    }

    // Ceiling bounce
    if (proj.y < WORLD_TOP) {
        proj.vy = -proj.vy * 0.9;
        proj.y = WORLD_TOP;
        onBounce(proj);
        particles.sparks(proj.x, proj.y, 10, proj.color);
        audio.playBounce();
    }

    // Spawn trail particles occasionally
    if (Math.random() < 0.3) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

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
            endTurn();
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

    // === STRAFING BULLET EXPLOSION - Handle before weapon lookup ===
    if (proj.isStrafeBullet) {
        const damage = proj.damage || 10;
        const blastRadius = proj.blastRadius || 25;
        const firingPlayerIdx = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;

        // Destroy terrain
        terrain.destroy(proj.x, proj.y, blastRadius * 0.5);

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
                particles.sparks(player.x, player.y, 15, '#ffff00');
                if (player.health <= 0) {
                    triggerDeathExplosion(player, false);
                }
            }
        }

        // Visual effects
        particles.explosion(proj.x, proj.y, 20, '#ffff00', blastRadius * 0.5);
        particles.sparks(proj.x, proj.y, 10, '#ff8800');
        renderer.addScreenShake(5);
        audio.playExplosion(0.3);

        // Remove from projectiles array
        const idx = state.projectiles.indexOf(proj);
        if (idx > -1) state.projectiles.splice(idx, 1);

        return;  // Done - don't fall through to normal weapon handling
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

    // HEAVY_SHELL behavior - aftershock damages grounded tanks
    if (weapon.behavior === 'heavyShell') {
        const aftershockDamage = weapon.aftershockDamage || 20;
        const aftershockRadius = weapon.aftershockRadius || 200;

        // Schedule aftershock (delayed ground shake)
        setTimeout(() => {
            // Aftershock visual
            particles.sparks(proj.x, proj.y, 40, '#886644');
            renderer.addScreenShake(12);

            // Damage grounded tanks in aftershock radius
            for (let i = 0; i < state.players.length; i++) {
                const player = state.players[i];
                if (player.health <= 0) continue;

                const terrainY = terrain.getHeightAt(player.x);
                const isGrounded = Math.abs(player.y - terrainY + TANK_RADIUS) < 15;

                if (isGrounded) {
                    const dist = distance(proj.x, proj.y, player.x, player.y);
                    if (dist < aftershockRadius) {
                        const falloff = 1 - (dist / aftershockRadius);
                        const dmg = aftershockDamage * falloff;
                        player.health = Math.max(0, player.health - dmg);
                        particles.sparks(player.x, player.y, 15, '#aa6644');
                    }
                }
            }
        }, 300);  // 300ms delay for aftershock
    }

    // QUAKE behavior - spreading ground shockwaves
    if (weapon.behavior === 'quake' || weapon.behavior === 'quakeSpread') {
        const shockwaveCount = weapon.shockwaveCount || 4;
        const shockwaveDelay = (weapon.shockwaveDelay || 0.15) * 1000;
        const falloffPerRing = weapon.shockwaveFalloff || 0.25;

        // Initial impact visual
        particles.explosion(proj.x, proj.y + 20, 40, '#886644', effectiveBlastRadius);
        renderer.addScreenShake(25);

        // Schedule multiple shockwave rings spreading outward
        for (let ring = 1; ring < shockwaveCount; ring++) {
            const ringRadius = effectiveBlastRadius + ring * 80;
            const ringDamage = effectiveDamage * Math.max(0.1, 1 - ring * falloffPerRing);
            const delay = ring * shockwaveDelay;

            setTimeout(() => {
                // Visual shockwave ring
                particles.sparks(proj.x, proj.y - ring * 5, Math.max(8, 25 - ring * 5), '#aa8866');
                renderer.addScreenShake(Math.max(3, 12 - ring * 2));

                // Damage grounded tanks in this ring
                for (let i = 0; i < state.players.length; i++) {
                    const player = state.players[i];
                    if (player.health <= 0) continue;

                    const terrainY = terrain.getHeightAt(player.x);
                    const isGrounded = Math.abs(player.y - terrainY + TANK_RADIUS) < 15;

                    if (isGrounded) {
                        const dist = distance(proj.x, proj.y, player.x, player.y);
                        // Ring affects area between previous ring and this ring
                        const innerRadius = effectiveBlastRadius + (ring - 1) * 80;
                        const outerRadius = ringRadius;

                        if (dist >= innerRadius && dist < outerRadius) {
                            const falloff = 1 - ((dist - innerRadius) / (outerRadius - innerRadius)) * 0.5;
                            const dmg = ringDamage * falloff;
                            player.health = Math.max(0, player.health - dmg);
                            particles.sparks(player.x, player.y, 12, '#cc9966');

                            // Track damage for coins
                            if (i !== firingPlayerIndex) {
                                totalEnemyDamage += dmg;
                            }
                            hitOccurred = true;
                        }
                    }
                }
            }, delay);
        }
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
 * Spawn airburst fragments for SPLITTER weapon (double airburst)
 * @param {Object} proj - Parent projectile
 * @param {number} count - Number of fragments
 * @param {boolean} isFinalStage - Whether this is the second (final) split
 */
function spawnAirburstFragments(proj, count, isFinalStage) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;

    // Spawn fragments in a radial burst pattern
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 3 + Math.random() * 2;  // Some variation

        // Inherit some of parent's velocity
        const inheritFactor = 0.5;

        state.projectiles.push({
            x: proj.x + Math.cos(angle) * 5,
            y: proj.y + Math.sin(angle) * 5,
            vx: proj.vx * inheritFactor + Math.cos(angle) * speed,
            vy: proj.vy * inheritFactor + Math.sin(angle) * speed,
            radius: isFinalStage ? proj.radius * 0.6 : proj.radius * 0.75,
            color: proj.color,
            bounces: 0,
            maxBounces: 1,
            trail: [],
            weaponKey: proj.weaponKey,
            isSplit: true,
            isAirburstFragment: !isFinalStage,  // Can split again if not final
            hasSecondSplit: isFinalStage,       // Final fragments don't split
            isCluster: true,  // Use cluster system
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0,
            firedByPlayer: proj.firedByPlayer
        });
    }

    // Visual feedback - bigger burst for first split
    const sparkCount = isFinalStage ? 15 : 30;
    particles.sparks(proj.x, proj.y, sparkCount, proj.color);
    particles.sparks(proj.x, proj.y, sparkCount * 0.5, COLORS.white);
    renderer.addScreenShake(isFinalStage ? 6 : 12);
    renderer.flash(proj.color, isFinalStage ? 0.08 : 0.15);
    audio.playBounce();
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

function endTurn() {
    // Prevent multiple calls in same resolution window (race condition guard)
    if (state.turnEndLocked) return;
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

        // Handle Dying Light expiration for current player
        if (state.dyingLightTurns[state.currentPlayer] > 0) {
            state.dyingLightTurns[state.currentPlayer]--;
            if (state.dyingLightTurns[state.currentPlayer] <= 0 &&
                currentPlayer.weapon === 'DYING_LIGHT') {
                // Restore previous weapon
                currentPlayer.weapon = state.storedWeapons[state.currentPlayer] || 'MORTAR';
                state.storedWeapons[state.currentPlayer] = null;
            }
        }

        // Full round = all players have had a turn (use player count)
        const playersAlive = state.players.filter(p => p.health > 0).length;
        const isNewRound = state.turnCount % Math.max(playersAlive, 1) === 0;

        if (isNewRound) {
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

            // Revert previous round's event
            if (state.activeEvent) {
                events.revertEvent(state);
                state.activeEvent = null;
            }

            // Transition to shop phase (skip shop on round 1)
            if (state.turnCount >= state.players.length) {
                state.turnEndLocked = false;  // Unlock turn guard
                enterShopPhase();
                return;  // Don't continue to aiming yet
            }

            // Roll new glitch event for this round
            rollNewGlitchEvent();
        }

        state.phase = 'aiming';
        state.turnEndLocked = false;  // Unlock turn guard

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

    // Add orbital weapons if stock remaining (always at end, sorted by cost)
    const orbitalOfferings = [];
    for (const key of ORBITAL_WEAPON_KEYS) {
        const stock = state.orbitalStock[key];
        if (stock && stock.remaining > 0) {
            orbitalOfferings.push(key);
        }
    }
    orbitalOfferings.sort((a, b) => WEAPONS[a].cost - WEAPONS[b].cost);
    offerings.push(...orbitalOfferings);

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

            // Check orbital stock if applicable
            const orbitalStock = state.orbitalStock[weaponKey];
            if (orbitalStock && orbitalStock.remaining <= 0) {
                // Out of stock - play error
                audio.playError();
            } else if (player.coins >= weapon.cost) {
                player.coins -= weapon.cost;

                // Store previous weapon before equipping orbital weapon
                if (weapon.tier === 'ORBITAL') {
                    state.storedWeapons[playerIndex] = player.weapon;
                }

                player.weapon = weaponKey;
                state.shopReady[playerIndex] = true;
                audio.playPurchase();

                // Decrement orbital stock if applicable
                if (orbitalStock) {
                    orbitalStock.remaining--;
                }
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

    // Always update ambient world systems (clouds, UFOs, weather) for all phases
    const ambient = getAmbient();
    if (ambient) {
        ambient.update(dt, state.voidY, state.players);
    }

    // Update terrain circuit pulse animations
    terrain.updateCircuitPulses(dt);

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

    // Update orbital strike systems
    updateOrbitalBeacons(dt);
    updateStrafingRuns(dt);
    updateDesperationBeacons(dt);

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

                // Gentle knockback from fire (push away from center)
                if (!isKnockbackImmune(player) && Math.random() < 0.1) {
                    const pushDir = player.x > field.x ? 1 : -1;
                    player.vx += pushDir * 1.5;  // Small periodic push
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
                // Pause the space battle briefly
                if (ambient && ambient.pauseBattle) {
                    ambient.pauseBattle(0.5);
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
                        // Create strafe bullet projectile
                        const bulletX = fighter.x + (Math.random() - 0.5) * 40;
                        const bulletY = fighter.y;
                        state.projectiles.push({
                            x: bulletX,
                            y: bulletY,
                            vx: (Math.random() - 0.5) * 3,
                            vy: 12,  // Fast downward (frame-based physics)
                            radius: 4,
                            color: '#ffff00',
                            damage: damagePerBullet,
                            blastRadius: 25,
                            maxBounces: 99,  // High so bounce limit doesn't trigger - explodes on terrain/void
                            bounces: 0,
                            trail: [],
                            firedByPlayer: run.firedByPlayer,
                            isStrafeBullet: true,
                            isCluster: true,  // Process like cluster bombs for proper explosion
                            weaponKey: null,
                            createdAt: performance.now(),  // For lifetime tracking
                            maxLifetime: 5000  // 5 second max lifetime
                        });
                        particles.sparks(bulletX, bulletY, 5, '#ffff00');
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
                // End turn if this strafing run was controlling the turn
                if (run.pendingTurnEnd) {
                    state.strafingRuns.splice(i, 1);
                    endTurn();
                } else {
                    state.strafingRuns.splice(i, 1);
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

        // Check for projectile collision to claim beacon
        if (beacon.landed && !beacon.claimed) {
            // Check main projectile
            if (state.projectile) {
                const proj = state.projectile;
                const dist = distance(proj.x, proj.y, beacon.x, beacon.y);
                if (dist < 30) {
                    claimDesperationBeacon(beacon, proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer);
                }
            }

            // Check cluster projectiles
            for (const proj of state.projectiles) {
                const dist = distance(proj.x, proj.y, beacon.x, beacon.y);
                if (dist < 30) {
                    claimDesperationBeacon(beacon, proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer);
                    break;
                }
            }
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
    player.weapon = 'DYING_LIGHT';
    state.dyingLightTurns[playerIndex] = 3;

    // Visual and audio feedback
    renderer.flash('#ffcc00', 0.5);
    audio.playPurchase();
    particles.explosion(beacon.x, beacon.y, 100, '#ffcc00', 80);
    particles.sparks(beacon.x, beacon.y, 60, '#ffffff');

    // Show notification
    state.buffNotification = {
        playerIndex: playerIndex,
        buffType: 'DYING_LIGHT',
        timer: 2.5
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
            endTurn();
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

    // Move first
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Wall bounces - simple pattern
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        proj.bounces++;
        particles.sparks(proj.x, proj.y, 8, proj.color);
        audio.playBounce();
    }

    // Ceiling bounce
    if (proj.y < WORLD_TOP) {
        proj.vy = -proj.vy * 0.9;
        proj.y = WORLD_TOP;
        proj.bounces++;
        particles.sparks(proj.x, proj.y, 8, proj.color);
        audio.playBounce();
    }

    // Check for UFO collision (grants buffs)
    checkUFOCollision(proj.x, proj.y, proj.radius);

    // Trail particles
    if (Math.random() < 0.2) {
        particles.trail(proj.x, proj.y, proj.color);
    }

    // SPLITTER second-stage airburst (fragments split again)
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (weapon && weapon.behavior === 'splitterAirburst' && proj.isAirburstFragment && !proj.hasSecondSplit) {
        proj.secondAirburstTimer = (proj.secondAirburstTimer || 0) + dt;
        if (proj.secondAirburstTimer >= 0.4) {  // Shorter delay for second split
            proj.hasSecondSplit = true;
            spawnAirburstFragments(proj, weapon.secondSplitCount || 2, true);
            // Remove this fragment from projectiles array
            const idx = state.projectiles.indexOf(proj);
            if (idx >= 0) state.projectiles.splice(idx, 1);
            // Check if all projectiles are done
            if (state.projectiles.length === 0 && !state.projectile) {
                endTurn();
            }
            return;
        }
    }

    // Check termination
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

    // Move first
    proj.x += proj.vx;
    proj.y += proj.vy;

    // Wall bounces - simple pattern
    let didBounce = false;
    if (proj.x < WORLD_LEFT || proj.x > WORLD_RIGHT) {
        proj.vx = -proj.vx * 0.9;
        proj.x = Math.max(WORLD_LEFT, Math.min(WORLD_RIGHT, proj.x));
        didBounce = true;
    }

    // Ceiling bounce
    if (proj.y < WORLD_TOP) {
        proj.vy = -proj.vy * 0.9;
        proj.y = WORLD_TOP;
        didBounce = true;
    }

    if (didBounce) {
        onAnomalyBounce(proj);
    }

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
    // Ceiling
    ctx.beginPath();
    ctx.moveTo(WORLD_LEFT, WORLD_TOP);
    ctx.lineTo(WORLD_RIGHT, WORLD_TOP);
    ctx.stroke();
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

        // Check orbital stock
        const orbitalStock = state.orbitalStock[weaponKey];
        const inStock = !orbitalStock || orbitalStock.remaining > 0;
        const isOrbital = weapon.tier === 'ORBITAL';
        const canPurchase = canAfford && inStock;

        // Selection highlight
        if (isSelected) {
            const highlightColor = !inStock ? '#444444' : COLORS.cyan;
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 250, y - 25, 500, 55, highlightColor, 2, inStock);

            // Animated projectile preview
            if (inStock) {
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
        }

        // Weapon name (with orbital indicator)
        let nameColor = isSelected ? COLORS.white : '#888888';
        if (!canPurchase) nameColor = '#444444';
        let displayName = weapon.name;
        if (isOrbital && inStock) {
            displayName += ` [${orbitalStock.remaining}/${orbitalStock.total}]`;
        }
        renderer.drawText(displayName, CANVAS_WIDTH / 2 - 200, y - 5, nameColor, isSelected ? 20 : 16, 'left', isSelected && inStock);

        // SOLD OUT indicator for orbital weapons
        if (isOrbital && !inStock) {
            renderer.drawText('SOLD OUT', CANVAS_WIDTH / 2 - 200, y + 15, '#ff4444', 14, 'left', true);
        } else {
            // Weapon description
            const descColor = isSelected ? '#aaaaaa' : '#555555';
            renderer.drawText(weapon.description, CANVAS_WIDTH / 2 - 200, y + 15, canPurchase ? descColor : '#333333', 11, 'left', false);
        }

        // Cost
        const costColor = canPurchase ? COLORS.yellow : '#663333';
        renderer.drawText(`${weapon.cost}`, CANVAS_WIDTH / 2 + 200, y, costColor, 18, 'right', canPurchase && isSelected);

        // Stats
        const statsColor = canPurchase ? '#666666' : '#333333';
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
