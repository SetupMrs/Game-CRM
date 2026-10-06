#!/usr/bin/env bash
# Завести НОВУ копію Game CRM для окремої компанії (Шлях A).
# Кожна копія — повністю ізольована: власна папка, власна база даних,
# власний порт і власний PM2-процес. Код спільний (той самий GitHub-репо),
# тож оновлення прилітають у всі копії автоматично (через auto-deploy).
#
# Використання (з сервера):
#   bash ~/Game-CRM/new-company.sh <slug> <port>
# Приклад:
#   bash ~/Game-CRM/new-company.sh company2 3001
#
# <slug> — коротка латинська назва компанії (a-z, 0-9, дефіс), напр. company2
# <port> — вільний порт, напр. 3001 (у кожної копії свій; головна зазвичай 3000)

set -e

REPO_URL="https://github.com/SetupMrs/Game-CRM.git"

SLUG="${1:-}"
PORT="${2:-}"

if [ -z "$SLUG" ] || [ -z "$PORT" ]; then
  echo "Використання: bash new-company.sh <slug> <port>"
  echo "Приклад:      bash new-company.sh company2 3001"
  exit 1
fi

if ! echo "$SLUG" | grep -qE '^[a-z0-9-]+$'; then
  echo "ПОМИЛКА: slug має містити лише малі латинські літери, цифри й дефіс (напр. company2)."
  exit 1
fi

if ! echo "$PORT" | grep -qE '^[0-9]+$'; then
  echo "ПОМИЛКА: порт має бути числом (напр. 3001)."
  exit 1
fi

APP_NAME="crm-$SLUG"
TARGET_DIR="$HOME/$APP_NAME"

# node/npm/npx/pm2 у PATH (на випадок nvm)
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$HOME/.local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true; fi

if [ -e "$TARGET_DIR" ]; then
  echo "ПОМИЛКА: папка $TARGET_DIR вже існує. Обери інший slug або прибери стару копію."
  exit 1
fi

# Чи не зайнятий порт іншим PM2-процесом цього ж набору (проста перевірка)
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "ПОМИЛКА: порт $PORT вже зайнятий. Обери інший."
  exit 1
fi

echo "==> Клоную код у $TARGET_DIR ..."
git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
cd "$TARGET_DIR"

echo "==> Готую .env (порт $PORT, процес $APP_NAME) ..."
# Генеруємо надійний випадковий пароль першого адміна
ADMIN_PASS="$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 20)"
cat > .env <<ENV_EOF
# Копія для компанії: $SLUG
PM2_NAME=$APP_NAME
PORT=$PORT
HOST=0.0.0.0
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASS
# LETSKEYS_API_KEY=
# LETSKEYS_AUTO_SYNC_HOURS=12
ENV_EOF

echo "==> Встановлюю залежності..."
npm install

echo "==> Збираю проєкт..."
npx vite build --outDir dist
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs

echo "==> Запускаю під PM2 (процес: $APP_NAME)..."
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Вмикаю автодеплой для цієї копії (cron, щохвилини)..."
chmod +x auto-deploy.sh
( crontab -l 2>/dev/null | grep -v "$TARGET_DIR/auto-deploy.sh"; echo "* * * * * /bin/bash $TARGET_DIR/auto-deploy.sh" ) | crontab -
systemctl enable --now cron 2>/dev/null || systemctl enable --now crond 2>/dev/null || true

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"

echo ""
echo "============================================================"
echo "  ГОТОВО! Нова копія для компанії «$SLUG» працює."
echo "------------------------------------------------------------"
echo "  Адреса:        http://${SERVER_IP:-<IP-сервера>}:$PORT"
echo "  Процес PM2:    $APP_NAME"
echo "  Папка:         $TARGET_DIR"
echo "  База даних:    $TARGET_DIR/data/game_crm.sqlite"
echo "  Логін адміна:  admin"
echo "  Пароль адміна: $ADMIN_PASS"
echo "  (також збережено у $TARGET_DIR/data/INITIAL_ADMIN_PASSWORD.txt)"
echo "------------------------------------------------------------"
echo "  Автооновлення: увімкнено (підхоплює зміни з GitHub щохвилини)"
echo "============================================================"
