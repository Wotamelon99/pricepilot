FROM node:22-slim AS base
WORKDIR /app

# Install workspace deps
COPY package.json package-lock.json* ./
COPY packages/backend/package.json packages/backend/package.json
RUN npm install --workspace=@pricepilot/backend --include-workspace-root

COPY packages/backend packages/backend

FROM base AS build
RUN npm run build --workspace=@pricepilot/backend

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# npm workspaces hoist shared dependencies into the root node_modules -
# there is no separate packages/backend/node_modules to copy (that COPY
# used to fail the build with "not found" once actually built on a real
# Docker host, since it was never exercised until deploying to Render).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/src/db/migrations ./packages/backend/dist/db/migrations
COPY --from=build /app/packages/backend/package.json ./packages/backend/package.json

EXPOSE 3000
CMD ["node", "packages/backend/dist/server.js"]
