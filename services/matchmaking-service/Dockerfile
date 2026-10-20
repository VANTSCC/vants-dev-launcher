# VANTS Matchmaking Service (Fastify/Node) — Node 24 alpine
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY server.js auth.js store.js package.json ./
EXPOSE 8081
USER node
CMD ["node", "--env-file-if-exists=.env", "server.js"]
