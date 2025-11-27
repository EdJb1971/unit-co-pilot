const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

async function generate() {
  const iconsDir = path.join(__dirname, '..', 'icons');
  const svg512 = path.join(iconsDir, 'icon-512.svg');
  const svg192 = path.join(iconsDir, 'icon-192.svg');
  const outIco = path.join(iconsDir, 'icon.ico');

  const src = fs.existsSync(svg512) ? svg512 : (fs.existsSync(svg192) ? svg192 : null);
  if (!src) {
    console.error('No source SVG found at icons/icon-512.svg or icons/icon-192.svg');
    process.exit(2);
  }

  // ICO format supports up to 256x256 in the directory header; avoid 512 which causes out-of-range errors
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tempPngs = [];

  try {
    for (const size of sizes) {
      const outPng = path.join(iconsDir, `icon-${size}.png`);
      tempPngs.push(outPng);
      await sharp(src)
        .resize(size, size, { fit: 'contain' })
        .png()
        .toFile(outPng);
      console.log(`wrote ${outPng}`);
    }

    // png-to-ico expects Buffers (or paths). Read PNGs into Buffers and prefer larger sizes first
    const pngsForIco = tempPngs.filter(p => fs.existsSync(p)).reverse();
    console.log('pngs included for ico:', pngsForIco);

    const pngBuffers = pngsForIco.map(p => {
      const b = fs.readFileSync(p);
      console.log(`- ${p}: ${b.length} bytes`);
      return b;
    });

    const buf = await toIco(pngBuffers);
    fs.writeFileSync(outIco, buf);
    console.log(`Wrote ${outIco}`);
  } catch (err) {
    console.error('Failed to generate icon.ico:', err);
    process.exit(1);
  } finally {
    // cleanup temporary PNGs
    for (const p of tempPngs) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch (e) {
        // ignore
      }
    }
  }
}

generate();
