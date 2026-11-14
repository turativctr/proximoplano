// Verifica a mesma precedência de arquivos que o Next usa, sem expor credenciais.
const path = require('node:path');
const { loadEnvConfig } = require('@next/env');
function checkLocalEnv(project = path.resolve(__dirname, '..')) {
  loadEnvConfig(project, true, { info() {}, error() {} });
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    const value = process.env[key];
    if (!value && key === 'DIRECT_URL') continue;
    let local = false;
    try {
      const url = new URL(value);
      local = ['postgres:', 'postgresql:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {}
    if (!local) throw new Error(`${key} precisa apontar para PostgreSQL local. Revise as variáveis do processo e os arquivos .env; o iniciador não conecta ao Neon.`);
  }
}
module.exports = { checkLocalEnv };
if (require.main === module) {
  try { checkLocalEnv(); console.log('Banco efetivo do desenvolvimento: local.'); }
  catch (error) { console.error(error.message); process.exit(1); }
}
