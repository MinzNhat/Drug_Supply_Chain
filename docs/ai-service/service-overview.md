# AI Service

[![status: stable](https://img.shields.io/badge/status-stable-1f7a1f)](.)
[![scope: ai-service](https://img.shields.io/badge/scope-ai--service-2b4c7e)](.)

DrugGuard AI appearance service validates product packaging images for counterfeit risk.

## Architecture

- Node API gateway (`ai-service`): stable REST contract for backend and clients.
- Python core (`ai-python-core`): YOLO inference runtime.
- Model volume: `ai-service/models/best.pt` mounted read-only.

## Key Guarantees

- Verify endpoint accepts one multipart image (`image`).
- Response always includes `accepted`, `confidence_score`, and `verdict`.
- Strict policy defaults for regulated supply-chain screening:
  - `AI_CONFIDENCE_THRESHOLD=0.5`
  - `AI_COUNTERFEIT_MIN_SCORE=0.6`
  - `AI_AUTHENTIC_MIN_SCORE=0.75`

## API Overview

- `GET /health`
- `POST /api/v1/verify`

Swagger spec: [swagger.yaml](swagger.yaml)

## Verify Response Example

```json
{
  "accepted": false,
  "is_authentic": false,
  "confidence_score": 0.81,
  "verdict": "SUSPICIOUS",
  "decision_reason": "counterfeit_signal_detected",
  "counterfeit_min_score": 0.6,
  "authentic_min_score": 0.75,
  "counterfeit_score": 0.81,
  "authentic_score": 0.22,
  "detections": [
    {
      "label": "counterfeit",
      "confidence": 0.81,
      "bbox": [102.4, 88.1, 560.2, 690.7]
    }
  ],
  "model_path": "/models/best.pt",
  "latency_ms": 38.4
}
```

## Runtime Dependencies

- Node.js 18+
- Python 3.10+
- Docker + Docker Compose

## Local Run

```bash
cd ai-service
npm install
npm run dev
```

Python core in separate terminal:

```bash
cd ai-service/python-core
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8700
```

## Test Commands

Node gateway unit tests:

```bash
cd ai-service
npm test
```

Python decision policy tests:

```bash
cd ai-service
npm run test:policy
```
