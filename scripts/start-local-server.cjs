const path = require('node:path');
const project = path.resolve(__dirname, '..');
process.chdir(project);
require('./check-local-env.cjs').checkLocalEnv(project);
process.env.NEXTAUTH_URL = 'http://localhost:3000';
const next = path.join(project, 'node_modules/next/dist/bin/next');
process.argv = [process.execPath, next, 'dev', '--hostname', '127.0.0.1', '--port', '3000'];
require(next);
