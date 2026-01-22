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
 * Generate rolling hills terrain using randomized layered sine waves
 * @param {number} terrainWidth - Width of terrain (should match canvas width)
 */
export function generate(terrainWidth) {
    width = terrainWidth;
    heights = new Float32Array(width);

    const baseY = 500;

    // Randomize phase offsets for each sine layer
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const phase3 = Math.random() * Math.PI * 2;

    // Randomize amplitudes within reasonable ranges
    const amp1 = 60 + Math.random() * 40;   // 60-100 (large hills)
    const amp2 = 30 + Math.random() * 25;   // 30-55 (medium variation)
    const amp3 = 10 + Math.random() * 15;   // 10-25 (small bumps)

    // Randomize frequencies slightly
    const freq1 = 0.004 + Math.random() * 0.002;  // 0.004-0.006
    const freq2 = 0.012 + Math.random() * 0.006;  // 0.012-0.018
    const freq3 = 0.03 + Math.random() * 0.02;    // 0.03-0.05

    for (let x = 0; x < width; x++) {
        let y = baseY
            + amp1 * Math.sin(x * freq1 + phase1)
            + amp2 * Math.sin(x * freq2 + phase2)
            + amp3 * Math.sin(x * freq3 + phase3);

        // Clamp to valid range
        y = Math.max(200, Math.min(y, CANVAS_HEIGHT - 80));
        heights[x] = y;
    }

    // Balance spawn areas for fairness
    balanceSpawnAreas(200, 1080, 70);
}

/**
 * Balance terrain height at both spawn points to ensure fairness
 * @param {number} spawn1X - Player 1 spawn X
 * @param {number} spawn2X - Player 2 spawn X
 * @param {number} radius - Radius of spawn area to balance
 */
function balanceSpawnAreas(spawn1X, spawn2X, radius) {
    if (!heights) return;

    // Get average height at each spawn area
    const height1 = getAreaAverageHeight(spawn1X, radius);
    const height2 = getAreaAverageHeight(spawn2X, radius);

    // Calculate target height (weighted average, biased toward higher ground)
    // This ensures neither player is too low
    const targetHeight = Math.min(height1, height2) + Math.abs(height1 - height2) * 0.3;

    // Maximum height difference allowed (fairness threshold)
    const maxDiff = 25;
    const currentDiff = Math.abs(height1 - height2);

    if (currentDiff > maxDiff) {
        // Adjust both spawn areas toward target
        adjustSpawnArea(spawn1X, radius, targetHeight);
        adjustSpawnArea(spawn2X, radius, targetHeight);
    } else {
        // Just smooth each area locally without equalizing
        smoothSpawnArea(spawn1X, radius);
        smoothSpawnArea(spawn2X, radius);
    }
}

/**
 * Get average terrain height in an area
 */
function getAreaAverageHeight(centerX, radius) {
    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));

    let sum = 0;
    let count = 0;
    for (let x = startX; x <= endX; x++) {
        sum += heights[x];
        count++;
    }
    return sum / count;
}

/**
 * Adjust spawn area toward a target height while keeping edges natural
 */
function adjustSpawnArea(centerX, radius, targetHeight) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));

    for (let x = startX; x <= endX; x++) {
        const dist = Math.abs(x - centerX);
        // Smooth falloff: strong adjustment at center, none at edge
        const t = 1 - (dist / radius);
        const blend = t * t * t * 0.8;  // Cubic falloff, 80% max adjustment

        heights[x] = heights[x] * (1 - blend) + targetHeight * blend;
    }
}

/**
 * Smooth terrain around a point without changing target height
 */
function smoothSpawnArea(centerX, radius) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(centerX - radius));
    const endX = Math.min(width - 1, Math.ceil(centerX + radius));

    // Get local average
    const avgHeight = getAreaAverageHeight(centerX, radius);

    // Blend toward local average (smoothing only)
    for (let x = startX; x <= endX; x++) {
        const dist = Math.abs(x - centerX);
        const t = 1 - (dist / radius);
        const blend = t * t * 0.5;  // Quadratic, 50% blend
        heights[x] = heights[x] * (1 - blend) + avgHeight * blend;
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
// Terrain Addition (for Dirt/Sand weapon)
// ============================================================================

/**
 * Raise terrain in a semicircular mound (opposite of destroy)
 * @param {number} cx - Center X of mound
 * @param {number} cy - Center Y (base of mound)
 * @param {number} radius - Mound radius
 */
export function raise(cx, cy, radius) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    // Minimum Y to prevent terrain going above safe zone
    const minTerrainY = 150;
    // Maximum Y to prevent terrain going below void zone
    const maxTerrainY = CANVAS_HEIGHT - 50;

    for (let x = startX; x <= endX; x++) {
        const dx = x - cx;

        // Only process if within circular radius
        if (Math.abs(dx) <= radius) {
            // Semicircle height calculation (mirror of destroy)
            const height = Math.sqrt(radius * radius - dx * dx);
            const moundTop = cy - height;

            // Only raise terrain, never lower it
            // Also clamp to safe bounds
            const newHeight = Math.max(minTerrainY, Math.min(moundTop, heights[x]));
            if (newHeight < heights[x]) {
                heights[x] = newHeight;
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
    raise,
    draw
};
