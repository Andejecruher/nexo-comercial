#!/bin/sh
# Production / Cloud Run Job entrypoint for voz-tools.
# Always applies pending Prisma migrations forward-only.
# Never runs migrate reset, db push --force-reset, or seed.
set -eu

echo "[voz-prod-migrate] Forward-only: prisma migrate deploy (never reset/seed)."

if [ "$#" -gt 0 ]; then
  echo "[voz-prod-migrate] Extra container args (ignored unless destructive): $*"
  case " $* " in
    *" reset "*|*"reset --force"*|*"force-reset"*|*" db push "*|*"db:push"*|*" seed "*|*"prisma:seed"*)
      echo "[voz-prod-migrate] ERROR: refusing destructive or seed arguments on the production migrator."
      exit 1
      ;;
  esac
fi

cd /workspace/backend
exec pnpm run migrate:deploy
