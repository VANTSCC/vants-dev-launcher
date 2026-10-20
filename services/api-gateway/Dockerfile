# VANTS API Gateway (Express) — Node 24 alpine
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY server.js package.json ./
EXPOSE 8080
USER node
CMD ["node", "server.js"]
