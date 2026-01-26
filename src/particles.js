/**
 * Particle System for Void Artillery
 * DRAMATICALLY ENHANCED - Dopamine-heavy explosions!
 * Handles creation, update, and rendering of particles
 */

import { randomRange } from './utils.js';
import { COLORS } from './renderer.js';

// Performance limits
const MAX_PARTICLES = 800;
const MAX_SHOCKWAVES = 10;

// ============================================================================
// Particle Class (enhanced with more properties)
// ============================================================================

class Particle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;

        // Velocity
        const angle = options.angle ?? randomRange(0, Math.PI * 2);
        const speed = options.speed ?? randomRange(2, 8);
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        // Appearance
        this.color = options.color ?? COLORS.white;
        this.radius = options.radius ?? randomRange(2, 5);
        this.originalRadius = this.radius;

        // Lifetime
        this.life = options.life ?? randomRange(0.5, 1.5);
        this.maxLife = this.life;

        // Physics
        this.gravity = options.gravity ?? 0.1;
        this.friction = options.friction ?? 0.98;
        this.shrink = options.shrink ?? true;

        // Enhanced properties
        this.type = options.type ?? 'circle';  // 'circle', 'streak', 'square', 'glow'
        this.rotation = options.rotation ?? 0;
        this.rotationSpeed = options.rotationSpeed ?? 0;
        this.glowIntensity = options.glowIntensity ?? 1;
        this.fadeInTime = options.fadeInTime ?? 0;  // Time before full opacity
        this.scale = options.scale ?? 1;
        this.scaleDecay = options.scaleDecay ?? 0;  // How fast scale decreases

        // State
        this.dead = false;
        this.age = 0;
    }

    update(dt) {
        this.age += dt;

        // Apply gravity
        this.vy += this.gravity;

        // Apply friction
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Move
        this.x += this.vx;
        this.y += this.vy;

        // Rotation
        this.rotation += this.rotationSpeed * dt;

        // Age
        this.life -= dt;

        // Scale decay
        if (this.scaleDecay > 0) {
            this.scale = Math.max(0, this.scale - this.scaleDecay * dt);
        }

        // Shrink over lifetime
        if (this.shrink) {
            this.radius = this.originalRadius * (this.life / this.maxLife);
        }

        // Die
        if (this.life <= 0 || this.radius <= 0 || this.scale <= 0) {
            this.dead = true;
        }
    }

    draw(renderer) {
        // Calculate alpha with fade-in support
        let alpha = Math.max(0, this.life / this.maxLife);
        if (this.fadeInTime > 0 && this.age < this.fadeInTime) {
            alpha *= this.age / this.fadeInTime;
        }

        renderer.ctx.globalAlpha = alpha;

        const r = Math.max(0.5, this.radius * this.scale);

        switch (this.type) {
            case 'streak':
                // Draw as a line in direction of velocity
                const len = Math.sqrt(this.vx * this.vx + this.vy * this.vy) * 3 + r * 2;
                const angle = Math.atan2(this.vy, this.vx);
                renderer.setGlow(this.color, 15 * this.glowIntensity);
                renderer.ctx.beginPath();
                renderer.ctx.moveTo(this.x - Math.cos(angle) * len / 2, this.y - Math.sin(angle) * len / 2);
                renderer.ctx.lineTo(this.x + Math.cos(angle) * len / 2, this.y + Math.sin(angle) * len / 2);
                renderer.ctx.strokeStyle = this.color;
                renderer.ctx.lineWidth = r;
                renderer.ctx.lineCap = 'round';
                renderer.ctx.stroke();
                renderer.clearGlow();
                break;

            case 'square':
                renderer.ctx.save();
                renderer.ctx.translate(this.x, this.y);
                renderer.ctx.rotate(this.rotation);
                renderer.setGlow(this.color, 10 * this.glowIntensity);
                renderer.ctx.fillStyle = this.color;
                renderer.ctx.fillRect(-r, -r, r * 2, r * 2);
                renderer.clearGlow();
                renderer.ctx.restore();
                break;

            case 'glow':
                // Soft glowing circle with extra bloom
                renderer.setGlow(this.color, 30 * this.glowIntensity);
                renderer.ctx.beginPath();
                renderer.ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
                renderer.ctx.fillStyle = this.color;
                renderer.ctx.fill();
                renderer.clearGlow();
                break;

            case 'shape':
                // Draw mini tank shape particle
                if (this.shape) {
                    renderer.setGlow(this.color, 15 * this.glowIntensity);
                    renderer.ctx.fillStyle = this.color;
                    this.drawShape(renderer, this.shape, this.sides || 6);
                    renderer.clearGlow();
                }
                break;

            default:  // 'circle'
                renderer.drawCircle(this.x, this.y, r, this.color, this.glowIntensity > 0.5);
        }

        renderer.ctx.globalAlpha = 1;
    }

    // Draw a mini shape particle
    drawShape(renderer, shape, sides) {
        const ctx = renderer.ctx;
        const size = this.radius * this.scale;

        if (shape === 'circle') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
            ctx.fill();
        } else if (shape === 'star') {
            this.drawStarShape(ctx, size, 5);
        } else if (shape === 'diamond') {
            this.drawPolygon(ctx, size, 4, Math.PI / 4);
        } else {
            this.drawPolygon(ctx, size, sides, 0);
        }
    }

    drawPolygon(ctx, size, sides, rotation) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 + rotation - Math.PI / 2;
            const x = this.x + Math.cos(angle) * size;
            const y = this.y + Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    drawStarShape(ctx, size, points) {
        const innerRadius = size * 0.4;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? size : innerRadius;
            const angle = (i * Math.PI / points) - Math.PI / 2;
            const x = this.x + Math.cos(angle) * r;
            const y = this.y + Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }
}

// ============================================================================
// Shockwave Ring Class
// ============================================================================

class Shockwave {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.radius = options.startRadius ?? 5;
        this.maxRadius = options.maxRadius ?? 100;
        this.expandSpeed = options.expandSpeed ?? 200;
        this.color = options.color ?? COLORS.white;
        this.lineWidth = options.lineWidth ?? 4;
        this.life = options.life ?? 0.4;
        this.maxLife = this.life;
        this.dead = false;
    }

    update(dt) {
        this.radius += this.expandSpeed * dt;
        this.life -= dt;
        this.lineWidth = Math.max(1, this.lineWidth - dt * 8);

        if (this.life <= 0 || this.radius > this.maxRadius) {
            this.dead = true;
        }
    }

    draw(renderer) {
        const alpha = Math.max(0, this.life / this.maxLife);
        renderer.ctx.globalAlpha = alpha * 0.8;
        renderer.setGlow(this.color, 25);
        renderer.ctx.beginPath();
        renderer.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        renderer.ctx.strokeStyle = this.color;
        renderer.ctx.lineWidth = this.lineWidth;
        renderer.ctx.stroke();
        renderer.clearGlow();
        renderer.ctx.globalAlpha = 1;
    }
}

// ============================================================================
// Particle System (Enhanced)
// ============================================================================

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.shockwaves = [];
    }

    // Spawn a single particle
    spawn(x, y, options = {}) {
        if (this.particles.length < MAX_PARTICLES) {
            this.particles.push(new Particle(x, y, options));
        }
    }

    // Spawn a shockwave ring
    shockwave(x, y, options = {}) {
        if (this.shockwaves.length < MAX_SHOCKWAVES) {
            this.shockwaves.push(new Shockwave(x, y, options));
        }
    }

    // Spawn multiple particles in a burst
    burst(x, y, count, options = {}) {
        for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
            this.spawn(x, y, options);
        }
    }

    // ========================================================================
    // MEGA EXPLOSION - Layered, dopamine-inducing impact
    // ========================================================================
    explosion(x, y, count = 50, color = COLORS.white, blastRadius = 60) {
        // Scale everything by blast radius
        const scale = blastRadius / 60;
        const baseCount = Math.floor(count * 2.5);  // 2.5x more particles

        // === LAYER 1: Core flash (bright center burst) ===
        for (let i = 0; i < Math.floor(baseCount * 0.3); i++) {
            this.spawn(x, y, {
                type: 'glow',
                color: COLORS.white,
                speed: randomRange(1, 4) * scale,
                radius: randomRange(8, 20) * scale,
                life: randomRange(0.1, 0.25),
                gravity: 0,
                friction: 0.9,
                glowIntensity: 2,
                shrink: true
            });
        }

        // === LAYER 2: Main explosion particles ===
        for (let i = 0; i < baseCount; i++) {
            this.spawn(x, y, {
                type: Math.random() < 0.3 ? 'square' : 'circle',
                color: color,
                speed: randomRange(5, 18) * scale,
                radius: randomRange(3, 10) * scale,
                life: randomRange(0.4, 1.2),
                gravity: randomRange(0.1, 0.25),
                friction: randomRange(0.94, 0.98),
                rotationSpeed: randomRange(-10, 10),
                glowIntensity: randomRange(0.8, 1.2)
            });
        }

        // === LAYER 3: Hot core (yellow/white center) ===
        for (let i = 0; i < Math.floor(baseCount * 0.4); i++) {
            const hotColor = Math.random() < 0.5 ? COLORS.yellow : COLORS.white;
            this.spawn(x, y, {
                type: 'circle',
                color: hotColor,
                speed: randomRange(2, 10) * scale,
                radius: randomRange(2, 6) * scale,
                life: randomRange(0.2, 0.6),
                gravity: 0.05,
                friction: 0.95,
                glowIntensity: 1.5
            });
        }

        // === LAYER 4: Fast debris streaks ===
        for (let i = 0; i < Math.floor(baseCount * 0.6); i++) {
            this.spawn(x, y, {
                type: 'streak',
                color: color,
                speed: randomRange(12, 30) * scale,
                radius: randomRange(1, 3),
                life: randomRange(0.15, 0.4),
                gravity: randomRange(0.2, 0.5),
                friction: 0.92,
                glowIntensity: 1
            });
        }

        // === LAYER 5: Slow smoke plume ===
        for (let i = 0; i < Math.floor(baseCount * 0.5); i++) {
            const smokeColor = Math.random() < 0.5 ? '#444444' : '#666666';
            this.spawn(x, y, {
                type: 'circle',
                color: smokeColor,
                angle: randomRange(-Math.PI * 0.8, -Math.PI * 0.2),  // Mostly upward
                speed: randomRange(1, 4) * scale,
                radius: randomRange(8, 20) * scale,
                life: randomRange(0.8, 1.8),
                gravity: -0.03,  // Rise slowly
                friction: 0.97,
                glowIntensity: 0,
                shrink: true,
                fadeInTime: 0.1
            });
        }

        // === LAYER 6: Shockwave rings ===
        this.shockwave(x, y, {
            color: color,
            maxRadius: blastRadius * 1.5,
            expandSpeed: 300 * scale,
            lineWidth: 5 * scale,
            life: 0.35
        });

        // Secondary inner shockwave
        this.shockwave(x, y, {
            color: COLORS.white,
            maxRadius: blastRadius * 0.8,
            expandSpeed: 400 * scale,
            lineWidth: 3 * scale,
            life: 0.2
        });

        // === LAYER 7: Scatter sparks (delayed) ===
        for (let i = 0; i < Math.floor(baseCount * 0.3); i++) {
            const angle = randomRange(0, Math.PI * 2);
            const dist = randomRange(5, 20) * scale;
            this.spawn(x + Math.cos(angle) * dist, y + Math.sin(angle) * dist, {
                type: 'streak',
                color: COLORS.yellow,
                speed: randomRange(8, 20),
                radius: randomRange(1, 2),
                life: randomRange(0.2, 0.5),
                gravity: 0.3,
                friction: 0.9,
                fadeInTime: 0.05
            });
        }

        // === LAYER 8: Secondary debris ring (for big explosions) ===
        if (blastRadius > 80) {
            const debrisCount = 20;
            for (let i = 0; i < debrisCount; i++) {
                const angle = (i / debrisCount) * Math.PI * 2;
                this.spawn(x, y, {
                    type: 'streak',
                    color: color,
                    angle: angle,
                    speed: 15 * scale,
                    radius: randomRange(2, 4),
                    life: randomRange(0.5, 0.8),
                    gravity: 0.15,
                    friction: 0.96,
                    glowIntensity: 1.2
                });
            }
        }
    }

    // ========================================================================
    // Enhanced sparks (for bounces, hits) - Now with streaks!
    // ========================================================================
    sparks(x, y, count = 10, color = COLORS.yellow) {
        const baseCount = Math.floor(count * 2);  // Double the sparks

        // Fast streaky sparks
        for (let i = 0; i < baseCount; i++) {
            this.spawn(x, y, {
                type: 'streak',
                color: color,
                speed: randomRange(4, 15),
                radius: randomRange(1, 2.5),
                life: randomRange(0.15, 0.4),
                gravity: randomRange(0.1, 0.3),
                friction: 0.92
            });
        }

        // Some circular sparks too
        for (let i = 0; i < Math.floor(baseCount * 0.5); i++) {
            this.spawn(x, y, {
                type: 'circle',
                color: COLORS.white,
                speed: randomRange(2, 8),
                radius: randomRange(1, 3),
                life: randomRange(0.1, 0.3),
                gravity: 0.15,
                friction: 0.95,
                glowIntensity: 1.5
            });
        }

        // Mini shockwave for impact feel
        this.shockwave(x, y, {
            color: color,
            maxRadius: 30,
            expandSpeed: 150,
            lineWidth: 2,
            life: 0.15
        });
    }

    // ========================================================================
    // Trail effect (for projectiles)
    // ========================================================================
    trail(x, y, color = COLORS.cyan) {
        // Main trail particle
        this.spawn(x, y, {
            type: 'glow',
            color: color,
            speed: randomRange(0.3, 1),
            angle: Math.PI / 2 + randomRange(-0.3, 0.3),
            radius: randomRange(3, 6),
            life: randomRange(0.2, 0.4),
            gravity: 0,
            friction: 0.85,
            glowIntensity: 1.2
        });

        // Occasional extra sparkle
        if (Math.random() < 0.3) {
            this.spawn(x, y, {
                type: 'circle',
                color: COLORS.white,
                speed: randomRange(1, 3),
                radius: randomRange(1, 2),
                life: randomRange(0.1, 0.2),
                gravity: 0,
                friction: 0.9,
                glowIntensity: 2
            });
        }
    }

    // ========================================================================
    // Hit confirmation burst (for direct player hits)
    // ========================================================================
    hitConfirm(x, y, color = COLORS.white, intensity = 1) {
        // Intense center flash
        for (let i = 0; i < Math.floor(30 * intensity); i++) {
            this.spawn(x, y, {
                type: 'glow',
                color: COLORS.white,
                speed: randomRange(2, 8) * intensity,
                radius: randomRange(5, 15) * intensity,
                life: randomRange(0.1, 0.3),
                gravity: 0,
                friction: 0.9,
                glowIntensity: 2.5
            });
        }

        // Colored burst
        for (let i = 0; i < Math.floor(50 * intensity); i++) {
            this.spawn(x, y, {
                type: Math.random() < 0.4 ? 'streak' : 'circle',
                color: color,
                speed: randomRange(8, 25) * intensity,
                radius: randomRange(2, 6),
                life: randomRange(0.3, 0.8),
                gravity: 0.15,
                friction: 0.94,
                glowIntensity: 1.3
            });
        }

        // Impact shockwaves
        this.shockwave(x, y, {
            color: COLORS.white,
            maxRadius: 80 * intensity,
            expandSpeed: 400,
            lineWidth: 6,
            life: 0.25
        });
        this.shockwave(x, y, {
            color: color,
            maxRadius: 120 * intensity,
            expandSpeed: 250,
            lineWidth: 4,
            life: 0.4
        });
    }

    // ========================================================================
    // Death explosion (massive, for killing blows)
    // ========================================================================
    deathExplosion(x, y, color = COLORS.magenta) {
        // MASSIVE explosion
        this.explosion(x, y, 150, color, 120);

        // Extra layers for death
        // Ring of debris
        for (let i = 0; i < 40; i++) {
            const angle = (i / 40) * Math.PI * 2;
            this.spawn(x, y, {
                type: 'streak',
                color: color,
                angle: angle,
                speed: randomRange(15, 35),
                radius: randomRange(2, 4),
                life: randomRange(0.4, 0.8),
                gravity: 0.2,
                friction: 0.95
            });
        }

        // Massive shockwaves
        this.shockwave(x, y, {
            color: COLORS.white,
            maxRadius: 200,
            expandSpeed: 500,
            lineWidth: 8,
            life: 0.5
        });
        this.shockwave(x, y, {
            color: color,
            maxRadius: 250,
            expandSpeed: 350,
            lineWidth: 5,
            life: 0.6
        });
        this.shockwave(x, y, {
            color: color,
            startRadius: 20,
            maxRadius: 180,
            expandSpeed: 600,
            lineWidth: 3,
            life: 0.3
        });
    }

    // ========================================================================
    // Tank Death Burst - Shape-specific directional explosions
    // ========================================================================
    tankDeathBurst(x, y, tankShape, tankColor, sides = 6) {
        // Determine number of directional bursts based on tank shape
        let burstAngles;
        switch (tankShape) {
            case 'triangle':
                burstAngles = 3;
                break;
            case 'square':
            case 'diamond':
                burstAngles = 4;
                break;
            case 'pentagon':
            case 'star':
                burstAngles = 5;
                break;
            case 'hexagon':
                burstAngles = 6;
                break;
            case 'octagon':
                burstAngles = 8;
                break;
            case 'circle':
                burstAngles = 12;
                break;
            default:
                burstAngles = sides;
        }

        // Create directional bursts of mini shapes
        for (let i = 0; i < burstAngles; i++) {
            const baseAngle = (i / burstAngles) * Math.PI * 2 - Math.PI / 2;

            // Multiple particles per burst direction
            for (let j = 0; j < 5; j++) {
                const spreadAngle = baseAngle + randomRange(-0.2, 0.2);
                const speed = randomRange(8, 20);

                this.spawn(x, y, {
                    type: 'shape',
                    shape: tankShape,
                    sides: sides,
                    color: tankColor,
                    angle: spreadAngle,
                    speed: speed,
                    radius: randomRange(4, 10),
                    life: randomRange(0.6, 1.2),
                    gravity: randomRange(0.1, 0.25),
                    friction: randomRange(0.94, 0.98),
                    rotationSpeed: randomRange(-8, 8),
                    glowIntensity: randomRange(1.0, 1.5)
                });
            }
        }

        // Add additional scattered mini shapes
        const scatterCount = 20;
        for (let i = 0; i < scatterCount; i++) {
            this.spawn(x, y, {
                type: 'shape',
                shape: tankShape,
                sides: sides,
                color: tankColor,
                speed: randomRange(3, 12),
                radius: randomRange(2, 6),
                life: randomRange(0.4, 1.0),
                gravity: randomRange(0.15, 0.35),
                friction: randomRange(0.92, 0.97),
                rotationSpeed: randomRange(-12, 12),
                glowIntensity: randomRange(0.8, 1.2)
            });
        }

        // Add some white hot core particles for variety
        for (let i = 0; i < 10; i++) {
            this.spawn(x, y, {
                type: 'shape',
                shape: tankShape,
                sides: sides,
                color: COLORS.white,
                speed: randomRange(5, 15),
                radius: randomRange(3, 7),
                life: randomRange(0.2, 0.5),
                gravity: 0.1,
                friction: 0.95,
                rotationSpeed: randomRange(-6, 6),
                glowIntensity: 2
            });
        }
    }

    // ========================================================================
    // Update & Draw
    // ========================================================================

    update(dt) {
        // Update all particles
        for (const particle of this.particles) {
            particle.update(dt);
        }

        // Update shockwaves
        for (const wave of this.shockwaves) {
            wave.update(dt);
        }

        // Remove dead particles (with performance limit)
        this.particles = this.particles.filter(p => !p.dead);
        this.shockwaves = this.shockwaves.filter(w => !w.dead);

        // Hard cap for safety
        if (this.particles.length > MAX_PARTICLES) {
            this.particles = this.particles.slice(-MAX_PARTICLES);
        }
    }

    draw(renderer) {
        // Draw shockwaves first (behind particles)
        for (const wave of this.shockwaves) {
            wave.draw(renderer);
        }

        // Draw particles
        for (const particle of this.particles) {
            particle.draw(renderer);
        }
    }

    // Clear all particles
    clear() {
        this.particles = [];
        this.shockwaves = [];
    }

    // Get counts (for debugging)
    get count() {
        return this.particles.length;
    }

    get waveCount() {
        return this.shockwaves.length;
    }
}

// Export singleton
export const particles = new ParticleSystem();
