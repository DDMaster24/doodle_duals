# Development Workflow Guide

## 🎯 Using Claude Code (Browser) with Local Testing

This guide explains how to work efficiently using Claude Code in the browser while testing changes locally.

---

## 🚀 Initial Setup (One-Time)

### 1. Pull the Latest Changes

```bash
cd doodle_duals
git pull origin claude/greeting-session-011CUpLfoUQ25JRZ6gaNGPaw
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

**Keep this terminal window open!** The server will auto-restart when files change.

You should see:
```
🎮 Doodle Duals server running on http://localhost:3000
Ready for Johannesburg ↔ Middleburg battles! 🚀
```

---

## 🔄 Working with Claude (Ongoing)

### The Workflow:

1. **You:** Tell Claude what feature to build or bug to fix (in browser)
2. **Claude:** Makes changes in Claude Code (browser - uses your $250 credits ✅)
3. **Claude:** Commits and pushes to GitHub
4. **Claude:** Says: "✅ Changes pushed! Please pull and test"
5. **You:** Pull changes on your local machine (see methods below)
6. **Server:** Auto-restarts with new changes
7. **You:** Test at http://localhost:3000
8. **You:** Give feedback to Claude
9. **Repeat!**

---

## 📥 How to Pull Changes

### Option A: Quick Update Script (Easiest)

```bash
./quick-update.sh
```

This script:
- Pulls latest changes
- Installs any new dependencies
- Tells you when ready to test

### Option B: Manual Git Pull

```bash
git pull origin claude/greeting-session-011CUpLfoUQ25JRZ6gaNGPaw
```

### Option C: Git Pull (Short)

If you've set up branch tracking:
```bash
git pull
```

---

## 🧪 Testing Your Changes

Once you've pulled changes and the server auto-restarted:

1. Open http://localhost:3000 in your browser
2. Open another tab/window (for 2-player testing)
3. Follow the testing guide in `TESTING.md`

---

## 🔍 Monitoring Changes

### Watch the Server Terminal

After pulling changes, watch your `npm run dev` terminal:

```
[nodemon] restarting due to changes...
[nodemon] starting `node server/server.js`
🎮 Doodle Duals server running on http://localhost:3000
Ready for Johannesburg ↔ Middleburg battles! 🚀
```

This means the server picked up your changes!

### Check Git Status

See what changed:
```bash
git log -1 --stat
```

See differences:
```bash
git diff HEAD~1
```

---

## 📋 Common Commands

```bash
# See current branch
git branch

# See latest commits
git log --oneline -5

# Discard local changes (if needed)
git reset --hard HEAD

# Switch to main branch
git checkout main

# Switch back to Claude's branch
git checkout claude/greeting-session-011CUpLfoUQ25JRZ6gaNGPaw

# Create your own feature branch
git checkout -b my-feature

# Stash changes temporarily
git stash
git stash pop
```

---

## 💡 Pro Tips

### Keep Dev Server Running

The `npm run dev` command uses `nodemon` which:
- ✅ Auto-restarts on file changes
- ✅ Shows errors immediately
- ✅ Much faster than stopping/starting manually

### Two Terminal Windows

Keep two terminals open:
```
Terminal 1: npm run dev (always running)
Terminal 2: git pull (when Claude pushes changes)
```

### Browser Dev Tools

Press `F12` in your browser to:
- See console logs
- Debug JavaScript errors
- Monitor network requests
- Check localStorage (for reconnection feature)

### Quick Refresh Workflow

After pulling changes:
```bash
# If server didn't restart automatically:
Ctrl+C  # Stop server
npm run dev  # Restart

# In browser:
Ctrl+Shift+R  # Hard refresh (clears cache)
```

---

## 🐛 Troubleshooting

### "Changes not appearing"

```bash
# 1. Make sure you pulled
git log -1

# 2. Hard refresh browser
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)

# 3. Clear browser cache
Browser Settings → Clear Cache

# 4. Restart server
Ctrl+C
npm run dev
```

### "Merge conflicts"

```bash
# Option 1: Keep Claude's changes (discard yours)
git reset --hard origin/claude/greeting-session-011CUpLfoUQ25JRZ6gaNGPaw

# Option 2: Stash your changes and pull
git stash
git pull
git stash pop  # Apply your changes back
```

### "Port 3000 in use"

```bash
# Find process using port 3000
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill it
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows
```

### "Module not found"

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 🎯 Testing Checklist

After each pull, quickly test:

- [ ] Server starts without errors
- [ ] Browser loads http://localhost:3000
- [ ] Can create a room
- [ ] Can join a room (open second tab)
- [ ] New feature works as expected
- [ ] No console errors in browser (F12)

---

## 💰 Credit Usage

You're using **Claude Code in the browser** which uses your $250 free credits:

- ✅ Works in browser (uses credits)
- ✅ No CLI installation needed
- ✅ All features available
- ✅ Maximum your free credits!

---

## 🚀 Example Session

```bash
# Morning setup
cd doodle_duals
git pull
npm run dev

# Claude says: "✅ Added new power-up feature! Please pull and test"
./quick-update.sh
# Server auto-restarts
# Test at http://localhost:3000

# Claude says: "✅ Fixed the bug you reported! Please pull and test"
./quick-update.sh
# Test again

# End of day
Ctrl+C  # Stop server
git status  # See if you have any local changes
```

---

## 📚 Additional Resources

- `TESTING.md` - Comprehensive testing guide
- `README.md` - Project overview
- Browser console (F12) - Real-time debugging
- Server terminal - Error messages and logs

---

## 🎮 Ready to Code!

You're all set! This workflow lets you:
- ✅ Use your $250 in free browser credits
- ✅ Test changes immediately on your machine
- ✅ Iterate quickly with Claude's help
- ✅ Keep your local environment in sync

Happy coding! 🚀
