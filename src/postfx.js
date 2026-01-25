/**
 * Post-Processing Effects for Void Artillery
 * Dual-canvas bloom, vignette overlay, chromatic aberration, glitch effects
 */

// ============================================================================
// Configuration
// ============================================================================

// Master toggle for all post-fx (toggle with P key in debug)
// DISABLED BY DEFAULT - bloom is expensive, enable with P key
export let ENABLE_POSTFX = false;

// Bloom settings - reduced for performance
const BLOOM_BLUR = 4;  // Was 8 - halved for performance
const BLOOM_BRIGHTNESS = 1.3;  // Was 1.5
const BLOOM_ALPHA = 0.3;  // Was 0.4

// Frame skip for expensive effects
let frameCount = 0;
const BLOOM_FRAME_SKIP = 2;  // Only apply bloom every N frames

// Vignette settings
const VIGNETTE_INNER_RADIUS = 0.5;  // Fraction of max radius where fade starts
const VIGNETTE_ALPHA = 0.6;

// Chromatic aberration settings
const CHROMATIC_MAX = 5;
const CHROMATIC_DECAY = 0.85;

// Scanline settings
const SCANLINE_SPACING = 4;
const SCANLINE_ALPHA = 0.1;

// ============================================================================
// State
// ============================================================================

let glowCanvas = null;
let glowCtx = null;
let chromaticIntensity = 0;
let glitchActive = false;
let glitchIntensity = 0;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize post-fx system (call once at startup)
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function initPostFX(width, height) {
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = width;
    glowCanvas.height = height;
    glowCtx = glowCanvas.getContext('2d');
}

/**
 * Toggle post-fx on/off
 */
export function togglePostFX() {
    ENABLE_POSTFX = !ENABLE_POSTFX;
    return ENABLE_POSTFX;
}

/**
 * Set post-fx enabled state
 */
export function setPostFXEnabled(enabled) {
    ENABLE_POSTFX = enabled;
}

// ============================================================================
// Bloom Effect
// ============================================================================

/**
 * Apply bloom effect to the main canvas
 * Uses a secondary canvas with blur + brightness, composited with 'screen' blend
 * Performance: Only updates bloom texture every N frames
 * @param {HTMLCanvasElement} mainCanvas - The main game canvas
 * @param {CanvasRenderingContext2D} ctx - The main canvas context
 */
export function applyBloom(mainCanvas, ctx) {
    if (!ENABLE_POSTFX || !glowCtx) return;

    frameCount++;

    // Only recalculate bloom every N frames for performance
    if (frameCount % BLOOM_FRAME_SKIP === 0) {
        // Clear previous frame
        glowCtx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        // Draw main canvas to glow canvas with blur and brightness
        glowCtx.filter = `blur(${BLOOM_BLUR}px) brightness(${BLOOM_BRIGHTNESS})`;
        glowCtx.drawImage(mainCanvas, 0, 0);
        glowCtx.filter = 'none';
    }

    // Always composite the cached glow (even on skip frames)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = BLOOM_ALPHA;
    ctx.drawImage(glowCanvas, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
}

// ============================================================================
// Vignette Effect
// ============================================================================

/**
 * Draw vignette overlay (dark corners)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function drawVignette(ctx, width, height) {
    if (!ENABLE_POSTFX) return;

    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);

    const gradient = ctx.createRadialGradient(cx, cy, maxRadius * VIGNETTE_INNER_RADIUS, cx, cy, maxRadius);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(1, `rgba(0,0,0,${VIGNETTE_ALPHA})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
}

// ============================================================================
// Chromatic Aberration
// ============================================================================

/**
 * Trigger chromatic aberration effect (call on impacts)
 * @param {number} intensity - Intensity of the effect (0-5)
 */
export function triggerChromatic(intensity) {
    chromaticIntensity = Math.min(intensity, CHROMATIC_MAX);
}

/**
 * Apply chromatic aberration effect
 * Simplified version that uses color channel offsets via compositing
 * (Full pixel manipulation is too expensive for real-time)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function applyChromaticAberration(ctx, width, height) {
    if (!ENABLE_POSTFX || chromaticIntensity < 0.5) return;

    const offset = Math.floor(chromaticIntensity);

    // Save current state
    ctx.save();

    // Red channel offset (left)
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.1 * (chromaticIntensity / CHROMATIC_MAX);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(-offset, 0, width, height);

    // Blue channel offset (right)
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(offset, 0, width, height);

    ctx.restore();

    // Decay
    chromaticIntensity *= CHROMATIC_DECAY;
    if (chromaticIntensity < 0.1) chromaticIntensity = 0;
}

/**
 * Update chromatic aberration decay (call each frame)
 */
export function updateChromatic() {
    if (chromaticIntensity > 0) {
        chromaticIntensity *= CHROMATIC_DECAY;
        if (chromaticIntensity < 0.1) chromaticIntensity = 0;
    }
}

// ============================================================================
// Glitch Effects (for Glitch Events)
// ============================================================================

/**
 * Activate glitch effects
 * @param {number} intensity - Intensity of glitch (0-1)
 */
export function activateGlitch(intensity = 0.5) {
    glitchActive = true;
    glitchIntensity = Math.min(1, Math.max(0, intensity));
}

/**
 * Deactivate glitch effects
 */
export function deactivateGlitch() {
    glitchActive = false;
    glitchIntensity = 0;
}

/**
 * Draw scanlines effect (CRT aesthetic)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {number} intensity - Intensity multiplier (0-1)
 */
export function drawScanlines(ctx, width, height, intensity = 1) {
    if (!ENABLE_POSTFX || intensity < 0.1) return;

    ctx.fillStyle = `rgba(0,0,0,${SCANLINE_ALPHA * intensity})`;
    for (let y = 0; y < height; y += SCANLINE_SPACING) {
        ctx.fillRect(0, y, width, 2);
    }
}

/**
 * Draw RGB split effect (horizontal offset of color channels)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {HTMLCanvasElement} canvas - The source canvas
 * @param {number} intensity - Split amount in pixels
 */
export function drawRGBSplit(ctx, canvas, intensity = 2) {
    if (!ENABLE_POSTFX || !glitchActive) return;

    const offset = Math.floor(intensity * glitchIntensity);
    if (offset < 1) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.15;

    // Red channel left
    ctx.drawImage(canvas, -offset, 0);

    // Blue channel right
    ctx.drawImage(canvas, offset, 0);

    ctx.restore();
}

/**
 * Draw horizontal glitch bars (random offset sections)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {HTMLCanvasElement} canvas - The source canvas
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function drawGlitchBars(ctx, canvas, width, height) {
    if (!ENABLE_POSTFX || !glitchActive || glitchIntensity < 0.3) return;

    // Random chance to show glitch bars this frame
    if (Math.random() > glitchIntensity * 0.3) return;

    const numBars = Math.floor(2 + Math.random() * 4);

    for (let i = 0; i < numBars; i++) {
        const barY = Math.random() * height;
        const barHeight = 2 + Math.random() * 8;
        const offsetX = (Math.random() - 0.5) * 20 * glitchIntensity;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, barY, width, barHeight);
        ctx.clip();
        ctx.drawImage(canvas, offsetX, 0);
        ctx.restore();
    }
}

// ============================================================================
// Combined Post-FX Pipeline
// ============================================================================

/**
 * Apply all post-processing effects in order
 * Call this at the end of the render loop, before endFrame()
 * @param {HTMLCanvasElement} canvas - The main game canvas
 * @param {CanvasRenderingContext2D} ctx - The main canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
export function applyAllPostFX(canvas, ctx, width, height) {
    if (!ENABLE_POSTFX) return;

    // 1. Bloom (biggest visual impact)
    applyBloom(canvas, ctx);

    // 2. Chromatic aberration (on impacts)
    applyChromaticAberration(ctx, width, height);

    // 3. Glitch effects (during glitch events)
    if (glitchActive) {
        drawRGBSplit(ctx, canvas, 3);
        drawGlitchBars(ctx, canvas, width, height);
        drawScanlines(ctx, width, height, glitchIntensity);
    }

    // 4. Vignette (always on, subtle darkening)
    drawVignette(ctx, width, height);
}

// ============================================================================
// Export for external access
// ============================================================================

export const postfx = {
    initPostFX,
    togglePostFX,
    setPostFXEnabled,
    applyBloom,
    drawVignette,
    triggerChromatic,
    applyChromaticAberration,
    updateChromatic,
    activateGlitch,
    deactivateGlitch,
    drawScanlines,
    drawRGBSplit,
    drawGlitchBars,
    applyAllPostFX,
    get enabled() { return ENABLE_POSTFX; }
};
