// Main game script with Matter.js physics and Socket.io multiplayer
class DoodleDualsGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.socket = io();
        
        // Game state
        this.gameState = GAME_CONFIG.GAME_STATES.WAITING;
        this.playerNumber = null;
        this.roomCode = null;
        this.currentPlayer = 1;
        this.myTurn = false;
        
        // Building state
        this.selectedBlockType = null;
        this.blockCounts = { ...GAME_CONFIG.BLOCKS_PER_PLAYER };
        this.buildTimeLeft = 0;
        
        // Physics world
        this.engine = null;
        this.world = null;
        this.render = null;
        this.mouseConstraint = null;
        
        // Game objects
        this.blocks = [];
        this.treasures = { player1: null, player2: null };
        this.slingshot = null;
        this.projectile = null;
        this.trajectoryPoints = [];
        
        // Mouse/touch state
        this.mouse = { x: 0, y: 0, isDown: false };
        this.slingshotPower = 0;
        this.slingshotAngle = 0;
        this.isDraggingSlingshot = false;
        
        this.initializePhysics();
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    initializePhysics() {
        // Create physics engine
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        
        // Configure gravity
        this.engine.world.gravity.y = GAME_CONFIG.PHYSICS.gravity;
        
        // Create ground
        const ground = Matter.Bodies.rectangle(
            GAME_CONFIG.WORLD.width / 2,
            GAME_CONFIG.WORLD.height - GAME_CONFIG.WORLD.groundHeight / 2,
            GAME_CONFIG.WORLD.width,
            GAME_CONFIG.WORLD.groundHeight,
            { 
                isStatic: true,
                render: { fillStyle: '#8B4513' }
            }
        );
        Matter.World.add(this.world, ground);
        
        // Create walls
        const leftWall = Matter.Bodies.rectangle(-10, GAME_CONFIG.WORLD.height / 2, 20, GAME_CONFIG.WORLD.height, { isStatic: true });
        const rightWall = Matter.Bodies.rectangle(GAME_CONFIG.WORLD.width + 10, GAME_CONFIG.WORLD.height / 2, 20, GAME_CONFIG.WORLD.height, { isStatic: true });
        Matter.World.add(this.world, [leftWall, rightWall]);
        
        // Create slingshot positions
        this.slingshots = {
            player1: { x: 100, y: GAME_CONFIG.WORLD.height - 200, width: 20, height: 60 },
            player2: { x: GAME_CONFIG.WORLD.width - 100, y: GAME_CONFIG.WORLD.height - 200, width: 20, height: 60 }
        };

        // Setup collision detection for eggs (only once)
        this.setupCollisionDetection();

        // Start render loop
        this.startRenderLoop();
    }

    setupCollisionDetection() {
        // Add collision detection for egg fragility - set up only once
        Matter.Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                const { bodyA, bodyB } = pair;

                if ((bodyA.isEgg || bodyB.isEgg) && !bodyA.isStatic && !bodyB.isStatic) {
                    const egg = bodyA.isEgg ? bodyA : bodyB;
                    const other = bodyA.isEgg ? bodyB : bodyA;

                    // Check impact force
                    if (other.speed > 2 || other.isProjectile) {
                        this.breakEgg(egg);
                    }
                }
            });
        });
    }

    startRenderLoop() {
        const animate = () => {
            Matter.Engine.update(this.engine);
            this.renderGame();
            requestAnimationFrame(animate);
        };
        animate();
    }

    renderGame() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#87CEEB');
        gradient.addColorStop(0.5, '#98FB98');
        gradient.addColorStop(1, '#8B4513');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw ground
        this.ctx.fillStyle = '#654321';
        this.ctx.fillRect(0, GAME_CONFIG.WORLD.height - GAME_CONFIG.WORLD.groundHeight, 
                         GAME_CONFIG.WORLD.width, GAME_CONFIG.WORLD.groundHeight);
        
        // Draw player areas during build phase
        if (this.gameState === GAME_CONFIG.GAME_STATES.BUILDING) {
            this.drawPlayerAreas();
        }
        
        // Draw all physics bodies
        this.drawBodies();
        
        // Draw slingshots
        this.drawSlingshots();
        
        // Draw trajectory preview
        if (this.isDraggingSlingshot && this.myTurn) {
            this.drawTrajectory();
        }
        
        // Draw UI elements on canvas
        this.drawCanvasUI();
    }

    drawPlayerAreas() {
        // Player 1 area (left)
        this.ctx.fillStyle = this.playerNumber === 1 ? 'rgba(76, 205, 196, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(GAME_CONFIG.PLAYER_AREAS.player1.x, 0, 
                         GAME_CONFIG.PLAYER_AREAS.player1.width, GAME_CONFIG.WORLD.height - GAME_CONFIG.WORLD.groundHeight);
        
        // Player 2 area (right)
        this.ctx.fillStyle = this.playerNumber === 2 ? 'rgba(76, 205, 196, 0.3)' : 'rgba(255, 255, 255, 0.1)';
        this.ctx.fillRect(GAME_CONFIG.PLAYER_AREAS.player2.x, 0, 
                         GAME_CONFIG.PLAYER_AREAS.player2.width, GAME_CONFIG.WORLD.height - GAME_CONFIG.WORLD.groundHeight);
        
        // Draw area labels
        this.ctx.fillStyle = 'white';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Player 1 Area', GAME_CONFIG.PLAYER_AREAS.player1.width / 2, 30);
        this.ctx.fillText('Player 2 Area', GAME_CONFIG.PLAYER_AREAS.player2.x + GAME_CONFIG.PLAYER_AREAS.player2.width / 2, 30);
    }

    drawBodies() {
        const bodies = Matter.Composite.allBodies(this.world);
        
        bodies.forEach(body => {
            if (body.isStatic) return; // Skip static bodies (ground, walls)
            
            const pos = body.position;
            const angle = body.angle;
            
            this.ctx.save();
            this.ctx.translate(pos.x, pos.y);
            this.ctx.rotate(angle);
            
            // Determine body type and draw accordingly
            if (body.blockType) {
                this.drawBlock(body);
            } else if (body.isEgg) {
                this.drawEgg(body);
            } else if (body.isProjectile) {
                this.drawProjectile(body);
            }
            
            this.ctx.restore();
        });
    }

    drawBlock(body) {
        const type = body.blockType;
        const size = GAME_CONFIG.BLOCK_SIZES[type];
        
        switch (type) {
            case 'square':
                this.ctx.fillStyle = '#e74c3c';
                this.ctx.fillRect(-size.width/2, -size.height/2, size.width, size.height);
                this.ctx.strokeStyle = '#c0392b';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-size.width/2, -size.height/2, size.width, size.height);
                break;
                
            case 'rectangle':
                this.ctx.fillStyle = '#3498db';
                this.ctx.fillRect(-size.width/2, -size.height/2, size.width, size.height);
                this.ctx.strokeStyle = '#2980b9';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-size.width/2, -size.height/2, size.width, size.height);
                break;
                
            case 'horizontalBar':
                this.ctx.fillStyle = '#9b59b6';
                this.ctx.fillRect(-size.width/2, -size.height/2, size.width, size.height);
                this.ctx.strokeStyle = '#8e44ad';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-size.width/2, -size.height/2, size.width, size.height);
                break;
                
            case 'verticalBar':
                this.ctx.fillStyle = '#e67e22';
                this.ctx.fillRect(-size.width/2, -size.height/2, size.width, size.height);
                this.ctx.strokeStyle = '#d35400';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(-size.width/2, -size.height/2, size.width, size.height);
                break;
                
            case 'triangle':
                this.ctx.fillStyle = '#2ecc71';
                this.ctx.beginPath();
                this.ctx.moveTo(0, -size.height/2);
                this.ctx.lineTo(-size.width/2, size.height/2);
                this.ctx.lineTo(size.width/2, size.height/2);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.strokeStyle = '#27ae60';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
        }
    }

    drawEgg(body) {
        const size = GAME_CONFIG.BLOCK_SIZES.egg;
        
        if (body.isBroken) {
            // Draw broken egg
            this.ctx.fillStyle = '#8B4513';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, size.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add crack lines
            this.ctx.strokeStyle = '#654321';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(-size.radius/2, -size.radius/2);
            this.ctx.lineTo(size.radius/2, size.radius/2);
            this.ctx.moveTo(size.radius/2, -size.radius/2);
            this.ctx.lineTo(-size.radius/2, size.radius/2);
            this.ctx.stroke();
        } else {
            // Draw intact egg
            this.ctx.fillStyle = '#f9f9f9';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, size.radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add egg pattern
            this.ctx.fillStyle = '#f1c40f';
            this.ctx.font = '20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('🥚', 0, 5);
        }
    }

    drawProjectile(body) {
        this.ctx.fillStyle = '#8b4513';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Add angry bird face
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(-3, -2, 2, 2);
        this.ctx.fillRect(1, -2, 2, 2);
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(-2, -1, 1, 1);
        this.ctx.fillRect(2, -1, 1, 1);
    }

    drawSlingshots() {
        // Draw player 1 slingshot
        this.drawSlingshot(this.slingshots.player1, 1);
        
        // Draw player 2 slingshot
        this.drawSlingshot(this.slingshots.player2, 2);
    }

    drawSlingshot(slingshot, playerNum) {
        this.ctx.save();
        
        // Highlight if it's this player's turn
        if (this.currentPlayer === playerNum && this.gameState === GAME_CONFIG.GAME_STATES.PLAYING) {
            this.ctx.shadowColor = '#4ecdc4';
            this.ctx.shadowBlur = 10;
        }
        
        // Draw slingshot frame
        this.ctx.fillStyle = '#8b4513';
        this.ctx.fillRect(slingshot.x - slingshot.width/2, slingshot.y - slingshot.height, 
                         slingshot.width, slingshot.height);
        
        // Draw elastic bands
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(slingshot.x - slingshot.width/2, slingshot.y - slingshot.height);
        this.ctx.lineTo(slingshot.x, slingshot.y - slingshot.height/2);
        this.ctx.moveTo(slingshot.x + slingshot.width/2, slingshot.y - slingshot.height);
        this.ctx.lineTo(slingshot.x, slingshot.y - slingshot.height/2);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    drawTrajectory() {
        if (this.trajectoryPoints.length < 2) return;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        
        for (let i = 0; i < this.trajectoryPoints.length; i++) {
            const point = this.trajectoryPoints[i];
            if (i === 0) {
                this.ctx.moveTo(point.x, point.y);
            } else {
                this.ctx.lineTo(point.x, point.y);
            }
        }
        
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawCanvasUI() {
        // Draw player labels
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('Player 1', 20, 30);
        this.ctx.textAlign = 'right';
        this.ctx.fillText('Player 2', GAME_CONFIG.WORLD.width - 20, 30);
        
        // Draw current player indicator during battle phase
        if (this.gameState === GAME_CONFIG.GAME_STATES.PLAYING) {
            this.ctx.textAlign = 'center';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.fillStyle = this.myTurn ? '#4ecdc4' : '#ccc';
            this.ctx.fillText(
                this.myTurn ? 'YOUR TURN' : `PLAYER ${this.currentPlayer}'S TURN`,
                GAME_CONFIG.WORLD.width / 2, 
                50
            );
        }
    }

    // Block placement during build phase
    createBlock(type, x, y) {
        const size = GAME_CONFIG.BLOCK_SIZES[type];
        let body;
        
        const options = {
            restitution: GAME_CONFIG.PHYSICS.bounceRestitution,
            friction: GAME_CONFIG.PHYSICS.frictionStatic,
            frictionAir: GAME_CONFIG.PHYSICS.airResistance,
            render: { fillStyle: this.getBlockColor(type) }
        };
        
        switch (type) {
            case 'square':
                body = Matter.Bodies.rectangle(x, y, size.width, size.height, options);
                break;
            case 'rectangle':
                body = Matter.Bodies.rectangle(x, y, size.width, size.height, options);
                break;
            case 'horizontalBar':
                body = Matter.Bodies.rectangle(x, y, size.width, size.height, options);
                break;
            case 'verticalBar':
                body = Matter.Bodies.rectangle(x, y, size.width, size.height, options);
                break;
            case 'triangle':
                // Create triangle using vertices
                const vertices = [
                    { x: 0, y: -size.height/2 },
                    { x: -size.width/2, y: size.height/2 },
                    { x: size.width/2, y: size.height/2 }
                ];
                body = Matter.Bodies.fromVertices(x, y, vertices, options);
                break;
        }
        
        if (body) {
            body.blockType = type;
            body.playerNumber = this.playerNumber;
            Matter.World.add(this.world, body);
            this.blocks.push(body);
            return body;
        }
        return null;
    }

    createEgg(x, y) {
        const size = GAME_CONFIG.BLOCK_SIZES.egg;
        const body = Matter.Bodies.circle(x, y, size.radius, {
            restitution: 0.3,
            friction: 0.8,
            density: 0.001, // Very light and fragile
            render: { fillStyle: '#f1c40f' }
        });
        
        body.isEgg = true;
        body.playerNumber = this.playerNumber;
        body.health = 1; // Very fragile - breaks on any significant impact
        Matter.World.add(this.world, body);

        this.treasures[`player${this.playerNumber}`] = body;

        return body;
    }

    breakEgg(egg) {
        if (egg.isBroken) return;
        
        egg.isBroken = true;
        
        // Visual crack effect
        egg.render.fillStyle = '#8B4513';
        
        // Notify server and end game
        const winnerNumber = egg.playerNumber === 1 ? 2 : 1;
        this.socket.emit('treasureDestroyed', {
            destroyedBy: winnerNumber,
            eggPlayer: egg.playerNumber
        });
        
        setTimeout(() => {
            Matter.World.remove(this.world, egg);
        }, 1000);
    }

    getBlockColor(type) {
        const colors = {
            square: '#e74c3c',
            rectangle: '#3498db',
            triangle: '#2ecc71',
            horizontalBar: '#9b59b6',
            verticalBar: '#e67e22'
        };
        return colors[type] || '#fff';
    }

    // Slingshot mechanics
    calculateTrajectory(startX, startY, velocityX, velocityY) {
        const points = [];
        const timeStep = 0.1;
        const maxTime = 3.0;

        // Use Matter.js gravity value directly - no arbitrary multiplier
        const gravity = GAME_CONFIG.PHYSICS.gravity;

        for (let t = 0; t < maxTime; t += timeStep) {
            const x = startX + velocityX * t;
            // Standard physics formula: y = y0 + vy*t + 0.5*g*t^2
            const y = startY + velocityY * t + 0.5 * gravity * t * t;

            points.push({ x, y });

            // Stop if trajectory goes off screen or hits ground
            if (x < 0 || x > GAME_CONFIG.WORLD.width ||
                y > GAME_CONFIG.WORLD.height - GAME_CONFIG.WORLD.groundHeight) {
                break;
            }
        }

        return points;
    }

    shoot(power, angle) {
        if (!this.myTurn || this.projectile) return;
        
        const slingshot = this.slingshots[`player${this.playerNumber}`];
        const velocity = power * 0.8; // Increased power multiplier
        const velocityX = Math.cos(angle) * velocity;
        const velocityY = Math.sin(angle) * velocity;
        
        // Create projectile
        this.projectile = Matter.Bodies.circle(slingshot.x, slingshot.y - 30, 8, {
            restitution: 0.6,
            friction: 0.3,
            frictionAir: 0.01
        });
        
        this.projectile.isProjectile = true;
        this.projectile.playerNumber = this.playerNumber;
        
        Matter.World.add(this.world, this.projectile);
        Matter.Body.setVelocity(this.projectile, { x: velocityX, y: velocityY });
        
        // Send shot to server with more data for synchronization
        this.socket.emit('shoot', {
            power: power,
            angle: angle,
            velocity: { x: velocityX, y: velocityY },
            startPos: { x: slingshot.x, y: slingshot.y - 30 }
        });
        
        // Remove projectile after some time to prevent indefinite flight
        const projectileRef = this.projectile;
        setTimeout(() => {
            if (projectileRef && Matter.Composite.get(this.world, projectileRef.id, 'body')) {
                Matter.World.remove(this.world, projectileRef);
                if (this.projectile === projectileRef) {
                    this.projectile = null;
                }
            }
        }, GAME_CONFIG.SLINGSHOT.projectileLifetime);
    }

    // Event handlers
    setupEventListeners() {
        // Canvas mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleMouseDown(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.handleMouseMove(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleMouseUp(e);
        });
        
        // UI button events
        this.setupUIEventListeners();
    }

    setupUIEventListeners() {
        // Main menu buttons
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.socket.emit('createRoom');
        });
        
        document.getElementById('joinRoomBtn').addEventListener('click', () => {
            document.getElementById('joinRoomForm').classList.remove('hidden');
        });
        
        document.getElementById('joinRoomSubmit').addEventListener('click', () => {
            const roomCode = document.getElementById('roomCodeInput').value.toUpperCase();
            if (roomCode.length === 6) {
                this.socket.emit('joinRoom', { roomCode });
            }
        });
        
        // Ready button
        document.getElementById('readyBtn').addEventListener('click', () => {
            this.socket.emit('playerReady');
            document.getElementById('readyBtn').style.display = 'none';
        });
        
        // Block type selection
        document.querySelectorAll('.block-type').forEach(block => {
            block.addEventListener('click', () => {
                if (this.gameState !== GAME_CONFIG.GAME_STATES.BUILDING) return;
                
                const blockType = block.dataset.type;
                const count = this.blockCounts[blockType];
                
                if (count > 0) {
                    this.selectBlockType(blockType);
                }
            });
        });
        
        // Game over buttons
        document.getElementById('playAgainBtn').addEventListener('click', () => {
            location.reload();
        });
        
        document.getElementById('mainMenuBtn').addEventListener('click', () => {
            location.reload();
        });
        
        // Error popup
        document.getElementById('closeError').addEventListener('click', () => {
            document.getElementById('errorMessage').classList.add('hidden');
        });
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
        this.mouse.isDown = true;
        
        if (this.gameState === GAME_CONFIG.GAME_STATES.BUILDING && this.selectedBlockType) {
            this.placeBlock();
        } else if (this.gameState === GAME_CONFIG.GAME_STATES.PLAYING && this.myTurn) {
            this.startSlingshotDrag();
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
        
        if (this.isDraggingSlingshot) {
            this.updateSlingshotAim();
        }
    }

    handleMouseUp(e) {
        this.mouse.isDown = false;
        
        if (this.isDraggingSlingshot) {
            this.releaseSlingshotShot();
        }
    }

    placeBlock() {
        if (!this.selectedBlockType || this.blockCounts[this.selectedBlockType] <= 0) return;
        
        // Check if placement is in player's area
        const playerArea = GAME_CONFIG.PLAYER_AREAS[`player${this.playerNumber}`];
        if (this.mouse.x < playerArea.x || this.mouse.x > playerArea.x + playerArea.width) {
            this.showError('Place blocks in your area only!');
            return;
        }
        
        // Create block or egg
        const block = this.selectedBlockType === 'egg' ? 
            this.createEgg(this.mouse.x, this.mouse.y) :
            this.createBlock(this.selectedBlockType, this.mouse.x, this.mouse.y);
        
        if (block) {
            // Update count
            this.blockCounts[this.selectedBlockType]--;
            this.updateBlockCountDisplay();
            
            // Send to server
            const eventType = this.selectedBlockType === 'egg' ? 'placeTreasure' : 'placeBlock';
            this.socket.emit(eventType, {
                type: this.selectedBlockType,
                x: this.mouse.x,
                y: this.mouse.y
            });
            
            // Deselect if no more blocks of this type
            if (this.blockCounts[this.selectedBlockType] <= 0) {
                this.selectedBlockType = null;
                this.updateBlockSelection();
            }
        }
    }

    startSlingshotDrag() {
        const slingshot = this.slingshots[`player${this.playerNumber}`];
        const distance = Math.sqrt(
            Math.pow(this.mouse.x - slingshot.x, 2) + 
            Math.pow(this.mouse.y - slingshot.y, 2)
        );
        
        if (distance < GAME_CONFIG.SLINGSHOT.detectionRadius) { // Within slingshot area
            this.isDraggingSlingshot = true;
        }
    }

    updateSlingshotAim() {
        const slingshot = this.slingshots[`player${this.playerNumber}`];
        const dx = slingshot.x - this.mouse.x; // Inverted
        const dy = slingshot.y - this.mouse.y; // Inverted
        
        this.slingshotAngle = Math.atan2(dy, dx);
        this.slingshotPower = Math.min(Math.sqrt(dx*dx + dy*dy) / 3, GAME_CONFIG.SLINGSHOT.maxPower);
        
        // Calculate trajectory preview with inverted direction
        const velocityX = Math.cos(this.slingshotAngle) * this.slingshotPower * 0.8;
        const velocityY = Math.sin(this.slingshotAngle) * this.slingshotPower * 0.8;
        this.trajectoryPoints = this.calculateTrajectory(slingshot.x, slingshot.y - 30, velocityX, velocityY);
        
        // Update power indicator visual
        this.updatePowerIndicator();
        
        // Update UI
        this.updateSlingshotUI();
    }

    releaseSlingshotShot() {
        if (!this.isDraggingSlingshot) return;
        
        this.isDraggingSlingshot = false;
        this.trajectoryPoints = [];
        this.removePowerIndicator(); // Remove visual indicator
        
        if (this.slingshotPower > 2) { // Minimum power threshold
            this.shoot(this.slingshotPower, this.slingshotAngle);
        }
    }

    selectBlockType(type) {
        this.selectedBlockType = type;
        this.updateBlockSelection();
    }

    updateBlockSelection() {
        document.querySelectorAll('.block-type').forEach(block => {
            block.classList.remove('selected');
        });
        
        if (this.selectedBlockType) {
            const selectedBlock = document.querySelector(`[data-type="${this.selectedBlockType}"]`);
            if (selectedBlock) {
                selectedBlock.classList.add('selected');
            }
        }
    }

    updateBlockCountDisplay() {
        Object.keys(this.blockCounts).forEach(type => {
            const countElement = document.getElementById(`${type}Count`);
            if (countElement) {
                countElement.textContent = this.blockCounts[type];
            }
        });
    }

    updatePowerIndicator() {
        const slingshot = this.slingshots[`player${this.playerNumber}`];
        
        // Remove existing power indicator
        const existingIndicator = document.querySelector('.power-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        // Create new power indicator
        const indicator = document.createElement('div');
        indicator.className = 'power-indicator';
        
        // Set power level class
        if (this.slingshotPower < 12) {
            indicator.classList.add('power-low');
        } else if (this.slingshotPower < 25) {
            indicator.classList.add('power-medium');
        } else {
            indicator.classList.add('power-high');
        }
        
        // Position indicator at slingshot
        const canvasRect = this.canvas.getBoundingClientRect();
        indicator.style.position = 'absolute';
        indicator.style.left = (canvasRect.left + slingshot.x - 30) + 'px';
        indicator.style.top = (canvasRect.top + slingshot.y - 30) + 'px';
        
        document.body.appendChild(indicator);
    }

    removePowerIndicator() {
        const indicator = document.querySelector('.power-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    updateSlingshotUI() {
        document.getElementById('powerDisplay').textContent = Math.round(this.slingshotPower);
        document.getElementById('angleDisplay').textContent = Math.round(this.slingshotAngle * 180 / Math.PI) + '°';
    }

    // Socket event handlers
    setupSocketListeners() {
        this.socket.on('roomCreated', (data) => {
            this.roomCode = data.roomCode;
            this.playerNumber = data.playerNumber;
            this.showLobby();
        });
        
        this.socket.on('roomJoined', (data) => {
            this.roomCode = data.roomCode;
            this.playerNumber = data.playerNumber;
            this.showLobby();
        });
        
        this.socket.on('playerJoined', (data) => {
            this.updatePlayerStatus(data);
            if (data.playersCount === 2) {
                document.getElementById('readyBtn').classList.remove('hidden');
            }
        });
        
        this.socket.on('coinFlipResult', (data) => {
            this.currentPlayer = data.firstPlayer;
            this.showCoinFlip(data);
        });
        
        this.socket.on('buildPhaseStart', (data) => {
            this.startBuildPhase(data);
        });
        
        this.socket.on('gamePhaseStart', (data) => {
            this.startGamePhase(data);
        });
        
        this.socket.on('blockPlaced', (data) => {
            if (data.playerId !== this.socket.id) {
                this.createBlock(data.block.type, data.block.x, data.block.y);
            }
        });
        
        this.socket.on('treasurePlaced', (data) => {
            if (data.playerId !== this.socket.id) {
                this.createEgg(data.treasure.x, data.treasure.y);
            }
        });
        
        this.socket.on('shot', (data) => {
            if (data.playerId !== this.socket.id) {
                // Show opponent's shot
                this.showOpponentShot(data);
            }
        });
        
        this.socket.on('turnSwitch', (data) => {
            this.currentPlayer = data.currentPlayer;
            this.myTurn = (this.currentPlayer === this.playerNumber);
            this.updateTurnDisplay();
        });

        this.socket.on('turnTimeout', (data) => {
            console.log(`Player ${data.player}'s turn timed out`);
            // The server will auto-switch turns, so no action needed
        });

        this.socket.on('gameOver', (data) => {
            this.showGameOver(data);
        });
        
        this.socket.on('error', (data) => {
            this.showError(data.message);
        });
        
        this.socket.on('playerDisconnected', (data) => {
            this.showError('Your opponent disconnected!');
        });
    }

    // UI state management
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    showHUD(hudId) {
        document.querySelectorAll('.hud').forEach(hud => {
            hud.classList.add('hidden');
        });
        document.getElementById(hudId).classList.remove('hidden');
    }

    showLobby() {
        this.showScreen('lobbyScreen');
        document.getElementById('displayRoomCode').textContent = this.roomCode;
        document.getElementById('player1Status').textContent = this.playerNumber === 1 ? 'You' : 'Waiting...';
        document.getElementById('player2Status').textContent = this.playerNumber === 2 ? 'You' : 'Waiting...';
    }

    showCoinFlip(data) {
        this.showScreen('coinFlipScreen');
        document.getElementById('coinFlipResult').textContent = data.message;
        
        setTimeout(() => {
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
            });
        }, GAME_CONFIG.UI_TIMING.coinFlipDuration);
    }

    startBuildPhase(data) {
        this.gameState = GAME_CONFIG.GAME_STATES.BUILDING;
        this.buildTimeLeft = data.duration;
        this.blockCounts = { ...data.blocksAllowed };
        
        this.showHUD('buildPhaseHUD');
        this.updateBlockCountDisplay();
        
        // Start build timer
        this.buildInterval = setInterval(() => {
            this.buildTimeLeft -= 1000;
            document.getElementById('buildTimer').textContent = Math.ceil(this.buildTimeLeft / 1000) + 's';
            
            if (this.buildTimeLeft <= 0) {
                clearInterval(this.buildInterval);
            }
        }, 1000);
    }

    startGamePhase(data) {
        this.gameState = GAME_CONFIG.GAME_STATES.PLAYING;
        this.currentPlayer = data.currentPlayer;
        this.myTurn = (this.currentPlayer === this.playerNumber);
        
        this.showHUD('battlePhaseHUD');
        this.updateTurnDisplay();
    }

    updatePlayerStatus(data) {
        document.getElementById('connectionStatus').textContent = 
            `${data.playersCount}/2 players connected`;
    }

    updateTurnDisplay() {
        const turnElement = document.getElementById('currentTurn');
        if (this.myTurn) {
            turnElement.textContent = 'Your Turn - Aim and Shoot!';
            turnElement.style.color = '#4ecdc4';
        } else {
            turnElement.textContent = `Player ${this.currentPlayer}'s Turn`;
            turnElement.style.color = '#ccc';
        }
    }

    showOpponentShot(data) {
        // Create visual opponent projectile
        const opponentProjectile = Matter.Bodies.circle(data.startPos.x, data.startPos.y, 8, {
            restitution: 0.6,
            friction: 0.3,
            frictionAir: 0.01
        });
        
        opponentProjectile.isProjectile = true;
        opponentProjectile.playerNumber = data.playerNumber;
        
        Matter.World.add(this.world, opponentProjectile);
        Matter.Body.setVelocity(opponentProjectile, data.velocity);
        
        // Remove after time
        setTimeout(() => {
            if (opponentProjectile && Matter.Composite.get(this.world, opponentProjectile.id, 'body')) {
                Matter.World.remove(this.world, opponentProjectile);
            }
        }, GAME_CONFIG.SLINGSHOT.projectileLifetime);
    }

    showGameOver(data) {
        this.showScreen('gameOverScreen');
        
        const isWinner = data.winner === this.playerNumber;
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        
        if (isWinner) {
            title.textContent = '🎉 You Win!';
            title.style.color = '#2ecc71';
            message.textContent = 'You destroyed your opponent\'s treasure!';
            document.getElementById('gameOverScreen').classList.add('winner');
        } else {
            title.textContent = '💔 You Lose!';
            title.style.color = '#e74c3c';
            message.textContent = 'Your treasure was destroyed!';
            document.getElementById('gameOverScreen').classList.add('loser');
        }
    }

    showError(message) {
        document.getElementById('errorText').textContent = message;
        document.getElementById('errorMessage').classList.remove('hidden');
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    const game = new DoodleDualsGame();
    console.log('🎮 Doodle Duals initialized!');
});