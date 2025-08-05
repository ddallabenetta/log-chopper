# 1) Base immagine per dipendenze
FROM node:20-alpine AS base
WORKDIR /app

# 2) Dipendenze (evita reinstallazioni inutili)
FROM base AS deps
# Abilita pnpm/yarn se usati aggiungendo i relativi lockfile
COPY package.json pnpm-lock.yaml* yarn.lock* package-lock.json* .npmrc* ./
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable && corepack prepare pnpm@latest --activate && pnpm i --frozen-lockfile; \
  elif [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  else npm i; \
  fi

# 3) Build
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js build (App Router)
RUN npm run build || yarn build || pnpm build

# 4) Runner minimal
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Imposta un utente non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

# Copia artefatti di build
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/package.json ./
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public

# Porta di default Next.js
EXPOSE 3000

# Avvio server Next.js integrato
CMD ["node", ".next/standalone/server.js"]