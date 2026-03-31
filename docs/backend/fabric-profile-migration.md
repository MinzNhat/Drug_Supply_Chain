# Fabric Profile Migration Guide

This guide moves backend Fabric integration from local test-network assumptions to staging/prod-safe configuration.

## Goal

Avoid hard dependency on:

- host.docker.internal endpoints
- blockchain/test-network credential paths

while keeping local developer experience intact.

## New Controls

- FABRIC_PROFILE: local | staging | prod
- FABRIC_PROFILE_FILE: JSON profile path (optional)
- FABRIC_STRICT_CREDENTIALS: startup enforcement toggle

## Recommended Rollout

1. Local baseline

- Keep FABRIC_PROFILE=local
- Keep FABRIC_STRICT_CREDENTIALS=false
- Verify existing local flow still works.

2. Prepare staging profile

- Copy backend/config/fabric-profiles/staging.example.json.
- Replace endpoints, host aliases, MSP IDs, and credential paths.
- Ensure paths point to mounted runtime secrets/volumes.

3. Enforce startup validation

- Set FABRIC_PROFILE=staging.
- Set FABRIC_PROFILE_FILE to your staging JSON file.
- Set FABRIC_STRICT_CREDENTIALS=true.

Backend will fail startup if:

- required org fields are missing
- PEM paths are unreadable
- local-only assumptions are present (host.docker.internal, test-network paths)

4. Production cutover

- Repeat with backend/config/fabric-profiles/prod.example.json as template.
- Keep FABRIC_STRICT_CREDENTIALS=true.

## JSON Profile Shape

{
  "profile": "staging",
  "channelName": "supplychain-staging",
  "chaincodeName": "drugtracker",
  "publicScanRole": "Regulator",
  "organizations": {
    "Manufacturer": {
      "mspId": "ManufacturerMSP",
      "peerEndpoint": "peer0.manufacturer.staging.example.com:7051",
      "peerHostAlias": "peer0.manufacturer.staging.example.com",
      "tlsCertPath": "/etc/hyperledger/fabric/manufacturer/tls/ca.crt",
      "certPath": "/etc/hyperledger/fabric/manufacturer/signcerts/cert.pem",
      "keyPath": "/etc/hyperledger/fabric/manufacturer/keystore"
    }
  }
}

## Notes

- Environment variables FABRIC_<ROLE>_* override JSON profile values.
- Profile mismatch between FABRIC_PROFILE and JSON profile field will fail startup.
- Local profile files are examples; do not store production private keys in git.
