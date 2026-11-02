import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'ffmpeg');
const coreDist = path.join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');

const files = ['ffmpeg-core.js', 'ffmpeg-core.wasm'];

fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const src = path.join(coreDist, file);
  const dest = path.join(outDir, file);
  if (!fs.existsSync(src)) {
    console.warn(`[copy-ffmpeg] missing ${src} - run npm install first`);
    continue;
  }
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) {
    continue;
  }
  fs.copyFileSync(src, dest);
  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
  console.log(`[copy-ffmpeg] ${file} (${mb} MB)`);
}

console.log('[copy-ffmpeg] ready in public/ffmpeg');
