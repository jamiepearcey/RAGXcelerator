# Build stage
FROM node:18-alpine AS builder
WORKDIR /build
COPY package*.json ./
COPY . .
RUN npm install && npm run build

# Run stage
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY package.json ./
RUN npm install --omit=dev
CMD ["npm", "start"] 