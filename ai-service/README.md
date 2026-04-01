# AI Appearance Verification Service

This service provides visual packaging verification for DrugGuard.
It follows the same split pattern as Protected QR:

- Node API gateway (`ai-service`): stable `/api/v1/verify` contract for backend.
- Python core (`ai-python-core`): YOLO inference runtime.

## What It Does

- Accepts one packaging image (`multipart/form-data`, field `image`).
- Runs YOLO inference using a custom model (`best.pt`).
- Applies strict decision policy for regulated supply-chain checks:
  - Reject when counterfeit score crosses threshold.
  - Reject when authentic evidence is below minimum threshold.
- Returns backend-compatible decision payload:
  - `accepted`
  - `is_authentic`
  - `confidence_score`
  - `verdict`
  - `detections`

## API Contract

Node API gateway endpoints:

- `GET /health`
- `POST /api/v1/verify`

Python core endpoints:

- `GET /health`
- `POST /verify`

`POST /verify` response example:

```json
{
  "accepted": true,
  "is_authentic": true,
  "confidence_score": 0.84,
  "verdict": "AUTHENTIC",
  "decision_reason": "authentic_signal_confirmed",
  "counterfeit_min_score": 0.6,
  "authentic_min_score": 0.75,
  "counterfeit_score": 0.11,
  "authentic_score": 0.84,
  "detections": [
    {
      "label": "authentic",
      "confidence": 0.84,
      "bbox": [120.5, 80.2, 540.3, 610.1]
    }
  ],
  "model_path": "/models/best.pt",
  "latency_ms": 42.6
}
```

## Model Input

Place your trained YOLO weights at:

- `ai-service/models/best.pt`

The root docker-compose mounts this path into the container at `/models/best.pt`.

## Environment Variables

See `.env.example`.

Node API values:

- `PORT`
- `PYTHON_SERVICE_URL`
- `REQUEST_TIMEOUT_MS`

Python core values:

- `AI_MODEL_PATH`
- `AI_INFERENCE_DEVICE`
- `AI_INFERENCE_IMG_SIZE`
- `AI_CONFIDENCE_THRESHOLD`
- `AI_COUNTERFEIT_MIN_SCORE`
- `AI_AUTHENTIC_MIN_SCORE`
- `AI_COUNTERFEIT_LABELS`
- `AI_AUTHENTIC_LABELS`

## Run Locally

### Option 1: Docker compose (recommended)

```bash
cd ai-service
docker compose up -d --build
```

### Option 2: Run manually

Terminal 1 (Python core):

```bash
cd ai-service/python-core
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8700
```

Terminal 2 (Node API gateway):

```bash
cd ai-service
npm install
npm run dev
```

## Notes About Your Colab Training Flow

Your Colab notebook can continue to be used for dataset download/training/validation.
After training, export `best.pt` and copy it into `ai-service/models/best.pt` so the service can serve real inference.
