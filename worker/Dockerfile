# Multi-stage Dockerfile for Worker Microservice with FFmpeg & Sharp
FROM node:20-alpine AS builder
WORKDIR /app/worker

COPY worker/package*.json ./
COPY worker/prisma ./prisma
COPY worker/prisma.config.ts ./

RUN npm ci
RUN npx prisma generate

COPY worker/ .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/worker

RUN apk add --no-cache ffmpeg libc6-compat

ENV NODE_ENV=production

COPY worker/package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/worker/dist ./dist
COPY --from=builder /app/worker/prisma ./prisma
COPY --from=builder /app/worker/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/worker/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/worker/node_modules/@prisma ./node_modules/@prisma

CMD ["node", "dist/index.js"]
