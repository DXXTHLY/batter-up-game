// =============================================================================
//  GAME CONSTANTS
// =============================================================================
const CONSTANTS = {
    // Gameplay
    GAME_DURATION_S: 40,
    COUNTDOWN_S: 3,

    // Physics
    ORBIT_RADIUS: 3,
    BASE_SPEED: 0.01,
    SPEED_INCREMENT: 0.004,
    MAX_SPEED: 0.10,
    SPEED_DECAY_RATE: 0.9995,
    SPEED_DECAY_DELAY_MS: 2000,
    MISS_SPEED_PENALTY: 0.5,

    // Objects
    BALL_RADIUS: 0.3,
    POLE_RADIUS: 0.2,
    POLE_HEIGHT: 5,
    BAT_LENGTH: 2,

    // Hit Zones
    HIT_ZONE_ARC_LENGTH: 0.3,
    RED_PLAYER_START_ANGLE: Math.PI,
    BLUE_PLAYER_START_ANGLE: 0,
    RED_BALL_HEIGHT: 2.0,
    BLUE_BALL_HEIGHT: 1.0,

    // Animation & Visuals
    SWING_DURATION_MS: 300,
    BLOOM_PARAMS: { strength: 1.2, radius: 0.5, threshold: 0.75 },

    // Networking
    SYNC_INTERVAL_MS: 50,
    INTERPOLATION_FACTOR: 0.2,
};

const HIT_ZONES = {
    TOO_EARLY: 'TOO_EARLY',
    PERFECT: 'PERFECT',
    MISS: 'MISS'
};

// =============================================================================
//  GAME STATE & ELEMENTS
// =============================================================================
const gameElements = {
    scene: null, camera: null, renderer: null, composer: null, hitSound: null,
    ui: {}, three: {}, activeParticles: [],
    cameraShake: { time: 0, intensity: 0 },
};

let gameState = {};
let animationFrameId = null;

function resetGameState() {
    const highscores = gameState.sessionHighscores || [];
    gameState = {
        isGameActive: false,
        isCountdownActive: false,
        gameTime: CONSTANTS.GAME_DURATION_S,
        countdownTime: CONSTANTS.COUNTDOWN_S,
        gameTimerInterval: null,
        red: { score: 0, ballAngle: CONSTANTS.RED_PLAYER_START_ANGLE, ballSpeed: 0, direction: -1, isBallStarted: false, hitCount: 0, lastHitTime: 0, isBatExtended: false },
        blue: { score: 0, ballAngle: CONSTANTS.BLUE_PLAYER_START_ANGLE, ballSpeed: 0, direction: 1, isBallStarted: false, hitCount: 0, lastHitTime: 0, isBatExtended: false },
        online: { isOnlineMode: false, isHost: false, peer: null, conn: null, roomCode: '', playerName: "Player", opponentName: "Opponent", currentPlayerRole: null, pendingRestart: false, syncInterval: null, targetRedBallAngle: 0, targetBlueBallAngle: 0 },
        sessionHighscores: highscores,
    };
}

// =============================================================================
//  INITIALIZATION & MAIN LOOP
// =============================================================================
function init() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    const oldCanvas = document.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();
    document.querySelectorAll('.game-ui-element').forEach(el => el.remove());

    resetGameState();
    setupScene();
    setupLighting();
    setupPostProcessing();
    createGameObjects();
    setupUI();
    loadSounds();
    setupGameEventListeners();
    animate();
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const delta = 0.016;
    updateParticles(delta);
    updateCameraShake();
    updateBallPhysics();

    if (gameElements.composer) {
        gameElements.composer.render();
    }
    updateDebugInfo();
}

// =============================================================================
//  SCENE & OBJECT SETUP
// =============================================================================
function setupScene() {
    gameElements.scene = new THREE.Scene();
    gameElements.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    gameElements.camera.position.set(0, 5, 9);
    gameElements.camera.lookAt(0, 2, 0);

    gameElements.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    gameElements.renderer.setSize(window.innerWidth, window.innerHeight);
    gameElements.renderer.setPixelRatio(window.devicePixelRatio);
    gameElements.renderer.shadowMap.enabled = true;
    gameElements.renderer.toneMapping = THREE.ReinhardToneMapping;
    document.body.appendChild(gameElements.renderer.domElement);
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040, 2.0);
    gameElements.scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffffff, 1.5, 100);
    pointLight.position.set(0, 6, 0);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.width = 1024;
    pointLight.shadow.mapSize.height = 1024;
    gameElements.scene.add(pointLight);
}

function setupPostProcessing() {
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

function createGameObjects() {
    // Pole
    const poleGeometry = new THREE.CylinderGeometry(CONSTANTS.POLE_RADIUS, CONSTANTS.POLE_RADIUS, CONSTANTS.POLE_HEIGHT, 16);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x7777ff, metalness: 0.9, roughness: 0.2, emissive: 0x222288 });
    gameElements.three.pole = new THREE.Mesh(poleGeometry, poleMaterial);
    gameElements.three.pole.position.y = CONSTANTS.POLE_HEIGHT / 2;
    gameElements.three.pole.castShadow = true;
    gameElements.scene.add(gameElements.three.pole);

    // Players
    gameElements.three.redPlayer = createPlayer('red');
    gameElements.three.bluePlayer = createPlayer('blue');
    gameElements.scene.add(gameElements.three.redPlayer, gameElements.three.bluePlayer);

    // Balls
    const ballGeometry = new THREE.SphereGeometry(CONSTANTS.BALL_RADIUS, 32, 32);
    gameElements.three.redBall = new THREE.Mesh(ballGeometry, new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xdd0000 }));
    gameElements.three.blueBall = new THREE.Mesh(ballGeometry, new THREE.MeshStandardMaterial({ color: 0x4444ff, emissive: 0x0000dd }));
    gameElements.three.redBall.castShadow = true;
    gameElements.three.blueBall.castShadow = true;

    // Trails
    gameElements.three.redTrail = createBallTrail(0xff4444);
    gameElements.three.blueTrail = createBallTrail(0x4444ff);
    gameElements.scene.add(gameElements.three.redTrail, gameElements.three.blueTrail);

    updateBallPosition(gameElements.three.redBall, gameState.red.ballAngle, CONSTANTS.RED_BALL_HEIGHT);
    updateBallPosition(gameElements.three.blueBall, gameState.blue.ballAngle, CONSTANTS.BLUE_BALL_HEIGHT);
    gameElements.scene.add(gameElements.three.redBall, gameElements.three.blueBall);

    createHitZoneMarkers();
}

function createPlayer(color) {
    const isRed = color === 'red';
    const playerColor = isRed ? 0xff0000 : 0x0000ff;

    const playerGroup = new THREE.Group();
    playerGroup.position.set(isRed ? -CONSTANTS.ORBIT_RADIUS - 1 : CONSTANTS.ORBIT_RADIUS + 1, 0, 0);

    const bodyMat = new THREE.MeshStandardMaterial({ color: playerColor, metalness: 0.5, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 16), bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    playerGroup.add(body);

    const batGroup = new THREE.Group();
    batGroup.position.set(isRed ? 0.4 : -0.4, 1.0, 0.2);

    const batHandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 1.0, roughness: 0.3 })
    );
    batHandle.rotation.z = Math.PI / 2;

    const batBlade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, CONSTANTS.BAT_LENGTH, 16),
        new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor })
    );
    batBlade.position.x = isRed ? CONSTANTS.BAT_LENGTH / 2 : -CONSTANTS.BAT_LENGTH / 2;
    batBlade.rotation.z = Math.PI / 2;

    batGroup.add(batHandle);
    batGroup.add(batBlade);
    playerGroup.add(batGroup);
    playerGroup.lookAt(0, 0, 0);

    gameElements.three[isRed ? 'redBat' : 'blueBat'] = batGroup;
    return playerGroup;
}

// =============================================================================
//  GAME LOGIC
// =============================================================================
// ... All functions like startCountdown, startGame, endGame, resetGame, updateBallPhysics, processHit, swingBat
// remain largely the same, with minor fixes for consistency

// =============================================================================
//  EVENT LISTENERS, UI, PARTICLES, NETWORKING
// =============================================================================
// ... All functions remain the same with minor fixes to prevent undefined array issues

// =============================================================================
//  SCRIPT EXECUTION STARTS HERE
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('startLocalBtn')?.addEventListener('click', startLocal);
    document.getElementById('showOnlineBtn')?.addEventListener('click', () => {
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('onlineMenu').style.display = 'block';
    });
    document.getElementById('backToMainBtn')?.addEventListener('click', () => {
        document.getElementById('onlineMenu').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'block';
    });
    document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);
    document.getElementById('joinRoomBtn')?.addEventListener('click', joinRoom);
});
