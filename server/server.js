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
    blocks: {
      player1: [],
      player2: []
    },
    treasures: {
      player1: null,
      player2: null
    },
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
    const room = gameRooms.get(socket.roomCode);
    if (!room || room.gameState !== GAME_CONFIG.GAME_STATES.PLAYING) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.playerNumber !== room.currentPlayer + 1) return;

    // Clear the turn timer since player took action
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
    }

    // Broadcast shot to all players
    io.to(socket.roomCode).emit('shot', {
      playerId: socket.id,
      playerNumber: player.playerNumber,
      trajectory: data,
      startPos: data.startPos,
      velocity: data.velocity
    });

    // Switch turns after a delay (to allow shot to complete)
    setTimeout(() => {
      switchTurn(socket.roomCode);
    }, GAME_CONFIG.UI_TIMING.shotDelay);
  });

  // Handle treasure destruction (win condition)
  socket.on('treasureDestroyed', (data) => {
    const room = gameRooms.get(socket.roomCode);
    if (!room) return;
    
    const winnerNumber = data.destroyedBy;
    room.gameState = GAME_CONFIG.GAME_STATES.GAME_OVER;
    
    io.to(socket.roomCode).emit('gameOver', {
      winner: winnerNumber,
      reason: 'egg_destroyed'
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (socket.roomCode) {
      const room = gameRooms.get(socket.roomCode);
      if (room) {
        // Clear any active timers to prevent memory leaks
        if (room.buildTimer) {
          clearTimeout(room.buildTimer);
          room.buildTimer = null;
        }
        if (room.turnTimer) {
          clearTimeout(room.turnTimer);
          room.turnTimer = null;
        }

        room.players = room.players.filter(p => p.id !== socket.id);

        if (room.players.length === 0) {
          // Delete room if empty
          gameRooms.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted (empty)`);
        } else {
          // Notify remaining players
          io.to(socket.roomCode).emit('playerDisconnected', {
            playerId: socket.id,
            playersCount: room.players.length
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