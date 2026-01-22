/**
 * Terrain System for Void Artillery
 * Heightmap-based terrain with generation, collision, destruction, and rendering
 */

import { COLORS } from './renderer.js';

// ============================================================================
// Constants
// ============================================================================

const CANVAS_HEIGHT = 720;  // Must match main.js

// ============================================================================
// Terrain State
// ============================================================================

let heights = null;
let width = 0;

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate rolling hills terrain using layered sine waves
 * @param {number} terrainWidth - Width of terrain (should match canvas width)
 */
export function generate(terrainWidth) {
    width = terrainWidth;
    heights = new Float32Array(width);

    const baseY = 500;

    for (let x = 0; x < width; x++) {
        let y = baseY
            + 80 * Math.sin(x * 0.005)      // Large hills
            + 40 * Math.sin(x * 0.015)      // Medium variation
            + 15 * Math.sin(x * 0.04);      // Small bumps

        // Clamp to valid range (Gemini suggestion)
        y = Math.max(150, Math.min(y, CANVAS_HEIGHT - 50));
        heights[x] = y;
    }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get terrain height at a given X position with linear interpolation
 * @param {number} x - X coordinate
 * @returns {number} Y coordinate of terrain surface
 */
export function getHeightAt(x) {
    if (!heights || x < 0 || x >= width) {
        return CANVAS_HEIGHT;  // Return bottom if out of bounds
    }

    const x0 = Math.floor(x);
    const x1 = Math.min(x0 + 1, width - 1);
    const t = x - x0;

    // Linear interpolation between two nearest points
    return heights[x0] * (1 - t) + heights[x1] * t;
}

/**
 * Check if a point is below (inside) the terrain
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if point is at or below terrain surface
 */
export function isPointBelowTerrain(x, y) {
    return y >= getHeightAt(x);
}

// ============================================================================
// Destruction
// ============================================================================

/**
 * Carve a semicircular crater into the terrain
 * @param {number} cx - Center X of explosion
 * @param {number} cy - Center Y of explosion
 * @param {number} radius - Blast radius
 */
export function destroy(cx, cy, radius) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    for (let x = startX; x <= endX; x++) {
        const dx = x - cx;

        // Only process if within circular radius
        if (Math.abs(dx) <= radius) {
            // Semicircle depth calculation
            const depth = Math.sqrt(radius * radius - dx * dx);
            const craterBottom = cy + depth;

            // Only lower terrain, never raise it
            if (craterBottom > heights[x]) {
                heights[x] = craterBottom;
            }
        }
    }
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Draw the terrain with dark fill and glowing edge
 * @param {Renderer} renderer - The renderer instance
 */
export function draw(renderer) {
    if (!heights) return;

    const ctx = renderer.ctx;

    // Build path along terrain surface
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);

    // Draw terrain line (can skip pixels for performance if needed)
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x]);
    }

    // Close path along bottom of screen
    ctx.lineTo(width, CANVAS_HEIGHT + 50);
    ctx.lineTo(0, CANVAS_HEIGHT + 50);
    ctx.closePath();

    // Dark fill
    ctx.fillStyle = '#0a0a12';
    ctx.fill();

    // Glowing edge line (redraw just the top)
    renderer.setGlow(COLORS.cyan, 15);
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x]);
    }
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    renderer.clearGlow();
}

// ============================================================================
// Export terrain object for convenient access
// ============================================================================

export const terrain = {
    generate,
    getHeightAt,
    isPointBelowTerrain,
    destroy,
    draw
};
