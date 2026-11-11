// Dev tool: render an HTML file offscreen with the Electron runtime and save a PNG.
// Usage: npx electron scripts/snap.cjs <in.html> <out.png> [width] [height]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const [inFile, outFile, w = '1200', h = '900'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: +w, height: +h, show: false, webPreferences: { offscreen: true } });
  try { await win.loadFile(inFile); } catch (e) { console.error(e); app.exit(1); return; }
  await new Promise(r => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(outFile, img.toPNG());
  app.quit();
});
