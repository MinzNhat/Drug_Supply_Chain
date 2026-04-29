#!/usr/bin/env bash
# Usage: ./scripts/deploy/vps-deploy.sh <password>

PASSWORD=$1
HOST="52.229.220.194"
USER="minznhat"

echo "Deploying to VPS at ${HOST}..."

# 1. Clean up old network on VPS
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" << 'EOF'
  cd ~/DATN || (mkdir -p ~/DATN && cd ~/DATN)
  if [ -f scripts/run-all.sh ]; then
    ./scripts/run-all.sh down
  fi
  docker system prune -af --volumes
  sudo rm -rf /var/hyperledger/production/*
EOF

# 2. Sync files to VPS
# We exclude node_modules and other large/unnecessary files
sshpass -p "${PASSWORD}" rsync -avz -e "ssh -o StrictHostKeyChecking=no" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'frontend/.next' \
  --exclude 'backend/dist' \
  ./ "${USER}@${HOST}:~/DATN/"

# 3. Start new network and setup admin
sshpass -p "${PASSWORD}" ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" << 'EOF'
  cd ~/DATN
  chmod +x scripts/run-all.sh
  chmod +x scripts/blockchain/*.sh
  ./scripts/run-all.sh up
  ./scripts/run-all.sh setup-admin
EOF

echo "Deployment complete!"
