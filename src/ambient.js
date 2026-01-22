/**
 * Ambient World Systems for Void Artillery
 * Adds life to the game world: clouds, UFOs, weather, ambient particles
 */

import { randomRange, randomInt, randomChoice, clamp } from './utils.js';
import { COLORS } from './renderer.js';
import { particles } from './particles.js';

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
    spawnChance: 0.001,  // Per frame chance
    minSpeed: 40,
    maxSpeed: 80,
    wobbleSpeed: 2,
    wobbleAmount: 15,
    shootInterval: 2000,  // ms between shots
    shootChance: 0.4,     // Chance to shoot when interval hits
    // Combat properties
    health: 1,            // UFOs die in one hit
    hitboxWidth: 35,      // Ellipse hitbox width (half-width)
    hitboxHeight: 12      // Ellipse hitbox height (half-height)
};

// Buff types that UFOs can drop
export const UFO_BUFF_TYPES = {
    DAMAGE: { name: 'DAMAGE+', color: '#ff4444', multiplier: 1.25 },
    BLAST: { name: 'BLAST+', color: '#44ff44', bonus: 15 },
    BOUNCES: { name: 'BOUNCE+', color: '#4444ff', bonus: 1 }
};

const WEATHER_CONFIG = {
    rain: {
        count: 100,
        speed: 400,
        angle: 0.1,  // Slight angle
        color: '#4488ff',
        length: 15
    },
    snow: {
        count: 60,
        speed: 50,
        wobble: 30,
        color: '#ffffff',
        radius: 2
    },
    embers: {
        count: 40,
        speed: 30,
        riseSpeed: -20,
        color: '#ff6600',
        radius: 2
    }
};

const AMBIENT_CONFIG = {
    dustCount: 15,
    glitchCount: 8,
    dustSpeed: 5,
    glitchFlickerRate: 0.1
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
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vy = randomRange(100, 180);
        this.vx = randomRange(-30, 30);
        this.life = 2;
        this.dead = false;
        this.radius = 4;
        this.trail = [];
    }

    update(dt, canvasHeight, voidY) {
        // Store trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();

        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;

        // Die on ground or void or timeout
        if (this.life <= 0 || this.y > voidY || this.y > canvasHeight) {
            this.dead = true;
            // Spawn cosmetic impact particles
            particles.sparks(this.x, this.y, 8, this.color);
        }
    }

    draw(renderer) {
        // Trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (i / this.trail.length) * 0.4;
            renderer.ctx.globalAlpha = alpha;
            renderer.drawCircle(t.x, t.y, this.radius * 0.5, this.color, false);
        }
        renderer.ctx.globalAlpha = 1;

        // Main shot
        renderer.drawCircle(this.x, this.y, this.radius, this.color, true);
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

        // Ambient particles
        this.dustParticles = [];
        this.glitchParticles = [];

        // Time tracking
        this.time = 0;

        // UFO destruction tracking
        this.lastDestroyedUFO = null;

        // Initialize clouds
        this.initClouds();

        // Initialize ambient particles
        this.initAmbientParticles();

        // Set random initial weather (or none)
        this.setRandomWeather();
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
        if (this.ufos.length < 2) {  // Max 2 UFOs at once
            const ufo = new UFO(
                this.canvasWidth,
                this.canvasHeight,
                // onShoot callback
                (x, y, color) => {
                    this.ufoShots.push(new UFOShot(x, y, color));
                },
                // onDestroyed callback
                (x, y, color, playerIndex, buffType) => {
                    this.lastDestroyedUFO = { x, y, color, playerIndex, buffType, time: this.time };
                }
            );
            this.ufos.push(ufo);
        }
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

    update(dt, voidY) {
        this.time += dt;

        // Update clouds
        for (const cloud of this.farClouds) {
            cloud.update(dt);
        }
        for (const cloud of this.nearClouds) {
            cloud.update(dt);
        }

        // Maybe spawn UFO
        if (Math.random() < UFO_CONFIG.spawnChance) {
            this.spawnUFO();
        }

        // Update UFOs
        for (const ufo of this.ufos) {
            ufo.update(dt, this.time);
        }
        this.ufos = this.ufos.filter(u => !u.dead);

        // Update UFO shots
        for (const shot of this.ufoShots) {
            shot.update(dt, this.canvasHeight, voidY);
        }
        this.ufoShots = this.ufoShots.filter(s => !s.dead);

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
    }

    // Draw background elements (behind terrain)
    drawBackground(renderer) {
        // Far clouds (behind everything)
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
        for (const ufo of this.ufos) {
            ufo.draw(renderer);
        }

        // UFO shots
        for (const shot of this.ufoShots) {
            shot.draw(renderer);
        }

        // Weather particles
        for (const particle of this.weatherParticles) {
            particle.draw(renderer);
        }

        // Glitch specks (on top)
        for (const glitch of this.glitchParticles) {
            glitch.draw(renderer);
        }
    }

    // Optional: Trigger lightning flash during storms
    triggerLightning(renderer) {
        if (this.weatherType === 'rain' && Math.random() < 0.002) {
            renderer.flash('#ffffff', 0.4);
            // Could add thunder sound here if audio is available
            return true;
        }
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
