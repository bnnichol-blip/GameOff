# Turn Flow Bug Fixes

## Critical Issues Found

### 1. Cluster bomb race condition (CRITICAL)
**Location:** `onExplode()` lines 2414-2429

When a cluster projectile explodes, it removes itself from `state.projectiles` and only calls `endTurn()` if `state.projectiles.length === 0`. However, if `indexOf(proj)` returns `-1` (projectile already removed by another code path), the length check happens but `endTurn()` may not be called.

**Fix:** Always check `state.projectiles.length === 0` after any cluster removal, regardless of whether the removal succeeded.

### 2. Airburst splitter fragments desync (MEDIUM)
**Location:** `updateClusterBomblet()` lines 4089-4101 and `spawnAirburstFragments()` lines 2529-2568

When airburst fragments split, they remove themselves from `state.projectiles` but don't check if all fragments are done. If all fragments split in the same frame, `endTurn()` may never be called.

**Fix:** After removing fragment from array in `updateClusterBomblet`, check if `state.projectiles.length === 0` and call `endTurn()`.

### 3. No safety timeout for firing phase (CRITICAL)
**Location:** `update()` function

If a projectile somehow gets lost or enters an infinite state, the game stays stuck in `firing` phase forever.

**Fix:** Add a safety timeout (e.g., 30 seconds max firing time) that forces `endTurn()` if the phase is still `firing`.

### 4. Strafing run bullets may never clear (MEDIUM)
**Location:** `updateStrafingRuns()` lines 3719-3737

The strafing run only ends when `strafeBullets.length === 0`, but if bullets are created but never explode (e.g., stuck at boundary), the turn never ends.

**Fix:** Add a max lifetime for strafing bullets and ensure they always terminate.

### 5. DRILL can escape bounds without exploding (LOW)
**Location:** `updateProjectile()` drill behavior lines 1609-1646

If a drill projectile exits the world bounds while drilling, it may not trigger the exit-terrain explosion.

**Fix:** Add explicit bounds check for drill projectiles that forces explosion on out-of-bounds.

### 6. BOUNCER terrain bounce missing final check (LOW)
**Location:** `updateProjectile()` bouncer behavior lines 1566-1606

After setting `proj.isFinalBounce = true` and calling `onExplode(proj)`, the code also sets `state.projectile = null`. This is correct, but if `onExplode` somehow returns early for BOUNCER (which it shouldn't), the turn would be stuck.

**Fix:** Ensure `onExplode()` always calls `endTurn()` for non-cluster, non-special projectiles.

## Implementation Todos

### todo-1: Fix cluster explosion race condition
In `onExplode()`, after the cluster handling block, ensure `endTurn()` is called if `state.projectiles.length === 0` regardless of whether the remove succeeded.

### todo-2: Fix airburst fragment desync
In `updateClusterBomblet()`, after removing an airburst fragment that splits, check if all projectiles are done and call `endTurn()`.

### todo-3: Add firing phase safety timeout
In `update()` or `fireProjectile()`, track when firing started. If firing phase exceeds 30 seconds, force `endTurn()`.

### todo-4: Add strafing bullet lifetime limit
Give strafing bullets a max lifetime (e.g., 5 seconds) after which they auto-explode.

### todo-5: Add drill bounds safety check
In the drill behavior path, add explicit check: if drill is out of bounds or below void, force explosion.

### todo-6: Audit all onExplode early returns
Review all paths in `onExplode()` that return early to ensure they either call `endTurn()` or are intentional (like cluster handling).

## Key Files
- `src/main.js` - all turn flow logic lives here

## Verification
After fixes:
- Play 10+ games with cluster weapons (Cluster, Splitter, MIRV-style)
- Play games with Bouncer weapon
- Play games with Railgun and verify turn ends
- Test orbital strikes complete without hanging
- Verify no turn takes longer than 30 seconds
