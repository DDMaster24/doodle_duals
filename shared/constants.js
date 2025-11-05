// Shared game constants used by both client and server
const GAME_CONFIG = {
  // Game timing
  BUILD_PHASE_DURATION: 30000, // 30 seconds in milliseconds
  TURN_DURATION: 30000, // 30 seconds per turn
  
  // Building blocks per player
  BLOCKS_PER_PLAYER: {
    square: 3,
    triangle: 3,
    rectangle: 3,
    horizontalBar: 2,
    verticalBar: 2,
    egg: 1
  },
  
  // Physics settings
  PHYSICS: {
    gravity: 0.8,
    airResistance: 0.01,
    bounceRestitution: 0.6,
    frictionStatic: 0.5,
    frictionKinetic: 0.3
  },
  
  // Game world dimensions
  WORLD: {
    width: 1200,
    height: 600,
    groundHeight: 50
  },
  
  // Block dimensions
  BLOCK_SIZES: {
    square: { width: 40, height: 40 },
    rectangle: { width: 60, height: 30 },
    triangle: { width: 40, height: 40 },
    horizontalBar: { width: 80, height: 15 },
    verticalBar: { width: 15, height: 80 },
    egg: { radius: 18 }
  },

  // Slingshot settings
  SLINGSHOT: {
    maxPower: 35,
    position: { x: 100, y: 400 }, // Player 1 position (raised)
    position2: { x: 1100, y: 400 }, // Player 2 position (raised)
    detectionRadius: 50, // Distance for slingshot interaction
    projectileLifetime: 8000 // Milliseconds before projectile is removed
  },

  // UI timing
  UI_TIMING: {
    coinFlipDuration: 3000, // Coin flip screen display time
    shotDelay: 3000 // Delay before switching turns after shot
  },

  // Game states
  GAME_STATES: {
    WAITING: 'waiting',
    BUILDING: 'building',
    COIN_FLIP: 'coin_flip',
    PLAYING: 'playing',
    GAME_OVER: 'game_over'
  },
  
  // Player positions (left vs right side)
  PLAYER_AREAS: {
    player1: { x: 0, width: 400 },
    player2: { x: 800, width: 400 }
  }
};

// Export for Node.js (server) or make global for browser (client)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GAME_CONFIG;
} else {
  window.GAME_CONFIG = GAME_CONFIG;
}