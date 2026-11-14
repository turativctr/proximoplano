// Somente consultas de infraestrutura. Reutiliza CLIs já instaladas pelo npm.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');
const providers = {
  vercel: { version: '65.14.0', args: ['project', 'inspect', 'filmmanager', '--scope', 'victor-turati'] },
  neon: { version: '9.3.2', args: ['branches', 'list', '--project-id', 'crimson-wildflower-33344350', '--no-analytics'] },
};
function cachedCli(name, version) {
  const cache = path.join(process.env.npm_config_cache || path.join(os.homedir(), '.npm'), '_npx');
  if (!fs.existsSync(cache)) return null;
  for (const directory of fs.readdirSync(cache)) {
    const root = path.join(cache, directory, 'node_modules', name);
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      if (pkg.name !== name || pkg.version !== version) continue;
      const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[name];
      if (bin && fs.existsSync(path.join(root, bin))) return path.join(root, bin);
    } catch {}
  }
  return null;
}
const names = process.argv[2] ? [process.argv[2]] : Object.keys(providers);
for (const name of names) {
  const provider = providers[name];
  if (!provider) { console.error('Use vercel ou neon.'); process.exit(1); }
  const cached = cachedCli(name, provider.version);
  const result = spawnSync(cached ? process.execPath : 'npx',
    cached ? [cached, ...provider.args] : ['--yes', `${name}@${provider.version}`, ...provider.args],
    { cwd: project, stdio: 'inherit', timeout: 120000 });
  if (result.error || result.status !== 0) {
    console.error(`Não foi possível consultar ${name}. Verifique a conexão e a sessão da CLI.`);
    process.exit(1);
  }
}
