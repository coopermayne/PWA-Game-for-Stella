// Game constants
const DOS_GREEN = '#33ff33';
const DOS_BLACK = '#000000';

// Game state
let canvas, ctx;
let gameRunning = false;
let animationId;
let wakeLock = null;

// Game objects
let player, opponent, ball;

// Score and difficulty
let playerScore = 0;
let opponentScore = 0;
let level = 1;
let rallies = 0;

// Tilt control
let tiltX = 0;
const TILT_SENSITIVITY = 3;

// Difficulty settings per level
function getDifficultySettings(level) {
    return {
        ballSpeed: 3 + (level * 0.5),
        opponentSpeed: 2 + (level * 0.3),
        opponentReactionDelay: Math.max(0.3, 1 - (level * 0.1)),
        opponentAccuracy: Math.min(0.95, 0.6 + (level * 0.05))
    };
}

// Initialize game objects
function initGameObjects() {
    const settings = getDifficultySettings(level);

    player = {
        width: canvas.width * 0.25,
        height: 10,
        x: canvas.width / 2 - (canvas.width * 0.25) / 2,
        y: canvas.height - 30,
        speed: 8
    };

    opponent = {
        width: canvas.width * 0.25,
        height: 10,
        x: canvas.width / 2 - (canvas.width * 0.25) / 2,
        y: 20,
        speed: settings.opponentSpeed,
        targetX: canvas.width / 2,
        reactionTimer: 0,
        reactionDelay: settings.opponentReactionDelay
    };

    resetBall();
}

function resetBall() {
    const settings = getDifficultySettings(level);

    ball = {
        size: 8,
        x: canvas.width / 2,
        y: canvas.height / 2,
        speedX: (Math.random() > 0.5 ? 1 : -1) * settings.ballSpeed * 0.5,
        speedY: settings.ballSpeed * (Math.random() > 0.5 ? 1 : -1),
        baseSpeed: settings.ballSpeed
    };
}

// Device orientation handling
function handleOrientation(event) {
    // gamma is left-right tilt in degrees (-90 to 90)
    if (event.gamma !== null) {
        tiltX = event.gamma;
    }
}

async function requestOrientationPermission() {
    const permissionNote = document.getElementById('permission-note');

    // Check if DeviceOrientationEvent exists and requires permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
                return true;
            } else {
                permissionNote.textContent = 'TILT PERMISSION DENIED - USING TOUCH';
                setupTouchFallback();
                return false;
            }
        } catch (error) {
            permissionNote.textContent = 'ERROR: ' + error.message;
            setupTouchFallback();
            return false;
        }
    } else if ('DeviceOrientationEvent' in window) {
        // Non-iOS devices don't need permission
        window.addEventListener('deviceorientation', handleOrientation);
        return true;
    } else {
        permissionNote.textContent = 'NO TILT SENSOR - USING TOUCH';
        setupTouchFallback();
        return false;
    }
}

// Touch fallback for devices without tilt
function setupTouchFallback() {
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        // Convert touch position to tilt-like value
        tiltX = ((touchX / canvas.width) - 0.5) * 60;
    });
}

// Screen Wake Lock to prevent screen from sleeping
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake lock acquired');
        } catch (err) {
            console.log('Wake lock failed:', err.message);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
        console.log('Wake lock released');
    }
}

// Update game state
function update() {
    const settings = getDifficultySettings(level);

    // Update player position based on tilt
    const targetX = player.x + (tiltX * TILT_SENSITIVITY);
    player.x += (targetX - player.x) * 0.3;

    // Keep player in bounds
    player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

    // Update opponent AI
    opponent.reactionTimer += 1/60;
    if (opponent.reactionTimer >= opponent.reactionDelay) {
        // Predict where ball will be
        if (ball.speedY < 0) {
            // Ball coming toward opponent
            let predictedX = ball.x;
            if (Math.random() < settings.opponentAccuracy) {
                // Accurate prediction
                const timeToReach = (opponent.y + opponent.height - ball.y) / Math.abs(ball.speedY);
                predictedX = ball.x + ball.speedX * timeToReach;
                // Account for bounces off walls
                while (predictedX < 0 || predictedX > canvas.width) {
                    if (predictedX < 0) predictedX = -predictedX;
                    if (predictedX > canvas.width) predictedX = 2 * canvas.width - predictedX;
                }
            } else {
                // Inaccurate - add randomness
                predictedX = ball.x + (Math.random() - 0.5) * canvas.width * 0.5;
            }
            opponent.targetX = predictedX - opponent.width / 2;
        }
        opponent.reactionTimer = 0;
    }

    // Move opponent toward target
    const diff = opponent.targetX - opponent.x;
    if (Math.abs(diff) > opponent.speed) {
        opponent.x += Math.sign(diff) * opponent.speed;
    } else {
        opponent.x = opponent.targetX;
    }

    // Keep opponent in bounds
    opponent.x = Math.max(0, Math.min(canvas.width - opponent.width, opponent.x));

    // Update ball position
    ball.x += ball.speedX;
    ball.y += ball.speedY;

    // Ball collision with walls
    if (ball.x - ball.size/2 <= 0 || ball.x + ball.size/2 >= canvas.width) {
        ball.speedX = -ball.speedX;
        ball.x = ball.x - ball.size/2 <= 0 ? ball.size/2 : canvas.width - ball.size/2;
    }

    // Ball collision with player paddle
    if (ball.y + ball.size/2 >= player.y &&
        ball.y - ball.size/2 <= player.y + player.height &&
        ball.x >= player.x &&
        ball.x <= player.x + player.width &&
        ball.speedY > 0) {

        ball.speedY = -Math.abs(ball.speedY);

        // Add angle based on where ball hits paddle
        const hitPos = (ball.x - player.x) / player.width;
        ball.speedX = (hitPos - 0.5) * ball.baseSpeed * 2;

        rallies++;
        checkLevelUp();
    }

    // Ball collision with opponent paddle
    if (ball.y - ball.size/2 <= opponent.y + opponent.height &&
        ball.y + ball.size/2 >= opponent.y &&
        ball.x >= opponent.x &&
        ball.x <= opponent.x + opponent.width &&
        ball.speedY < 0) {

        ball.speedY = Math.abs(ball.speedY);

        // Add angle based on where ball hits paddle
        const hitPos = (ball.x - opponent.x) / opponent.width;
        ball.speedX = (hitPos - 0.5) * ball.baseSpeed * 2;
    }

    // Scoring
    if (ball.y < 0) {
        // Player scores
        playerScore++;
        updateScoreDisplay();
        resetBall();
        ball.speedY = Math.abs(ball.speedY);
    }

    if (ball.y > canvas.height) {
        // Opponent scores
        opponentScore++;
        updateScoreDisplay();

        if (opponentScore >= 5) {
            gameOver();
            return;
        }

        resetBall();
        ball.speedY = -Math.abs(ball.speedY);
    }
}

function checkLevelUp() {
    // Level up every 5 rallies
    if (rallies > 0 && rallies % 5 === 0) {
        level++;
        document.getElementById('level').textContent = level;

        // Update opponent settings for new level
        const settings = getDifficultySettings(level);
        opponent.speed = settings.opponentSpeed;
        opponent.reactionDelay = settings.opponentReactionDelay;

        // Speed up ball slightly
        const speedMult = 1.1;
        ball.speedX *= speedMult;
        ball.speedY *= speedMult;
        ball.baseSpeed = settings.ballSpeed;
    }
}

// Render game
function draw() {
    // Clear canvas
    ctx.fillStyle = DOS_BLACK;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = DOS_GREEN;

    // Draw center line (dashed)
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = DOS_GREEN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw player paddle
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Draw opponent paddle
    ctx.fillRect(opponent.x, opponent.y, opponent.width, opponent.height);

    // Draw ball (square for DOS look)
    ctx.fillRect(ball.x - ball.size/2, ball.y - ball.size/2, ball.size, ball.size);
}

// Game loop
function gameLoop() {
    if (!gameRunning) return;

    update();
    draw();

    animationId = requestAnimationFrame(gameLoop);
}

// Update score display
function updateScoreDisplay() {
    document.getElementById('player-score').textContent = playerScore;
    document.getElementById('opponent-score').textContent = opponentScore;
}

// Game over
function gameOver() {
    gameRunning = false;
    cancelAnimationFrame(animationId);
    releaseWakeLock();

    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-score').textContent =
        `FINAL SCORE: ${playerScore} - ${opponentScore} | LEVEL: ${level}`;
}

// Start game
async function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Setup canvas
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // Set canvas size for portrait mode
    const maxWidth = window.innerWidth - 20;
    const maxHeight = window.innerHeight - 150;

    canvas.width = Math.min(maxWidth, 350);
    canvas.height = Math.min(maxHeight, 500);

    // Request orientation permission and wake lock
    await requestOrientationPermission();
    await requestWakeLock();

    // Initialize game
    playerScore = 0;
    opponentScore = 0;
    level = 1;
    rallies = 0;

    updateScoreDisplay();
    document.getElementById('level').textContent = level;

    initGameObjects();

    gameRunning = true;
    gameLoop();
}

// Restart game
async function restartGame() {
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Re-acquire wake lock
    await requestWakeLock();

    playerScore = 0;
    opponentScore = 0;
    level = 1;
    rallies = 0;

    updateScoreDisplay();
    document.getElementById('level').textContent = level;

    initGameObjects();

    gameRunning = true;
    gameLoop();
}

// Event listeners
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', restartGame);

// Prevent scrolling/zooming
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Handle visibility change (pause when tab hidden)
document.addEventListener('visibilitychange', async () => {
    if (document.hidden && gameRunning) {
        cancelAnimationFrame(animationId);
    } else if (!document.hidden && gameRunning) {
        // Re-acquire wake lock when returning to game
        await requestWakeLock();
        gameLoop();
    }
});

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    });
}
