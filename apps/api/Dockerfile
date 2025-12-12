FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
COPY packages/ai/package.json packages/ai/
COPY packages/ingestion/package.json packages/ingestion/
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi

FROM deps AS builder
COPY . .
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/customer_support_ai"
RUN npm run prisma:generate --workspace api && npm run build --workspace api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
EXPOSE 3001
CMD ["npm", "run", "start:api"]
