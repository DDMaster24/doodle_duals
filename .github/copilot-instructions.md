<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Doodle Duals - Multiplayer Physics Game

This is a real-time multiplayer physics game combining Angry Birds mechanics with Battleship strategy. Players build structures and then use slingshots to destroy each other's creations.

## Project Structure
- `/public` - Client-side game files (HTML, CSS, JS)
- `/server` - Node.js server with Socket.io for multiplayer
- `/shared` - Shared game logic and constants
- `package.json` - Dependencies and scripts

## Tech Stack
- Frontend: HTML5 Canvas + JavaScript + Matter.js physics
- Backend: Node.js + Express + Socket.io
- Real-time multiplayer for cross-network play

## Game Features
- 30-second building phase with blocks (squares, triangles, rectangles, circles)
- Physics-based slingshot mechanics with trajectory and gravity
- Turn-based gameplay with treasure protection win condition
- Room-based multiplayer system

## Development Notes
- Focus on rapid development for same-day play testing
- Prioritize core multiplayer functionality
- Use Matter.js for realistic physics simulation