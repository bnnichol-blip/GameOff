// ============================================================================
// Weapons Data
// ============================================================================

export const WEAPON_TIERS = {
    CHEAP: { min: 15, max: 30 },
    MID: { min: 40, max: 70 },
    PREMIUM: { min: 80, max: 120 },
    SPECTACLE: { min: 130, max: 180 }
};

export const WEAPONS = {
    // === CHEAP TIER (15-30 coins) ===
    // NOTE: All damage values doubled (×2) for increased lethality, except Napalm
    // REMOVED: BABY_SHOT, MIRV, SHIELD
    BOUNCER: {
        name: 'Bouncer',
        description: 'Pinball chaos - explodes on every bounce',
        cost: 20,
        tier: 'CHEAP',
        damage: 80,        // Mortar-level damage on each bounce
        blastRadius: 80,   // Mortar-level blast radius
        bounces: 4,        // Base bounces (randomized 4-7 at fire time)
        bouncesMin: 4,     // Minimum random bounces
        bouncesMax: 7,     // Maximum random bounces
        projectileRadius: 6,
        projectileSpeed: 1.1,
        color: '#ffff44',
        behavior: 'bouncer',
        finalBlastMultiplier: 2.0  // 2x blast radius on final explosion
    },
    DIRT_BALL: {
        name: 'Dirt Ball',
        description: 'Creates massive jagged peak',
        cost: 20,
        tier: 'CHEAP',
        damage: 0,         // Utility only - no damage
        blastRadius: 120,  // Same size as Digger
        bounces: 1,
        projectileRadius: 10,
        projectileSpeed: 0.7,
        color: '#aa7744',
        terrainEffect: 'buildJagged',
        behavior: 'dirtBall'
    },
    DIGGER: {
        name: 'Digger',
        description: 'Massive jagged crater to void',
        cost: 25,
        tier: 'CHEAP',
        damage: 0,         // Utility only - no direct damage
        blastRadius: 120,  // Large crater
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#996633',
        terrainEffect: 'digJagged',
        behavior: 'digger'
    },
    ROLLER: {
        name: 'Roller',
        description: 'Shockwaves while rolling',
        cost: 30,
        tier: 'CHEAP',
        damage: 60,        // Final explosion damage
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#aaaaaa',
        behavior: 'roller',
        shockwaveInterval: 0.3,   // Emit shockwave every 0.3s
        shockwaveDamage: 20,      // ~25% of Mortar damage
        shockwaveRadius: 20       // ~25% of Mortar radius
    },

    // === MID TIER (40-70 coins) ===
    MORTAR: {
        name: 'Mortar',
        description: 'Reliable AoE baseline',
        cost: 40,
        tier: 'MID',
        damage: 80,        // THE baseline damage
        blastRadius: 80,   // THE baseline blast radius
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.95,
        color: '#00ffff'
    },
    SPLITTER: {
        name: 'Splitter',
        description: 'RIDICULOUS chain-split mayhem!',
        cost: 45,
        tier: 'MID',
        damage: 70,        // 2x damage per fragment
        blastRadius: 90,   // 3x explosion size
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#ff8844',
        behavior: 'splitterAirburst',
        splitCount: 4,         // First split: 4 fragments
        subsequentSplitCount: 2,  // Each subsequent split: 2 fragments
        maxSplitLevel: 4,      // Total split depth (1->4->8->16->32)
        airburstDelay: 0.8,    // Level 1 delay
        subsequentDelay: 0.3   // Level 2-4 delay (faster chain reaction)
    },
    HEAVY_SHELL: {
        name: 'Heavy Shell',
        description: 'Siege + aftershock',
        cost: 50,
        tier: 'MID',
        damage: 150,       // Very high damage
        blastRadius: 120,  // 1.5x Mortar radius for terrain carve
        bounces: 1,
        projectileRadius: 12,
        projectileSpeed: 0.5,  // Very slow
        color: '#ff4444',
        behavior: 'heavyShell',
        aftershockDamage: 20,   // ~25% of Mortar damage
        aftershockRadius: 200   // Wide but weak
    },
    DRILL: {
        name: 'Drill',
        description: 'Tunnel borer - pierces terrain',
        cost: 55,
        tier: 'MID',
        damage: 80,        // Normal mid-tier damage on exit
        blastRadius: 50,
        bounces: 0,
        projectileRadius: 6,
        projectileSpeed: 1.1,
        color: '#cccccc',
        behavior: 'drill',
        tunnelWidth: 40    // Medium-width tunnel carve
    },
    // REMOVED: SHIELD weapon
    SEEKER: {
        name: 'Seeker',
        description: 'Lock-on homing missile',
        cost: 60,
        tier: 'MID',
        damage: 70,
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85,
        color: '#ff44ff',
        behavior: 'seekerLockOn',
        seekStrength: 0.15,       // Strong homing after lock
        lockOnDelay: 0.5,         // Seconds to reach apex and lock
        ignoresTerrain: true      // Keeps chasing through terrain
    },
    CLUSTER: {
        name: 'Cluster',
        description: 'Wide spray of bomblets',
        cost: 65,
        tier: 'MID',
        damage: 25,        // Low damage each
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#ffaa00',
        behavior: 'cluster',
        clusterCount: 8    // Many bomblets, wide spray
    },

    // === PREMIUM TIER (80-120 coins) ===
    RAILGUN: {
        name: 'Railgun',
        description: 'ORBITAL: Charge beam with ricochet (3 shots)',
        cost: 120,
        tier: 'ORBITAL',   // Moved to orbital tier - limited stock
        damage: 120,       // Line damage to everything along path
        blastRadius: 20,   // Small explosion at terminus
        bounces: 2,        // Beam bounces off walls/ceiling
        projectileRadius: 4,
        projectileSpeed: 0,  // Instant beam (handled specially)
        color: '#ffffff',
        behavior: 'railgunBeam',
        chargeTime: 1.5,       // Seconds to charge
        beamWidth: 8,
        maxBeamLength: 3000    // Long range
    },
    // REMOVED: MIRV weapon
    QUAKE: {
        name: 'Quake',
        description: 'DEVASTATING earthquake - cracks the earth!',
        cost: 100,
        tier: 'PREMIUM',
        damage: 140,           // Heavy impact damage (was 80)
        blastRadius: 120,      // Larger initial impact (was 60)
        bounces: 0,
        projectileRadius: 12,
        projectileSpeed: 0.55, // Slower, heavier feel
        color: '#cc8844',      // More orange/earthy
        behavior: 'quakeSpread',
        shockwaveCount: 5,     // More rings (was 4)
        shockwaveDelay: 0.12,  // Faster spread (was 0.15)
        shockwaveFalloff: 0.18,// Less falloff per ring (was 0.25)
        trenchLength: 300,     // Length of fissure carved
        trenchDepth: 45,       // Depth of fissure
        groundedMultiplier: 1.6 // Extra damage to grounded tanks
    },
    TELEPORTER: {
        name: 'Teleporter',
        description: 'Warp to impact point',
        cost: 100,
        tier: 'PREMIUM',
        damage: 0,         // No damage, unchanged
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 1.0,
        color: '#aa44ff',
        behavior: 'teleporter'
    },
    VOID_RIFT: {
        name: 'Void Rift',
        description: 'Raises void +60px',
        cost: 110,
        tier: 'PREMIUM',
        damage: 40,        // Was 20, doubled
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#8800ff',
        behavior: 'voidRift',
        voidRise: 60
    },

    // === SPECTACLE TIER (130-180 coins) ===
    NAPALM: {
        name: 'Napalm',
        description: 'Lingering fire field x2 radius',
        cost: 130,
        tier: 'SPECTACLE',
        damage: 15,        // UNCHANGED - Napalm exempt from damage boost
        blastRadius: 120,  // Field radius x2 (was 60)
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#ff4400',
        behavior: 'napalm',
        fieldDuration: 8,  // Duration unchanged
        fieldDamage: 10    // Damage per second unchanged
    },
    CHAIN_LIGHTNING: {
        name: 'Chain Lightning',
        description: 'Overload - huge first hit, one jump',
        cost: 150,
        tier: 'SPECTACLE',
        damage: 140,       // Huge damage on first target (Overload)
        blastRadius: 25,
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 1.3,
        color: '#44ffff',
        behavior: 'chainLightningOverload',
        chainDamage: 70,   // 50% of first hit damage
        chainRange: 250,   // Good range for the jump
        maxChains: 1       // Only one additional jump
    },
    NUKE: {
        name: 'Nuke',
        description: 'ORBITAL: Cinematic multi-stage detonation (2 shots)',
        cost: 250,
        tier: 'ORBITAL',   // Moved to orbital tier - limited stock
        damage: 180,       // Massive damage
        blastRadius: 400,  // Huge blast
        bounces: 0,
        projectileRadius: 14,
        projectileSpeed: 0.45,  // Very slow approach
        color: '#ffff00',
        behavior: 'nukeCinematic',
        fuseTime: 3,
        // Multi-stage detonation
        stageCount: 4,         // Number of explosion stages
        stageDelay: 0.25,      // Delay between stages
        mushroomCloudDuration: 2.0,  // How long the mushroom cloud lingers
        slowMoFactor: 0.3      // Slow motion during detonation
    },

    // === ORBITAL TIER (Limited Stock - purchased from space battle) ===
    ORBITAL_BEACON: {
        name: 'Orbital Beacon',
        description: 'Call down devastating beam from capital ship (2.5s delay)',
        cost: 300,
        tier: 'ORBITAL',
        damage: 75,
        blastRadius: 150,
        edgeDamage: 50,
        bounces: 0,
        projectileRadius: 8,
        projectileSpeed: 0.9,
        color: '#ff6600',
        behavior: 'orbitalBeacon'
    },
    STRAFING_RUN: {
        name: 'Strafing Run',
        description: 'DEVASTATING fighter strafe - 400px carpet bomb!',
        cost: 200,
        tier: 'ORBITAL',
        damagePerBullet: 20,   // 2x damage (was 10)
        damage: 20,            // For display (was 10)
        blastRadius: 400,      // Coverage width for display
        bulletBlastRadius: 75, // 3x explosion radius per bullet (was 25)
        bounces: 0,
        projectileRadius: 8,   // Slightly bigger bullets
        projectileSpeed: 1.0,
        color: '#ffaa00',      // Orange-yellow for bigger explosions
        behavior: 'strafingRun',
        fighterCount: 4,
        bulletsPerFighter: 5,
        coverageWidth: 400
    },
    // Dying Light is granted by desperation beacon, not purchasable
    // GIGA OP: Double damage, massive blast, void rise, multi-explosion, screen shockwave
    DYING_LIGHT: {
        name: 'Dying Light',
        description: 'ULTIMATE WEAPON. Devastates everything.',
        cost: 0,
        tier: 'SPECIAL',
        damage: 200,           // Massive base damage
        blastRadius: 250,      // Huge blast radius
        bounces: 2,            // Extra bounce for trick shots
        projectileRadius: 16,  // Big glowing projectile
        projectileSpeed: 1.2,  // Faster
        color: '#ffcc00',
        behavior: 'dyingLight',
        // Special effects
        voidRise: 80,          // Raises void on impact
        shockwaveRadius: 500,  // Screen-wide shockwave
        shockwaveDamage: 40,   // Shockwave damage
        chainExplosions: 3,    // Number of follow-up explosions
        terrainDevastation: 2.5 // Multiplier for terrain destruction
    }
};

// Weapon keys for iteration (exclude non-purchasable and orbital weapons from regular rotation)
export const WEAPON_KEYS = Object.keys(WEAPONS).filter(k =>
    WEAPONS[k].tier !== 'SPECIAL' && WEAPONS[k].tier !== 'ORBITAL'
);
// Orbital weapons handled separately in shop with limited stock
export const ORBITAL_WEAPON_KEYS = Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'ORBITAL');

// ============================================================================
// Tank Types (kept for visual shapes, will use WEAPONS for stats)
// ============================================================================

export const TANK_TYPES = {
    SIEGE: {
        name: 'SIEGE',
        description: 'Mortar - Large blast, forgiving',
        weapon: 'Mortar',
        damage: 40,
        blastRadius: 80,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.95,  // Slightly slower for lobbed mortar feel
        shape: 6  // hexagon
    },
    PHANTOM: {
        name: 'PHANTOM',
        description: 'Railgun - Devastating direct hits',
        weapon: 'Railgun',
        damage: 95,           // High base damage
        blastRadius: 30,      // Slightly larger for more forgiving hits
        bounces: 2,
        projectileRadius: 5,  // Slightly larger projectile
        projectileSpeed: 1.35, // Fast but not overwhelming
        shape: 3,             // triangle
        // Railgun-specific properties
        directHitRadius: 12,  // "Core" zone for bonus damage
        directHitBonus: 1.5,  // 50% bonus damage on direct hits
        minDamageFalloff: 0.4 // Minimum 40% damage even at edge (reduced falloff)
    },
    CHAOS: {
        name: 'CHAOS',
        description: 'Cluster - Splits into 5 bomblets',
        weapon: 'Cluster',
        damage: 15,  // Per bomblet
        blastRadius: 35,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85, // Slower cluster for spread visibility
        shape: 5,  // pentagon
        clusterCount: 5
    },
    DIGGER: {
        name: 'DIGGER',
        description: 'Excavator - Removes terrain, no damage',
        weapon: 'Excavator',
        damage: 0,            // No damage
        blastRadius: 70,      // Large dig radius
        bounces: 1,
        projectileRadius: 6,
        projectileSpeed: 0.9, // Utility speed
        shape: 4,             // square/diamond
        isTerrainWeapon: true,
        terrainEffect: 'dig'
    },
    BUILDER: {
        name: 'BUILDER',
        description: 'Dirt Bomb - Adds terrain mound',
        weapon: 'Dirt Bomb',
        damage: 5,            // Tiny damage (dirt impact)
        blastRadius: 55,      // Mound size
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.75, // Heavy lobbed projectile
        shape: 4,             // square/diamond
        isTerrainWeapon: true,
        terrainEffect: 'build'
    },
    SHIELD: {
        name: 'SHIELD',
        description: 'Force Field - 50% damage reduction next hit',
        weapon: 'Force Field',
        damage: 0,            // No damage
        blastRadius: 40,      // Shield visual radius
        bounces: 0,           // Doesn't bounce - deploys on impact
        projectileRadius: 10,
        projectileSpeed: 0.6, // Slow deploy - defensive choice
        shape: 8,             // Octagon (shield-like)
        isUtilityWeapon: true,
        utilityEffect: 'shield',
        shieldReduction: 0.5  // 50% damage reduction
    }
};

// ============================================================================
// Tank Archetypes (Abilities + Visuals)
// ============================================================================

export const TANK_ARCHETYPES = {
    STRIKER: {
        name: 'STRIKER',
        description: 'Offensive powerhouse',
        abilityName: 'Overdrive',
        abilityDesc: '+33% damage dealt',
        abilityRules: { damageBonus: 0.33 },
        palette: { base: '#ff4444', glow: '#ff6666' },  // Red
        chassisShape: 3,   // Triangle - aggressive
        turretLength: 38,
        turretWidth: 5
    },
    FORTRESS: {
        name: 'FORTRESS',
        description: 'Immovable anchor',
        abilityName: 'Armor Plating',
        abilityDesc: '-33% damage taken',
        abilityRules: { damageReduction: 0.33 },
        palette: { base: '#888888', glow: '#aaaaaa' },  // Gray
        chassisShape: 4,   // Square - solid
        turretLength: 28,
        turretWidth: 8
    },
    HUNTER: {
        name: 'HUNTER',
        description: 'Precision tracker',
        abilityName: 'Target Lock',
        abilityDesc: 'All projectiles home slightly',
        abilityRules: { homingStrength: 0.02 },
        palette: { base: '#ffaa00', glow: '#ffcc00' },  // Orange
        chassisShape: 6,   // Hexagon - tactical
        turretLength: 35,
        turretWidth: 4
    },
    SPECTER: {
        name: 'SPECTER',
        description: 'Aerial phantom',
        abilityName: 'Hover Jets',
        abilityDesc: 'Hover 20px above terrain',
        abilityRules: { hoverHeight: 20 },
        palette: { base: '#aa44ff', glow: '#cc66ff' },  // Purple
        chassisShape: 5,   // Pentagon - floaty
        turretLength: 32,
        turretWidth: 4
    },
    MERCHANT: {
        name: 'MERCHANT',
        description: 'Economic advantage',
        abilityName: 'Trade Routes',
        abilityDesc: '+20 bonus coins per turn',
        abilityRules: { bonusCoins: 20 },
        palette: { base: '#ffff00', glow: '#ffff66' },  // Yellow/gold
        chassisShape: 4,   // Square - merchant cart
        turretLength: 26,
        turretWidth: 7
    }
};
