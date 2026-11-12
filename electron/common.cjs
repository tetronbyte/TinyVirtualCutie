// Shared by boot.cjs, main.cjs and updater.cjs.
const path = require('path');
const os = require('os');

// Settings/state/updates live next to the installed app, not in AppData (see main.cjs).
// DUMBO_STATE_DIR is only for tests, so a test copy never touches the real Dumbo.
const STATE_DIR = process.env.DUMBO_STATE_DIR || path.join(os.homedir(), 'Apps', 'Dumbo');
const UPDATES_DIR = path.join(STATE_DIR, 'updates');

const parse = v => String(v).replace(/^v/, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
/** true if version a is newer than b ("0.3.10" > "0.3.9"). */
function newer(a, b) {
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// Update signing (updater.cjs verifies, scripts/sign-update.mjs signs). Public half only; the private
// key lives only in the private repo's GitHub secret UPDATE_SIGNING_KEY (+ the owner's backup).
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAM92ShQqdNNf4REhyW1QJQuClMcoA31aA1BTLhIxGQh8=
-----END PUBLIC KEY-----
`;
/** The exact text that is signed for a release. */
const signedMessage = m => `dumbo-update\n${m.version}\n${m.electron}\n${m.asar}\n${m.sha512}`;

module.exports = { STATE_DIR, UPDATES_DIR, newer, PUBLIC_KEY, signedMessage };
