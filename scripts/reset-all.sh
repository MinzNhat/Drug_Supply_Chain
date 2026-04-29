#!/bin/bash
# scripts/reset-all.sh

echo "----------------------------------------------------------"
echo "PHASE 1: STOPPING APPLICATION AND CLEANING VOLUMES"
echo "----------------------------------------------------------"
echo "----------------------------------------------------------"
echo "PHASE 1: TEARING DOWN CURRENT STACK"
echo "----------------------------------------------------------"
./scripts/run-all.sh down

echo "----------------------------------------------------------"
echo "PHASE 2-5: INITIALIZING FULL STACK (FABRIC + APP + ORG3)"
echo "----------------------------------------------------------"
# This script handles blockchain-run.sh full, addOrg3, and docker-compose up
./scripts/run-all.sh up

echo "----------------------------------------------------------"
echo "PHASE 6: INITIALIZING DATABASE, ADMIN USER AND PROVINCES"
echo "----------------------------------------------------------"
# Use the project's setup-admin command
./scripts/run-all.sh setup-admin

echo "Seeding province data..."
docker exec drug-guard-backend node /app/scripts/seed-provinces.mjs

echo "----------------------------------------------------------"
echo "SYSTEM RESET COMPLETED SUCCESSFULLY!"
echo "You can now login with: admin_yte / Admin@2004"
echo "----------------------------------------------------------"
