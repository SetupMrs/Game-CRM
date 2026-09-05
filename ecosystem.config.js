// PM2 process manager config.
// Start once with:   pm2 start ecosystem.config.js
// Then just restart:  pm2 restart game-crm
module.exports = {
  apps: [
    {
      name: "game-crm",
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
