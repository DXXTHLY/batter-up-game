// =============================================================================
//  GAME CONSTANTS
// =============================================================================
const CONSTANTS = {
    // Gameplay Settings (Matches "It Takes Two")
    GAME_DURATION_S: 60,
    COUNTDOWN_S: 3,

    // Physics & Difficulty
    ORBIT_RADIUS: 3,
    BASE_SPEED: 0.03,        // Starts slow/manageable
    SPEED_INCREMENT: 0.006,  // Speed gained per hit
    MAX_SPEED: 0.35,         // Cap to prevent glitching
    
    // Penalties
    MISS_COOLDOWN_MS: 800,   // Time input is disabled after a miss
    MISS_SPEED_RESET: true,  // Missing kills your momentum

    // Hit Detection
    HIT_TOLERANCE: 0.6,      // Width of the hit window (in radians)
    
    // Player Positions (Angles in Radians)
    RED_PLAYER_ANGLE: Math.PI, // 180 degrees (Left side)
    BLUE_PLAYER_ANGLE: 0,      // 0 degrees (Right side)
    
    // Visuals
    RED_BALL_HEIGHT: 2.0,
    BLUE_BALL_HEIGHT: 1.2,   // Slightly offset so they don't clip
    SWING_DURATION_MS: 150,  // Fast, snappy swing
    BLOOM_PARAMS: { strength: 1.5, radius: 0.4, threshold: 0.7 },
};

// =============================================================================
//  GAME STATE
// =============================================================================
const gameElements = {
    scene: null, camera: null, renderer: null, composer: null,
    ui: {}, three: {}, activeParticles: [],
    cameraShake: { intensity: 0, decay: 0.95 },
    audio: {} // Placeholder for audio objects
};

let gameState = {};
let animationFrameId = null;

function resetGameState() {
    gameState = {
        isGameActive: false,
        isCountdownActive: false,
        gameTime: CONSTANTS.GAME_DURATION_S,
        
        // Red Player State
        red: { 
            score: 0, 
            ballAngle: CONSTANTS.RED_PLAYER_ANGLE + 0.5, 
            ballSpeed: CONSTANTS.BASE_SPEED, 
            direction: -1, // Clockwise
            cooldownTimer: 0, 
            isBatExtended: false,
            swingTimer: 0
        },
        
        // Blue Player State
        blue: { 
            score: 0, 
            ballAngle: CONSTANTS.BLUE_PLAYER_ANGLE - 0.5, 
            ballSpeed: CONSTANTS.BASE_SPEED, 
            direction: 1,  // Counter-Clockwise
            cooldownTimer: 0,
            isBatExtended: false,
            swingTimer: 0
        }
    };
    
    // UI Reset
    updateScoreUI();
    const timerEl = document.getElementById('timer');
    if(timerEl) timerEl.innerText = CONSTANTS.GAME_DURATION_S;
}

// =============================================================================
//  INITIALIZATION
// =============================================================================
function init() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    // Cleanup old canvas
    const oldCanvas = document.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    resetGameState();
    setupScene();
    setupLighting();
    setupPostProcessing();
    createGameObjects();
    setupInputs();
    
    // Start loop
    animate();
    
    // Automatically start countdown for demo purposes (or hook to a button)
    startCountdown();
}

function startCountdown() {
    gameState.isCountdownActive = true;
    let count = CONSTANTS.COUNTDOWN_S;
    
    const countInterval = setInterval(() => {
        // Here you would update a UI element for "3, 2, 1"
        console.log("Starting in: " + count);
        count--;
        
        if (count < 0) {
            clearInterval(countInterval);
            gameState.isCountdownActive = false;
            gameState.isGameActive = true;
            startGameTimer();
        }
    }, 1000);
}

function startGameTimer() {
    const timerInterval = setInterval(() => {
        if (!gameState.isGameActive) {
            clearInterval(timerInterval);
            return;
        }
        
        gameState.gameTime--;
        const timerEl = document.getElementById('timer');
        if(timerEl) timerEl.innerText = gameState.gameTime;

        if (gameState.gameTime <= 0) {
            endGame();
            clearInterval(timerInterval);
        }
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    let winner = gameState.red.score > gameState.blue.score ? "RED WINS!" : 
                 gameState.blue.score > gameState.red.score ? "BLUE WINS!" : "DRAW!";
    alert("GAME OVER: " + winner);
}

// =============================================================================
//  MAIN LOOP
// =============================================================================
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const delta = 0.016; // Approx 60fps

    if (gameState.isGameActive) {
        updateBallPhysics();
        updateSwings(delta);
    }

    updateParticles(delta);
    updateCameraShake();

    if (gameElements.composer) {
        gameElements.composer.render();
    } else {
        gameElements.renderer.render(gameElements.scene, gameElements.camera);
    }
}

// =============================================================================
//  PHYSICS & LOGIC (THE CORE MECHANICS)
// =============================================================================

function updateBallPhysics() {
    // Move Red Ball
    moveBall(gameState.red, gameElements.three.redBall);
    // Move Blue Ball
    moveBall(gameState.blue, gameElements.three.blueBall);
}

function moveBall(playerState, ballMesh) {
    // 1. Apply Velocity
    playerState.ballAngle += playerState.ballSpeed * playerState.direction;

    // 2. Normalize Angle (0 to 2PI)
    if (playerState.ballAngle > Math.PI * 2) playerState.ballAngle -= Math.PI * 2;
    if (playerState.ballAngle < 0) playerState.ballAngle += Math.PI * 2;

    // 3. Update Visuals
    updateBallPosition(ballMesh, playerState.ballAngle, ballMesh.position.y);

    // 4. Cooldown Tick (The "Stun" timer)
    if (playerState.cooldownTimer > 0) {
        playerState.cooldownTimer -= 16;
    }
}

function handleInput(playerKey) {
    if (!gameState.isGameActive) return;

    const isRed = playerKey === 'red';
    const playerState = isRed ? gameState.red : gameState.blue;
    const playerBat = isRed ? gameElements.three.redBat : gameElements.three.blueBat;
    const targetAngle = isRed ? CONSTANTS.RED_PLAYER_ANGLE : CONSTANTS.BLUE_PLAYER_ANGLE;

    // 1. Check Cooldown (Prevents Spamming)
    if (playerState.cooldownTimer > 0) return;

    // 2. Trigger Visual Swing
    triggerSwingAnimation(playerState);

    // 3. Check Hit Accuracy
    // Calculate distance between Ball Angle and Player Angle
    let angleDiff = Math.abs(getShortestAngleDistance(playerState.ballAngle, targetAngle));

    if (angleDiff <= CONSTANTS.HIT_TOLERANCE) {
        // --- SUCCESSFUL HIT ---
        playerState.score++;
        updateScoreUI();

        // Speed Ramp Up
        playerState.ballSpeed = Math.min(
            playerState.ballSpeed + CONSTANTS.SPEED_INCREMENT, 
            CONSTANTS.MAX_SPEED
        );

        // Feedback
        createExplosion(isRed);
        addCameraShake(0.3); // Screenshake
        console.log(`${playerKey} HIT! Speed: ${playerState.ballSpeed.toFixed(3)}`);
    } else {
        // --- MISS / WHIFF ---
        // Punishment: Reset speed and stun player
        playerState.ballSpeed = CONSTANTS.BASE_SPEED;
        playerState.cooldownTimer = CONSTANTS.MISS_COOLDOWN_MS;
        
        console.log(`${playerKey} MISSED! Speed Reset.`);
    }
}

// Math Helper: circular distance
function getShortestAngleDistance(a, b) {
    let diff = (b - a + Math.PI) % (2 * Math.PI) - Math.PI;
    return diff < -Math.PI ? diff + 2 * Math.PI : diff;
}

// =============================================================================
//  THREE.JS SCENE SETUP
// =============================================================================
function setupScene() {
    gameElements.scene = new THREE.Scene();
    gameElements.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Camera Positioned to see both players clearly
    gameElements.camera.position.set(0, 6, 11); 
    gameElements.camera.lookAt(0, 2, 0);

    gameElements.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gameElements.renderer.setSize(window.innerWidth, window.innerHeight);
    gameElements.renderer.setPixelRatio(window.devicePixelRatio);
    gameElements.renderer.shadowMap.enabled = true;
    document.body.appendChild(gameElements.renderer.domElement);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
    gameElements.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    gameElements.scene.add(dirLight);
}

function setupPostProcessing() {
    // Basic setup if EffectComposer is available in your lib
    if (typeof THREE.EffectComposer !== 'undefined') {
        const renderScene = new THREE.RenderPass(gameElements.scene, gameElements.camera);
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            CONSTANTS.BLOOM_PARAMS.strength,
            CONSTANTS.BLOOM_PARAMS.radius,
            CONSTANTS.BLOOM_PARAMS.threshold
        );
        gameElements.composer = new THREE.EffectComposer(gameElements.renderer);
        gameElements.composer.addPass(renderScene);
        gameElements.composer.addPass(bloomPass);
    }
}

function createGameObjects() {
    // 1. The Central Pole
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 5, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    gameElements.three.pole = new THREE.Mesh(poleGeo, poleMat);
    gameElements.three.pole.position.y = 2.5;
    gameElements.scene.add(gameElements.three.pole);

    // 2. Balls
    const ballGeo = new THREE.SphereGeometry(0.3, 32, 32);
    
    // Red Ball
    gameElements.three.redBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x550000 }));
    gameElements.three.redBall.position.y = CONSTANTS.RED_BALL_HEIGHT;
    gameElements.scene.add(gameElements.three.redBall);

    // Blue Ball
    gameElements.three.blueBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0x3333ff, emissive: 0x000055 }));
    gameElements.three.blueBall.position.y = CONSTANTS.BLUE_BALL_HEIGHT;
    gameElements.scene.add(gameElements.three.blueBall);

    // 3. Players (Simple Cylinders with Bats)
    createPlayerMesh('red');
    createPlayerMesh('blue');
}

function createPlayerMesh(color) {
    const isRed = color === 'red';
    const group = new THREE.Group();
    
    // Position players on opposite sides
    group.position.x = isRed ? -CONSTANTS.ORBIT_RADIUS - 1 : CONSTANTS.ORBIT_RADIUS + 1;
    group.rotation.y = isRed ? Math.PI / 2 : -Math.PI / 2; // Face center

    // Body
    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2, 12),
        new THREE.MeshStandardMaterial({ color: isRed ? 0xaa0000 : 0x0000aa })
    );
    body.position.y = 1;
    group.add(body);

    // Bat Pivot
    const batGroup = new THREE.Group();
    batGroup.position.set(0, 1.2, 0.5); // Hold bat in front
    
    // Bat Mesh
    const batMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xdddddd })
    );
    batMesh.position.z = 0.75; // Offset so it rotates from handle
    batGroup.add(batMesh);
    
    group.add(batGroup);
    gameElements.scene.add(group);

    // Save reference for animation
    gameElements.three[color + 'Bat'] = batGroup;
}

function updateBallPosition(mesh, angle, height) {
    mesh.position.x = Math.cos(angle) * CONSTANTS.ORBIT_RADIUS;
    mesh.position.z = Math.sin(angle) * CONSTANTS.ORBIT_RADIUS;
    mesh.position.y = height;
}

// =============================================================================
//  ANIMATIONS & VISUALS
// =============================================================================

function triggerSwingAnimation(playerState) {
    playerState.swingTimer = 1.0; // Reset swing lerp
}

function updateSwings(delta) {
    // Simple logic to rotate bat based on timer
    ['red', 'blue'].forEach(key => {
        const state = gameState[key];
        const bat = gameElements.three[key + 'Bat'];
        
        if (state.swingTimer > 0) {
            state.swingTimer -= delta * 5; // Speed of swing
            // Rotation logic: Swing forward then back
            const rotation = Math.sin(state.swingTimer * Math.PI) * 2.0; 
            bat.rotation.y = -rotation; // Swing outward
        } else {
            bat.rotation.y = 0; // Reset
        }
    });
}

function createExplosion(isRed) {
    // Simple particle spawner
    const color = isRed ? 0xff0000 : 0x0000ff;
    const pos = isRed ? gameElements.three.redBall.position : gameElements.three.blueBall.position;
    
    for(let i=0; i<10; i++) {
        const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const pMat = new THREE.MeshBasicMaterial({ color: color });
        const p = new THREE.Mesh(pGeo, pMat);
        
        p.position.copy(pos);
        
        // Random velocity
        p.userData = {
            vel: new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.2
            ),
            life: 1.0
        };
        
        gameElements.scene.add(p);
        gameElements.activeParticles.push(p);
    }
}

function updateParticles(delta) {
    for (let i = gameElements.activeParticles.length - 1; i >= 0; i--) {
        const p = gameElements.activeParticles[i];
        p.userData.life -= delta;
        p.position.add(p.userData.vel);
        p.rotation.x += 0.1;
        p.scale.setScalar(p.userData.life); // Shrink over time

        if (p.userData.life <= 0) {
            gameElements.scene.remove(p);
            gameElements.activeParticles.splice(i, 1);
        }
    }
}

function addCameraShake(amount) {
    gameElements.cameraShake.intensity = amount;
}

function updateCameraShake() {
    if (gameElements.cameraShake.intensity > 0) {
        const rx = (Math.random() - 0.5) * gameElements.cameraShake.intensity;
        const ry = (Math.random() - 0.5) * gameElements.cameraShake.intensity;
        
        // Apply offset to base camera position
        gameElements.camera.position.x = rx;
        gameElements.camera.position.y = 6 + ry; // Base Y is 6
        
        // Decay
        gameElements.cameraShake.intensity *= gameElements.cameraShake.decay;
        if (gameElements.cameraShake.intensity < 0.01) gameElements.cameraShake.intensity = 0;
    }
}

function updateScoreUI() {
    const scoreRed = document.getElementById('scoreRed');
    const scoreBlue = document.getElementById('scoreBlue');
    if(scoreRed) scoreRed.innerText = gameState.red.score;
    if(scoreBlue) scoreBlue.innerText = gameState.blue.score;
}

// =============================================================================
//  INPUT LISTENERS
// =============================================================================
function setupInputs() {
    window.addEventListener('keydown', (e) => {
        // Red Player (Left Side) - Keys: A, S, Left Shift
        if (['KeyA', 'KeyS', 'ShiftLeft'].includes(e.code)) {
            handleInput('red');
        }

        // Blue Player (Right Side) - Keys: Arrows, Enter
        if (['ArrowRight', 'ArrowDown', 'Enter'].includes(e.code)) {
            handleInput('blue');
        }
        
        // Restart (R key)
        if (e.code === 'KeyR') {
            init();
        }
    });
}

// Start
window.addEventListener('DOMContentLoaded', init);
