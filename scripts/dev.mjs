// Dev mode: Vite (hot reload for src/) + the stock Electron runtime pointed at it.
import { createServer } from 'vite';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronExe = createRequire(import.meta.url)('electron'); // path to electron.exe

const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts') });
await server.listen();
const url = `http://localhost:${server.config.server.port}`;
console.log(`[dev] vite on ${url}`);

const child = spawn(electronExe, [root], { stdio: 'inherit', env: { ...process.env, DUMBO_DEV_URL: url } });
child.on('exit', code => { server.close(); process.exit(code ?? 0); });
process.on('SIGINT', () => child.kill());
