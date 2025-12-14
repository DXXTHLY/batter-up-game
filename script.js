// =============================================================================
//  GAME CONSTANTS
// =============================================================================
const CONSTANTS = {
    // Gameplay Settings
    GAME_DURATION_S: 60,
    COUNTDOWN_S: 3,

    // Physics & Difficulty (The "It Takes Two" feel)
    ORBIT_RADIUS: 3,
    BASE_SPEED: 0.03,        // Starts slow
    SPEED_INCREMENT: 0.006,  // Speed gained per hit
    MAX_SPEED: 0.35,         // Maximum speed cap
    
    // Penalties
    MISS_COOLDOWN_MS: 800,   // Time input is disabled after a miss
    MISS_SPEED_RESET: true,  // Missing kills your momentum (Resets speed)

    // Hit Detection
    HIT_TOLERANCE: 0.6,      // Width of the hit window (in radians)
    
    // Player Positions
    RED_PLAYER_ANGLE: Math.PI, // Left side
    BLUE_PLAYER_ANGLE: 0,      // Right side
    
    // Visuals
    RED_BALL_HEIGHT: 2.0,
    BLUE_BALL_HEIGHT: 1.2,
    BLOOM_PARAMS: { strength: 1.5, radius: 0.4, threshold: 0.7 },
};

// =============================================================================
//  GAME STATE
// =============================================================================
const gameElements = {
    scene: null, camera: null, renderer: null, composer: null,
    ui: {}, three: {}, activeParticles: [],
    cameraShake: { intensity: 0, decay: 0.95 },
};

let gameState = {
    isGameActive: false,     // Is the gameplay actually happening?
    isMenuOpen: true,        // Are we in the main menu?
    gameTime: CONSTANTS.GAME_DURATION_S,
    
    // Player Data
    red: { 
        score: 0, 
        ballAngle: CONSTANTS.RED_PLAYER_ANGLE + 0.5, 
        ballSpeed: CONSTANTS.BASE_SPEED, 
        direction: -1, 
        cooldownTimer: 0, 
        swingTimer: 0 
    },
    blue: { 
        score: 0, 
        ballAngle: CONSTANTS.BLUE_PLAYER_ANGLE - 0.5, 
        ballSpeed: CONSTANTS.BASE_SPEED, 
        direction: 1, 
        cooldownTimer: 0, 
        swingTimer: 0 
    }
};

let animationFrameId = null;
let gameIntervalId = null; // Stores the timer interval

// =============================================================================
//  INITIALIZATION & MENU LOGIC
// =============================================================================
function init() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    // Cleanup old canvas if it exists
    const oldCanvas = document.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    setupScene();
    setupLighting();
    setupPostProcessing();
    createGameObjects();
    setupInputs();
    setupUIEvents(); // Connect the buttons!

    // Start the render loop (renders background/idle state)
    animate();
}

function setupUIEvents() {
    // Connect "Local Multiplayer" Button
    const localBtn = document.getElementById('startLocalBtn');
    if (localBtn) {
        localBtn.addEventListener('click', () => {
            console.log("Local Button Clicked");
            startLocalGame();
        });
    }

    // Connect "Online Multiplayer" Button (Placeholder for now)
    const onlineBtn = document.getElementById('showOnlineBtn');
    if (onlineBtn) {
        onlineBtn.addEventListener('click', () => {
            alert("Online mode requires a server setup. Playing Local for now!");
            startLocalGame();
        });
    }
}

// =============================================================================
//  GAME FLOW CONTROL
// =============================================================================

function startLocalGame() {
    // 1. Hide Menu UI
    const menu = document.getElementById('mainMenu'); // Assuming your ID is 'mainMenu' or similar container
    if (menu) menu.style.display = 'none';
    
    // Also hide the title card if it's separate
    const title = document.querySelector('.title-card'); 
    if (title) title.style.display = 'none';

    // 2. Reset Variables
    resetGameVariables();

    // 3. Start Countdown
    startCountdown();
}

function resetGameVariables() {
    gameState.isGameActive = false;
    gameState.gameTime = CONSTANTS.GAME_DURATION_S;
    gameState.red.score = 0;
    gameState.blue.score = 0;
    gameState.red.ballSpeed = CONSTANTS.BASE_SPEED;
    gameState.blue.ballSpeed = CONSTANTS.BASE_SPEED;
    gameState.red.ballAngle = CONSTANTS.RED_PLAYER_ANGLE + 0.5;
    gameState.blue.ballAngle = CONSTANTS.BLUE_PLAYER_ANGLE - 0.5;

    // Reset UI text
    updateScoreUI();
    const timerEl = document.getElementById('timer');
    if(timerEl) timerEl.innerText = CONSTANTS.GAME_DURATION_S;
}

function startCountdown() {
    let count = CONSTANTS.COUNTDOWN_S;
    
    // Optional: Show a countdown UI text here if you have an element for it
    console.log("Game starting in " + count);

    const countInterval = setInterval(() => {
        count--;
        console.log("..." + count);
        
        if (count < 0) {
            clearInterval(countInterval);
            startGameplay();
        }
    }, 1000);
}

function startGameplay() {
    gameState.isGameActive = true;
    
    // Start the 60s timer
    if (gameIntervalId) clearInterval(gameIntervalId);
    gameIntervalId = setInterval(() => {
        if (!gameState.isGameActive) return;

        gameState.gameTime--;
        const timerEl = document.getElementById('timer');
        if(timerEl) timerEl.innerText = gameState.gameTime;

        if (gameState.gameTime <= 0) {
            endGame();
        }
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    clearInterval(gameIntervalId);

    let winnerText = "";
    if (gameState.red.score > gameState.blue.score) winnerText = "RED WINS!";
    else if (gameState.blue.score > gameState.red.score) winnerText = "BLUE WINS!";
    else winnerText = "IT'S A DRAW!";

    alert("GAME OVER\n" + winnerText);
    
    // Show menu again
    const menu = document.getElementById('mainMenu');
    if (menu) menu.style.display = 'block'; // Or 'flex' depending on your CSS
}

// =============================================================================
//  MAIN RENDER LOOP
// =============================================================================
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = 0.016; // Approx 60fps

    // Only move balls if game is active
    if (gameState.isGameActive) {
        updateBallPhysics();
    }
    
    // Always update visuals (particles, camera shake, swing animations)
    updateSwings(delta);
    updateParticles(delta);
    updateCameraShake();

    if (gameElements.composer) {
        gameElements.composer.render();
    } else {
        gameElements.renderer.render(gameElements.scene, gameElements.camera);
    }
}

// =============================================================================
//  PHYSICS & INPUT LOGIC
// =============================================================================

function updateBallPhysics() {
    moveBall(gameState.red, gameElements.three.redBall);
    moveBall(gameState.blue, gameElements.three.blueBall);
}

function moveBall(playerState, ballMesh) {
    playerState.ballAngle += playerState.ballSpeed * playerState.direction;

    // Keep angle between 0 and 360 (2PI)
    if (playerState.ballAngle > Math.PI * 2) playerState.ballAngle -= Math.PI * 2;
    if (playerState.ballAngle < 0) playerState.ballAngle += Math.PI * 2;

    updateBallPosition(ballMesh, playerState.ballAngle, ballMesh.position.y);

    if (playerState.cooldownTimer > 0) {
        playerState.cooldownTimer -= 16;
    }
}

function handleInput(playerKey) {
    if (!gameState.isGameActive) return;

    const isRed = playerKey === 'red';
    const playerState = isRed ? gameState.red : gameState.blue;
    const targetAngle = isRed ? CONSTANTS.RED_PLAYER_ANGLE : CONSTANTS.BLUE_PLAYER_ANGLE;

    if (playerState.cooldownTimer > 0) return; // Still stunned from a miss

    // Trigger visual swing
    triggerSwingAnimation(playerState);

    // Calculate Hit
    let angleDiff = Math.abs(getShortestAngleDistance(playerState.ballAngle, targetAngle));

    if (angleDiff <= CONSTANTS.HIT_TOLERANCE) {
        // --- HIT ---
        playerState.score++;
        updateScoreUI();
        
        // Increase Speed
        playerState.ballSpeed = Math.min(playerState.ballSpeed + CONSTANTS.SPEED_INCREMENT, CONSTANTS.MAX_SPEED);
        
        // Effects
        createExplosion(isRed);
        addCameraShake(0.3);
    } else {
        // --- MISS ---
        playerState.ballSpeed = CONSTANTS.BASE_SPEED; // Reset speed
        playerState.cooldownTimer = CONSTANTS.MISS_COOLDOWN_MS; // Stun
    }
}

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
    // Pole
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 5, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    gameElements.three.pole = new THREE.Mesh(poleGeo, poleMat);
    gameElements.three.pole.position.y = 2.5;
    gameElements.scene.add(gameElements.three.pole);

    // Balls
    const ballGeo = new THREE.SphereGeometry(0.3, 32, 32);
    
    gameElements.three.redBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x550000 }));
    gameElements.three.redBall.position.y = CONSTANTS.RED_BALL_HEIGHT;
    
    gameElements.three.blueBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ color: 0x3333ff, emissive: 0x000055 }));
    gameElements.three.blueBall.position.y = CONSTANTS.BLUE_BALL_HEIGHT;
    
    gameElements.scene.add(gameElements.three.redBall, gameElements.three.blueBall);

    // Players
    createPlayerMesh('red');
    createPlayerMesh('blue');
}

function createPlayerMesh(color) {
    const isRed = color === 'red';
    const group = new THREE.Group();
    group.position.x = isRed ? -CONSTANTS.ORBIT_RADIUS - 1 : CONSTANTS.ORBIT_RADIUS + 1;
    group.rotation.y = isRed ? Math.PI / 2 : -Math.PI / 2; 

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2, 12),
        new THREE.MeshStandardMaterial({ color: isRed ? 0xaa0000 : 0x0000aa })
    );
    body.position.y = 1;
    group.add(body);

    const batGroup = new THREE.Group();
    batGroup.position.set(0, 1.2, 0.5);
    const batMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 1.5),
        new THREE.MeshStandardMaterial({ color: 0xdddddd })
    );
    batMesh.position.z = 0.75; 
    batGroup.add(batMesh);
    
    group.add(batGroup);
    gameElements.scene.add(group);
    gameElements.three[color + 'Bat'] = batGroup;
}

function updateBallPosition(mesh, angle, height) {
    mesh.position.x = Math.cos(angle) * CONSTANTS.ORBIT_RADIUS;
    mesh.position.z = Math.sin(angle) * CONSTANTS.ORBIT_RADIUS;
    mesh.position.y = height;
}

// =============================================================================
//  ANIMATION HELPERS
// =============================================================================
function triggerSwingAnimation(playerState) {
    playerState.swingTimer = 1.0;
}

function updateSwings(delta) {
    ['red', 'blue'].forEach(key => {
        const state = gameState[key];
        const bat = gameElements.three[key + 'Bat'];
        if (bat && state.swingTimer > 0) {
            state.swingTimer -= delta * 5;
            const rotation = Math.sin(state.swingTimer * Math.PI) * 2.0; 
            bat.rotation.y = -rotation;
        } else if (bat) {
            bat.rotation.y = 0;
        }
    });
}

function createExplosion(isRed) {
    const color = isRed ? 0xff0000 : 0x0000ff;
    const pos = isRed ? gameElements.three.redBall.position : gameElements.three.blueBall.position;
    for(let i=0; i<8; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: color }));
        p.position.copy(pos);
        p.userData = { vel: new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2), life: 1.0 };
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
        p.scale.setScalar(p.userData.life);
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
        gameElements.camera.position.x = (Math.random() - 0.5) * gameElements.cameraShake.intensity;
        gameElements.camera.position.y = 6 + (Math.random() - 0.5) * gameElements.cameraShake.intensity;
        gameElements.cameraShake.intensity *= 0.9;
        if (gameElements.cameraShake.intensity < 0.01) gameElements.cameraShake.intensity = 0;
    }
}

function updateScoreUI() {
    const scoreRed = document.getElementById('scoreRed');
    const scoreBlue = document.getElementById('scoreBlue');
    if(scoreRed) scoreRed.innerText = gameState.red.score;
    if(scoreBlue) scoreBlue.innerText = gameState.blue.score;
}

function setupInputs() {
    window.addEventListener('keydown', (e) => {
        if (!gameState.isGameActive) return;
        if (['KeyA', 'KeyS', 'ShiftLeft'].includes(e.code)) handleInput('red');
        if (['ArrowRight', 'ArrowDown', 'Enter'].includes(e.code)) handleInput('blue');
    });
    // Handle Window Resize
    window.addEventListener('resize', () => {
        gameElements.camera.aspect = window.innerWidth / window.innerHeight;
        gameElements.camera.updateProjectionMatrix();
        gameElements.renderer.setSize(window.innerWidth, window.innerHeight);
        if(gameElements.composer) gameElements.composer.setSize(window.innerWidth, window.innerHeight);
    });
}

// Start everything when the DOM is ready
window.addEventListener('DOMContentLoaded', init);
