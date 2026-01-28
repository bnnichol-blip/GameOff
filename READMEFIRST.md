# VOID ARTILLERY

A 2D artillery duel with ricochet physics, rising void, and cosmic chaos.

**Game Jam Entry** - Game Off January 2026
**Theme:** "One Button Away"

---

## Quick Start (Windows)

1. Download `VOID_ARTILLERY.exe` from the [Releases](../../releases) page (or build from source)
2. Double-click to play - no installation required
3. The exe is fully portable and self-contained

---

## How to Play

### Objective
Be the last tank standing. Destroy your enemies with artillery shots, push them into the void, or let the rising void consume them.

### Controls

| Key | Action |
|-----|--------|
| **Arrow Keys** | Aim your turret (left/right to rotate, up/down for fine adjustment) |
| **Space (hold)** | Charge shot power |
| **Space (release)** | Fire! |
| **G** | Launch grappling hook (3 per game) |
| **1-5** | Select card during Cosmic Lottery |
| **Esc** | Pause menu |

### Game Flow

1. **Tank Selection** - Choose your tank (purely cosmetic - all tanks play the same)
2. **Cosmic Lottery** - Pick 1 of 5 weapon cards at the start of each turn
3. **Aim & Fire** - Charge your shot and release to fire
4. **The Void Rises** - After each round, the magenta void rises, shrinking the arena
5. **Last Tank Wins** - Eliminate all enemies or be the sole survivor

### Tips

- **Ricochets** - Projectiles bounce off walls! Use trick shots to hit enemies behind cover
- **Terrain** - Explosions destroy terrain. Dig tunnels or collapse ground under enemies
- **Wind** - Watch the wind indicator (top-right). Wind affects projectile flight
- **Grappling Hook** - Press G to swing across the map. Great for escaping the void or repositioning
- **Weapon Rarities** - Higher rarity weapons (Epic/Legendary) appear in later rounds

---

## Features

### Core Mechanics
- **Ricochet Physics** - Projectiles bounce off walls for creative trick shots
- **Rising Void** - The arena shrinks each round, forcing confrontation
- **Destructible Terrain** - Blast craters, dig tunnels, collapse overhangs

### Cosmic Lottery
Every turn, choose from 5 weapon cards:
- **Common** - Reliable basics (Mortar, Digger, Plasma Bolt)
- **Rare** - Tactical options (Splitter, Cluster, Big Spring)
- **Epic** - Powerful weapons (Railgun, Quake, Really Silly Hammer)
- **Legendary** - Devastating finishers (Nuke, Orbital Beacon, Magnetic Slam)

### Grappling Hook
- 3 hooks per game
- Swing to safety or reposition for the perfect shot
- Chain hooks while airborne for maximum mobility

### 41 Unique Weapons
From bouncing bombs to orbital strikes, from terrain tools to close-range slams.

### Visual Style
- Geometry Wars meets Tron aesthetic
- Neon glow effects and particle explosions
- 5 biome color themes
- Twinkling star field with dynamic clouds

---

## Building from Source

### Requirements
- Node.js (v18+)
- npm

### Setup
```bash
# Clone the repository
git clone https://github.com/bnnichol-blip/GameOff.git
cd GameOff

# Install dependencies
npm install

# Run in development (Electron)
npm start

# Build portable exe
npm run build
```

The built exe will be in `dist/VOID_ARTILLERY.exe`

---

## Tech Stack

- **Vanilla JavaScript** - No frameworks, pure JS
- **HTML5 Canvas** - All rendering
- **Electron** - Desktop packaging
- **electron-builder** - Exe generation

---

## Credits

Developed for Game Off January 2026

**Music:**
- "Calm Space Music"
- "Mesmerizing Galaxy Loop"
- "Space"
- "Whispering Stars Lofi"

---

## License

MIT License - See LICENSE file for details
