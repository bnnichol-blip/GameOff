/**
 * Terrain System for Void Artillery
 * Heightmap-based terrain with Tron circuit board aesthetic
 */

import { COLORS } from './renderer.js';

// ============================================================================
// Terrain State
// ============================================================================

let heights = null;
let width = 0;
let canvasHeight = 900;  // Updated by generate()

// Circuit board overlay (precomputed for performance)
let circuitLines = [];      // Main circuit traces
let circuitNodes = [];      // Junction nodes
let contourLines = [];      // Depth contour layers
let circuitPulses = [];     // Animated pulses traveling along lines

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate rolling hills terrain using randomized layered sine waves
 * @param {number} terrainWidth - Width of terrain (should match canvas width)
 * @param {number} terrainHeight - Height of canvas (for clamping)
 * @param {number[]} spawnXs - Array of X positions to balance for spawns
 */
export function generate(terrainWidth, terrainHeight = 900, spawnXs = [], edgeMargin = 100) {
    width = terrainWidth;
    canvasHeight = terrainHeight;
    heights = new Float32Array(width);

    const baseY = canvasHeight * 0.6;  // 60% down the screen

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
        y = Math.max(canvasHeight * 0.25, Math.min(y, canvasHeight - 100));

        // === PUSH TERRAIN DOWN AT EDGES ===
        // This prevents projectiles from hitting terrain when bouncing off walls
        // Use a larger margin and push terrain ALL THE WAY to bottom
        const edgeFadeZone = Math.max(edgeMargin, 150);  // At least 150px fade zone
        if (x < edgeFadeZone) {
            // Fade terrain down near left edge - use cubic for smoother transition
            const fade = x / edgeFadeZone;
            const fadeCubic = fade * fade * fade;  // More aggressive near edge
            // Push to bottom of screen
            y = canvasHeight + 100 - (canvasHeight + 100 - y) * fadeCubic;
        } else if (x > width - edgeFadeZone) {
            // Fade terrain down near right edge
            const fade = (width - x) / edgeFadeZone;
            const fadeCubic = fade * fade * fade;
            y = canvasHeight + 100 - (canvasHeight + 100 - y) * fadeCubic;
        }

        heights[x] = y;
    }

    // Balance spawn areas for fairness (if spawn positions provided)
    if (spawnXs.length >= 2) {
        for (const spawnX of spawnXs) {
            smoothSpawnArea(spawnX, 70);
        }
    } else {
        // Legacy fallback for 2 players
        balanceSpawnAreas(200, terrainWidth - 200, 70);
    }

    // Generate Tron circuit board overlay
    generateCircuitBoard();
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
        return canvasHeight;  // Return bottom if out of bounds
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
    const maxTerrainY = canvasHeight - 50;

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
// Jagged Terrain Modification (Dirt Ball / Digger weapons)
// ============================================================================

/**
 * Create a massive jagged peak (Dirt Ball weapon)
 * Creates sharp, irregular terrain spire
 * @param {number} cx - Center X of peak
 * @param {number} cy - Base Y (where projectile hit)
 * @param {number} radius - Width of the peak base
 * @param {number} voidY - Current void Y position (to prevent raising terrain if tanks are there)
 */
export function raiseJagged(cx, cy, radius, voidY = 9999) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    // Minimum Y to prevent terrain going above safe zone
    const minTerrainY = 100;
    // Peak height - go high!
    const peakHeight = radius * 1.8;

    // Generate jagged profile with multiple peaks
    const jaggedPoints = [];
    const numJags = 5 + Math.floor(Math.random() * 4);  // 5-8 jagged points

    for (let i = 0; i <= numJags; i++) {
        const t = i / numJags;
        const jx = startX + (endX - startX) * t;

        // Main peak shape (triangle-ish)
        const distFromCenter = Math.abs(jx - cx) / radius;
        let baseHeight = (1 - distFromCenter) * peakHeight;

        // Add jagged variation - random heights at each point
        const jitter = (Math.random() - 0.3) * peakHeight * 0.5;
        baseHeight = Math.max(0, baseHeight + jitter);

        jaggedPoints.push({ x: jx, height: baseHeight });
    }

    // Apply jagged heights with interpolation
    for (let x = startX; x <= endX; x++) {
        // Find the two nearest jagged points
        let lowerPoint = jaggedPoints[0];
        let upperPoint = jaggedPoints[jaggedPoints.length - 1];

        for (let i = 0; i < jaggedPoints.length - 1; i++) {
            if (x >= jaggedPoints[i].x && x <= jaggedPoints[i + 1].x) {
                lowerPoint = jaggedPoints[i];
                upperPoint = jaggedPoints[i + 1];
                break;
            }
        }

        // Linear interpolation between jagged points
        const range = upperPoint.x - lowerPoint.x;
        const t = range > 0 ? (x - lowerPoint.x) / range : 0;
        const interpHeight = lowerPoint.height * (1 - t) + upperPoint.height * t;

        // Calculate new terrain height
        const currentY = heights[x];
        const baseY = cy;  // Impact point
        const newY = baseY - interpHeight;

        // Only raise terrain, never lower it (unless we're lifting a tank)
        const clampedY = Math.max(minTerrainY, newY);
        if (clampedY < currentY) {
            heights[x] = clampedY;
        }
    }
}

/**
 * Create a massive jagged crater (Digger weapon)
 * Can cut all the way to the void line
 * @param {number} cx - Center X of crater
 * @param {number} cy - Center Y (impact point)
 * @param {number} radius - Radius of crater
 * @param {number} voidY - Current void Y position (crater can reach this)
 */
export function digJagged(cx, cy, radius, voidY = 9999) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    // Generate jagged crater profile with irregular depths
    const jaggedPoints = [];
    const numJags = 6 + Math.floor(Math.random() * 5);  // 6-10 jagged points

    for (let i = 0; i <= numJags; i++) {
        const t = i / numJags;
        const jx = startX + (endX - startX) * t;

        // Base crater shape (deepest in center)
        const distFromCenter = Math.abs(jx - cx) / radius;
        let baseDepth = (1 - distFromCenter * distFromCenter) * radius * 1.5;

        // Add jagged variation - random depths at each point
        const jitter = (Math.random() - 0.3) * radius * 0.6;
        baseDepth = Math.max(0, baseDepth + jitter);

        jaggedPoints.push({ x: jx, depth: baseDepth });
    }

    // Apply jagged crater with interpolation
    for (let x = startX; x <= endX; x++) {
        // Find the two nearest jagged points
        let lowerPoint = jaggedPoints[0];
        let upperPoint = jaggedPoints[jaggedPoints.length - 1];

        for (let i = 0; i < jaggedPoints.length - 1; i++) {
            if (x >= jaggedPoints[i].x && x <= jaggedPoints[i + 1].x) {
                lowerPoint = jaggedPoints[i];
                upperPoint = jaggedPoints[i + 1];
                break;
            }
        }

        // Linear interpolation between jagged points
        const range = upperPoint.x - lowerPoint.x;
        const t = range > 0 ? (x - lowerPoint.x) / range : 0;
        const interpDepth = lowerPoint.depth * (1 - t) + upperPoint.depth * t;

        // Calculate new terrain height (digging down)
        const craterBottom = cy + interpDepth;

        // Can dig all the way to void line
        const clampedBottom = Math.min(craterBottom, voidY + 50);

        // Only lower terrain, never raise it
        if (clampedBottom > heights[x]) {
            heights[x] = clampedBottom;
        }
    }
}

// ============================================================================
// Circuit Board Generation (Tron aesthetic)
// ============================================================================

/**
 * Generate circuit board overlay for the terrain
 * Called after terrain heights are generated
 */
function generateCircuitBoard() {
    circuitLines = [];
    circuitNodes = [];
    contourLines = [];
    circuitPulses = [];

    if (!heights) return;

    // Generate main horizontal circuit traces at different depths
    const traceCount = 8;
    const depthSpacing = 40;

    for (let i = 0; i < traceCount; i++) {
        const depthOffset = 20 + i * depthSpacing;
        const trace = generateCircuitTrace(depthOffset, i);
        circuitLines.push(...trace.lines);
        circuitNodes.push(...trace.nodes);
    }

    // Generate contour lines (layered depth effect)
    for (let i = 1; i <= 3; i++) {
        contourLines.push({
            offset: i * 25,
            alpha: 0.15 - i * 0.04,
            color: i === 1 ? COLORS.cyan : COLORS.magenta
        });
    }

    // Initialize a few animated pulses
    for (let i = 0; i < 3; i++) {
        if (circuitLines.length > 0) {
            const lineIndex = Math.floor(Math.random() * circuitLines.length);
            circuitPulses.push({
                lineIndex,
                progress: Math.random(),
                speed: 0.15 + Math.random() * 0.1,
                color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta
            });
        }
    }
}

/**
 * Generate a single circuit trace with 90° turns and nodes
 */
function generateCircuitTrace(depthOffset, traceIndex) {
    const lines = [];
    const nodes = [];

    // Start from left edge
    let x = 50 + Math.random() * 100;
    const baseY = depthOffset;

    // Alternate between cyan and magenta traces
    const color = traceIndex % 2 === 0 ? COLORS.cyan : COLORS.magenta;
    const alpha = 0.12 + Math.random() * 0.08;
    const lineWidth = 1 + Math.random() * 0.5;

    while (x < width - 100) {
        // Horizontal segment
        const segmentLength = 80 + Math.random() * 150;
        const nextX = Math.min(x + segmentLength, width - 100);
        const terrainY = getHeightAt(x);

        // Only draw if below terrain surface
        if (terrainY < canvasHeight - 50) {
            const y1 = terrainY + baseY;
            const y2 = getHeightAt(nextX) + baseY;

            lines.push({
                x1: x, y1,
                x2: nextX, y2,
                color, alpha, lineWidth,
                horizontal: true
            });

            // Maybe add a vertical segment (90° turn)
            if (Math.random() < 0.4) {
                const vertLength = 20 + Math.random() * 40;
                const vertDir = Math.random() < 0.5 ? 1 : -1;
                lines.push({
                    x1: nextX, y1: y2,
                    x2: nextX, y2: y2 + vertLength * vertDir,
                    color, alpha, lineWidth,
                    horizontal: false
                });
            }

            // Maybe add a node at junction
            if (Math.random() < 0.3) {
                nodes.push({
                    x: nextX,
                    y: y2,
                    radius: 2 + Math.random() * 3,
                    color,
                    alpha: alpha + 0.1,
                    type: Math.random() < 0.5 ? 'circle' : 'square'
                });
            }
        }

        x = nextX + Math.random() * 30;
    }

    return { lines, nodes };
}

// ============================================================================
// Rendering
// ============================================================================

/**
 * Draw the terrain with Tron circuit board aesthetic
 * @param {Renderer} renderer - The renderer instance
 */
export function draw(renderer) {
    if (!heights) return;

    const ctx = renderer.ctx;

    // Build path along terrain surface
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x]);
    }

    // Close path along bottom of screen
    ctx.lineTo(width, canvasHeight + 50);
    ctx.lineTo(0, canvasHeight + 50);
    ctx.closePath();

    // Dark circuit board fill
    ctx.fillStyle = '#050510';
    ctx.fill();

    // Draw contour layers (depth effect)
    drawContourLayers(renderer);

    // Draw circuit traces
    drawCircuitTraces(renderer);

    // Draw circuit nodes
    drawCircuitNodes(renderer);

    // Draw animated pulses
    drawCircuitPulses(renderer);

    // Glowing edge line (main terrain surface)
    renderer.setGlow(COLORS.cyan, 20);
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x]);
    }
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    renderer.clearGlow();

    // Secondary edge glow (magenta, slightly offset)
    ctx.globalAlpha = 0.3;
    renderer.setGlow(COLORS.magenta, 10);
    ctx.beginPath();
    ctx.moveTo(0, heights[0] + 3);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x] + 3);
    }
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 1;
    ctx.stroke();
    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw layered contour lines for depth effect
 */
function drawContourLayers(renderer) {
    const ctx = renderer.ctx;

    for (const contour of contourLines) {
        ctx.globalAlpha = contour.alpha;
        ctx.strokeStyle = contour.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, heights[0] + contour.offset);
        for (let x = 1; x < width; x++) {
            ctx.lineTo(x, heights[x] + contour.offset);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

/**
 * Draw circuit traces (thin neon lines)
 */
function drawCircuitTraces(renderer) {
    const ctx = renderer.ctx;

    for (const line of circuitLines) {
        // Check if line is still within terrain bounds
        const terrainY1 = getHeightAt(line.x1);
        const terrainY2 = getHeightAt(line.x2);
        if (line.y1 < terrainY1 || line.y2 < terrainY2) continue;

        ctx.globalAlpha = line.alpha;
        renderer.setGlow(line.color, 6);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.lineWidth;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        renderer.clearGlow();
    }
    ctx.globalAlpha = 1;
}

/**
 * Draw circuit nodes (junction points)
 */
function drawCircuitNodes(renderer) {
    const ctx = renderer.ctx;

    for (const node of circuitNodes) {
        // Check if node is still within terrain
        const terrainY = getHeightAt(node.x);
        if (node.y < terrainY) continue;

        ctx.globalAlpha = node.alpha;
        renderer.setGlow(node.color, 8);
        ctx.fillStyle = node.color;

        if (node.type === 'circle') {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Square node
            ctx.fillRect(
                node.x - node.radius,
                node.y - node.radius,
                node.radius * 2,
                node.radius * 2
            );
        }
        renderer.clearGlow();
    }
    ctx.globalAlpha = 1;
}

/**
 * Draw animated pulses traveling along circuit lines
 */
function drawCircuitPulses(renderer) {
    const ctx = renderer.ctx;

    for (const pulse of circuitPulses) {
        if (pulse.lineIndex >= circuitLines.length) continue;

        const line = circuitLines[pulse.lineIndex];
        const terrainY = getHeightAt(line.x1);
        if (line.y1 < terrainY) continue;

        // Calculate pulse position
        const px = line.x1 + (line.x2 - line.x1) * pulse.progress;
        const py = line.y1 + (line.y2 - line.y1) * pulse.progress;

        // Draw pulse glow
        ctx.globalAlpha = 0.8;
        renderer.setGlow(pulse.color, 15);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        renderer.clearGlow();
    }
    ctx.globalAlpha = 1;
}

/**
 * Update circuit pulse animations
 */
export function updateCircuitPulses(dt) {
    for (const pulse of circuitPulses) {
        pulse.progress += pulse.speed * dt;
        if (pulse.progress > 1) {
            // Reset to new random line
            pulse.progress = 0;
            if (circuitLines.length > 0) {
                pulse.lineIndex = Math.floor(Math.random() * circuitLines.length);
            }
        }
    }
}

// ============================================================================
// Tron Circuit Props (glowing nodes, data pylons, circuit spires)
// ============================================================================

let props = [];

/**
 * Generate Tron-style circuit props along the terrain
 */
function generateProps() {
    props = [];
    if (!heights) return;

    const propSpacing = 120;  // Minimum spacing between props
    let lastPropX = -propSpacing;

    for (let x = 100; x < width - 100; x += Math.random() * 60 + 30) {
        // Skip if too close to last prop
        if (x - lastPropX < propSpacing) continue;

        // Skip edges where terrain fades
        if (x < 200 || x > width - 200) continue;

        const terrainY = heights[Math.floor(x)];
        if (!terrainY || terrainY > canvasHeight - 100) continue;

        // Random circuit prop type
        const propType = Math.random();

        if (propType < 0.3) {
            // Data Node (hexagonal glowing node)
            props.push({
                type: 'dataNode',
                x: x,
                y: terrainY,
                radius: 8 + Math.random() * 6,
                color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
                pulsePhase: Math.random() * Math.PI * 2,
                sides: Math.random() < 0.5 ? 6 : 4  // Hex or square
            });
        } else if (propType < 0.5) {
            // Circuit Spire (vertical light bar)
            props.push({
                type: 'spire',
                x: x,
                y: terrainY,
                height: 30 + Math.random() * 50,
                width: 3 + Math.random() * 2,
                color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
                segments: 3 + Math.floor(Math.random() * 3)
            });
        } else if (propType < 0.7) {
            // Data Pylon (triangular tower with energy core)
            props.push({
                type: 'dataPylon',
                x: x,
                y: terrainY,
                height: 50 + Math.random() * 40,
                color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta,
                coreSize: 4 + Math.random() * 3
            });
        } else if (propType < 0.85) {
            // Grid Marker (small rectangular indicator)
            props.push({
                type: 'gridMarker',
                x: x,
                y: terrainY,
                width: 12 + Math.random() * 8,
                height: 4 + Math.random() * 4,
                color: Math.random() < 0.5 ? COLORS.cyan : COLORS.magenta
            });
        }
        // 15% chance of nothing

        lastPropX = x;
    }
}

/**
 * Draw all Tron circuit props
 */
function drawProps(renderer) {
    const ctx = renderer.ctx;
    const time = Date.now() / 1000;

    for (const prop of props) {
        // Check if prop is above void (terrain destroyed)
        const currentTerrainY = getHeightAt(prop.x);
        if (currentTerrainY > prop.y + 20) continue;

        switch (prop.type) {
            case 'dataNode':
                drawDataNode(renderer, prop, time);
                break;
            case 'spire':
                drawCircuitSpire(renderer, prop, time);
                break;
            case 'dataPylon':
                drawDataPylon(renderer, prop, time);
                break;
            case 'gridMarker':
                drawGridMarker(renderer, prop, time);
                break;
        }
    }
}

/**
 * Draw a hexagonal/square data node
 */
function drawDataNode(renderer, prop, time) {
    const ctx = renderer.ctx;
    const pulse = 0.7 + Math.sin(time * 3 + prop.pulsePhase) * 0.3;

    ctx.globalAlpha = 0.6 * pulse;
    renderer.setGlow(prop.color, 12);
    ctx.fillStyle = prop.color;

    if (prop.sides === 6) {
        // Hexagon
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const px = prop.x + Math.cos(angle) * prop.radius;
            const py = prop.y - prop.radius - 2 + Math.sin(angle) * prop.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    } else {
        // Square (diamond orientation)
        ctx.save();
        ctx.translate(prop.x, prop.y - prop.radius - 2);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-prop.radius * 0.7, -prop.radius * 0.7, prop.radius * 1.4, prop.radius * 1.4);
        ctx.restore();
    }

    // Inner core (brighter)
    ctx.globalAlpha = 0.9 * pulse;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(prop.x, prop.y - prop.radius - 2, prop.radius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw a vertical circuit spire
 */
function drawCircuitSpire(renderer, prop, time) {
    const ctx = renderer.ctx;
    const segmentHeight = prop.height / prop.segments;

    renderer.setGlow(prop.color, 10);

    for (let i = 0; i < prop.segments; i++) {
        const segY = prop.y - i * segmentHeight - segmentHeight;
        const pulse = 0.4 + Math.sin(time * 4 + i * 0.5) * 0.4;

        // Main segment
        ctx.globalAlpha = pulse;
        ctx.fillStyle = prop.color;
        ctx.fillRect(prop.x - prop.width / 2, segY, prop.width, segmentHeight - 4);

        // Segment cap
        ctx.globalAlpha = pulse * 1.2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(prop.x - prop.width / 2 - 1, segY, prop.width + 2, 2);
    }

    // Top beacon
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(prop.x, prop.y - prop.height - 3, 3, 0, Math.PI * 2);
    ctx.fill();

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw a data pylon (triangular tower)
 */
function drawDataPylon(renderer, prop, time) {
    const ctx = renderer.ctx;
    const pulse = 0.6 + Math.sin(time * 2) * 0.3;

    // Pylon frame (dark with glowing edges)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#0a0a15';
    ctx.beginPath();
    ctx.moveTo(prop.x, prop.y - prop.height);
    ctx.lineTo(prop.x - 12, prop.y);
    ctx.lineTo(prop.x + 12, prop.y);
    ctx.closePath();
    ctx.fill();

    // Glowing edges
    ctx.globalAlpha = 0.7;
    renderer.setGlow(prop.color, 8);
    ctx.strokeStyle = prop.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(prop.x, prop.y - prop.height);
    ctx.lineTo(prop.x - 12, prop.y);
    ctx.moveTo(prop.x, prop.y - prop.height);
    ctx.lineTo(prop.x + 12, prop.y);
    ctx.stroke();

    // Energy core
    ctx.globalAlpha = pulse;
    ctx.fillStyle = prop.color;
    ctx.beginPath();
    ctx.arc(prop.x, prop.y - prop.height * 0.4, prop.coreSize, 0, Math.PI * 2);
    ctx.fill();

    // Core center
    ctx.globalAlpha = pulse * 1.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(prop.x, prop.y - prop.height * 0.4, prop.coreSize * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Cross beam
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = prop.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(prop.x - 8, prop.y - prop.height * 0.3);
    ctx.lineTo(prop.x + 8, prop.y - prop.height * 0.3);
    ctx.stroke();

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw a small grid marker
 */
function drawGridMarker(renderer, prop, time) {
    const ctx = renderer.ctx;
    const pulse = 0.5 + Math.sin(time * 5 + prop.x * 0.01) * 0.3;

    ctx.globalAlpha = pulse;
    renderer.setGlow(prop.color, 6);
    ctx.fillStyle = prop.color;
    ctx.fillRect(prop.x - prop.width / 2, prop.y - prop.height - 2, prop.width, prop.height);

    // Center line
    ctx.globalAlpha = pulse * 1.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(prop.x - 1, prop.y - prop.height - 2, 2, prop.height);

    renderer.clearGlow();
    ctx.globalAlpha = 1;
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
    raiseJagged,
    digJagged,
    draw,
    generateProps,
    drawProps,
    updateCircuitPulses
};
