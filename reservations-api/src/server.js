// Entry point: connects the real database and starts listening.
const { createApp } = require('./app');
const pool = require('./db');

const PORT = Number(process.env.PORT || 3002);

const server = createApp(pool).listen(PORT, () => {
  console.log(`[reservations-api] listening on port ${PORT}`);
});

// Graceful shutdown: "docker stop" sends SIGTERM
function shutdown() {
  console.log('[reservations-api] shutting down');
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
