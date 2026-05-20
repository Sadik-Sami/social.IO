FROM node:20-alpine AS base

WORKDIR /app
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apk add --no-cache libc6-compat && corepack enable pnpm

FROM base AS prepare
COPY . .
RUN pnpm dlx turbo prune server --docker

FROM base AS builder
COPY --from=prepare /app/out/json/ .
COPY --from=prepare /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prepare /app/out/full/ .
RUN pnpm turbo run build --filter=server
# Deploy to isolated directory with legacy flag for pnpm v10
RUN pnpm deploy --filter=server --prod --legacy /app/deployed-server
RUN cp -r apps/server/dist /app/deployed-server/dist

FROM node:20-alpine AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
USER app

WORKDIR /app
COPY --from=builder --chown=app:nodejs /app/deployed-server ./

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.mjs"]
