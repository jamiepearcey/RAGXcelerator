# Build stage
FROM node:16-alpine AS builder

# Add build arguments
ARG NODE_ENV=production

# Add build-time dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /build

# Set environment variables
ENV NODE_ENV=${NODE_ENV}
ENV NPM_CONFIG_LOGLEVEL=warn

# Copy package files
COPY package.json ./

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:16-alpine

# Runtime environment variables
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY package.json ./

EXPOSE ${PORT}
CMD ["npm", "start"] 