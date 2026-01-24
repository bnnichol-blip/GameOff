# Gemini Lottery Review — Jan 23, 2026

## 1. Critical Issues Identified

### A. Non-Existent Weapon Keys
The current plan references weapons like `PLASMA_BOLT`, `SCATTER_SHELL`, and `TRACER_ROUND`. These do not exist in `src/main.js`. Implementing the plan as-is will crash the game when a player selects these cards.
- **Fix**: Use the existing `WEAPONS` mapping (MORTAR, BOUNCER, NUKE, etc.).

### B. Infinite Ammo / Choice Inflation
The plan triggers a lottery every turn and grants 3-4 ammo. Because selecting a new card replaces the current weapon, players will have a continuous cycle of high-tier weapons and will never see the default `MORTAR` again.
- **Fix**: Reduce ammo counts (Common: 2, Rare+: 1). This forces players to periodically "revert" to Mortar, making the lottery selection more impactful.

### C. Phase Transition Conflicts
The plan uses `setTimeout` for transitions (`lottery` -> `aiming`), which conflicts with the **GeminiReviewJan23** stabilization plan. This could re-introduce the "stuck between turns" bug we just planned to fix.
- **Fix**: Synchronize lottery transitions with the `state.turnTransitionTimer`.

---

## 2. Revised Implementation Plan

### Weapon-to-Rarity Mapping (STABLE)

| Rarity | Current Weapons in main.js | Ammo |
|--------|----------------------------|------|
| **Common** | MORTAR, BOUNCER, DIRT_BALL | 2 |
| **Uncommon** | DIGGER, ROLLER, SPLITTER | 2 |
| **Rare** | HEAVY_SHELL, DRILL, SEEKER, CLUSTER | 1 |
| **Epic** | QUAKE, TELEPORTER, VOID_RIFT, NAPALM | 1 |
| **Legendary** | RAILGUN, CHAIN_LIGHTNING, NUKE, ORBITAL_BEACON, STRAFING_RUN | 1 |

### Logic Refactors

#### 1. Firing Logic (`src/main.js`)
```javascript
function fireProjectile() {
    const player = getCurrentPlayer();
    if (player.weaponAmmo !== Infinity) {
        player.weaponAmmo--;
        if (player.weaponAmmo <= 0) {
            player.weapon = 'MORTAR';
            player.weaponAmmo = Infinity;
        }
    }
}
```

#### 2. Turn Transition (`src/main.js`)
Integrate with the stabilization timer:
- When the turn-resolving timer reaches 0:
- If `state.phase === 'resolving'`, call `startLottery()`.
- Lottery selection then sets the phase to `aiming`.

#### 3. AI Selection Strategy
AI should use a weighted probability based on rarity rather than a "black box" function.
- **Priority**: Legendary > Epic > Rare > Uncommon > Common.

---

## 3. Implementation Checklist

- [ ] Update `player` initialization in `createPlayers()` to include `weaponAmmo: Infinity`.
- [ ] Implement `generateLotteryCards()` using existing `WEAPONS` keys.
- [ ] Add `handleLotteryInput()` to `update()` loop.
- [ ] Implement `renderLottery()` with 3 centered cards and SLAM effects.
- [ ] Remove all legacy Shop code and associated state variables.
