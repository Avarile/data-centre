import './instrument';
import './tracing';
import type { INestApplication } from '@nestjs/common';
import { bootstrap } from './bootstrap';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const module: any;

let app: INestApplication | undefined;
// Tracked separately from `app`, which is only assigned once `bootstrap()` has
// resolved. A hot update landing mid-boot would otherwise see `app === undefined`
// and silently skip the close, leaving the previous generation's connection pools
// and background pollers alive alongside the new one.
let appPromise: Promise<INestApplication> | undefined;

// On a hot reload the previous instance is disposed while the next one boots.
// The two share a database, so the new instance must not start until the old
// one has finished releasing its connection pools — otherwise a half-torn-down
// container races the fresh one. The promise is handed across module instances
// through `module.hot.data`.
const previousClose: Promise<void> | undefined = module.hot?.data?.closePromise;

async function main() {
  await previousClose;
  appPromise = bootstrap();
  app = await appPromise;
}

main();

// Force exit after timeout if app.close() hangs during development
// enableShutdownHooks() in bootstrap.ts handles graceful shutdown,
// but some modules may not release resources properly
if (module.hot) {
  const forceExitTimeout = 5000; // 5 seconds

  const forceExit = (signal: string) => {
    console.log(`Received ${signal}, forcing exit in ${forceExitTimeout}ms if not closed...`);
    setTimeout(() => {
      console.log('Force exiting due to timeout...');
      process.exit(0);
    }, forceExitTimeout).unref();
  };

  process.on('SIGINT', () => forceExit('SIGINT'));
  process.on('SIGTERM', () => forceExit('SIGTERM'));

  module.hot.accept((err: Error) => {
    if (err) {
      console.error('[HMR] Update failed, restarting...', err);
      // If HMR fails, restart the app
      main();
    }
  });
  module.hot.dispose((data: { closePromise?: Promise<void> }) => {
    const closing = appPromise;
    appPromise = undefined;
    app = undefined;
    // Webpack ignores the return value of a dispose handler, so the promise is
    // stashed for the next module instance to await in `main()`. Chaining off the
    // boot promise rather than the resolved app means an update that arrives
    // before the boot finished still closes the old instance.
    data.closePromise = closing
      ?.then((instance) => instance.close())
      .catch((error: unknown) => console.error('[HMR] Failed to close app', error));
  });
}

export { app };
