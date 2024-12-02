# Build stage
FROM node:16-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:16-alpine
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
CMD ["npm", "start"] 