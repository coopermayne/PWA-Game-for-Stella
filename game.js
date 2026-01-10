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
    { word: 'COOPER', image: 'images/Cooper.png' },
    { word: 'THOM', image: 'images/Thom.png' },
    { word: 'HALLIE', image: 'images/Hallie.png' }
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

    // Sparkly chime sound - multiple high frequencies for magic feel
    const notes = [1200, 1500, 1800, 2200];

    notes.forEach((freq, i) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.type = 'sine';
        const startTime = audioContext.currentTime + i * 0.03;
        oscillator.frequency.setValueAtTime(freq, startTime);

        gainNode.gain.setValueAtTime(0.15, startTime);
        gainNode.gain.exponentialDecayTo(0.01, startTime + 0.2);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.2);
    });

    // Add a nice bell tone
    const bell = audioContext.createOscillator();
    const bellGain = audioContext.createGain();
    bell.connect(bellGain);
    bellGain.connect(audioContext.destination);
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(1047, audioContext.currentTime); // C6
    bellGain.gain.setValueAtTime(0.25, audioContext.currentTime);
    bellGain.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.3);
    bell.start(audioContext.currentTime);
    bell.stop(audioContext.currentTime + 0.3);
}

function playWrongSound() {
    if (!audioContext) return;

    // Dramatic buzzer/boom sound
    // Low rumble
    const rumble = audioContext.createOscillator();
    const rumbleGain = audioContext.createGain();
    rumble.connect(rumbleGain);
    rumbleGain.connect(audioContext.destination);
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(80, audioContext.currentTime);
    rumble.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.4);
    rumbleGain.gain.setValueAtTime(0.3, audioContext.currentTime);
    rumbleGain.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.5);
    rumble.start(audioContext.currentTime);
    rumble.stop(audioContext.currentTime + 0.5);

    // Buzzer tone
    const buzzer = audioContext.createOscillator();
    const buzzerGain = audioContext.createGain();
    buzzer.connect(buzzerGain);
    buzzerGain.connect(audioContext.destination);
    buzzer.type = 'square';
    buzzer.frequency.setValueAtTime(150, audioContext.currentTime);
    buzzer.frequency.setValueAtTime(120, audioContext.currentTime + 0.1);
    buzzerGain.gain.setValueAtTime(0.15, audioContext.currentTime);
    buzzerGain.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.3);
    buzzer.start(audioContext.currentTime);
    buzzer.stop(audioContext.currentTime + 0.3);

    // Impact thud
    const thud = audioContext.createOscillator();
    const thudGain = audioContext.createGain();
    thud.connect(thudGain);
    thudGain.connect(audioContext.destination);
    thud.type = 'sine';
    thud.frequency.setValueAtTime(60, audioContext.currentTime);
    thud.frequency.exponentialRampToValueAtTime(30, audioContext.currentTime + 0.15);
    thudGain.gain.setValueAtTime(0.4, audioContext.currentTime);
    thudGain.gain.exponentialDecayTo(0.01, audioContext.currentTime + 0.2);
    thud.start(audioContext.currentTime);
    thud.stop(audioContext.currentTime + 0.2);
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

// ==================== VISUAL EFFECTS ====================
function createConfettiBurst(element) {
    if (typeof confetti === 'undefined') return;

    const rect = element.getBoundingClientRect();
    const centerX = (rect.left + rect.width / 2) / window.innerWidth;
    const centerY = (rect.top + rect.height / 2) / window.innerHeight;

    // Burst of gold coins/confetti from the letter slot!
    confetti({
        particleCount: 50,
        spread: 80,
        origin: { x: centerX, y: centerY },
        colors: ['#d4af37', '#f4d03f', '#c9a227', '#8b5a2b', '#722f37', '#f5f0e1'],
        startVelocity: 30,
        gravity: 0.8,
        scalar: 1.2,
        ticks: 100
    });

    // Extra gold sparkle burst
    confetti({
        particleCount: 20,
        spread: 360,
        origin: { x: centerX, y: centerY },
        colors: ['#d4af37', '#f4d03f', '#ffd700'],
        startVelocity: 20,
        gravity: 0.5,
        scalar: 0.8,
        shapes: ['circle'],
        ticks: 80
    });
}

function triggerScreenShake() {
    const gameScreen = document.getElementById('game-screen');
    gameScreen.classList.add('screen-shake');

    // Vibrate if supported
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 150]);
    }

    setTimeout(() => {
        gameScreen.classList.remove('screen-shake');
    }, 500);
}

function triggerScreenDarken() {
    let overlay = document.getElementById('wrong-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'wrong-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(circle, transparent 0%, rgba(139, 0, 0, 0.6) 100%);
            pointer-events: none;
            z-index: 999;
            opacity: 0;
            transition: opacity 0.1s ease;
        `;
        document.body.appendChild(overlay);
    }

    // Flash the overlay
    overlay.style.opacity = '1';
    setTimeout(() => {
        overlay.style.opacity = '0';
    }, 300);
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
        // Vintage poker chip colors
        const colors = ['#722f37', '#1a5c38', '#1a3a5c', '#5c1a3a', '#3a5c1a', '#5c3a1a', '#2c1a5c', '#5c1a1a'];
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

        // Draw chip shadow
        ctx.beginPath();
        ctx.arc(3, 4, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fill();

        // Draw outer ring (gold edge)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#d4af37';
        ctx.fill();

        // Draw chip edge notches
        const notchCount = 12;
        for (let i = 0; i < notchCount; i++) {
            const angle = (i / notchCount) * Math.PI * 2;
            const notchX = Math.cos(angle) * (this.radius - 3);
            const notchY = Math.sin(angle) * (this.radius - 3);
            ctx.beginPath();
            ctx.arc(notchX, notchY, 4, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        // Draw main chip face
        const gradient = ctx.createRadialGradient(0, -5, 0, 0, 0, this.radius * 0.85);
        gradient.addColorStop(0, this.lightenColor(this.color, 30));
        gradient.addColorStop(0.7, this.color);
        gradient.addColorStop(1, this.darkenColor(this.color, 30));

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.82, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw inner gold ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw cream center
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#f5f0e1';
        ctx.fill();

        // Draw letter
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.radius * 0.9}px 'Georgia', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.letter, 0, 2);

        ctx.restore();
    }

    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + amount);
        const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + amount);
        const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + amount);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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

    // Update word image with animation
    const wordImage = document.getElementById('word-image');
    const isFirstWord = gameState.wordsCompleted === 0 && wordImage.innerHTML.trim() === '';

    function updateCardContent() {
        if (wordData.image) {
            wordImage.innerHTML = `<img src="${wordData.image}" alt="${word}" class="card-image">`;
            wordImage.style.background = 'transparent';
        } else {
            wordImage.innerHTML = `<span id="word-hint">${word}</span>`;
            wordImage.style.background = `linear-gradient(135deg, #FFE0B2 0%, #FFCC80 100%)`;
        }

        // Animate in new card
        wordImage.classList.remove('card-exit');
        wordImage.classList.add('card-enter');

        setTimeout(() => {
            wordImage.classList.remove('card-enter');
        }, 400);
    }

    if (isFirstWord) {
        // No exit animation for first card
        updateCardContent();
    } else {
        // Animate out old card, then update
        wordImage.classList.add('card-exit');
        setTimeout(updateCardContent, 300);
    }

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

        // Play sound and trigger confetti burst!
        try { playCorrectSound(); } catch (e) { console.log('Sound error:', e); }
        try { createConfettiBurst(currentSlot); } catch (e) { console.log('Confetti error:', e); }

        // Check if word complete
        if (gameState.nextSlotIndex >= gameState.currentWord.word.length) {
            wordComplete();
        } else {
            gameState.isProcessing = false;
        }
    } else {
        // Wrong! Trigger dramatic effects!
        currentSlot.textContent = letter;
        currentSlot.classList.add('wrong');

        // Play dramatic wrong sound and visual effects
        try { playWrongSound(); } catch (e) { console.log('Sound error:', e); }
        try { triggerScreenShake(); } catch (e) { console.log('Shake error:', e); }
        try { triggerScreenDarken(); } catch (e) { console.log('Darken error:', e); }

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
let canvasInitialized = false;

function startGame() {
    // Hide start screen, show game screen
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Setup canvas (only once)
    canvas = document.getElementById('bubble-canvas');
    ctx = canvas.getContext('2d');

    // Size canvas to container
    const bouncyZone = document.getElementById('bouncy-zone');
    canvas.width = bouncyZone.clientWidth;
    canvas.height = bouncyZone.clientHeight;

    // Setup event listeners only once
    if (!canvasInitialized) {
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

        canvasInitialized = true;
    }

    // Reset game state
    gameState.wordsCompleted = 0;
    gameState.currentWordIndex = 0;
    gameState.isProcessing = false;
    gameState.nextSlotIndex = 0;
    gameState.filledSlots = [];

    // Clear previous word image
    document.getElementById('word-image').innerHTML = '';

    // Shuffle all words for this session
    const shuffledPool = shuffleArray([...WORD_LIST]);
    gameState.totalWords = shuffledPool.length;
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

// Register service worker (disabled during development)
// if ('serviceWorker' in navigator) {
//     window.addEventListener('load', () => {
//         navigator.serviceWorker.register('sw.js')
//             .then(reg => console.log('SW registered'))
//             .catch(err => console.log('SW registration failed:', err));
//     });
// }
