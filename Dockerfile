# One image, three commands (ADR-0059): web (API + web app), worker, migrate — plus `demo` for demo systems.
# The workspace packages ship TypeScript sources that Node runs directly (type stripping). Node does not strip
# types inside node_modules, so the image keeps the monorepo layout, where pnpm links resolve outside it.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @master-erp/web build && pnpm --filter @master-erp/server build
# Keep production dependencies only.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod \
 && rm -rf apps/e2e apps/web/src apps/web/node_modules

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/apps/web/dist FILES_DIR=/var/lib/erp/files
RUN groupadd --system erp && useradd --system --gid erp --home /app erp \
 && mkdir -p /var/lib/erp/files && chown erp:erp /var/lib/erp/files
WORKDIR /app
COPY --from=build --chown=erp:erp /app /app
USER erp
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["node", "apps/server/dist/main.js"]
CMD ["web"]
