# API image, built from the repo root as context:
#   docker build -f apps/api/Dockerfile -t uofthub-api .
# Railway builds it the same way (see railway.json).

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
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# `...` pulls in the workspace packages the API depends on. devDependencies stay
# in: the build needs tsc, and the runtime stage needs the Prisma CLI.
RUN pnpm install --frozen-lockfile --filter @uofthub/api...

COPY packages/types packages/types
COPY apps/api apps/api
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
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/dist ./apps/api/dist

WORKDIR /repo/apps/api
EXPOSE 3001

# Migrations are applied before the server accepts a request — the same order
# the local `predev` script uses, so a deploy can never serve traffic against a
# schema it doesn't match.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
