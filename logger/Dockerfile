# Multi-stage Dockerfile for System Logger Microservice
FROM node:20-alpine AS builder
WORKDIR /app/logger

COPY logger/package*.json ./
COPY logger/prisma.config.ts ./
COPY logger/prisma ./prisma
RUN npm install

COPY logger/ .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/logger

ENV NODE_ENV=production

COPY logger/package*.json ./
COPY logger/prisma.config.ts ./
COPY logger/prisma ./prisma
RUN npm install --only=production
RUN npx prisma generate

COPY --from=builder /app/logger/dist ./dist
COPY --from=builder /app/logger/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/logger/node_modules/@prisma ./node_modules/@prisma

CMD ["node", "dist/index.js"]
