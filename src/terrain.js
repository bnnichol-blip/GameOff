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

// Biome colors (set from main.js)
let currentBiomeColors = {
    terrain: '#050510',
    edge: '#00ffff',
    voidColor: '#ff00ff'
};

// Crater tracking for hot glow effect
let craters = [];  // { x, y, radius, heat: 1.0 }

// Ceiling system for cavern overhangs
let ceilingHeights = null;  // Second heightmap for ceiling, null = no ceiling
let ceilingRegions = [];    // [{startX, endX}] for efficient queries

// Current terrain style (for display)
let currentTerrainStyle = { base: 'ROLLING_HILLS', feature: null };
let isFullCaveMode = false;  // Track if CAVES generated full coverage

// Debug visualization mode
let debugMode = false;

/**
 * Add micro-variation to make terrain less mathematically smooth
 * @param {number} x - X position
 * @param {number} amplitude - Maximum deviation
 * @param {number} frequency - How quickly it varies (higher = more jagged)
 * @returns {number} Noise value between -amplitude and +amplitude
 */
function jaggedNoise(x, amplitude = 5, frequency = 0.1) {
    // Combine multiple high-frequency sine waves for jagged effect
    const n1 = Math.sin(x * frequency) * amplitude * 0.5;
    const n2 = Math.sin(x * frequency * 2.3 + 1.7) * amplitude * 0.3;
    const n3 = Math.sin(x * frequency * 5.1 + 3.2) * amplitude * 0.2;
    return n1 + n2 + n3;
}

// ============================================================================
// Terrain Configuration
// ============================================================================

const TERRAIN_BASES = {
    ROLLING_HILLS: {
        name: 'Rolling Hills',
        weight: 1.0,
        generator: 'generateRollingHills'
    },
    CANYON: {
        name: 'Canyon',
        weight: 1.0,
        generator: 'generateCanyon'
    },
    PLATEAU: {
        name: 'Plateau',
        weight: 1.0,
        generator: 'generatePlateau'
    },
    ISLANDS: {
        name: 'Islands',
        weight: 0.7,
        generator: 'generateIslands'
    },
    CAVES: {
        name: 'Caves',
        weight: 1.2,  // Slightly more common - dedicated cave terrain
        generator: 'generateCaves'
    }
};

const TERRAIN_FEATURES = {
    PILLARS: {
        name: 'Pillars',
        weight: 1.0,
        generator: 'applyPillars'
    },
    BRIDGE: {
        name: 'Bridge',
        weight: 1.0,
        generator: 'applyBridge'
    },
    CAVERN: {
        name: 'Cavern',
        weight: 1.5,  // More common - players like caves
        generator: 'applyCavern'
    },
    STALACTITES: {
        name: 'Stalactites',
        weight: 1.0,
        generator: 'applyStalactites'
    }
};

// Compatibility matrix: which features work with which bases
const FEATURE_COMPATIBILITY = {
    ROLLING_HILLS: ['PILLARS', 'BRIDGE', 'CAVERN'],
    CANYON: ['PILLARS', 'BRIDGE', 'CAVERN'],  // Added cavern - canyon with overhang
    PLATEAU: ['PILLARS', 'CAVERN', 'STALACTITES'],
    ISLANDS: ['BRIDGE', 'CAVERN'],  // Added cavern - floating islands with overhangs
    CAVES: ['STALACTITES']  // Caves always have ceiling, stalactites add detail
};

// ============================================================================
// Terrain Style Selection
// ============================================================================

/**
 * Select a random terrain style (base + optional feature)
 * @returns {{base: string, feature: string|null}}
 */
function selectTerrainStyle() {
    // Pick random base weighted by probability
    const baseKeys = Object.keys(TERRAIN_BASES);
    const baseTotalWeight = baseKeys.reduce((sum, key) => sum + TERRAIN_BASES[key].weight, 0);
    let baseRoll = Math.random() * baseTotalWeight;
    let selectedBase = baseKeys[0];

    for (const key of baseKeys) {
        baseRoll -= TERRAIN_BASES[key].weight;
        if (baseRoll <= 0) {
            selectedBase = key;
            break;
        }
    }

    // 75% chance to add a compatible feature
    let selectedFeature = null;
    if (Math.random() < 0.75) {
        const compatibleFeatures = FEATURE_COMPATIBILITY[selectedBase];
        if (compatibleFeatures && compatibleFeatures.length > 0) {
            // Pick random compatible feature weighted by probability
            const featureTotalWeight = compatibleFeatures.reduce(
                (sum, key) => sum + TERRAIN_FEATURES[key].weight, 0
            );
            let featureRoll = Math.random() * featureTotalWeight;

            for (const key of compatibleFeatures) {
                featureRoll -= TERRAIN_FEATURES[key].weight;
                if (featureRoll <= 0) {
                    selectedFeature = key;
                    break;
                }
            }
        }
    }

    return { base: selectedBase, feature: selectedFeature };
}

/**
 * Get the display name for current terrain style
 * @returns {string}
 */
export function getTerrainStyleName() {
    let baseName = TERRAIN_BASES[currentTerrainStyle.base]?.name || 'Unknown';

    // Special name for full cave mode
    if (currentTerrainStyle.base === 'CAVES' && isFullCaveMode) {
        baseName = 'Deep Cavern';
    }

    if (currentTerrainStyle.feature) {
        const featureName = TERRAIN_FEATURES[currentTerrainStyle.feature]?.name || '';
        return `${baseName} + ${featureName}`;
    }
    return baseName;
}

// ============================================================================
// Generation
// ============================================================================

/**
 * Generate procedural terrain with random style selection
 * @param {number} terrainWidth - Width of terrain (should match canvas width)
 * @param {number} terrainHeight - Height of canvas (for clamping)
 * @param {number[]} spawnXs - Array of X positions to balance for spawns
 * @param {number} edgeMargin - Margin at edges to fade terrain down
 */
export function generate(terrainWidth, terrainHeight = 900, spawnXs = [], edgeMargin = 100) {
    width = terrainWidth;
    canvasHeight = terrainHeight;
    heights = new Float32Array(width);

    // Reset ceiling system
    ceilingHeights = null;
    ceilingRegions = [];
    isFullCaveMode = false;

    // Select random terrain style
    currentTerrainStyle = selectTerrainStyle();
    console.log(`[TERRAIN] Generating: ${getTerrainStyleName()}`);

    // Generate base terrain shape
    switch (currentTerrainStyle.base) {
        case 'CANYON':
            generateCanyon();
            break;
        case 'PLATEAU':
            generatePlateau();
            break;
        case 'ISLANDS':
            generateIslands();
            break;
        case 'CAVES':
            generateCaves();
            break;
        case 'ROLLING_HILLS':
        default:
            generateRollingHills();
            break;
    }

    // Apply edge fade to all terrain types
    applyEdgeFade(edgeMargin);

    // Apply feature if selected
    if (currentTerrainStyle.feature) {
        switch (currentTerrainStyle.feature) {
            case 'PILLARS':
                applyPillars(spawnXs);
                break;
            case 'BRIDGE':
                applyBridge();
                break;
            case 'CAVERN':
                applyCavern();
                break;
            case 'STALACTITES':
                applyStalactites();
                break;
        }
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

// ============================================================================
// Base Shape Generators
// ============================================================================

/**
 * Generate rolling hills using layered sine waves with jagged micro-variation
 */
function generateRollingHills() {
    const baseY = canvasHeight * 0.6;

    // Randomize phase offsets for each sine layer
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const phase3 = Math.random() * Math.PI * 2;

    // Randomize amplitudes within reasonable ranges
    const amp1 = 60 + Math.random() * 40;   // 60-100 (large hills)
    const amp2 = 30 + Math.random() * 25;   // 30-55 (medium variation)
    const amp3 = 10 + Math.random() * 15;   // 10-25 (small bumps)

    // Randomize frequencies slightly
    const freq1 = 0.004 + Math.random() * 0.002;
    const freq2 = 0.012 + Math.random() * 0.006;
    const freq3 = 0.03 + Math.random() * 0.02;

    for (let x = 0; x < width; x++) {
        let y = baseY
            + amp1 * Math.sin(x * freq1 + phase1)
            + amp2 * Math.sin(x * freq2 + phase2)
            + amp3 * Math.sin(x * freq3 + phase3)
            + jaggedNoise(x, 6, 0.1);  // Add micro-variation for natural feel

        // Clamp to valid range
        heights[x] = Math.max(canvasHeight * 0.25, Math.min(y, canvasHeight - 100));
    }
}

/**
 * Generate canyon - multi-tiered trench with jagged walls and strategic ledges
 */
function generateCanyon() {
    const plateauY = canvasHeight * 0.4;  // Higher base for plateaus
    const canyonDepth = 220 + Math.random() * 100;  // 220-320px deep
    const canyonWidth = 0.28 + Math.random() * 0.15;  // 28-43% of width

    // Create multiple tiers for the canyon
    const numTiers = 2 + Math.floor(Math.random() * 2);  // 2-3 tiers
    const tierHeights = [];
    for (let i = 0; i < numTiers; i++) {
        tierHeights.push(canyonDepth * (i + 1) / (numTiers + 1));
    }

    // Random ledge positions (2-4 ledges per side)
    const numLedges = 2 + Math.floor(Math.random() * 3);
    const ledges = [];
    for (let i = 0; i < numLedges; i++) {
        const ledgeDepth = 0.2 + Math.random() * 0.6;  // 20-80% down the canyon wall
        const ledgeSide = Math.random() < 0.5 ? 'left' : 'right';
        const ledgeWidth = 40 + Math.random() * 60;  // 40-100px wide
        ledges.push({ depth: ledgeDepth, side: ledgeSide, width: ledgeWidth });
    }

    const noisePhase = Math.random() * Math.PI * 2;
    const noisePhase2 = Math.random() * Math.PI * 2;

    for (let x = 0; x < width; x++) {
        const normalizedX = x / width;
        const distFromCenter = Math.abs(normalizedX - 0.5) / 0.5;  // 0 at center, 1 at edges
        const isLeftSide = normalizedX < 0.5;

        let y;
        if (distFromCenter < canyonWidth) {
            // Inside canyon - multi-tiered with jagged walls
            const canyonProgress = distFromCenter / canyonWidth;  // 0 at center, 1 at canyon edge

            // Find which tier we're on
            let tierY = plateauY + canyonDepth;  // Canyon floor
            for (let i = tierHeights.length - 1; i >= 0; i--) {
                const tierProgress = tierHeights[i] / canyonDepth;
                if (canyonProgress > tierProgress) {
                    // We're on this tier
                    tierY = plateauY + tierHeights[i];
                    break;
                }
            }

            // Add jagged vertical wall effect
            const wallJagged = jaggedNoise(x, 8, 0.12);   // Reduced from 15
            const wallJagged2 = jaggedNoise(x, 4, 0.3);  // Reduced from 8

            // Check for ledges
            let onLedge = false;
            for (const ledge of ledges) {
                const ledgeCanyonPos = canyonWidth * ledge.depth;
                const ledgeDist = Math.abs(canyonProgress - ledgeCanyonPos);
                const matchesSide = (isLeftSide && ledge.side === 'left') || (!isLeftSide && ledge.side === 'right');
                if (matchesSide && ledgeDist < ledge.width / (width * canyonWidth)) {
                    onLedge = true;
                    tierY = plateauY + canyonDepth * ledge.depth - 20;  // Ledge height
                    break;
                }
            }

            y = tierY + wallJagged + wallJagged2;
        } else {
            // Plateau sides with more interesting variation
            const noise = Math.sin(x * 0.02 + noisePhase) * 30;
            const jagged = jaggedNoise(x, 10, 0.08);
            y = plateauY + noise + jagged;
        }

        heights[x] = Math.max(canvasHeight * 0.2, Math.min(y, canvasHeight - 100));
    }
}

/**
 * Generate plateau - flat elevated sections connected by vertical jagged cliffs
 */
function generatePlateau() {
    const numPlateaus = 3 + Math.floor(Math.random() * 2);  // 3-4 plateaus
    const plateaus = [];

    // Generate plateau definitions
    const segmentWidth = width / numPlateaus;
    for (let i = 0; i < numPlateaus; i++) {
        const baseHeight = canvasHeight * (0.35 + Math.random() * 0.3);  // 35-65% down
        plateaus.push({
            startX: i * segmentWidth,
            endX: (i + 1) * segmentWidth,
            height: baseHeight,
            noise: Math.random() * Math.PI * 2
        });
    }

    // Shuffle heights to avoid predictable staircase
    for (let i = plateaus.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tempHeight = plateaus[i].height;
        plateaus[i].height = plateaus[j].height;
        plateaus[j].height = tempHeight;
    }

    // Generate terrain with VERTICAL jagged cliffs instead of smooth ramps
    const cliffWidth = 15 + Math.random() * 20;  // 15-35px cliff transition (much steeper!)

    for (let x = 0; x < width; x++) {
        // Find which plateau we're on
        let currentPlateau = plateaus[0];
        let nextPlateau = null;

        for (let i = 0; i < plateaus.length; i++) {
            if (x >= plateaus[i].startX && x < plateaus[i].endX) {
                currentPlateau = plateaus[i];
                nextPlateau = plateaus[i + 1] || null;
                break;
            }
        }

        // Check if we're in a cliff zone
        const distToEnd = currentPlateau.endX - x;
        let y;

        if (nextPlateau && distToEnd < cliffWidth) {
            // In cliff zone - near-vertical with jagged face
            const cliffProgress = 1 - (distToEnd / cliffWidth);
            // Use very steep step function instead of smoothstep
            // Steep but not instant - transition over 20% of cliff width
            const steepProgress = Math.min(1, Math.max(0, (cliffProgress - 0.4) * 5));
            const jaggedOffset = jaggedNoise(x, 10, 0.25);  // Reduced amplitude, softer cliffs

            // Blend between heights with jitter
            const baseY = currentPlateau.height * (1 - steepProgress) + nextPlateau.height * steepProgress;
            y = baseY + jaggedOffset * (1 - Math.abs(steepProgress - 0.5) * 2);  // Max jitter at midpoint
        } else {
            // On plateau - mostly flat with micro-variation
            const noise = Math.sin(x * 0.05 + currentPlateau.noise) * 10;
            const jagged = jaggedNoise(x, 5, 0.1);
            y = currentPlateau.height + noise + jagged;
        }

        heights[x] = Math.max(canvasHeight * 0.2, Math.min(y, canvasHeight - 100));
    }
}

/**
 * Generate islands - TRUE floating islands with gaps to the void
 * Islands have tiered heights and actual void gaps between them
 */
function generateIslands() {
    const numIslands = 3 + Math.floor(Math.random() * 3);  // 3-5 islands
    const islands = [];

    // TRUE void gap - way below screen so gaps go to void
    const voidGapY = canvasHeight + 500;  // Deep gap to void

    // Height tiers for variety
    const heightTiers = [
        canvasHeight * 0.3,   // High islands
        canvasHeight * 0.45,  // Medium islands
        canvasHeight * 0.55   // Low islands (closer to void)
    ];

    // Generate island definitions with spacing
    const totalWidth = width - 400;  // Leave margins
    const avgIslandWidth = totalWidth / numIslands;

    let currentX = 200;  // Start margin
    for (let i = 0; i < numIslands; i++) {
        const islandWidth = avgIslandWidth * (0.5 + Math.random() * 0.7);  // 50-120% of average
        const gapWidth = 120 + Math.random() * 100;  // 120-220px gaps (wider for floating effect)

        // Assign random height tier
        const tier = Math.floor(Math.random() * heightTiers.length);
        const peakHeight = heightTiers[tier] + (Math.random() - 0.5) * 60;  // ±30px variation

        islands.push({
            centerX: currentX + islandWidth / 2,
            width: islandWidth,
            peakY: peakHeight,
            tier: tier,
            noise: Math.random() * Math.PI * 2
        });

        currentX += islandWidth + gapWidth;
    }

    // Generate terrain with TRUE gaps
    for (let x = 0; x < width; x++) {
        let y = voidGapY;  // Default to void gap (NOT clamped!)
        let onIsland = false;

        // Check each island
        for (const island of islands) {
            const distFromCenter = Math.abs(x - island.centerX);
            const halfWidth = island.width / 2;

            if (distFromCenter < halfWidth) {
                onIsland = true;
                // On this island - sharper edges for floating look
                const normalizedDist = distFromCenter / halfWidth;

                // Use steeper falloff at edges (floating island look)
                const edgeFalloff = 0.85;  // Start dropping at 85% from center
                let islandShape;
                if (normalizedDist < edgeFalloff) {
                    // Flat-ish top
                    islandShape = 1;
                } else {
                    // Sharp drop at edges
                    const edgeProgress = (normalizedDist - edgeFalloff) / (1 - edgeFalloff);
                    islandShape = 1 - Math.pow(edgeProgress, 1.5);
                }

                const noise = Math.sin(x * 0.04 + island.noise) * 12;
                const jagged = jaggedNoise(x, 8, 0.12);
                const islandY = island.peakY + (1 - islandShape) * 200 + noise + jagged;

                // Take the higher ground (lower Y value)
                y = Math.min(y, islandY);
            }
        }

        // Only clamp if we're ON an island - gaps stay as void
        if (onIsland) {
            heights[x] = Math.max(canvasHeight * 0.2, Math.min(y, canvasHeight - 80));
        } else {
            // TRUE void gap - don't clamp, let it fall to void
            heights[x] = voidGapY;
        }
    }
}

/**
 * Generate caves - MASSIVE caverns with stalagmites and tunnel-like full cave mode
 * This is a dedicated cave terrain type with multiple overhang regions
 * 30% chance to generate FULL CAVE (ceiling spans entire map like a tunnel)
 */
function generateCaves() {
    // Start with rolling hills base - lower for more cave headroom
    const baseY = canvasHeight * 0.6;  // Lower base for massive cave space

    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;

    const amp1 = 40 + Math.random() * 25;
    const amp2 = 15 + Math.random() * 15;

    const freq1 = 0.004 + Math.random() * 0.002;
    const freq2 = 0.012 + Math.random() * 0.006;

    for (let x = 0; x < width; x++) {
        let y = baseY
            + amp1 * Math.sin(x * freq1 + phase1)
            + amp2 * Math.sin(x * freq2 + phase2)
            + jaggedNoise(x, 12, 0.08);  // Add jagged micro-variation

        heights[x] = Math.max(canvasHeight * 0.35, Math.min(y, canvasHeight - 100));
    }

    // Initialize ceiling
    ceilingHeights = new Float32Array(width);
    ceilingHeights.fill(0);
    ceilingRegions = [];

    // 30% chance for FULL CAVE - tunnel system spanning entire map
    isFullCaveMode = Math.random() < 0.3;

    if (isFullCaveMode) {
        // Full cave - massive tunnel spanning 100% of playable area
        const regionStartX = 100;  // Tighter margins for full tunnel feel
        const regionEndX = width - 100;
        ceilingRegions.push({ startX: regionStartX, endX: regionEndX });

        // Gap height: 180-280px - still impressive but more stable
        const gapHeight = 180 + Math.random() * 100;
        const noisePhase = Math.random() * Math.PI * 2;
        const noisePhase2 = Math.random() * Math.PI * 2;
        const noisePhase3 = Math.random() * Math.PI * 2;

        for (let x = Math.floor(regionStartX); x <= Math.ceil(regionEndX); x++) {
            if (x < 0 || x >= width) continue;

            // Very gentle taper only at extreme edges
            const distFromStart = x - regionStartX;
            const distFromEnd = regionEndX - x;
            const edgeDist = Math.min(distFromStart, distFromEnd);
            const edgeFade = Math.min(1, edgeDist / 80);

            const terrainY = heights[x];
            const baseCeilingY = terrainY - gapHeight;

            // Three layers of noise for stalactite-like ceiling
            const noise1 = Math.sin(x * 0.015 + noisePhase) * 40;
            const noise2 = Math.sin(x * 0.04 + noisePhase2) * 20;
            const stalactiteNoise = jaggedNoise(x, 12, 0.15);  // Reduced stalactite jaggedness
            const taperAmount = (1 - edgeFade) * 60;

            ceilingHeights[x] = baseCeilingY + noise1 + noise2 + stalactiteNoise - taperAmount;
        }

        // Add STALAGMITES (pillars rising from floor) for full cave
        const numStalagmites = 3 + Math.floor(Math.random() * 4);  // 3-6 stalagmites
        for (let i = 0; i < numStalagmites; i++) {
            const stalagX = regionStartX + 200 + Math.random() * (regionEndX - regionStartX - 400);
            const stalagWidth = 30 + Math.random() * 50;  // 30-80px wide
            const stalagHeight = 80 + Math.random() * 120;  // 80-200px tall

            for (let x = Math.floor(stalagX - stalagWidth / 2); x <= Math.ceil(stalagX + stalagWidth / 2); x++) {
                if (x < 0 || x >= width) continue;
                const distFromCenter = Math.abs(x - stalagX) / (stalagWidth / 2);
                if (distFromCenter < 1) {
                    // Triangular stalagmite shape
                    const stalagShape = 1 - distFromCenter;
                    const reduction = stalagHeight * stalagShape;
                    heights[x] = Math.max(heights[x] - reduction, ceilingHeights[x] + 50);  // Don't touch ceiling
                }
            }
        }

        console.log('[TERRAIN] Generated MASSIVE TUNNEL SYSTEM - 100% ceiling coverage!');
    } else {
        // Normal caves - 2-4 separate overhang regions with larger gaps
        const numOverhangs = 2 + Math.floor(Math.random() * 3);
        const regionMinWidth = 350;
        const regionMaxWidth = 700;
        const sectionWidth = (width - 400) / numOverhangs;

        for (let i = 0; i < numOverhangs; i++) {
            const sectionStart = 200 + i * sectionWidth;
            const regionWidth = regionMinWidth + Math.random() * (regionMaxWidth - regionMinWidth);
            const regionStartX = sectionStart + Math.random() * (sectionWidth - regionWidth);
            const regionEndX = Math.min(regionStartX + regionWidth, width - 200);

            if (regionEndX <= regionStartX + 100) continue;

            ceilingRegions.push({ startX: regionStartX, endX: regionEndX });

            // Gap height: 180-280px - still impressive but more stable
            const gapHeight = 180 + Math.random() * 100;
            const noisePhase = Math.random() * Math.PI * 2;

            for (let x = Math.floor(regionStartX); x <= Math.ceil(regionEndX); x++) {
                if (x < 0 || x >= width) continue;

                const distFromStart = x - regionStartX;
                const distFromEnd = regionEndX - x;
                const edgeDist = Math.min(distFromStart, distFromEnd);
                const edgeFade = Math.min(1, edgeDist / 100);

                const terrainY = heights[x];
                const baseCeilingY = terrainY - gapHeight;
                const noise = Math.sin(x * 0.025 + noisePhase) * 30;
                const stalactiteNoise = jaggedNoise(x, 10, 0.12);  // Reduced
                const taperAmount = (1 - edgeFade) * 120;

                ceilingHeights[x] = baseCeilingY + noise + stalactiteNoise - taperAmount;
            }

            // Add 1-2 stalagmites per cavern region
            const numRegionStalagmites = 1 + Math.floor(Math.random() * 2);
            for (let s = 0; s < numRegionStalagmites; s++) {
                const stalagX = regionStartX + 50 + Math.random() * (regionWidth - 100);
                const stalagWidth = 25 + Math.random() * 40;
                const stalagHeight = 60 + Math.random() * 100;

                for (let x = Math.floor(stalagX - stalagWidth / 2); x <= Math.ceil(stalagX + stalagWidth / 2); x++) {
                    if (x < 0 || x >= width) continue;
                    const distFromCenter = Math.abs(x - stalagX) / (stalagWidth / 2);
                    if (distFromCenter < 1) {
                        const stalagShape = 1 - distFromCenter;
                        const reduction = stalagHeight * stalagShape;
                        const minHeight = ceilingHeights[x] > 0 ? ceilingHeights[x] + 40 : canvasHeight * 0.25;
                        heights[x] = Math.max(heights[x] - reduction, minHeight);
                    }
                }
            }
        }
    }

    // Validate ceiling/floor separation after generation
    validateCeilingFloorSeparation();
}

/**
 * Apply edge fade to push terrain down at screen edges
 * RESPECTS void gaps in Islands mode - doesn't fill in intentional gaps
 */
function applyEdgeFade(edgeMargin) {
    const edgeFadeZone = Math.max(edgeMargin, 150);

    // Check if we're in Islands mode by looking for void-level gaps
    const voidThreshold = canvasHeight + 200;  // Heights above this are intentional void gaps
    const isIslandsMode = currentTerrainStyle.base === 'ISLANDS';

    for (let x = 0; x < width; x++) {
        let y = heights[x];

        // In Islands mode, preserve void gaps - only fade actual terrain
        if (isIslandsMode && y > voidThreshold) {
            continue;  // Skip - this is an intentional void gap
        }

        if (x < edgeFadeZone) {
            const fade = x / edgeFadeZone;
            const fadeCubic = fade * fade * fade;
            y = canvasHeight + 100 - (canvasHeight + 100 - y) * fadeCubic;
        } else if (x > width - edgeFadeZone) {
            const fade = (width - x) / edgeFadeZone;
            const fadeCubic = fade * fade * fade;
            y = canvasHeight + 100 - (canvasHeight + 100 - y) * fadeCubic;
        }

        heights[x] = y;
    }
}

// ============================================================================
// Feature Generators
// ============================================================================

/**
 * Apply pillars - vertical structures rising from terrain
 * @param {number[]} spawnXs - Spawn positions to avoid
 */
function applyPillars(spawnXs = []) {
    const numPillars = 3 + Math.floor(Math.random() * 4);  // 3-6 pillars
    const minSpacing = 200;
    const placedPillars = [];

    for (let i = 0; i < numPillars; i++) {
        // Try to find a valid position
        let attempts = 0;
        let pillarX = 0;
        let valid = false;

        while (!valid && attempts < 20) {
            pillarX = 300 + Math.random() * (width - 600);
            valid = true;

            // Check distance from spawns
            for (const spawnX of spawnXs) {
                if (Math.abs(pillarX - spawnX) < 150) {
                    valid = false;
                    break;
                }
            }

            // Check distance from other pillars
            for (const placed of placedPillars) {
                if (Math.abs(pillarX - placed) < minSpacing) {
                    valid = false;
                    break;
                }
            }

            attempts++;
        }

        if (!valid) continue;

        placedPillars.push(pillarX);

        // Pillar properties
        const pillarWidth = 50 + Math.random() * 40;  // 50-90px wide
        const pillarHeight = 100 + Math.random() * 80;  // 100-180px tall
        const halfWidth = pillarWidth / 2;
        const baseY = heights[Math.floor(pillarX)];
        const topY = baseY - pillarHeight;

        // Carve pillar into terrain
        for (let x = Math.floor(pillarX - halfWidth); x <= Math.ceil(pillarX + halfWidth); x++) {
            if (x < 0 || x >= width) continue;

            // Flat top with slight edge taper
            const distFromCenter = Math.abs(x - pillarX) / halfWidth;
            const taperFactor = distFromCenter > 0.8 ? (1 - distFromCenter) / 0.2 : 1;
            const adjustedTopY = topY + (1 - taperFactor) * 20;

            heights[x] = Math.min(heights[x], Math.max(adjustedTopY, canvasHeight * 0.2));
        }
    }
}

/**
 * Apply bridge - natural land bridge with EMPTY SPACE beneath
 * Uses ceiling system to create the bridge, leaving floor below open
 */
function applyBridge() {
    // Find two elevated points to connect
    const searchMargin = width * 0.2;
    let leftHighPoint = { x: 0, y: canvasHeight };
    let rightHighPoint = { x: width, y: canvasHeight };

    // Search left third for high point
    for (let x = Math.floor(searchMargin); x < width * 0.4; x += 10) {
        if (heights[x] < leftHighPoint.y) {
            leftHighPoint = { x, y: heights[x] };
        }
    }

    // Search right third for high point
    for (let x = Math.floor(width * 0.6); x < width - searchMargin; x += 10) {
        if (heights[x] < rightHighPoint.y) {
            rightHighPoint = { x, y: heights[x] };
        }
    }

    // Bridge properties
    const bridgeY = Math.min(leftHighPoint.y, rightHighPoint.y) - 40;  // Bridge surface
    const bridgeStartX = leftHighPoint.x;
    const bridgeEndX = rightHighPoint.x;
    const bridgeWidth = bridgeEndX - bridgeStartX;
    const bridgeThickness = 30 + Math.random() * 20;  // 30-50px thick

    // Only create bridge if points are far enough apart
    if (bridgeWidth < 300) return;

    // Initialize ceiling if not already done
    if (!ceilingHeights) {
        ceilingHeights = new Float32Array(width);
        ceilingHeights.fill(0);
    }

    // Create bridge as a ceiling region with empty space beneath
    ceilingRegions.push({ startX: bridgeStartX, endX: bridgeEndX });

    for (let x = Math.floor(bridgeStartX); x <= Math.ceil(bridgeEndX); x++) {
        if (x < 0 || x >= width) continue;

        const bridgeProgress = (x - bridgeStartX) / bridgeWidth;

        // Slight arch shape for visual interest
        const archOffset = Math.sin(bridgeProgress * Math.PI) * 15;

        // Taper at edges to blend with terrain
        const distFromStart = x - bridgeStartX;
        const distFromEnd = bridgeEndX - x;
        const edgeDist = Math.min(distFromStart, distFromEnd);
        const edgeFade = Math.min(1, edgeDist / 60);

        // Bridge bottom (what you walk on) - this becomes the ceiling for the space below
        const bridgeBottom = bridgeY + bridgeThickness + archOffset;

        // Only set ceiling in the middle section (leave edges as solid terrain)
        if (edgeFade > 0.3) {
            // Set ceiling to create the underside of the bridge
            ceilingHeights[x] = bridgeBottom;

            // IMPORTANT: Push the floor DOWN to create empty space beneath
            // The floor should be significantly lower than the bridge
            const floorY = bridgeBottom + 150 + Math.random() * 50;  // 150-200px gap
            if (heights[x] < floorY) {
                heights[x] = floorY;
            }
        } else {
            // Edge zone - solid connection to terrain
            heights[x] = Math.min(heights[x], bridgeY + (1 - edgeFade) * 100);
        }
    }
}

/**
 * Apply cavern - overhang ceiling system
 */
function applyCavern() {
    // Initialize ceiling heightmap only if not already present (preserve CAVES ceiling)
    if (!ceilingHeights) {
        ceilingHeights = new Float32Array(width);
        ceilingHeights.fill(0);  // 0 = no ceiling
    }
    // DO NOT reset ceilingRegions here - will rebuild at end

    // Generate 1-2 overhang regions
    const numOverhangs = 1 + Math.floor(Math.random() * 2);
    const newRegions = [];

    for (let i = 0; i < numOverhangs; i++) {
        // Random position avoiding edges
        const regionWidth = 250 + Math.random() * 200;  // 250-450px wide
        const regionStartX = 300 + Math.random() * (width - 600 - regionWidth);
        const regionEndX = regionStartX + regionWidth;

        // Check if region overlaps with existing (check both existing and new regions)
        let overlaps = false;
        for (const existing of ceilingRegions) {
            if (regionStartX < existing.endX + 100 && regionEndX > existing.startX - 100) {
                overlaps = true;
                break;
            }
        }
        for (const existing of newRegions) {
            if (regionStartX < existing.endX + 100 && regionEndX > existing.startX - 100) {
                overlaps = true;
                break;
            }
        }
        if (overlaps) continue;

        newRegions.push({ startX: regionStartX, endX: regionEndX });

        // Calculate ceiling heights
        const gapHeight = 100 + Math.random() * 60;  // 100-160px gap between floor and ceiling
        const noisePhase = Math.random() * Math.PI * 2;

        for (let x = Math.floor(regionStartX); x <= Math.ceil(regionEndX); x++) {
            if (x < 0 || x >= width) continue;

            // Distance from region edges (for tapering)
            const distFromStart = x - regionStartX;
            const distFromEnd = regionEndX - x;
            const edgeDist = Math.min(distFromStart, distFromEnd);
            const edgeFade = Math.min(1, edgeDist / 60);  // Taper over 60px

            // Ceiling follows terrain surface with gap
            const terrainY = heights[x];
            const baseCeilingY = terrainY - gapHeight;

            // Add noise variation
            const noise = Math.sin(x * 0.04 + noisePhase) * 20;

            // Apply edge taper (ceiling rises at edges)
            const taperAmount = (1 - edgeFade) * 80;

            const newCeilingY = baseCeilingY + noise - taperAmount;
            // Merge: only update if no existing ceiling or new is lower (more visible)
            if (ceilingHeights[x] === 0 || newCeilingY > ceilingHeights[x]) {
                ceilingHeights[x] = newCeilingY;
            }
        }
    }

    // Rebuild ceiling regions from the merged height data
    rebuildCeilingRegions();
}

/**
 * Apply stalactites - pointed formations hanging from ceiling
 * Requires existing ceiling (from CAVES base or CAVERN feature)
 */
function applyStalactites() {
    if (!ceilingHeights || ceilingRegions.length === 0) {
        // No ceiling exists - create one first
        applyCavern();
    }

    // Add stalactite formations hanging from the ceiling
    const numStalactites = 8 + Math.floor(Math.random() * 8);  // 8-15 stalactites

    for (let i = 0; i < numStalactites; i++) {
        // Pick a random position within a ceiling region
        if (ceilingRegions.length === 0) continue;

        const region = ceilingRegions[Math.floor(Math.random() * ceilingRegions.length)];
        const x = region.startX + 50 + Math.random() * (region.endX - region.startX - 100);

        if (x < 0 || x >= width || ceilingHeights[Math.floor(x)] === 0) continue;

        // Stalactite properties
        const stalactiteWidth = 15 + Math.random() * 25;  // 15-40px wide
        const stalactiteLength = 30 + Math.random() * 50;  // 30-80px long
        const halfWidth = stalactiteWidth / 2;

        // Create pointed stalactite shape by lowering ceiling in a triangular pattern
        for (let sx = Math.floor(x - halfWidth); sx <= Math.ceil(x + halfWidth); sx++) {
            if (sx < 0 || sx >= width || ceilingHeights[sx] === 0) continue;

            const distFromCenter = Math.abs(sx - x) / halfWidth;
            const pointShape = 1 - distFromCenter;  // 1 at center, 0 at edges
            const extension = stalactiteLength * pointShape * pointShape;  // Squared for sharper point

            // Extend ceiling downward (increase Y value)
            ceilingHeights[sx] = Math.max(ceilingHeights[sx], ceilingHeights[sx] + extension);
        }
    }
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
 * Set the terrain height at a specific X position
 * @param {number} x - X coordinate
 * @param {number} newHeight - New height value (lower = higher terrain)
 */
export function setHeightAt(x, newHeight) {
    if (!heights || x < 0 || x >= width) return;
    const xi = Math.floor(x);
    heights[xi] = newHeight;
    syncCeilingState();
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

/**
 * Check if a point is inside a ceiling overhang
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {boolean} True if point is inside ceiling
 */
export function isPointInCeiling(x, y) {
    if (!ceilingHeights || ceilingRegions.length === 0) return false;

    const xi = Math.floor(x);
    if (xi < 0 || xi >= width) return false;

    // Check if we're in a ceiling region
    for (const region of ceilingRegions) {
        if (x >= region.startX && x <= region.endX) {
            const ceilingY = ceilingHeights[xi];

            // Ceiling now extends from Y=0 (top of screen) down to ceilingY (bottom)
            if (ceilingY > 0) {
                // Direct hit - point is within this column's ceiling
                if (y <= ceilingY && y >= 0) {
                    return true;
                }
            }

            // Check for SIDE collision - projectile at edge where this pixel has no ceiling
            // but adjacent pixels DO have ceiling (hitting the vertical wall)
            if (ceilingY === 0 || y > ceilingY) {
                // Check left neighbor
                if (xi > 0 && ceilingHeights[xi - 1] > 0) {
                    const neighborCeilingY = ceilingHeights[xi - 1];
                    // If projectile Y is within the neighbor's ceiling height, it's a side hit
                    if (y <= neighborCeilingY && y >= 0) {
                        return true;
                    }
                }
                // Check right neighbor
                if (xi < width - 1 && ceilingHeights[xi + 1] > 0) {
                    const neighborCeilingY = ceilingHeights[xi + 1];
                    if (y <= neighborCeilingY && y >= 0) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

/**
 * Get ceiling height at a given X position
 * @param {number} x - X coordinate
 * @returns {number|null} Y coordinate of ceiling bottom, or null if no ceiling
 */
export function getCeilingAt(x) {
    if (!ceilingHeights) return null;

    const xi = Math.floor(x);
    if (xi < 0 || xi >= width) return null;

    const ceilingY = ceilingHeights[xi];
    return ceilingY > 0 ? ceilingY : null;
}

/**
 * Check if there's a ceiling at a given X position
 * @param {number} x - X coordinate
 * @returns {boolean}
 */
export function hasCeilingAt(x) {
    return getCeilingAt(x) !== null;
}

/**
 * Get ceiling slope at a given X position (for bounce reflection)
 * @param {number} x - X coordinate
 * @returns {number} Slope value (rise/run) - positive means ceiling goes down to right
 */
export function getCeilingSlopeAt(x) {
    if (!ceilingHeights) return 0;

    const xi = Math.floor(x);
    if (xi < 0 || xi >= width) return 0;

    const sampleDist = 10;
    const leftX = Math.max(0, xi - sampleDist);
    const rightX = Math.min(width - 1, xi + sampleDist);

    const leftHeight = ceilingHeights[leftX] || 0;
    const rightHeight = ceilingHeights[rightX] || 0;

    // Return slope: positive means ceiling goes lower (higher Y) to the right
    return (rightHeight - leftHeight) / (rightX - leftX);
}

// ============================================================================
// Destruction
// ============================================================================

// ============================================================================
// Ceiling Cleanup Helpers
// ============================================================================

/**
 * Rebuild ceiling regions from scratch based on actual ceilingHeights data.
 * Scans the array and creates regions for contiguous spans of valid ceiling.
 * This replaces the old cleanupCeilingRegions() which could leave ghost regions.
 */
function rebuildCeilingRegions() {
    if (!ceilingHeights) {
        ceilingRegions = [];
        return;
    }

    const newRegions = [];
    let inRegion = false;
    let regionStart = 0;
    const MIN_REGION_WIDTH = 10;  // Filter tiny fragments

    for (let x = 0; x < width; x++) {
        const hasValidCeiling = ceilingHeights[x] > 0;

        if (hasValidCeiling && !inRegion) {
            regionStart = x;
            inRegion = true;
        } else if (!hasValidCeiling && inRegion) {
            if ((x - 1) - regionStart >= MIN_REGION_WIDTH) {
                newRegions.push({ startX: regionStart, endX: x - 1 });
            }
            inRegion = false;
        }
    }

    // Close final region
    if (inRegion && (width - 1) - regionStart >= MIN_REGION_WIDTH) {
        newRegions.push({ startX: regionStart, endX: width - 1 });
    }

    ceilingRegions = newRegions;
}

/**
 * Synchronize ceiling state after terrain modifications.
 * Implements skylight logic: when floor destruction meets ceiling, clear the ceiling
 * to prevent visual artifacts from layer inversion.
 *
 * NOTE: True "Worms-style" floating terrain is not possible with a 1D heightmap.
 * Each X coordinate can only store ONE floor height, so destroying the base of
 * terrain overwrites the old surface value. The ceiling system is for overhangs,
 * not floating floor chunks.
 */
function syncCeilingState() {
    if (!ceilingHeights || !heights) return;

    // Skylight logic: clear ceiling where floor has been destroyed up to meet it
    // This prevents visual glitches from layer inversion
    const minGap = 60;  // Minimum required gap between floor and ceiling

    for (let x = 0; x < width; x++) {
        if (ceilingHeights[x] > 0) {
            const gap = heights[x] - ceilingHeights[x];
            // If floor and ceiling meet or overlap, create a "skylight" (clear ceiling)
            if (gap < minGap) {
                ceilingHeights[x] = 0;
            }
        }
    }

    rebuildCeilingRegions();
}

/**
 * Validate that ceiling and floor maintain minimum separation.
 * Fixes any overlap by adjusting ceiling upward or removing it.
 */
function validateCeilingFloorSeparation() {
    if (!ceilingHeights || !heights) return;

    const minGap = 60;
    for (let x = 0; x < width; x++) {
        if (ceilingHeights[x] > 0) {
            const gap = heights[x] - ceilingHeights[x];
            if (gap < minGap) {
                // Move ceiling up to maintain minimum gap
                ceilingHeights[x] = heights[x] - minGap;

                // If ceiling would be at or above world top, remove it
                if (ceilingHeights[x] <= 20) {
                    ceilingHeights[x] = 0;
                }
            }
        }
    }
}

// ============================================================================
// Terrain Modification
// ============================================================================

/**
 * Slowly burn/erode terrain over time (for NAPALM fire fields)
 * Unlike destroy(), this is a linear erosion that affects the entire radius uniformly
 * @param {number} cx - Center X of burn area
 * @param {number} radius - Radius of burn area
 * @param {number} amount - Amount to lower terrain (in pixels)
 */
export function burn(cx, radius, amount) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    for (let x = startX; x <= endX; x++) {
        // Increment height (lower terrain) by the burn amount
        heights[x] += amount;

        // Clamp to prevent going below screen
        if (heights[x] > canvasHeight + 100) {
            heights[x] = canvasHeight + 100;
        }
    }

    // Sync ceiling state after floor modification
    syncCeilingState();
}

/**
 * Carve a semicircular crater into the terrain.
 * Scoped destruction: identifies nearest terrain layer and only modifies that one.
 * Implements skylight logic to prevent visual bugs from layer inversion.
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
            const craterTop = cy - depth;

            const floorY = heights[x];
            const hasCeiling = ceilingHeights && ceilingHeights[x] > 0;
            const ceilingY = hasCeiling ? ceilingHeights[x] : null;

            // Determine which layer is closer to the explosion center
            const distToFloor = Math.abs(cy - floorY);
            const distToCeiling = hasCeiling ? Math.abs(cy - ceilingY) : Infinity;

            // Simple logic: affect whichever layer is closer
            if (!hasCeiling || distToFloor <= distToCeiling) {
                // FLOOR DESTRUCTION: Explosion is closer to floor (or no ceiling exists)
                if (craterBottom > heights[x]) {
                    heights[x] = craterBottom;
                }
            } else {
                // CEILING DESTRUCTION: Explosion is closer to ceiling
                // Move ceiling bottom UP (decrease ceilingHeights[x]) - carving into it
                if (craterTop < ceilingHeights[x]) {
                    ceilingHeights[x] = craterTop;
                }
            }

            // Ceiling cleanup handled by syncCeilingState() skylight logic
        }
    }

    // Track crater for hot glow effect (limit to prevent memory bloat)
    if (craters.length < 50) {
        craters.push({ x: cx, y: cy, radius: radius, heat: 1.0 });
    }

    // Sync ceiling state - validates separation and rebuilds regions
    syncCeilingState();
}

// ============================================================================
// Shape-Based Terrain Destruction (for tank death craters)
// ============================================================================

/**
 * Get the depth (half-height) at a given x offset for a regular polygon
 * @param {number} dx - X distance from center
 * @param {number} radius - Outer radius of polygon
 * @param {number} sides - Number of sides (3=triangle, 4=square, 5=pentagon, etc.)
 * @param {number} rotation - Rotation in radians (0 = point up for odd sides)
 * @returns {number} - The depth at this x position, or 0 if outside shape
 */
function getPolygonDepth(dx, radius, sides, rotation = 0) {
    const absDx = Math.abs(dx);
    if (absDx > radius) return 0;

    // For a regular polygon, we approximate the shape by finding
    // which "slice" of the polygon this x position falls into
    // and calculating the y extent at that slice

    // Calculate the angle step between vertices
    const angleStep = (Math.PI * 2) / sides;

    // For each slice of the polygon, find the edges
    let maxDepth = 0;

    for (let i = 0; i < sides; i++) {
        // Get angles of two adjacent vertices
        const angle1 = rotation + i * angleStep - Math.PI / 2;
        const angle2 = rotation + (i + 1) * angleStep - Math.PI / 2;

        // Get vertex positions
        const x1 = Math.cos(angle1) * radius;
        const y1 = Math.sin(angle1) * radius;
        const x2 = Math.cos(angle2) * radius;
        const y2 = Math.sin(angle2) * radius;

        // Check if our dx is between these two x values
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);

        if (dx >= minX && dx <= maxX && maxX !== minX) {
            // Interpolate to find y at this x
            const t = (dx - x1) / (x2 - x1);
            const yAtX = y1 + t * (y2 - y1);
            maxDepth = Math.max(maxDepth, Math.abs(yAtX));
        }
    }

    // Also check the simple approximation using inscribed circle
    // This helps fill in any gaps from the edge calculation
    const inscribedRadius = radius * Math.cos(Math.PI / sides);
    if (absDx <= inscribedRadius) {
        const circleDepth = Math.sqrt(inscribedRadius * inscribedRadius - dx * dx);
        maxDepth = Math.max(maxDepth, circleDepth * 0.9);
    }

    return maxDepth;
}

/**
 * Get the depth at a given x offset for a 5-pointed star shape
 * @param {number} dx - X distance from center
 * @param {number} radius - Outer radius of star (to tips)
 * @returns {number} - The depth at this x position, or 0 if outside shape
 */
function getStarDepth(dx, radius) {
    const absDx = Math.abs(dx);
    if (absDx > radius) return 0;

    // Inner radius is about 38% of outer for a classic 5-pointed star
    const innerRadius = radius * 0.38;

    // Star has 5 outer points and 5 inner points
    // We'll approximate by checking the envelope
    const outerAngle = Math.PI * 2 / 5;  // 72 degrees between points

    let maxDepth = 0;

    // Check each of the 10 segments (5 outer edges + 5 inner edges)
    for (let i = 0; i < 5; i++) {
        // Outer point angle (starting from top, going clockwise)
        const outerAng = -Math.PI / 2 + i * outerAngle;
        // Inner point angles (between outer points)
        const innerAng1 = outerAng + outerAngle / 2;
        const innerAng2 = outerAng - outerAngle / 2;

        // Outer point position
        const ox = Math.cos(outerAng) * radius;
        const oy = Math.sin(outerAng) * radius;

        // Inner point positions
        const ix1 = Math.cos(innerAng1) * innerRadius;
        const iy1 = Math.sin(innerAng1) * innerRadius;
        const ix2 = Math.cos(innerAng2) * innerRadius;
        const iy2 = Math.sin(innerAng2) * innerRadius;

        // Check edge from inner point to outer point
        const checkEdge = (x1, y1, x2, y2) => {
            const minX = Math.min(x1, x2);
            const maxX = Math.max(x1, x2);
            if (dx >= minX && dx <= maxX && maxX !== minX) {
                const t = (dx - x1) / (x2 - x1);
                const yAtX = y1 + t * (y2 - y1);
                return Math.abs(yAtX);
            }
            return 0;
        };

        maxDepth = Math.max(maxDepth, checkEdge(ix2, iy2, ox, oy));  // Leading edge
        maxDepth = Math.max(maxDepth, checkEdge(ox, oy, ix1, iy1));  // Trailing edge
    }

    // Ensure the center area is filled (inner pentagon)
    if (absDx <= innerRadius * 0.8) {
        const centerDepth = Math.sqrt(innerRadius * innerRadius * 0.64 - dx * dx);
        maxDepth = Math.max(maxDepth, centerDepth);
    }

    return maxDepth;
}

/**
 * Get the depth at a given x offset for a diamond shape
 * @param {number} dx - X distance from center
 * @param {number} radius - Radius to the tips of the diamond
 * @returns {number} - The depth at this x position, or 0 if outside shape
 */
function getDiamondDepth(dx, radius) {
    const absDx = Math.abs(dx);
    if (absDx > radius) return 0;

    // Diamond is a rhombus - linear slope from center to edge
    // Depth at center = radius, depth at edge = 0
    return radius - absDx;
}

/**
 * Destroy terrain in a specific shape (for tank death craters)
 * @param {number} cx - Center X of destruction
 * @param {number} cy - Center Y of destruction
 * @param {number} radius - Radius of the shape
 * @param {string} shape - Shape type: 'circle', 'triangle', 'star', 'diamond', 'polygon', 'hexagon'
 * @param {number} sides - Number of sides for polygon shapes (default 6)
 */
export function destroyShape(cx, cy, radius, shape = 'circle', sides = 6) {
    if (!heights) return;

    const startX = Math.max(0, Math.floor(cx - radius));
    const endX = Math.min(width - 1, Math.ceil(cx + radius));

    for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        let depth = 0;

        // Calculate depth based on shape type
        switch (shape) {
            case 'circle':
                // Standard circular crater (same as destroy())
                if (Math.abs(dx) <= radius) {
                    depth = Math.sqrt(radius * radius - dx * dx);
                }
                break;

            case 'triangle':
                // Equilateral triangle pointing up
                depth = getPolygonDepth(dx, radius, 3, 0);
                break;

            case 'star':
                // 5-pointed star
                depth = getStarDepth(dx, radius);
                break;

            case 'diamond':
                // Diamond/rhombus shape
                depth = getDiamondDepth(dx, radius);
                break;

            case 'polygon':
                // Regular polygon with specified sides
                depth = getPolygonDepth(dx, radius, sides, 0);
                break;

            case 'hexagon':
                // Hexagon (6-sided polygon, flat top)
                depth = getPolygonDepth(dx, radius, 6, Math.PI / 6);
                break;

            case 'square':
                // Square crater
                depth = getPolygonDepth(dx, radius * 0.9, 4, Math.PI / 4);
                break;

            default:
                // Fallback to circle
                if (Math.abs(dx) <= radius) {
                    depth = Math.sqrt(radius * radius - dx * dx);
                }
        }

        if (depth <= 0) continue;

        const craterBottom = cy + depth;
        const craterTop = cy - depth;

        const floorY = heights[x];
        const hasCeiling = ceilingHeights && ceilingHeights[x] > 0;
        const ceilingY = hasCeiling ? ceilingHeights[x] : null;

        // Determine which layer is closer to the explosion center
        const distToFloor = Math.abs(cy - floorY);
        const distToCeiling = hasCeiling ? Math.abs(cy - ceilingY) : Infinity;

        // Affect whichever layer is closer
        if (!hasCeiling || distToFloor <= distToCeiling) {
            // FLOOR DESTRUCTION
            if (craterBottom > heights[x]) {
                heights[x] = craterBottom;
            }
        } else {
            // CEILING DESTRUCTION
            if (craterTop < ceilingHeights[x]) {
                ceilingHeights[x] = craterTop;
            }
        }
    }

    // Track crater for hot glow effect
    if (craters.length < 50) {
        craters.push({ x: cx, y: cy, radius: radius, heat: 1.0 });
    }

    // Sync ceiling state
    syncCeilingState();
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

    // Sync ceiling state after floor modification
    syncCeilingState();
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
    // Peak height - go high! (doubled for more impact)
    const peakHeight = radius * 3.6;

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

    // Sync ceiling state after floor modification
    syncCeilingState();
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

        // Base crater shape (deepest in center) - doubled for more impact
        const distFromCenter = Math.abs(jx - cx) / radius;
        let baseDepth = (1 - distFromCenter * distFromCenter) * radius * 3.0;

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

    // Sync ceiling state after floor modification
    syncCeilingState();
}

// ============================================================================
// Void Cannon Carving - cuts straight down to void
// ============================================================================

/**
 * Carve a vertical column straight down to the void
 * Used by VOID_CANNON to cut through all terrain
 * @param {number} cx - Center X of the beam
 * @param {number} beamWidth - Width of the beam column
 * @param {number} voidY - The void level to carve down to
 */
export function carveToVoid(cx, beamWidth, voidY) {
    if (!heights) return;

    const halfWidth = beamWidth / 2;
    const startX = Math.max(0, Math.floor(cx - halfWidth));
    const endX = Math.min(width - 1, Math.ceil(cx + halfWidth));

    // Carve each column down to void with jagged edges
    for (let x = startX; x <= endX; x++) {
        // Distance from beam center (0-1)
        const distFromCenter = Math.abs(x - cx) / halfWidth;

        // Core of beam goes all the way to void
        // Edges taper off with some randomness
        let targetDepth;
        if (distFromCenter < 0.6) {
            // Core - full depth to void
            targetDepth = voidY + 50;
        } else {
            // Edge - jagged taper
            const edgeFalloff = (distFromCenter - 0.6) / 0.4;
            const jitter = (Math.random() - 0.5) * 100;
            targetDepth = voidY + 50 - (edgeFalloff * 400) + jitter;
        }

        // Only lower terrain, never raise it
        if (targetDepth > heights[x]) {
            heights[x] = Math.min(targetDepth, voidY + 50);
        }
    }

    // Sync ceiling state after floor modification
    syncCeilingState();
}

// ============================================================================
// Fissure/Trench Carving (QUAKE weapon)
// ============================================================================

/**
 * Carve a jagged fissure/trench into the terrain
 * @param {number} cx - Center X of fissure origin
 * @param {number} cy - Center Y of fissure origin
 * @param {number} length - Total length of fissure (extends both directions)
 * @param {number} depth - Maximum depth of fissure at center
 * @param {number} angle - Optional direction angle in radians (default: 0 = horizontal)
 */
export function carveFissure(cx, cy, length, depth, angle = 0) {
    if (!heights) return [];

    // For radial cracks, we trace along the angle direction
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Generate jagged fissure points along the direction
    const fissurePoints = [];
    const numJags = 12 + Math.floor(Math.random() * 8);  // 12-20 jagged points

    for (let i = 0; i <= numJags; i++) {
        const t = i / numJags;
        const dist = t * length;  // Distance from center along the crack

        // Position along the crack direction
        const jx = cx + cosA * dist;
        const jy = cy + sinA * dist;

        // Fissure is deepest at center (t=0), tapers at end (t=1)
        let baseDepth = (1 - t * t) * depth;

        // Add jagged variation
        const jitter = (Math.random() - 0.4) * depth * 0.5;
        baseDepth = Math.max(5, baseDepth + jitter);

        fissurePoints.push({ x: jx, y: jy, depth: baseDepth });
    }

    // Apply fissure to terrain (only affects heights where crack intersects)
    for (const fp of fissurePoints) {
        const x = Math.floor(fp.x);
        if (x < 0 || x >= width) continue;

        const terrainY = heights[x];
        const fissureBottom = terrainY + fp.depth;

        // Only lower terrain, never raise it
        if (fissureBottom > heights[x]) {
            heights[x] = fissureBottom;
        }
    }

    // Sync ceiling state after floor modification
    syncCeilingState();

    // Return fissure points for visual effects
    return fissurePoints.map(p => ({
        x: p.x,
        y: getHeightAt(Math.floor(p.x))
    }));
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
 * Set biome colors for terrain rendering
 * @param {Object} biome - Biome object with terrain, edge, voidColor properties
 */
export function setBiomeColors(biome) {
    if (biome) {
        currentBiomeColors.terrain = biome.terrain || '#050510';
        currentBiomeColors.edge = biome.edge || '#00ffff';
        currentBiomeColors.voidColor = biome.voidColor || '#ff00ff';
    }
}

/**
 * Update crater heat decay (call each frame)
 * @param {number} dt - Delta time in seconds
 */
export function updateCraters(dt) {
    for (let i = craters.length - 1; i >= 0; i--) {
        craters[i].heat *= 0.98;  // Decay heat
        if (craters[i].heat < 0.05) {
            craters.splice(i, 1);  // Remove cold craters
        }
    }
}

/**
 * Draw the terrain with Tron circuit board aesthetic
 * @param {Renderer} renderer - The renderer instance
 * @param {number} voidY - Current void Y position for corruption effect
 */
export function draw(renderer, voidY = 9999) {
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

    // Biome-aware terrain fill
    ctx.fillStyle = currentBiomeColors.terrain;
    ctx.fill();

    // Draw contour layers (depth effect)
    drawContourLayers(renderer);

    // Draw circuit traces
    drawCircuitTraces(renderer);

    // Draw circuit nodes
    drawCircuitNodes(renderer);

    // Draw animated pulses
    drawCircuitPulses(renderer);

    // Draw crater glow effects (hot edges from recent explosions)
    drawCraterGlow(renderer);

    // Draw void corruption effect (near void edge)
    drawVoidCorruption(renderer, voidY);

    // Draw ceiling overhangs if present
    drawCeiling(renderer);

    // Glowing edge line (biome-aware)
    const edgeColor = currentBiomeColors.edge;
    renderer.setGlow(edgeColor, 20);
    ctx.beginPath();
    ctx.moveTo(0, heights[0]);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x]);
    }
    ctx.strokeStyle = edgeColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    renderer.clearGlow();

    // Secondary edge glow (void color, slightly offset)
    const secondaryColor = currentBiomeColors.voidColor;
    ctx.globalAlpha = 0.3;
    renderer.setGlow(secondaryColor, 10);
    ctx.beginPath();
    ctx.moveTo(0, heights[0] + 3);
    for (let x = 1; x < width; x++) {
        ctx.lineTo(x, heights[x] + 3);
    }
    ctx.strokeStyle = secondaryColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw glowing hot edges around recent craters
 * Optimized: limit crater count, simplified glow
 */
function drawCraterGlow(renderer) {
    const ctx = renderer.ctx;

    // Only draw the 5 hottest craters for performance
    const hotCraters = craters
        .filter(c => c.heat > 0.2)
        .sort((a, b) => b.heat - a.heat)
        .slice(0, 5);

    if (hotCraters.length === 0) return;

    // Single glow setup for all craters
    renderer.setGlow('#ff6600', 12);

    for (const crater of hotCraters) {
        const glowAlpha = crater.heat * 0.35;
        ctx.globalAlpha = glowAlpha;
        ctx.strokeStyle = crater.heat > 0.5 ? '#ff4400' : '#ff8800';
        ctx.lineWidth = 3 + crater.heat * 3;

        ctx.beginPath();
        ctx.arc(crater.x, crater.y, crater.radius * 0.8, 0, Math.PI);
        ctx.stroke();
    }

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Draw void corruption effect on terrain near void edge
 * Optimized: batched drawing, single glow pass
 */
function drawVoidCorruption(renderer, voidY) {
    const ctx = renderer.ctx;
    const corruptionRange = 100;  // Pixels above void where corruption starts

    // Set glow once for entire corruption effect
    ctx.globalAlpha = 0.2;
    renderer.setGlow(currentBiomeColors.voidColor, 8);
    ctx.fillStyle = currentBiomeColors.voidColor;

    // Batch all corruption rectangles
    for (let x = 0; x < width; x += 20) {  // Wider spacing for performance
        const terrainY = heights[x];
        const distanceToVoid = voidY - terrainY;

        if (distanceToVoid > 0 && distanceToVoid < corruptionRange) {
            ctx.fillRect(x - 10, terrainY, 20, Math.min(distanceToVoid, 50));
        }
    }

    renderer.clearGlow();
    ctx.globalAlpha = 1;
}

/**
 * Get interpolated ceiling height at a given X position within a region.
 * Interpolates across gaps where ceilingHeights[x] === 0.
 * @param {number} x - X coordinate
 * @param {number} startX - Region start X
 * @param {number} endX - Region end X
 * @returns {number} Interpolated ceiling height, or 0 if no valid neighbors
 */
function getInterpolatedCeilingHeight(x, startX, endX) {
    const xi = Math.floor(x);
    if (xi < 0 || xi >= width) return 0;

    // If we have a valid height, use it
    if (ceilingHeights[xi] > 0) {
        return ceilingHeights[xi];
    }

    // Find nearest valid neighbors for interpolation
    let leftX = xi - 1;
    let rightX = xi + 1;
    while (leftX >= startX && ceilingHeights[leftX] === 0) leftX--;
    while (rightX <= endX && ceilingHeights[rightX] === 0) rightX++;

    // Interpolate if we have both neighbors
    if (leftX >= startX && rightX <= endX && ceilingHeights[leftX] > 0 && ceilingHeights[rightX] > 0) {
        const t = (xi - leftX) / (rightX - leftX);
        return ceilingHeights[leftX] * (1 - t) + ceilingHeights[rightX] * t;
    } else if (leftX >= startX && ceilingHeights[leftX] > 0) {
        return ceilingHeights[leftX];
    } else if (rightX <= endX && ceilingHeights[rightX] > 0) {
        return ceilingHeights[rightX];
    }

    return 0;  // No valid neighbors found
}

/**
 * Draw ceiling overhangs (cavern feature)
 * Uses direct ceilingHeights lookups instead of interpolation to prevent ghost terrain
 */
function drawCeiling(renderer) {
    if (!ceilingHeights || ceilingRegions.length === 0) return;

    const ctx = renderer.ctx;
    // Fill ceiling all the way to top of screen - solid rock roof
    // This prevents "ghost terrain" issues when shells land on top
    const ceilingTop = 0;  // Top of screen

    for (const region of ceilingRegions) {
        const startX = Math.floor(region.startX);
        const endX = Math.ceil(region.endX);

        // Find first valid ceiling point
        let firstValidX = startX;
        while (firstValidX <= endX && (!ceilingHeights[firstValidX] || ceilingHeights[firstValidX] <= 0)) {
            firstValidX++;
        }
        if (firstValidX > endX) continue;  // No valid ceiling in this region

        // Draw ceiling fill (dark, same as terrain)
        // Use segment-based drawing to skip gaps
        ctx.beginPath();
        let inSegment = false;
        let segmentStartX = firstValidX;

        // Top edge of ceiling (all the way to top of screen)
        for (let x = startX; x <= endX; x++) {
            const ceilingY = ceilingHeights[x];  // Direct lookup
            if (ceilingY > 0) {
                if (!inSegment) {
                    ctx.moveTo(x, ceilingTop);
                    segmentStartX = x;
                    inSegment = true;
                } else {
                    ctx.lineTo(x, ceilingTop);
                }
            } else if (inSegment) {
                // Close this segment: go down to ceiling bottom, trace back, go up
                ctx.lineTo(x - 1, ceilingTop);  // Stay at top
                // Go down the right edge
                ctx.lineTo(x - 1, ceilingHeights[x - 1] > 0 ? ceilingHeights[x - 1] : ceilingTop);
                // Trace back along the bottom
                for (let bx = x - 1; bx >= segmentStartX; bx--) {
                    const by = ceilingHeights[bx];
                    if (by > 0) ctx.lineTo(bx, by);
                }
                // Go up the left edge
                ctx.lineTo(segmentStartX, ceilingTop);
                ctx.closePath();
                inSegment = false;
            }
        }
        // Close final segment if still open
        if (inSegment) {
            // Go down the right edge
            const lastValidX = endX;
            ctx.lineTo(lastValidX, ceilingTop);
            // Find actual last valid point
            let actualLastX = endX;
            while (actualLastX >= segmentStartX && ceilingHeights[actualLastX] <= 0) actualLastX--;
            if (actualLastX >= segmentStartX) {
                ctx.lineTo(actualLastX, ceilingHeights[actualLastX]);
                // Trace back along the bottom
                for (let bx = actualLastX; bx >= segmentStartX; bx--) {
                    const by = ceilingHeights[bx];
                    if (by > 0) ctx.lineTo(bx, by);
                }
            }
            ctx.lineTo(segmentStartX, ceilingTop);
            ctx.closePath();
        }

        ctx.fillStyle = currentBiomeColors.terrain;
        ctx.fill();

        // Glowing bottom edge (the cave ceiling you see from below)
        // Draw as separate segments to avoid connecting across gaps
        renderer.setGlow(currentBiomeColors.edge, 15);
        ctx.strokeStyle = currentBiomeColors.edge;
        ctx.lineWidth = 2;

        // Track segment boundaries for vertical edges
        let segmentBoundaries = [];  // [{startX, endX, startY, endY}]
        ctx.beginPath();
        inSegment = false;
        let currentSegmentStart = 0;
        let currentSegmentStartY = 0;

        for (let x = startX; x <= endX; x++) {
            const ceilingY = ceilingHeights[x];  // Direct lookup
            if (ceilingY > 0) {
                if (!inSegment) {
                    ctx.moveTo(x, ceilingY);
                    currentSegmentStart = x;
                    currentSegmentStartY = ceilingY;
                    inSegment = true;
                } else {
                    ctx.lineTo(x, ceilingY);
                }
            } else if (inSegment) {
                // Record this segment boundary
                const prevX = x - 1;
                const prevY = ceilingHeights[prevX] || currentSegmentStartY;
                segmentBoundaries.push({
                    startX: currentSegmentStart,
                    endX: prevX,
                    startY: currentSegmentStartY,
                    endY: prevY
                });
                inSegment = false;
            }
        }
        // Record final segment if still open
        if (inSegment) {
            let lastValidX = endX;
            while (lastValidX >= currentSegmentStart && ceilingHeights[lastValidX] <= 0) lastValidX--;
            if (lastValidX >= currentSegmentStart) {
                segmentBoundaries.push({
                    startX: currentSegmentStart,
                    endX: lastValidX,
                    startY: currentSegmentStartY,
                    endY: ceilingHeights[lastValidX]
                });
            }
        }
        ctx.stroke();

        // Draw vertical side edges (from ceiling bottom UP to top of screen)
        for (const seg of segmentBoundaries) {
            // Left side edge - from ceiling bottom up to top
            ctx.beginPath();
            ctx.moveTo(seg.startX, seg.startY);
            ctx.lineTo(seg.startX, ceilingTop);
            ctx.stroke();

            // Right side edge - from ceiling bottom up to top
            ctx.beginPath();
            ctx.moveTo(seg.endX, seg.endY);
            ctx.lineTo(seg.endX, ceilingTop);
            ctx.stroke();
        }
        renderer.clearGlow();

        // Secondary glow (void color, slightly offset)
        ctx.globalAlpha = 0.3;
        renderer.setGlow(currentBiomeColors.voidColor, 8);
        ctx.strokeStyle = currentBiomeColors.voidColor;
        ctx.lineWidth = 1;

        // Bottom edge with offset
        ctx.beginPath();
        inSegment = false;
        for (let x = startX; x <= endX; x++) {
            const ceilingY = ceilingHeights[x];  // Direct lookup
            if (ceilingY > 0) {
                if (!inSegment) {
                    ctx.moveTo(x, ceilingY + 3);
                    inSegment = true;
                } else {
                    ctx.lineTo(x, ceilingY + 3);
                }
            } else {
                inSegment = false;  // Gap - end current segment
            }
        }
        ctx.stroke();

        // Side edges with offset (going UP to top)
        for (const seg of segmentBoundaries) {
            // Left side
            ctx.beginPath();
            ctx.moveTo(seg.startX + 2, seg.startY + 3);
            ctx.lineTo(seg.startX + 2, ceilingTop);
            ctx.stroke();

            // Right side
            ctx.beginPath();
            ctx.moveTo(seg.endX - 2, seg.endY + 3);
            ctx.lineTo(seg.endX - 2, ceilingTop);
            ctx.stroke();
        }

        renderer.clearGlow();
        ctx.globalAlpha = 1;
    }
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
// Debug Visualization
// ============================================================================

/**
 * Toggle terrain debug visualization mode
 */
export function setDebugMode(enabled) {
    debugMode = enabled;
}

/**
 * Draw debug visualization overlay showing floor/ceiling dots and gap info
 */
export function debugDraw(renderer) {
    if (!debugMode) return;

    const ctx = renderer.ctx;

    // Draw floor heights as green dots (every 20px)
    ctx.fillStyle = '#00ff00';
    for (let x = 0; x < width; x += 20) {
        const y = heights[x];
        if (y < canvasHeight + 100) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw ceiling heights as red dots (where > 0)
    if (ceilingHeights) {
        ctx.fillStyle = '#ff0000';
        for (let x = 0; x < width; x += 20) {
            const y = ceilingHeights[x];
            if (y > 0) {
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw gap distances at key points
        ctx.font = '12px monospace';
        ctx.fillStyle = '#ffff00';
        for (let x = 100; x < width - 100; x += 200) {
            const floorY = heights[x];
            const ceilingY = ceilingHeights[x];
            if (ceilingY > 0) {
                const gap = floorY - ceilingY;
                ctx.fillText(`gap:${Math.round(gap)}`, x, (floorY + ceilingY) / 2);
            }
        }
    }

    // Draw ceiling region outlines
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    for (const region of ceilingRegions) {
        ctx.strokeRect(region.startX, 50, region.endX - region.startX, 100);
    }
    ctx.setLineDash([]);
}

// ============================================================================
// Module Export
// ============================================================================

export const terrain = {
    generate,
    getHeightAt,
    setHeightAt,
    isPointBelowTerrain,
    isPointInCeiling,
    getCeilingAt,
    hasCeilingAt,
    getCeilingSlopeAt,
    getTerrainStyleName,
    burn,
    destroy,
    destroyShape,
    raise,
    raiseJagged,
    digJagged,
    carveToVoid,
    carveFissure,
    draw,
    generateProps,
    drawProps,
    updateCircuitPulses,
    setBiomeColors,
    updateCraters,
    setDebugMode,
    debugDraw
};
