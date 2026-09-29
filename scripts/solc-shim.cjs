#!/usr/bin/env node
// Minimal native-solc-compatible shim over solcjs for forge `--use`.
const solc = require('solc');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write(`solc, the solidity compiler commandline interface\nVersion: ${solc.version()}\n`);
  process.exit(0);
}
const roots = [process.cwd()];
for (let i = 0; i < args.length; i++) {
  if (['--base-path', '--include-path', '--allow-paths'].includes(args[i]) && args[i + 1]) {
    roots.push(...args[i + 1].split(','));
  }
}
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const findImports = (p) => {
    for (const r of [...roots, '']) {
      const f = path.resolve(r, p);
      if (fs.existsSync(f)) return { contents: fs.readFileSync(f, 'utf8') };
    }
    return { error: 'File not found: ' + p };
  };
  process.stdout.write(solc.compile(input, { import: findImports }));
});
