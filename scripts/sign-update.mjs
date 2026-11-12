// Signs release/update.json (made by scripts/package.mjs) with the Ed25519 release key, so installed
// copies of Dumbo accept the update (electron/common.cjs holds the public half).
// Key: env UPDATE_SIGNING_KEY (PEM text; a GitHub Actions secret in the private repo) or
// env UPDATE_SIGNING_KEY_FILE (path). Never commit the key.
import { readFileSync, writeFileSync } from 'fs';
import { createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const pem = process.env.UPDATE_SIGNING_KEY || (process.env.UPDATE_SIGNING_KEY_FILE && readFileSync(process.env.UPDATE_SIGNING_KEY_FILE, 'utf8'));
if (!pem) { console.error('No signing key: set UPDATE_SIGNING_KEY or UPDATE_SIGNING_KEY_FILE.'); process.exit(1); }

const { PUBLIC_KEY: publicKey, signedMessage } = require('../electron/common.cjs');

const file = path.join(root, 'release', 'update.json');
const m = JSON.parse(readFileSync(file, 'utf8'));
const key = createPrivateKey(pem);
if (createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString() !== publicKey) {
  console.error('This key does not match the public key in electron/common.cjs.'); process.exit(1);
}
m.signature = sign(null, Buffer.from(signedMessage(m)), key).toString('base64');
if (!verify(null, Buffer.from(signedMessage(m)), publicKey, Buffer.from(m.signature, 'base64'))) throw new Error('self-check failed');
writeFileSync(file, JSON.stringify(m, null, 2));
console.log(`signed update.json for v${m.version}`);
