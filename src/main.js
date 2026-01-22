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

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const DEFAULT_GRAVITY = 0.25;
const MAX_POWER = 20;           // Increased for more dramatic full-power shots
const CHARGE_RATE = 0.018;      // Slightly faster charge (2 sec for full)
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
const SURVIVAL_BONUS = 10;
const UFO_DESTROY_BONUS = 30;
const SHOP_OFFERING_COUNT = 6;

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
    BABY_SHOT: {
        name: 'Baby Shot',
        description: 'Weak but accurate',
        cost: 15,
        tier: 'CHEAP',
        damage: 20,
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
        damage: 25,
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
        damage: 5,
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
        damage: 0,
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
        damage: 30,
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
        damage: 40,
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
        damage: 20,
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
        damage: 70,
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
        damage: 45,
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
        damage: 0,
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
        damage: 35,
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
        damage: 15,
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
        damage: 95,
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
        damage: 10,
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
        damage: 40,
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
        damage: 0,
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
        damage: 20,
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
        damage: 15,
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
        damage: 40,
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 1.3,
        color: '#44ffff',
        behavior: 'chainLightning',
        chainDamage: 25,
        chainRange: 200
    },
    NUKE: {
        name: 'Nuke',
        description: 'Massive blast, 3s fuse',
        cost: 180,
        tier: 'SPECTACLE',
        damage: 80,
        blastRadius: 150,
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
// Game State
// ============================================================================

const state = {
    players: [
        { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan, tankType: null, isAI: false, shield: 0, coins: STARTING_COINS, weapon: 'BABY_SHOT' },
        { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta, tankType: null, isAI: false, shield: 0, coins: STARTING_COINS, weapon: 'BABY_SHOT' }
    ],
    currentPlayer: 0,
    turnCount: 0,
    phase: 'title',  // 'title' | 'mode_select' | 'select_p1' | 'select_p2' | 'aiming' | 'firing' | 'resolving' | 'shop' | 'gameover'
    selectIndex: 0,  // Current selection in menus
    gameMode: null,  // '1p' | '2p'
    projectile: null,
    projectiles: [],  // For cluster bombs (multiple projectiles)
    // Shop state
    shopOfferings: [],     // Array of weapon keys available this round
    shopSelections: [0, 0], // Selected index for each player in shop
    shopReady: [false, false], // Whether each player is ready
    // Persistent fields (napalm, etc.)
    fields: [],  // { x, y, radius, duration, damagePerSec, color, type, timer }
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
    ufoBuffs: [
        { damage: 0, blast: 0, bounces: 0 },  // Player 1 buffs
        { damage: 0, blast: 0, bounces: 0 }   // Player 2 buffs
    ],
    // UFO buff notification
    buffNotification: null  // { playerIndex, buffType, timer }
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
    state.players[0] = { x: 200, y: 0, vy: 0, angle: 45, power: 0, charging: false, health: 100, color: COLORS.cyan, tankType: null, isAI: false, shield: 0, coins: STARTING_COINS, weapon: 'BABY_SHOT' };
    state.players[1] = { x: 1080, y: 0, vy: 0, angle: 135, power: 0, charging: false, health: 100, color: COLORS.magenta, tankType: null, isAI: isP2AI, shield: 0, coins: STARTING_COINS, weapon: 'BABY_SHOT' };

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
    state.ufoBuffs = [
        { damage: 0, blast: 0, bounces: 0 },
        { damage: 0, blast: 0, bounces: 0 }
    ];
    state.buffNotification = null;
    // Reset shop state
    state.shopOfferings = [];
    state.shopSelections = [0, 0];
    state.shopReady = [false, false];
    // Reset persistent fields
    state.fields = [];
}

function startGame() {
    // Called after both players select tanks
    state.phase = 'aiming';

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
        // Apply extra bounces from ELASTIC WORLD event + UFO buff
        maxBounces: weapon.bounces + state.extraBounces + bounceBonus,
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
    if (state.recoilPending) {
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

    // Apply UFO buffs to damage and blast radius
    const damageMultiplier = proj.buffedDamageMultiplier || 1;
    const blastBonus = proj.buffedBlastBonus || 0;
    const effectiveBlastRadius = weapon.blastRadius + blastBonus;
    const effectiveDamage = weapon.damage * damageMultiplier;

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

        // Death effects for killing blow
        if (killingBlow && hitPlayer) {
            // Brief slow-mo for kills only
            state.slowMoUntil = now + SLOW_MO_DURATION_MS;
            // Extra explosion at player position
            particles.explosion(hitPlayer.x, hitPlayer.y, 100, hitPlayer.color, 100);
            renderer.addScreenShake(35);
            renderer.flash(COLORS.white, 0.5);
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
        state.currentPlayer = 1 - state.currentPlayer;

        // Void rises every full round (after both players fire)
        // Also: new glitch event at the start of each round (when P1's turn begins)
        if (state.turnCount % 2 === 0) {
            state.voidY -= VOID_RISE_PER_ROUND;

            // Award survival bonus to both players
            state.players.forEach(p => {
                if (p.health > 0) {
                    p.coins += SURVIVAL_BONUS;
                }
            });

            // Revert previous round's event
            if (state.activeEvent) {
                events.revertEvent(state);
                state.activeEvent = null;
            }

            // Transition to shop phase (skip shop on round 1)
            if (state.turnCount >= 2) {
                enterShopPhase();
                return;  // Don't continue to aiming yet
            }

            // Roll new glitch event for this round (both players will share it)
            rollNewGlitchEvent();
        }
        // Note: If turnCount is odd (P2's turn), keep the same glitch from P1's turn

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
    state.shopSelections = [0, 0];
    state.shopReady = [false, false];

    // AI auto-selects in shop
    if (state.players[1].isAI) {
        aiShopSelect();
    }
}

/**
 * AI weapon selection (simple: pick best affordable weapon)
 */
function aiShopSelect() {
    const ai = state.players[1];
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
        state.shopSelections[1] = bestIndex;
        const weaponKey = state.shopOfferings[bestIndex];
        ai.coins -= WEAPONS[weaponKey].cost;
        ai.weapon = weaponKey;
    }

    state.shopReady[1] = true;
    checkShopComplete();
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
                audio.playConfirm();
            } else {
                // Can't afford - play error sound
                audio.playSelect();
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
    if (state.shopReady[0] && state.shopReady[1]) {
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

    // Shop phase
    if (state.phase === 'shop') {
        handleShopInput();
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

    // Clear input state for next frame
    input.endFrame();
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

    // Bounce off walls
    if (proj.x < proj.radius) {
        proj.x = proj.radius;
        proj.vx = -proj.vx * 0.9;
        onAnomalyBounce(proj);
    }
    if (proj.x > CANVAS_WIDTH - proj.radius) {
        proj.x = CANVAS_WIDTH - proj.radius;
        proj.vx = -proj.vx * 0.9;
        onAnomalyBounce(proj);
    }

    // Bounce off ceiling
    if (proj.y < proj.radius) {
        proj.y = proj.radius;
        proj.vy = -proj.vy * 0.9;
        onAnomalyBounce(proj);
    }

    // Check termination: terrain, void, or out of bounds
    if (terrain.isPointBelowTerrain(proj.x, proj.y) ||
        proj.y > state.voidY ||
        proj.y > CANVAS_HEIGHT + 100) {
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

    // Draw both tanks
    for (let i = 0; i < state.players.length; i++) {
        const player = state.players[i];
        const isActive = i === state.currentPlayer && state.phase === 'aiming';
        const tankType = TANK_TYPES[player.tankType];
        const shape = tankType ? tankType.shape : 6;

        // Tank body (shape based on tank type)
        renderer.drawRegularPolygon(player.x, player.y, TANK_RADIUS, shape, 0, player.color, true);

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

            // Debug velocity display
            if (DEBUG_SHOW_VELOCITY && tankType) {
                const effectivePower = chargeToPower(player.power);
                const velocity = effectivePower * MAX_POWER * tankType.projectileSpeed;
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

        // Tank type label
        if (tankType) {
            renderer.drawText(tankType.name, player.x, player.y + 45, player.color, 10, 'center', false);
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

    // Draw particles
    particles.draw(renderer);

    // Draw ambient foreground (UFOs, weather, glitch specks)
    if (ambient) {
        ambient.drawForeground(renderer);
        // Occasional lightning flash during rain
        ambient.triggerLightning(renderer);
    }

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

    // Round indicator + FPS (for debugging)
    renderer.drawText(`Round ${getCurrentRound()}`, CANVAS_WIDTH - 20, 30, COLORS.white, 14, 'right', false);
    renderer.drawText(`FPS: ${fpsCounter.fps}`, CANVAS_WIDTH - 20, 50, fpsCounter.fps < 50 ? COLORS.magenta : '#666666', 10, 'right', false);

    // Player stats with weapon and coins
    const p1Weapon = state.players[0].weapon ? WEAPONS[state.players[0].weapon]?.name : '';
    const p2Weapon = state.players[1].weapon ? WEAPONS[state.players[1].weapon]?.name : '';
    renderer.drawText(`P1: ${Math.round(state.players[0].health)}% [${p1Weapon}]`, 20, 60, state.players[0].color, 14, 'left', false);
    renderer.drawText(`P2: ${Math.round(state.players[1].health)}% [${p2Weapon}]`, 20, 80, state.players[1].color, 14, 'left', false);

    // Coin display
    renderer.drawText(`${state.players[0].coins}`, 180, 60, COLORS.yellow, 12, 'left', false);
    renderer.drawText(`${state.players[1].coins}`, 180, 80, COLORS.yellow, 12, 'left', false);

    // Draw active UFO buffs for each player
    drawPlayerBuffs(0, 200, 60);
    drawPlayerBuffs(1, 200, 80);

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

function renderTitle() {
    // Background with subtle animation
    renderer.drawGrid(50, '#0a0a15');

    // Draw ambient background (far clouds, dust)
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
    }

    // Animated void at bottom
    const voidY = CANVAS_HEIGHT - 100 + Math.sin(state.time * 2) * 20;
    renderer.drawVoid(voidY);

    // Draw ambient foreground (UFOs, weather)
    if (ambient) {
        ambient.drawForeground(renderer);
        ambient.triggerLightning(renderer);
    }

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

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }

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

    // Background
    renderer.drawGrid(50, '#0a0a15');

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }

    // Title
    renderer.drawText('VOID ARTILLERY', CANVAS_WIDTH / 2, 50, COLORS.cyan, 28, 'center', true);
    const subtitle = isAISelecting ? 'AI IS CHOOSING...' : `PLAYER ${playerNum} - SELECT YOUR TANK`;
    renderer.drawText(subtitle, CANVAS_WIDTH / 2, 90, playerColor, 20, 'center', true);

    // Calculate adaptive layout based on number of tanks
    const headerHeight = 120;  // Space for title + subtitle
    const footerHeight = 50;   // Space for controls hint
    const availableHeight = CANVAS_HEIGHT - headerHeight - footerHeight;
    const tankCount = TANK_TYPE_KEYS.length;

    // Calculate spacing to fit all tanks, with max cap for readability
    const itemHeight = 80;  // Height of each selection box
    const maxSpacing = 95;  // Max spacing between items
    const minSpacing = 70;  // Min spacing to prevent crowding
    const calculatedSpacing = Math.min(maxSpacing, Math.max(minSpacing, availableHeight / tankCount));

    // Center the list vertically in available space
    const totalListHeight = (tankCount - 1) * calculatedSpacing;
    const startY = headerHeight + (availableHeight - totalListHeight) / 2;

    for (let i = 0; i < tankCount; i++) {
        const key = TANK_TYPE_KEYS[i];
        const tankType = TANK_TYPES[key];
        const y = startY + i * calculatedSpacing;
        const isSelected = i === state.selectIndex;

        // Selection highlight box (compact)
        if (isSelected) {
            renderer.drawRectOutline(CANVAS_WIDTH / 2 - 280, y - 32, 560, 64, playerColor, 2, true);
        }

        // Tank preview shape (moved left for more text space)
        const previewX = CANVAS_WIDTH / 2 - 220;
        const previewColor = isSelected ? playerColor : '#555555';
        const previewSize = isSelected ? 28 : 24;
        renderer.drawRegularPolygon(previewX, y, previewSize, tankType.shape, 0, previewColor, true);

        // Tank name (moved right to avoid preview overlap)
        const textColor = isSelected ? COLORS.white : '#777777';
        const nameX = CANVAS_WIDTH / 2 - 150;
        renderer.drawText(tankType.name, nameX, y - 8, textColor, isSelected ? 20 : 18, 'left', isSelected);

        // Tank description (below name, smaller font)
        const descColor = isSelected ? '#aaaaaa' : '#555555';
        renderer.drawText(tankType.description, nameX, y + 14, descColor, 11, 'left', false);

        // Stats (compact, right-aligned)
        const statsX = CANVAS_WIDTH / 2 + 265;
        const statsColor = isSelected ? '#999999' : '#555555';
        const statsFontSize = 10;
        renderer.drawText(`DMG ${tankType.damage}`, statsX, y - 12, statsColor, statsFontSize, 'right', false);
        renderer.drawText(`BLS ${tankType.blastRadius}`, statsX, y + 2, statsColor, statsFontSize, 'right', false);
        renderer.drawText(`BNC ${tankType.bounces}`, statsX, y + 16, statsColor, statsFontSize, 'right', false);
    }

    // Controls hint (at bottom with padding)
    renderer.drawText('↑↓ SELECT   SPACE CONFIRM', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 25, '#555555', 12, 'center', false);
}

function renderShop() {
    // Background
    renderer.drawGrid(50, '#0a0a15');

    // Draw ambient background
    const ambient = getAmbient();
    if (ambient) {
        ambient.drawBackground(renderer);
        ambient.drawForeground(renderer);
    }

    const round = getCurrentRound();
    const p1 = state.players[0];
    const p2 = state.players[1];

    // Header
    renderer.setGlow(COLORS.yellow, 15);
    renderer.drawText('SHOP', CANVAS_WIDTH / 2, 50, COLORS.yellow, 36, 'center', true);
    renderer.clearGlow();
    renderer.drawText(`ROUND ${round}`, CANVAS_WIDTH / 2, 85, '#888888', 16, 'center', false);

    // Player info panels
    // P1 (left side)
    renderer.drawText('P1', 100, 50, COLORS.cyan, 20, 'center', true);
    renderer.drawText(`${p1.coins} coins`, 100, 75, COLORS.yellow, 14, 'center', false);
    const p1WeaponName = WEAPONS[p1.weapon]?.name || 'None';
    renderer.drawText(`[${p1WeaponName}]`, 100, 95, '#888888', 11, 'center', false);
    if (state.shopReady[0]) {
        renderer.drawText('READY', 100, 120, COLORS.green, 14, 'center', true);
    }

    // P2 (right side)
    renderer.drawText(p2.isAI ? 'AI' : 'P2', CANVAS_WIDTH - 100, 50, COLORS.magenta, 20, 'center', true);
    renderer.drawText(`${p2.coins} coins`, CANVAS_WIDTH - 100, 75, COLORS.yellow, 14, 'center', false);
    const p2WeaponName = WEAPONS[p2.weapon]?.name || 'None';
    renderer.drawText(`[${p2WeaponName}]`, CANVAS_WIDTH - 100, 95, '#888888', 11, 'center', false);
    if (state.shopReady[1]) {
        renderer.drawText('READY', CANVAS_WIDTH - 100, 120, COLORS.green, 14, 'center', true);
    }

    // Weapon list
    const startY = 150;
    const spacing = 70;
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

    // Initialize ambient world systems (clouds, UFOs, weather, particles)
    initAmbient(CANVAS_WIDTH, CANVAS_HEIGHT);

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
