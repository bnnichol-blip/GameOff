/**
 * Particle System for Void Artillery
 * Handles creation, update, and rendering of particles
 */

import { randomRange } from './utils.js';
import { COLORS } from './renderer.js';

// ============================================================================
// Particle Class
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
        
        // State
        this.dead = false;
    }
    
    update(dt) {
        // Apply gravity
        this.vy += this.gravity;
        
        // Apply friction
        this.vx *= this.friction;
        this.vy *= this.friction;
        
        // Move
        this.x += this.vx;
        this.y += this.vy;
        
        // Age
        this.life -= dt;
        
        // Shrink over lifetime
        if (this.shrink) {
            this.radius = this.originalRadius * (this.life / this.maxLife);
        }
        
        // Die
        if (this.life <= 0 || this.radius <= 0) {
            this.dead = true;
        }
    }
    
    draw(renderer) {
        // Fade out
        const alpha = Math.max(0, this.life / this.maxLife);
        renderer.ctx.globalAlpha = alpha;
        renderer.drawCircle(this.x, this.y, Math.max(0.5, this.radius), this.color, true);
        renderer.ctx.globalAlpha = 1;
    }
}

// ============================================================================
// Particle System
// ============================================================================

export class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    
    // Spawn a single particle
    spawn(x, y, options = {}) {
        this.particles.push(new Particle(x, y, options));
    }
    
    // Spawn multiple particles in a burst
    burst(x, y, count, options = {}) {
        for (let i = 0; i < count; i++) {
            this.spawn(x, y, options);
        }
    }
    
    // Explosion effect - particles fly outward
    explosion(x, y, count = 50, color = COLORS.white) {
        for (let i = 0; i < count; i++) {
            this.spawn(x, y, {
                color: color,
                speed: randomRange(3, 12),
                radius: randomRange(2, 6),
                life: randomRange(0.3, 1.0),
                gravity: 0.15,
                friction: 0.96
            });
        }
    }
    
    // Small spark burst (for bounces, hits)
    sparks(x, y, count = 10, color = COLORS.yellow) {
        for (let i = 0; i < count; i++) {
            this.spawn(x, y, {
                color: color,
                speed: randomRange(2, 6),
                radius: randomRange(1, 3),
                life: randomRange(0.2, 0.5),
                gravity: 0.05,
                friction: 0.95
            });
        }
    }
    
    // Trail effect - single particle with options
    trail(x, y, color = COLORS.cyan) {
        this.spawn(x, y, {
            color: color,
            speed: randomRange(0.5, 1.5),
            angle: Math.PI / 2 + randomRange(-0.3, 0.3), // Mostly downward
            radius: randomRange(2, 4),
            life: randomRange(0.2, 0.4),
            gravity: 0,
            friction: 0.9
        });
    }
    
    update(dt) {
        // Update all particles
        for (const particle of this.particles) {
            particle.update(dt);
        }
        
        // Remove dead particles
        this.particles = this.particles.filter(p => !p.dead);
    }
    
    draw(renderer) {
        for (const particle of this.particles) {
            particle.draw(renderer);
        }
    }
    
    // Clear all particles
    clear() {
        this.particles = [];
    }
    
    // Get particle count (for debugging)
    get count() {
        return this.particles.length;
    }
}

// Export singleton
export const particles = new ParticleSystem();
