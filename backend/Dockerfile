FROM node:18-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY scripts/backend ./scripts/backend
CMD ["node", "src/server.js"]
