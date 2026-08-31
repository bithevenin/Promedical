/**
 * Generates build/icon.ico from src/assets/icon/favicon.png
 * Modern ICO format (Vista+) supports embedding PNG data directly.
 * No external packages needed.
 */
const path = require('path');
const fs   = require('fs');

const pngPath = path.resolve(__dirname, '../src/assets/icon/favicon.png');
const outDir  = path.resolve(__dirname, '../build');
const outPath = path.join(outDir, 'icon.ico');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const pngData = fs.readFileSync(pngPath);

// Read PNG dimensions from IHDR chunk (bytes 16-23)
const width  = pngData.readUInt32BE(16);
const height = pngData.readUInt32BE(20);
const w = width  >= 256 ? 0 : width;   // 0 means 256 in ICO spec
const h = height >= 256 ? 0 : height;

// ICO Header (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // Reserved
header.writeUInt16LE(1, 2);   // Type: 1 = ICO
header.writeUInt16LE(1, 4);   // Image count: 1

// Directory entry (16 bytes)
const dirEntry = Buffer.alloc(16);
dirEntry.writeUInt8(w, 0);                    // Width
dirEntry.writeUInt8(h, 1);                    // Height
dirEntry.writeUInt8(0, 2);                    // Color count (0 = no palette)
dirEntry.writeUInt8(0, 3);                    // Reserved
dirEntry.writeUInt16LE(1,  4);               // Planes
dirEntry.writeUInt16LE(32, 6);               // Bit count
dirEntry.writeUInt32LE(pngData.length, 8);   // Size of image data
dirEntry.writeUInt32LE(6 + 16, 12);          // Offset to image data

const ico = Buffer.concat([header, dirEntry, pngData]);
fs.writeFileSync(outPath, ico);
console.log(`icon.ico created (${ico.length} bytes) at: ${outPath}`);
console.log(`Image size: ${width}x${height} px`);
