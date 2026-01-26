/**
 * Ambient World Systems for Void Artillery
 * Adds life to the game world: clouds, UFOs, weather, ambient particles
 */

import { randomRange, randomInt, randomChoice, clamp } from './utils.js';
import { COLORS } from './renderer.js';
import { particles } from './particles.js';

// ============================================================================
// Feature Toggles (for debugging/performance)
// ============================================================================
const DISABLE_UFOS = true;           // Disable UFO spawning and rendering
const DISABLE_SPACE_BATTLE = true;   // Disable background space battle

// ============================================================================
// Configuration
// ============================================================================

const CLOUD_CONFIG = {
    // Two parallax layers
    farCount: 4,
    nearCount: 3,
    farSpeed: 8,    // pixels per second
    nearSpeed: 20,
    farAlpha: 0.15,
    nearAlpha: 0.25,
    minWidth: 80,
    maxWidth: 200,
    minHeight: 30,
    maxHeight: 60
};

const UFO_CONFIG = {
    spawnChance: 0.002,   // Per frame chance (reduced)
    maxConcurrent: 2,     // Max UFOs at once (reduced from 4)
    minSpeed: 50,
    maxSpeed: 100,
    wobbleSpeed: 2,
    wobbleAmount: 15,
    shootInterval: 2000,  // ms between shots (slower)
    shootChance: 0.4,     // Chance to shoot when interval hits (reduced)
    // Combat properties
    health: 1,            // UFOs die in one hit
    hitboxWidth: 35,      // Ellipse hitbox width (half-width)
    hitboxHeight: 12,     // Ellipse hitbox height (half-height)
    // Shot damage properties
    shotDamage: 0,        // No damage to tanks (was 8)
    shotBlastRadius: 0    // No terrain destruction (was 40)
};

// Buff types that UFOs can drop
export const UFO_BUFF_TYPES = {
    DAMAGE: { name: 'DAMAGE+', color: '#ff4444', multiplier: 1.25 },
    BLAST: { name: 'BLAST+', color: '#44ff44', bonus: 15 },
    BOUNCES: { name: 'BOUNCE+', color: '#4444ff', bonus: 1 }
};

const WEATHER_CONFIG = {
    rain: {
        count: 200,       // 2x more
        speed: 600,       // 1.5x faster
        angle: 0.15,      // More angled
        color: '#4488ff',
        length: 25        // Longer streaks
    },
    snow: {
        count: 120,       // 2x more
        speed: 80,        // Faster
        wobble: 50,       // More wobble
        color: '#ffffff',
        radius: 3         // Bigger flakes
    },
    embers: {
        count: 100,       // 2.5x more
        speed: 50,        // Faster
        riseSpeed: -40,   // Rise faster
        color: '#ff6600',
        radius: 3         // Bigger
    }
};

// Space battle configuration - DISTANT EPIC (like a painting in the background)
const SPACE_BATTLE_CONFIG = {
    // Sky boundaries (percentage of canvas height)
    skyTopPct: 0.02,           // Top of battle area
    skyBottomPct: 0.45,        // Bottom of battle area (above terrain)

    // === GLOBAL DEPTH SETTINGS ===
    depthOverlayAlpha: 0.25,   // Dark overlay to push battle back visually

    // === DREADNOUGHTS (massive distant silhouettes) ===
    dreadnoughtCount: 3,
    dreadnought: {
        widthPctMin: 0.20,     // 20% of screen width minimum
        widthPctMax: 0.30,     // 30% of screen width maximum
        heightRatio: 0.18,     // Height = width * this ratio
        depthLayer: 0,         // Furthest back (dimmest)
        alpha: 0.18,           // Very dim, distant silhouettes
        driftSpeed: 1.2,       // Barely perceptible drift
        yPctMin: 0.05,         // Top of dreadnought zone
        yPctMax: 0.20,         // Bottom of dreadnought zone
        fireIntervalMin: 10,   // Long pauses between shots
        fireIntervalMax: 20,
        beamWidth: 4,          // Thinner beams
        beamSpeed: 120,        // Slow majestic bolts
        beamLength: 60
    },

    // === CRUISERS (medium ships, still distant) ===
    cruiserCount: 5,
    cruiser: {
        widthPctMin: 0.08,     // 8% of screen width
        widthPctMax: 0.15,     // 15% of screen width
        heightRatio: 0.20,
        depthLayer: 1,         // Middle layer
        alpha: 0.22,           // Still quite dim
        driftSpeed: 3,         // Slow drift
        yPctMin: 0.10,
        yPctMax: 0.35,
        fireIntervalMin: 6,    // Slower firing
        fireIntervalMax: 14,
        beamWidth: 2,          // Thin beams
        beamSpeed: 150,
        beamLength: 35
    },

    // === FIGHTERS (small ships, reduced count) ===
    fighterCount: 12,          // Cut in half
    fighter: {
        widthPctMin: 0.010,    // 1% of screen width
        widthPctMax: 0.025,    // 2.5% of screen width
        heightRatio: 0.5,
        depthLayer: 2,         // Nearest layer
        alpha: 0.30,           // Still subdued
        speed: 50,             // Cruising, not zipping
        yPctMin: 0.08,
        yPctMax: 0.40,
        fireChance: 0.003,     // Much less frequent firing
        beamWidth: 1,          // Hair-thin beams
        beamSpeed: 200,        // Moderate speed
        beamLength: 12,
        weaveAmount: 12,       // Subtle weaving
        weaveSpeed: 1.0        // Slower weave
    },

    // === PROJECTILE POOLING ===
    maxProjectiles: 25,        // Fewer active projectiles

    // === EXPLOSIONS & IMPACTS (subtle) ===
    impactFlashDuration: 0.05, // Brief shield flicker
    smallExplosionRadius: 10,
    largeExplosionRadius: 25,
    impactAlpha: 0.35,         // Subdued impacts
    criticalDamageChance: 0.003,
    shipDestructionChance: 0.001,
    debrisPerDestruction: 8,

    // === SPACE DUST (atmospheric) ===
    dustCount: 40,
    dustSpeedMin: 2,
    dustSpeedMax: 8,
    dustAlphaMin: 0.03,
    dustAlphaMax: 0.08,
    dustSizeMin: 1,
    dustSizeMax: 2,

    // === DISTANT FLASHES (game sync reactions) ===
    distantFlashChance: 0.0015,
    distantFlashRadius: 120,        // Bigger flashes
    distantFlashDuration: 0.4,      // Last longer
    distantFlashAlpha: 0.5,         // MUCH brighter (was 0.15)

    // === ATMOSPHERE ===
    hazeAlpha: 0.04,

    // === FACTION COLORS (slightly muted for distance) ===
    factionA: {  // Cool fleet (blue/purple)
        hull: '#151f28',
        edge: '#2a4a75',
        engine: '#3366aa',
        laser: '#00aacc',
        accent: '#4433aa'
    },
    factionB: {  // Warm fleet (orange/red)
        hull: '#28201a',
        edge: '#885533',
        engine: '#cc6633',
        laser: '#cc8800',
        accent: '#883322'
    },

    // Common colors (muted)
    explosion: '#cc9933',
    explosionCore: '#dddddd',
    shieldFlash: '#66cccc',
    smoke: '#333333',

    // Projectile glow settings
    projectileGlowHeavy: 8,
    projectileGlowLight: 4,
    projectileAlpha: 0.4
};

// Lightning configuration
const LIGHTNING_CONFIG = {
    strikeChance: 0.0008,  // Per frame during rain
    branchCount: 4,
    segmentLength: 30,
    damage: 0,             // No damage to tanks
    terrainDamage: 35,     // Crater radius
    duration: 0.15         // Seconds visible
};

const AMBIENT_CONFIG = {
    dustCount: 15,
    glitchCount: 8,
    dustSpeed: 5,
    glitchFlickerRate: 0.1
};

// Wind streak configuration
const WIND_STREAK_CONFIG = {
    maxStreaks: 40,           // Maximum wind streaks at once
    baseSpeed: 800,           // Base horizontal speed (pixels/sec)
    lengthMin: 30,            // Minimum streak length
    lengthMax: 80,            // Maximum streak length
    spawnRate: 0.15,          // Base spawn chance per frame (scaled by wind)
    yMin: 50,                 // Top of spawn zone
    yMaxPct: 0.8,             // Bottom of spawn zone (% of canvas height)
    alpha: 0.15,              // Base opacity
    alphaWindBlast: 0.35,     // Opacity during WIND BLAST
    color: '#ffffff',         // Normal color
    colorWindBlast: '#ff00ff' // Color during WIND BLAST
};

// ============================================================================
// Cloud System
// ============================================================================

class Cloud {
    constructor(canvasWidth, canvasHeight, layer = 'far') {
        this.layer = layer;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        const config = layer === 'far' ? {
            speed: CLOUD_CONFIG.farSpeed,
            alpha: CLOUD_CONFIG.farAlpha,
            yRange: [50, 200]
        } : {
            speed: CLOUD_CONFIG.nearSpeed,
            alpha: CLOUD_CONFIG.nearAlpha,
            yRange: [80, 250]
        };

        this.width = randomRange(CLOUD_CONFIG.minWidth, CLOUD_CONFIG.maxWidth);
        this.height = randomRange(CLOUD_CONFIG.minHeight, CLOUD_CONFIG.maxHeight);
        this.x = randomRange(-this.width, canvasWidth);
        this.y = randomRange(config.yRange[0], config.yRange[1]);
        this.speed = config.speed * randomRange(0.8, 1.2);
        this.alpha = config.alpha * randomRange(0.8, 1.2);

        // Cloud is made of overlapping circles
        this.blobs = [];
        const blobCount = randomInt(3, 6);
        for (let i = 0; i < blobCount; i++) {
            this.blobs.push({
                offsetX: randomRange(-this.width * 0.3, this.width * 0.3),
                offsetY: randomRange(-this.height * 0.2, this.height * 0.2),
                radius: randomRange(this.height * 0.4, this.height * 0.7)
            });
        }
    }

    update(dt) {
        this.x += this.speed * dt;

        // Wrap around
        if (this.x > this.canvasWidth + this.width) {
            this.x = -this.width;
            this.y = randomRange(
                this.layer === 'far' ? 50 : 80,
                this.layer === 'far' ? 200 : 250
            );
        }
    }

    draw(renderer) {
        renderer.ctx.globalAlpha = this.alpha;
        renderer.ctx.fillStyle = '#222233';

        for (const blob of this.blobs) {
            renderer.ctx.beginPath();
            renderer.ctx.arc(
                this.x + blob.offsetX,
                this.y + blob.offsetY,
                blob.radius,
                0, Math.PI * 2
            );
            renderer.ctx.fill();
        }

        renderer.ctx.globalAlpha = 1;
    }
}

// ============================================================================
// UFO System
// ============================================================================

class UFO {
    constructor(canvasWidth, canvasHeight, onShoot, onDestroyed) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.onShoot = onShoot;
        this.onDestroyed = onDestroyed;  // Callback when destroyed by player

        // Spawn from left or right
        this.direction = Math.random() < 0.5 ? 1 : -1;
        this.x = this.direction === 1 ? -50 : canvasWidth + 50;
        this.y = randomRange(60, 180);
        this.baseY = this.y;

        this.speed = randomRange(UFO_CONFIG.minSpeed, UFO_CONFIG.maxSpeed);
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.lastShot = 0;
        this.dead = false;

        // Combat properties
        this.health = UFO_CONFIG.health;
        this.hitboxWidth = UFO_CONFIG.hitboxWidth;
        this.hitboxHeight = UFO_CONFIG.hitboxHeight;
        this.destroyedByPlayer = null;  // Track who destroyed it

        // Visual properties
        this.color = randomChoice([COLORS.cyan, COLORS.magenta, '#88ff88', '#ffff88']);
        this.glowPulse = 0;
        this.time = 0;
    }

    /**
     * Check if a point (projectile) hits this UFO's ellipse hitbox
     */
    checkHit(px, py, projectileRadius = 5) {
        // Ellipse collision: normalize to circle space
        const dx = (px - this.x) / this.hitboxWidth;
        const dy = (py - this.y) / this.hitboxHeight;
        const normalizedDist = Math.sqrt(dx * dx + dy * dy);
        // Account for projectile radius (approximate)
        const threshold = 1 + (projectileRadius / Math.max(this.hitboxWidth, this.hitboxHeight));
        return normalizedDist < threshold;
    }

    /**
     * Apply damage to UFO, returns true if destroyed
     */
    takeDamage(amount, playerIndex) {
        if (this.dead) return false;

        this.health -= amount;
        if (this.health <= 0) {
            this.dead = true;
            this.destroyedByPlayer = playerIndex;

            // Trigger destruction callback
            if (this.onDestroyed) {
                const buffType = randomChoice(Object.keys(UFO_BUFF_TYPES));
                this.onDestroyed(this.x, this.y, this.color, playerIndex, buffType);
            }
            return true;
        }
        return false;
    }

    update(dt, time) {
        // Store time for draw method
        this.time = time;

        // Move horizontally
        this.x += this.speed * this.direction * dt;

        // Wobble vertically
        this.wobblePhase += UFO_CONFIG.wobbleSpeed * dt;
        this.y = this.baseY + Math.sin(this.wobblePhase) * UFO_CONFIG.wobbleAmount;

        // Glow pulse
        this.glowPulse = (Math.sin(time * 8) + 1) * 0.5;

        // Shooting
        const now = performance.now();
        if (now - this.lastShot > UFO_CONFIG.shootInterval) {
            this.lastShot = now;
            if (Math.random() < UFO_CONFIG.shootChance && this.onShoot) {
                this.onShoot(this.x, this.y + 15, this.color);
            }
        }

        // Remove when off screen
        if ((this.direction === 1 && this.x > this.canvasWidth + 100) ||
            (this.direction === -1 && this.x < -100)) {
            this.dead = true;
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;

        // Beam effect (occasionally)
        if (Math.random() < 0.3) {
            ctx.globalAlpha = 0.1;
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(this.x - 15, this.y + 10);
            ctx.lineTo(this.x + 15, this.y + 10);
            ctx.lineTo(this.x + 30, this.y + 100);
            ctx.lineTo(this.x - 30, this.y + 100);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // UFO body (saucer shape)
        renderer.setGlow(this.color, 15 + this.glowPulse * 10);

        // Bottom dome
        ctx.fillStyle = '#333344';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y + 5, 25, 8, 0, 0, Math.PI);
        ctx.fill();

        // Main saucer
        ctx.fillStyle = '#444455';
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, 30, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Top dome
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.6 + this.glowPulse * 0.4;
        ctx.beginPath();
        ctx.ellipse(this.x, this.y - 5, 12, 8, 0, Math.PI, 0);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Lights around edge
        const lightCount = 6;
        for (let i = 0; i < lightCount; i++) {
            const angle = (i / lightCount) * Math.PI * 2 + this.time * 2;
            const lx = this.x + Math.cos(angle) * 22;
            const ly = this.y + Math.sin(angle) * 7;
            renderer.drawCircle(lx, ly, 2, this.color, true);
        }

        renderer.clearGlow();
    }
}

// ============================================================================
// UFO Shot (cosmetic projectile)
// ============================================================================

class UFOShot {
    constructor(x, y, color, terrainCallback, tankCallback) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vy = randomRange(120, 200);  // Faster shots
        this.vx = randomRange(-40, 40);
        this.life = 2.5;
        this.dead = false;
        this.radius = 5;
        this.trail = [];
        this.terrainCallback = terrainCallback;
        this.tankCallback = tankCallback;
        this.hasHit = false;
    }

    update(dt, canvasHeight, voidY, players = []) {
        // Store trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 10) this.trail.shift();

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        // Check for tank collision (damage tanks!)
        if (!this.hasHit && this.tankCallback) {
            for (const player of players) {
                if (player.health <= 0) continue;
                const dx = this.x - player.x;
                const dy = this.y - player.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 30) {  // Tank radius
                    // Deal damage to tank
                    this.tankCallback(player, UFO_CONFIG.shotDamage, this.x, this.y);
                    this.hasHit = true;
                    this.dead = true;
                    particles.sparks(this.x, this.y, 20, this.color);
                    particles.sparks(this.x, this.y, 15, '#ffffff');
                    return;
                }
            }
        }

        // Die on ground or void or timeout
        if (this.life <= 0 || this.y > voidY || this.y > canvasHeight) {
            this.dead = true;
            // Impact effect with terrain damage
            particles.sparks(this.x, this.y, 15, this.color);
            if (this.terrainCallback && this.y < voidY) {
                this.terrainCallback(this.x, this.y, UFO_CONFIG.shotBlastRadius);
            }
        }
    }

    draw(renderer) {
        // Trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i / this.trail.length) * 0.5;
            renderer.ctx.globalAlpha = alpha;
            renderer.drawCircle(t.x, t.y, this.radius * 0.6, this.color, false);
        }
        renderer.ctx.globalAlpha = 1;

        // Main shot with glow
        renderer.setGlow(this.color, 10);
        renderer.drawCircle(this.x, this.y, this.radius, this.color, true);
        renderer.clearGlow();
    }
}

// ============================================================================
// Weather Particle
// ============================================================================

class WeatherParticle {
    constructor(type, canvasWidth, canvasHeight) {
        this.type = type;
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.reset(true);
    }

    reset(initial = false) {
        const config = WEATHER_CONFIG[this.type];

        this.x = randomRange(0, this.canvasWidth);
        this.y = initial ? randomRange(0, this.canvasHeight) : -10;

        if (this.type === 'rain') {
            this.speed = config.speed * randomRange(0.8, 1.2);
            this.length = config.length * randomRange(0.8, 1.2);
        } else if (this.type === 'snow') {
            this.speed = config.speed * randomRange(0.6, 1.4);
            this.radius = config.radius * randomRange(0.5, 1.5);
            this.wobblePhase = Math.random() * Math.PI * 2;
            this.wobbleSpeed = randomRange(2, 4);
        } else if (this.type === 'embers') {
            this.speed = config.speed * randomRange(0.5, 1.5);
            this.radius = config.radius * randomRange(0.5, 1.5);
            this.wobblePhase = Math.random() * Math.PI * 2;
            this.riseSpeed = config.riseSpeed * randomRange(0.8, 1.2);
            this.life = randomRange(2, 4);
            this.maxLife = this.life;
            // Embers start from bottom
            this.y = initial ? randomRange(this.canvasHeight * 0.5, this.canvasHeight) : this.canvasHeight + 10;
        }
    }

    update(dt, voidY) {
        const config = WEATHER_CONFIG[this.type];

        if (this.type === 'rain') {
            this.x += Math.sin(config.angle) * this.speed * dt;
            this.y += this.speed * dt;

            if (this.y > voidY || this.y > this.canvasHeight) {
                this.reset();
            }
        } else if (this.type === 'snow') {
            this.wobblePhase += this.wobbleSpeed * dt;
            this.x += Math.sin(this.wobblePhase) * config.wobble * dt;
            this.y += this.speed * dt;

            if (this.y > voidY || this.y > this.canvasHeight) {
                this.reset();
            }
        } else if (this.type === 'embers') {
            this.wobblePhase += 3 * dt;
            this.x += Math.sin(this.wobblePhase) * 20 * dt;
            this.y += this.riseSpeed * dt;
            this.life -= dt;

            if (this.life <= 0 || this.y < -20) {
                this.reset();
            }
        }
    }

    draw(renderer) {
        const config = WEATHER_CONFIG[this.type];

        if (this.type === 'rain') {
            renderer.ctx.globalAlpha = 0.4;
            renderer.ctx.strokeStyle = config.color;
            renderer.ctx.lineWidth = 1;
            renderer.ctx.beginPath();
            renderer.ctx.moveTo(this.x, this.y);
            renderer.ctx.lineTo(
                this.x + Math.sin(config.angle) * this.length,
                this.y + this.length
            );
            renderer.ctx.stroke();
            renderer.ctx.globalAlpha = 1;
        } else if (this.type === 'snow') {
            renderer.ctx.globalAlpha = 0.6;
            renderer.drawCircle(this.x, this.y, this.radius, config.color, false);
            renderer.ctx.globalAlpha = 1;
        } else if (this.type === 'embers') {
            const alpha = clamp(this.life / this.maxLife, 0, 1) * 0.8;
            renderer.ctx.globalAlpha = alpha;
            renderer.setGlow(config.color, 10);
            renderer.drawCircle(this.x, this.y, this.radius, config.color, false);
            renderer.clearGlow();
            renderer.ctx.globalAlpha = 1;
        }
    }
}

// ============================================================================
// Ambient Dust/Glitch Particle
// ============================================================================

class AmbientParticle {
    constructor(type, canvasWidth, canvasHeight) {
        this.type = type;  // 'dust' or 'glitch'
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.reset(true);
    }

    reset(initial = false) {
        this.x = randomRange(0, this.canvasWidth);
        this.y = randomRange(0, this.canvasHeight);

        if (this.type === 'dust') {
            this.vx = randomRange(-AMBIENT_CONFIG.dustSpeed, AMBIENT_CONFIG.dustSpeed);
            this.vy = randomRange(-AMBIENT_CONFIG.dustSpeed * 0.5, AMBIENT_CONFIG.dustSpeed * 0.5);
            this.radius = randomRange(1, 3);
            this.alpha = randomRange(0.1, 0.3);
            this.color = '#666688';
        } else {
            // Glitch speck
            this.flickerTimer = 0;
            this.visible = true;
            this.width = randomRange(2, 8);
            this.height = randomRange(1, 3);
            this.alpha = randomRange(0.2, 0.5);
            this.color = randomChoice([COLORS.cyan, COLORS.magenta, '#ffffff']);
            this.lifetime = randomRange(0.5, 2);
            this.maxLifetime = this.lifetime;
        }
    }

    update(dt) {
        if (this.type === 'dust') {
            this.x += this.vx * dt;
            this.y += this.vy * dt;

            // Wrap around
            if (this.x < 0) this.x = this.canvasWidth;
            if (this.x > this.canvasWidth) this.x = 0;
            if (this.y < 0) this.y = this.canvasHeight;
            if (this.y > this.canvasHeight) this.y = 0;
        } else {
            // Glitch flicker
            this.flickerTimer += dt;
            if (this.flickerTimer > AMBIENT_CONFIG.glitchFlickerRate) {
                this.flickerTimer = 0;
                this.visible = Math.random() > 0.3;
            }

            this.lifetime -= dt;
            if (this.lifetime <= 0) {
                this.reset();
            }
        }
    }

    draw(renderer) {
        if (this.type === 'dust') {
            renderer.ctx.globalAlpha = this.alpha;
            renderer.ctx.fillStyle = this.color;
            renderer.ctx.beginPath();
            renderer.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            renderer.ctx.fill();
            renderer.ctx.globalAlpha = 1;
        } else if (this.visible) {
            const fadeAlpha = clamp(this.lifetime / this.maxLifetime, 0, 1);
            renderer.ctx.globalAlpha = this.alpha * fadeAlpha;
            renderer.setGlow(this.color, 5);
            renderer.ctx.fillStyle = this.color;
            renderer.ctx.fillRect(this.x, this.y, this.width, this.height);
            renderer.clearGlow();
            renderer.ctx.globalAlpha = 1;
        }
    }
}

// ============================================================================
// Wind Streak System
// ============================================================================

class WindStreak {
    constructor(canvasWidth, canvasHeight, wind, isWindBlast) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.reset(wind, isWindBlast, true);
    }

    reset(wind, isWindBlast, initial = false) {
        const cfg = WIND_STREAK_CONFIG;
        const absWind = Math.abs(wind);

        // Length scales with wind intensity
        const lengthScale = 0.5 + absWind * 8; // 0.5 to ~1.1 at max wind
        this.length = randomRange(cfg.lengthMin, cfg.lengthMax) * lengthScale;

        // Spawn from upwind edge
        if (wind > 0) {
            this.x = initial ? randomRange(-100, this.canvasWidth) : -this.length;
        } else {
            this.x = initial ? randomRange(0, this.canvasWidth + 100) : this.canvasWidth + this.length;
        }

        // Random Y position
        const yMax = this.canvasHeight * cfg.yMaxPct;
        this.y = randomRange(cfg.yMin, yMax);

        // Speed scales with wind
        this.speed = cfg.baseSpeed * absWind * 10 * randomRange(0.8, 1.2);

        // Direction matches wind
        this.direction = wind > 0 ? 1 : -1;

        // Visual properties
        this.alpha = isWindBlast ? cfg.alphaWindBlast : cfg.alpha;
        this.color = isWindBlast ? cfg.colorWindBlast : cfg.color;

        // Slight vertical drift
        this.vy = randomRange(-20, 20);

        this.dead = false;
    }

    update(dt, wind) {
        // Move horizontally with wind
        this.x += this.speed * this.direction * dt;
        this.y += this.vy * dt;

        // Check if off screen
        if (this.direction > 0 && this.x > this.canvasWidth + this.length) {
            this.dead = true;
        } else if (this.direction < 0 && this.x < -this.length) {
            this.dead = true;
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        ctx.globalAlpha = this.alpha;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.direction * this.length, this.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// EPIC SPACE BATTLE SYSTEM - "Holy shit there's a WAR up there"
// ============================================================================

// Helper to get sky bounds based on canvas size
function getSkyBounds(canvasHeight) {
    return {
        top: canvasHeight * SPACE_BATTLE_CONFIG.skyTopPct,
        bottom: canvasHeight * SPACE_BATTLE_CONFIG.skyBottomPct
    };
}

// ============================================================================
// DREADNOUGHT - Massive capital ships (20-30% screen width)
// ============================================================================

class Dreadnought {
    constructor(canvasWidth, canvasHeight, index, allShips) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.index = index;
        this.allShips = allShips;
        this.reset(true);
    }

    reset(initial = false) {
        const cfg = SPACE_BATTLE_CONFIG.dreadnought;
        const sky = getSkyBounds(this.canvasHeight);

        // Size based on screen width percentage
        this.width = this.canvasWidth * randomRange(cfg.widthPctMin, cfg.widthPctMax);
        this.height = this.width * cfg.heightRatio;

        // Distribute across screen
        const section = this.canvasWidth / SPACE_BATTLE_CONFIG.dreadnoughtCount;
        this.x = section * this.index + randomRange(section * 0.2, section * 0.8);

        // Y position in dreadnought zone
        const yMin = this.canvasHeight * cfg.yPctMin;
        const yMax = this.canvasHeight * cfg.yPctMax;
        this.y = randomRange(yMin, yMax);

        // Slow drift
        this.vx = randomRange(-1, 1) * cfg.driftSpeed;
        this.vy = randomRange(-0.5, 0.5) * cfg.driftSpeed;

        // Faction (alternating)
        this.faction = this.index % 2 === 0 ? 'A' : 'B';
        const colors = this.faction === 'A' ? SPACE_BATTLE_CONFIG.factionA : SPACE_BATTLE_CONFIG.factionB;
        this.colors = colors;

        // Ship style
        this.style = randomChoice(['destroyer', 'carrier', 'battleship']);

        // Animation state
        this.enginePulse = Math.random() * Math.PI * 2;
        this.lightPhase = Math.random() * Math.PI * 2;
        this.windowFlicker = Array(8).fill(0).map(() => Math.random() * Math.PI * 2);

        // Firing
        this.fireTimer = randomRange(cfg.fireIntervalMin, cfg.fireIntervalMax);

        // Damage state
        this.damaged = false;
        this.smokeTimer = 0;

        // Alpha based on depth
        this.alpha = cfg.alpha;
    }

    update(dt, fireCallback, addExplosion, addSmoke) {
        const cfg = SPACE_BATTLE_CONFIG.dreadnought;
        const sky = getSkyBounds(this.canvasHeight);

        // Drift
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Animation
        this.enginePulse += dt * 2;
        this.lightPhase += dt * 4;
        for (let i = 0; i < this.windowFlicker.length; i++) {
            this.windowFlicker[i] += dt * (3 + i * 0.5);
        }

        // Boundary bounce
        const margin = this.width * 0.6;
        if (this.x < margin || this.x > this.canvasWidth - margin) this.vx *= -1;
        const yMin = this.canvasHeight * cfg.yPctMin;
        const yMax = this.canvasHeight * cfg.yPctMax;
        if (this.y < yMin || this.y > yMax) this.vy *= -1;

        // Fire at enemy ships
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && fireCallback) {
            this.fireTimer = randomRange(cfg.fireIntervalMin, cfg.fireIntervalMax);

            // Target an enemy ship (different faction)
            const enemies = this.allShips.filter(s => s !== this && s.faction !== this.faction);
            if (enemies.length > 0) {
                const target = randomChoice(enemies);
                fireCallback(this.x, this.y, target, this.colors.laser, 'heavy', this.width);
            }
        }

        // Smoke if damaged
        if (this.damaged && addSmoke) {
            this.smokeTimer -= dt;
            if (this.smokeTimer <= 0) {
                this.smokeTimer = 0.15;
                addSmoke(this.x + randomRange(-this.width * 0.3, this.width * 0.3),
                         this.y + randomRange(-this.height * 0.3, this.height * 0.3));
            }
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        const w = this.width;
        const h = this.height;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.alpha;

        if (this.style === 'destroyer') {
            // Star Destroyer style - long wedge
            ctx.fillStyle = this.colors.hull;
            ctx.beginPath();
            ctx.moveTo(w * 0.5, 0);                    // Nose
            ctx.lineTo(w * 0.3, -h * 0.15);
            ctx.lineTo(-w * 0.1, -h * 0.3);
            ctx.lineTo(-w * 0.4, -h * 0.45);
            ctx.lineTo(-w * 0.5, -h * 0.4);
            ctx.lineTo(-w * 0.5, h * 0.4);
            ctx.lineTo(-w * 0.4, h * 0.45);
            ctx.lineTo(-w * 0.1, h * 0.3);
            ctx.lineTo(w * 0.3, h * 0.15);
            ctx.closePath();
            ctx.fill();

            // Bridge tower
            ctx.fillStyle = '#0a0a15';
            ctx.fillRect(-w * 0.05, -h * 0.55, w * 0.15, h * 0.25);
            ctx.fillRect(-w * 0.02, -h * 0.7, w * 0.08, h * 0.15);

        } else if (this.style === 'carrier') {
            // Flat carrier with flight deck
            ctx.fillStyle = this.colors.hull;
            ctx.beginPath();
            ctx.moveTo(w * 0.45, -h * 0.1);
            ctx.lineTo(w * 0.45, h * 0.1);
            ctx.lineTo(-w * 0.45, h * 0.35);
            ctx.lineTo(-w * 0.5, h * 0.3);
            ctx.lineTo(-w * 0.5, -h * 0.3);
            ctx.lineTo(-w * 0.45, -h * 0.35);
            ctx.closePath();
            ctx.fill();

            // Flight deck markings
            ctx.strokeStyle = this.colors.edge;
            ctx.lineWidth = 2;
            ctx.globalAlpha = this.alpha * 0.5;
            ctx.beginPath();
            ctx.moveTo(w * 0.3, 0);
            ctx.lineTo(-w * 0.3, 0);
            ctx.stroke();
            ctx.globalAlpha = this.alpha;

        } else {
            // Battleship - chunky with gun batteries
            ctx.fillStyle = this.colors.hull;
            ctx.beginPath();
            ctx.moveTo(w * 0.4, 0);
            ctx.lineTo(w * 0.3, -h * 0.25);
            ctx.lineTo(-w * 0.2, -h * 0.4);
            ctx.lineTo(-w * 0.5, -h * 0.35);
            ctx.lineTo(-w * 0.5, h * 0.35);
            ctx.lineTo(-w * 0.2, h * 0.4);
            ctx.lineTo(w * 0.3, h * 0.25);
            ctx.closePath();
            ctx.fill();

            // Gun turrets
            ctx.fillStyle = this.colors.edge;
            ctx.beginPath();
            ctx.arc(w * 0.1, -h * 0.25, h * 0.12, 0, Math.PI * 2);
            ctx.arc(w * 0.1, h * 0.25, h * 0.12, 0, Math.PI * 2);
            ctx.arc(-w * 0.2, 0, h * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }

        // Edge highlight
        ctx.globalAlpha = this.alpha * 0.6;
        ctx.strokeStyle = this.colors.edge;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Window lights (flickering)
        ctx.globalAlpha = this.alpha;
        for (let i = 0; i < this.windowFlicker.length; i++) {
            const brightness = 0.3 + Math.sin(this.windowFlicker[i]) * 0.4;
            if (brightness > 0.4) {
                const wx = -w * 0.3 + (i % 4) * w * 0.12;
                const wy = -h * 0.2 + Math.floor(i / 4) * h * 0.25;
                ctx.globalAlpha = this.alpha * brightness;
                ctx.fillStyle = '#ffffaa';
                ctx.fillRect(wx, wy, 3, 2);
            }
        }

        // Running lights
        const lightOn = Math.sin(this.lightPhase) > 0;
        if (lightOn) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = this.colors.engine;
            ctx.beginPath();
            ctx.arc(w * 0.48, 0, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.faction === 'A' ? '#ff0000' : '#00ff00';
            ctx.beginPath();
            ctx.arc(-w * 0.48, -h * 0.3, 2, 0, Math.PI * 2);
            ctx.arc(-w * 0.48, h * 0.3, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Engine glow
        const engineBrightness = 0.5 + Math.sin(this.enginePulse) * 0.3;
        ctx.globalAlpha = engineBrightness;
        renderer.setGlow(this.colors.engine, 20);
        ctx.fillStyle = this.colors.engine;
        ctx.beginPath();
        ctx.ellipse(-w * 0.52, 0, 8, h * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
        renderer.clearGlow();

        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// CRUISER - Medium ships (8-15% screen width)
// ============================================================================

class Cruiser {
    constructor(canvasWidth, canvasHeight, index, allShips) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.index = index;
        this.allShips = allShips;
        this.reset(true);
    }

    reset(initial = false) {
        const cfg = SPACE_BATTLE_CONFIG.cruiser;

        this.width = this.canvasWidth * randomRange(cfg.widthPctMin, cfg.widthPctMax);
        this.height = this.width * cfg.heightRatio;

        this.x = randomRange(this.width, this.canvasWidth - this.width);
        const yMin = this.canvasHeight * cfg.yPctMin;
        const yMax = this.canvasHeight * cfg.yPctMax;
        this.y = randomRange(yMin, yMax);

        this.vx = randomRange(-1, 1) * cfg.driftSpeed;
        this.vy = randomRange(-0.5, 0.5) * cfg.driftSpeed;

        this.faction = this.index % 2 === 0 ? 'A' : 'B';
        this.colors = this.faction === 'A' ? SPACE_BATTLE_CONFIG.factionA : SPACE_BATTLE_CONFIG.factionB;

        this.style = randomChoice(['frigate', 'corvette', 'gunship']);

        this.enginePulse = Math.random() * Math.PI * 2;
        this.lightPhase = Math.random() * Math.PI * 2;

        this.fireTimer = randomRange(cfg.fireIntervalMin, cfg.fireIntervalMax);
        this.alpha = cfg.alpha;

        this.damaged = false;
        this.smokeTimer = 0;
    }

    update(dt, fireCallback, addExplosion, addSmoke) {
        const cfg = SPACE_BATTLE_CONFIG.cruiser;

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.enginePulse += dt * 3;
        this.lightPhase += dt * 5;

        // Boundary
        const margin = this.width * 0.6;
        if (this.x < margin || this.x > this.canvasWidth - margin) this.vx *= -1;
        const yMin = this.canvasHeight * cfg.yPctMin;
        const yMax = this.canvasHeight * cfg.yPctMax;
        if (this.y < yMin || this.y > yMax) this.vy *= -1;

        // Fire
        this.fireTimer -= dt;
        if (this.fireTimer <= 0 && fireCallback) {
            this.fireTimer = randomRange(cfg.fireIntervalMin, cfg.fireIntervalMax);
            const enemies = this.allShips.filter(s => s !== this && s.faction !== this.faction);
            if (enemies.length > 0) {
                const target = randomChoice(enemies);
                fireCallback(this.x, this.y, target, this.colors.laser, 'medium', this.width);
            }
        }

        if (this.damaged && addSmoke) {
            this.smokeTimer -= dt;
            if (this.smokeTimer <= 0) {
                this.smokeTimer = 0.2;
                addSmoke(this.x + randomRange(-this.width * 0.2, this.width * 0.2), this.y);
            }
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        const w = this.width;
        const h = this.height;

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.globalAlpha = this.alpha;

        // Simple angular shape
        ctx.fillStyle = this.colors.hull;
        ctx.beginPath();
        ctx.moveTo(w * 0.5, 0);
        ctx.lineTo(w * 0.2, -h * 0.4);
        ctx.lineTo(-w * 0.4, -h * 0.45);
        ctx.lineTo(-w * 0.5, -h * 0.3);
        ctx.lineTo(-w * 0.5, h * 0.3);
        ctx.lineTo(-w * 0.4, h * 0.45);
        ctx.lineTo(w * 0.2, h * 0.4);
        ctx.closePath();
        ctx.fill();

        // Edge
        ctx.globalAlpha = this.alpha * 0.5;
        ctx.strokeStyle = this.colors.edge;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Engine
        const engineBrightness = 0.4 + Math.sin(this.enginePulse) * 0.3;
        ctx.globalAlpha = engineBrightness;
        renderer.setGlow(this.colors.engine, 12);
        ctx.fillStyle = this.colors.engine;
        ctx.beginPath();
        ctx.ellipse(-w * 0.52, 0, 5, h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        renderer.clearGlow();

        // Running light
        if (Math.sin(this.lightPhase) > 0.3) {
            ctx.globalAlpha = 0.8;
            ctx.fillStyle = this.colors.engine;
            ctx.beginPath();
            ctx.arc(w * 0.48, 0, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// FIGHTER - Small fast ships (1-2.5% screen width)
// ============================================================================

class Fighter {
    constructor(canvasWidth, canvasHeight, allShips) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.allShips = allShips;
        this.trail = [];
        this.maxTrailLength = 6;
        this.reset(true);
    }

    reset(initial = false) {
        const cfg = SPACE_BATTLE_CONFIG.fighter;

        this.width = this.canvasWidth * randomRange(cfg.widthPctMin, cfg.widthPctMax);
        this.height = this.width * cfg.heightRatio;

        this.x = randomRange(0, this.canvasWidth);
        const yMin = this.canvasHeight * cfg.yPctMin;
        const yMax = this.canvasHeight * cfg.yPctMax;
        this.y = randomRange(yMin, yMax);

        this.angle = randomRange(0, Math.PI * 2);
        this.speed = cfg.speed * randomRange(0.8, 1.3);

        this.faction = Math.random() < 0.5 ? 'A' : 'B';
        this.colors = this.faction === 'A' ? SPACE_BATTLE_CONFIG.factionA : SPACE_BATTLE_CONFIG.factionB;

        // Weaving behavior
        this.weavePhase = Math.random() * Math.PI * 2;
        this.turnTimer = randomRange(0.5, 2);

        this.alpha = cfg.alpha;
        this.trail = [];
    }

    /**
     * Fighter takes damage and explodes (for game sync effects)
     */
    takeDamage(amount) {
        this.exploding = true;
        this.explosionTimer = 0.5;  // Brief explosion duration
    }

    update(dt, fireCallback) {
        const cfg = SPACE_BATTLE_CONFIG.fighter;
        const sky = getSkyBounds(this.canvasHeight);

        // Handle explosion
        if (this.exploding) {
            this.explosionTimer -= dt;
            if (this.explosionTimer <= 0) {
                this.exploding = false;
                this.reset();  // Respawn as new fighter
            }
            return;  // Don't update position while exploding
        }

        // Store trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.maxTrailLength) this.trail.shift();

        // Weaving motion
        this.weavePhase += cfg.weaveSpeed * dt;
        const weaveOffset = Math.sin(this.weavePhase) * cfg.weaveAmount * dt;

        // Move
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt + weaveOffset;

        // Random turns
        this.turnTimer -= dt;
        if (this.turnTimer <= 0) {
            this.angle += randomRange(-1, 1);
            this.turnTimer = randomRange(0.5, 2);
        }

        // Wrap
        if (this.x < -30) this.x = this.canvasWidth + 30;
        if (this.x > this.canvasWidth + 30) this.x = -30;
        const yMin = this.canvasHeight * cfg.yPctMin - 20;
        const yMax = this.canvasHeight * cfg.yPctMax + 20;
        if (this.y < yMin) { this.y = yMin; this.angle = Math.abs(this.angle); }
        if (this.y > yMax) { this.y = yMax; this.angle = -Math.abs(this.angle); }

        // Fire occasionally
        if (Math.random() < cfg.fireChance && fireCallback) {
            // Aim roughly forward with spread
            fireCallback(this.x, this.y, null, this.colors.laser, 'light', this.width, this.angle + randomRange(-0.5, 0.5));
        }
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        const w = this.width;

        // Draw explosion if exploding - BIG AND VISIBLE
        if (this.exploding) {
            const explosionProgress = 1 - (this.explosionTimer / 0.5);  // 0 to 1
            const explosionAlpha = Math.max(0.3, 1 - explosionProgress);
            const explosionRadius = 15 + explosionProgress * 50;  // Grows from 15 to 65

            ctx.globalAlpha = explosionAlpha;
            renderer.setGlow('#ff4400', 25);

            // Outer orange ring
            ctx.fillStyle = '#ff6600';
            ctx.beginPath();
            ctx.arc(this.x, this.y, explosionRadius, 0, Math.PI * 2);
            ctx.fill();

            // Middle yellow
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(this.x, this.y, explosionRadius * 0.6, 0, Math.PI * 2);
            ctx.fill();

            // Hot white core
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x, this.y, explosionRadius * 0.3, 0, Math.PI * 2);
            ctx.fill();

            renderer.clearGlow();
            ctx.globalAlpha = 1;
            return;  // Don't draw normal ship
        }

        // Trail
        if (this.trail.length > 1) {
            for (let i = 1; i < this.trail.length; i++) {
                const alpha = (i / this.trail.length) * this.alpha * 0.4;
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = this.colors.engine;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
                ctx.lineTo(this.trail[i].x, this.trail[i].y);
                ctx.stroke();
            }
        }

        // Fighter body
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = this.alpha;

        ctx.fillStyle = this.colors.hull;
        ctx.beginPath();
        ctx.moveTo(w * 0.6, 0);
        ctx.lineTo(-w * 0.4, -w * 0.35);
        ctx.lineTo(-w * 0.2, 0);
        ctx.lineTo(-w * 0.4, w * 0.35);
        ctx.closePath();
        ctx.fill();

        // Engine dot
        ctx.globalAlpha = this.alpha * 0.8;
        ctx.fillStyle = this.colors.engine;
        ctx.beginPath();
        ctx.arc(-w * 0.35, 0, w * 0.15, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// PROJECTILE - Pooled laser bolts that travel between ships
// ============================================================================

class SpaceProjectile {
    constructor() {
        this.active = false;
    }

    fire(x, y, target, color, type, sourceWidth, fixedAngle = null) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.type = type;  // 'heavy', 'medium', 'light'
        this.active = true;
        this.hasHit = false;

        const cfg = SPACE_BATTLE_CONFIG;

        if (type === 'heavy') {
            this.speed = cfg.dreadnought.beamSpeed;
            this.width = cfg.dreadnought.beamWidth;
            this.length = cfg.dreadnought.beamLength;
            this.life = 3;
        } else if (type === 'medium') {
            this.speed = cfg.cruiser.beamSpeed;
            this.width = cfg.cruiser.beamWidth;
            this.length = cfg.cruiser.beamLength;
            this.life = 2;
        } else {
            this.speed = cfg.fighter.beamSpeed;
            this.width = cfg.fighter.beamWidth;
            this.length = cfg.fighter.beamLength;
            this.life = 1.5;
        }

        this.maxLife = this.life;

        // Calculate angle to target or use fixed angle
        if (fixedAngle !== null) {
            this.angle = fixedAngle;
            this.targetX = null;
            this.targetY = null;
        } else if (target) {
            const dx = target.x - x;
            const dy = target.y - y;
            this.angle = Math.atan2(dy, dx);
            this.targetX = target.x;
            this.targetY = target.y;
            this.targetShip = target;
        } else {
            this.angle = randomRange(0, Math.PI * 2);
            this.targetX = null;
            this.targetY = null;
        }
    }

    update(dt, addImpact) {
        if (!this.active) return;

        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        this.life -= dt;

        // Check if reached target
        if (this.targetShip && !this.hasHit) {
            const dx = this.x - this.targetShip.x;
            const dy = this.y - this.targetShip.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const hitDist = (this.targetShip.width || 50) * 0.4;

            if (dist < hitDist) {
                this.hasHit = true;
                if (addImpact) {
                    addImpact(this.x, this.y, this.type, this.targetShip);
                }
            }
        }

        if (this.life <= 0) this.active = false;
    }

    draw(renderer) {
        if (!this.active) return;

        const ctx = renderer.ctx;
        const cfg = SPACE_BATTLE_CONFIG;
        const baseAlpha = cfg.projectileAlpha || 0.4;
        const alpha = clamp(this.life / this.maxLife, 0, 1) * baseAlpha;

        const endX = this.x - Math.cos(this.angle) * this.length;
        const endY = this.y - Math.sin(this.angle) * this.length;

        // Subtle glow
        const glowSize = this.type === 'heavy' ? cfg.projectileGlowHeavy : cfg.projectileGlowLight;
        ctx.globalAlpha = alpha * 0.4;
        renderer.setGlow(this.color, glowSize);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width + 1;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Thin core
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width;
        ctx.stroke();

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// IMPACT - Shield flashes and explosion effects
// ============================================================================

class SpaceImpact {
    constructor() {
        this.active = false;
    }

    trigger(x, y, type, targetShip, beaconDropCallback = null) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.active = true;
        this.targetShip = targetShip;

        const cfg = SPACE_BATTLE_CONFIG;

        // Shield flash
        this.flashLife = cfg.impactFlashDuration;
        this.flashMaxLife = this.flashLife;

        // Explosion
        if (type === 'heavy') {
            this.radius = 0;
            this.maxRadius = cfg.largeExplosionRadius;
            this.explosionLife = 0.5;
        } else {
            this.radius = 0;
            this.maxRadius = cfg.smallExplosionRadius;
            this.explosionLife = 0.3;
        }
        this.maxExplosionLife = this.explosionLife;

        // Chance for critical damage and desperation beacon drop
        if (targetShip && Math.random() < cfg.criticalDamageChance) {
            targetShip.damaged = true;

            // Drop desperation beacon from critically damaged capital ship (once per ship)
            if (!targetShip.hasDroppedBeacon && beaconDropCallback) {
                // Only capital ships (dreadnoughts/cruisers) drop beacons
                if (targetShip.width && targetShip.width > 50) {
                    targetShip.hasDroppedBeacon = true;
                    beaconDropCallback(targetShip.x, targetShip.y);
                }
            }
        }
    }

    update(dt) {
        if (!this.active) return;

        this.flashLife -= dt;
        this.explosionLife -= dt;
        this.radius += 80 * dt;

        if (this.explosionLife <= 0) this.active = false;
    }

    draw(renderer) {
        if (!this.active) return;

        const ctx = renderer.ctx;
        const cfg = SPACE_BATTLE_CONFIG;
        const baseAlpha = cfg.impactAlpha || 0.35;

        // Shield flash on ship (subtle)
        if (this.flashLife > 0 && this.targetShip) {
            const flashAlpha = (this.flashLife / this.flashMaxLife) * baseAlpha;
            ctx.globalAlpha = flashAlpha;
            renderer.setGlow(cfg.shieldFlash, 10);
            ctx.strokeStyle = cfg.shieldFlash;
            ctx.lineWidth = 1;
            const shipW = this.targetShip.width || 50;
            const shipH = this.targetShip.height || 20;
            ctx.beginPath();
            ctx.ellipse(this.targetShip.x, this.targetShip.y, shipW * 0.4, shipH * 0.5, 0, 0, Math.PI * 2);
            ctx.stroke();
            renderer.clearGlow();
        }

        // Explosion (subdued)
        const explosionAlpha = clamp(this.explosionLife / this.maxExplosionLife, 0, 1) * baseAlpha;

        // Small core
        ctx.globalAlpha = explosionAlpha * 0.8;
        renderer.setGlow(cfg.explosion, 6);
        ctx.fillStyle = cfg.explosionCore;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Faint outer ring
        ctx.globalAlpha = explosionAlpha * 0.5;
        ctx.strokeStyle = cfg.explosion;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// SPACE DUST - Drifting particle layer
// ============================================================================

class SpaceDust {
    constructor(canvasWidth, canvasHeight) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.reset(true);
    }

    reset(initial = false) {
        const cfg = SPACE_BATTLE_CONFIG;
        this.x = randomRange(0, this.canvasWidth);
        this.y = randomRange(0, this.canvasHeight * cfg.skyBottomPct);
        this.vx = randomRange(cfg.dustSpeedMin, cfg.dustSpeedMax) * (Math.random() < 0.5 ? 1 : -1);
        this.vy = randomRange(-2, 2);
        this.size = randomRange(cfg.dustSizeMin, cfg.dustSizeMax);
        this.alpha = randomRange(cfg.dustAlphaMin, cfg.dustAlphaMax);
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Wrap
        if (this.x < -10) this.x = this.canvasWidth + 10;
        if (this.x > this.canvasWidth + 10) this.x = -10;
        const maxY = this.canvasHeight * SPACE_BATTLE_CONFIG.skyBottomPct;
        if (this.y < -10) this.y = maxY;
        if (this.y > maxY + 10) this.y = -10;
    }

    draw(renderer) {
        const ctx = renderer.ctx;
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = '#666688';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// DISTANT FLASH - Far-off explosions
// ============================================================================

class DistantFlash {
    constructor() {
        this.active = false;
    }

    trigger(x, y) {
        const cfg = SPACE_BATTLE_CONFIG;
        this.x = x;
        this.y = y;
        this.radius = 0;
        this.maxRadius = cfg.distantFlashRadius * randomRange(0.5, 1.5);
        this.life = cfg.distantFlashDuration;
        this.maxLife = this.life;
        this.active = true;
        this.color = randomChoice(['#ffaa44', '#ff6622', '#ffcc66']);
    }

    update(dt) {
        if (!this.active) return;
        this.radius += 100 * dt;  // Slower expansion
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(renderer) {
        if (!this.active) return;

        const ctx = renderer.ctx;
        const cfg = SPACE_BATTLE_CONFIG;
        const baseAlpha = cfg.distantFlashAlpha || 0.5;
        const lifeRatio = clamp(this.life / this.maxLife, 0, 1);
        const alpha = lifeRatio * baseAlpha;

        // Bright expanding glow - MUCH more visible
        ctx.globalAlpha = alpha;
        renderer.setGlow(this.color, 30);

        // Hot white core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Colored middle
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Expanding outer ring
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// SMOKE TRAIL - For damaged ships
// ============================================================================

class SmokeParticle {
    constructor() {
        this.active = false;
    }

    spawn(x, y) {
        this.x = x;
        this.y = y;
        this.vx = randomRange(-10, 10);
        this.vy = randomRange(-5, 5);
        this.size = randomRange(5, 15);
        this.life = randomRange(1, 2);
        this.maxLife = this.life;
        this.active = true;
    }

    update(dt) {
        if (!this.active) return;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.size += 10 * dt;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(renderer) {
        if (!this.active) return;
        const ctx = renderer.ctx;
        const alpha = clamp(this.life / this.maxLife, 0, 1) * 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = SPACE_BATTLE_CONFIG.smoke;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// Lightning Strike System
// ============================================================================

class LightningStrike {
    constructor(canvasWidth, canvasHeight, terrainCallback) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;
        this.terrainCallback = terrainCallback;

        // Random strike position
        this.x = randomRange(100, canvasWidth - 100);
        this.startY = 0;
        this.endY = randomRange(400, canvasHeight - 200);

        // Generate lightning path with branches
        this.segments = this.generatePath();
        this.branches = this.generateBranches();

        this.life = LIGHTNING_CONFIG.duration;
        this.maxLife = this.life;
        this.dead = false;
        this.impactTriggered = false;
    }

    generatePath() {
        const segments = [];
        let x = this.x;
        let y = this.startY;
        const targetY = this.endY;

        while (y < targetY) {
            const newX = x + randomRange(-40, 40);
            const newY = y + LIGHTNING_CONFIG.segmentLength * randomRange(0.8, 1.2);
            segments.push({ x1: x, y1: y, x2: newX, y2: newY });
            x = newX;
            y = newY;
        }
        return segments;
    }

    generateBranches() {
        const branches = [];
        const branchCount = LIGHTNING_CONFIG.branchCount;
        for (let i = 0; i < branchCount; i++) {
            // Pick a random segment to branch from
            const segIdx = randomInt(Math.floor(this.segments.length * 0.3), this.segments.length - 1);
            const seg = this.segments[segIdx];
            if (!seg) continue;

            // Generate small branch
            let x = seg.x2;
            let y = seg.y2;
            const branchSegs = [];
            const branchLen = randomInt(2, 4);
            const dir = Math.random() < 0.5 ? -1 : 1;

            for (let j = 0; j < branchLen; j++) {
                const newX = x + dir * randomRange(15, 35);
                const newY = y + randomRange(15, 30);
                branchSegs.push({ x1: x, y1: y, x2: newX, y2: newY });
                x = newX;
                y = newY;
            }
            branches.push(branchSegs);
        }
        return branches;
    }

    update(dt) {
        this.life -= dt;

        // Trigger terrain damage at impact point (once)
        if (!this.impactTriggered && this.terrainCallback) {
            const lastSeg = this.segments[this.segments.length - 1];
            if (lastSeg) {
                this.terrainCallback(lastSeg.x2, lastSeg.y2, LIGHTNING_CONFIG.terrainDamage);
                // Spawn particles at impact
                particles.sparks(lastSeg.x2, lastSeg.y2, 30, '#ffffff');
                particles.sparks(lastSeg.x2, lastSeg.y2, 20, '#88ffff');
            }
            this.impactTriggered = true;
        }

        if (this.life <= 0) this.dead = true;
    }

    draw(renderer) {
        const alpha = clamp(this.life / this.maxLife, 0, 1);
        const ctx = renderer.ctx;

        // Draw with intense glow
        ctx.globalAlpha = alpha;
        renderer.setGlow('#88ffff', 25);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;

        // Main bolt
        ctx.beginPath();
        for (const seg of this.segments) {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        }
        ctx.stroke();

        // Branches (thinner)
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#aaffff';
        for (const branch of this.branches) {
            ctx.beginPath();
            for (const seg of branch) {
                ctx.moveTo(seg.x1, seg.y1);
                ctx.lineTo(seg.x2, seg.y2);
            }
            ctx.stroke();
        }

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
}

// ============================================================================
// Ambient System Manager
// ============================================================================

export class AmbientSystem {
    constructor(canvasWidth, canvasHeight) {
        this.canvasWidth = canvasWidth;
        this.canvasHeight = canvasHeight;

        // Clouds (two layers for parallax)
        this.farClouds = [];
        this.nearClouds = [];

        // UFOs
        this.ufos = [];
        this.ufoShots = [];

        // Weather
        this.weatherType = null;  // 'rain', 'snow', 'embers', or null
        this.weatherParticles = [];

        // EPIC space battle (visual only, no gameplay effects)
        this.dreadnoughts = [];
        this.cruisers = [];
        this.fighters = [];
        this.projectilePool = [];
        this.impactPool = [];
        this.spaceDust = [];
        this.distantFlashes = [];
        this.smokeParticles = [];
        this.allShips = [];  // Combined list for targeting

        // Lightning strikes
        this.lightningStrikes = [];

        // Wind streaks (visual wind particles)
        this.windStreaks = [];
        this.terrainDamageCallback = null;  // Set by main.js
        this.tankDamageCallback = null;     // Set by main.js

        // Ambient particles
        this.dustParticles = [];
        this.glitchParticles = [];

        // Time tracking
        this.time = 0;

        // UFO destruction tracking
        this.lastDestroyedUFO = null;

        // Game event sync - chaos mode
        this.chaosMultiplier = 1.0;
        this.chaosTimer = 0;
        this.battlePaused = false;
        this.pauseTimer = 0;

        // Initialize clouds
        this.initClouds();

        // Initialize ambient particles
        this.initAmbientParticles();

        // Initialize space battle
        this.initSpaceBattle();

        // Set random initial weather (or none)
        this.setRandomWeather();
    }

    // Set callbacks for damage effects
    setDamageCallbacks(terrainCallback, tankCallback) {
        this.terrainDamageCallback = terrainCallback;
        this.tankDamageCallback = tankCallback;
    }

    initClouds() {
        for (let i = 0; i < CLOUD_CONFIG.farCount; i++) {
            this.farClouds.push(new Cloud(this.canvasWidth, this.canvasHeight, 'far'));
        }
        for (let i = 0; i < CLOUD_CONFIG.nearCount; i++) {
            this.nearClouds.push(new Cloud(this.canvasWidth, this.canvasHeight, 'near'));
        }
    }

    initAmbientParticles() {
        for (let i = 0; i < AMBIENT_CONFIG.dustCount; i++) {
            this.dustParticles.push(new AmbientParticle('dust', this.canvasWidth, this.canvasHeight));
        }
        for (let i = 0; i < AMBIENT_CONFIG.glitchCount; i++) {
            this.glitchParticles.push(new AmbientParticle('glitch', this.canvasWidth, this.canvasHeight));
        }
    }

    initSpaceBattle() {
        const cfg = SPACE_BATTLE_CONFIG;

        // Create dreadnoughts (massive capital ships)
        for (let i = 0; i < cfg.dreadnoughtCount; i++) {
            const ship = new Dreadnought(this.canvasWidth, this.canvasHeight, i, this.allShips);
            this.dreadnoughts.push(ship);
            this.allShips.push(ship);
        }

        // Create cruisers (medium ships)
        for (let i = 0; i < cfg.cruiserCount; i++) {
            const ship = new Cruiser(this.canvasWidth, this.canvasHeight, i, this.allShips);
            this.cruisers.push(ship);
            this.allShips.push(ship);
        }

        // Create fighters (small fast ships)
        for (let i = 0; i < cfg.fighterCount; i++) {
            const ship = new Fighter(this.canvasWidth, this.canvasHeight, this.allShips);
            this.fighters.push(ship);
        }

        // Pre-allocate projectile pool
        for (let i = 0; i < cfg.maxProjectiles; i++) {
            this.projectilePool.push(new SpaceProjectile());
        }

        // Pre-allocate impact pool
        for (let i = 0; i < 20; i++) {
            this.impactPool.push(new SpaceImpact());
        }

        // Pre-allocate smoke particles
        for (let i = 0; i < 30; i++) {
            this.smokeParticles.push(new SmokeParticle());
        }

        // Create space dust
        for (let i = 0; i < cfg.dustCount; i++) {
            this.spaceDust.push(new SpaceDust(this.canvasWidth, this.canvasHeight));
        }

        // Pre-allocate distant flashes
        for (let i = 0; i < 5; i++) {
            this.distantFlashes.push(new DistantFlash());
        }
    }

    setWeather(type) {
        this.weatherType = type;
        this.weatherParticles = [];

        if (type && WEATHER_CONFIG[type]) {
            const count = WEATHER_CONFIG[type].count;
            for (let i = 0; i < count; i++) {
                this.weatherParticles.push(new WeatherParticle(type, this.canvasWidth, this.canvasHeight));
            }
        }
    }

    setRandomWeather() {
        // 40% chance of no weather, otherwise pick one
        const options = [null, null, 'rain', 'snow', 'embers'];
        this.setWeather(randomChoice(options));
    }

    spawnUFO() {
        if (this.ufos.length < UFO_CONFIG.maxConcurrent) {  // Use config for max
            const ufo = new UFO(
                this.canvasWidth,
                this.canvasHeight,
                // onShoot callback
                (x, y, color) => {
                    this.ufoShots.push(new UFOShot(x, y, color, this.terrainDamageCallback, this.tankDamageCallback));
                },
                // onDestroyed callback
                (x, y, color, playerIndex, buffType) => {
                    this.lastDestroyedUFO = { x, y, color, playerIndex, buffType, time: this.time };
                }
            );
            this.ufos.push(ufo);
        }
    }

    spawnLightning() {
        const strike = new LightningStrike(
            this.canvasWidth,
            this.canvasHeight,
            this.terrainDamageCallback
        );
        this.lightningStrikes.push(strike);
    }

    /**
     * Check if a projectile hits any UFO and deal damage
     * @param {number} px - Projectile X
     * @param {number} py - Projectile Y
     * @param {number} radius - Projectile radius
     * @param {number} playerIndex - Which player fired (for buff credit)
     * @returns {Object|null} - { buffType, x, y, color } if UFO destroyed, null otherwise
     */
    checkProjectileHitUFO(px, py, radius, playerIndex) {
        for (const ufo of this.ufos) {
            if (!ufo.dead && ufo.checkHit(px, py, radius)) {
                const destroyed = ufo.takeDamage(1, playerIndex);
                if (destroyed) {
                    // Return the buff info
                    return {
                        buffType: this.lastDestroyedUFO?.buffType || 'DAMAGE',
                        x: ufo.x,
                        y: ufo.y,
                        color: ufo.color,
                        playerIndex: playerIndex
                    };
                }
            }
        }
        return null;
    }

    /**
     * Update wind streak particles based on current wind
     */
    updateWindStreaks(dt, wind, isWindBlast) {
        const cfg = WIND_STREAK_CONFIG;
        const absWind = Math.abs(wind);

        // No streaks if calm
        if (absWind < 0.005) {
            this.windStreaks = [];
            return;
        }

        // Spawn rate scales with wind intensity
        const spawnChance = cfg.spawnRate * absWind * 10;

        // Maybe spawn new streaks
        if (this.windStreaks.length < cfg.maxStreaks && Math.random() < spawnChance) {
            this.windStreaks.push(new WindStreak(
                this.canvasWidth, this.canvasHeight, wind, isWindBlast
            ));
        }

        // Update existing streaks
        for (const streak of this.windStreaks) {
            streak.update(dt, wind);
        }

        // Remove dead streaks
        this.windStreaks = this.windStreaks.filter(s => !s.dead);
    }

    update(dt, voidY, players = [], wind = 0, isWindBlast = false) {
        this.time += dt;

        // Update wind streaks
        this.updateWindStreaks(dt, wind, isWindBlast);

        // Update clouds
        for (const cloud of this.farClouds) {
            cloud.update(dt);
        }
        for (const cloud of this.nearClouds) {
            cloud.update(dt);
        }

        // Maybe spawn UFO
        if (!DISABLE_UFOS && Math.random() < UFO_CONFIG.spawnChance) {
            this.spawnUFO();
        }

        // Update UFOs
        if (!DISABLE_UFOS) {
            for (const ufo of this.ufos) {
                ufo.update(dt, this.time);
            }
            this.ufos = this.ufos.filter(u => !u.dead);

            // Update UFO shots (with damage)
            for (const shot of this.ufoShots) {
                shot.update(dt, this.canvasHeight, voidY, players);
            }
            this.ufoShots = this.ufoShots.filter(s => !s.dead);
        }

        // =====================================================================
        // EPIC SPACE BATTLE UPDATE
        // =====================================================================

        if (!DISABLE_SPACE_BATTLE) {
            // Callback for ships to fire projectiles
            const fireProjectile = (x, y, target, color, type, sourceWidth, fixedAngle = null) => {
                // Find inactive projectile in pool
                const proj = this.projectilePool.find(p => !p.active);
                if (proj) {
                    proj.fire(x, y, target, color, type, sourceWidth, fixedAngle);
                }
            };

            // Callback for creating impact effects
            const addImpact = (x, y, type, targetShip) => {
                const impact = this.impactPool.find(i => !i.active);
                if (impact) {
                    impact.trigger(x, y, type, targetShip, this.onBeaconDrop);
                }
            };

            // Callback for smoke trails
            const addSmoke = (x, y) => {
                const smoke = this.smokeParticles.find(s => !s.active);
                if (smoke) {
                    smoke.spawn(x, y);
                }
            };

            // Skip ship updates during battle pause (for dramatic orbital strike effect)
            if (!this.battlePaused) {
                // Update dreadnoughts
                for (const ship of this.dreadnoughts) {
                    ship.update(dt, fireProjectile, addImpact, addSmoke);
                }

                // Update cruisers
                for (const ship of this.cruisers) {
                    ship.update(dt, fireProjectile, addImpact, addSmoke);
                }

                // Update fighters
                for (const fighter of this.fighters) {
                    fighter.update(dt, fireProjectile);
                }

                // Update projectiles
                for (const proj of this.projectilePool) {
                    proj.update(dt, addImpact);
                }
            } else {
                // Still update projectiles even during pause (they're mid-flight)
                for (const proj of this.projectilePool) {
                    proj.update(dt, addImpact);
                }
            }

            // Update impacts
            for (const impact of this.impactPool) {
                impact.update(dt);
            }

            // Update smoke
            for (const smoke of this.smokeParticles) {
                smoke.update(dt);
            }

            // Update space dust
            for (const dust of this.spaceDust) {
                dust.update(dt);
            }

            // Update distant flashes
            for (const flash of this.distantFlashes) {
                flash.update(dt);
            }

            // Spawn distant flashes randomly
            if (Math.random() < SPACE_BATTLE_CONFIG.distantFlashChance) {
                const flash = this.distantFlashes.find(f => !f.active);
                if (flash) {
                    const flashX = randomRange(50, this.canvasWidth - 50);
                    const flashY = randomRange(this.canvasHeight * 0.02, this.canvasHeight * 0.15);
                    flash.trigger(flashX, flashY);
                }
            }
        }

        // Update lightning strikes
        for (const strike of this.lightningStrikes) {
            strike.update(dt);
        }
        this.lightningStrikes = this.lightningStrikes.filter(s => !s.dead);

        // Maybe spawn lightning during rain
        if (this.weatherType === 'rain' && Math.random() < LIGHTNING_CONFIG.strikeChance) {
            this.spawnLightning();
        }

        // Update weather
        for (const particle of this.weatherParticles) {
            particle.update(dt, voidY);
        }

        // Update ambient particles
        for (const dust of this.dustParticles) {
            dust.update(dt);
        }
        for (const glitch of this.glitchParticles) {
            glitch.update(dt);
        }

        // Update battle pause timer
        if (this.battlePaused && this.pauseTimer > 0) {
            this.pauseTimer -= dt;
            if (this.pauseTimer <= 0) {
                this.battlePaused = false;
            }
        }
    }

    // =========================================================================
    // Orbital Strike Support Methods
    // =========================================================================

    /**
     * Find the nearest capital ship (dreadnought or cruiser) to a ground X position
     * Used for orbital beacon targeting
     */
    findNearestCapitalShip(groundX) {
        let nearestShip = null;
        let minDist = Infinity;

        // Check dreadnoughts first (preferred targets)
        for (const ship of this.dreadnoughts) {
            const dist = Math.abs(ship.x - groundX);
            if (dist < minDist) {
                minDist = dist;
                nearestShip = ship;
            }
        }

        // If no dreadnought close enough, check cruisers
        if (minDist > this.canvasWidth * 0.4) {
            for (const ship of this.cruisers) {
                const dist = Math.abs(ship.x - groundX);
                if (dist < minDist) {
                    minDist = dist;
                    nearestShip = ship;
                }
            }
        }

        return nearestShip;
    }

    /**
     * Pause the space battle briefly (for dramatic effect during orbital strikes)
     */
    pauseBattle(duration) {
        this.battlePaused = true;
        this.pauseTimer = duration;
    }

    /**
     * Set callback for desperation beacon drops
     */
    setBeaconDropCallback(callback) {
        this.onBeaconDrop = callback;
    }

    // =========================================================================
    // GAME EVENT SYNC - React to gameplay events
    // =========================================================================

    /**
     * Trigger space battle reaction to game explosion
     * @param {number} groundX - X position of explosion (0-2560)
     * @param {number} intensity - 0-1 scale (0.3=small, 0.6=medium, 1.0=nuke)
     */
    triggerExplosionSync(groundX, intensity = 0.5) {
        const skyY = this.canvasHeight * randomRange(0.1, 0.35);
        const cfg = SPACE_BATTLE_CONFIG;

        // Spawn distant flashes based on intensity
        const flashCount = Math.floor(intensity * 3) + 1;
        for (let i = 0; i < flashCount; i++) {
            const flash = this.distantFlashes.find(f => !f.active);
            if (flash) {
                const offsetX = randomRange(-200, 200);
                flash.trigger(groundX + offsetX, skyY + randomRange(-50, 50));
            }
        }

        // Trigger impacts on nearby ships
        if (intensity > 0.5) {
            for (const ship of this.allShips) {
                const dist = Math.abs(ship.x - groundX);
                if (dist < 300 && Math.random() < intensity * 0.4) {
                    const impact = this.impactPool.find(i => !i.active);
                    if (impact) {
                        impact.trigger(ship.x, ship.y, 'hit', ship);
                    }
                }
            }
        }
    }

    /**
     * React to player death - dramatic explosion in space
     * @param {number} groundX - X position where player died
     */
    triggerPlayerKillSync(groundX) {
        console.log('[SPACE BATTLE] Player kill sync at x:', groundX);

        // Big flash cluster - more flashes
        for (let i = 0; i < 6; i++) {
            const flash = this.distantFlashes.find(f => !f.active);
            if (flash) {
                const skyY = this.canvasHeight * randomRange(0.08, 0.35);
                flash.trigger(groundX + randomRange(-200, 200), skyY);
            }
        }

        // ALWAYS kill at least one fighter on player death
        const allFighters = this.fighters.filter(f => !f.exploding);
        if (allFighters.length > 0) {
            const victim = allFighters[Math.floor(Math.random() * allFighters.length)];
            console.log('[SPACE BATTLE] Killing fighter on player death');
            victim.takeDamage(1);
        }
    }

    /**
     * React to nuke/massive explosion - chaos in space
     * @param {number} groundX - X position of nuke
     */
    triggerNukeSync(groundX) {
        console.log('[SPACE BATTLE] Nuke sync triggered at x:', groundX);

        // Massive flash barrage - more flashes, spread over time
        for (let i = 0; i < 12; i++) {
            setTimeout(() => {
                const flash = this.distantFlashes.find(f => !f.active);
                if (flash) {
                    const skyY = this.canvasHeight * randomRange(0.05, 0.4);
                    flash.trigger(groundX + randomRange(-400, 400), skyY);
                }
            }, i * 40);
        }

        // Damage multiple ships (higher chance)
        for (const ship of this.allShips) {
            const dist = Math.abs(ship.x - groundX);
            if (dist < 600 && Math.random() < 0.5) {
                const impact = this.impactPool.find(i => !i.active);
                if (impact) {
                    impact.trigger(ship.x, ship.y, Math.random() < 0.4 ? 'critical' : 'hit', ship);
                }
            }
        }

        // GUARANTEE 2-4 fighter kills on nuke
        const allFighters = this.fighters.filter(f => !f.exploding);
        const killCount = Math.min(allFighters.length, 2 + Math.floor(Math.random() * 3));
        console.log('[SPACE BATTLE] Killing', killCount, 'fighters');
        for (let i = 0; i < killCount; i++) {
            if (allFighters[i]) {
                setTimeout(() => {
                    if (allFighters[i] && !allFighters[i].exploding) {
                        allFighters[i].takeDamage(1);
                    }
                }, i * 150 + Math.random() * 100);
            }
        }
    }

    /**
     * React to orbital strike - brief pause then chaos
     */
    triggerOrbitalSync() {
        this.pauseBattle(0.3);  // Brief pause for dramatic effect

        // After pause, extra firing
        setTimeout(() => {
            for (let i = 0; i < 5; i++) {
                const flash = this.distantFlashes.find(f => !f.active);
                if (flash) {
                    flash.trigger(
                        randomRange(0, this.canvasWidth),
                        this.canvasHeight * randomRange(0.1, 0.35)
                    );
                }
            }
        }, 350);
    }

    /**
     * Increase battle intensity temporarily (during combat phases)
     * @param {number} multiplier - Firing rate multiplier (1.5 = 50% more)
     * @param {number} duration - How long in seconds
     */
    setChaosMode(multiplier, duration) {
        this.chaosMultiplier = multiplier;
        this.chaosTimer = duration;
    }

    // Draw background elements (behind terrain)
    drawBackground(renderer) {
        const ctx = renderer.ctx;
        const skyBottom = this.canvasHeight * SPACE_BATTLE_CONFIG.skyBottomPct;

        // =====================================================================
        // EPIC SPACE BATTLE - Layered back to front
        // =====================================================================

        if (!DISABLE_SPACE_BATTLE) {
            // 1. Distant flashes (furthest back - far-off explosions)
            for (const flash of this.distantFlashes) {
                flash.draw(renderer);
            }

            // 2. Space dust (atmospheric particles)
            for (const dust of this.spaceDust) {
                dust.draw(renderer);
            }

            // 3. Dreadnoughts (massive, furthest layer, dimmest)
            for (const ship of this.dreadnoughts) {
                ship.draw(renderer);
            }

            // 4. Smoke trails from damaged ships
            for (const smoke of this.smokeParticles) {
                smoke.draw(renderer);
            }

            // 5. Cruisers (medium layer)
            for (const ship of this.cruisers) {
                ship.draw(renderer);
            }

            // 6. Fighters (nearest, brightest)
            for (const fighter of this.fighters) {
                fighter.draw(renderer);
            }

            // 7. Projectiles (laser bolts between ships)
            for (const proj of this.projectilePool) {
                proj.draw(renderer);
            }

            // 8. Impacts (shield flickers and explosions)
            for (const impact of this.impactPool) {
                impact.draw(renderer);
            }

            // === DEPTH OVERLAY - Push the entire battle back visually ===
            // Dark gradient overlay makes the battle feel miles away
            const depthAlpha = SPACE_BATTLE_CONFIG.depthOverlayAlpha || 0.25;
            ctx.globalAlpha = depthAlpha;
            const depthGradient = ctx.createLinearGradient(0, 0, 0, skyBottom);
            depthGradient.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
            depthGradient.addColorStop(0.5, 'rgba(5, 5, 15, 0.3)');
            depthGradient.addColorStop(1, 'rgba(10, 5, 20, 0.2)');
            ctx.fillStyle = depthGradient;
            ctx.fillRect(0, 0, this.canvasWidth, skyBottom);
            ctx.globalAlpha = 1;

            // Very subtle atmospheric haze across whole sky
            ctx.globalAlpha = SPACE_BATTLE_CONFIG.hazeAlpha;
            const hazeGradient = ctx.createLinearGradient(0, 0, 0, skyBottom);
            hazeGradient.addColorStop(0, 'transparent');
            hazeGradient.addColorStop(0.5, 'rgba(30, 20, 40, 0.03)');
            hazeGradient.addColorStop(1, 'rgba(20, 15, 35, 0.05)');
            ctx.fillStyle = hazeGradient;
            ctx.fillRect(0, 0, this.canvasWidth, skyBottom);
            ctx.globalAlpha = 1;
        }

        // Far clouds (behind everything else, but after space battle)
        for (const cloud of this.farClouds) {
            cloud.draw(renderer);
        }

        // Dust particles
        for (const dust of this.dustParticles) {
            dust.draw(renderer);
        }
    }

    // Draw mid-ground elements (after terrain, before tanks)
    drawMidground(renderer) {
        // Near clouds
        for (const cloud of this.nearClouds) {
            cloud.draw(renderer);
        }
    }

    // Draw foreground elements (after everything else)
    drawForeground(renderer) {
        // UFOs
        if (!DISABLE_UFOS) {
            for (const ufo of this.ufos) {
                ufo.draw(renderer);
            }

            // UFO shots
            for (const shot of this.ufoShots) {
                shot.draw(renderer);
            }
        }

        // Lightning strikes (dramatic, above everything)
        for (const strike of this.lightningStrikes) {
            strike.draw(renderer);
        }

        // Weather particles
        for (const particle of this.weatherParticles) {
            particle.draw(renderer);
        }

        // Wind streaks
        for (const streak of this.windStreaks) {
            streak.draw(renderer);
        }

        // Glitch specks (on top)
        for (const glitch of this.glitchParticles) {
            glitch.draw(renderer);
        }
    }

    // Optional: Trigger lightning flash during storms
    triggerLightning(renderer) {
        // Disabled - was causing jarring white box flashes
        return false;
    }
}

// Singleton export
let ambientInstance = null;

export function initAmbient(canvasWidth, canvasHeight) {
    ambientInstance = new AmbientSystem(canvasWidth, canvasHeight);
    return ambientInstance;
}

export function getAmbient() {
    return ambientInstance;
}
