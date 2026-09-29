# API image, built from the repo root as context:
#   docker build -f api/Dockerfile -t uofthub-api .
# Render builds it the same way (see render.yaml).

# Debian rather than Alpine: Prisma's schema engine links against OpenSSL, and
# on musl it fails to load with a "Could not parse schema engine response" that
# only shows up at boot, after the image builds cleanly.
#
# Pinned by digest, so a rebuild is the image that was reviewed rather than
# whatever the tag points at that day. Dependabot (.github/dependabot.yml)
# proposes the bump when the tag moves.
FROM node:26-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS build
RUN npm install --global pnpm@10.33.0
WORKDIR /repo

# Manifests first: this layer only busts when a dependency changes, so day-to-day
# code edits reuse the cached install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY api/package.json api/
COPY web/package.json web/
# `...` pulls in the workspace packages the API depends on. devDependencies are
# in here — the build needs tsc — and left behind in the stage below.
RUN pnpm install --frozen-lockfile --filter @uofthub/api...

COPY packages/types packages/types
COPY api api
RUN pnpm --filter @uofthub/api db:generate && pnpm --filter @uofthub/api build

# The same install without devDependencies (tsc, tsx, vitest): what runs in
# production ships no compiler or test runner to anyone who gets a shell in it.
# The Prisma CLI is a production dependency, because migrations run at boot.
FROM build AS prod-deps
RUN rm -rf node_modules api/node_modules packages/types/node_modules \
  && pnpm install --frozen-lockfile --prod --offline --filter @uofthub/api... \
  && pnpm --filter @uofthub/api db:generate

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=prod-deps /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages ./packages
COPY --from=prod-deps /repo/api/node_modules ./api/node_modules
COPY --from=build /repo/api/package.json ./api/package.json
COPY --from=build /repo/api/prisma ./api/prisma
COPY --from=build /repo/api/dist ./api/dist
# Fonts and the mark the link-preview cards are drawn with (src/lib/ogImage.ts).
COPY --from=build /repo/api/assets ./api/assets

WORKDIR /repo/api
EXPOSE 3001

# Not root: the files above stay root-owned and read-only to the process, and
# a compromised process cannot change the image it runs from.
USER node

# Migrations are applied before the server accepts a request — the same order
# the local `predev` script uses, so a deploy can never serve traffic against a
# schema it doesn't match. `exec` hands the shell's place to Node, so the
# SIGTERM a deploy sends reaches the API's shutdown handler (src/index.ts)
# instead of stopping at a shell that ignores it. The Prisma CLI is called
# directly: no package manager is installed in this stage.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
