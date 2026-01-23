/**
 * Glitch Events System for Void Artillery
 *
 * REDESIGNED: Events now trigger on-impact effects instead of physics modifiers.
 * Each glitch applies dramatic knockback, displacement, or secondary effects
 * when projectiles explode.
 */

import { COLORS } from './renderer.js';

// ============================================================================
// Impact Glitch Registry
// ============================================================================

const IMPACT_GLITCHES = [
    // === KNOCKBACK EFFECTS ===
    {
        name: 'MASSIVE KNOCKBACK',
        color: '#ff4400',
        description: 'Huge impulse away from impact',
        icon: '💥',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer } = helpers;
            // Apply massive knockback to all tanks in range
            const knockbackRadius = 400;
            const knockbackForce = 35;

            for (const player of state.players) {
                if (player.health <= 0) continue;
                const dx = player.x - impactX;
                const dy = player.y - impactY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < knockbackRadius && dist > 0) {
                    const force = knockbackForce * (1 - dist / knockbackRadius);
                    const angle = Math.atan2(dy, dx);
                    applyKnockback(player, Math.cos(angle) * force, Math.sin(angle) * force - 10);
                }
            }

            // Visual: Expanding force ring
            particles.shockwave(impactX, impactY, {
                color: '#ff4400',
                maxRadius: knockbackRadius,
                expandSpeed: 600,
                lineWidth: 8,
                life: 0.5
            });
            renderer.addScreenShake(30);
        }
    },
    {
        name: 'BLACK HOLE',
        color: '#8800ff',
        description: 'Pulls tanks in, then slingshots them out',
        icon: '🕳️',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer, addGravityWell } = helpers;

            // Create a gravity well that pulls tanks in for 0.8s, then explodes outward
            addGravityWell({
                x: impactX,
                y: impactY,
                radius: 500,
                pullStrength: 25,
                duration: 0.8,
                onExpire: (well, state, helpers) => {
                    // SLINGSHOT - massive outward force
                    const slingshotForce = 45;
                    for (const player of state.players) {
                        if (player.health <= 0) continue;
                        const dx = player.x - well.x;
                        const dy = player.y - well.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);

                        if (dist < well.radius && dist > 0) {
                            const force = slingshotForce * (1 - dist / well.radius);
                            const angle = Math.atan2(dy, dx);
                            helpers.applyKnockback(player, Math.cos(angle) * force, Math.sin(angle) * force - 15);
                        }
                    }
                    // Explosion visual
                    helpers.particles.explosion(well.x, well.y, 100, '#ff00ff', 150);
                    helpers.renderer.addScreenShake(40);
                    helpers.renderer.flash('#ff00ff', 0.4);
                }
            });

            // Visual: Dark singularity effect
            particles.singularity(impactX, impactY, '#8800ff');
            renderer.addScreenShake(15);
        }
    },
    {
        name: 'HUGE RECOIL',
        color: '#ff8844',
        description: 'Firing tank launched backward on impact',
        icon: '🚀',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer } = helpers;

            // Find the firing player
            const firingPlayer = state.players[state.currentPlayer];
            if (!firingPlayer || firingPlayer.health <= 0) return;

            // Calculate direction from impact to firing player (launch them away)
            const dx = firingPlayer.x - impactX;
            const dy = firingPlayer.y - impactY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Launch them in the opposite direction of their shot
            const recoilForce = 30;
            const angle = dist > 0 ? Math.atan2(dy, dx) : Math.PI;
            applyKnockback(firingPlayer, Math.cos(angle) * recoilForce, -15);

            // Visual: Recoil burst at player
            particles.explosion(firingPlayer.x, firingPlayer.y, 40, '#ff8844', 60);
            particles.shockwave(firingPlayer.x, firingPlayer.y, {
                color: '#ff8844',
                maxRadius: 80,
                expandSpeed: 400,
                lineWidth: 4,
                life: 0.3
            });
            renderer.addScreenShake(20);
        }
    },
    {
        name: 'SHOCKWAVE RING',
        color: '#00ffff',
        description: 'Expanding ring pushes all tanks outward',
        icon: '💫',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer, addShockwaveRing } = helpers;

            // Create expanding shockwave that pushes tanks when it reaches them
            addShockwaveRing({
                x: impactX,
                y: impactY,
                currentRadius: 0,
                maxRadius: 600,
                expandSpeed: 500,
                pushForce: 28,
                width: 60  // How thick the pushing zone is
            });

            // Visual: Multiple expanding rings
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    particles.shockwave(impactX, impactY, {
                        color: i === 0 ? '#ffffff' : '#00ffff',
                        maxRadius: 600,
                        expandSpeed: 500 - i * 50,
                        lineWidth: 6 - i * 1.5,
                        life: 0.6
                    });
                }, i * 50);
            }
            renderer.addScreenShake(25);
        }
    },

    // === DISPLACEMENT EFFECTS ===
    {
        name: 'GRAVITY WELL',
        color: '#aa00ff',
        description: 'Temporary pull toward impact for 2 seconds',
        icon: '⬇️',
        onImpact(impactX, impactY, state, helpers) {
            const { particles, renderer, addGravityWell } = helpers;

            // Create a persistent gravity well
            addGravityWell({
                x: impactX,
                y: impactY,
                radius: 450,
                pullStrength: 12,
                duration: 2.0,
                onExpire: null  // No explosion at end
            });

            // Visual: Swirling vortex particles
            particles.singularity(impactX, impactY, '#aa00ff');
            renderer.addScreenShake(15);
        }
    },
    {
        name: 'DIRECTIONAL BLAST',
        color: '#ffff00',
        description: 'Knockback only left or right',
        icon: '↔️',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer } = helpers;

            // Random direction: left or right
            const direction = Math.random() > 0.5 ? 1 : -1;
            const blastForce = 32;
            const blastRadius = 500;

            for (const player of state.players) {
                if (player.health <= 0) continue;
                const dx = player.x - impactX;
                const dy = player.y - impactY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < blastRadius) {
                    const force = blastForce * (1 - dist / blastRadius);
                    // Horizontal only, slight upward boost
                    applyKnockback(player, direction * force, -8);
                }
            }

            // Visual: Directional wave
            particles.directionalWave(impactX, impactY, direction, '#ffff00');
            renderer.addScreenShake(20);
        }
    },
    {
        name: 'TELEPORT BLAST',
        color: '#00ff88',
        description: 'Swap positions of tanks within radius',
        icon: '🔄',
        onImpact(impactX, impactY, state, helpers) {
            const { particles, renderer, terrain, TANK_RADIUS } = helpers;

            const swapRadius = 400;
            const tanksInRange = [];

            // Find all tanks in range
            for (let i = 0; i < state.players.length; i++) {
                const player = state.players[i];
                if (player.health <= 0) continue;
                const dist = Math.sqrt(
                    (player.x - impactX) ** 2 + (player.y - impactY) ** 2
                );
                if (dist < swapRadius) {
                    tanksInRange.push({ index: i, player, dist });
                }
            }

            // Shuffle positions if 2+ tanks in range
            if (tanksInRange.length >= 2) {
                // Store original positions
                const positions = tanksInRange.map(t => ({ x: t.player.x, y: t.player.y }));

                // Rotate positions (each tank goes to next tank's position)
                for (let i = 0; i < tanksInRange.length; i++) {
                    const nextIdx = (i + 1) % tanksInRange.length;
                    const player = tanksInRange[i].player;
                    const newPos = positions[nextIdx];

                    // Teleport effect at old position
                    particles.explosion(player.x, player.y, 30, '#00ff88', 40);

                    // Move to new position
                    player.x = newPos.x;
                    player.y = terrain.getHeightAt(newPos.x) - TANK_RADIUS;
                    player.vx = 0;
                    player.vy = 0;

                    // Arrival effect
                    particles.explosion(player.x, player.y, 30, '#00ff88', 40);
                }

                renderer.flash('#00ff88', 0.4);
            }

            // Visual: Teleport ring
            particles.shockwave(impactX, impactY, {
                color: '#00ff88',
                maxRadius: swapRadius,
                expandSpeed: 800,
                lineWidth: 5,
                life: 0.3
            });
            renderer.addScreenShake(15);
        }
    },

    // === SECONDARY EFFECTS ===
    {
        name: 'CHAIN SHOCK',
        color: '#ff00ff',
        description: 'Secondary blasts spawn in random directions',
        icon: '⚡',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer, addDelayedExplosion } = helpers;

            // Spawn 4-6 secondary explosions
            const numBlasts = 4 + Math.floor(Math.random() * 3);
            const baseDelay = 0.1;

            for (let i = 0; i < numBlasts; i++) {
                const angle = (i / numBlasts) * Math.PI * 2 + Math.random() * 0.5;
                const dist = 100 + Math.random() * 150;
                const x = impactX + Math.cos(angle) * dist;
                const y = impactY + Math.sin(angle) * dist;

                addDelayedExplosion({
                    x, y,
                    delay: baseDelay + i * 0.08,
                    radius: 80,
                    knockbackForce: 18,
                    color: '#ff00ff'
                });
            }

            // Initial impact visual
            particles.explosion(impactX, impactY, 50, '#ff00ff', 60);
            renderer.addScreenShake(15);
        }
    },
    {
        name: 'VOID BURST',
        color: '#440066',
        description: 'Void rises locally at impact point',
        icon: '🌑',
        onImpact(impactX, impactY, state, helpers) {
            const { particles, renderer, addVoidSpike } = helpers;

            // Create a temporary void spike
            addVoidSpike({
                x: impactX,
                width: 200,
                height: 150,
                duration: 3.0
            });

            // Visual: Dark eruption
            particles.explosion(impactX, impactY, 80, '#440066', 100);
            particles.explosion(impactX, impactY, 50, '#8800ff', 60);

            // Ominous shockwave
            particles.shockwave(impactX, impactY, {
                color: '#440066',
                maxRadius: 200,
                expandSpeed: 300,
                lineWidth: 10,
                life: 0.5
            });

            renderer.flash('#440066', 0.3);
            renderer.addScreenShake(25);
        }
    },
    {
        name: 'BOUNCE CASCADE',
        color: '#ffaa00',
        description: 'Impact spawns bouncing sub-projectiles',
        icon: '🎱',
        onImpact(impactX, impactY, state, helpers) {
            const { particles, renderer, addBounceProjectile } = helpers;

            // Spawn 3-5 bouncing projectiles
            const numProjectiles = 3 + Math.floor(Math.random() * 3);

            for (let i = 0; i < numProjectiles; i++) {
                const angle = (i / numProjectiles) * Math.PI * 2;
                const speed = 8 + Math.random() * 4;

                addBounceProjectile({
                    x: impactX,
                    y: impactY - 10,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - 5,
                    bounces: 0,
                    maxBounces: 3,
                    knockbackForce: 12,
                    radius: 80,
                    color: '#ffaa00'
                });
            }

            // Visual
            particles.explosion(impactX, impactY, 40, '#ffaa00', 50);
            renderer.addScreenShake(10);
        }
    },
    {
        name: 'QUAKE SLAM',
        color: '#886644',
        description: 'Ground-pound launches grounded tanks',
        icon: '🌋',
        onImpact(impactX, impactY, state, helpers) {
            const { applyKnockback, particles, renderer, terrain, TANK_RADIUS } = helpers;

            const quakeRadius = 500;
            const quakeForce = 25;

            for (const player of state.players) {
                if (player.health <= 0) continue;

                // Check if player is grounded
                const groundY = terrain.getHeightAt(player.x);
                const isGrounded = Math.abs(player.y + TANK_RADIUS - groundY) < 10;

                if (!isGrounded) continue;

                const dist = Math.abs(player.x - impactX);
                if (dist < quakeRadius) {
                    const force = quakeForce * (1 - dist / quakeRadius);
                    // Launch straight up
                    applyKnockback(player, (Math.random() - 0.5) * 5, -force);

                    // Ground crack effect
                    particles.sparks(player.x, player.y + TANK_RADIUS, 30, '#886644');
                }
            }

            // Visual: Ground wave
            for (let i = 0; i < 20; i++) {
                const angle = (i / 20) * Math.PI * 2;
                const dist = 20 + Math.random() * 40;
                particles.sparks(
                    impactX + Math.cos(angle) * dist,
                    impactY + Math.sin(angle) * dist * 0.3,
                    5, '#886644'
                );
            }

            particles.shockwave(impactX, impactY, {
                color: '#886644',
                maxRadius: quakeRadius,
                expandSpeed: 400,
                lineWidth: 6,
                life: 0.4
            });
            renderer.addScreenShake(35);
        }
    }
];

// ============================================================================
// Event System State
// ============================================================================

let activeGlitch = null;
let gravityWells = [];
let shockwaveRings = [];
let delayedExplosions = [];
let voidSpikes = [];
let bounceProjectiles = [];

// ============================================================================
// Event System API
// ============================================================================

/**
 * Roll for a glitch event (100% chance - always triggers)
 * @returns {Object} Random glitch object
 */
export function rollForEvent() {
    return IMPACT_GLITCHES[Math.floor(Math.random() * IMPACT_GLITCHES.length)];
}

/**
 * Set the active glitch for this turn
 */
export function applyEvent(state, event) {
    activeGlitch = event;
}

/**
 * Clear the active glitch (called at end of turn)
 */
export function revertEvent(state) {
    activeGlitch = null;
}

/**
 * Get the currently active glitch
 */
export function getActiveEvent() {
    return activeGlitch;
}

/**
 * Get all available glitches (for debugging/UI)
 */
export function getAllEvents() {
    return IMPACT_GLITCHES;
}

/**
 * Trigger the active glitch's on-impact effect
 * Called from main.js when a projectile explodes
 */
export function triggerImpactGlitch(impactX, impactY, state, helpers) {
    if (!activeGlitch || !activeGlitch.onImpact) return;

    // Extend helpers with effect spawning functions
    const extendedHelpers = {
        ...helpers,
        addGravityWell: (well) => gravityWells.push({ ...well, timer: well.duration }),
        addShockwaveRing: (ring) => shockwaveRings.push({ ...ring }),
        addDelayedExplosion: (exp) => delayedExplosions.push({ ...exp, timer: exp.delay }),
        addVoidSpike: (spike) => voidSpikes.push({ ...spike, timer: spike.duration }),
        addBounceProjectile: (proj) => bounceProjectiles.push({ ...proj, trail: [] })
    };

    activeGlitch.onImpact(impactX, impactY, state, extendedHelpers);
}

/**
 * Update all active glitch effects (gravity wells, shockwave rings, etc.)
 * Called from main.js update loop
 */
export function updateGlitchEffects(dt, state, helpers) {
    const { applyKnockback, particles, renderer, terrain, TANK_RADIUS, VIRTUAL_WIDTH, VIRTUAL_HEIGHT } = helpers;

    // === Update Gravity Wells ===
    for (let i = gravityWells.length - 1; i >= 0; i--) {
        const well = gravityWells[i];
        well.timer -= dt;

        // Pull tanks toward center
        for (const player of state.players) {
            if (player.health <= 0) continue;
            const dx = well.x - player.x;
            const dy = well.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < well.radius && dist > 10) {
                const force = well.pullStrength * dt * (1 - dist / well.radius);
                const angle = Math.atan2(dy, dx);
                player.vx = (player.vx || 0) + Math.cos(angle) * force;
                player.vy = (player.vy || 0) + Math.sin(angle) * force;
            }
        }

        // Visual: Swirling particles
        if (Math.random() < 0.3) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * well.radius * 0.8;
            particles.spawn(
                well.x + Math.cos(angle) * dist,
                well.y + Math.sin(angle) * dist,
                {
                    type: 'streak',
                    color: well.onExpire ? '#8800ff' : '#aa00ff',
                    angle: angle + Math.PI / 2,
                    speed: 3 + Math.random() * 5,
                    radius: 2,
                    life: 0.3,
                    gravity: 0,
                    friction: 0.9
                }
            );
        }

        // Expire and trigger callback
        if (well.timer <= 0) {
            if (well.onExpire) {
                well.onExpire(well, state, helpers);
            }
            gravityWells.splice(i, 1);
        }
    }

    // === Update Shockwave Rings ===
    for (let i = shockwaveRings.length - 1; i >= 0; i--) {
        const ring = shockwaveRings[i];
        const prevRadius = ring.currentRadius;
        ring.currentRadius += ring.expandSpeed * dt;

        // Push tanks when the ring passes through them
        for (const player of state.players) {
            if (player.health <= 0) continue;
            const dist = Math.sqrt(
                (player.x - ring.x) ** 2 + (player.y - ring.y) ** 2
            );

            // Check if ring just passed through this tank
            const inRingZone = dist >= prevRadius - ring.width / 2 &&
                              dist <= ring.currentRadius + ring.width / 2 &&
                              dist >= prevRadius;

            if (inRingZone && dist > 0) {
                const angle = Math.atan2(player.y - ring.y, player.x - ring.x);
                applyKnockback(player,
                    Math.cos(angle) * ring.pushForce,
                    Math.sin(angle) * ring.pushForce - 8
                );
            }
        }

        // Remove when done
        if (ring.currentRadius >= ring.maxRadius) {
            shockwaveRings.splice(i, 1);
        }
    }

    // === Update Delayed Explosions ===
    for (let i = delayedExplosions.length - 1; i >= 0; i--) {
        const exp = delayedExplosions[i];
        exp.timer -= dt;

        if (exp.timer <= 0) {
            // Trigger explosion
            particles.explosion(exp.x, exp.y, 40, exp.color, exp.radius);
            renderer.addScreenShake(12);

            // Apply knockback
            for (const player of state.players) {
                if (player.health <= 0) continue;
                const dist = Math.sqrt(
                    (player.x - exp.x) ** 2 + (player.y - exp.y) ** 2
                );

                if (dist < exp.radius && dist > 0) {
                    const force = exp.knockbackForce * (1 - dist / exp.radius);
                    const angle = Math.atan2(player.y - exp.y, player.x - exp.x);
                    applyKnockback(player, Math.cos(angle) * force, Math.sin(angle) * force - 5);
                }
            }

            delayedExplosions.splice(i, 1);
        }
    }

    // === Update Void Spikes ===
    for (let i = voidSpikes.length - 1; i >= 0; i--) {
        const spike = voidSpikes[i];
        spike.timer -= dt;

        // Check if any tanks are in the spike zone
        for (const player of state.players) {
            if (player.health <= 0) continue;
            const inXRange = Math.abs(player.x - spike.x) < spike.width / 2;
            const spikeTop = state.voidY - spike.height;

            if (inXRange && player.y + TANK_RADIUS > spikeTop) {
                // Touching void spike - deal damage
                player.health = 0;  // Instant kill
                particles.explosion(player.x, player.y, 80, '#440066', 100);
            }
        }

        // Visual: Void particles rising
        if (Math.random() < 0.2) {
            particles.spawn(
                spike.x + (Math.random() - 0.5) * spike.width,
                state.voidY - Math.random() * spike.height,
                {
                    type: 'glow',
                    color: '#440066',
                    speed: 1 + Math.random() * 2,
                    angle: -Math.PI / 2,
                    radius: 5 + Math.random() * 10,
                    life: 0.5,
                    gravity: -0.1,
                    friction: 0.95
                }
            );
        }

        if (spike.timer <= 0) {
            voidSpikes.splice(i, 1);
        }
    }

    // === Update Bounce Projectiles ===
    for (let i = bounceProjectiles.length - 1; i >= 0; i--) {
        const proj = bounceProjectiles[i];

        // Store trail
        proj.trail.push({ x: proj.x, y: proj.y, age: 0 });
        if (proj.trail.length > 10) proj.trail.shift();

        // Physics
        proj.vy += state.gravity;
        proj.x += proj.vx;
        proj.y += proj.vy;

        // Wall bounces
        if (proj.x < 20 || proj.x > VIRTUAL_WIDTH - 20) {
            proj.vx = -proj.vx * 0.9;
            proj.x = Math.max(20, Math.min(VIRTUAL_WIDTH - 20, proj.x));
            proj.bounces++;
            particles.sparks(proj.x, proj.y, 10, proj.color);
        }

        // Ceiling bounce
        if (proj.y < 20) {
            proj.vy = -proj.vy * 0.9;
            proj.y = 20;
            proj.bounces++;
            particles.sparks(proj.x, proj.y, 10, proj.color);
        }

        // Terrain collision
        if (terrain.isPointBelowTerrain(proj.x, proj.y) || proj.y > state.voidY) {
            // Explode and apply knockback
            particles.explosion(proj.x, proj.y, 25, proj.color, proj.radius * 0.6);

            for (const player of state.players) {
                if (player.health <= 0) continue;
                const dist = Math.sqrt(
                    (player.x - proj.x) ** 2 + (player.y - proj.y) ** 2
                );

                if (dist < proj.radius && dist > 0) {
                    const force = proj.knockbackForce * (1 - dist / proj.radius);
                    const angle = Math.atan2(player.y - proj.y, player.x - proj.x);
                    applyKnockback(player, Math.cos(angle) * force, Math.sin(angle) * force - 3);
                }
            }

            bounceProjectiles.splice(i, 1);
            continue;
        }

        // Max bounces
        if (proj.bounces >= proj.maxBounces) {
            particles.explosion(proj.x, proj.y, 25, proj.color, proj.radius * 0.6);
            bounceProjectiles.splice(i, 1);
        }
    }
}

/**
 * Draw active glitch effects
 */
export function drawGlitchEffects(renderer, state) {
    const ctx = renderer.ctx;

    // Draw gravity wells
    for (const well of gravityWells) {
        const alpha = Math.min(1, well.timer / 0.5);
        ctx.globalAlpha = alpha * 0.3;

        // Swirling effect
        const gradient = ctx.createRadialGradient(
            well.x, well.y, 0,
            well.x, well.y, well.radius
        );
        gradient.addColorStop(0, well.onExpire ? '#8800ff' : '#aa00ff');
        gradient.addColorStop(0.5, 'rgba(136, 0, 255, 0.3)');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(well.x, well.y, well.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    // Draw void spikes
    for (const spike of voidSpikes) {
        const alpha = Math.min(1, spike.timer / 0.5);
        ctx.globalAlpha = alpha * 0.7;

        const gradient = ctx.createLinearGradient(
            spike.x, state.voidY,
            spike.x, state.voidY - spike.height
        );
        gradient.addColorStop(0, '#440066');
        gradient.addColorStop(0.5, 'rgba(68, 0, 102, 0.5)');
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(spike.x - spike.width / 2, state.voidY);
        ctx.lineTo(spike.x, state.voidY - spike.height);
        ctx.lineTo(spike.x + spike.width / 2, state.voidY);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Glowing edge
        renderer.setGlow('#8800ff', 20);
        ctx.strokeStyle = '#8800ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        renderer.clearGlow();

        ctx.globalAlpha = 1;
    }

    // Draw bounce projectiles
    for (const proj of bounceProjectiles) {
        // Trail
        for (let i = 0; i < proj.trail.length; i++) {
            const point = proj.trail[i];
            const alpha = i / proj.trail.length * 0.5;
            ctx.globalAlpha = alpha;
            renderer.drawCircle(point.x, point.y, 4, proj.color, true);
        }
        ctx.globalAlpha = 1;

        // Projectile
        renderer.setGlow(proj.color, 15);
        renderer.drawCircle(proj.x, proj.y, 8, proj.color, true);
        renderer.clearGlow();
    }
}

/**
 * Clear all active glitch effects (called on round reset)
 */
export function clearGlitchEffects() {
    gravityWells = [];
    shockwaveRings = [];
    delayedExplosions = [];
    voidSpikes = [];
    bounceProjectiles = [];
}

/**
 * Check if there are active effects that need updating
 */
export function hasActiveEffects() {
    return gravityWells.length > 0 ||
           shockwaveRings.length > 0 ||
           delayedExplosions.length > 0 ||
           voidSpikes.length > 0 ||
           bounceProjectiles.length > 0;
}
