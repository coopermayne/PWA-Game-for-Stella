const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Pure JavaScript PNG generation for Pong icons
function createPNG(size) {
    const width = size;
    const height = size;

    // Create raw pixel data (RGBA)
    const pixels = Buffer.alloc(width * height * 4);

    const bgColor = [0, 0, 0, 255];       // Black
    const fgColor = [51, 255, 51, 255];   // DOS Green #33ff33

    // Fill background
    for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = bgColor[0];
        pixels[i * 4 + 1] = bgColor[1];
        pixels[i * 4 + 2] = bgColor[2];
        pixels[i * 4 + 3] = bgColor[3];
    }

    function setPixel(x, y, color) {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            const idx = (y * width + x) * 4;
            pixels[idx] = color[0];
            pixels[idx + 1] = color[1];
            pixels[idx + 2] = color[2];
            pixels[idx + 3] = color[3];
        }
    }

    function fillRect(x, y, w, h, color) {
        for (let py = y; py < y + h; py++) {
            for (let px = x; px < x + w; px++) {
                setPixel(Math.floor(px), Math.floor(py), color);
            }
        }
    }

    const unit = size / 16;
    const borderWidth = Math.max(2, Math.floor(size / 32));

    // Draw border
    fillRect(0, 0, width, borderWidth, fgColor);  // Top
    fillRect(0, height - borderWidth, width, borderWidth, fgColor);  // Bottom
    fillRect(0, 0, borderWidth, height, fgColor);  // Left
    fillRect(width - borderWidth, 0, borderWidth, height, fgColor);  // Right

    // Top paddle
    const paddleWidth = size * 0.4;
    const paddleHeight = unit;
    const paddleX = size * 0.3;
    fillRect(paddleX, unit * 2, paddleWidth, paddleHeight, fgColor);

    // Bottom paddle
    fillRect(paddleX, size - unit * 3, paddleWidth, paddleHeight, fgColor);

    // Ball (center)
    const ballSize = unit * 1.5;
    fillRect(size / 2 - ballSize / 2, size / 2 - ballSize / 2, ballSize, ballSize, fgColor);

    // Center dashed line
    const dashLen = Math.max(2, Math.floor(unit / 2));
    for (let x = unit * 2; x < size - unit * 2; x += dashLen * 2) {
        fillRect(x, size / 2 - 1, dashLen, 2, fgColor);
    }

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

console.log('Generating Pong PWA icons...');

sizes.forEach(size => {
    const pngData = createPNG(size);
    const filename = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(filename, pngData);
    console.log(`Created icon-${size}.png`);
});

console.log('Done! Icons saved to /icons folder.');
