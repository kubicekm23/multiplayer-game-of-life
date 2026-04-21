# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

# 1. Copy the compiled JS
COPY --from=builder /app/dist ./dist

# 2. ADD THIS: Copy your views and public folders
COPY views ./views
# COPY public ./public (Uncomment if you have a public folder)

EXPOSE 3000

CMD ["node", "dist/index.js"]