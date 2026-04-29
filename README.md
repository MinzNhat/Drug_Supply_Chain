# Drug Guard

Hệ thống truy xuất nguồn gốc dược phẩm chống hàng giả dựa trên Blockchain và AI.

Drug Guard kết hợp ba lớp xác thực để bảo vệ chuỗi cung ứng thuốc:

1. **Lớp số** — Protected QR với HMAC token và on-chain digest anchor.
2. **Lớp sổ cái** — Hyperledger Fabric ghi nhận toàn bộ vòng đời lô hàng (tạo, chuyển giao, thu hồi).
3. **Lớp AI** — YOLOv8 phân tích hình ảnh bao bì để phát hiện hàng giả.

---

## Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Mobile/Web)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────────────────┐
│                     Backend API  (:8090)                         │
│  Auth · Batch Lifecycle · Verify · Transfer · Timeline          │
└───────┬───────────────────┬────────────────────┬────────────────┘
        │ Fabric Gateway    │ REST                │ REST
┌───────▼──────┐  ┌─────────▼──────────┐  ┌──────▼──────────────┐
│  Hyperledger │  │  Protected QR Svc  │  │   AI Verify Svc     │
│  Fabric      │  │  (Node + Python)   │  │  (Node + YOLOv8)    │
│  :7051       │  │  :8080 / :8000     │  │  :8701 / :8700      │
└──────────────┘  └──────────────────-─┘  └─────────────────────┘
        │
┌───────▼──────┐
│  MongoDB     │
│  (snapshots, │
│  alerts, geo)│
└──────────────┘
```

## Cấu trúc monorepo

| Thư mục | Mô tả |
| ------- | ----- |
| `backend/` | API chính: auth, quản lý lô hàng, verify, chuyển giao, cảnh báo |
| `blockchain/` | Fabric network, chaincode `drugtracker`, và scripts lifecycle |
| `protected-qr/` | Service tạo/xác thực Protected QR (Node + Python core) |
| `ai-service/` | Service phân tích bao bì bằng YOLOv8 (Node gateway + Python core) |
| `scripts/` | Orchestration trung tâm: stack lifecycle, E2E, quality gate |
| `docs/` | Tài liệu kỹ thuật tập trung |
| `test-output/` | Schema log tiêu chuẩn từ E2E orchestration |

---

## Yêu cầu môi trường

- Docker Desktop (hoặc Docker Engine tương thích) đang chạy
- Bash shell
- Đủ RAM cho Fabric + các service ứng dụng (khuyến nghị ≥ 8 GB)

---

## Lệnh vận hành

Tất cả lệnh chạy từ **thư mục gốc repository**.

### Quản lý stack

```bash
# Cài đặt binaries Fabric và Docker images lần đầu
./scripts/run-all.sh prereq

# Khởi động toàn bộ stack
./scripts/run-all.sh up

# Chạy E2E tests
./scripts/run-all.sh test

# Chạy E2E transfer riêng
./scripts/run-all.sh test-transfer

# Khởi động + test trong một lệnh
./scripts/run-all.sh full

# Kiểm tra trạng thái service
./scripts/run-all.sh status

# Tắt stack
./scripts/run-all.sh down
```

### Quality gate

```bash
# Nhanh: chaincode unit tests + backend unit tests + syntax checks
./scripts/quality-gate.sh quick

# Đầy đủ: quick + E2E tests
./scripts/quality-gate.sh full
```

### Chaincode upgrade (sau khi thay đổi chaincode)

```bash
CC_VERSION=<x> CC_SEQUENCE=<y> ./scripts/blockchain/blockchain-run.sh upgrade
```

---

## Luồng vận hành chuỗi cung ứng

### 1. Sản xuất

1. Nhà sản xuất tạo lô hàng → `POST /api/v1/batches`
2. Protected QR được tạo và gắn vào lô → `POST /api/v1/batches/:id/protected-qr/bind`
3. IPFS CID của tài liệu kỹ thuật được cập nhật → `POST /api/v1/batches/:id/documents`

### 2. Vận chuyển

4. Chuyển giao lô hàng → `POST /api/v1/batches/:id/ship`
5. Nhận lô hàng → `POST /api/v1/batches/:id/receive`
6. Xác nhận giao đến điểm tiêu thụ → `POST /api/v1/batches/:id/confirm-delivered-to-consumption`

### 3. Xác thực (Consumer / Regulator)

7. Quét QR và xác thực → `POST /api/v1/verify`
   - Layer 1: Protected QR HMAC token check
   - Layer 2: On-chain digest match (`VerifyProtectedQR`)
   - Layer 3: AI bao bì analysis nếu có ảnh gói
   - Ghi nhận telemetry scan và cập nhật risk status

### 4. Thu hồi khẩn cấp

8. Regulator thu hồi lô → `POST /api/v1/batches/:id/recall`

---

## Tài liệu kỹ thuật

| Tài liệu | Mô tả |
| -------- | ----- |
| [`docs/README.md`](docs/README.md) | Index toàn bộ tài liệu kỹ thuật |
| [`docs/backend/integration-contract.md`](docs/backend/integration-contract.md) | Mapping endpoint ↔ chaincode + decision contract |
| [`docs/backend/supply-chain-api.md`](docs/backend/supply-chain-api.md) | Schema chi tiết toàn bộ API endpoints |
| [`docs/platform/flow-conformance-matrix.md`](docs/platform/flow-conformance-matrix.md) | Trạng thái triển khai từng bước supply-chain |
| [`docs/platform/unified-api-inventory.md`](docs/platform/unified-api-inventory.md) | Inventory tất cả API public và internal |
| [`docs/blockchain/blockchain-overview.md`](docs/blockchain/blockchain-overview.md) | Kiến trúc Fabric và identity model |

---

## Cấu hình bảo mật cơ bản

Các secrets **không được commit** vào source code. Trước khi chạy:

```bash
# Backend
cp backend/.env.example backend/.env
# Chỉnh sửa JWT_SECRET, MONGO_URI, FABRIC_* paths

# Protected QR
cp protected-qr/.env.example protected-qr/.env
# Chỉnh sửa HMAC_SECRET, MONGO_URI

# AI Service (cần file model)
# Đặt best.pt vào ai-service/models/best.pt
```

---

## Tiêu chuẩn repository

- Root `docker-compose.yml` là stack tích hợp chính thức cho local development.
- Root `scripts/` là interface vận hành chính thức — không bypass qua lệnh thủ công.
- Root `.gitignore` áp dụng cho toàn bộ monorepo.
- Tài liệu tập trung tại `docs/` — không duplicate vào subprojects.
