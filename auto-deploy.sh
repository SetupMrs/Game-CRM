#!/usr/bin/env bash
# Автодеплой Game CRM.
# Призначено для запуску з cron раз на хвилину. Перевіряє GitHub і, ЯКЩО
# у гілці main зʼявились нові коміти, запускає ./deploy.sh (pull + збірка +
# перезапуск). Якщо змін немає — нічого не робить.
#
# Налаштування (один раз), з сервера:
#   chmod +x ~/Game-CRM/auto-deploy.sh
#   ( crontab -l 2>/dev/null; echo "* * * * * /bin/bash $HOME/Game-CRM/auto-deploy.sh" ) | crontab -
#
# Лог: ~/Game-CRM/auto-deploy.log

set -u

REPO_DIR="$HOME/Game-CRM"
BRANCH="main"
LOG="$REPO_DIR/auto-deploy.log"
LOCK="$REPO_DIR/.auto-deploy.lock"

# --- cron має урізаний PATH: подбаємо, щоб node/npm/npx/pm2 знаходились ---
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$HOME/.local/bin:$PATH"
# Якщо node встановлено через nvm — підхопити його
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$REPO_DIR" 2>/dev/null || { echo "[auto-deploy] немає папки $REPO_DIR" >> "$LOG"; exit 1; }

# --- Не запускати паралельно: деплой триває довше за хвилину ---
exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0   # попередній запуск ще працює — тихо виходимо
fi

# --- Чи є нові коміти у main? ---
if ! git fetch origin "$BRANCH" --quiet 2>>"$LOG"; then
  log "git fetch не вдався (мережа/доступ)."
  exit 1
fi

LOCAL=$(git rev-parse "$BRANCH" 2>/dev/null || echo "none")
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "none")

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # змін немає — виходимо тихо
fi

log "Знайдено нові зміни: ${LOCAL:0:7} -> ${REMOTE:0:7}. Запускаю деплой..."
if bash ./deploy.sh >>"$LOG" 2>&1; then
  log "Деплой успішний (тепер на ${REMOTE:0:7})."
else
  log "ПОМИЛКА деплою — див. вивід вище у цьому лозі."
fi

# --- Не даємо логу рости безмежно: лишаємо останні ~800 рядків ---
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 1200 ]; then
  tail -n 800 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
