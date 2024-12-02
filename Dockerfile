# Build stage
FROM node:20-slim as builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build application
RUN pnpm build

# Production stage
FROM node:20-slim as production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.4 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built application from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["pnpm", "start"] 