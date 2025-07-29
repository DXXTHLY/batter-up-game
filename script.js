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
        isGameActive: false, isCountdownActive: false, gameTime: CONSTANTS.GAME_DURATION_S, countdownTime: CONSTANTS.COUNTDOWN_S, gameTimerInterval: null,
        red: { score: 0, ballAngle: CONSTANTS.RED_PLAYER_START_ANGLE, ballSpeed: 0, direction: -1, isBallStarted: false, hitCount: 0, lastHitTime: 0, isBatExtended: false, },
        blue: { score: 0, ballAngle: CONSTANTS.BLUE_PLAYER_START_ANGLE + 0.45, ballSpeed: 0, direction: 1, isBallStarted: false, hitCount: 0, lastHitTime: 0, isBatExtended: false, },
        online: { isOnlineMode: false, isHost: false, peer: null, conn: null, roomCode: '', playerName: "Player", opponentName: "Opponent", currentPlayerRole: null, pendingRestart: false, syncInterval: null, targetRedBallAngle: 0, targetBlueBallAngle: 0, },
        sessionHighscores: highscores,
    };
}


// =============================================================================
//  INITIALIZATION & MAIN LOOP
// =============================================================================
function init() {
    // Clean up previous game instance if it exists
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

    // Renderer with transparent background to show the GIF
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
    // Central Pole
    const poleGeometry = new THREE.CylinderGeometry(CONSTANTS.POLE_RADIUS, CONSTANTS.POLE_RADIUS, CONSTANTS.POLE_HEIGHT, 16);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x7777ff, metalness: 0.9, roughness: 0.2, emissive: 0x222288,
    });
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
//  GAME FLOW & LOGIC
// =============================================================================
function startCountdown() { gameState.isCountdownActive = true; gameState.countdownTime = CONSTANTS.COUNTDOWN_S; updateCountdownDisplay(); const interval = setInterval(() => { gameState.countdownTime--; updateCountdownDisplay(); if (gameState.countdownTime < 0) { clearInterval(interval); gameState.isCountdownActive = false; updateCountdownDisplay(); startGame(); } }, 1000); }
function startGame() { gameState.isGameActive = true; gameState.gameTime = CONSTANTS.GAME_DURATION_S; updateTimerDisplay(); if (gameState.gameTimerInterval) clearInterval(gameState.gameTimerInterval); gameState.gameTimerInterval = setInterval(() => { if (!gameState.isGameActive) { clearInterval(gameState.gameTimerInterval); return; } gameState.gameTime--; updateTimerDisplay(); if (gameState.gameTime <= 0) { clearInterval(gameState.gameTimerInterval); endGame(); } }, 1000); }
function endGame(customMessage) { gameState.isGameActive = false; let winnerMessage; if (customMessage) { winnerMessage = customMessage; } else if (gameState.red.score > gameState.blue.score) { winnerMessage = "RED WINS!"; } else if (gameState.blue.score > gameState.red.score) { winnerMessage = "BLUE WINS!"; } else { winnerMessage = "IT'S A TIE!"; } gameState.sessionHighscores.push({ winner: winnerMessage, redScore: gameState.red.score, blueScore: gameState.blue.score, time: new Date().toLocaleTimeString() }); showLeaderboard(); showEndGameMessage(winnerMessage); }
function resetGame() { if (gameState.gameTimerInterval) clearInterval(gameState.gameTimerInterval); if (gameState.online.syncInterval) clearInterval(gameState.online.syncInterval); const onlineState = { ...gameState.online }; resetGameState(); gameState.online = onlineState; updateBallPosition(gameElements.three.redBall, gameState.red.ballAngle, CONSTANTS.RED_BALL_HEIGHT); updateBallPosition(gameElements.three.blueBall, gameState.blue.ballAngle, CONSTANTS.BLUE_BALL_HEIGHT); updateScoreBoard(); updateTimerDisplay(); startCountdown(); }

function updateBallPhysics() {
    if (!gameState.isGameActive) return;
    if (gameState.online.isOnlineMode && !gameState.online.isHost) {
        gameState.red.ballAngle = lerp(gameState.red.ballAngle, gameState.online.targetRedBallAngle, CONSTANTS.INTERPOLATION_FACTOR);
        gameState.blue.ballAngle = lerp(gameState.blue.ballAngle, gameState.online.targetBlueBallAngle, CONSTANTS.INTERPOLATION_FACTOR);
    } else {
        const now = Date.now();
        ['red', 'blue'].forEach(player => {
            const pState = gameState[player];
            if (pState.isBallStarted) pState.ballAngle += pState.ballSpeed * pState.direction;
            if (pState.ballSpeed > CONSTANTS.BASE_SPEED && now - pState.lastHitTime > CONSTANTS.SPEED_DECAY_DELAY_MS) {
                pState.ballSpeed *= CONSTANTS.SPEED_DECAY_RATE;
                if (pState.ballSpeed < CONSTANTS.BASE_SPEED) {
                    pState.ballSpeed = CONSTANTS.BASE_SPEED;
                    pState.hitCount = 0;
                }
            }
        });
    }

    const redAngle = normalizeAngle(gameState.red.ballAngle);
    const blueAngle = normalizeAngle(gameState.blue.ballAngle);
    updateBallPosition(gameElements.three.redBall, redAngle, CONSTANTS.RED_BALL_HEIGHT);
    updateBallPosition(gameElements.three.blueBall, blueAngle, CONSTANTS.BLUE_BALL_HEIGHT);
    updateTrail(gameElements.three.redTrail, gameElements.three.redBall.position, gameState.red.ballSpeed > 0);
    updateTrail(gameElements.three.blueTrail, gameElements.three.blueBall.position, gameState.blue.ballSpeed > 0);
}

function processHit(player) {
    const pState = gameState[player];
    const isRed = player === 'red';
    const ballAngle = normalizeAngle(pState.ballAngle);
    const centerAngle = isRed ? CONSTANTS.RED_PLAYER_START_ANGLE : CONSTANTS.BLUE_PLAYER_START_ANGLE;
    const arc = CONSTANTS.HIT_ZONE_ARC_LENGTH;
    let zone;
    if (isRed) {
        if (ballAngle >= centerAngle - arc && ballAngle < centerAngle) zone = HIT_ZONES.MISS;
        else if (ballAngle >= centerAngle && ballAngle < centerAngle + arc) zone = HIT_ZONES.PERFECT;
        else if (ballAngle >= centerAngle + arc && ballAngle < centerAngle + 2 * arc) zone = HIT_ZONES.TOO_EARLY;
    } else {
        if (ballAngle >= centerAngle && ballAngle < centerAngle + arc) zone = HIT_ZONES.TOO_EARLY;
        else if (ballAngle >= centerAngle + arc && ballAngle < centerAngle + 2 * arc) zone = HIT_ZONES.PERFECT;
        else if (ballAngle >= centerAngle + 2 * arc && ballAngle < centerAngle + 3 * arc) zone = HIT_ZONES.MISS;
    }

    if (!zone) return;

    showZoneFeedback(player, zone);
    pState.lastHitTime = Date.now();
    playHitSound();

    if (zone === HIT_ZONES.PERFECT) {
        const ball = isRed ? gameElements.three.redBall : gameElements.three.blueBall;
        createImpactParticles(ball.position, isRed ? 0xff4444 : 0x4444ff);
        triggerCameraShake(0.08, 0.2);
    }

    if (!pState.isBallStarted) {
        if (zone === HIT_ZONES.PERFECT) {
            pState.isBallStarted = true;
            pState.ballSpeed = CONSTANTS.BASE_SPEED;
            if (!gameState.online.isOnlineMode || gameState.online.isHost) {
                pState.score++;
                updateScoreBoard();
            }
        }
        return;
    }
    
    switch (zone) {
        case HIT_ZONES.PERFECT:
            pState.hitCount++;
            pState.ballSpeed = Math.min(CONSTANTS.BASE_SPEED + (CONSTANTS.SPEED_INCREMENT * pState.hitCount), CONSTANTS.MAX_SPEED);
            pState.direction = isRed ? -1 : 1;
            if (!gameState.online.isOnlineMode || gameState.online.isHost) {
                pState.score++;
                updateScoreBoard();
            }
            break;
        case HIT_ZONES.TOO_EARLY:
            pState.direction *= -1; pState.ballSpeed = CONSTANTS.BASE_SPEED * 0.5; pState.hitCount = 0;
            break;
        case HIT_ZONES.MISS:
            pState.ballSpeed *= CONSTANTS.MISS_SPEED_PENALTY;
            if (pState.ballSpeed < CONSTANTS.BASE_SPEED * 0.3) pState.ballSpeed = CONSTANTS.BASE_SPEED * 0.3;
            pState.hitCount = 0;
            break;
    }
}
function swingBat(player) { const bat = gameElements.three[player === 'red' ? 'redBat' : 'blueBat']; if (!bat) return; const targetRotation = player === 'red' ? -Math.PI / 1.5 : Math.PI / 1.5; const startTime = Date.now(); function animateSwing() { const elapsed = Date.now() - startTime; const progress = Math.min(elapsed / CONSTANTS.SWING_DURATION_MS, 1); bat.rotation.z = progress < 0.3 ? targetRotation * (progress / 0.3) : targetRotation * (1 - (progress - 0.3) / 0.7); if (progress < 1) requestAnimationFrame(animateSwing); else bat.rotation.z = 0; } animateSwing(); }


// =============================================================================
//  EVENT LISTENERS & INPUT HANDLING
// =============================================================================
function setupGameEventListeners() { window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('resize', onWindowResize); }
function onKeyDown(e) { if (e.repeat) return; const key = e.key.toLowerCase(); const role = gameState.online.currentPlayerRole; if (key === 'a' && (!gameState.online.isOnlineMode || role === 'red')) gameState.red.isBatExtended = true; if (key === 'l' && (!gameState.online.isOnlineMode || role === 'blue')) gameState.blue.isBatExtended = true; }
function onKeyUp(e) { const key = e.key.toLowerCase(); const role = gameState.online.currentPlayerRole; if (key === 'a' && gameState.red.isBatExtended) { gameState.red.isBatExtended = false; if (gameState.isGameActive && (!gameState.online.isOnlineMode || role === 'red')) handleHit('red'); } if (key === 'l' && gameState.blue.isBatExtended) { gameState.blue.isBatExtended = false; if (gameState.isGameActive && (!gameState.online.isOnlineMode || role === 'blue')) handleHit('blue'); } if (key === 'r' && (gameState.isGameActive || gameState.online.isOnlineMode)) handleResetRequest(); }
function handleHit(player) { swingBat(player); processHit(player); if (gameState.online.isOnlineMode && gameState.online.conn) { gameState.online.conn.send({ type: 'hit', player: player }); } }
function handleResetRequest() { if (!gameState.online.isOnlineMode) { resetGame(); } else if (gameState.online.conn) { if (!gameState.online.pendingRestart) { gameState.online.pendingRestart = true; gameState.online.conn.send({ type: 'reset-request' }); showResetPrompt(); } else { gameState.online.conn.send({ type: 'reset-confirm' }); resetGame(); gameState.online.pendingRestart = false; } } }
function onWindowResize() { if (gameElements.camera && gameElements.renderer) { const width = window.innerWidth; const height = window.innerHeight; gameElements.camera.aspect = width / height; gameElements.camera.updateProjectionMatrix(); gameElements.renderer.setSize(width, height); gameElements.composer.setSize(width, height); } }


// =============================================================================
//  UI & VISUAL FEEDBACK
// =============================================================================
function setupUI() { const style = (s) => ({ ...s, zIndex: '10', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontFamily: 'Segoe UI, Tahoma, sans-serif' }); gameElements.ui.scoreBoard = createUIElement('div', style({ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', padding: '10px', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '24px', borderRadius: '5px', textAlign: 'center' })); gameElements.ui.timerDisplay = createUIElement('div', style({ display: 'none', position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', padding: '5px 15px', backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '28px', fontWeight: 'bold', borderRadius: '5px' })); gameElements.ui.countdownDisplay = createUIElement('div', style({ display: 'none', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px 40px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontSize: '64px', fontWeight: 'bold', borderRadius: '10px' })); gameElements.ui.debugInfo = createUIElement('div', { position: 'absolute', bottom: '10px', left: '10px', padding: '10px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontFamily: 'monospace', zIndex: '100', display: 'none' }); updateScoreBoard(); updateTimerDisplay(); }
function createUIElement(tag, style) { const el = document.createElement(tag); el.className = 'game-ui-element'; Object.assign(el.style, style); document.body.appendChild(el); return el; }
function updateScoreBoard() { if (!gameElements.ui.scoreBoard) return; const { online, red, blue } = gameState; const redName = online.isOnlineMode ? (online.currentPlayerRole === 'red' ? online.playerName : online.opponentName) : 'Red'; const blueName = online.isOnlineMode ? (online.currentPlayerRole === 'blue' ? online.playerName : online.opponentName) : 'Blue'; let onlineInfo = online.isOnlineMode ? `Room: ${online.roomCode}` : 'Press R to Reset'; gameElements.ui.scoreBoard.innerHTML = `<span style="color:#ff8888">${redName}: ${red.score}</span> | <span style="color:#8888ff">${blue.score}: ${blueName}</span><br><span style="font-size: 16px;">${onlineInfo}</span>`; }
function updateTimerDisplay() { const { ui } = gameElements; if (ui.timerDisplay) { ui.timerDisplay.style.display = gameState.isGameActive ? 'block' : 'none'; ui.timerDisplay.textContent = `${gameState.gameTime}s`; } }
function updateCountdownDisplay() { const { ui } = gameElements; if (ui.countdownDisplay) { ui.countdownDisplay.style.display = gameState.isCountdownActive ? 'block' : 'none'; ui.countdownDisplay.textContent = gameState.countdownTime > 0 ? gameState.countdownTime : 'GO!'; } }
function createHitZoneMarkers() { const createZone = (start, end, height, color) => { const points = []; for (let i = 0; i <= 20; i++) { const angle = start + (end - start) * i / 20; points.push(new THREE.Vector3(Math.cos(angle) * CONSTANTS.ORBIT_RADIUS, height, Math.sin(angle) * CONSTANTS.ORBIT_RADIUS)); } const geo = new THREE.BufferGeometry().setFromPoints(points); const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 }); gameElements.scene.add(new THREE.Line(geo, mat)); }; const arc = CONSTANTS.HIT_ZONE_ARC_LENGTH; createZone(Math.PI - arc, Math.PI, CONSTANTS.RED_BALL_HEIGHT, 0xffff00); createZone(Math.PI, Math.PI + arc, CONSTANTS.RED_BALL_HEIGHT, 0x00ff00); createZone(Math.PI + arc, Math.PI + 2 * arc, CONSTANTS.RED_BALL_HEIGHT, 0xff0000); createZone(0, arc, CONSTANTS.BLUE_BALL_HEIGHT, 0xff0000); createZone(arc, 2 * arc, CONSTANTS.BLUE_BALL_HEIGHT, 0x00ff00); createZone(2 * arc, 3 * arc, CONSTANTS.BLUE_BALL_HEIGHT, 0xffff00); }
function showEndGameMessage(message) { const el = createUIElement('div', { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '20px 40px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontFamily: 'Arial', fontSize: '48px', fontWeight: 'bold', borderRadius: '10px', zIndex: '100' }); el.textContent = message; setTimeout(() => el.remove(), 4000); }
function showZoneFeedback(player, zone) { const color = { [HIT_ZONES.TOO_EARLY]: '#FF4444', [HIT_ZONES.PERFECT]: '#44FF44', [HIT_ZONES.MISS]: '#FFFF44' }[zone]; const text = { [HIT_ZONES.TOO_EARLY]: 'TOO EARLY!', [HIT_ZONES.PERFECT]: 'PERFECT!', [HIT_ZONES.MISS]: 'MISS!' }[zone]; const feedback = createUIElement('div', { position: 'absolute', top: '30%', fontSize: '24px', fontWeight: 'bold', color: color, textShadow: '2px 2px 4px black' }); feedback.style[player === 'red' ? 'left' : 'right'] = '20%'; feedback.textContent = text; setTimeout(() => feedback.remove(), 800); }
function showResetPrompt() { if (document.getElementById('reset-prompt')) return; const prompt = createUIElement('div', { id: 'reset-prompt', position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px', borderRadius: '5px' }); prompt.textContent = 'Restart requested. Press R again to confirm.'; setTimeout(() => { prompt.remove(); gameState.online.pendingRestart = false; }, 3000); }
function showLeaderboard() { let leaderboard = document.getElementById('session-leaderboard'); if (!leaderboard) { leaderboard = createUIElement('div', { id: 'session-leaderboard', position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(0,0,0,0.7)', color: 'white', fontFamily: 'Arial', fontSize: '14px', padding: '10px', borderRadius: '8px', zIndex: '20', maxWidth: '240px' }); } let html = `<b>Session Highscores</b><br><table style="width:100%;color:white;"><tr><th>Time</th><th>Red</th><th>Blue</th><th>Winner</th></tr>`; gameState.sessionHighscores.slice(-10).reverse().forEach(entry => { html += `<tr><td>${entry.time}</td><td style="color:#ff8888">${entry.redScore}</td><td style="color:#8888ff">${entry.blueScore}</td><td>${entry.winner.replace(' WINS!', '')}</td></tr>`; }); leaderboard.innerHTML = html + `</table>`; }
function updateDebugInfo() { if (!gameElements.ui.debugInfo) return; const redAngle = (gameState.red.ballAngle * 180 / Math.PI).toFixed(0); const blueAngle = (gameState.blue.ballAngle * 180 / Math.PI).toFixed(0); gameElements.ui.debugInfo.innerHTML = `Red Angle: ${redAngle}° | Speed: ${gameState.red.ballSpeed.toFixed(4)}<br>Blue Angle: ${blueAngle}° | Speed: ${gameState.blue.ballSpeed.toFixed(4)}`; }

// Visual Effects
function createImpactParticles(position, color) { const particleCount = 20; const particles = new THREE.Group(); const particleMat = new THREE.MeshBasicMaterial({ color }); for (let i = 0; i < particleCount; i++) { const particle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), particleMat); particle.position.copy(position); particle.velocity = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3); particle.lifetime = Math.random() * 0.5 + 0.3; particles.add(particle); } gameElements.scene.add(particles); gameElements.activeParticles.push(particles); }
function updateParticles(delta) { gameElements.activeParticles.forEach((particleGroup, index) => { let allDead = true; particleGroup.children.forEach(p => { if (p.lifetime > 0) { p.lifetime -= delta; p.position.add(p.velocity.clone().multiplyScalar(delta)); p.velocity.y -= 9.8 * delta; p.scale.setScalar(p.lifetime * 2); allDead = false; } else { p.visible = false; } }); if (allDead) { gameElements.scene.remove(particleGroup); gameElements.activeParticles.splice(index, 1); } }); }
function triggerCameraShake(intensity, duration) { gameElements.cameraShake.intensity = intensity; gameElements.cameraShake.time = duration; }
function updateCameraShake() { const shake = gameElements.cameraShake; if (shake.time > 0) { shake.time -= 0.016; const amount = shake.intensity * shake.time; const originalPos = new THREE.Vector3(0, 5, 9); gameElements.camera.position.x = originalPos.x + (Math.random() - 0.5) * amount; gameElements.camera.position.y = originalPos.y + (Math.random() - 0.5) * amount; } }
function createBallTrail(color) { const trailGeometry = new THREE.BufferGeometry(); const trailPositions = new Float32Array(30 * 3); trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3)); const trailMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0 }); const trail = new THREE.Line(trailGeometry, trailMaterial); trail.positions = trailPositions; return trail; }
function updateTrail(trail, ballPosition, isMoving) { if (!isMoving) { trail.material.opacity -= 0.1; return; } trail.material.opacity = 1; const positions = trail.positions; for (let i = positions.length / 3 - 1; i > 0; i--) { positions[i * 3] = positions[(i - 1) * 3]; positions[i * 3 + 1] = positions[(i - 1) * 3 + 1]; positions[i * 3 + 2] = positions[(i - 1) * 3 + 2]; } positions[0] = ballPosition.x; positions[1] = ballPosition.y; positions[2] = ballPosition.z; trail.geometry.attributes.position.needsUpdate = true; }


// =============================================================================
//  NETWORKING
// =============================================================================
function startLocal() { document.getElementById('mainMenu').style.display = 'none'; document.getElementById('onlineMenu').style.display = 'none'; init(); gameState.online.isOnlineMode = false; startCountdown(); }
function createRoom() { gameState.online.isOnlineMode = true; gameState.online.isHost = true; gameState.online.currentPlayerRole = 'red'; gameState.online.playerName = document.getElementById('playerNameInput').value || "Host"; const peer = new Peer(); gameState.online.peer = peer; peer.on('open', (id) => { gameState.online.roomCode = id; init(); updateScoreBoard(); }); peer.on('connection', (connection) => { gameState.online.conn = connection; setupConnection(); }); }
function joinRoom() { const code = document.getElementById('roomCodeInput').value; if (!code) { alert("Please enter a room code."); return; } gameState.online.isOnlineMode = true; gameState.online.isHost = false; gameState.online.currentPlayerRole = 'blue'; gameState.online.playerName = document.getElementById('playerNameInput').value || "Guest"; const peer = new Peer(); gameState.online.peer = peer; peer.on('open', () => { const conn = peer.connect(code); gameState.online.conn = conn; setupConnection(); }); }
function setupConnection() { const { conn } = gameState.online; conn.on('open', () => { if (!gameState.online.isHost) init(); conn.send({ type: 'name', name: gameState.online.playerName }); }); conn.on('data', (data) => { switch (data.type) { case 'name': gameState.online.opponentName = data.name; updateScoreBoard(); if (gameState.online.isHost) { conn.send({ type: 'start-game', name: gameState.online.playerName }); startCountdown(); gameState.online.syncInterval = setInterval(syncGameState, CONSTANTS.SYNC_INTERVAL_MS); } break; case 'start-game': gameState.online.opponentName = data.name; updateScoreBoard(); startCountdown(); break; case 'hit': if (data.player !== gameState.online.currentPlayerRole) { swingBat(data.player); processHit(data.player); } break; case 'reset-request': if (!gameState.online.pendingRestart) { gameState.online.pendingRestart = true; showResetPrompt(); } break; case 'reset-confirm': resetGame(); gameState.online.pendingRestart = false; break; case 'sync': if (!gameState.online.isHost) { gameState.online.targetRedBallAngle = data.r_a; gameState.online.targetBlueBallAngle = data.b_a; gameState.red.ballSpeed = data.r_s; gameState.blue.ballSpeed = data.b_s; gameState.red.direction = data.r_d; gameState.blue.direction = data.b_d; gameState.red.score = data.r_sc; gameState.blue.score = data.b_sc; gameState.gameTime = data.time; updateScoreBoard(); } break; } }); conn.on('close', () => endGame(`${gameState.online.opponentName} disconnected.`)); }
function syncGameState() { const { conn, isHost } = gameState.online; if (isHost && conn?.open) { conn.send({ type: 'sync', r_a: gameState.red.ballAngle, b_a: gameState.blue.ballAngle, r_s: gameState.red.ballSpeed, b_s: gameState.blue.ballSpeed, r_d: gameState.red.direction, b_d: gameState.blue.direction, r_sc: gameState.red.score, b_sc: gameState.blue.score, time: gameState.gameTime, }); } }


// =============================================================================
//  UTILITY FUNCTIONS
// =============================================================================
function loadSounds() { gameElements.hitSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2048/2048-preview.mp3'); gameElements.hitSound.preload = 'auto'; }
function playHitSound() { if (gameElements.hitSound) { gameElements.hitSound.currentTime = 0; gameElements.hitSound.play().catch(e => {}); } }
function normalizeAngle(angle) { angle = angle % (2 * Math.PI); return angle < 0 ? angle + 2 * Math.PI : angle; }
function lerp(start, end, amt) { return (1 - amt) * start + amt * end; }
function updateBallPosition(ball, angle, height) { ball.position.x = Math.cos(angle) * CONSTANTS.ORBIT_RADIUS; ball.position.z = Math.sin(angle) * CONSTANTS.ORBIT_RADIUS; ball.position.y = height; }


// =============================================================================
//  SCRIPT EXECUTION STARTS HERE
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
    // Menu navigation
    document.getElementById('startLocalBtn')?.addEventListener('click', startLocal);
    document.getElementById('showOnlineBtn')?.addEventListener('click', () => {
        document.getElementById('mainMenu').style.display = 'none';
        document.getElementById('onlineMenu').style.display = 'block';
    });
    document.getElementById('backToMainBtn')?.addEventListener('click', () => {
        document.getElementById('onlineMenu').style.display = 'none';
        document.getElementById('mainMenu').style.display = 'block';
    });

    // Online actions
    document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);
    document.getElementById('joinRoomBtn')?.addEventListener('click', joinRoom);
});
