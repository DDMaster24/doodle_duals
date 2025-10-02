# Doodle Duals - Multiplayer Physics Game

A real-time multiplayer game that combines Angry Birds physics with Battleship strategy. Players build structures with blocks and use slingshots to destroy each other's creations!

## 🎮 How to Play

1. **Join a Room**: Enter a room code to play with your friend
2. **Build Phase**: You have 30 seconds to build your structure using:
   - 3x Squares
   - 3x Triangles 
   - 3x Rectangles
   - 3x Circles
   - 1x Treasure (place inside your structure)
3. **Battle Phase**: Take turns using the slingshot to destroy your opponent's structure
4. **Win Condition**: Destroy your opponent's treasure to win!

## 🚀 Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser to `http://localhost:3000`

4. Share the room code with your friend to play together!

## 🛠 Tech Stack

- **Frontend**: HTML5 Canvas, JavaScript, Matter.js (physics)
- **Backend**: Node.js, Express, Socket.io
- **Real-time Multiplayer**: Socket.io for cross-network play

## 🎯 Game Features

- Real-time multiplayer across different networks
- Physics-based destruction using Matter.js
- Drag-and-drop building mechanics
- Trajectory-based slingshot with gravity
- Turn-based gameplay system
- Room-based matchmaking

## 📁 Project Structure

```
doodle_duals/
├── public/           # Client-side files
│   ├── index.html    # Main game page
│   ├── style.css     # Game styling
│   └── game.js       # Game logic and physics
├── server/           # Server files
│   └── server.js     # Node.js + Socket.io server
├── shared/           # Shared constants
│   └── constants.js  # Game configuration
└── package.json      # Dependencies
```

## 🌟 Perfect for Long-Distance Gaming

Designed specifically for couples and friends playing from different cities. Tested for Johannesburg ↔ Middleburg connectivity!