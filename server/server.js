const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const GAME_CONFIG = require('../shared/constants');

const app = express();
const server = http.createServer(app);

// Configure CORS - use environment variable for allowed origins in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : "*";

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Store game rooms
const gameRooms = new Map();

// Store disconnected players for reconnection (temporary storage)
const disconnectedPlayers = new Map(); // socketId -> { roomCode, playerNumber, timestamp }

// Rate limiting - track player actions to prevent spam
const playerRateLimits = new Map();

// Rate limiter configuration
const RATE_LIMITS = {
  placeBlock: { maxActions: 20, windowMs: 5000 }, // 20 blocks per 5 seconds
  shoot: { maxActions: 3, windowMs: 10000 }, // 3 shots per 10 seconds
  general: { maxActions: 50, windowMs: 5000 } // 50 general actions per 5 seconds
};

// Reconnection timeout (30 seconds)
const RECONNECTION_TIMEOUT = 30000;

// Rate limiting function
function checkRateLimit(playerId, action) {
  if (!playerRateLimits.has(playerId)) {
    playerRateLimits.set(playerId, {});
  }

  const playerLimits = playerRateLimits.get(playerId);
  const limit = RATE_LIMITS[action] || RATE_LIMITS.general;
  const now = Date.now();

  if (!playerLimits[action]) {
    playerLimits[action] = { count: 1, windowStart: now };
    return true;
  }

  const timeElapsed = now - playerLimits[action].windowStart;

  if (timeElapsed > limit.windowMs) {
    // Reset window
    playerLimits[action] = { count: 1, windowStart: now };
    return true;
  }

  if (playerLimits[action].count >= limit.maxActions) {
    return false; // Rate limit exceeded
  }

  playerLimits[action].count++;
  return true;
}

// Clean up rate limit data for disconnected players
function cleanupRateLimit(playerId) {
  playerRateLimits.delete(playerId);
}

// Generate random room code
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Initialize a new game room
function createGameRoom(roomCode) {
  return {
    id: roomCode,
    players: [],
    gameState: GAME_CONFIG.GAME_STATES.WAITING,
    currentPlayer: 0,
    buildTimer: null,
    turnTimer: null,
    syncInterval: null,
    blocks: {
      player1: [],
      player2: []
    },
    treasures: {
      player1: null,
      player2: null
    },
    projectiles: [], // Track active projectiles for validation
    score: {
      player1: 0,
      player2: 0
    }
  };
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create or join room
  socket.on('createRoom', () => {
    const roomCode = generateRoomCode();
    const room = createGameRoom(roomCode);
    gameRooms.set(roomCode, room);
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    room.players.push({
      id: socket.id,
      playerNumber: 1,
      ready: false
    });
    
    socket.emit('roomCreated', { roomCode, playerNumber: 1 });
    console.log(`Room created: ${roomCode}`);
  });

  socket.on('joinRoom', (data) => {
    const { roomCode } = data;

    // Validate room code format
    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      socket.emit('error', { message: 'Invalid room code format' });
      return;
    }

    const room = gameRooms.get(roomCode);

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    const playerNumber = room.players.length + 1;
    room.players.push({
      id: socket.id,
      playerNumber: playerNumber,
      ready: false
    });
    
    socket.emit('roomJoined', { roomCode, playerNumber });
    
    // Notify all players in room
    io.to(roomCode).emit('playerJoined', { 
      playersCount: room.players.length,
      players: room.players 
    });
    
    console.log(`Player joined room ${roomCode}: ${socket.id}`);
    
    // Start game if room is full
    if (room.players.length === 2) {
      startCoinFlip(roomCode);
    }
  });

  // Player ready status
  socket.on('playerReady', () => {
    const room = gameRooms.get(socket.roomCode);
    if (!room) return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.ready = true;
      io.to(socket.roomCode).emit('playerReady', { playerId: socket.id });
      
      // Check if both players are ready
      if (room.players.length === 2 && room.players.every(p => p.ready)) {
        startBuildPhase(socket.roomCode);
      }
    }
  });

  // Handle block placement
  socket.on('placeBlock', (data) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'placeBlock')) {
      socket.emit('error', { message: 'Too many actions. Please slow down.' });
      return;
    }

    const room = gameRooms.get(socket.roomCode);
    if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.BUILDING) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Validate block data
    if (!data || !data.type || !data.x || !data.y) {
      socket.emit('error', { message: 'Invalid block data' });
      return;
    }

    // Validate block type exists in config
    if (!GAME_CONFIG.BLOCKS_PER_PLAYER.hasOwnProperty(data.type)) {
      socket.emit('error', { message: 'Invalid block type' });
      return;
    }

    // Validate block position is within player's area
    const playerArea = GAME_CONFIG.PLAYER_AREAS[`player${player.playerNumber}`];
    const blockSize = GAME_CONFIG.BLOCK_SIZES[data.type];
    const blockWidth = blockSize.width || blockSize.radius * 2 || 40;

    if (data.x < playerArea.x || data.x + blockWidth > playerArea.x + playerArea.width) {
      socket.emit('error', { message: 'Block must be placed in your area' });
      return;
    }

    const playerKey = `player${player.playerNumber}`;
    room.blocks[playerKey].push(data);

    // Broadcast block placement to all players in room
    io.to(socket.roomCode).emit('blockPlaced', {
      playerId: socket.id,
      playerNumber: player.playerNumber,
      block: data
    });
  });

  // Handle treasure placement
  socket.on('placeTreasure', (data) => {
    const room = gameRooms.get(socket.roomCode);
    if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.BUILDING) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    // Validate treasure data
    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
      socket.emit('error', { message: 'Invalid treasure data' });
      return;
    }

    // Validate treasure position is within player's area
    const playerArea = GAME_CONFIG.PLAYER_AREAS[`player${player.playerNumber}`];
    const eggRadius = GAME_CONFIG.BLOCK_SIZES.egg.radius;

    if (data.x - eggRadius < playerArea.x || data.x + eggRadius > playerArea.x + playerArea.width) {
      socket.emit('error', { message: 'Treasure must be placed in your area' });
      return;
    }

    const playerKey = `player${player.playerNumber}`;
    room.treasures[playerKey] = data;

    // Broadcast treasure placement
    io.to(socket.roomCode).emit('treasurePlaced', {
      playerId: socket.id,
      playerNumber: player.playerNumber,
      treasure: data
    });
  });

  // Handle slingshot shot
  socket.on('shoot', (data) => {
    // Rate limiting check
    if (!checkRateLimit(socket.id, 'shoot')) {
      socket.emit('error', { message: 'Too many shots. Please wait.' });
      return;
    }

    const room = gameRooms.get(socket.roomCode);
    if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.PLAYING) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.playerNumber !== room.currentPlayer + 1) return;

    // Clear the turn timer since player took action
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }

    // Track projectile for server-side validation
    const projectileId = `${socket.id}-${Date.now()}`;
    const projectile = {
      id: projectileId,
      playerNumber: player.playerNumber,
      startPos: data.startPos,
      velocity: data.velocity,
      timestamp: Date.now()
    };
    room.projectiles.push(projectile);

    // Remove projectile after lifetime expires
    setTimeout(() => {
      room.projectiles = room.projectiles.filter(p => p.id !== projectileId);
    }, GAME_CONFIG.SLINGSHOT.projectileLifetime);

    // Broadcast shot to all players
    io.to(socket.roomCode).emit('shot', {
      playerId: socket.id,
      playerNumber: player.playerNumber,
      trajectory: data,
      startPos: data.startPos,
      velocity: data.velocity,
      projectileId: projectileId
    });

    // Switch turns after a delay (to allow shot to complete)
    setTimeout(() => {
      switchTurn(socket.roomCode);
    }, GAME_CONFIG.UI_TIMING.shotDelay);
  });

  // Handle treasure destruction (win condition)
  socket.on('treasureDestroyed', (data) => {
    const room = gameRooms.get(socket.roomCode);
    if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.PLAYING) return;

    // Validate the egg destruction
    const destroyedEggPlayer = data.eggPlayer;
    const winnerNumber = data.destroyedBy;

    // Basic validation
    if (!destroyedEggPlayer || !winnerNumber) {
      console.log('Invalid treasure destruction data');
      return;
    }

    // Check that winner and destroyed egg are different players
    if (destroyedEggPlayer === winnerNumber) {
      console.log('Player cannot destroy their own egg for a win');
      return;
    }

    // Verify treasure exists for the destroyed player
    const treasureKey = `player${destroyedEggPlayer}`;
    if (!room.treasures[treasureKey]) {
      console.log('Treasure does not exist');
      return;
    }

    // Check if there were any active projectiles from the winning player recently
    // (projectiles last 8 seconds, so any projectile within last 8 seconds is valid)
    const now = Date.now();
    const validProjectile = room.projectiles.some(p =>
      p.playerNumber === winnerNumber &&
      (now - p.timestamp) <= GAME_CONFIG.SLINGSHOT.projectileLifetime
    );

    if (!validProjectile) {
      console.log('No valid projectile found for egg destruction');
      socket.emit('error', { message: 'Invalid egg destruction - no projectile detected' });
      return;
    }

    // Validation passed - egg destruction is legitimate
    room.gameState = GAME_CONFIG.GAME_STATES.GAME_OVER;

    // Clear sync interval when game ends
    if (room.syncInterval) {
      clearInterval(room.syncInterval);
      room.syncInterval = null;
    }

    io.to(socket.roomCode).emit('gameOver', {
      winner: winnerNumber,
      reason: 'egg_destroyed'
    });

    console.log(`Game over in room ${socket.roomCode}: Player ${winnerNumber} wins!`);
  });

  // Handle reconnection attempt
  socket.on('reconnectToRoom', (data) => {
    const { roomCode, previousSocketId } = data;

    if (!roomCode || !previousSocketId) {
      socket.emit('error', { message: 'Invalid reconnection data' });
      return;
    }

    const room = gameRooms.get(roomCode);
    const disconnectedInfo = disconnectedPlayers.get(previousSocketId);

    if (!room || !disconnectedInfo) {
      socket.emit('error', { message: 'Cannot reconnect: room or session not found' });
      return;
    }

    // Verify the room code matches
    if (disconnectedInfo.roomCode !== roomCode) {
      socket.emit('error', { message: 'Invalid reconnection attempt' });
      return;
    }

    // Update player socket ID
    const player = room.players.find(p => p.playerNumber === disconnectedInfo.playerNumber);
    if (player) {
      player.id = socket.id;
      socket.join(roomCode);
      socket.roomCode = roomCode;

      // Remove from disconnected list
      disconnectedPlayers.delete(previousSocketId);

      // Notify player of successful reconnection
      socket.emit('reconnected', {
        roomCode: roomCode,
        playerNumber: disconnectedInfo.playerNumber,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer + 1
      });

      // Notify other players
      io.to(roomCode).emit('playerReconnected', {
        playerNumber: disconnectedInfo.playerNumber
      });

      console.log(`Player ${socket.id} reconnected to room ${roomCode} as Player ${disconnectedInfo.playerNumber}`);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (socket.roomCode) {
      const room = gameRooms.get(socket.roomCode);
      if (room) {
        const player = room.players.find(p => p.id === socket.id);

        if (player) {
          // Store disconnection info for potential reconnection
          disconnectedPlayers.set(socket.id, {
            roomCode: socket.roomCode,
            playerNumber: player.playerNumber,
            timestamp: Date.now()
          });

          // Set timeout to permanently remove player if they don't reconnect
          setTimeout(() => {
            const stillDisconnected = disconnectedPlayers.has(socket.id);
            if (stillDisconnected) {
              console.log(`Player ${socket.id} did not reconnect, removing permanently`);
              disconnectedPlayers.delete(socket.id);
              cleanupRateLimit(socket.id);

              const currentRoom = gameRooms.get(socket.roomCode);
              if (currentRoom) {
                // Clear any active timers to prevent memory leaks
                if (currentRoom.buildTimer) {
                  clearTimeout(currentRoom.buildTimer);
                  currentRoom.buildTimer = null;
                }
                if (currentRoom.turnTimer) {
                  clearTimeout(currentRoom.turnTimer);
                  currentRoom.turnTimer = null;
                }
                if (currentRoom.syncInterval) {
                  clearInterval(currentRoom.syncInterval);
                  currentRoom.syncInterval = null;
                }

                currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);

                if (currentRoom.players.length === 0) {
                  // Delete room if empty
                  gameRooms.delete(socket.roomCode);
                  console.log(`Room ${socket.roomCode} deleted (empty)`);
                } else {
                  // Notify remaining players of permanent disconnect
                  io.to(socket.roomCode).emit('playerLeft', {
                    playerId: socket.id,
                    playersCount: currentRoom.players.length
                  });
                }
              }
            }
          }, RECONNECTION_TIMEOUT);

          // Notify other players of temporary disconnect
          io.to(socket.roomCode).emit('playerDisconnected', {
            playerId: socket.id,
            playerNumber: player.playerNumber,
            canReconnect: true,
            timeout: RECONNECTION_TIMEOUT
          });
        }
      }
    }
  });
});

// Game flow functions
function startCoinFlip(roomCode) {
  const room = gameRooms.get(roomCode);
  if (!room) return;
  
  room.gameState = GAME_CONFIG.GAME_STATES.COIN_FLIP;
  
  // Simulate coin flip
  const firstPlayer = Math.floor(Math.random() * 2);
  room.currentPlayer = firstPlayer;
  
  setTimeout(() => {
    io.to(roomCode).emit('coinFlipResult', { 
      firstPlayer: firstPlayer + 1,
      message: `Player ${firstPlayer + 1} goes first!` 
    });
    
    setTimeout(() => {
      startBuildPhase(roomCode);
    }, 2000);
  }, 3000);
}

function startBuildPhase(roomCode) {
  const room = gameRooms.get(roomCode);
  if (!room) return;
  
  room.gameState = GAME_CONFIG.GAME_STATES.BUILDING;
  
  io.to(roomCode).emit('buildPhaseStart', {
    duration: GAME_CONFIG.BUILD_PHASE_DURATION,
    blocksAllowed: GAME_CONFIG.BLOCKS_PER_PLAYER
  });
  
  // Set timer for build phase
  room.buildTimer = setTimeout(() => {
    startGamePhase(roomCode);
  }, GAME_CONFIG.BUILD_PHASE_DURATION);
}

function startGamePhase(roomCode) {
  const room = gameRooms.get(roomCode);
  if (!room) return;

  room.gameState = GAME_CONFIG.GAME_STATES.PLAYING;

  io.to(roomCode).emit('gamePhaseStart', {
    currentPlayer: room.currentPlayer + 1
  });

  // Start turn timer for first player
  room.turnTimer = setTimeout(() => {
    io.to(roomCode).emit('turnTimeout', {
      player: room.currentPlayer + 1
    });
    switchTurn(roomCode);
  }, GAME_CONFIG.TURN_DURATION);

  // Start periodic state synchronization (every 5 seconds during gameplay)
  room.syncInterval = setInterval(() => {
    syncGameState(roomCode);
  }, 5000);
}

// Periodic state synchronization to keep clients in sync
function syncGameState(roomCode) {
  const room = gameRooms.get(roomCode);
  if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.PLAYING) {
    // Stop sync if game is not in playing state
    if (room && room.syncInterval) {
      clearInterval(room.syncInterval);
      room.syncInterval = null;
    }
    return;
  }

  // Send current game state to all clients
  io.to(roomCode).emit('stateSync', {
    currentPlayer: room.currentPlayer + 1,
    gameState: room.gameState,
    treasuresExist: {
      player1: room.treasures.player1 !== null,
      player2: room.treasures.player2 !== null
    }
  });
}

function switchTurn(roomCode) {
  const room = gameRooms.get(roomCode);
  if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.PLAYING) return;

  // Clear existing turn timer
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
  }

  room.currentPlayer = (room.currentPlayer + 1) % 2;

  io.to(roomCode).emit('turnSwitch', {
    currentPlayer: room.currentPlayer + 1
  });

  // Set new turn timer - auto-switch if player doesn't shoot within TURN_DURATION
  room.turnTimer = setTimeout(() => {
    io.to(roomCode).emit('turnTimeout', {
      player: room.currentPlayer + 1
    });
    switchTurn(roomCode);
  }, GAME_CONFIG.TURN_DURATION);
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Doodle Duals server running on http://localhost:${PORT}`);
  console.log('Ready for Johannesburg ↔ Middleburg battles! 🚀');
});