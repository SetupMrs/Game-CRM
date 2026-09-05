#!/usr/bin/env bash
# Одна команда оновлення застосунку на сервері: ./deploy.sh
# Забирає останній код з git, збирає, перезапускає через PM2.
set -e

echo "==> Забираю останні зміни з git..."
git pull

echo "==> Встановлюю залежності..."
npm install

echo "==> Збираю проєкт (фронтенд + сервер)..."
npm run build

echo "==> Перезапускаю сервер через PM2..."
if pm2 describe game-crm > /dev/null 2>&1; then
  pm2 restart game-crm
else
  pm2 start ecosystem.config.cjs
fi

echo ""
echo "==> Готово! Поточний статус:"
pm2 status game-crm
