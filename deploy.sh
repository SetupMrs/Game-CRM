#!/usr/bin/env bash
# Одна команда оновлення застосунку на сервері: ./deploy.sh
# Забирає останній код з git, збирає в тимчасову папку, і лише після
# повністю успішної збірки підміняє робочу dist/ — якщо з'єднання
# обірветься чи збірка впаде посередині, працюючий сервер це не зачепить.
set -e

echo "==> Забираю останні зміни з git..."
git pull

echo "==> Встановлюю залежності..."
npm install

echo "==> Збираю проєкт у тимчасову папку dist_new..."
rm -rf dist_new
npx vite build --outDir dist_new
npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist_new/server.cjs

echo "==> Збірка успішна. Підміняю робочу папку (миттєво, без простою)..."
rm -rf dist_old
if [ -d dist ]; then
  mv dist dist_old
fi
mv dist_new dist

echo "==> Перезапускаю сервер через PM2..."
if pm2 describe game-crm > /dev/null 2>&1; then
  pm2 restart game-crm
else
  pm2 start ecosystem.config.cjs
fi

rm -rf dist_old

echo ""
echo "==> Готово! Поточний статус:"
pm2 status game-crm
