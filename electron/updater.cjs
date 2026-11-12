// Software updates. Releases are published to a public GitHub repo (package.json "updates.repo").
// Each release carries:
//   update.json            { version, electron, asar, sha512, notes, signature }
//   dumbo-app-<ver>.asar   Dumbo's code + art (the same file as resources/app.asar)
//   Dumbo-Setup / zip      full downloads for new users
// The updater downloads the .asar into %USERPROFILE%\Apps\Dumbo\updates\ and boot.cjs runs it on
// the next start. Nothing executable is downloaded, and Dumbo.exe never changes.
// Safety: update.json must be signed with the release key (Ed25519; private half lives only in the
// private repo's GitHub secrets), and the archive must match the signed SHA-512. Anything else is
// ignored. Only the release files are fetched; nothing about the user is sent.
// A release that needs a newer Electron runtime can't be applied this way: the tray then offers
// the download page instead.
const { net } = require('electron');
const fs = require('original-fs');
const path = require('path');
const crypto = require('crypto');
const { UPDATES_DIR, newer, PUBLIC_KEY, signedMessage } = require('./common.cjs');

const FIRST_CHECK = Number(process.env.DUMBO_UPDATE_DELAY) || 60e3, CHECK_EVERY = 6 * 3600e3; // env: tests only
const sha512 = buf => crypto.createHash('sha512').update(buf).digest('base64');
const ELECTRON_MAJOR = String(process.versions.electron).split('.')[0];

function verify(m) {
  if (!m || typeof m.version !== 'string' || typeof m.sha512 !== 'string' || typeof m.signature !== 'string' || !/^[\w.-]+\.asar$/.test(String(m.asar))) throw new Error('bad update.json');
  const ok = crypto.verify(null, Buffer.from(signedMessage(m)), PUBLIC_KEY, Buffer.from(m.signature, 'base64'));
  if (!ok) throw new Error('update signature invalid');
}

async function get(url) {
  const r = await net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60e3) });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${path.basename(url)}`);
  return Buffer.from(await r.arrayBuffer());
}

class Updater {
  /** @param {{repo: string, current: string, running: string|null, currentFile: string, onChange: (s: object) => void}} o */
  constructor(o) {
    Object.assign(this, o);
    this.status = { state: 'idle' };
    this.busy = false;
  }
  get base() { return process.env.DUMBO_UPDATE_URL || (this.repo ? `https://github.com/${this.repo}/releases/latest/download` : ''); }
  get enabled() { return !!this.base; }
  get releasesPage() { return this.repo ? `https://github.com/${this.repo}/releases/latest` : ''; }

  start(auto) {
    clearTimeout(this.t); clearInterval(this.i);
    this.cleanup();
    if (!auto || !this.enabled) return;
    this.t = setTimeout(() => this.check(false), FIRST_CHECK);
    this.i = setInterval(() => this.check(false), CHECK_EVERY);
  }
  stop() { clearTimeout(this.t); clearInterval(this.i); }

  set(s) { this.status = s; this.onChange(s); return s; }

  async check(manual) {
    if (!this.enabled) return this.set({ state: 'off', manual });
    if (this.busy) return this.status;
    this.busy = true;
    const prev = this.status;
    if (manual) this.set({ state: 'checking', manual });
    try {
      const m = JSON.parse((await get(`${this.base}/update.json`)).toString('utf8'));
      verify(m);
      if (!newer(m.version, this.current)) {
        return (prev.state === 'ready' && prev.version) ? this.set({ ...prev, manual }) : this.set({ state: 'latest', manual });
      }
      if (prev.state === 'ready' && prev.version === m.version) return this.set({ ...prev, manual });
      if (String(m.electron) !== ELECTRON_MAJOR) return this.set({ state: 'reinstall', version: m.version, notes: m.notes || '', manual });
      const file = path.join(UPDATES_DIR, `dumbo-app-${m.version}.asar`);
      if (!(fs.existsSync(file) && sha512(fs.readFileSync(file)) === m.sha512)) {
        const buf = await get(`${this.base}/${m.asar}`);
        if (sha512(buf) !== m.sha512) throw new Error('download corrupted (checksum mismatch)');
        fs.mkdirSync(UPDATES_DIR, { recursive: true });
        fs.writeFileSync(file + '.part', buf);
        fs.renameSync(file + '.part', file);
      }
      fs.writeFileSync(this.currentFile, JSON.stringify({ version: m.version, electron: m.electron, file: path.basename(file), notes: m.notes || '', at: new Date().toISOString(), tries: 0 }, null, 2));
      this.cleanup();
      return this.set({ state: 'ready', version: m.version, notes: m.notes || '', manual });
    } catch (e) {
      return this.set({ ...(prev.state === 'ready' ? prev : {}), state: prev.state === 'ready' ? 'ready' : 'error', error: String(e?.message || e), manual });
    } finally { this.busy = false; }
  }

  /** The update started fine: forget the crash counter. */
  markGood() {
    if (!this.running) return;
    try { const c = JSON.parse(fs.readFileSync(this.currentFile, 'utf8')); if (c.tries) { c.tries = 0; fs.writeFileSync(this.currentFile, JSON.stringify(c, null, 2)); } } catch {}
  }

  /** Delete downloaded archives that are neither running nor waiting for the next start. */
  cleanup() {
    try {
      let keep = '';
      try { keep = path.basename(JSON.parse(fs.readFileSync(this.currentFile, 'utf8')).file); } catch {}
      for (const f of fs.readdirSync(UPDATES_DIR)) {
        if (!/^dumbo-app-.*\.asar(\.part)?$/.test(f) || f === keep || (this.running && f === path.basename(this.running))) continue;
        try { fs.unlinkSync(path.join(UPDATES_DIR, f)); } catch { /* in use */ }
      }
    } catch { /* no updates folder yet */ }
  }
}

module.exports = { Updater };
