// Builds the zip users install: only the extension's own files (no tests/docs). Output: dist/td-panel-for-match-play-<version>.zip
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;
const files = ['manifest.json', 'bg.js', 'src', 'popup', 'icons', 'README.md', 'LICENSE', 'CHANGELOG.md'];
const out = path.join(root, 'dist', `td-panel-for-match-play-${version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);
execFileSync('zip', ['-qr', out, ...files], { cwd: root, stdio: 'inherit' });
console.log('built', path.relative(root, out));
