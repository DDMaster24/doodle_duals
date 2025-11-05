#!/bin/bash

# Quick update script for Doodle Duals development
# Run this after Claude pushes changes to GitHub

echo "🔄 Pulling latest changes from GitHub..."
git pull origin claude/greeting-session-011CUpLfoUQ25JRZ6gaNGPaw

if [ $? -eq 0 ]; then
    echo "✅ Successfully updated!"
    echo "📦 Checking for new dependencies..."
    npm install
    echo ""
    echo "🎮 Your dev server should auto-restart now!"
    echo "   Open: http://localhost:3000"
else
    echo "❌ Failed to pull changes. Check for conflicts."
    exit 1
fi
