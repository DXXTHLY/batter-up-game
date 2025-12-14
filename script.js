// =============================================================================
//  GAME CONSTANTS
// =============================================================================
const CONSTANTS = {
    GAME_DURATION_S: 60,
    COUNTDOWN_S: 3,
    ORBIT_RADIUS: 3,
    BASE_SPEED: 0.03,
    SPEED_INCREMENT: 0.006,
    MAX_SPEED: 0.35,
    MISS_COOLDOWN_MS: 800,
    HIT_TOLERANCE: 0.6,
    RED_PLAYER_ANGLE: Math.PI,
    BLUE_PLAYER_ANGLE: 0,
    RED_BALL_HEIGHT: 2.0,
    BLUE_BALL_HEIGHT: 1.2,
    BLOOM_PARAMS: { strength: 1.5, radius: 0.4, threshold: 0.7 },
};

// =============================================================================
//  GAME STATE
// =============================================================================
const gameElements = {
    scene: null, camera: null, renderer: null, composer: null,
    three: {}, activeParticles: [],
    cameraShake: { intensity: 0, decay: 0.95 },
};

let gameState = {
    isGameActive: false,
    gameTime: CONSTANTS.GAME_DURATION_S,
    red: { score: 0, ballAngle: CONSTANTS.RED_PLAYER_ANGLE + 0.5, ballSpeed: CONSTANTS.BASE_SPEED, direction: -1, cooldownTimer: 0, swingTimer: 0 },
    blue: { score: 0, ballAngle: CONSTANTS.BLUE_PLAYER_ANGLE - 0.5, ballSpeed: CONSTANTS.BASE_SPEED, direction: 1, cooldownTimer: 0, swingTimer: 0 }
};

let animationFrameId = null;
let gameIntervalId = null;

// =============================================================================
//  INITIALIZATION
// =============================================================================
function init() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    const oldCanvas = document.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    setupScene();
    setupLighting();
    setupPostProcessing();
    createGameObjects();
    setupInputs();
    setupUIEvents();

    animate();
}

// =============================================================================
//  UI BUTTONS
// =============================================================================
function setupUIEvents() {
    const localBtn = document.getElementById('startLocalBtn');
    if (localBtn) localBtn.addEventListener('click', startLocalGame);

    const onlineBtn = document.getElementById('showOnlineBtn');
    if (onlineBtn) onlineBtn.addEventListener('click', () => {
        alert("Online mode requires server setup. Playing Local instead!");
        startLocalGame();
    });
}

// =============================================================================
//  GAME FLOW
// =============================================================================
function startLocalGame() {
    const menu = document.getElementById('mainMenu');
    if(menu) menu.style.display = 'none';

    const title = document.querySelector('.title-card');
    if(title) title.style.display = 'none';

    resetGameVariables();
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
    updateScoreUI();
    const timerEl = document.getElementById('timer');
    if(timerEl) timerEl.innerText = CONSTANTS.GAME_DURATION_S;
}

function startCountdown() {
    let count = CONSTANTS.COUNTDOWN_S;
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
    if(gameIntervalId) clearInterval(gameIntervalId);
    gameIntervalId = setInterval(() => {
        if (!gameState.isGameActive) return;
        gameState.gameTime--;
        const timerEl = document.getElementById('timer');
        if(timerEl) timerEl.innerText = gameState.gameTime;
        if(gameState.gameTime <= 0) endGame();
    }, 1000);
}

function endGame() {
    gameState.isGameActive = false;
    clearInterval(gameIntervalId);
    let winner = "IT'S A DRAW!";
    if(gameState.red.score > gameState.blue.score) winner = "RED WINS!";
    else if(gameState.blue.score > gameState.red.score) winner = "BLUE WINS!";
    alert("GAME OVER\n" + winner);
    const menu = document.getElementById('mainMenu');
    if(menu) menu.style.display = 'block';
}

// =============================================================================
//  MAIN LOOP
// =============================================================================
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const delta = 0.016;

    if(gameState.isGameActive) updateBallPhysics();
    updateSwings(delta);
    updateParticles(delta);
    updateCameraShake();

    if(gameElements.composer) gameElements.composer.render();
    else gameElements.renderer.render(gameElements.scene, gameElements.camera);
}

// =============================================================================
//  PHYSICS
// =============================================================================
function updateBallPhysics() {
    moveBall(gameState.red, gameElements.three.redBall);
    moveBall(gameState.blue, gameElements.three.blueBall);
}

function moveBall(player, ballMesh) {
    player.ballAngle += player.ballSpeed * player.direction;
    if(player.ballAngle > Math.PI*2) player.ballAngle -= Math.PI*2;
    if(player.ballAngle < 0) player.ballAngle += Math.PI*2;
    updateBallPosition(ballMesh, player.ballAngle, ballMesh.position.y);
    if(player.cooldownTimer > 0) player.cooldownTimer -= 16;
}

function handleInput(playerKey) {
    if(!gameState.isGameActive) return;
    const isRed = playerKey === 'red';
    const player = isRed ? gameState.red : gameState.blue;
    const targetAngle = isRed ? CONSTANTS.RED_PLAYER_ANGLE : CONSTANTS.BLUE_PLAYER_ANGLE;
    if(player.cooldownTimer > 0) return;

    triggerSwingAnimation(player);
    let angleDiff = Math.abs(getShortestAngleDistance(player.ballAngle, targetAngle));
    if(angleDiff <= CONSTANTS.HIT_TOLERANCE) {
        player.score++;
        updateScoreUI();
        player.ballSpeed = Math.min(player.ballSpeed + CONSTANTS.SPEED_INCREMENT, CONSTANTS.MAX_SPEED);
        createExplosion(isRed);
        addCameraShake(0.3);
    } else {
        player.ballSpeed = CONSTANTS.BASE_SPEED;
        player.cooldownTimer = CONSTANTS.MISS_COOLDOWN_MS;
    }
}

function getShortestAngleDistance(a,b) {
    let diff = (b-a+Math.PI) % (2*Math.PI) - Math.PI;
    return diff < -Math.PI ? diff + 2*Math.PI : diff;
}

// =============================================================================
//  THREE.JS SETUP
// =============================================================================
function setupScene() {
    gameElements.scene = new THREE.Scene();
    gameElements.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight,0.1,1000);
    gameElements.camera.position.set(0,6,11);
    gameElements.camera.lookAt(0,2,0);
    gameElements.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
    gameElements.renderer.setSize(window.innerWidth,window.innerHeight);
    gameElements.renderer.setPixelRatio(window.devicePixelRatio);
    gameElements.renderer.shadowMap.enabled = true;
    document.body.appendChild(gameElements.renderer.domElement);
}

function setupLighting() {
    const ambient = new THREE.AmbientLight(0x404040,1.5);
    gameElements.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff,1.5);
    dir.position.set(5,10,5); dir.castShadow=true;
    gameElements.scene.add(dir);
}

function setupPostProcessing() {
    if(typeof THREE.EffectComposer !== 'undefined') {
        const renderScene = new THREE.RenderPass(gameElements.scene, gameElements.camera);
        const bloomPass = new THREE.UnrealBloomPass(
            new THREE.Vector2(window.innerWidth,window.innerHeight),
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.2,5,16), new THREE.MeshStandardMaterial({color:0x888888}));
    pole.position.y = 2.5;
    gameElements.scene.add(pole);
    gameElements.three.pole = pole;

    const ballGeo = new THREE.SphereGeometry(0.3,32,32);
    const redBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({color:0xff3333,emissive:0x550000}));
    redBall.position.y = CONSTANTS.RED_BALL_HEIGHT;
    const blueBall = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({color:0x3333ff,emissive:0x000055}));
    blueBall.position.y = CONSTANTS.BLUE_BALL_HEIGHT;
    gameElements.scene.add(redBall,blueBall);
    gameElements.three.redBall = redBall;
    gameElements.three.blueBall = blueBall;

    createPlayerMesh('red');
    createPlayerMesh('blue');
}

function createPlayerMesh(color){
    const isRed = color==='red';
    const group = new THREE.Group();
    group.position.x = isRed ? -CONSTANTS.ORBIT_RADIUS-1 : CONSTANTS.ORBIT_RADIUS+1;
    group.rotation.y = isRed ? Math.PI/2 : -Math.PI/2;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,2,12), new THREE.MeshStandardMaterial({color:isRed?0xaa0000:0x0000aa}));
    body.position.y = 1;
    group.add(body);

    const batGroup = new THREE.Group();
    batGroup.position.set(0,1.2,0.5);
    const batMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,1.5), new THREE.MeshStandardMaterial({color:0xdddddd}));
    batMesh.position.z = 0.75;
    batGroup.add(batMesh);
    group.add(batGroup);

    gameElements.scene.add(group);
    gameElements.three[color+'Bat'] = batGroup;
}

function updateBallPosition(mesh,angle,height){
    mesh.position.x = Math.cos(angle)*CONSTANTS.ORBIT_RADIUS;
    mesh.position.z = Math.sin(angle)*CONSTANTS.ORBIT_RADIUS;
    mesh.position.y = height;
}

// =============================================================================
//  ANIMATIONS
// =============================================================================
function triggerSwingAnimation(player){ player.swingTimer = 1.0; }
function updateSwings(delta){
    ['red','blue'].forEach(k=>{
        const state = gameState[k];
        const bat = gameElements.three[k+'Bat'];
        if(bat && state.swingTimer>0){
            state.swingTimer -= delta*5;
            bat.rotation.y = -Math.sin(state.swingTimer*Math.PI)*2.0;
        } else if(bat) bat.rotation.y=0;
    });
}

function createExplosion(isRed){
    const color = isRed?0xff0000:0x0000ff;
    const pos = isRed?gameElements.three.redBall.position:gameElements.three.blueBall.position;
    for(let i=0;i<8;i++){
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1), new THREE.MeshBasicMaterial({color}));
        p.position.copy(pos);
        p.userData = {vel:new THREE.Vector3((Math.random()-0.5)*0.2,(Math.random()-0.5)*0.2,(Math.random()-0.5)*0.2),life:1.0};
        gameElements.scene.add(p);
        gameElements.activeParticles.push(p);
    }
}

function updateParticles(delta){
    for(let i=gameElements.activeParticles.length-1;i>=0;i--){
        const p = gameElements.activeParticles[i];
        p.userData.life -= delta;
        p.position.add(p.userData.vel);
        p.rotation.x +=0.1;
        p.scale.setScalar(p.userData.life);
        if(p.userData.life<=0){
            gameElements.scene.remove(p);
            gameElements.activeParticles.splice(i,1);
        }
    }
}

function addCameraShake(amount){ gameElements.cameraShake.intensity=amount; }
function updateCameraShake(){
    if(gameElements.cameraShake.intensity>0){
        gameElements.camera.position.x=(Math.random()-0.5)*gameElements.cameraShake.intensity;
        gameElements.camera.position.y=6+(Math.random()-0.5)*gameElements.cameraShake.intensity;
        gameElements.cameraShake.intensity*=0.9;
        if(gameElements.cameraShake.intensity<0.01) gameElements.cameraShake.intensity=0;
    }
}

// =============================================================================
//  UI UPDATE
// =============================================================================
function updateScoreUI(){
    const r=document.getElementById('scoreRed');
    const b=document.getElementById('scoreBlue');
    if(r) r.innerText = gameState.red.score;
    if(b) b.innerText = gameState.blue.score;
}

// =============================================================================
//  INPUTS
// =============================================================================
function setupInputs(){
    window.addEventListener('keydown',(e)=>{
        if(!gameState.isGameActive) return;
        if(['KeyA','KeyS','ShiftLeft'].includes(e.code)) handleInput('red');
        if(['ArrowRight','ArrowDown','Enter'].includes(e.code)) handleInput('blue');
    });
    window.addEventListener('resize',()=>{
        gameElements.camera.aspect = window.innerWidth/window.innerHeight;
        gameElements.camera.updateProjectionMatrix();
        gameElements.renderer.setSize(window.innerWidth,window.innerHeight);
        if(gameElements.composer) gameElements.composer.setSize(window.innerWidth,window.innerHeight);
    });
}

// =============================================================================
//  START GAME
// =============================================================================
window.addEventListener('DOMContentLoaded',init);
