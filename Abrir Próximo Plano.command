#!/bin/zsh
set -eu
export PATH="$HOME/.local/node/bin:$HOME/Applications/Postgres.app/Contents/Versions/latest/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJ="${0:A:h}"
cd "$PROJ"
node scripts/check-local-env.cjs
if ! pg_ctl -D "$HOME/.local/postgres-data" status >/dev/null 2>&1; then
  pg_ctl -D "$HOME/.local/postgres-data" -l "$HOME/Library/Logs/proximo-plano-postgres.log" -o "-p 5432" start
fi
if lsof -nP -iTCP:3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  PROC=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t | head -1)
  LOCAL_DIR=$(lsof -a -p "$PROC" -d cwd -Fn | sed -n 's/^n//p')
  if [[ "$LOCAL_DIR" != "$PROJ" ]]; then
    echo "A porta 3000 está em uso por outra pasta: $LOCAL_DIR. Feche essa instância antes de abrir a nova."
    exit 1
  fi
else
  launchctl remove local.proximo-plano.dev >/dev/null 2>&1 || true
  launchctl submit -l local.proximo-plano.dev -o "$HOME/Library/Logs/proximo-plano.log" -e "$HOME/Library/Logs/proximo-plano.log" -- "$HOME/.local/node/bin/node" "$PROJ/scripts/start-local-server.cjs"
fi
for i in {1..60}; do
  if curl --fail --silent --max-time 3 http://localhost:3000/projects >/dev/null; then
    [[ "${1:-}" == "--sem-abrir" ]] || open http://localhost:3000/projects
    echo "Próximo Plano pronto: http://localhost:3000/projects"
    exit 0
  fi
  sleep 1
done
echo "Servidor ainda não respondeu. Consulte ~/Library/Logs/proximo-plano.log"
exit 1
