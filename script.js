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
    HIT_TOLERANCE: 0.25, // Tight sweet spot for skill
    BACK_OF_BAT_TOLERANCE: 0.4, // Early swing zone
    FRICTION: 0.995, // Gradual slowdown for late swings
    RED_PLAYER_ANGLE: Math.PI,
    BLUE_PLAYER_ANGLE: 0,
    RED_BALL_HEIGHT: 2.0,
    BLUE_BALL_HEIGHT: 1.2,
};

// =============================================================================
//  GAME STATE
// =============================================================================
const gameElements = {
    scene: null, camera: null, renderer: null,
    three: {}, activeParticles: [],
    cameraShake: { intensity: 0 },
    streakPopup: { element: null, timer: 0 }
};

let gameState = {
    isGameActive: false,
    isMenuOpen: true,
    gameTime: CONSTANTS.GAME_DURATION_S,
    red: { score: 0, ballAngle: CONSTANTS.RED_PLAYER_ANGLE + 0.5, ballSpeed: CONSTANTS.BASE_SPEED, direction: -1, cooldownTimer: 0, swingTimer: 0, streak: 0, totalHits: 0 },
    blue: { score: 0, ballAngle: CONSTANTS.BLUE_PLAYER_ANGLE - 0.5, ballSpeed: CONSTANTS.BASE_SPEED, direction: 1, cooldownTimer: 0, swingTimer: 0, streak: 0, totalHits: 0 }
};

let animationFrameId = null;
let gameIntervalId = null;

// =============================================================================
//  INITIALIZATION
// =============================================================================
function init() {
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
    const oldCanvas = document.querySelector('canvas'); if(oldCanvas) oldCanvas.remove();

    setupScene();
    setupLighting();
    createGameObjects();
    setupInputs();
    setupUIEvents();
    createStreakPopup();
    animate();
}

// =============================================================================
//  STREAK POPUP
// =============================================================================
function createStreakPopup(){
    const popup = document.createElement('div');
    popup.style.position = 'absolute';
    popup.style.fontSize = '32px';
    popup.style.fontWeight = 'bold';
    popup.style.color = 'yellow';
    popup.style.textShadow = '2px 2px 5px black';
    popup.style.display = 'none';
    document.body.appendChild(popup);
    gameElements.streakPopup.element = popup;
}

function showStreakPopup(player){
    const popup = gameElements.streakPopup.element;
    popup.innerText = `STREAK x${player.streak}`;
    popup.style.left = (window.innerWidth / 2 - 50) + 'px';
    popup.style.top = '100px';
    popup.style.display = 'block';
    gameElements.streakPopup.timer = 60; // ~1 second
}

function updateStreakPopup(){
    if(gameElements.streakPopup.timer>0){
        gameElements.streakPopup.timer--;
        if(gameElements.streakPopup.timer<=0){
            gameElements.streakPopup.element.style.display='none';
        }
    }
}

// =============================================================================
//  UI EVENTS
// =============================================================================
function setupUIEvents() {
    const localBtn = document.getElementById('startLocalBtn');
    if (localBtn) localBtn.addEventListener('click', startLocalGame);

    const onlineBtn = document.getElementById('showOnlineBtn');
    if (onlineBtn) onlineBtn.addEventListener('click', () => {
        alert("Online mode requires a server setup. Playing Local for now!");
        startLocalGame();
    });
}

// =============================================================================
//  GAME FLOW
// =============================================================================
function startLocalGame() {
    const menu = document.getElementById('mainMenu');
    if (menu) menu.style.display = 'none';
    const title = document.querySelector('.title-card'); 
    if (title) title.style.display = 'none';
    resetGameVariables();
    startCountdown();
}

function resetGameVariables() {
    gameState.isGameActive = false;
    gameState.gameTime = CONSTANTS.GAME_DURATION_S;
    ['red','blue'].forEach(c=>{
        gameState[c].score=0;
        gameState[c].ballSpeed=CONSTANTS.BASE_SPEED;
        gameState[c].ballAngle=(c==='red'?CONSTANTS.RED_PLAYER_ANGLE:CONSTANTS.BLUE_PLAYER_ANGLE) + (c==='red'?0.5:-0.5);
        gameState[c].streak=0;
        gameState[c].totalHits=0;
        gameState[c].cooldownTimer=0;
    });
    updateScoreUI();
    const timerEl = document.getElementById('timer');
    if(timerEl) timerEl.innerText = CONSTANTS.GAME_DURATION_S;
}

function startCountdown(){
    let count = CONSTANTS.COUNTDOWN_S;
    const countInterval = setInterval(()=>{
        console.log("Countdown:", count);
        count--;
        if(count<0){
            clearInterval(countInterval);
            startGameplay();
        }
    },1000);
}

function startGameplay(){
    gameState.isGameActive=true;
    if(gameIntervalId) clearInterval(gameIntervalId);
    gameIntervalId=setInterval(()=>{
        if(!gameState.isGameActive) return;
        gameState.gameTime--;
        const timerEl=document.getElementById('timer');
        if(timerEl) timerEl.innerText=gameState.gameTime;
        if(gameState.gameTime<=0) endGame();
    },1000);
}

function endGame(){
    gameState.isGameActive=false;
    clearInterval(gameIntervalId);
    let winnerText="";
    if(gameState.red.score>gameState.blue.score) winnerText="RED WINS!";
    else if(gameState.blue.score>gameState.red.score) winnerText="BLUE WINS!";
    else winnerText="IT'S A DRAW!";
    alert("GAME OVER\n"+winnerText);
    const menu = document.getElementById('mainMenu');
    if(menu) menu.style.display='block';
}

// =============================================================================
//  INPUT HANDLING
// =============================================================================
function handleInput(playerKey){
    if(!gameState.isGameActive) return;
    const isRed=playerKey==='red';
    const player=gameState[isRed?'red':'blue'];
    const targetAngle=isRed?CONSTANTS.RED_PLAYER_ANGLE:CONSTANTS.BLUE_PLAYER_ANGLE;

    if(player.cooldownTimer>0) return;
    triggerSwingAnimation(player);

    const angleDiff=getShortestAngleDistance(player.ballAngle,targetAngle);

    // -----------------------
    // TOO EARLY / BACK OF BAT
    // -----------------------
    if(angleDiff*player.direction > CONSTANTS.BACK_OF_BAT_TOLERANCE){
        player.ballSpeed = -player.ballSpeed; // Reverse
        player.streak = 0;
        player.cooldownTimer = CONSTANTS.MISS_COOLDOWN_MS;
        return;
    }

    // -----------------------
    // PERFECT HIT
    // -----------------------
    if(Math.abs(angleDiff)<=CONSTANTS.HIT_TOLERANCE){
        player.score++;
        player.totalHits++;
        player.ballSpeed=Math.min(player.ballSpeed+CONSTANTS.SPEED_INCREMENT,CONSTANTS.MAX_SPEED);
        player.streak++;
        if(player.streak>1) showStreakPopup(player);
        updateScoreUI();
        createExplosion(isRed);
        addCameraShake(0.3);
        return;
    }

    // -----------------------
    // TOO LATE / MISS
    // -----------------------
    player.streak=0;
    player.cooldownTimer = CONSTANTS.MISS_COOLDOWN_MS;
    // Gradual slowdown via friction handled in physics update
}

// =============================================================================
//  THREE.JS SCENE SETUP
// =============================================================================
function setupScene(){
    gameElements.scene = new THREE.Scene();
    gameElements.camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight,0.1,1000);
    gameElements.camera.position.set(0,6,11); 
    gameElements.camera.lookAt(0,2,0);
    gameElements.renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
    gameElements.renderer.setSize(window.innerWidth, window.innerHeight);
    gameElements.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(gameElements.renderer.domElement);
}

function setupLighting(){
    const amb = new THREE.AmbientLight(0x404040,1.5);
    const dir = new THREE.DirectionalLight(0xffffff,1.5);
    dir.position.set(5,10,5); dir.castShadow=true;
    gameElements.scene.add(amb,dir);
}

// =============================================================================
//  GAME OBJECTS
// =============================================================================
function createGameObjects(){
    const poleGeo = new THREE.CylinderGeometry(0.2,0.2,5,16);
    const poleMat = new THREE.MeshStandardMaterial({color:0x888888});
    const pole = new THREE.Mesh(poleGeo,poleMat);
    pole.position.y=2.5;
    gameElements.scene.add(pole);
    gameElements.three.pole = pole;

    const ballGeo = new THREE.SphereGeometry(0.3,32,32);
    const redBall = new THREE.Mesh(ballGeo,new THREE.MeshStandardMaterial({color:0xff3333,emissive:0x550000}));
    redBall.position.y=CONSTANTS.RED_BALL_HEIGHT;
    const blueBall = new THREE.Mesh(ballGeo,new THREE.MeshStandardMaterial({color:0x3333ff,emissive:0x000055}));
    blueBall.position.y=CONSTANTS.BLUE_BALL_HEIGHT;
    gameElements.scene.add(redBall,blueBall);
    gameElements.three.redBall=redBall;
    gameElements.three.blueBall=blueBall;

    createPlayerMesh('red'); createPlayerMesh('blue');
}

function createPlayerMesh(color){
    const isRed=color==='red';
    const group=new THREE.Group();
    group.position.x=isRed?-CONSTANTS.ORBIT_RADIUS-1:CONSTANTS.ORBIT_RADIUS+1;
    group.rotation.y=isRed?Math.PI/2:-Math.PI/2;

    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,2,12),new THREE.MeshStandardMaterial({color:isRed?0xaa0000:0x0000aa}));
    body.position.y=1; group.add(body);

    const batGroup=new THREE.Group();
    batGroup.position.set(0,1.2,0.5);
    const batMesh=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,1.5),new THREE.MeshStandardMaterial({color:0xdddddd}));
    batMesh.position.z=0.75; batGroup.add(batMesh);
    group.add(batGroup);
    gameElements.scene.add(group);
    gameElements.three[color+'Bat']=batGroup;
}

// =============================================================================
//  ANIMATION & PHYSICS
// =============================================================================
function animate(){
    animationFrameId=requestAnimationFrame(animate);
    const delta=0.016;

    if(gameState.isGameActive) updateBallPhysics();
    updateSwings(delta);
    updateParticles(delta);
    updateCameraShake();
    updateStreakPopup();
    gameElements.renderer.render(gameElements.scene,gameElements.camera);
}

function updateBallPhysics(){
    ['red','blue'].forEach(c=>{
        const player=gameState[c];
        const ball=gameElements.three[c+'Ball'];
        ball.position.x=Math.cos(player.ballAngle)*CONSTANTS.ORBIT_RADIUS;
        ball.position.z=Math.sin(player.ballAngle)*CONSTANTS.ORBIT_RADIUS;
        ball.position.y=c==='red'?CONSTANTS.RED_BALL_HEIGHT:CONSTANTS.BLUE_BALL_HEIGHT;

        // Advance ball
        player.ballAngle+=player.ballSpeed*player.direction;

        // Wrap angles
        if(player.ballAngle>Math.PI*2) player.ballAngle-=Math.PI*2;
        if(player.ballAngle<0) player.ballAngle+=Math.PI*2;

        // Apply friction if ball speed is positive (missed late)
        if(player.cooldownTimer>0) player.ballSpeed*=CONSTANTS.FRICTION;

        if(player.cooldownTimer>0) player.cooldownTimer-=16;
    });
}

// =============================================================================
//  UTILS
// =============================================================================
function getShortestAngleDistance(a,b){
    let diff=(b-a+Math.PI)%(2*Math.PI)-Math.PI;
    return diff<-Math.PI?diff+2*Math.PI:diff;
}

// =============================================================================
//  SWINGS & PARTICLES
// =============================================================================
function triggerSwingAnimation(player){player.swingTimer=1.0;}
function updateSwings(delta){
    ['red','blue'].forEach(key=>{
        const state=gameState[key]; const bat=gameElements.three[key+'Bat'];
        if(bat && state.swingTimer>0){state.swingTimer-=delta*5; bat.rotation.y=-Math.sin(state.swingTimer*Math.PI)*2.0;}
        else if(bat) bat.rotation.y=0;
    });
}

function createExplosion(isRed){
    const color=isRed?0xff0000:0x0000ff;
    const pos=isRed?gameElements.three.redBall.position:gameElements.three.blueBall.position;
    for(let i=0;i<10;i++){
        const p=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.1),new THREE.MeshBasicMaterial({color:color}));
        p.position.copy(pos);
        p.userData={vel:new THREE.Vector3((Math.random()-0.5)*0.2,(Math.random()-0.5)*0.2,(Math.random()-0.5)*0.2),life:1.0};
        gameElements.scene.add(p);
        gameElements.activeParticles.push(p);
    }
}

function updateParticles(delta){
    for(let i=gameElements.activeParticles.length-1;i>=0;i--){
        const p=gameElements.activeParticles[i];
        p.userData.life-=delta; p.position.add(p.userData.vel); p.rotation.x+=0.1; p.scale.setScalar(p.userData.life);
        if(p.userData.life<=0){gameElements.scene.remove(p); gameElements.activeParticles.splice(i,1);}
    }
}

function addCameraShake(amount){gameElements.cameraShake.intensity=amount;}
function updateCameraShake(){
    if(gameElements.cameraShake.intensity>0){
        gameElements.camera.position.x=(Math.random()-0.5)*gameElements.cameraShake.intensity;
        gameElements.camera.position.y=6+(Math.random()-0.5)*gameElements.cameraShake.intensity;
        gameElements.cameraShake.intensity*=0.9;
        if(gameElements.cameraShake.intensity<0.01) gameElements.cameraShake.intensity=0;
    }
}

// =============================================================================
//  INPUTS
// =============================================================================
function setupInputs(){
    window.addEventListener('keydown',e=>{
        if(!gameState.isGameActive) return;
        if(['KeyA','KeyS','ShiftLeft'].includes(e.code)) handleInput('red');
        if(['ArrowRight','ArrowDown','Enter'].includes(e.code)) handleInput('blue');
    });

    window.addEventListener('resize',()=>{
        gameElements.camera.aspect=window.innerWidth/window.innerHeight;
        gameElements.camera.updateProjectionMatrix();
        gameElements.renderer.setSize(window.innerWidth,window.innerHeight);
    });
}

// =============================================================================
//  START
// =============================================================================
window.addEventListener('DOMContentLoaded', init);

function updateScoreUI(){
    const scoreRed=document.getElementById('scoreRed'); if(scoreRed) scoreRed.innerText=gameState.red.score;
    const scoreBlue=document.getElementById('scoreBlue'); if(scoreBlue) scoreBlue.innerText=gameState.blue.score;
    const totalRed=document.getElementById('totalRed'); if(totalRed) totalRed.innerText=gameState.red.totalHits;
    const totalBlue=document.getElementById('totalBlue'); if(totalBlue) totalBlue.innerText=gameState.blue.totalHits;
}
