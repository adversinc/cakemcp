FROM oven/bun:1-slim AS base
WORKDIR /usr/src/app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM node:24-bookworm-slim AS node-runtime

FROM base AS build
# vue-tsc requires Node; the production image continues to run only Bun.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run typecheck && bun run typecheck:web && bun run lint
RUN bun test && bun run build:web

FROM base AS production-dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS release
ENV NODE_ENV=production
COPY --from=production-dependencies /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/src ./src
COPY --from=build /usr/src/app/dist/web ./dist/web
COPY --from=build /usr/src/app/index.ts /usr/src/app/package.json ./
ENTRYPOINT ["bun", "run", "index.ts"]
