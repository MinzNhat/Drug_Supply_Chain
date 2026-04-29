FROM node:18-alpine
RUN apk add --no-cache bash docker-cli docker-compose curl openssl libc6-compat tar gzip jq
# Download Fabric binaries for Linux ARM64
RUN cd /tmp && curl -sSL https://github.com/hyperledger/fabric/releases/download/v2.5.15/hyperledger-fabric-linux-arm64-2.5.15.tar.gz | tar xz && \
    mv bin/* /usr/local/bin/ && rm -rf bin config
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY scripts/backend ./scripts/backend
# Ensure scripts directory exists
RUN mkdir -p /app/scripts
CMD ["node", "src/server.js"]
