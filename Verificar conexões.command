#!/bin/zsh
set -eu
export PATH="$HOME/.local/node/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "${0:A:h}"
node scripts/check-local-env.cjs
npm run cloud:status
printf '\nConsulta concluída. Nenhum deploy ou alteração no banco foi executado.\n'
