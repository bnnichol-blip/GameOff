/**
 * Renderer for Void Artillery
 * Handles all drawing with neon glow aesthetic
 */

// ============================================================================
// Color Constants
// ============================================================================

export const COLORS = {
    cyan: '#00ffff',
    magenta: '#ff00ff',
    yellow: '#ffff00',
    white: '#ffffff',
    voidPurple: '#1a0033',
    black: '#000000',
    green: '#00ff00',
    orange: '#ff8800'
};

// ============================================================================
// Renderer Class
// ============================================================================

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Screen shake state
        this.shake = { x: 0, y: 0, intensity: 0 };
        
        // Camera offset (for future use)
        this.camera = { x: 0, y: 0 };
    }
    
    // Resize canvas to fill window (call on init and window resize)
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.width = width;
        this.height = height;
    }
    
    // ========================================================================
    // Frame Management
    // ========================================================================
    
    clear() {
        this.ctx.fillStyle = COLORS.black;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    beginFrame() {
        this.clear();
        
        // Apply screen shake
        if (this.shake.intensity > 0) {
            this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
            this.shake.y = (Math.random() - 0.5) * this.shake.intensity;
            // Slower decay for more impactful feel (was 0.9)
            this.shake.intensity *= 0.88;
            
            this.ctx.save();
            this.ctx.translate(this.shake.x, this.shake.y);
        }
    }
    
    endFrame() {
        if (this.shake.intensity > 0) {
            this.ctx.restore();
        }
        
        // Kill tiny shake values
        if (this.shake.intensity < 0.5) {
            this.shake.intensity = 0;
        }
    }
    
    // ========================================================================
    // Screen Effects
    // ========================================================================
    
    addScreenShake(intensity) {
        // Increased max shake for more impactful explosions
        this.shake.intensity = Math.min(this.shake.intensity + intensity, 50);
    }
    
    flash(color = COLORS.white, alpha = 0.3) {
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = alpha;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = 1;
    }

    /**
     * Draw a radial light burst (additive glow)
     * Use at explosion locations for intense impact
     */
    lightBurst(x, y, radius, color) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'lighter';
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, this.hexToRgba(color, 0.5));
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        this.ctx.restore();
    }

    /**
     * Convert hex color to rgba with alpha
     */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ========================================================================
    // Glow Helpers
    // ========================================================================
    
    setGlow(color, blur = 20) {
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = blur;
    }
    
    clearGlow() {
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
    }
    
    // ========================================================================
    // Shape Drawing (all with glow support)
    // ========================================================================
    
    drawCircle(x, y, radius, color, glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        if (glow) this.clearGlow();
    }
    
    drawRing(x, y, radius, color, lineWidth = 2, glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
        
        if (glow) this.clearGlow();
    }
    
    drawLine(x1, y1, x2, y2, color, lineWidth = 2, glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
        
        if (glow) this.clearGlow();
    }
    
    drawRect(x, y, width, height, color, glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
        
        if (glow) this.clearGlow();
    }
    
    drawRectOutline(x, y, width, height, color, lineWidth = 2, glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.strokeRect(x, y, width, height);
        
        if (glow) this.clearGlow();
    }
    
    // Draw a polygon from array of points [{x, y}, ...]
    drawPolygon(points, color, glow = true) {
        if (points.length < 3) return;
        
        if (glow) this.setGlow(color);
        
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();
        this.ctx.fillStyle = color;
        this.ctx.fill();
        
        if (glow) this.clearGlow();
    }
    
    drawPolygonOutline(points, color, lineWidth = 2, glow = true) {
        if (points.length < 3) return;
        
        if (glow) this.setGlow(color);
        
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.stroke();
        
        if (glow) this.clearGlow();
    }
    
    // Regular polygon (triangle, hexagon, etc)
    drawRegularPolygon(x, y, radius, sides, rotation, color, glow = true) {
        const points = [];
        for (let i = 0; i < sides; i++) {
            const angle = rotation + (i * 2 * Math.PI / sides);
            points.push({
                x: x + radius * Math.cos(angle),
                y: y + radius * Math.sin(angle)
            });
        }
        this.drawPolygon(points, color, glow);
    }
    
    // ========================================================================
    // Text
    // ========================================================================
    
    drawText(text, x, y, color, size = 16, align = 'left', glow = true) {
        if (glow) this.setGlow(color);
        
        this.ctx.font = `${size}px "Courier New", monospace`;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = align;
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(text, x, y);
        
        if (glow) this.clearGlow();
    }
    
    // ========================================================================
    // Background Grid
    // ========================================================================
    
    drawGrid(spacing = 40, color = '#111122') {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < this.width; x += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < this.height; y += spacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
    }
    
    // ========================================================================
    // Void (rising danger zone)
    // ========================================================================

    // Cached void gradient to avoid recreation every frame
    _cachedVoidGradient = null;
    _cachedVoidY = null;

    drawVoid(voidY, virtualWidth = null, virtualHeight = null) {
        // Use virtual dimensions if provided (for scaled world rendering)
        // Otherwise fall back to canvas dimensions
        const drawWidth = virtualWidth || this.width * 2;  // Default to 2x canvas for scaled contexts
        const drawHeight = virtualHeight || this.height * 2;

        // Cache gradient - only recreate when voidY changes
        if (this._cachedVoidY !== voidY) {
            this._cachedVoidGradient = this.ctx.createLinearGradient(0, voidY - 50, 0, voidY + 100);
            this._cachedVoidGradient.addColorStop(0, 'transparent');
            this._cachedVoidGradient.addColorStop(0.3, COLORS.voidPurple);
            this._cachedVoidGradient.addColorStop(1, '#0a0010');
            this._cachedVoidY = voidY;
        }

        this.ctx.fillStyle = this._cachedVoidGradient;
        this.ctx.fillRect(0, voidY - 50, drawWidth, drawHeight - voidY + 50);

        // Glowing edge line
        this.setGlow(COLORS.magenta, 30);
        this.ctx.beginPath();
        this.ctx.moveTo(0, voidY);
        this.ctx.lineTo(drawWidth, voidY);
        this.ctx.strokeStyle = COLORS.magenta;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.clearGlow();

        // Animated glitch effect on edge (subtle)
        const time = Date.now() / 100;
        for (let i = 0; i < 5; i++) {
            const glitchX = Math.random() * drawWidth;
            const glitchW = Math.random() * 50 + 10;
            const glitchOffset = Math.sin(time + i) * 3;

            this.ctx.fillStyle = COLORS.magenta;
            this.ctx.globalAlpha = 0.3;
            this.ctx.fillRect(glitchX, voidY + glitchOffset - 2, glitchW, 4);
            this.ctx.globalAlpha = 1;
        }
    }
}
