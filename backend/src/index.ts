import { APP_VERSION } from '@lorapulse/shared';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const enableDemo =
    process.argv.includes('--demo') || process.env.ENABLE_EMBEDDED_SIMULATOR === 'true';

  const port = Number(process.env.APP_PORT || process.env.PORT || 8080);
  const host = process.env.APP_HOST || '0.0.0.0';

  const app = await createApp({
    enableDemo,
    logger: process.env.NODE_ENV !== 'test',
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[LoRaPulse] Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      console.error('[LoRaPulse] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port, host });
  console.info(`[LoRaPulse] Server v${APP_VERSION} listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error('[LoRaPulse] Fatal startup error:', err);
  process.exit(1);
});
