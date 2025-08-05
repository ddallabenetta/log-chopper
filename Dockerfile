# 1) Base builder image
FROM node:20-alpine AS base
WORKDIR /app

# 2) Dependencies layer (installa solo le deps per caching)
FROM base AS deps
# Abilita pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copia file lock/config per un install deterministico
COPY package.json pnpm-lock.yaml* .npmrc* ./

# Installa le dependencies
RUN pnpm install --frozen-lockfile

# 3) Builder (compila Next.js)
FROM base AS builder
# Abilita pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copia node_modules dal layer deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=deps /app/package.json ./package.json

# Copia il resto del progetto
COPY . .

# Build Next.js (App Router)
RUN pnpm build

# 4) Runner minimal per produzione
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Creiamo un utente non-root per sicurezza
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copia i file necessari dal builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Porta esposta
EXPOSE 3000

USER nextjs

# Avvia l'app (Next standalone)
CMD ["node", "server.js"]