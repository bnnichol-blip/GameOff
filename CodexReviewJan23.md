# Turn-Stuck Cleanup Plan

## Findings (ordered by severity)
- **Nuke ends the turn before the cinematic explosion finishes.** `endTurn()` is called when the nuke lands, but the actual detonation happens later in `updateNukes()`, so the turn can advance while the nuke is still “in flight.”

```1688:1707:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
state.nukes.push({
    x: proj.x,
    y: landY,
    fuseTimer: projWeapon.fuseTime || 3,
    ...
});
...
state.projectile = null;
endTurn();
return;
```

- **Orbital beacon ends the turn before the beam fires.** The beacon lands, `endTurn()` is called immediately, then the beam resolves in `updateOrbitalBeacons()` several seconds later. This can desync turns and stall if other systems expect the shot to resolve first.

```1680:1708:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
state.orbitalBeacons.push({
    x: proj.x,
    y: landY,
    phase: 'landed',
    timer: 0,
    ...
});
...
state.projectile = null;
endTurn();
return;
```

- **Strafing run can deadlock if bullets never resolve.** The run stays in `firing` and only ends when all strafe bullets are gone; if bullets don’t explode (bad weapon resolution or timing), turn never ends.

```3683:3691:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (run.phase === 'done') {
    const strafeBullets = state.projectiles.filter(p => p.isStrafeBullet);
    if (strafeBullets.length === 0) {
        if (run.pendingTurnEnd) {
            state.strafingRuns.splice(i, 1);
            endTurn();
        }
    }
}
```

- **MIRV stage-1 can end the turn early.** The check `state.projectiles.length === 0` runs before stage‑2 spawn, so in edge cases the turn ends prematurely.

```1278:1284:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (proj.isMIRVStage1) {
    spawnMIRVStage2(proj);
    if (state.projectiles.length === 0) {
        endTurn();
    }
    return;
}
```

- **Multiple endTurn calls are possible.** Several systems call `endTurn()` directly; without a guard, concurrent resolution (cluster, strafing, special weapons) can double‑advance or re‑enter resolving.

```1619:1622:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (state.projectiles.length === 0) {
    endTurn();
}
```

## Cleanup plan

- **Gate turn transitions** in `[src/main.js](src/main.js)`
  - Add a simple `isEndingTurn`/`endTurnLocked` flag to prevent multiple `endTurn()` calls in the same resolution window.

- **Fix orbital weapon turn flow** in `[src/main.js](src/main.js)`
  - **Nuke:** Do not call `endTurn()` on land; end after the cinematic explosion completes.
  - **Orbital beacon:** Do not call `endTurn()` on land; end after beam phase completes.

- **Harden strafing run resolution** in `[src/main.js](src/main.js)`
  - Ensure strafe bullets always resolve (verify they can explode), add a short safety timeout after `done` before checking `isStrafeBullet` count.

- **Correct MIRV stage ordering** in `[src/main.js](src/main.js)`
  - Move/replace the `state.projectiles.length` check so it happens after stage‑2 spawn, or rely on stage‑2 explosions to end the turn.

- **Audit multi‑projectile cleanup** in `[src/main.js](src/main.js)`
  - Ensure bomblets/fragments remove themselves once, and turn end happens after all are resolved.

## Todos
- `endturn-guard`: Add an end‑turn guard flag.
- `orbital-turnflow`: End turns after nuke/beacon effects finish.
- `strafe-safety`: Add strafe bullet resolution safety timeout.
- `mirv-order`: Fix MIRV stage‑1 turn end ordering.
- `multi-proj-audit`: Verify cluster/fragment cleanup timing.
# Turn-Stuck Cleanup Plan

## Findings (ordered by severity)
- **Nuke ends the turn before the cinematic explosion finishes.** `endTurn()` is called when the nuke lands, but the actual detonation happens later in `updateNukes()`, so the turn can advance while the nuke is still “in flight.”

```1688:1707:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
state.nukes.push({
    x: proj.x,
    y: landY,
    fuseTimer: projWeapon.fuseTime || 3,
    ...
});
...
state.projectile = null;
endTurn();
return;
```

- **Orbital beacon ends the turn before the beam fires.** The beacon lands, `endTurn()` is called immediately, then the beam resolves in `updateOrbitalBeacons()` several seconds later. This can desync turns and stall if other systems expect the shot to resolve first.

```1680:1708:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
state.orbitalBeacons.push({
    x: proj.x,
    y: landY,
    phase: 'landed',
    timer: 0,
    ...
});
...
state.projectile = null;
endTurn();
return;
```

- **Strafing run can deadlock if bullets never resolve.** The run stays in `firing` and only ends when all strafe bullets are gone; if bullets don’t explode (bad weapon resolution or timing), turn never ends.

```3683:3691:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (run.phase === 'done') {
    const strafeBullets = state.projectiles.filter(p => p.isStrafeBullet);
    if (strafeBullets.length === 0) {
        if (run.pendingTurnEnd) {
            state.strafingRuns.splice(i, 1);
            endTurn();
        }
    }
}
```

- **MIRV stage-1 can end the turn early.** The check `state.projectiles.length === 0` runs before stage‑2 spawn, so in edge cases the turn ends prematurely.

```1278:1284:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (proj.isMIRVStage1) {
    spawnMIRVStage2(proj);
    if (state.projectiles.length === 0) {
        endTurn();
    }
    return;
}
```

- **Multiple endTurn calls are possible.** Several systems call `endTurn()` directly; without a guard, concurrent resolution (cluster, strafing, special weapons) can double‑advance or re‑enter resolving.

```1619:1622:C:\Users\bnnic\OneDrive\Desktop\Game Off\src\main.js
if (state.projectiles.length === 0) {
    endTurn();
}
```

## Cleanup plan

- **Gate turn transitions** in `[src/main.js](src/main.js)`
  - Add a simple `isEndingTurn`/`endTurnLocked` flag to prevent multiple `endTurn()` calls in the same resolution window.

- **Fix orbital weapon turn flow** in `[src/main.js](src/main.js)`
  - **Nuke:** Do not call `endTurn()` on land; end after the cinematic explosion completes.
  - **Orbital beacon:** Do not call `endTurn()` on land; end after beam phase completes.

- **Harden strafing run resolution** in `[src/main.js](src/main.js)`
  - Ensure strafe bullets always resolve (verify they can explode), add a short safety timeout after `done` before checking `isStrafeBullet` count.

- **Correct MIRV stage ordering** in `[src/main.js](src/main.js)`
  - Move/replace the `state.projectiles.length` check so it happens after stage‑2 spawn, or rely on stage‑2 explosions to end the turn.

- **Audit multi‑projectile cleanup** in `[src/main.js](src/main.js)`
  - Ensure bomblets/fragments remove themselves once, and turn end happens after all are resolved.

## Todos
- `endturn-guard`: Add an end‑turn guard flag.
- `orbital-turnflow`: End turns after nuke/beacon effects finish.
- `strafe-safety`: Add strafe bullet resolution safety timeout.
- `mirv-order`: Fix MIRV stage‑1 turn end ordering.
- `multi-proj-audit`: Verify cluster/fragment cleanup timing.
