let scene, camera, renderer;
let redPlayer, bluePlayer;
let redBat, blueBat, redBall, blueBall, centralPole;
let redBatExtended = false;
let blueBatExtended = false;
let redSwinging = false;
let blueSwinging = false;
let redBallStarted = false;
let blueBallStarted = false;
let sessionHighscores = []; // Array of {winner, redScore, blueScore, time}
let peer = null;
let conn = null;
let isHost = false;
let playerName = "Player";
let opponentName = "Opponent";
let gameInterval; 
let roomCode = '';
let pendingRestart = false;
let syncInterval;



// Add at the top with other state variables

// Game state
let gameStarted = false;
let gameActive = false;
let countdownActive = false;
let gameTime = 40; // 40 second timer
let countdownTime = 3;
let redScore = 0;
let blueScore = 0;
let onlineMode = false;
let currentPlayerRole = null; // 'red' or 'blue'

// Ball physics
let redBallAngle = Math.PI; // Position angle around center (start in front of red player)
let blueBallAngle = 0.45;  // Start in front of blue player
let redBallBaseSpeed = 0.01; // was 0.01
let blueBallBaseSpeed = 0.01; // was 0.01
let redBallSpeed = 0; // Start at 0 (stationary)
let blueBallSpeed = 0;
let redDirection = -1; // -1 = counterclockwise, 1 = clockwise
let blueDirection = 1;
let redHitCount = 0; // Count consecutive hits to increase speed
let blueHitCount = 0;
let redLastHitTime = 0;
let blueLastHitTime = 0;
let redMissed = false;
let blueMissed = false;

// Constants
// Add these constants at the top with your other constants
const ZONE_TOO_EARLY = 0; // Red zone
const ZONE_HIT = 1;       // Green zone
const ZONE_MISS = 2;      // Yellow zone
const ballRadius = 0.3;
const poleRadius = 0.2;
const poleHeight = 5;
const orbitRadius = 3;
const batLength = 2;
const batThickness = 0.3;
const speedIncrement = 0.004; // was .002 How much speed increases per hit
const maxSpeed = 0.10; // was .08 Maximum speed cap
const missSpeedPenalty = 0.5; // Multiplier to reduce speed on miss
const swingDuration = 300; // Milliseconds for swing animation
const speedDecayRate = 0.9995; // How quickly speed decays when not hit (closer to 1 = slower decay)
const speedDecayDelay = 2000; // How long after last hit before decay starts (milliseconds)

// Sound effects
let hitSound;

// UI elements
let scoreBoard;
let timerDisplay;
let countdownDisplay;

  

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 8); // camera close
    camera.lookAt(0, 2, 0); // look up
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // Load sound effects
    loadSounds();
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x4CAF50,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Create central pole
    const poleGeometry = new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 16);
    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    centralPole = new THREE.Mesh(poleGeometry, poleMaterial);
    centralPole.position.y = poleHeight / 2;
    centralPole.castShadow = true;
    scene.add(centralPole);
    
    // Create players and bats
    createPlayers();
    
    // Create balls
    createBalls();

    function createChargeIndicators() {
        // Red charge indicator
        redChargeIndicator = document.createElement('div');
        redChargeIndicator.style.position = 'absolute';
        redChargeIndicator.style.bottom = '50px';
        redChargeIndicator.style.left = '20%';
        redChargeIndicator.style.width = '100px';
        redChargeIndicator.style.height = '10px';
        redChargeIndicator.style.backgroundColor = '#333';
        redChargeIndicator.style.display = 'none';
        document.body.appendChild(redChargeIndicator);
        
        // Blue charge indicator
        blueChargeIndicator = document.createElement('div');
        blueChargeIndicator.style.position = 'absolute';
        blueChargeIndicator.style.bottom = '50px';
        blueChargeIndicator.style.right = '20%';
        blueChargeIndicator.style.width = '100px';
        blueChargeIndicator.style.height = '10px';
        blueChargeIndicator.style.backgroundColor = '#333';
        blueChargeIndicator.style.display = 'none';
        document.body.appendChild(blueChargeIndicator);
      }
      
    
    // Create UI elements
    createScoreBoard();
    createTimerDisplay();
    createCountdownDisplay();
    createInstructions();
    addHitZoneMarkers();
    addDebugInfo();
    showHelpOverlay();


    // Event listeners
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
    
    // Start game with countdown
    startCountdown();
    showLeaderboard();
    if (!onlineMode || isHost) createHitZoneToggle();


}


function syncGameState() {
    if (isHost && conn && conn.open) {
        conn.send({
            type: 'sync',
            gameState: {
                redScore: redScore,
                blueScore: blueScore,
                redBallAngle: redBallAngle,
                blueBallAngle: blueBallAngle,
                redBallSpeed: redBallSpeed,
                blueBallSpeed: blueBallSpeed,
                redDirection: redDirection,
                blueDirection: blueDirection,
                redBallStarted: redBallStarted,
                blueBallStarted: blueBallStarted,
                gameTime: gameTime
            }
        });
    }
}




function createInstructions() {
    const instructions = document.createElement('div');
    instructions.style.position = 'absolute';
    instructions.style.bottom = '10px';
    instructions.style.left = '50%';
    instructions.style.transform = 'translateX(-50%)';
    instructions.style.backgroundColor = 'rgba(0,0,0,0.5)';
    instructions.style.color = 'white';
    instructions.style.padding = '8px 20px';
    instructions.style.fontFamily = 'Arial, sans-serif';
    instructions.style.fontSize = '16px';
    instructions.style.borderRadius = '5px';
    instructions.style.zIndex = '10';
    instructions.innerHTML = "Red: Hold & release <b>A</b> to swing<br>Blue: Hold & release <b>L</b> to swing";
    document.body.appendChild(instructions);
}


function loadSounds() {
    // Create audio element for hit sound
    hitSound = document.createElement('audio');
    hitSound.src = 'https://assets.mixkit.co/active_storage/sfx/2048/2048-preview.mp3';
    hitSound.preload = 'auto';
}

function playHitSound() {
    hitSound.currentTime = 0;
    hitSound.play().catch(e => console.log("Audio play error:", e));
}

// leaderboard
function showLeaderboard() {
    let leaderboard = document.getElementById('session-leaderboard');
    if (!leaderboard) {
        leaderboard = document.createElement('div');
        leaderboard.id = 'session-leaderboard';
        leaderboard.style.position = 'absolute';
        leaderboard.style.top = '110px';
        leaderboard.style.right = '20px';
        leaderboard.style.backgroundColor = 'rgba(0,0,0,0.7)';
        leaderboard.style.color = 'white';
        leaderboard.style.fontFamily = 'Arial, sans-serif';
        leaderboard.style.fontSize = '16px';
        leaderboard.style.padding = '12px 18px';
        leaderboard.style.borderRadius = '8px';
        leaderboard.style.zIndex = '20';
        leaderboard.style.maxWidth = '260px';
        document.body.appendChild(leaderboard);
    }
    let html = `<b>Session Highscores</b><br><table style="width:100%;color:white;"><tr><th>Time</th><th>Red</th><th>Blue</th><th>Winner</th></tr>`;
    // Show last 10 games, newest first
    sessionHighscores.slice(-10).reverse().forEach(entry => {
        html += `<tr>
            <td>${entry.time}</td>
            <td style="color:#ff4444">${entry.redScore}</td>
            <td style="color:#44aaff">${entry.blueScore}</td>
            <td>${entry.winner.replace(' WINS!', '')}</td>
        </tr>`;
    });
    html += `</table>`;
    leaderboard.innerHTML = html;
}


function createPlayers() {
    // Red player (positioned at left side)
    redPlayer = new THREE.Group();
    redPlayer.position.set(-orbitRadius - 1, 0, 0);
    
    const redPlayerBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2, 16),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    redPlayerBody.position.y = 1;
    redPlayerBody.castShadow = true;
    redPlayer.add(redPlayerBody);
    
    // Red bat
    // Red bat - Positioned properly
    // Red bat - Positioned properly
    redBat = new THREE.Group();
    redBat.position.y = 1.0;
    redBat.position.x = 0.4; // Position bat slightly to the right side of player
    redBat.position.z = 0.2; // Position bat slightly forward
    redPlayer.add(redBat);
    
    const redBatMesh = new THREE.Mesh(
        new THREE.BoxGeometry(batLength, batThickness, batThickness),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    redBatMesh.position.x = batLength/2;
    redBatMesh.castShadow = true;
    redBat.add(redBatMesh);
    
    scene.add(redPlayer);
        
    // Blue player (positioned at right side)
    bluePlayer = new THREE.Group();
    bluePlayer.position.set(orbitRadius + 1, 0, 0);
    
    const bluePlayerBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2, 16),
        new THREE.MeshStandardMaterial({ color: 0x0000ff })
    );
    bluePlayerBody.position.y = 1;
    bluePlayerBody.castShadow = true;
    bluePlayer.add(bluePlayerBody);
    
      // Blue bat - Positioned properly
    blueBat = new THREE.Group();
    blueBat.position.y = 1.0;
    blueBat.position.x = -0.4; // Position bat slightly to the left side of player
    blueBat.position.z = 0.2; // Position bat slightly forward
    bluePlayer.add(blueBat);
    
    const blueBatMesh = new THREE.Mesh(
        new THREE.BoxGeometry(batLength, batThickness, batThickness),
        new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    blueBatMesh.position.x = -batLength/2;
    blueBatMesh.castShadow = true;
    blueBat.add(blueBatMesh);
    
    scene.add(bluePlayer);
    
    // Make players face the center
    redPlayer.lookAt(0, 0, 0);
    bluePlayer.lookAt(0, 0, 0);
    }

function createBalls() {
    const ballGeometry = new THREE.SphereGeometry(ballRadius, 32, 32);
    
    // Red ball - higher position
    redBall = new THREE.Mesh(
        ballGeometry,
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    redBall.castShadow = true;
    updateBallPosition(redBall, redBallAngle, 2.0);
    scene.add(redBall);
    
    // Blue ball - standard position
    blueBall = new THREE.Mesh(
        ballGeometry,
        new THREE.MeshStandardMaterial({ color: 0x0000ff })
    );
    blueBall.castShadow = true;
    updateBallPosition(blueBall, blueBallAngle, 1.0);
    scene.add(blueBall);
}

function addHitZoneMarkers() {
    // Colors
    const earlyColor = 0xff0000;  // Red (back zone)
    const hitColor = 0x00ff00;    // Green (middle zone)
    const missColor = 0xffff00;   // Yellow (front zone)
  
    // RED PLAYER ZONES (these are correct)
    const redZoneHeight = 2.1;
    const redArcLength = 0.3;
    createZoneArc(Math.PI - redArcLength, Math.PI, redZoneHeight, missColor); // Yellow (front)
    createZoneArc(Math.PI, Math.PI + redArcLength, redZoneHeight, hitColor);  // Green (middle)
    createZoneArc(Math.PI + redArcLength, Math.PI + redArcLength*2, redZoneHeight, earlyColor); // Red (back)
  
    // BLUE PLAYER ZONES (swap yellow and red so yellow is front, red is back)
    const blueZoneHeight = 1.1;
    const blueArcLength = 0.3;
    // Fixed (yellow and red swapped)
    createZoneArc(blueArcLength*2, blueArcLength*3, blueZoneHeight, missColor); // Yellow (front)
    createZoneArc(blueArcLength, blueArcLength*2, blueZoneHeight, hitColor);     // Green (middle)
    createZoneArc(0, blueArcLength, blueZoneHeight, earlyColor);                 // Red (back)
  }
  
  
  function createHitZoneToggle() {
    // Only show for host in online mode or always in local mode
    if (onlineMode && !isHost) return;
    const existing = document.getElementById('hit-zone-toggle');
    if (existing) return;

    const toggleDiv = document.createElement('div');
    toggleDiv.id = 'hit-zone-toggle';
    toggleDiv.style.position = 'absolute';
    toggleDiv.style.bottom = '30px';
    toggleDiv.style.right = '30px';
    toggleDiv.style.background = 'rgba(0,0,0,0.7)';
    toggleDiv.style.color = 'white';
    toggleDiv.style.padding = '16px';
    toggleDiv.style.borderRadius = '8px';
    toggleDiv.style.zIndex = '1000';
    toggleDiv.style.fontFamily = 'Arial, sans-serif';

    toggleDiv.innerHTML = `
    <label style="font-size:18px;">
        <input type="checkbox" id="toggle-hitzones" checked>
        Show Hit Zones (Controls for both players)
    </label>
    `;


    document.body.appendChild(toggleDiv);

    document.getElementById('toggle-hitzones').addEventListener('change', (e) => {
        setHitZoneVisibility(e.target.checked);
        if (onlineMode && isHost && conn) {
            conn.send({ type: 'toggle-hitzones', show: e.target.checked });
        }
    });
}

  
function setHitZoneVisibility(show) {
    scene.traverse(obj => {
        if (obj instanceof THREE.Line) obj.visible = show;
    });
}

  
  
  function createZoneArc(startAngle, endAngle, height, color) {
    const points = [];
    const segments = 20;
    const angleStep = (endAngle - startAngle) / segments;
    
    for (let i = 0; i <= segments; i++) {
      const angle = startAngle + (angleStep * i);
      const x = Math.cos(angle) * orbitRadius;
      const z = Math.sin(angle) * orbitRadius;
      points.push(new THREE.Vector3(x, height, z));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: color, linewidth: 5 });
    const arc = new THREE.Line(geometry, material);
    scene.add(arc);
  }
  
  

function createScoreBoard() {
    scoreBoard = document.createElement('div');
    scoreBoard.style.position = 'absolute';
    scoreBoard.style.top = '10px';
    scoreBoard.style.left = '50%';
    scoreBoard.style.transform = 'translateX(-50%)';
    scoreBoard.style.padding = '10px';
    scoreBoard.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    scoreBoard.style.color = 'white';
    scoreBoard.style.fontFamily = 'Arial, sans-serif';
    scoreBoard.style.fontSize = '24px';
    scoreBoard.style.borderRadius = '5px';
    scoreBoard.style.textAlign = 'center';
    updateScoreBoard();
    document.body.appendChild(scoreBoard);
}

function createTimerDisplay() {
    timerDisplay = document.createElement('div');
    timerDisplay.style.position = 'absolute';
    timerDisplay.style.top = '70px';
    timerDisplay.style.left = '50%';
    timerDisplay.style.transform = 'translateX(-50%)';
    timerDisplay.style.padding = '5px 15px';
    timerDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    timerDisplay.style.color = 'white';
    timerDisplay.style.fontFamily = 'Arial, sans-serif';
    timerDisplay.style.fontSize = '28px';
    timerDisplay.style.fontWeight = 'bold';
    timerDisplay.style.borderRadius = '5px';
    timerDisplay.style.display = 'none';
    updateTimerDisplay();
    document.body.appendChild(timerDisplay);
}

function createCountdownDisplay() {
    countdownDisplay = document.createElement('div');
    countdownDisplay.style.position = 'absolute';
    countdownDisplay.style.top = '50%';
    countdownDisplay.style.left = '50%';
    countdownDisplay.style.transform = 'translate(-50%, -50%)';
    countdownDisplay.style.padding = '20px 40px';
    countdownDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    countdownDisplay.style.color = 'white';
    countdownDisplay.style.fontFamily = 'Arial, sans-serif';
    countdownDisplay.style.fontSize = '64px';
    countdownDisplay.style.fontWeight = 'bold';
    countdownDisplay.style.borderRadius = '10px';
    countdownDisplay.style.display = 'none';
    document.body.appendChild(countdownDisplay);
}

function updateScoreBoard() {
    // Get player names based on game mode
    const redName = onlineMode ? 
        (currentPlayerRole === 'red' ? playerName : opponentName) : 
        'Red';
    
    const blueName = onlineMode ? 
        (currentPlayerRole === 'blue' ? playerName : opponentName) : 
        'Blue';

    // Update scoreboard display
    scoreBoard.innerHTML = `
        ${redName}: ${redScore} | ${blueName}: ${blueScore}
        <br>
        <span style="font-size: 16px;">
            ${onlineMode ? `Room: ${peer.id}` : 'Press R to Reset'}
        </span>

    `;

    // Update role display
    const roleDisplay = document.getElementById('role-display');
    if (onlineMode) {
        roleDisplay.innerHTML = `Playing as: ${currentPlayerRole.toUpperCase()}<br>
                                Mode: Online (${isHost ? 'Host' : 'Guest'})`;
    } else {
        roleDisplay.innerHTML = 'Mode: Local Multiplayer';
    }
}


function updateTimerDisplay() {
    if (gameActive) {
        timerDisplay.textContent = `${gameTime}s`;
        timerDisplay.style.display = 'block';
    } else {
        timerDisplay.style.display = 'none';
    }
}

function updateCountdownDisplay() {
    if (countdownActive) {
        countdownDisplay.textContent = countdownTime > 0 ? countdownTime : 'GO!';
        countdownDisplay.style.display = 'block';
    } else {
        countdownDisplay.style.display = 'none';
    }
}

function startCountdown() {
    countdownActive = true;
    countdownTime = 3;
    updateCountdownDisplay();
    
    const countdownInterval = setInterval(() => {
        countdownTime--;
        updateCountdownDisplay();
        
        if (countdownTime < 0) {
            clearInterval(countdownInterval);
            countdownActive = false;
            
            // Hide the countdown display explicitly
            countdownDisplay.style.display = 'none';
            
            startGame();
        }
    }, 1000);
}

function startGame() {
    // Clear existing game elements
    const oldEndMessage = document.querySelector('div[style*="translate(-50%, -50%)"]');
    if (oldEndMessage && oldEndMessage.textContent.includes("WIN")) {
        document.body.removeChild(oldEndMessage);
    }
    
    // Reset countdown display
    countdownDisplay.style.display = 'none';
    
    // Initialize game state
    gameActive = true;
    gameTime = 40;
    updateTimerDisplay();
    
    // Clear any existing interval (critical fix)
    if (gameInterval) clearInterval(gameInterval); // <-- This prevents multiple timers
    
    // Start new game timer
    gameInterval = setInterval(() => { // <-- Properly scoped interval
        gameTime--;
        updateTimerDisplay();
        
        if (gameTime <= 0) {
            clearInterval(gameInterval);
            endGame();
        }
    }, 1000);
}

function endGame(customMessage) {
    gameActive = false;
    let winner;
    if (customMessage) {
        winner = customMessage;
    } else if (redScore > blueScore) {
        winner = "RED WINS!";
    } else if (blueScore > redScore) {
        winner = "BLUE WINS!";
    } else {
        winner = "IT'S A TIE!";
    }

    // Record this game's result in the session highscore list
    sessionHighscores.push({
        winner: winner,
        redScore: redScore,
        blueScore: blueScore,
        time: new Date().toLocaleTimeString()
    });

    showLeaderboard(); // Show/update the leaderboard

    const endMessage = document.createElement('div');
    endMessage.style.position = 'absolute';
    endMessage.style.top = '50%';
    endMessage.style.left = '50%';
    endMessage.style.transform = 'translate(-50%, -50%)';
    endMessage.style.padding = '20px 40px';
    endMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    endMessage.style.color = 'white';
    endMessage.style.fontFamily = 'Arial, sans-serif';
    endMessage.style.fontSize = '48px';
    endMessage.style.fontWeight = 'bold';
    endMessage.style.borderRadius = '10px';
    endMessage.style.zIndex = '100';
    endMessage.textContent = winner;
    document.body.appendChild(endMessage);

    // Remove after 3 seconds
    setTimeout(() => {
        document.body.removeChild(endMessage);
    }, 3000);
}


function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onKeyDown(e) {
    // Prevent key repeat
    if (e.repeat) return;

    // Handle local mode or online role-specific keys
    if (!onlineMode || (currentPlayerRole === 'red' && (e.key === 'a' || e.key === 'A')) || 
                      (currentPlayerRole === 'blue' && (e.key === 'l' || e.key === 'L'))) {
        // Handle red bat
        if ((e.key === 'a' || e.key === 'A') && !redBatExtended) {
            redBatExtended = true;
            updateBatPosition(redBat, true, 1);
        }
        // Handle blue bat
        if ((e.key === 'l' || e.key === 'L') && !blueBatExtended) {
            blueBatExtended = true;
            updateBatPosition(blueBat, true, -1);
        }
    }

    // Handle reset (needs confirmation in online mode)
    if (e.key === 'r' || e.key === 'R') {
        if (!onlineMode) {
            resetGame();
        } else if (conn) {
            if (!pendingRestart) {
                pendingRestart = true;
                conn.send({ type: 'reset-request' });
                showResetPrompt();
            } else {
                conn.send({ type: 'reset-confirm' });
                resetGame();
                pendingRestart = false;
            }
        }
    }
}

function onKeyUp(e) {
    // Red player release (local or online red)
    if ((e.key === 'a' || e.key === 'A') && redBatExtended) {
        redBatExtended = false;
        updateBatPosition(redBat, false, 1);
        if (gameActive) {
            processRedHit();
            swingBat('red');
            // Sync with opponent if online
            if (onlineMode && conn && currentPlayerRole === 'red') {
                conn.send({ type: 'hit', player: 'red' });
            }
        }
    }
    
    // Blue player release (local or online blue)
    if ((e.key === 'l' || e.key === 'L') && blueBatExtended) {
        blueBatExtended = false;
        updateBatPosition(blueBat, false, -1);
        if (gameActive) {
            processBlueHit();
            swingBat('blue');
            // Sync with opponent if online
            if (onlineMode && conn && currentPlayerRole === 'blue') {
                conn.send({ type: 'hit', player: 'blue' });
            }
        }
    }
}
  
    // Add these new functions
function showResetPrompt() {
    const prompt = document.createElement('div');
    prompt.id = 'reset-prompt';
    prompt.style.position = 'absolute';
    prompt.style.top = '20%';
    prompt.style.left = '50%';
    prompt.style.transform = 'translateX(-50%)';
    prompt.style.backgroundColor = 'rgba(0,0,0,0.7)';
    prompt.style.color = 'white';
    prompt.style.padding = '10px';
    prompt.style.borderRadius = '5px';
    prompt.textContent = 'Restart requested. Press R again to confirm.';
    document.body.appendChild(prompt);

    setTimeout(() => {
        if (document.getElementById('reset-prompt')) {
            document.body.removeChild(prompt);
            pendingRestart = false;
        }
    }, 3000);
}

// Simplified hit detection that works reliably and requires physical proximity
function processRedHit() {
    const batPosition = redPlayer.position.clone();
    batPosition.y = 1.0;
    const distance = redBall.position.distanceTo(batPosition);
    const proximityThreshold = orbitRadius * 0.7;
    const angle = normalizeAngle(redBallAngle);
    const currentTime = Date.now();
    
    // Only process hits when ball is close enough
    if (distance > proximityThreshold) {
      return;
    }
    
    // In processRedHit():
    let zone = null;

    // New zone detection for Red player
    const redCenterAngle = Math.PI;
    const arcLength = 0.3;

    if (angle >= redCenterAngle + arcLength && angle < redCenterAngle + arcLength*2) {
    zone = ZONE_TOO_EARLY; // Red zone (back)
    } else if (angle >= redCenterAngle && angle < redCenterAngle + arcLength) {
    zone = ZONE_HIT; // Green zone (middle)
    } else if (angle >= redCenterAngle - arcLength && angle < redCenterAngle) {
    zone = ZONE_MISS; // Yellow zone (front)
    } else {
    return; // No valid zone
    }
    
    // In processRedHit():
    if (!redBallStarted) {
        if (zone === ZONE_HIT) {
            redBallStarted = true;
            gameStarted = redBallStarted || blueBallStarted; // Game starts when either ball starts
            redBallSpeed = redBallBaseSpeed;
            redDirection = -1;
            if (!onlineMode || isHost) {
                redScore++;
                updateScoreBoard();
            }
            redLastHitTime = currentTime;
            playHitSound();
        }
        return;
    }
    
    
    // Process different outcomes based on zones
    switch (zone) {
        case ZONE_TOO_EARLY: // Red zone - too early
            // Reverse direction and reduce speed
            redDirection *= -1;
            redBallSpeed = redBallBaseSpeed * 0.5;
            redHitCount = 0;
            redLastHitTime = currentTime;
            playHitSound();
            redMissed = false;
            showZoneFeedback('red', zone);
            break;
    
        case ZONE_HIT: // Green zone - good hit
            // Speed up ball in correct direction
            redHitCount++;
            redBallSpeed = Math.min(redBallBaseSpeed + (speedIncrement * redHitCount), maxSpeed);
            redDirection = -1;
            redLastHitTime = currentTime;
            playHitSound();
    
            // Only update score if host or local mode
            if (!onlineMode || isHost) {
                redScore++;
                updateScoreBoard();
            }
    
            redMissed = false;
            showZoneFeedback('red', zone);
            break;
    
        case ZONE_MISS: // Yellow zone - miss
            // Reduce speed but maintain direction
            redBallSpeed *= missSpeedPenalty;
            if (redBallSpeed < redBallBaseSpeed * 0.3) {
                redBallSpeed = redBallBaseSpeed * 0.3;
            }
            redHitCount = 0;
            redMissed = true;
            showZoneFeedback('red', zone);
            break;
    }
    
      
  }
  
  function processBlueHit() {
    const batPosition = bluePlayer.position.clone();
    batPosition.y = 1.0;
    const distance = blueBall.position.distanceTo(batPosition);
    const proximityThreshold = orbitRadius * 0.7;
    const angle = normalizeAngle(blueBallAngle);
    const currentTime = Date.now();
    
    // Only process hits when ball is close enough
    if (distance > proximityThreshold) {
      return;
    }
    
    // In processBlueHit():
    let zone = null;
    const arcLength = 0.3;  // This is already correct

    if (angle >= arcLength*2 && angle < arcLength*3) {  // Use arcLength instead of blueArcLength
        zone = ZONE_MISS; // Yellow (front)
    } else if (angle >= arcLength && angle < arcLength*2) {
        zone = ZONE_HIT; // Green (middle)
    } else if (angle >= 0 && angle < arcLength) {
        zone = ZONE_TOO_EARLY; // Red (back)
    } else {
        return; // No valid zone - add this to match the red side logic
    }

      
    


    if (!blueBallStarted) {
        if (zone === ZONE_HIT) {
            blueBallStarted = true;
            gameStarted = redBallStarted || blueBallStarted; // Game starts when either ball starts
            blueBallSpeed = blueBallBaseSpeed;
            blueDirection = 1;
            if (!onlineMode || isHost) {
                blueScore++;
                updateScoreBoard();
            }
            blueLastHitTime = currentTime;
            playHitSound();
        }
        return;
    }
    
    
    // Process different outcomes based on zones
    switch (zone) {
        case ZONE_TOO_EARLY:
            blueDirection *= -1;
            blueBallSpeed = blueBallBaseSpeed * 0.5;
            blueHitCount = 0;
            blueLastHitTime = currentTime;
            playHitSound();
            blueMissed = false;
            showZoneFeedback('blue', zone);
            break;
    
        case ZONE_HIT:
            blueHitCount++;
            blueBallSpeed = Math.min(blueBallBaseSpeed + (speedIncrement * blueHitCount), maxSpeed);
            blueDirection = 1;
            blueLastHitTime = currentTime;
            playHitSound();
    
            // Only update score if host or local mode
            if (!onlineMode || isHost) {
                blueScore++;
                updateScoreBoard();
            }
    
            blueMissed = false;
            showZoneFeedback('blue', zone);
            break;
    
        case ZONE_MISS:
            blueBallSpeed *= missSpeedPenalty;
            if (blueBallSpeed < blueBallBaseSpeed * 0.3) {
                blueBallSpeed = blueBallBaseSpeed * 0.3;
            }
            blueHitCount = 0;
            blueMissed = true;
            showZoneFeedback('blue', zone);
            break;
    }
    
      
  }
  
 
  
  

function swingBat(player) {
    if (player === 'red') {
        redSwinging = true;
        
        // Animate the swing
        const startRotation = redBat.rotation.z;
        const targetRotation = -Math.PI / 2; // 90 degrees clockwise
        
        const startTime = Date.now();
        
        function animateRedSwing() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / swingDuration, 1);
            
            // Swing out fast, return slower (using easing)
            if (progress < 0.3) {
                // Fast swing out (first 30% of animation)
                const swingProgress = progress / 0.3;
                redBat.rotation.z = startRotation + (targetRotation - startRotation) * swingProgress;
            } else {
                // Slower return (remaining 70%)
                const returnProgress = (progress - 0.3) / 0.7;
                redBat.rotation.z = targetRotation + (startRotation - targetRotation) * returnProgress;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animateRedSwing);
            } else {
                redBat.rotation.z = startRotation;
                redSwinging = false;
            }
        }
        
        animateRedSwing();
        
    } else if (player === 'blue') {
        blueSwinging = true;
        
        // Animate the swing
        const startRotation = blueBat.rotation.z;
        const targetRotation = Math.PI / 2; // 90 degrees counterclockwise
        
        const startTime = Date.now();
        
        function animateBlueSwing() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / swingDuration, 1);
            
            // Swing out fast, return slower (using easing)
            if (progress < 0.3) {
                // Fast swing out (first 30% of animation)
                const swingProgress = progress / 0.3;
                blueBat.rotation.z = startRotation + (targetRotation - startRotation) * swingProgress;
            } else {
                // Slower return (remaining 70%)
                const returnProgress = (progress - 0.3) / 0.7;
                blueBat.rotation.z = targetRotation + (startRotation - targetRotation) * returnProgress;
            }
            
            if (progress < 1) {
                requestAnimationFrame(animateBlueSwing);
            } else {
                blueBat.rotation.z = startRotation;
                blueSwinging = false;
            }
        }
        
        animateBlueSwing();
    }
}

function updateBatPosition(bat, isExtended, direction) {
    // Don't move the bat when extended/retracted - we'll handle this in the swing animation
    // Leave the bat in neutral position
  }
  
  function swingBat(player) {
    if (player === 'red') {
      redSwinging = true;
      
      // Animate the swing with a better arc
      const startRotation = 0;
      const maxRotation = -Math.PI / 1.5; // More realistic swing angle
      
      const startTime = Date.now();
      
      function animateRedSwing() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / swingDuration, 1);
        
        if (progress < 0.3) {
          // Fast swing out (first 30% of animation)
          const swingProgress = progress / 0.3;
          redBat.rotation.z = startRotation + (maxRotation - startRotation) * swingProgress;
        } else {
          // Slower return (remaining 70%)
          const returnProgress = (progress - 0.3) / 0.7;
          redBat.rotation.z = maxRotation + (startRotation - maxRotation) * returnProgress;
        }
        
        if (progress < 1) {
          requestAnimationFrame(animateRedSwing);
        } else {
          redBat.rotation.z = startRotation;
          redSwinging = false;
        }
      }
      
      animateRedSwing();
      
    } else if (player === 'blue') {
      blueSwinging = true;
      
      // Animate the swing with a better arc
      const startRotation = 0;
      const maxRotation = Math.PI / 1.5; // More realistic swing angle
      
      const startTime = Date.now();
      
      function animateBlueSwing() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / swingDuration, 1);
        
        if (progress < 0.3) {
          // Fast swing out (first 30% of animation)
          const swingProgress = progress / 0.3;
          blueBat.rotation.z = startRotation + (maxRotation - startRotation) * swingProgress;
        } else {
          // Slower return (remaining 70%)
          const returnProgress = (progress - 0.3) / 0.7;
          blueBat.rotation.z = maxRotation + (startRotation - maxRotation) * returnProgress;
        }
        
        if (progress < 1) {
          requestAnimationFrame(animateBlueSwing);
        } else {
          blueBat.rotation.z = startRotation;
          blueSwinging = false;
        }
      }
      
      animateBlueSwing();
    }
  }
  
  

  function resetGame() {
    // Clear any existing game timer
    if (gameInterval) clearInterval(gameInterval);
    
    // Reset game state
    redScore = 0;
    blueScore = 0;
    redBallSpeed = 0;
    blueBallSpeed = 0;
    redBallAngle = Math.PI;
    blueBallAngle = 0.45;
    redDirection = -1;
    blueDirection = 1;
    redHitCount = 0;
    blueHitCount = 0;
    redMissed = false;
    blueMissed = false;
    redChargeStart = null;
    blueChargeStart = null;
    gameStarted = false;
    gameActive = false;
    redBallStarted = false;
    blueBallStarted = false;
    
    // Update displays
    updateScoreBoard();
    updateTimerDisplay();
    
    // Reset ball positions
    updateBallPosition(redBall, redBallAngle, 2.0);
    updateBallPosition(blueBall, blueBallAngle, 1.0);
    
    // Restart countdown
    startCountdown();
}



function updateBallPosition(ball, angle, height) {
    ball.position.x = Math.cos(angle) * orbitRadius;
    ball.position.z = Math.sin(angle) * orbitRadius;
    ball.position.y = height; // Set the height based on parameter
}

function animate() {
    requestAnimationFrame(animate);
    
    if (gameStarted) {
      updateBallPhysics();
      updateDebugInfo(); // Add this line
    }
    
    renderer.render(scene, camera);
  }
  

  function showHelpOverlay() {
    const helpOverlay = document.createElement('div');
    helpOverlay.style.position = 'absolute';
    helpOverlay.style.top = '50%';
    helpOverlay.style.left = '50%';
    helpOverlay.style.transform = 'translate(-50%, -50%)';
    helpOverlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    helpOverlay.style.color = 'white';
    helpOverlay.style.padding = '20px';
    helpOverlay.style.borderRadius = '10px';
    helpOverlay.style.zIndex = '1000';
    helpOverlay.style.maxWidth = '600px';
    helpOverlay.style.textAlign = 'center';
    
    helpOverlay.innerHTML = `
        <h2>Hit Zone Guide</h2>
        <div style="display:flex; justify-content:space-around; margin:10px 0;">
            <div>
            <div style="width:20px; height:20px; background-color:#FFFF00; display:inline-block;"></div>
            <span> Front (Yellow) - Miss Zone</span>
            </div>
            <div>
            <div style="width:20px; height:20px; background-color:#00FF00; display:inline-block;"></div>
            <span> Middle (Green) - Perfect Hit</span>
            </div>
            <div>
            <div style="width:20px; height:20px; background-color:#FF0000; display:inline-block;"></div>
            <span> Back (Red) - Too Early</span>
            </div>
        </div>
        <p>Wait for the ball to enter the green zone before swinging!</p>
        <button id="close-help" style="padding:5px 15px; margin-top:10px;">Got it!</button>
        `;

    
    document.body.appendChild(helpOverlay);
    
    document.getElementById('close-help').addEventListener('click', () => {
      document.body.removeChild(helpOverlay);
    });
  }
  


function showZoneFeedback(player, zone) {
    let color;
    switch (zone) {
      case ZONE_TOO_EARLY:
        color = '#FF0000'; // Red
        break;
      case ZONE_HIT:
        color = '#00FF00'; // Green
        break;
      case ZONE_MISS:
        color = '#FFFF00'; // Yellow
        break;
      default:
        return;
    }
    
    // Create a temporary feedback element
    const feedback = document.createElement('div');
    feedback.style.position = 'absolute';
    feedback.style.top = '30%';
    feedback.style.fontSize = '24px';
    feedback.style.fontWeight = 'bold';
    feedback.style.color = color;
    
    // Position based on player
    if (player === 'red') {
      feedback.style.left = '20%';
      feedback.textContent = zone === ZONE_TOO_EARLY ? 'TOO EARLY!' : 
                            zone === ZONE_HIT ? 'GREAT HIT!' : 'MISS!';
    } else {
      feedback.style.right = '20%';
      feedback.textContent = zone === ZONE_TOO_EARLY ? 'TOO EARLY!' : 
                            zone === ZONE_HIT ? 'GREAT HIT!' : 'MISS!';
    }
    
    document.body.appendChild(feedback);
    
    // Remove after showing briefly
    setTimeout(() => {
      document.body.removeChild(feedback);
    }, 800);
  }
  


  function updateBallPhysics() {
    // Only update physics on host, or in local mode
    if (!onlineMode || isHost) {
        // Ball movement physics - only calculated on host or local mode
        if (redBallStarted) {
            redBallAngle += redBallSpeed * redDirection;
            updateBallPosition(redBall, redBallAngle, 2.0);
            redBallAngle = normalizeAngle(redBallAngle);
        }
        
        if (blueBallStarted) {
            blueBallAngle += blueBallSpeed * blueDirection;
            updateBallPosition(blueBall, blueBallAngle, 1.0);
            blueBallAngle = normalizeAngle(blueBallAngle);
        }
        
        // Reset miss state if ball is moving again
        if (redBallSpeed > 0) redMissed = false;
        if (blueBallSpeed > 0) blueMissed = false;
        
        const currentTime = Date.now();
        
        // Ensure balls always maintain a minimum speed once game has started
        if (gameStarted) {
            const minimumSpeed = redBallBaseSpeed * 0.3;
            
            if (redBallSpeed < minimumSpeed) {
                redBallSpeed = minimumSpeed;
            }
            if (blueBallSpeed < minimumSpeed) {
                blueBallSpeed = minimumSpeed;
            }
            
            // Ball recovery after a long period without hits (5 seconds)
            const recoveryTime = 5000;
            if (currentTime - redLastHitTime > recoveryTime && redBallSpeed < redBallBaseSpeed) {
                redBallSpeed = Math.min(redBallSpeed * 1.01, redBallBaseSpeed);
            }
            if (currentTime - blueLastHitTime > recoveryTime && blueBallSpeed < blueBallBaseSpeed) {
                blueBallSpeed = Math.min(blueBallSpeed * 1.01, blueBallBaseSpeed);
            }
        }
        
        // Red ball speed decay
        if (redBallSpeed > redBallBaseSpeed && currentTime - redLastHitTime > speedDecayDelay) {
            // Gradually reduce speed toward base speed
            redBallSpeed *= speedDecayRate;
            
            // If close enough to base speed, just set it to base speed
            if (redBallSpeed < redBallBaseSpeed + 0.001) {
                redBallSpeed = redBallBaseSpeed;
                redHitCount = 0;
            }
        }
        
        // Blue ball speed decay
        if (blueBallSpeed > blueBallBaseSpeed && currentTime - blueLastHitTime > speedDecayDelay) {
            // Gradually reduce speed toward base speed
            blueBallSpeed *= speedDecayRate;
            
            // If close enough to base speed, just set it to base speed
            if (blueBallSpeed < blueBallBaseSpeed + 0.001) {
                blueBallSpeed = blueBallBaseSpeed;
                blueHitCount = 0;
            }
        }
    } 
    // Non-host clients only update visuals based on received state
    else if (onlineMode && !isHost) {
        // Just update ball positions based on angles received from host
        updateBallPosition(redBall, redBallAngle, 2.0);
        updateBallPosition(blueBall, blueBallAngle, 1.0);
    }

    if (gameActive && gameStarted) {
        // Just update physics, don't check for winners here
    }
}




function startLocal() {
    document.getElementById('menu').style.display = 'none';
    // Reset variables
    gameStarted = false;
    redBallStarted = false;
    blueBallStarted = false;
    gameActive = false;
    
    init();
    animate();
    onlineMode = false;
}
  
  function showOnlineMenu() {
    document.getElementById('onlineMenu').style.display = 'block';
  }
  
  async function createRoom() {
    peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });
    playerName = document.getElementById('playerName').value || "Player";
    
    peer.on('open', (id) => {
      roomCode = id;
      document.getElementById('menu').style.display = 'none';
      init();
      animate();
      onlineMode = true;
      isHost = true;
      currentPlayerRole = 'red';
      updateScoreBoard();
      document.getElementById('roomCode').value = id;
    });
  
    peer.on('connection', (connection) => {
      conn = connection;
      connection.on('open', () => {
        connection.send({ type: 'role-assign', role: 'blue' });
      });
      setupConnection();
    });
  }
  
  function joinRoom() {
    const code = document.getElementById('roomCode').value;
    playerName = document.getElementById('playerName').value || "Player";
    
    peer = new Peer({ host: '0.peerjs.com', port: 443, secure: true });
    
    peer.on('open', () => {
      conn = peer.connect(code);
      conn.on('open', () => {
        document.getElementById('menu').style.display = 'none';
        init();
        animate();
        onlineMode = true;
        currentPlayerRole = 'blue'; // Default until confirmed
      });
      setupConnection();
    });
  }
  


function setupConnection() {
    conn.on('open', () => {
        conn.send({ type: 'name', name: playerName });
        if (isHost) {
            conn.send({ type: 'role-assign', role: 'blue' });
            // Host sends initial toggle state to client
            const toggle = document.getElementById('toggle-hitzones');
            if (toggle) conn.send({ type: 'toggle-hitzones', show: toggle.checked });
            
            // Frequent state sync (10 times per second)
            syncInterval = setInterval(() => {
                if (gameStarted) syncGameState();
            }, 100);
        } else {
            // Remove the toggle UI if it exists (client should NOT have it)
            const toggleDiv = document.getElementById('hit-zone-toggle');
            if (toggleDiv) toggleDiv.parentNode.removeChild(toggleDiv);
        }
    });

    conn.on('close', () => {
        if (syncInterval) clearInterval(syncInterval);
    });

    conn.on('data', (data) => {
        if (data.type === 'name') {
            opponentName = data.name;
            updateScoreBoard();
        }
        else if (data.type === 'role-assign') {
            currentPlayerRole = data.role;
            updateScoreBoard();
        }
        else if (data.type === 'hit') {
            if (data.player === 'red') processRedHit();
            if (data.player === 'blue') processBlueHit();
        }
        else if (data.type === 'reset-request') {
            pendingRestart = true;
            showResetPrompt();
        }
        else if (data.type === 'reset-confirm') {
            resetGame();
            pendingRestart = false;
        }
        else if (data.type === 'toggle-hitzones') {
            setHitZoneVisibility(data.show);
            // Only update the checkbox if host (clients shouldn't have it)
            if (isHost) {
                const toggle = document.getElementById('toggle-hitzones');
                if (toggle) toggle.checked = data.show;
            }
        }
        else if (data.type === 'sync' && !isHost) {
            // Client receives authoritative state from host
            redScore = data.gameState.redScore;
            blueScore = data.gameState.blueScore;
            redBallAngle = data.gameState.redBallAngle;
            blueBallAngle = data.gameState.blueBallAngle;
            redBallSpeed = data.gameState.redBallSpeed; 
            blueBallSpeed = data.gameState.blueBallSpeed;
            redDirection = data.gameState.redDirection;
            blueDirection = data.gameState.blueDirection;
            redBallStarted = data.gameState.redBallStarted;
            blueBallStarted = data.gameState.blueBallStarted;
            gameTime = data.gameState.gameTime;
            
            // Update visuals
            updateBallPosition(redBall, redBallAngle, 2.0);
            updateBallPosition(blueBall, blueBallAngle, 1.0);
            updateScoreBoard();
        }
    });
}





  

function normalizeAngle(angle) {
    angle = angle % (2 * Math.PI);
    if (angle < 0) angle += 2 * Math.PI;
    return angle;
}

function addDebugInfo() {
    const debugInfo = document.createElement('div');
    debugInfo.id = 'debug-info';
    debugInfo.style.position = 'absolute';
    debugInfo.style.bottom = '10px';
    debugInfo.style.left = '10px';
    debugInfo.style.backgroundColor = 'rgba(0,0,0,0.7)';
    debugInfo.style.color = 'white';
    debugInfo.style.padding = '10px';
    debugInfo.style.fontFamily = 'monospace';
    debugInfo.style.zIndex = '100';
    document.body.appendChild(debugInfo);
  }
  
  function updateDebugInfo() {
    const debugInfo = document.getElementById('debug-info');
    if (!debugInfo) return;
    
    const redAngle = (redBallAngle * 180 / Math.PI).toFixed(0);
    const blueAngle = (blueBallAngle * 180 / Math.PI).toFixed(0);
    
    // Update zone detection logic to match new zone positions
    const redCenterAngle = Math.PI;
    const blueCenterAngle = 0;
    const arcLength = 0.3;
    
    let redZone = "UNKNOWN";
    if (redBallAngle >= redCenterAngle + arcLength && redBallAngle < redCenterAngle + arcLength*2) redZone = "TOO EARLY";
    else if (redBallAngle >= redCenterAngle && redBallAngle < redCenterAngle + arcLength) redZone = "HIT";
    else if (redBallAngle >= redCenterAngle - arcLength && redBallAngle < redCenterAngle) redZone = "MISS";
    
    // In updateDebugInfo():
    let blueZone = "UNKNOWN";
    if (blueBallAngle >= arcLength*2 && blueBallAngle < arcLength*3) blueZone = "MISS";
    else if (blueBallAngle >= arcLength && blueBallAngle < arcLength*2) blueZone = "HIT";
    else if (blueBallAngle >= 0 && blueBallAngle < arcLength) blueZone = "TOO EARLY";
    
    
    debugInfo.innerHTML = 
      `Red: ${redAngle}° (${redZone}) Speed: ${redBallSpeed.toFixed(4)}<br>
       Blue: ${blueAngle}° (${blueZone}) Speed: ${blueBallSpeed.toFixed(4)}`;
  }
  
  
