import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@evolve/shared';
import { serverConfig } from './config/serverConfig.js';
import { createHttpServer } from './httpServer.js';
import { profileStore } from './progression/ProfileStore.js';
import { CourseRoom } from './rooms/CourseRoom.js';
import { logger } from './util/logger.js';

const SCOPE = 'server';

/** How long shutdown waits for queued saves to land before giving up. */
const SHUTDOWN_FLUSH_MS = 20_000;

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createHttpServer() }),
  greet: false,
});

gameServer.define(ROOM_NAME, CourseRoom);

const boot = async (): Promise<void> => {
  // Connect storage FIRST, but never let it stop the server listening. A
  // database that is down at boot is logged loudly; `/health` still answers,
  // so the host does not restart-loop the pod, and joins are refused cleanly
  // until storage is back rather than let in on empty profiles.
  await profileStore.open();

  await gameServer.listen(serverConfig.port, serverConfig.host);
  logger.info(
    SCOPE,
    `listening on ${serverConfig.host}:${serverConfig.port} ` +
      `room="${ROOM_NAME}" health=/health store=${profileStore.kind} ` +
      `game="${serverConfig.gameSlug}" boards=${profileStore.size}`,
  );
};

boot().catch((error: unknown) => {
  logger.error(SCOPE, 'failed to start', error);
  process.exit(1);
});

let stopping = false;

const shutdown = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  logger.info(SCOPE, `received ${signal}, shutting down`);
  // `false`: do NOT exit from inside Colyseus. Called with no argument it
  // exits the process the moment rooms are closed - before the saves their
  // players' departures queued have reached storage.
  void gameServer
    .gracefullyShutdown(false)
    .catch((error: unknown) => logger.error(SCOPE, 'room shutdown failed', error))
    .then(async () => {
      const flushed = await profileStore.flush(SHUTDOWN_FLUSH_MS);
      if (flushed) logger.info(SCOPE, 'every queued save landed');
      else logger.error(SCOPE, 'SHUTDOWN WITH SAVES STILL QUEUED - storage did not answer in time');
      await profileStore.close();
    })
    .catch((error: unknown) => logger.error(SCOPE, 'store shutdown failed', error))
    .finally(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
