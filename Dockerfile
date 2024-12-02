# Build stage
FROM node:16-alpine AS builder
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate
WORKDIR /build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN pnpm run build

# Production stage
FROM node:16-alpine
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
CMD ["pnpm", "start"] 