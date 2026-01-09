// Word Sluice - Children's Educational Spelling Game

// ==================== AUDIO POLYFILL (must be at top) ====================
// Polyfill for exponentialDecayTo - add to AudioParam prototype
if (typeof AudioParam !== 'undefined' && !AudioParam.prototype.exponentialDecayTo) {
    AudioParam.prototype.exponentialDecayTo = function(value, endTime) {
        this.exponentialRampToValueAtTime(Math.max(value, 0.0001), endTime);
    };
}

// ==================== WORD LIST ====================
const WORD_LIST = [
    // 3-letter words (easy start)
    { word: 'CAT', color: '#FFB74D' },
    { word: 'DOG', color: '#81C784' },
    { word: 'MOM', color: '#F48FB1' },
    { word: 'DAD', color: '#64B5F6' },
    { word: 'SUN', color: '#FFD54F' },
    { word: 'BUS', color: '#FFB74D' },
    { word: 'HAT', color: '#CE93D8' },
    { word: 'PIG', color: '#F48FB1' },
    { word: 'CUP', color: '#4FC3F7' },
    { word: 'BED', color: '#A5D6A7' },
    // 4-letter words
    { word: 'FISH', color: '#4FC3F7' },
    { word: 'BIRD', color: '#FFD54F' },
    { word: 'TREE', color: '#81C784' },
    { word: 'STAR', color: '#FFD54F' },
    { word: 'BOOK', color: '#FFCC80' },
    { word: 'FROG', color: '#A5D6A7' },
    { word: 'DUCK', color: '#FFD54F' },
    { word: 'CAKE', color: '#F48FB1' },
    { word: 'BALL', color: '#EF5350' },
    { word: 'MOON', color: '#B0BEC5' },
    // 5-letter words
    { word: 'APPLE', color: '#EF5350' },
    { word: 'HOUSE', color: '#FFCC80' },
    { word: 'WATER', color: '#4FC3F7' },
    { word: 'SMILE', color: '#FFD54F' },
    { word: 'HAPPY', color: '#FFD54F' },
    { word: 'CLOUD', color: '#90CAF9' },
    { word: 'GRASS', color: '#81C784' },
    { word: 'TRAIN', color: '#EF5350' },
    { word: 'HORSE', color: '#BCAAA4' },
    { word: 'PLANT', color: '#81C784' }
];

const DECOY_LETTERS = 'QWXZJKVYPB';

// ==================== GAME STATE ====================
let gameState = {
    difficulty: 'easy',
    currentWordIndex: 0,
    currentWord: null,
    filledSlots: [],
    nextSlotIndex: 0,
    wordsCompleted: 0,
    totalWords: 10,
    isProcessing: false
};

let bubbles = [];
let canvas, ctx;
let animationId;
let wakeLock = null;
let audioContext = null;
let isDragging = false;
let draggedBubble = null;
let dragOffset = { x: 0, y: 0 };

// ==================== SOUND EFFECTS ====================
function initAudio() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function playCorrectSound() {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.05);

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playWrongSound() {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    // Playful boing sound - descending frequency
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.15);
    oscillator.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.25);

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

function playWordCompleteSound() {
    if (!audioContext) return;

    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6 - happy ascending

    notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1);

        const startTime = audioContext.currentTime + i * 0.1;
        gainNode.gain.setValueAtTime(0.25, startTime);
        gainNode.gain.exponentialDecayTo(0.01, startTime + 0.2);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
    });
}

function playPickupSound() {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.08);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.08);
}

// ==================== BUBBLE PHYSICS ====================
class Bubble {
    constructor(letter, x, y, isCorrect = true) {
        this.letter = letter;
        this.x = x;
        this.y = y;
        this.radius = 35;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.isCorrect = isCorrect;
        this.color = isCorrect ? this.getLetterColor() : '#B0BEC5';
        this.isBeingDragged = false;
        this.isFlying = false;
        this.flyTarget = null;
        this.opacity = 1;
        this.scale = 1;
    }

    getLetterColor() {
        const colors = ['#FF8A80', '#FF80AB', '#EA80FC', '#B388FF', '#82B1FF', '#80D8FF', '#84FFFF', '#A7FFEB', '#B9F6CA', '#CCFF90', '#F4FF81', '#FFE57F', '#FFD180', '#FF9E80'];
        return colors[this.letter.charCodeAt(0) % colors.length];
    }

    update(canvasWidth, canvasHeight, allBubbles) {
        if (this.isBeingDragged) return;

        if (this.isFlying && this.flyTarget) {
            // Fly toward target slot
            const dx = this.flyTarget.x - this.x;
            const dy = this.flyTarget.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                // Arrived at target
                this.x = this.flyTarget.x;
                this.y = this.flyTarget.y;
                this.isFlying = false;
                if (this.flyTarget.callback) {
                    this.flyTarget.callback();
                }
                return;
            }

            const speed = 15;
            this.x += (dx / dist) * speed;
            this.y += (dy / dist) * speed;
            return;
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Add slight randomness for more natural movement
        this.vx += (Math.random() - 0.5) * 0.1;
        this.vy += (Math.random() - 0.5) * 0.1;

        // Limit speed
        const maxSpeed = 2;
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > maxSpeed) {
            this.vx = (this.vx / speed) * maxSpeed;
            this.vy = (this.vy / speed) * maxSpeed;
        }

        // Bounce off walls
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx = Math.abs(this.vx) * 0.8;
        }
        if (this.x + this.radius > canvasWidth) {
            this.x = canvasWidth - this.radius;
            this.vx = -Math.abs(this.vx) * 0.8;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy = Math.abs(this.vy) * 0.8;
        }
        if (this.y + this.radius > canvasHeight) {
            this.y = canvasHeight - this.radius;
            this.vy = -Math.abs(this.vy) * 0.8;
        }

        // Collision with other bubbles
        for (const other of allBubbles) {
            if (other === this || other.isFlying || other.isBeingDragged) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = this.radius + other.radius;

            if (dist < minDist && dist > 0) {
                // Push apart
                const overlap = minDist - dist;
                const pushX = (dx / dist) * overlap * 0.5;
                const pushY = (dy / dist) * overlap * 0.5;

                this.x -= pushX;
                this.y -= pushY;
                other.x += pushX;
                other.y += pushY;

                // Exchange some velocity
                const tempVx = this.vx;
                const tempVy = this.vy;
                this.vx = other.vx * 0.8;
                this.vy = other.vy * 0.8;
                other.vx = tempVx * 0.8;
                other.vy = tempVy * 0.8;
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.translate(this.x, this.y);
        ctx.scale(this.scale, this.scale);

        // Draw bubble shadow
        ctx.beginPath();
        ctx.arc(3, 3, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fill();

        // Draw bubble
        const gradient = ctx.createRadialGradient(-10, -10, 0, 0, 0, this.radius);
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.3, this.color);
        gradient.addColorStop(1, this.darkenColor(this.color, 20));

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw bubble highlight
        ctx.beginPath();
        ctx.arc(-10, -10, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.fill();

        // Draw letter
        ctx.fillStyle = '#37474F';
        ctx.font = `bold ${this.radius}px 'Comic Sans MS', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.letter, 0, 2);

        ctx.restore();
    }

    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - amount);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - amount);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - amount);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    containsPoint(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return Math.sqrt(dx * dx + dy * dy) <= this.radius;
    }

    flyTo(x, y, callback) {
        this.isFlying = true;
        this.flyTarget = { x, y, callback };
    }
}

// ==================== GAME FUNCTIONS ====================
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function setupWord() {
    const wordData = gameState.currentWord;
    const word = wordData.word;

    // Update word hint
    const wordHint = document.getElementById('word-hint');
    if (gameState.difficulty === 'hard') {
        wordHint.classList.add('hidden-hint');
    } else {
        wordHint.classList.remove('hidden-hint');
        wordHint.textContent = word;
    }

    // Update word image background color
    const wordImage = document.getElementById('word-image');
    wordImage.style.background = `linear-gradient(135deg, ${wordData.color}40 0%, ${wordData.color}80 100%)`;

    // Create letter slots
    const slotsContainer = document.getElementById('letter-slots');
    slotsContainer.innerHTML = '';
    gameState.filledSlots = [];
    gameState.nextSlotIndex = 0;

    for (let i = 0; i < word.length; i++) {
        const slot = document.createElement('div');
        slot.className = 'letter-slot';
        slot.dataset.index = i;
        slot.dataset.letter = word[i];
        if (i === 0) slot.classList.add('next');
        slotsContainer.appendChild(slot);
        gameState.filledSlots.push(null);
    }

    // Create bubbles
    createBubbles(word);

    // Update progress
    updateProgress();
}

function createBubbles(word) {
    bubbles = [];
    const letters = word.split('');

    // Add decoy letters based on difficulty
    let decoyCount = 0;
    if (gameState.difficulty === 'medium') {
        decoyCount = Math.min(3, Math.floor(word.length / 2) + 1);
    } else if (gameState.difficulty === 'hard') {
        decoyCount = Math.min(5, word.length);
    }

    // Pick random decoys not in the word
    const availableDecoys = DECOY_LETTERS.split('').filter(l => !letters.includes(l));
    const decoys = shuffleArray(availableDecoys).slice(0, decoyCount);

    // Combine and shuffle all letters
    const allLetters = [...letters.map(l => ({ letter: l, isCorrect: true })),
                        ...decoys.map(l => ({ letter: l, isCorrect: false }))];
    const shuffledLetters = shuffleArray(allLetters);

    // Position bubbles randomly in the bouncy zone
    const padding = 50;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    shuffledLetters.forEach((item, index) => {
        let x, y, overlapping;
        let attempts = 0;

        do {
            x = padding + Math.random() * (canvasWidth - padding * 2);
            y = padding + Math.random() * (canvasHeight - padding * 2);
            overlapping = bubbles.some(b => {
                const dx = b.x - x;
                const dy = b.y - y;
                return Math.sqrt(dx * dx + dy * dy) < 80;
            });
            attempts++;
        } while (overlapping && attempts < 50);

        const bubble = new Bubble(item.letter, x, y, item.isCorrect);
        bubbles.push(bubble);
    });
}

function updateProgress() {
    const progress = (gameState.wordsCompleted / gameState.totalWords) * 100;
    document.getElementById('progress-fill').style.width = `${Math.max(5, progress)}%`;
    document.getElementById('progress-text').textContent = `${gameState.wordsCompleted + 1} / ${gameState.totalWords}`;
}

function getSlotPosition(index) {
    const slots = document.querySelectorAll('.letter-slot');
    if (index >= slots.length) return null;

    const slot = slots[index];
    const rect = slot.getBoundingClientRect();
    const gameScreen = document.getElementById('game-screen');
    const gameRect = gameScreen.getBoundingClientRect();

    return {
        x: rect.left - gameRect.left + rect.width / 2,
        y: rect.top - gameRect.top + rect.height / 2
    };
}

function tryPlaceLetter(bubble) {
    if (gameState.isProcessing) return;

    const word = gameState.currentWord.word;
    const expectedLetter = word[gameState.nextSlotIndex];

    // Get slot position (relative to game screen)
    const slotPos = getSlotPosition(gameState.nextSlotIndex);
    if (!slotPos) return;

    // Convert canvas position to screen position
    const bouncyZone = document.getElementById('bouncy-zone');
    const bouncyRect = bouncyZone.getBoundingClientRect();
    const gameScreen = document.getElementById('game-screen');
    const gameRect = gameScreen.getBoundingClientRect();

    const bubbleScreenX = bouncyRect.left - gameRect.left + bubble.x;
    const bubbleScreenY = bouncyRect.top - gameRect.top + bubble.y;

    gameState.isProcessing = true;

    // Animate bubble flying to slot
    const startX = bubbleScreenX;
    const startY = bubbleScreenY;
    const targetX = slotPos.x;
    const targetY = slotPos.y;

    let progress = 0;
    const flyDuration = 200;
    const startTime = Date.now();

    // Remove bubble from physics
    const bubbleIndex = bubbles.indexOf(bubble);
    if (bubbleIndex > -1) {
        bubbles.splice(bubbleIndex, 1);
    }

    // Create flying animation outside canvas
    const flyingLetter = document.createElement('div');
    flyingLetter.style.cssText = `
        position: absolute;
        width: 70px;
        height: 70px;
        border-radius: 50%;
        background: ${bubble.color};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
        font-weight: bold;
        font-family: 'Comic Sans MS', sans-serif;
        color: #37474F;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 50;
        pointer-events: none;
        left: ${startX}px;
        top: ${startY}px;
        transform: translate(-50%, -50%);
    `;
    flyingLetter.textContent = bubble.letter;
    document.getElementById('game-screen').appendChild(flyingLetter);

    function animateFly() {
        const elapsed = Date.now() - startTime;
        progress = Math.min(1, elapsed / flyDuration);

        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);

        const currentX = startX + (targetX - startX) * eased;
        const currentY = startY + (targetY - startY) * eased;

        flyingLetter.style.left = `${currentX}px`;
        flyingLetter.style.top = `${currentY}px`;

        if (progress < 1) {
            requestAnimationFrame(animateFly);
        } else {
            // Arrived at slot - check if correct
            flyingLetter.remove();
            checkLetter(bubble.letter, expectedLetter, bubble);
        }
    }

    requestAnimationFrame(animateFly);
}

function checkLetter(letter, expectedLetter, bubble) {
    const slots = document.querySelectorAll('.letter-slot');
    const currentSlot = slots[gameState.nextSlotIndex];

    if (letter === expectedLetter) {
        // Correct! Update UI and state FIRST, then play sound
        currentSlot.textContent = letter;
        currentSlot.classList.add('filled');
        currentSlot.classList.remove('next');

        gameState.filledSlots[gameState.nextSlotIndex] = letter;
        gameState.nextSlotIndex++;

        // Mark next slot
        if (gameState.nextSlotIndex < slots.length) {
            slots[gameState.nextSlotIndex].classList.add('next');
        }

        // Play sound (wrapped in try-catch so errors don't break game)
        try { playCorrectSound(); } catch (e) { console.log('Sound error:', e); }

        // Check if word complete
        if (gameState.nextSlotIndex >= gameState.currentWord.word.length) {
            wordComplete();
        } else {
            gameState.isProcessing = false;
        }
    } else {
        // Wrong! Update UI first, then play sound
        currentSlot.textContent = letter;
        currentSlot.classList.add('wrong');

        try { playWrongSound(); } catch (e) { console.log('Sound error:', e); }

        // Wobble and return
        setTimeout(() => {
            currentSlot.textContent = '';
            currentSlot.classList.remove('wrong');

            // Return bubble to play area
            const padding = 50;
            const newX = padding + Math.random() * (canvas.width - padding * 2);
            const newY = padding + Math.random() * (canvas.height - padding * 2);

            const newBubble = new Bubble(bubble.letter, newX, newY, bubble.isCorrect);
            bubbles.push(newBubble);

            gameState.isProcessing = false;
        }, 500);
    }
}

function wordComplete() {
    try { playWordCompleteSound(); } catch (e) { /* ignore sound errors */ }

    // Show celebration
    const celebration = document.getElementById('celebration-overlay');
    celebration.classList.remove('hidden');

    setTimeout(() => {
        celebration.classList.add('hidden');

        gameState.wordsCompleted++;

        if (gameState.wordsCompleted >= gameState.totalWords) {
            // Level complete!
            showLevelComplete();
        } else {
            // Next word from our shuffled list
            gameState.currentWordIndex++;
            gameState.currentWord = gameState.wordList[gameState.currentWordIndex % gameState.wordList.length];
            gameState.isProcessing = false;
            setupWord();
        }
    }, 1500);
}

function showLevelComplete() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('level-complete-screen').classList.remove('hidden');
    cancelAnimationFrame(animationId);
    releaseWakeLock();
}

// ==================== INPUT HANDLING ====================
function handleTouchStart(e) {
    e.preventDefault();
    initAudio();

    // Reset any previous drag state to ensure clean start
    if (draggedBubble) {
        draggedBubble.isBeingDragged = false;
    }
    isDragging = false;
    draggedBubble = null;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

    // Find bubble under touch
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i];
        if (bubble.containsPoint(x, y) && !bubble.isFlying) {
            try { playPickupSound(); } catch (e) { /* ignore sound errors */ }
            isDragging = true;
            draggedBubble = bubble;
            bubble.isBeingDragged = true;
            dragOffset.x = bubble.x - x;
            dragOffset.y = bubble.y - y;

            // Move to front
            bubbles.splice(i, 1);
            bubbles.push(bubble);
            return;
        }
    }
}

function handleTouchMove(e) {
    e.preventDefault();

    if (!isDragging || !draggedBubble) return;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

    draggedBubble.x = x + dragOffset.x;
    draggedBubble.y = y + dragOffset.y;
}

function handleTouchEnd(e) {
    e.preventDefault();

    if (!isDragging || !draggedBubble) return;

    // If dragged toward bottom (toward the letter slots in drop zone), try to place letter
    // Trigger when bubble is in bottom 50% of canvas or dragged below it
    if (draggedBubble.y > canvas.height * 0.5) {
        tryPlaceLetter(draggedBubble);
    }

    if (draggedBubble) {
        draggedBubble.isBeingDragged = false;
    }
    isDragging = false;
    draggedBubble = null;
}

function handleTap(e) {
    e.preventDefault();
    initAudio();

    const touch = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
    const y = (touch.clientY - rect.top) * (canvas.height / rect.height);

    // Find bubble under tap
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const bubble = bubbles[i];
        if (bubble.containsPoint(x, y) && !bubble.isFlying) {
            tryPlaceLetter(bubble);
            return;
        }
    }
}

// Handle both tap and drag
let touchStartTime = 0;
let touchStartPos = { x: 0, y: 0 };

function handleTouchStartCombined(e) {
    touchStartTime = Date.now();
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    handleTouchStart(e);
}

function handleTouchEndCombined(e) {
    const touchDuration = Date.now() - touchStartTime;
    const touch = e.changedTouches[0];
    const moveDistance = Math.sqrt(
        Math.pow(touch.clientX - touchStartPos.x, 2) +
        Math.pow(touch.clientY - touchStartPos.y, 2)
    );

    // If short tap with minimal movement, treat as tap
    if (touchDuration < 200 && moveDistance < 20 && !gameState.isProcessing) {
        handleTap(e);
    } else {
        handleTouchEnd(e);
    }
}

// ==================== GAME LOOP ====================
function update() {
    bubbles.forEach(bubble => {
        bubble.update(canvas.width, canvas.height, bubbles);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    bubbles.forEach(bubble => {
        bubble.draw(ctx);
    });
}

function gameLoop() {
    update();
    draw();
    animationId = requestAnimationFrame(gameLoop);
}

// ==================== WAKE LOCK ====================
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.log('Wake lock failed:', err.message);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
    }
}

// ==================== GAME INITIALIZATION ====================
function startGame() {
    // Hide start screen, show game screen
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Setup canvas
    canvas = document.getElementById('bubble-canvas');
    ctx = canvas.getContext('2d');

    // Size canvas to container
    const bouncyZone = document.getElementById('bouncy-zone');
    canvas.width = bouncyZone.clientWidth;
    canvas.height = bouncyZone.clientHeight;

    // Setup touch events
    canvas.addEventListener('touchstart', handleTouchStartCombined, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEndCombined, { passive: false });

    // Mouse events for desktop testing
    canvas.addEventListener('mousedown', (e) => {
        initAudio();
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const bubble = bubbles[i];
            if (bubble.containsPoint(x, y) && !bubble.isFlying) {
                try { playPickupSound(); } catch (e) { /* ignore sound errors */ }
                tryPlaceLetter(bubble);
                return;
            }
        }
    });

    // Initialize game state
    gameState.wordsCompleted = 0;
    gameState.currentWordIndex = Math.floor(Math.random() * WORD_LIST.length);

    // Sort words by length for progression
    const sortedWords = [...WORD_LIST].sort((a, b) => a.word.length - b.word.length);

    // Pick words based on difficulty
    let wordPool;
    if (gameState.difficulty === 'easy') {
        wordPool = sortedWords.filter(w => w.word.length <= 4);
    } else if (gameState.difficulty === 'medium') {
        wordPool = sortedWords.filter(w => w.word.length <= 5);
    } else {
        wordPool = sortedWords;
    }

    // Shuffle and pick words for this session
    const shuffledPool = shuffleArray(wordPool);
    gameState.totalWords = Math.min(10, shuffledPool.length);
    gameState.currentWordIndex = 0;
    gameState.currentWord = shuffledPool[0];

    // Store shuffled words for this session
    gameState.wordList = shuffledPool;

    // Start the game
    setupWord();
    requestWakeLock();
    gameLoop();
}

function playAgain() {
    document.getElementById('level-complete-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

// ==================== EVENT LISTENERS ====================
document.addEventListener('DOMContentLoaded', () => {
    // Difficulty buttons
    const difficultyBtns = document.querySelectorAll('.difficulty-btn');
    difficultyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            difficultyBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            gameState.difficulty = btn.dataset.difficulty;
        });
    });

    // Start button
    document.getElementById('start-btn').addEventListener('click', startGame);

    // Play again button
    document.getElementById('play-again-btn').addEventListener('click', playAgain);

    // Handle resize
    window.addEventListener('resize', () => {
        if (canvas) {
            const bouncyZone = document.getElementById('bouncy-zone');
            canvas.width = bouncyZone.clientWidth;
            canvas.height = bouncyZone.clientHeight;
        }
    });

    // Handle visibility change
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden && animationId) {
            cancelAnimationFrame(animationId);
        } else if (!document.hidden && canvas && gameState.currentWord) {
            await requestWakeLock();
            gameLoop();
        }
    });
});

// Prevent scrolling on touch
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW registration failed:', err));
    });
}
