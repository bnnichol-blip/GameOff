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
        description: 'Pinball chaos - explodes on every bounce!',
        tier: 'PREMIUM',
        damage: 70,        // Reduced from 80 per bounce
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
        description: 'Create Terrain! Elevate Your Tank! Create Cover!',
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
        description: 'Dig a massive jagged crater to void!',
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
        description: 'Roll Out! Make lots of Explosions! Finish with a BANG!',
        tier: 'MID',
        damage: 80,        // Final explosion damage
        blastRadius: 75,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.8,
        color: '#aaaaaa',
        behavior: 'roller',
        shockwaveInterval: 0.3,   // Emit shockwave every 0.3s
        shockwaveDamage: 40,      // Buffed shockwave damage
        shockwaveRadius: 30       // Buffed shockwave radius
    },

    // === MID TIER (40-70 coins) ===
    MORTAR: {
        name: 'Mortar',
        description: 'Bread and Butter. Good damage, big booms, trick shots.',
        tier: 'CHEAP',     // Always available in lottery as common
        damage: 75,        // Slightly reduced from 80
        blastRadius: 100,  // THE baseline blast radius (unchanged)
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.95,
        color: '#00ffff'
    },
    SPLITTER: {
        name: 'Splitter',
        description: 'Airbursting, Chain-splitting Mayhem! 16 total bombs!',
        tier: 'MID',
        damage: 70,
        blastRadius: 90,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#ff8844',
        behavior: 'splitterAirburst',
        splitCount: 4,            // First split: 4 fragments
        subsequentSplitCount: 2,  // Each subsequent split: 2 fragments
        maxSplitLevel: 3,         // Total split depth (1->4->8->16)
        airburstDelay: 0.8,
        subsequentDelay: 0.3
    },
    HEAVY_SHELL: {
        name: 'Heavy Shell',
        description: "Heavy Bullets Don't Travel Far. But They Hurt!",
        tier: 'MID',
        damage: 160,          // High damage
        blastRadius: 100,     // Tight but powerful
        bounces: 1,
        projectileRadius: 12,
        projectileSpeed: 0.45, // Very slow, ominous approach
        color: '#ff4444',
        behavior: 'miniNuke',
        explosionStages: 3,    // Multi-stage tight explosion
        stageDelay: 0.15,      // Slower than nuke for drama
        screenShake: 25        // Strong screen shake
    },
    // REMOVED: DRILL weapon (causes terrain disappearance issues - 1D heightmap limitation)
    // REMOVED: SHIELD weapon
    SEEKER: {
        name: 'Seeker',
        description: 'Only total noobs can miss with this weapon.',
        tier: 'MID',
        damage: 80,
        blastRadius: 75,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 0.85,
        color: '#ff44ff',
        behavior: 'seekerLockOn',
        seekStrength: 0.5,        // Strong homing after lock (doubled)
        lockOnDelay: 0.25,        // Faster lock-on (halved)
        ignoresTerrain: true      // Keeps chasing through terrain
    },
    CLUSTER: {
        name: 'Cluster',
        description: 'Better than one bomb? LOTS of really cool bombs.',
        tier: 'MID',
        damage: 35,        // Buffed from 25
        blastRadius: 50,   // Buffed from 30
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
        description: "Don't stand in front of this thing when it shoots...",
        tier: 'ORBITAL',
        damage: 120,
        blastRadius: 20,
        bounces: 2,           // Beam bounces off walls/ceiling
        projectileRadius: 4,
        projectileSpeed: 0,   // Instant beam
        color: '#ffffff',
        behavior: 'railgunInstant',
        instantFire: true,    // Fire immediately on space press
        beamWidth: 8,
        maxBeamLength: 3000
    },
    // REMOVED: MIRV weapon
    QUAKE: {
        name: 'Quake',
        description: 'DEVASTATING earthquake - cracks the earth!',
        tier: 'PREMIUM',
        damage: 90,            // Reduced direct damage
        blastRadius: 60,       // Reduced blast radius
        bounces: 0,
        projectileRadius: 12,
        projectileSpeed: 0.55, // Slower, heavier feel
        color: '#cc8844',      // More orange/earthy
        behavior: 'quakeSpread',
        shockwaveCount: 5,     // More rings
        shockwaveDelay: 0.12,  // Faster spread
        shockwaveFalloff: 0.18,// Less falloff per ring
        trenchLength: 900,     // Massive fissure (buffed from 300)
        trenchDepth: 45,       // Depth of fissure
        groundedMultiplier: 1.6 // Extra damage to grounded tanks
    },
    TELEPORTER: {
        name: 'Teleporter',
        description: 'Warp to impact point',
        tier: 'PREMIUM',
        damage: 0,         // No damage, unchanged
        blastRadius: 30,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 1.0,
        color: '#aa44ff',
        behavior: 'teleporter'
    },

    // === SPECTACLE TIER (130-180 coins) ===
    // NAPALM: REMOVED from game
    CHAIN_LIGHTNING: {
        name: 'Chain Lightning',
        description: 'ZAP! Huge hit, chains to nearby enemies!',
        tier: 'SPECTACLE',
        damage: 140,       // Huge damage on first target (Overload)
        blastRadius: 25,
        bounces: 2,        // Buffed bounces
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
        description: 'Sometimes, the world just has to burn.',
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
        description: 'Summon the finger of GOD.',
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
        description: 'WE NEED AIR SUPPORT, BOYS!',
        tier: 'SPECTACLE',   // Changed from ORBITAL to SPECTACLE (Epic rarity)
        damagePerBullet: 45,   // Buffed damage per bullet
        damage: 45,            // For display (buffed)
        blastRadius: 400,      // Coverage width for display
        bulletBlastRadius: 75, // 3x explosion radius per bullet
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
    DYING_STAR: {
        name: 'Dying Star',
        description: 'THE ULTIMATE WEAPON. Devastate everything.',
        tier: 'SPECIAL',
        damage: 200,           // Massive base damage
        blastRadius: 250,      // Huge blast radius
        bounces: 2,            // Extra bounce for trick shots
        projectileRadius: 16,  // Big glowing projectile
        projectileSpeed: 1.2,  // Faster
        color: '#ffcc00',
        behavior: 'dyingStar',
        // Special effects
        voidRise: 80,          // Raises void on impact
        shockwaveRadius: 500,  // Screen-wide shockwave
        shockwaveDamage: 40,   // Shockwave damage
        chainExplosions: 3,    // Number of follow-up explosions
        terrainDevastation: 2.5 // Multiplier for terrain destruction
    },

    // ============================================================================
    // NEW WEAPONS - 35 Additional Weapons
    // ============================================================================

    // === CHEAP TIER (15-35 coins) ===
    PLASMA_BOLT: {
        name: 'Plasma Bolt',
        description: 'A Radioactive Laser Beam! (stops at terrain)',
        tier: 'CHEAP',
        damage: 25,        // Reduced from 50 - relies on radiation
        blastRadius: 25,
        bounces: 0,           // No bounces - terminates on first hit
        projectileRadius: 4,
        projectileSpeed: 0,   // Instant hitscan
        color: '#00ffaa',
        behavior: 'plasmaBeam',
        radiationDamage: 20,  // Damage per turn
        radiationTurns: 2,    // Duration in turns
        beamWidth: 6
    },
    BUCK_SHOT: {
        name: 'Buck Shot',
        description: 'A Shotgun Blast for Tanks!',
        tier: 'CHEAP',
        damage: 20,
        blastRadius: 35,
        bounces: 1,
        projectileRadius: 7,
        projectileSpeed: 2.6,    // Very fast fragments (doubled)
        color: '#ffdd00',
        behavior: 'scatterCone',
        fragmentCount: 5,
        coneAngle: 30,           // Tighter cone (was 60)
        maxRange: 800            // Fragments expire after 800px (doubled)
    },

    // === MID TIER (40-70 coins) ===
    GRAVITY_MORTAR: {
        name: 'Gravity Mortar',
        description: 'The higher you shoot, the bigger the boom.',
        tier: 'MID',
        damage: 50,        // Buffed damage per bomblet
        blastRadius: 50,
        bounces: 1,
        projectileRadius: 8,
        projectileSpeed: 0.85,
        color: '#9966ff',
        behavior: 'apexCluster',
        clusterCount: 4
    },
    VOID_SPLITTER: {
        name: 'Void Splitter',
        description: 'FEAR THE FRAGMENTS OF THE VOID!',
        tier: 'MID',
        damage: 60,           // Each fragment deals 60 (2x)
        blastRadius: 120,     // Large blast radius (3x)
        bounces: 0,           // Explodes on first terrain contact
        projectileRadius: 7,
        projectileSpeed: 0.9,
        color: '#aa00ff',
        behavior: 'voidSplitterLand',
        splitCount: 3,
        pauseDuration: 1.0,   // Pause 1 second before fragments emerge
        homingStrength: 0.15
    },
    BOUNCING_BETTY: {
        name: 'Bouncing Betty',
        description: 'Every bounce increases the boom!',
        tier: 'MID',
        damage: 20,           // Starting damage
        blastRadius: 55,      // Starting radius, scales up to 125 with bounces
        maxBlastRadius: 125,  // Maximum blast radius at max bounces
        bounces: 10,          // Max 10 bounces
        projectileRadius: 6,
        projectileSpeed: 0.95,
        color: '#ff8888',
        behavior: 'bouncingBetty',
        bounceDamageModifier: 20,  // +20 damage per bounce
        explodesOnEnemyContact: true
    },
    // FISSURE_CHARGE: REMOVED from game

    // === PREMIUM TIER (80-120 coins) ===
    SOLAR_FLARE: {
        name: 'Solar Flare',
        description: 'Rains fiery fury from above!',
        tier: 'PREMIUM',
        damage: 50,              // Main shell explosion damage
        blastRadius: 50,         // Main shell explosion radius
        bounces: 0,
        projectileRadius: 10,
        projectileSpeed: 0.8,
        color: '#ffaa00',
        behavior: 'solarFlareRain',
        fireRainDelay: 0.2,      // First fire projectile after 0.2s
        fireRainInterval: 0.1,   // Then every 0.1s
        fireRainDamage: 15,      // Each fire projectile damage
        fireRainRadius: 30,      // Fire projectile blast radius
        leavesNapalm: true,      // Fire projectiles leave napalm fields
        napalmDuration: 4,       // Napalm field duration
        napalmDamage: 8          // Napalm damage per second
    },
    VOID_DRILL: {
        name: 'Void Drill',
        description: 'The Void is Calling!',
        tier: 'PREMIUM',
        damage: 90,
        blastRadius: 70,
        bounces: 0,
        projectileRadius: 8,
        projectileSpeed: 0.6,
        color: '#440088',
        behavior: 'undergroundSeeker',
        burrowSpeed: 8,
        seekRange: 300
    },

    // === SPECTACLE TIER (130-200 coins) ===
    METEOR_SHOWER: {
        name: 'Meteor Shower',
        description: 'Reach to the stars and CALL THE FIRE!',
        tier: 'SPECTACLE',
        damage: 0,              // Signal flare does no damage
        meteorDamage: 80,       // Each meteor deals 80 damage
        blastRadius: 120,       // Large blast radius per meteor
        bounces: 0,
        projectileRadius: 8,
        projectileSpeed: 2.0,   // Fast upward shot
        color: '#ff6600',
        behavior: 'meteorShowerUp',
        meteorCount: 6,
        meteorDelay: 0.3,       // Stagger between meteors
        firesStraightUp: true   // Always fires straight up
    },
    BLACK_HOLE_GRENADE: {
        name: 'Black Hole Grenade',
        description: 'A vortex of black death.',
        tier: 'SPECTACLE',
        damage: 100,
        blastRadius: 150,
        bounces: 0,
        projectileRadius: 10,
        projectileSpeed: 0.8,
        color: '#220044',
        behavior: 'blackHole',
        pullRadius: 300,       // Larger pull area
        pullDuration: 2.0,     // Longer pull time
        pullStrength: 0.8,     // Much stronger pull
        pullsTanks: true,
        tankPullMultiplier: 2.5  // Extra strong pull on tanks specifically
    },
    VOID_CANNON: {
        name: 'Void Cannon',
        description: "Don't stare too long into the void...",
        tier: 'SPECTACLE',
        damage: 120,
        blastRadius: 100,
        bounces: 0,
        projectileRadius: 8,
        projectileSpeed: 0.9,
        color: '#8800ff',
        behavior: 'voidCannonBeam',
        beamDelay: 1.5,
        beamWidth: 60,
        cutsToVoid: true,        // Destroys terrain down to void
        hasPullEffect: true,     // Black hole-like pull
        pullRadius: 120,         // Pull range beyond beam
        pullStrength: 0.75       // Strong pull strength (buffed from 0.5)
    },
};

// Weapon keys for iteration (exclude non-purchasable and orbital weapons from regular rotation)
export const WEAPON_KEYS = Object.keys(WEAPONS).filter(k =>
    WEAPONS[k].tier !== 'SPECIAL' && WEAPONS[k].tier !== 'ORBITAL'
);
// Orbital weapons handled separately in shop with limited stock
export const ORBITAL_WEAPON_KEYS = Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'ORBITAL');

// ============================================================================
// Cosmic Lottery - Rarity System
// ============================================================================

// Rarity rates (must sum to 100)
export const LOTTERY_RARITY_RATES = {
    common: 50,
    rare: 25,
    epic: 15,
    legendary: 10
};

// Rarity visual styling
export const LOTTERY_RARITY_COLORS = {
    common:    { border: '#666666', glow: '#888888', bg: '#1a1a1a' },
    rare:      { border: '#0088ff', glow: '#00aaff', bg: '#0a0a1a' },
    epic:      { border: '#aa00ff', glow: '#cc44ff', bg: '#1a0a1a' },
    legendary: { border: '#ffaa00', glow: '#ffdd00', bg: '#1a1a0a' }
};

// Map weapon tiers to lottery rarities
// CHEAP → common, MID → rare, PREMIUM+SPECTACLE → epic, ORBITAL → legendary
export const WEAPONS_BY_RARITY = {
    common: Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'CHEAP'),
    rare: Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'MID'),
    epic: Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'PREMIUM' || WEAPONS[k].tier === 'SPECTACLE'),
    legendary: Object.keys(WEAPONS).filter(k => WEAPONS[k].tier === 'ORBITAL')
};

// Reverse lookup: get rarity for a weapon key
export const WEAPON_RARITY_MAP = {};
for (const [rarity, weapons] of Object.entries(WEAPONS_BY_RARITY)) {
    for (const weaponKey of weapons) {
        WEAPON_RARITY_MAP[weaponKey] = rarity;
    }
}

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
// Tank Cosmetics (Pure Visual - No Gameplay Differences)
// ============================================================================

export const TANKS = [
    {
        id: 'VOLT',
        name: 'Volt',
        shape: 'triangle',
        sides: 3,
        color: '#00FFFF',
        glowColor: '#00FFFF'
    },
    {
        id: 'BLAZE',
        name: 'Blaze',
        shape: 'square',
        sides: 4,
        color: '#FF8800',
        glowColor: '#FFAA00'
    },
    {
        id: 'PHANTOM',
        name: 'Phantom',
        shape: 'parallelogram',
        sides: 4,  // Skewed rectangle
        color: '#FF00FF',
        glowColor: '#FF66FF'
    },
    {
        id: 'HIVE',
        name: 'Hive',
        shape: 'hexagon',
        sides: 6,
        color: '#FFD700',
        glowColor: '#FFEE66'
    },
    {
        id: 'RAZOR',
        name: 'Razor',
        shape: 'kite',
        sides: 4,  // Kite shape - elongated top
        color: '#FF3333',
        glowColor: '#FF6666'
    },
    {
        id: 'NOVA',
        name: 'Nova',
        shape: 'star',
        sides: 5,  // 5-pointed star
        color: '#FFFFFF',
        glowColor: '#FFFFFF'
    },
    {
        id: 'ORB',
        name: 'Orb',
        shape: 'circle',
        sides: 0,  // Circle has no sides
        color: '#00FF00',
        glowColor: '#66FF66'
    },
    {
        id: 'LUNA',
        name: 'Luna',
        shape: 'crescent',
        sides: 0,  // Crescent moon shape
        color: '#AA00FF',
        glowColor: '#CC66FF'
    }
];

// Helper to get tank by ID
export function getTankById(id) {
    return TANKS.find(t => t.id === id) || TANKS[0];
}
