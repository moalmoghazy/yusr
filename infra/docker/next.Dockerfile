# The website or the control hub (Next.js standalone output).
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=web --build-arg NEXT_PUBLIC_SITE_URL=https://yusr.example .
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=admin .
ARG APP=web

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
ARG APP
COPY . .
RUN pnpm dlx turbo@2 prune @yusr/${APP} --docker

FROM base AS build
ARG APP
# NEXT_PUBLIC_* values are compiled into the app, so they are build arguments, not runtime settings.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SHOW_SUPERVISION=true
ARG NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER=
ARG NEXT_PUBLIC_POSTHOG_HOST=
ARG NEXT_PUBLIC_SENTRY_DSN=
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_SHOW_SUPERVISION=${NEXT_PUBLIC_SHOW_SUPERVISION} \
    NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER=${NEXT_PUBLIC_MOSS_REGISTRATION_NUMBER} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
RUN pnpm turbo run build --filter=@yusr/${APP}...

FROM node:22-alpine AS runtime
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S yusr && adduser -S yusr -G yusr
# Standalone output keeps the monorepo layout: the server lives at apps/<app>/server.js.
COPY --from=build --chown=yusr:yusr /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=yusr:yusr /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
USER yusr
EXPOSE 3000
ENV APP_DIR=apps/${APP}
CMD ["sh", "-c", "node $APP_DIR/server.js"]
