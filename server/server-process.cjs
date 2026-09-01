/**
 * server-process.cjs
 * Entry point for the server when launched as a child process from Electron.
 * This file is forked with --experimental-sqlite in execArgv so that
 * node:sqlite is available without requiring Visual Studio Build Tools.
 */
const { startServer } = require('./server.cjs');

const port = Number(process.env.SERVER_PORT) || 3000;
const dbDir = process.env.SERVER_DB_DIR || null;

startServer(port, dbDir)
  .then(({ ips }) => {
    // Notify parent process that server is ready
    if (process.send) {
      process.send({ type: 'SERVER_READY', port, ips });
    }
  })
  .catch((err) => {
    console.error('[ServerProcess] Failed to start:', err);
    if (process.send) {
      process.send({ type: 'SERVER_ERROR', error: err.message });
    }
    process.exit(1);
  });

// Graceful shutdown on signal from parent
process.on('message', (msg) => {
  if (msg && msg.type === 'SHUTDOWN') {
    console.log('[ServerProcess] Shutting down...');
    process.exit(0);
  }
});
