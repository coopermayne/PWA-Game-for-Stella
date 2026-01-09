# Word Sluice

A children's educational spelling game as a Progressive Web App (PWA).

## Game Overview

Word Sluice is a fun spelling game where:
- An image/word appears at the top
- Letter bubbles bounce around in the middle zone
- Children tap or drag letters to spell the word in order

## Features

- **Three Difficulty Modes:**
  - **Easy**: Only correct letters, word shown
  - **Medium**: Some decoy letters mixed in
  - **Hard**: More decoys, word hidden (image only)

- **Child-Friendly Design:**
  - Soft, pastel colors
  - Bouncy letter bubbles with physics
  - Gentle animations
  - Large touch targets

- **Sound Effects:**
  - Cheerful "pop" for correct letters
  - Playful "boing" for wrong guesses (not punishing!)
  - Celebratory chime for completing words

- **PWA Features:**
  - Install on home screen
  - Works offline
  - Full-screen mode
  - Screen wake lock

## Word List

30 words progressing from simple to complex:
- 3-letter: CAT, DOG, MOM, DAD, SUN, BUS, HAT, PIG, CUP, BED
- 4-letter: FISH, BIRD, TREE, STAR, BOOK, FROG, DUCK, CAKE, BALL, MOON
- 5-letter: APPLE, HOUSE, WATER, SMILE, HAPPY, CLOUD, GRASS, TRAIN, HORSE, PLANT

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Generate icons
node scripts/generate-icons.js
```

## Tech Stack

- Vanilla JavaScript (no frameworks)
- HTML5 Canvas for bubble physics
- Web Audio API for synthesized sounds
- Service Worker for offline support
- CSS animations

## Credits

Made with love for Stella.
