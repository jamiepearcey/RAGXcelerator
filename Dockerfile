# Build stage
FROM node:16-alpine AS builder
WORKDIR /build
COPY package*.json ./
COPY . .
RUN npm install && npm run build

# Run stage
FROM node:16-alpine
WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY package.json ./
RUN npm install --omit=dev
CMD ["npm", "start"] 