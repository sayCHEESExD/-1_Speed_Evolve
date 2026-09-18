import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { ROOM_NAME } from '@evolve/shared';
import { serverConfig } from './config/serverConfig.js';
import { buxGrants } from './progression/BuxGrants.js';
import { StorageUnavailableError } from './persistence/index.js';
import { logger } from './util/logger.js';

const SCOPE = 'webhook';

/** Bloxity's fulfilment payload. Only the fields this game acts on. */
interface BuxWebhook {
  transactionId?: string;
  userId?: string;
  username?: string;
  gameSlug?: string;
  sku?: string;
  productName?: string;
  productPrice?: number;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

/** Read a JSON body, with a ceiling so a stuck socket cannot grow for ever. */
const readJson = async (request: IncomingMessage): Promise<BuxWebhook | null> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > 64 * 1024) return null;
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as BuxWebhook;
  } catch {
    return null;
  }
};

/**
 * A plain HTTP server for Colyseus to attach to.
 *
 * Owning it rather than letting Colyseus make its own means the same port
 * answers both the WebSocket upgrade and a `/health` probe - which is what a
 * managed host polls to decide the service is up.
 */
export const createHttpServer = (): Server =>
  createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true, room: ROOM_NAME }));
      return;
    }

    if (request.url === BUX_WEBHOOK_PATH && request.method === 'POST') {
      void handleBuxWebhook(request, response);
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('not found');
  });

/** Where Bloxity delivers a paid purchase. */
export const BUX_WEBHOOK_PATH = '/bloxity/bux';

/**
 * Fulfilment, server to server.
 *
 * The ONLY way a Bux purchase becomes something a player owns. The client's
 * `requestPurchase` result is a receipt it can show; it is not a grant, and
 * nothing in the client is trusted to say a payment happened.
 *
 * ANSWERING 2xx IS THE CONTRACT - and a 2xx is only ever sent once the
 * purchase is DURABLY recorded in the same store as the profiles, keyed by its
 * transaction id. A 2xx sent before that would be a promise to pay that a
 * crash could break. Recorded includes a SKU this build does not recognise,
 * which is far more likely to be a catalogue that moved ahead of a deploy than
 * an attack.
 *
 * It replies 401 when a configured secret does not match, 400 when the body is
 * not something that can be recorded at all, and 503 when storage could not
 * make it durable - so Bloxity tries again, and the transaction id makes the
 * retry pay out once.
 */
const handleBuxWebhook = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const reply = (status: number, body: Record<string, unknown>): void => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  // The secret is optional so a local server needs no configuration, but if
  // one IS configured it is enforced - a webhook that accepted anything would
  // be an endpoint that grants Wins to whoever finds it.
  const expected = serverConfig.buxWebhookSecret;
  if (expected) {
    const supplied = request.headers['x-legion-webhook-secret'];
    if (supplied !== expected) {
      logger.warn(SCOPE, 'rejected a webhook with a bad secret');
      reply(401, { ok: false, error: 'bad secret' });
      return;
    }
  }

  const body = await readJson(request);
  const text = (value: unknown): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= 128;
  if (!text(body?.transactionId) || !text(body?.userId) || !text(body?.sku)) {
    logger.warn(SCOPE, 'rejected a webhook with no transaction, user or sku');
    reply(400, { ok: false, error: 'malformed payload' });
    return;
  }

  try {
    const outcome = await buxGrants.record(body.userId, body.transactionId, body.sku);
    logger.info(
      SCOPE,
      `${outcome} ${body.sku} for ${body.username ?? body.userId} [${body.transactionId}]`,
    );
    reply(200, { ok: true, transactionId: body.transactionId });
  } catch (error) {
    const reason = error instanceof StorageUnavailableError ? error.message : String(error);
    logger.error(SCOPE, `could not record ${body.transactionId} durably - answering 503: ${reason}`);
    reply(503, { ok: false, error: 'storage unavailable, retry' });
  }
};
