# Multi-stage Dockerfile for System Logger Microservice
FROM node:20-alpine AS builder
WORKDIR /app/logger

COPY logger/package*.json ./
RUN npm ci

COPY logger/ .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/logger

ENV NODE_ENV=production

COPY logger/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/logger/dist ./dist

CMD ["node", "dist/index.js"]
