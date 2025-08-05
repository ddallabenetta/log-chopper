# 1) Base builder image
FROM node:20-alpine AS base
WORKDIR /app

# 2) Dependencies layer (installa solo le deps per caching)
FROM base AS deps
# Abilita pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copia file lock/config per un install deterministico (se presenti)
COPY package.json pnpm-lock.yaml* .npmrc* ./

# Installa le dependencies:
# - se esiste pnpm-lock.yaml usa --frozen-lockfile
# - altrimenti install normale e genera il lockfile
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# 3) Builder (compila Next.js)
FROM base AS builder
# Abilita pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copia node_modules e manifest dal layer deps
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

# Utente non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copia i file necessari dal builder
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
USER nextjs

CMD ["node", "server.js"]