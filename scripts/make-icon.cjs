/**
 * Generates build/icon.ico from src/favicon.png using standard Windows sizes
 */
const path = require('path');
const fs = require('fs');
const pngToIcoImport = require('png-to-ico');
const pngToIco = pngToIcoImport.default || pngToIcoImport;

const primaryPng = path.resolve(__dirname, '../src/favicon.png');
const fallbackPng = path.resolve(__dirname, '../src/assets/icon/favicon.png');
const pngPath = fs.existsSync(primaryPng) ? primaryPng : fallbackPng;

const outDir = path.resolve(__dirname, '../build');
const outPath = path.join(outDir, 'icon.ico');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function buildIcon() {
  try {
    const buf = await pngToIco(pngPath);
    fs.writeFileSync(outPath, buf);
    console.log(`[Icon] Successfully generated Windows icon.ico (${buf.length} bytes) at: ${outPath}`);

    // Also sync to build/icon.png and assets
    const pngData = fs.readFileSync(pngPath);
    fs.writeFileSync(path.join(outDir, 'icon.png'), pngData);
    const assetsDir = path.resolve(__dirname, '../src/assets/icon');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'favicon.png'), pngData);
  } catch (err) {
    console.error('[Icon] Error generating icon.ico:', err);
    process.exit(1);
  }
}

buildIcon();
