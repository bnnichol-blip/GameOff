// ============================================================================
// weaponBehaviors.js - Weapon-specific behavior logic
// ============================================================================
//
// This module extracts weapon-specific behaviors from main.js:
// - applyBlastKnockback: Radial knockback from explosions
// - triggerDeathExplosion: Spectacular death effects
// - handleProjectileUpdate: Weapon-specific update logic (homing, splitter, roller, drill)
// - handleProjectileImpact: Weapon-specific terrain collision handling
// - handleProjectileExplode: Weapon-specific explosion dispatch (cluster, mirv, etc.)
//
// NOTE: These functions are designed to be called FROM main.js update loops,
// not to replace them entirely. General physics remain in main.js.
// ============================================================================

import { state, getArchetype, getArchetypeDamageMultiplier, getArchetypeDamageReduction, getArchetypeHomingStrength } from './state.js';
import { WEAPONS, TANK_TYPES, TANK_ARCHETYPES } from './weaponData.js';
import { particles } from './particles.js';
import { terrain } from './terrain.js';
import { audio } from './audio.js';
import { COLORS } from './renderer.js';
import { distance } from './utils.js';

// ============================================================================
// Constants (must match main.js - these will be imported from a shared constants file later)
// ============================================================================

const TANK_RADIUS = 25;
const VIRTUAL_WIDTH = 2560;
const VIRTUAL_HEIGHT = 1440;
const WALL_MARGIN = 20;
const WORLD_LEFT = WALL_MARGIN;
const WORLD_RIGHT = VIRTUAL_WIDTH - WALL_MARGIN;
const WORLD_TOP = WALL_MARGIN;

// ============================================================================
// Knockback System
// ============================================================================

/**
 * Check if a player is immune to knockback (placeholder for archetype ability)
 */
function isKnockbackImmune(player) {
    return false;
}

/**
 * Apply radial blast knockback to all players within range
 * @param {number} epicenterX - Explosion center X
 * @param {number} epicenterY - Explosion center Y
 * @param {number} blastRadius - Radius of effect
 * @param {number} maxForce - Maximum knockback force at epicenter
 * @param {number} excludePlayer - Player index to exclude (e.g., firing player), or -1 for none
 */
export function applyBlastKnockback(epicenterX, epicenterY, blastRadius, maxForce, excludePlayer = -1) {
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

// ============================================================================
// Death Explosion System
// ============================================================================

/**
 * Trigger brilliant tank death explosion with terrain destruction
 * @param {Object} player - The player who died
 * @param {boolean} isVoidDeath - True if death was from void contact
 * @param {Object} renderer - Renderer instance for screen effects
 */
export function triggerDeathExplosion(player, isVoidDeath = false, renderer = null) {
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
    if (renderer) {
        renderer.addScreenShake(isVoidDeath ? 60 : 80);
        renderer.flash(isVoidDeath ? COLORS.magenta : COLORS.white, 0.7);
        setTimeout(() => renderer.flash(color, 0.4), 80);
        setTimeout(() => renderer.flash(COLORS.orange, 0.2), 160);
    }

    // Audio
    audio.playKill();
    if (isVoidDeath) {
        audio.playVoidTouch();
    }
}

// ============================================================================
// Projectile Update Behaviors
// ============================================================================

/**
 * Handle weapon-specific projectile update logic.
 * Called from main.js updateProjectile() after basic physics.
 *
 * @param {Object} proj - The projectile being updated
 * @param {number} dt - Delta time
 * @param {Object} callbacks - Callbacks for main.js functions
 * @returns {Object|null} - Return object with action to take, or null to continue normal update
 *   { action: 'remove' } - Remove projectile (split happened, etc.)
 *   { action: 'explode' } - Trigger explosion
 *   null - Continue normal update
 */
export function handleProjectileUpdate(proj, dt, callbacks = {}) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (!weapon) return null;

    const {
        spawnAirburstFragments,
        renderer,
        onExplode
    } = callbacks;

    // SPLITTER AIRBURST behavior - chain-split up to maxSplitLevel
    if (weapon.behavior === 'splitterAirburst') {
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

                if (spawnAirburstFragments) {
                    spawnAirburstFragments(proj, fragmentCount, isFinalLevel, splitLevel + 1);
                }

                return { action: 'remove', splitLevel };
            }
        }
    }

    // SEEKER LOCK-ON behavior - locks on at apex then strong homing
    if (weapon.behavior === 'seeker' || weapon.behavior === 'seekerLockOn') {
        if (!proj.isRolling) {
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
    }

    // ROLLER behavior - roll along terrain surface
    if (proj.isRolling) {
        return handleRollerUpdate(proj, dt, weapon, callbacks);
    }

    return null;  // Continue normal update
}

/**
 * Handle roller-specific update logic
 */
function handleRollerUpdate(proj, dt, weapon, callbacks = {}) {
    const { renderer, onExplode } = callbacks;

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
            if (renderer) renderer.addScreenShake(5);

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
            return { action: 'explode' };
        }
    }

    // Stop rolling if slow enough
    if (Math.abs(proj.vx) < 0.5) {
        proj.rollTimer = (proj.rollTimer || 0) + dt;
        if (proj.rollTimer > 0.5) {
            return { action: 'explode' };
        }
    } else {
        proj.rollTimer = 0;
    }

    // Enforce world boundaries while rolling
    if (proj.x < WORLD_LEFT) proj.x = WORLD_LEFT;
    if (proj.x > WORLD_RIGHT) proj.x = WORLD_RIGHT;

    return { action: 'continueRolling' };  // Skip normal physics while rolling
}

// ============================================================================
// Projectile Impact Behaviors
// ============================================================================

/**
 * Handle weapon-specific terrain collision behavior.
 * Called from main.js when projectile hits terrain.
 *
 * @param {Object} proj - The projectile
 * @param {Object} callbacks - Callbacks for main.js functions
 * @returns {Object|null} - Return object with action, or null for default explosion
 *   { action: 'startRolling' } - Start roller behavior
 *   { action: 'bounce', vx, vy } - Bounce with new velocity
 *   { action: 'startDrilling' } - Start drill behavior
 *   { action: 'landNuke', nukeData } - Land nuke and start fuse
 *   { action: 'landBeacon', beaconData } - Land orbital beacon
 *   { action: 'landStrafingRun', runData } - Start strafing run
 *   null - Default explosion behavior
 */
export function handleProjectileImpact(proj, callbacks = {}) {
    const weapon = proj.weaponKey ? WEAPONS[proj.weaponKey] : null;
    if (!weapon) return null;

    const { renderer } = callbacks;

    // ROLLER behavior - start rolling on terrain instead of exploding
    if (weapon.behavior === 'roller' && !proj.isRolling) {
        proj.isRolling = true;
        // Preserve horizontal momentum, kill vertical
        proj.vy = 0;
        // Place on surface
        proj.y = terrain.getHeightAt(proj.x) - proj.radius;
        // Visual feedback
        particles.sparks(proj.x, proj.y, 15, proj.color);
        audio.playBounce();
        return { action: 'startRolling' };
    }

    // BOUNCER behavior - bounce off terrain like a pinball
    if (weapon.behavior === 'bouncer') {
        // Calculate terrain slope for reflection
        const sampleDist = 10;
        const heightLeft = terrain.getHeightAt(proj.x - sampleDist);
        const heightRight = terrain.getHeightAt(proj.x + sampleDist);
        const heightCenter = terrain.getHeightAt(proj.x);

        // Terrain slope (rise over run)
        const slope = (heightRight - heightLeft) / (sampleDist * 2);

        // Calculate terrain normal (perpendicular to surface, pointing up)
        const normalLen = Math.sqrt(slope * slope + 1);
        const nx = -slope / normalLen;
        const ny = -1 / normalLen;  // Negative because y increases downward

        // Reflect velocity: v' = v - 2(v dot n)n
        const dot = proj.vx * nx + proj.vy * ny;
        const newVx = (proj.vx - 2 * dot * nx) * 0.85;  // Energy loss on bounce
        const newVy = (proj.vy - 2 * dot * ny) * 0.85;

        // Ensure minimum upward velocity so it doesn't get stuck
        const finalVy = newVy > -3 ? -3 : newVy;

        // Move projectile above terrain surface
        proj.y = heightCenter - proj.radius - 2;

        return {
            action: 'bounce',
            vx: newVx,
            vy: finalVy,
            behavior: 'bouncer'
        };
    }

    // NUKE behavior - land and start fuse timer instead of exploding
    if (weapon.behavior === 'nuke' || weapon.behavior === 'nukeCinematic') {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        const landY = terrain.getHeightAt(proj.x) - proj.radius;

        const nukeData = {
            x: proj.x,
            y: landY,
            fuseTimer: weapon.fuseTime || 3,
            firedByPlayer: firingPlayer,
            weaponKey: proj.weaponKey,
            color: proj.color,
            radius: proj.radius,
            buffedDamageMultiplier: proj.buffedDamageMultiplier || 1,
            buffedBlastBonus: proj.buffedBlastBonus || 0
        };

        // Visual feedback - nuke lands with ominous thud
        particles.sparks(proj.x, landY, 30, '#ffff00');
        particles.sparks(proj.x, landY, 20, '#ff8800');
        if (renderer) renderer.addScreenShake(15);
        audio.playBounce();

        return { action: 'landNuke', nukeData };
    }

    // ORBITAL BEACON behavior - land and start targeting sequence
    if (weapon.behavior === 'orbitalBeacon') {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        const landY = terrain.getHeightAt(proj.x) - proj.radius;

        const beaconData = {
            x: proj.x,
            y: landY,
            phase: 'landed',
            timer: 0,
            firedByPlayer: firingPlayer,
            weaponKey: proj.weaponKey,
            color: proj.color
        };

        // Visual feedback - beacon lands
        particles.sparks(proj.x, landY, 25, '#ff6600');
        particles.sparks(proj.x, landY, 15, '#ffffff');
        if (renderer) renderer.addScreenShake(10);
        audio.playBounce();

        return { action: 'landBeacon', beaconData, firingPlayer };
    }

    // STRAFING RUN behavior - mark target area and start warning
    if (weapon.behavior === 'strafingRun') {
        const firingPlayer = proj.firedByPlayer !== undefined ? proj.firedByPlayer : state.currentPlayer;
        const direction = Math.random() < 0.5 ? 1 : -1;
        const fighterCount = weapon.fighterCount || 4;
        const fighters = [];

        // Spawn fighters off-screen
        for (let i = 0; i < fighterCount; i++) {
            fighters.push({
                x: direction === 1 ? -100 - i * 60 : VIRTUAL_WIDTH + 100 + i * 60,
                y: VIRTUAL_HEIGHT * 0.12 + (Math.random() - 0.5) * 50,
                shotsFired: 0
            });
        }

        const runData = {
            targetX: proj.x,
            phase: 'warning',
            timer: 0,
            direction: direction,
            fighters: fighters,
            firedByPlayer: firingPlayer,
            weaponKey: proj.weaponKey,
            color: proj.color,
            coverageWidth: weapon.coverageWidth || 400,
            pendingTurnEnd: true
        };

        // Visual feedback - marker lands
        particles.sparks(proj.x, proj.y, 20, '#ffff00');
        if (renderer) renderer.addScreenShake(8);
        audio.playBounce();

        return { action: 'landStrafingRun', runData, firingPlayer };
    }

    return null;  // Default explosion behavior
}

// ============================================================================
// Projectile Explosion Dispatch
// ============================================================================

/**
 * Handle weapon-specific explosion behavior dispatch.
 * Called from main.js onExplode() to handle special weapon behaviors.
 *
 * @param {Object} proj - The projectile exploding
 * @param {Object} weapon - Weapon data
 * @param {number} firingPlayerIdx - Index of player who fired
 * @param {Object} callbacks - Callbacks for main.js functions
 * @returns {Object|null} - Return object with action, or null for normal explosion
 *   { action: 'spawnCluster' } - Spawn cluster bombs, don't end turn yet
 *   { action: 'spawnMIRV' } - Spawn MIRV projectiles
 *   { action: 'spawnMIRVStage2' } - Spawn MIRV stage 2 projectiles
 *   null - Continue with normal explosion damage/effects
 */
export function handleProjectileExplode(proj, weapon, firingPlayerIdx, callbacks = {}) {
    if (!weapon) return null;

    // CLUSTER behavior - spawn cluster bombs
    if (weapon.behavior === 'cluster' && !proj.isCluster) {
        return { action: 'spawnCluster' };
    }

    // MIRV behavior - multi-stage split
    if (weapon.behavior === 'mirv') {
        // Main projectile spawns first stage
        if (!proj.isCluster && !proj.isMIRVStage1 && !proj.isMIRVStage2) {
            return { action: 'spawnMIRV' };
        }
        // Stage 1 projectiles spawn stage 2
        if (proj.isMIRVStage1) {
            return { action: 'spawnMIRVStage2' };
        }
        // Stage 2 projectiles explode normally (fall through)
    }

    return null;  // Continue with normal explosion
}

/**
 * Apply special weapon explosion effects after damage calculation.
 * Called from main.js onExplode() after base damage is applied.
 *
 * @param {Object} proj - The projectile
 * @param {Object} weapon - Weapon data
 * @param {number} firingPlayerIdx - Index of firing player
 * @param {number} effectiveBlastRadius - Calculated blast radius
 * @param {number} effectiveDamage - Calculated damage
 * @param {Object} callbacks - Callbacks for rendering, etc.
 */
export function applyWeaponSpecialEffects(proj, weapon, firingPlayerIdx, effectiveBlastRadius, effectiveDamage, callbacks = {}) {
    const { renderer, endTurn } = callbacks;
    const firingPlayer = state.players[firingPlayerIdx];

    // HEAVY_SHELL behavior - aftershock damages grounded tanks
    if (weapon.behavior === 'heavyShell') {
        const aftershockDamage = weapon.aftershockDamage || 20;
        const aftershockRadius = weapon.aftershockRadius || 200;

        // Schedule aftershock (delayed ground shake)
        setTimeout(() => {
            // Aftershock visual
            particles.sparks(proj.x, proj.y, 40, '#886644');
            if (renderer) renderer.addScreenShake(12);

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

    // TELEPORTER behavior - warp firing player to impact point
    if (weapon.behavior === 'teleporter') {
        const owner = state.players[firingPlayerIdx];
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
            if (renderer) {
                renderer.flash(weapon.color, 0.3);
                renderer.addScreenShake(15);
            }
        }
    }

    // VOID RIFT behavior - raise the void
    if (weapon.behavior === 'voidRift') {
        const voidRiseAmount = weapon.voidRise || 60;
        state.voidY -= voidRiseAmount;

        // Visual feedback - ominous void pulse
        particles.explosion(proj.x, state.voidY, 60, '#8800ff', 80);
        if (renderer) {
            renderer.flash('#8800ff', 0.4);
            renderer.addScreenShake(18);
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
            firedByPlayer: firingPlayerIdx
        });

        // Extra fire particles on spawn
        particles.explosion(proj.x, proj.y, 80, '#ff6600', effectiveBlastRadius);
        particles.explosion(proj.x, proj.y, 40, '#ffaa00', effectiveBlastRadius * 0.6);
    }

    // CHAIN LIGHTNING OVERLOAD behavior - huge first hit, one jump at 50% damage
    if (weapon.behavior === 'chainLightning' || weapon.behavior === 'chainLightningOverload') {
        applyChainLightning(proj, weapon, firingPlayerIdx, effectiveBlastRadius, callbacks);
    }

    // DYING LIGHT behavior - ULTIMATE DEVASTATION
    if (weapon.behavior === 'dyingLight') {
        applyDyingLightEffects(proj, weapon, firingPlayerIdx, effectiveBlastRadius, effectiveDamage, callbacks);
    }
}

/**
 * Apply chain lightning effect
 */
function applyChainLightning(proj, weapon, firingPlayerIdx, effectiveBlastRadius, callbacks = {}) {
    const { renderer } = callbacks;
    const chainRange = weapon.chainRange || 250;
    const chainDamage = weapon.chainDamage || 70;
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
        const dmg = chainDamage;

        target.health = Math.max(0, target.health - dmg);

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
        if (renderer) {
            renderer.flash(weapon.color, 0.3);
            renderer.addScreenShake(12);
        }
    }

    // Extra overload visual at impact
    particles.explosion(proj.x, proj.y, 60, weapon.color, 40);
    particles.sparks(proj.x, proj.y, 50, COLORS.white);
}

/**
 * Apply Dying Light ultimate weapon effects
 */
function applyDyingLightEffects(proj, weapon, firingPlayerIdx, effectiveBlastRadius, effectiveDamage, callbacks = {}) {
    const { renderer, triggerDeathExplosionCallback } = callbacks;
    const firingPlayer = state.players[firingPlayerIdx];

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
        if (renderer) renderer.flash('#8800ff', 0.3);
    }

    // 3. SCREEN-WIDE SHOCKWAVE - Damages everyone on screen
    if (weapon.shockwaveRadius && weapon.shockwaveDamage) {
        for (let i = 0; i < state.players.length; i++) {
            const player = state.players[i];
            if (player.health <= 0) continue;
            if (i === firingPlayerIdx) continue;  // Don't hit self with shockwave

            const dist = distance(proj.x, proj.y, player.x, player.y);
            if (dist < weapon.shockwaveRadius) {
                const falloff = 1 - (dist / weapon.shockwaveRadius);
                const shockDmg = weapon.shockwaveDamage * falloff;
                // Apply damage reduction
                const reduction = getArchetypeDamageReduction(player);
                const finalShockDmg = shockDmg * (1 - reduction);
                player.health = Math.max(0, player.health - finalShockDmg);

                // Shockwave hit visual
                particles.sparks(player.x, player.y, 25, '#ffffff');
                if (renderer) renderer.addScreenShake(8);
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
                if (renderer) {
                    renderer.addScreenShake(20);
                    renderer.flash('#ffaa00', 0.2);
                }
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

                        if (player.health <= 0 && triggerDeathExplosionCallback) {
                            triggerDeathExplosionCallback(player, false);
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
    if (renderer) {
        renderer.addScreenShake(50);  // Massive shake
        renderer.flash('#ffffff', 0.5);
        renderer.flash('#ffcc00', 0.4);
    }
    audio.playExplosion(1.5);  // Extra loud
}

// ============================================================================
// Quake Special Effects
// ============================================================================

/**
 * Apply QUAKE spreading shockwave effect
 * Handles the terrain fissure and ring damage
 */
export function applyQuakeEffect(proj, weapon, firingPlayerIdx, effectiveBlastRadius, effectiveDamage, callbacks = {}) {
    const { renderer } = callbacks;

    const shockwaveCount = weapon.shockwaveCount || 5;
    const shockwaveDelay = (weapon.shockwaveDelay || 0.12) * 1000;
    const falloffPerRing = weapon.shockwaveFalloff || 0.18;
    const trenchLength = weapon.trenchLength || 300;
    const trenchDepth = weapon.trenchDepth || 45;
    const groundedMult = weapon.groundedMultiplier || 1.6;

    // === MASSIVE INITIAL IMPACT ===
    // Heavy screen shake - this is an EARTHQUAKE
    if (renderer) renderer.addScreenShake(50);

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
    const fissurePoints = terrain.carveFissure ? terrain.carveFissure(proj.x, proj.y, trenchLength, trenchDepth) : [];

    // Create visual crack effects along fissure
    if (fissurePoints && fissurePoints.length > 0) {
        for (let i = 0; i < fissurePoints.length; i++) {
            const fp = fissurePoints[i];
            const delay = i * 20;

            setTimeout(() => {
                particles.sparks(fp.x, fp.y, 8, '#aa8866');
                for (let j = 0; j < 4; j++) {
                    const debrisAngle = -Math.PI/2 + (Math.random() - 0.5) * 1.2;
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
                if (renderer) renderer.addScreenShake(3);
            }, delay);
        }
    }

    // === SPREADING SHOCKWAVE RINGS ===
    for (let ring = 1; ring <= shockwaveCount; ring++) {
        const ringRadius = effectiveBlastRadius + ring * 100;
        const ringDamage = effectiveDamage * Math.max(0.15, 1 - ring * falloffPerRing);
        const delay = ring * shockwaveDelay;

        setTimeout(() => {
            // Visual shockwave - dust erupting in a ring
            const ringParticleCount = 12 + (shockwaveCount - ring) * 3;
            for (let p = 0; p < ringParticleCount; p++) {
                const ringAngle = (p / ringParticleCount) * Math.PI * 2;
                const px = proj.x + Math.cos(ringAngle) * ringRadius * 0.7;
                const py = terrain.getHeightAt(px);

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
            if (renderer) renderer.addScreenShake(Math.max(5, 20 - ring * 3));

            // Damage grounded tanks in this ring
            for (let i = 0; i < state.players.length; i++) {
                const player = state.players[i];
                if (player.health <= 0) continue;

                const terrainY = terrain.getHeightAt(player.x);
                const isGrounded = Math.abs(player.y - terrainY + TANK_RADIUS) < 20;

                const dist = distance(proj.x, proj.y, player.x, player.y);
                const innerRadius = effectiveBlastRadius + (ring - 1) * 100;
                const outerRadius = ringRadius;

                if (dist >= innerRadius && dist < outerRadius) {
                    const falloff = 1 - ((dist - innerRadius) / (outerRadius - innerRadius)) * 0.4;
                    let dmg = ringDamage * falloff;

                    if (isGrounded) {
                        dmg *= groundedMult;
                        particles.sparks(player.x, player.y, 20, '#ffaa44');
                        particles.explosion(player.x, player.y + 10, 15, '#cc8844', 30);
                    } else {
                        dmg *= 0.5;
                        particles.sparks(player.x, player.y, 8, '#cc9966');
                    }

                    player.health = Math.max(0, player.health - dmg);
                }
            }
        }, delay);
    }

    // === FINAL AFTERSHOCK ===
    setTimeout(() => {
        if (renderer) renderer.addScreenShake(15);
        particles.explosion(proj.x, proj.y, 25, '#775533', effectiveBlastRadius * 0.6);
    }, shockwaveCount * shockwaveDelay + 200);
}

// ============================================================================
// Exports
// ============================================================================

export {
    isKnockbackImmune
};
