# Documentation Index

Centralized technical documentation for the Drug Guard supply-chain platform.

## Platform

| File | Description |
| ---- | ----------- |
| [`platform/flow-conformance-matrix.md`](platform/flow-conformance-matrix.md) | Maps every supply-chain diagram step to its implementation and status |
| [`platform/unified-api-inventory.md`](platform/unified-api-inventory.md) | Registry of all public and internal API endpoints across all services |

## Backend

| File | Description |
| ---- | ----------- |
| [`backend/integration-contract.md`](backend/integration-contract.md) | Endpoint-to-chaincode mapping, decision contracts, and error/naming policy |
| [`backend/supply-chain-api.md`](backend/supply-chain-api.md) | Detailed request/response schema for every supply-chain API endpoint |
| [`backend/environment-variables.md`](backend/environment-variables.md) | All backend environment variables with type, default, and required status |

## Blockchain

| File | Description |
| ---- | ----------- |
| [`blockchain/blockchain-overview.md`](blockchain/blockchain-overview.md) | Fabric network topology, MSP identity model, and operational lifecycle |
| [`blockchain/asset-transfer-drug-architecture-and-dev-guide.md`](blockchain/asset-transfer-drug-architecture-and-dev-guide.md) | Chaincode architecture, contract methods, and local development guide |

## Protected QR Service

| File | Description |
| ---- | ----------- |
| [`protected-qr/service-overview.md`](protected-qr/service-overview.md) | QR generation/verification architecture, token format, and confidence policy |
| [`protected-qr/swagger.yaml`](protected-qr/swagger.yaml) | OpenAPI 3 spec for Protected QR Node API |
| [`protected-qr/README-DO-AN-PROTECTED-QR.md`](protected-qr/README-DO-AN-PROTECTED-QR.md) | Project-specific deep-dive into the Protected QR module |

## AI Verification Service

| File | Description |
| ---- | ----------- |
| [`ai-service/service-overview.md`](ai-service/service-overview.md) | YOLO inference pipeline, decision thresholds, and integration contract |
| [`ai-service/swagger.yaml`](ai-service/swagger.yaml) | OpenAPI 3 spec for AI Service Node gateway |
| [`ai-service/README-DO-AN-AI-SERVICE.md`](ai-service/README-DO-AN-AI-SERVICE.md) | Project-specific deep-dive into the AI verification module |
