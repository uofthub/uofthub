# API image, built from the repo root as context:
#   docker build -f api/Dockerfile -t uofthub-api .
# Render builds it the same way (Dockerfile path api/Dockerfile, context the repo root).

# Debian rather than Alpine: Prisma's schema engine links against OpenSSL, and
# on musl it fails to load with a "Could not parse schema engine response" that
# only shows up at boot, after the image builds cleanly.
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

# Manifests first: this layer only busts when a dependency changes, so day-to-day
# code edits reuse the cached install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY api/package.json api/
COPY web/package.json web/
# `...` pulls in the workspace packages the API depends on. devDependencies stay
# in: the build needs tsc, and the runtime stage needs the Prisma CLI.
RUN pnpm install --frozen-lockfile --filter @uofthub/api...

COPY packages/types packages/types
COPY api api
RUN pnpm --filter @uofthub/api db:generate && pnpm --filter @uofthub/api build

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/api/node_modules ./api/node_modules
COPY --from=build /repo/api/package.json ./api/package.json
COPY --from=build /repo/api/prisma ./api/prisma
COPY --from=build /repo/api/dist ./api/dist

WORKDIR /repo/api
EXPOSE 3001

# Migrations are applied before the server accepts a request — the same order
# the local `predev` script uses, so a deploy can never serve traffic against a
# schema it doesn't match. `exec` hands the shell's place to Node, so the
# SIGTERM a deploy sends reaches the API's shutdown handler (src/index.ts)
# instead of stopping at a shell that ignores it.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && exec node dist/index.js"]
