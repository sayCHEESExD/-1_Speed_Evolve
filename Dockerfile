# The Colyseus server, for Bloxity Hosting.
#
# Built from the REPOSITORY ROOT, not from `server/`. This is an npm workspaces
# monorepo and the server imports `@evolve/shared` as a workspace dependency;
# a build context of `server/` alone has no `shared/` to resolve it against and
# no root lockfile to install from.
#
#   docker build -t speed-evolve-server .
#   docker run -e PORT=2569 -p 2569:2569 speed-evolve-server

# ---------------------------------------------------------------- build ----
FROM node:20-alpine AS build
WORKDIR /app

# The manifests first, so a change to game code does not re-run the install.
# Every workspace's package.json is needed: npm resolves the whole tree at once
# and fails on a workspace it cannot find.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/

# The full install, dev dependencies included - TypeScript is a devDependency
# and there is nothing to compile without it.
RUN npm ci

COPY shared/ shared/
COPY server/ server/

# Builds `shared` first and then the server, which is the order the server's
# imports require: `@evolve/shared` resolves to `shared/dist/index.js`.
RUN npm run build:server

# Drop to production dependencies in place. This keeps the workspace symlinks
# that `@evolve/shared` resolves through - deleting node_modules and
# reinstalling per-workspace would break them.
RUN npm prune --omit=dev

# -------------------------------------------------------------- runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# The host has to be 0.0.0.0 inside a container: binding localhost would leave
# the port unreachable from outside it, which looks exactly like a crashed
# server. `PORT` is left to the host to set - Bloxity, like most managed
# hosts, injects one - and `serverConfig` falls back to 2569.
ENV HOST=0.0.0.0

# Only what running the server needs: the installed production tree and the
# two compiled outputs. Every runtime dependency - the `mongodb` driver
# included - is HOISTED to this root node_modules; there is no
# server/node_modules for this image to miss.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist

# WHERE PROGRESS LIVES.
#
# On Bloxity Legion: in MongoDB. Legion injects `MONGODB_URI` - an isolated
# managed database per game+channel - into every pod, and the server uses it
# whenever it is set. Progress is per player, per key (`bloxity:<account>` for
# a signed-in player, the browser id for a guest), and survives restarts,
# scale-to-zero, every deploy and every device the player signs in from.
#
# Without `MONGODB_URI` - local runs, other hosts - it is JSON files in
# EVOLVE_DATA_DIR. Mount a volume here for those to survive a redeploy. On
# Legion /data holds nothing that matters: a `profiles.json` found there at
# boot is imported into Mongo, insert-only, and that is all it is used for.
ENV EVOLVE_DATA_DIR=/data
VOLUME ["/data"]

# Not root. Nothing the server does needs it, and the base image ships a
# `node` user for exactly this.
RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 2569

# The same probe the health check uses, so a container that is up but not
# listening is reported as unhealthy rather than as running.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2569)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Straight to node, with no npm wrapper: npm swallows signals, so a container
# stopped by the host would not run the shutdown handler - which closes every
# room, then WAITS for the queued saves to land in the database before it
# exits.
CMD ["node", "server/dist/index.js"]
