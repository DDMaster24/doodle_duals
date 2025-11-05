# Testing Guide for Doodle Duals

This guide will help you test all the new features and improvements we've made to Doodle Duals.

## Prerequisites

- Node.js installed (v18 or higher)
- Two browser windows or tabs for multiplayer testing
- Terminal access

## Starting the Server

1. Open a terminal in the project directory
2. Run the following command:
   ```bash
   npm start
   ```
3. You should see:
   ```
   🎮 Doodle Duals server running on http://localhost:3000
   Ready for Johannesburg ↔ Middleburg battles! 🚀
   ```

## Testing Scenarios

### 1. Basic Multiplayer Functionality

**Test:** Create and join a room

1. Open `http://localhost:3000` in Browser Window 1
2. Click "Create Room"
3. Copy the 6-character room code displayed
4. Open `http://localhost:3000` in Browser Window 2
5. Click "Join Room"
6. Enter the room code
7. Both players should see "2/2 players connected"

**Expected Result:** ✅ Both players connected successfully

---

### 2. Turn Duration Enforcement (NEW)

**Test:** Turn timeout after 30 seconds

1. Start a game with 2 players (follow steps above)
2. Click "Ready" on both windows
3. Wait for coin flip and build phase
4. During the gameplay phase, DON'T shoot for 30 seconds
5. After 30 seconds, the turn should automatically switch

**Expected Result:** ✅ Turn switches automatically after timeout

---

### 3. Server-Side Validation (NEW)

**Test:** Block placement validation

1. Start a game with 2 players
2. During build phase, try to place blocks
3. Blocks should only be placeable in your designated area:
   - Player 1: Left side (x: 0-400)
   - Player 2: Right side (x: 800-1200)

**Expected Result:** ✅ Blocks cannot be placed outside designated area

**Test:** Rate limiting

1. During build phase, rapidly click to place many blocks quickly
2. After ~20 blocks in 5 seconds, you should see an error: "Too many actions. Please slow down."

**Expected Result:** ✅ Rate limiter prevents spam

---

### 4. Reconnection Support (NEW)

**Test:** Disconnect and reconnect

1. Start a game with 2 players and reach gameplay phase
2. Close one browser window (or refresh the page)
3. Within 30 seconds, open `http://localhost:3000` again
4. The game should automatically reconnect you

**Expected Result:** ✅ Player reconnects and resumes game

**Note:** You have 30 seconds to reconnect before being permanently removed

---

### 5. Egg Destruction Validation (NEW)

**Test:** Server validates egg destruction

1. Start a game and reach gameplay phase
2. Shoot at opponent's egg and hit it
3. Game should end with winner announced
4. Check server console - you should see: "Game over in room XXXXXX: Player X wins!"

**Expected Result:** ✅ Server validates projectile exists before declaring winner

---

### 6. State Synchronization (NEW)

**Test:** Periodic sync keeps players in sync

1. Start a game with 2 players
2. Play a few turns
3. Check browser console (F12) - you should see state sync messages every 5 seconds
4. Both players should always show the same "current turn" indicator

**Expected Result:** ✅ Game state stays synchronized between clients

---

### 7. Complete Game Flow

**Test:** Full game from start to finish

1. Player 1 creates room
2. Player 2 joins with room code
3. Both players click "Ready"
4. Coin flip determines first player
5. Build phase: Each player places blocks and egg (30 seconds)
6. Gameplay phase: Take turns shooting at opponent's egg
7. First to destroy opponent's egg wins
8. Click "Play Again" or "Main Menu" to restart

**Expected Result:** ✅ Complete game flow works smoothly

---

## Advanced Testing

### Memory Leak Testing

1. Play multiple complete games (create → play → finish)
2. Check browser memory usage in Developer Tools (F12 → Memory tab)
3. Memory should not continuously increase between games

**Expected Result:** ✅ No significant memory leaks

### CORS Security Testing

1. Set environment variable:
   ```bash
   ALLOWED_ORIGINS=http://localhost:3000 npm start
   ```
2. Try connecting from `http://localhost:3000` → Should work ✅
3. Try connecting from a different origin → Should be blocked ✅

---

## What to Look For

### ✅ Good Signs:
- Smooth gameplay with no lag
- Turn timer displays correctly
- Blocks can't be placed outside designated areas
- Reconnection works within 30 seconds
- Server console shows validation messages
- No errors in browser console (F12)

### ❌ Issues to Report:
- Players can place blocks anywhere
- Turn timer never expires
- Reconnection doesn't work
- Server crashes or errors
- Game becomes unresponsive
- Memory usage keeps growing

---

## Troubleshooting

**Issue:** Can't connect to server
- **Solution:** Make sure server is running (`npm start`)
- Check that port 3000 is not in use

**Issue:** "Room not found" error
- **Solution:** Make sure room code is exactly 6 characters
- Room might have expired if empty

**Issue:** Can't reconnect
- **Solution:** Must reconnect within 30 seconds of disconnect
- Make sure you're using the same room code

**Issue:** Blocks not appearing for opponent
- **Solution:** Check network connection
- Refresh both browser windows

---

## Performance Metrics

### Expected Performance:
- **Server Response Time:** <50ms for most operations
- **Turn Switch Delay:** 3 seconds (configurable)
- **Reconnection Window:** 30 seconds
- **State Sync Frequency:** Every 5 seconds during gameplay
- **Rate Limits:**
  - Block placement: 20 per 5 seconds
  - Shooting: 3 per 10 seconds
  - General actions: 50 per 5 seconds

---

## Testing Checklist

Use this checklist to ensure all features work:

- [ ] Server starts without errors
- [ ] Room creation works
- [ ] Room joining works (with valid code)
- [ ] Invalid room codes are rejected
- [ ] Build phase lasts 30 seconds
- [ ] Blocks can be placed
- [ ] Blocks are validated (area restrictions)
- [ ] Egg can be placed
- [ ] Turn timer works (30 seconds)
- [ ] Shooting mechanics work
- [ ] Opponent shots are visible
- [ ] Egg destruction ends game correctly
- [ ] Winner is announced correctly
- [ ] Reconnection works (within 30 seconds)
- [ ] Rate limiting prevents spam
- [ ] State sync keeps players in sync
- [ ] Game over screen displays
- [ ] "Play Again" resets properly
- [ ] No memory leaks after multiple games

---

## Development Mode

For easier testing during development:

```bash
npm run dev
```

This uses `nodemon` which auto-restarts the server when you make changes.

---

## Need Help?

If you encounter any issues:

1. Check the browser console (F12) for errors
2. Check the server terminal for errors
3. Make sure both players are in the same room
4. Try refreshing both browser windows
5. Restart the server

---

Happy testing! 🎮🚀
