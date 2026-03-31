# Protected QR Service

[![status: stable](https://img.shields.io/badge/status-stable-1f7a1f)](.)
[![scope: protected-qr](https://img.shields.io/badge/scope-protected--qr-2b4c7e)](.)

Fixed-Geometry Physical-Digital QR Generator. This service creates a deterministic, copy-sensitive QR with an embedded center pattern and returns a Base64 PNG for client-side rendering or storage. The geometry is fixed to preserve Error Correction Level H compatibility.

## Key Guarantees

- Payload structure is fixed to 34 bytes.
- Token length is ~81 chars: Base64Url(48) + "." + HMAC(32).
- Output QR size is 600x600 px with border=1.
- Center pattern crop for verification is 154x154 px.
- Verification thresholds: authentic > 0.70, fake < 0.55.

## Visual Demos

The service embeds a unique, copy-sensitive "Center Pattern" into a standard QR code. This pattern acts as a physical-digital fingerprint, distinguishing it from standard, easily copyable QRs.

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="assets/qr-sample.png" width="250" alt="Standard Standard QR Code">
        <br />
        <sub><b>Figure 1A: Standard Generic QR</b><br>(Easily cloned)</sub>
      </td>
      <td align="center">
        <img src="assets/qr-service-sample.png" width="250" alt="Protected QR with Center Pattern">
        <br />
        <sub><b>Figure 1B: Protected QR</b><br>(Copy-sensitive embedded pattern)</sub>
      </td>
    </tr>
  </table>
</div>

## Architecture

- **Node.js API**: REST interface, validation, token packing, audit storage.
- **Python Core**: Stateless QR generator and verifier using Base64 I/O.
- **MongoDB**: Audit and verification logs.

## Project Layout

```
protected-qr-service/
    docker/
        Dockerfile.node
        Dockerfile.python
    python-core/
        app.py
        qr_center.py
        qr_decoder.py
        qr_protected.py
        requirements.txt
    src/
        config/
        controllers/
        dtos/
        middleware/
        routes/
        services/
        utils/
    docker-compose.yml
    swagger.yaml
    README.md
```

## API Overview

- `POST /api/v1/qr/generate`
- `POST /api/v1/qr/verify`
- `GET /health`

Swagger spec: [swagger.yaml](swagger.yaml)

## Hex Input Format

All input fields must be hex strings of fixed length:

- `data_hash`: 8 hex chars (4 bytes)
- `metadata_series`: 16 hex chars (8 bytes)
- `metadata_issued`: 16 hex chars (8 bytes)
- `metadata_expiry`: 16 hex chars (8 bytes)

Example conversion guide:

- 4 bytes (8 hex chars): `a1b2c3d4`
- 8 bytes (16 hex chars): `1234567890abcdef`

## Generate Example

```json
{
    "data_hash": "a1b2c3d4",
    "metadata_series": "1234567890abcdef",
    "metadata_issued": "0011223344556677",
    "metadata_expiry": "8899aabbccddeeff"
}
```

## Verify Example

`POST /api/v1/qr/verify` with multipart form-data field `image`.

## Response Shapes

Success response:

```json
{
    "success": true,
    "data": {
        "token": "base64url.payload.hmac",
        "qr_image_base64": "iVBORw0..."
    }
}
```

Verification response:

```json
{
    "token": "base64url.payload.hmac",
    "is_authentic": true,
    "confidence_score": 0.85,
    "decoded_meta": {
        "data_hash": "a1b2c3d4",
        "metadata_series": "1234567890abcdef",
        "metadata_issued": "0011223344556677",
        "metadata_expiry": "8899aabbccddeeff"
    }
}
```

Error response:

```json
{
    "success": false,
    "error": {
        "code": "BAD_REQUEST",
        "message": "Invalid request body",
        "trace_id": "4f838f6f-5a6e-4f9d-9f73-7c8152f0249d",
        "details": {
            "errors": {
                "data_hash": ["Required"]
            }
        }
    }
}
```

## Requirements

- Docker + Docker Compose
- Node.js 18+
- Python 3.9+

## Deployment

```bash
docker-compose up -d --build
```

Services:

- API: http://localhost:8080
- Python core: http://localhost:8000
- MongoDB: mongodb://localhost:27017

## Installation

```bash
cd protected-qr-service
npm install
```

## Run (Production)

```bash
cd protected-qr-service
npm run build
npm run start
```

## Run (Development)

Terminal 1 (Node API):

```bash
cd protected-qr-service
npm run dev
```

Terminal 2 (Python core):

```bash
cd protected-qr-service/python-core
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## API Examples

Generate:

```bash
curl -X POST http://localhost:8080/api/v1/qr/generate \
    -H "Content-Type: application/json" \
    -d '{
        "data_hash": "a1b2c3d4",
        "metadata_series": "1234567890abcdef",
        "metadata_issued": "0011223344556677",
        "metadata_expiry": "8899aabbccddeeff"
    }'
```

Verify:

```bash
curl -X POST http://localhost:8080/api/v1/qr/verify \
    -F "image=@/path/to/qr.png"
```

## Observability

- Structured logs are emitted as JSON via Winston.
- HTTP access logs use Morgan and flow into Winston.
- Use your platform log aggregator (e.g., ELK, CloudWatch, Stackdriver) for indexing.

## Environment Variables

See [.env.example](.env.example).

| Name                 | Required | Description                           |
| -------------------- | -------- | ------------------------------------- |
| `PORT`               | Yes      | API HTTP port.                        |
| `MONGO_URI`          | Yes      | MongoDB connection string.            |
| `MONGO_DB`           | Yes      | MongoDB database name.                |
| `PYTHON_SERVICE_URL` | Yes      | Base URL for the Python core service. |
| `HMAC_SECRET`        | Yes      | HMAC secret for token signing (or use `HMAC_SECRET_FILE`). |
| `HMAC_SECRET_FILE`   | No       | File path containing HMAC secret.     |
| `LOG_LEVEL`          | No       | Log level for structured output.      |
| `REQUEST_TIMEOUT_MS` | No       | Timeout for Python core requests.     |

## Operational Notes

- The QR geometry and thresholds are contract-bound and should not be modified.
- The Python core is stateless and uses Base64 I/O only.
- MongoDB stores audit logs and verification results for compliance.

## Troubleshooting

- If verification returns zero confidence, check image quality and ensure the QR is not cropped.
- If the Python core fails to start, verify dependencies in [python-core/requirements.txt](python-core/requirements.txt).
- If generate requests time out, increase `REQUEST_TIMEOUT_MS` in the environment.

## Security Considerations

- Rotate `HMAC_SECRET` regularly in production.
- Place the API behind TLS and a rate limiter.
- Use a private network for internal Python core access.

## Bug Reports

Found a bug? Please open an issue at [GitHub Issues](https://github.com/MinzNhat/Protected_QR/issues/new).

## Feature Requests

Have an idea for a new feature? Submit it at [GitHub Issues](https://github.com/MinzNhat/Protected_QR/issues/new).

## License

This project is licensed under the MIT License - see `docs/legal/protected-qr-license.txt` for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/MinzNhat/Protected_QR/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MinzNhat/Protected_QR/discussions)
- **Email**: nhat.dang2004.cv@gmail.com

---

<div align="center">
  <p>Made with care by MinzNhat</p>
  <p>
    <a href="https://github.com/MinzNhat/Protected_QR">Star us on GitHub</a> •
    <a href="https://yourdomain.com">Visit Website</a>
  </p>
</div>
