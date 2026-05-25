/**
 * ratio-api
 * REST control plane for ratio LP automation agent
 */
import { createServer } from './server.js';

const PORT = parseInt(process.env['APP_PORT'] ?? '3000', 10);

const server = createServer();

server.listen(PORT, () => {
  console.log(`[ratio-api] listening on port ${PORT}`);
  console.log(`[ratio-api] DRY_RUN=${process.env['DRY_RUN'] ?? 'true'}`);
});

process.on('SIGTERM', () => {
  console.log('[ratio-api] SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
