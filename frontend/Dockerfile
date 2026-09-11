FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:latest AS runner
WORKDIR /public
COPY --from=builder /app/dist /public
CMD ["sh", "-c", "rm -rf /dist-target/* && cp -rf /public/* /dist-target/ && echo 'Frontend dist copied successfully'"]
