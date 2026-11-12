// Generates Dumbo's app/tray icons from the real art (dark theme), with a transparent background.
// Run: npx electron scripts/make-icons.cjs
// Writes assets/icon.png (256), assets/icon.ico (16–256, PNG-compressed entries), assets/tray.png (32; also the macOS menu-bar icon at 2x), assets/icon-mac.png (1024, for .icns).
// Big sizes show the whole sitting Dumbo; small sizes (≤32 px) show just his head so he stays readable.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');

/** Minimal .ico writer: each entry stored as PNG (supported since Windows Vista). */
function writeIco(file, pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  fs.writeFileSync(file, Buffer.concat([header, dir, ...pngs.map(p => p.buf)]));
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const { frontSVG } = await import(path.join(ROOT, 'src/art/front.js').replace(/\\/g, '/').replace(/^/, 'file:///'));
  const { layers, faceDefs } = await import(path.join(ROOT, 'src/art/face.js').replace(/\\/g, '/').replace(/^/, 'file:///'));

  // Whole Dumbo, sitting, smiling — cropped square around him (glow included).
  const body = frontSVG('dark', { expr: 'smile', shadow: false }, 'i').replace(/viewBox="[^"]*"/, 'viewBox="-30 -10 470 470"');
  // Head only for tiny sizes.
  const G = layers('dark', { eyes: 'open', lids: 'none', brows: 'neutral', mouth: 'smile', blush: 'normal', trunk: 'rest', ears: 'neutral' }, 'h');
  const rim = 'url(#hrim)';
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -64 438 438">${faceDefs('dark', 'h')}<g filter="url(#hglow)" opacity=".8">${G.sil([rim, 20])}</g>${G.sil([rim, 13])}${G.ears}${G.head}${G.hair}${G.brows}${G.eyes}${G.highlights}${G.blush}${G.mouth}${G.tongue}${G.trunk}</svg>`;

  const win = new BrowserWindow({ width: 256, height: 256, enableLargerThanScreen: true, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  async function render(svg, size) {
    const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    win.setContentSize(size, size);
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise(r => setTimeout(r, 300));
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    return img.resize({ width: size, height: size, quality: 'best' }).toPNG();
  }

  const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
  const pngs = [];
  for (const size of sizes) pngs.push({ size, buf: await render(size <= 32 ? head : body, size) });
  writeIco(path.join(OUT, 'icon.ico'), pngs);
  fs.writeFileSync(path.join(OUT, 'icon.png'), pngs.find(p => p.size === 256).buf);
  fs.writeFileSync(path.join(OUT, 'tray.png'), pngs.find(p => p.size === 32).buf);
  // macOS app icon (electron-builder turns a 1024 px PNG into .icns).
  win.setSize(1024, 1024);
  fs.writeFileSync(path.join(OUT, 'icon-mac.png'), await render(body, 1024));
  console.log('icons written:', sizes.join(', '));
  app.quit();
});
