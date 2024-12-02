# Build stage
FROM node:20-slim as builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

WORKDIR /app

# Copy package files and npmrc
COPY package.json pnpm-lock.yaml .npmrc ./

# Install dependencies with network timeout and retry settings
RUN pnpm install --frozen-lockfile --network-timeout 100000 --retry 3

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM node:20-slim as production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

WORKDIR /app

# Copy package files and npmrc
COPY package.json pnpm-lock.yaml .npmrc ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --network-timeout 100000 --retry 3

# Copy built application from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["pnpm", "start"] 