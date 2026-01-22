/**
 * Glitch Events System for Void Artillery
 *
 * Randomized events that trigger at the start of EVERY turn (100%),
 * introducing wild gameplay modifiers for unpredictability and excitement.
 */

import { COLORS } from './renderer.js';

// Default gravity value (must match main.js DEFAULT_GRAVITY)
const DEFAULT_GRAVITY = 0.25;

// ============================================================================
// Event Registry
// ============================================================================

const EVENTS = [
    // === ORIGINAL EVENTS ===
    {
        name: 'ARSENAL GLITCH',
        color: COLORS.yellow,
        description: 'Tank type randomized for this turn',
        apply(state, tankTypes) {
            const player = state.players[state.currentPlayer];
            state.originalTankType = player.tankType;
            const typeKeys = Object.keys(tankTypes);
            const otherTypes = typeKeys.filter(t => t !== player.tankType);
            player.tankType = otherTypes[Math.floor(Math.random() * otherTypes.length)];
        },
        revert(state) {
            if (state.originalTankType) {
                const player = state.players[state.currentPlayer];
                player.tankType = state.originalTankType;
                state.originalTankType = null;
            }
        }
    },
    {
        name: 'VOID WARP',
        color: COLORS.magenta,
        description: 'Player teleported to random position',
        apply(state, tankTypes, terrain, CANVAS_WIDTH, TANK_RADIUS) {
            const player = state.players[state.currentPlayer];
            const minX = 100;
            const maxX = CANVAS_WIDTH - 100;
            const newX = minX + Math.random() * (maxX - minX);
            player.x = newX;
            player.y = terrain.getHeightAt(newX) - TANK_RADIUS;
            player.vy = 0;
        },
        revert(state) {}
    },
    {
        name: 'GRAVITY FLUX',
        color: COLORS.cyan,
        description: 'Gravity randomized for this turn',
        apply(state) {
            state.originalGravity = state.gravity;
            state.gravity = 0.1 + Math.random() * 0.4;
        },
        revert(state) {
            if (state.originalGravity !== undefined) {
                state.gravity = state.originalGravity;
                state.originalGravity = undefined;
            } else {
                state.gravity = DEFAULT_GRAVITY;
            }
        }
    },
    {
        name: 'VOID ANOMALY',
        color: '#8800ff',
        description: 'Neutral projectile spawns from sky',
        apply(state, tankTypes, terrain, CANVAS_WIDTH) {
            const targetX = 100 + Math.random() * (CANVAS_WIDTH - 200);
            state.anomalyProjectile = {
                x: targetX + (Math.random() - 0.5) * 100,
                y: -20,
                vx: (Math.random() - 0.5) * 3,
                vy: 2 + Math.random() * 2,
                radius: 10,
                color: '#8800ff',
                bounces: 0,
                maxBounces: 1,
                trail: [],
                tankType: 'SIEGE',
                isAnomaly: true
            };
        },
        revert(state) {
            state.anomalyProjectile = null;
        }
    },
    {
        name: 'VOID SIPHON',
        color: COLORS.green,
        description: 'Steal 15 HP from opponent',
        apply(state) {
            const currentPlayer = state.players[state.currentPlayer];
            const opponent = state.players[1 - state.currentPlayer];
            const stealAmount = Math.min(15, opponent.health);
            opponent.health = Math.max(0, opponent.health - stealAmount);
            currentPlayer.health = Math.min(100, currentPlayer.health + stealAmount);
        },
        revert(state) {}
    },

    // === NEW PHYSICS-HEAVY EVENTS ===
    {
        name: 'TIME DILATION',
        color: '#00aaff',
        description: 'Projectile velocity slowed to 60%',
        apply(state) {
            state.velocityMultiplier = 0.6;
        },
        revert(state) {
            state.velocityMultiplier = 1.0;
        }
    },
    {
        name: 'HYPER GRAVITY',
        color: '#ff4400',
        description: 'Extreme gravity pulls shots down fast',
        apply(state) {
            state.originalGravity = state.gravity;
            state.gravity = 0.6 + Math.random() * 0.3; // 0.6-0.9
        },
        revert(state) {
            if (state.originalGravity !== undefined) {
                state.gravity = state.originalGravity;
                state.originalGravity = undefined;
            } else {
                state.gravity = DEFAULT_GRAVITY;
            }
        }
    },
    {
        name: 'ZERO-G',
        color: '#aaffff',
        description: 'Near-zero gravity for floaty shots',
        apply(state) {
            state.originalGravity = state.gravity;
            state.gravity = 0.02;
        },
        revert(state) {
            if (state.originalGravity !== undefined) {
                state.gravity = state.originalGravity;
                state.originalGravity = undefined;
            } else {
                state.gravity = DEFAULT_GRAVITY;
            }
        }
    },
    {
        name: 'INVERTED GRAVITY',
        color: '#ff00aa',
        description: 'Gravity reversed - shots arc upward!',
        apply(state) {
            state.originalGravity = state.gravity;
            state.gravity = -0.2;
        },
        revert(state) {
            if (state.originalGravity !== undefined) {
                state.gravity = state.originalGravity;
                state.originalGravity = undefined;
            } else {
                state.gravity = DEFAULT_GRAVITY;
            }
        }
    },
    {
        name: 'WIND BLAST',
        color: '#88ff88',
        description: 'Strong horizontal wind affects shots',
        apply(state) {
            // Random wind direction and strength
            state.wind = (Math.random() > 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.2);
        },
        revert(state) {
            state.wind = 0;
        }
    },
    {
        name: 'ELASTIC WORLD',
        color: '#ffaa00',
        description: 'Extra bounces for all projectiles',
        apply(state) {
            state.extraBounces = 2;
        },
        revert(state) {
            state.extraBounces = 0;
        }
    },
    {
        name: 'MUZZLE OVERCHARGE',
        color: '#ffff00',
        description: 'Launch velocity boosted +50%',
        apply(state) {
            state.velocityMultiplier = 1.5;
        },
        revert(state) {
            state.velocityMultiplier = 1.0;
        }
    },
    {
        name: 'MUZZLE DAMPEN',
        color: '#666688',
        description: 'Launch velocity reduced -40%',
        apply(state) {
            state.velocityMultiplier = 0.6;
        },
        revert(state) {
            state.velocityMultiplier = 1.0;
        }
    },
    {
        name: 'RECOIL KICK',
        color: '#ff8844',
        description: 'Firing pushes your tank backward',
        apply(state) {
            state.recoilPending = true;
        },
        revert(state) {
            state.recoilPending = false;
        }
    },
    {
        name: 'VOID SURGE',
        color: '#aa00aa',
        description: 'Void rises extra after this shot',
        apply(state) {
            state.voidSurgePending = true;
        },
        revert(state) {
            state.voidSurgePending = false;
        }
    }
];

// ============================================================================
// Event System
// ============================================================================

let activeEventData = null;

/**
 * Roll for a glitch event (100% chance - always triggers)
 * @returns {Object} Random event object
 */
export function rollForEvent() {
    // 100% chance - always return an event
    return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

/**
 * Apply an event's effects to game state
 */
export function applyEvent(state, event, tankTypes, terrain, CANVAS_WIDTH, TANK_RADIUS) {
    activeEventData = event;
    event.apply(state, tankTypes, terrain, CANVAS_WIDTH, TANK_RADIUS);
}

/**
 * Revert any temporary event effects
 */
export function revertEvent(state) {
    if (activeEventData) {
        activeEventData.revert(state);
        activeEventData = null;
    }
}

/**
 * Get the currently active event
 */
export function getActiveEvent() {
    return activeEventData;
}

/**
 * Get all available events (for debugging/UI)
 */
export function getAllEvents() {
    return EVENTS;
}
