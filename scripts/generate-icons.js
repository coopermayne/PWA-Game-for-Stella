const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Pure JavaScript PNG generation for Word Sluice icons
function createPNG(size) {
    const width = size;
    const height = size;

    // Create raw pixel data (RGBA)
    const pixels = Buffer.alloc(width * height * 4);

    // Colors
    const bgGreen1 = [129, 199, 132, 255];    // #81C784
    const bgGreen2 = [76, 175, 80, 255];      // #4CAF50
    const white = [255, 255, 255, 255];
    const textColor = [55, 71, 79, 255];      // #37474F
    const bubbleColors = [
        [255, 138, 128, 255],  // #FF8A80 (red)
        [130, 177, 255, 255],  // #82B1FF (blue)
        [255, 209, 128, 255]   // #FFD180 (orange)
    ];

    function setPixel(x, y, color) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
            pixels[idx] = color[0];
            pixels[idx + 1] = color[1];
            pixels[idx + 2] = color[2];
            pixels[idx + 3] = color[3];
        }
    }

    function blendColors(c1, c2, t) {
        return [
            Math.round(c1[0] + (c2[0] - c1[0]) * t),
            Math.round(c1[1] + (c2[1] - c1[1]) * t),
            Math.round(c1[2] + (c2[2] - c1[2]) * t),
            255
        ];
    }

    function fillCircle(cx, cy, r, color) {
        for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= r * r) {
                    setPixel(x, y, color);
                }
            }
        }
    }

    function drawBubble(cx, cy, r, baseColor) {
        // Shadow
        fillCircle(cx + 2, cy + 2, r, [0, 0, 0, 40]);

        // Main bubble with gradient-like effect
        for (let y = cy - r; y <= cy + r; y++) {
            for (let x = cx - r; x <= cx + r; x++) {
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= r) {
                    // Simple radial gradient from white center to color
                    const t = Math.min(1, dist / r * 1.5);
                    const color = blendColors(white, baseColor, t);
                    setPixel(x, y, color);
                }
            }
        }

        // Highlight
        const hlX = cx - r * 0.35;
        const hlY = cy - r * 0.35;
        const hlR = r * 0.25;
        fillCircle(hlX, hlY, hlR, [255, 255, 255, 180]);
    }

    // Fill background with gradient
    for (let y = 0; y < height; y++) {
        const t = y / height;
        const color = blendColors(bgGreen1, bgGreen2, t);
        for (let x = 0; x < width; x++) {
            setPixel(x, y, color);
        }
    }

    // Draw letter bubbles
    const bubbleRadius = Math.floor(size * 0.18);
    const positions = [
        { x: size * 0.5, y: size * 0.28 },   // Top center
        { x: size * 0.3, y: size * 0.58 },   // Bottom left
        { x: size * 0.7, y: size * 0.58 }    // Bottom right
    ];

    positions.forEach((pos, i) => {
        drawBubble(Math.floor(pos.x), Math.floor(pos.y), bubbleRadius, bubbleColors[i]);
    });

    // Draw simple letters in center of bubbles (basic pixel font for small sizes)
    const letters = ['A', 'B', 'C'];
    const letterPatterns = {
        'A': [
            [0,1,1,0],
            [1,0,0,1],
            [1,1,1,1],
            [1,0,0,1],
            [1,0,0,1]
        ],
        'B': [
            [1,1,1,0],
            [1,0,0,1],
            [1,1,1,0],
            [1,0,0,1],
            [1,1,1,0]
        ],
        'C': [
            [0,1,1,1],
            [1,0,0,0],
            [1,0,0,0],
            [1,0,0,0],
            [0,1,1,1]
        ]
    };

    positions.forEach((pos, i) => {
        const pattern = letterPatterns[letters[i]];
        const pixelSize = Math.max(1, Math.floor(bubbleRadius / 4));
        const letterWidth = 4 * pixelSize;
        const letterHeight = 5 * pixelSize;
        const startX = Math.floor(pos.x - letterWidth / 2);
        const startY = Math.floor(pos.y - letterHeight / 2);

        for (let py = 0; py < 5; py++) {
            for (let px = 0; px < 4; px++) {
                if (pattern[py][px]) {
                    for (let dy = 0; dy < pixelSize; dy++) {
                        for (let dx = 0; dx < pixelSize; dx++) {
                            setPixel(startX + px * pixelSize + dx, startY + py * pixelSize + dy, textColor);
                        }
                    }
                }
            }
        }
    });

    // Now encode as PNG
    return encodePNG(pixels, width, height);
}

function encodePNG(pixels, width, height) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    const ihdrChunk = createChunk('IHDR', ihdr);

    // IDAT chunk - raw image data with filter bytes
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0; // filter type: None
        for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const dstIdx = y * (1 + width * 4) + 1 + x * 4;
            rawData[dstIdx] = pixels[srcIdx];
            rawData[dstIdx + 1] = pixels[srcIdx + 1];
            rawData[dstIdx + 2] = pixels[srcIdx + 2];
            rawData[dstIdx + 3] = pixels[srcIdx + 3];
        }
    }

    const compressed = zlib.deflateSync(rawData, { level: 9 });
    const idatChunk = createChunk('IDAT', compressed);

    // IEND chunk
    const iendChunk = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type);
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);

    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation for PNG
function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = getCRC32Table();

    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let crcTable = null;
function getCRC32Table() {
    if (crcTable) return crcTable;

    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            if (c & 1) {
                c = 0xEDB88320 ^ (c >>> 1);
            } else {
                c = c >>> 1;
            }
        }
        crcTable[n] = c;
    }
    return crcTable;
}

// Generate icons
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '..', 'icons');

if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

console.log('Generating Word Sluice PWA icons...');

sizes.forEach(size => {
    const pngData = createPNG(size);
    const filename = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(filename, pngData);
    console.log(`Created icon-${size}.png`);
});

console.log('Done! Icons saved to /icons folder.');
