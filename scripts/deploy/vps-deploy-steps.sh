#!/usr/bin/env bash
# Internal script called by expect

PASSWORD=$1
HOST="52.229.220.194"
USER="minznhat"

echo "Deploying to VPS at ${HOST}..."

# 1. Clean up old network on VPS
ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" << 'EOF'
  # Install Node.js and jq if missing
  if ! command -v node &> /dev/null || ! command -v jq &> /dev/null; then
    echo "Installing pre-requisites (Node.js, jq)..."
    sudo apt-get update
    sudo apt-get install -y jq
    if ! command -v node &> /dev/null; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
  fi

  cd ~/DATN || (mkdir -p ~/DATN && cd ~/DATN)
  if [ -f scripts/run-all.sh ]; then
    ./scripts/run-all.sh down
  fi
  docker system prune -af --volumes
  sudo rm -rf /var/hyperledger/production/*
EOF

# 2. Sync files to VPS
rsync -avz -e "ssh -o StrictHostKeyChecking=no" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'frontend/.next' \
  --exclude 'backend/dist' \
  ./ "${USER}@${HOST}:~/DATN/"

# 3. Start new network and setup admin
ssh -o StrictHostKeyChecking=no "${USER}@${HOST}" << 'EOF'
  cd ~/DATN
  
  # Ensure we have the correct Linux binaries (amd64)
  # Delete existing binaries if they are wrong format
  if [ -d "blockchain/bin" ]; then
    if ! ~/DATN/blockchain/bin/peer version &>/dev/null; then
        echo "Binaries are incorrect format. Re-installing..."
        # Only remove the binaries, keep other stuff like config/
        rm -rf blockchain/bin blockchain/test-network/bin
    fi
  fi

  if [ ! -d "blockchain/bin" ]; then
    echo "Installing Fabric binaries and images..."
    cd blockchain/test-network
    # Use the official install script for Linux (full URL)
    curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/bootstrap.sh | bash -s -- 2.5.15 1.5.17 -s
    cd ../..
    if [ -d "blockchain/test-network/bin" ]; then
        cp -r blockchain/test-network/bin blockchain/bin
    fi
    # Pull missing nodeenv image for JS chaincode
    docker pull hyperledger/fabric-nodeenv:2.5
  fi

  chmod +x scripts/run-all.sh
  chmod +x scripts/blockchain/*.sh
  
  # Ensure binaries are in PATH for the current session
  export PATH=$PATH:$(pwd)/blockchain/bin:$(pwd)/blockchain/test-network/bin
  
  # Install backend dependencies
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..

  # Create .env if missing for setup-admin
  if [ ! -f backend/.env ]; then
    echo "Creating temporary .env for setup..."
    cat > backend/.env <<ENV
MONGO_URI=mongodb://localhost:27017/drug_guard
MONGO_DB=drug_guard
QR_SERVICE_URL=http://localhost:8700
JWT_SECRET=change_me_secret
ENV
  fi

  # Run the stack
  echo "Starting the stack..."
  ./scripts/run-all.sh up || echo "Stack startup had some errors, checking services..."
  
  # Wait for MongoDB
  echo "Waiting for MongoDB to be ready..."
  MAX_RETRIES=60
  COUNT=0
  until docker ps --format '{{.Names}}' | grep -q drug-guard-mongo && docker exec drug-guard-mongo mongosh --eval "db.adminCommand('ping')" &>/dev/null; do
    sleep 5
    COUNT=$((COUNT + 1))
    if [ $COUNT -ge $MAX_RETRIES ]; then
      echo "MongoDB failed to start in time or was not created. Checking docker status..."
      docker ps -a
      docker compose -f docker-compose.yml ps
      exit 1
    fi
    echo "Waiting for MongoDB... ($COUNT/$MAX_RETRIES)"
  done
  
  # Setup admin
  echo "Setting up admin users..."
  ./scripts/run-all.sh setup-admin
EOF

echo "Deployment complete!"
