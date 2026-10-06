// PM2 process manager config.
// Start once with:   pm2 start ecosystem.config.cjs
// Then just restart:  pm2 restart <name>
//
// Імʼя процесу й порт беруться з .env цієї копії (PM2_NAME, PORT), тож один
// і той самий код обслуговує кілька окремих копій (різні компанії) — у кожної
// власна папка з базою, власний порт і власний процес. Без цих змінних
// поведінка як раніше: name = "game-crm", порт 3000.
try { require("dotenv").config(); } catch (_) { /* dotenv ще не встановлено — ок */ }

const APP_NAME = process.env.PM2_NAME || "game-crm";

module.exports = {
  apps: [
    {
      name: APP_NAME,
      script: "dist/server.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      },
      watch: false, // ми самі перезапускаємо через deploy.sh після кожного оновлення
      max_memory_restart: "300M",
      autorestart: true, // автоматично піднімає процес, якщо він впаде
      time: true
    }
  ]
};
