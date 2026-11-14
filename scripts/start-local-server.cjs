const path = require('node:path');
const fs = require('node:fs');
const project = path.resolve(__dirname, '..');
process.chdir(project);
const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
if (!match || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(match[1]).hostname)) {
  throw new Error('O iniciador exige um banco local.');
}
process.env.NEXTAUTH_URL = 'http://localhost:3000';
const next = path.join(project, 'node_modules/next/dist/bin/next');
process.argv = [process.execPath, next, 'dev', '--hostname', '127.0.0.1', '--port', '3000'];
require(next);
