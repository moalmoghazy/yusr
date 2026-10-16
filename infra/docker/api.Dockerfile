# Yusr API — and, with a different command, the outbox worker, the migration runner and staff setup:
#   node dist/main.js                                  the API (default)
#   node dist/notifications/worker.main.js             the outbox worker
#   node dist/db/migrate.js                            apply new SQL migrations (run before each deploy)
#   node dist/db/create-staff.js --phone … --role …    add a staff member (prints their authenticator key)
# Build from the repository root:  docker build -f infra/docker/api.Dockerfile .
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Only the API and the workspace packages it depends on.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2 prune @yusr/api --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@yusr/api...
# Keep the production dependencies only, from the same lockfile, so every image is reproducible.
# (Switching to production-only rebuilds node_modules; allow that without a terminal to confirm it.)
RUN pnpm install --frozen-lockfile --prod --config.confirm-modules-purge=false

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=4000
RUN addgroup -S yusr && adduser -S yusr -G yusr
WORKDIR /app
COPY --from=build --chown=yusr:yusr /repo .
WORKDIR /app/packages/api
USER yusr
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:${PORT:-4000}/health || exit 1
CMD ["node", "dist/main.js"]
