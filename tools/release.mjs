// Build the Windows installer and publish it as a GitHub Release, so installed copies update:
//
//   1. Bump "version" in package.json (installed apps update only to a higher version).
//   2. Make a GitHub token with permission to write releases on jeremysaqr/kana-dojo
//      (github.com → Settings → Developer settings → Fine-grained tokens → Contents: Read and write),
//      and set it for this shell:   $env:GH_TOKEN = "<token>"      (PowerShell)
//   3. npm run release
//
// Without a token, `npm run dist` still builds dist/Kana Dojo Setup <version>.exe to install by hand.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (!process.env.GH_TOKEN) {
  console.error('GH_TOKEN is not set. Make a GitHub token (see the top of tools/release.mjs) and set it first:');
  console.error('  $env:GH_TOKEN = "<token>"; npm run release');
  process.exit(2);
}
console.log(`Building and publishing Kana Dojo ${version}…`);
const r = spawnSync('npx', ['electron-builder', '--win', '--publish', 'always'], { stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
