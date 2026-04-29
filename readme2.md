# Drug Guard — Tài Liệu Kỹ Thuật Toàn Diện

> **Vai trò:** Solution Architect & Senior Developer  
> **Mục đích:** Phục vụ bảo vệ luận văn, phản biện kỹ thuật, và tích hợp Frontend  
> **Ngày:** 2026-04-20 | **Test baseline:** 72/72 PASS

---

## 1. Thẩm Định & Chốt MVP

### 1.1 Kết Luận

**Hệ thống Drug Guard đã đủ điều kiện vận hành thực tế ở mức MVP.**

Tất cả luồng nghiệp vụ cốt lõi của một chuỗi cung ứng dược phẩm đã được triển khai đầy đủ, kiểm thử tự động (72/72 test), và pipeline E2E hoạt động được.

### 1.2 Giá Trị Hệ Thống

| Tính năng | Trạng thái | Giá trị thực tiễn |
|-----------|------------|-------------------|
| Tạo lô thuốc + gắn QR bảo mật | ✅ Production-ready | Manufacturer phát hành lô với QR không thể làm giả |
| Xác minh QR + AI packaging | ✅ Production-ready | Người dùng cuối scan QR, AI kiểm tra bao bì vật lý |
| Theo dõi chuyển giao hàng hóa | ✅ Production-ready | Ship → Receive → Confirm với audit trail bất biến |
| Phát hiện QR bất thường (scan threshold) | ✅ Production-ready | Cảnh báo khi QR bị scan quá mức (dấu hiệu giả mạo) |
| Thu hồi khẩn cấp (Regulator) | ✅ Production-ready | Cơ quan quản lý thu hồi lô thuốc ngay lập tức |
| Quản lý tài liệu (IPFS/CID) | ✅ Production-ready | GMP, nhãn mác được neo CID lên ledger |
| Dashboard cảnh báo (Regulator) | ✅ Production-ready | Lịch sử cảnh báo, export CSV/JSON |
| Protected QR chống sao chép vật lý | ✅ Production-ready | Pattern trung tâm QR phân biệt bản gốc vs photocopy |
| AI phát hiện bao bì giả (YOLOv8) | ⚠️ Chờ model `best.pt` | Cần chạy lại Colab để export weights |
| Heatmap địa lý | ✅ Production-ready | Visualize điểm nóng scan bất thường theo khu vực |

### 1.3 Điểm Khác Biệt So Với Hệ Thống Thông Thường

Drug Guard **không chỉ là một QR tracking app**. Sự khác biệt kỹ thuật cốt lõi:

1. **Bất biến (Immutability):** Mọi sự kiện ghi lên Hyperledger Fabric — không ai, kể cả admin hệ thống, có thể xóa hoặc sửa lịch sử giao dịch.
2. **Phi tập trung (Decentralization):** Ba tổ chức (Manufacturer, Distributor, Regulator) mỗi bên giữ một bản sao ledger độc lập — không có điểm thất bại đơn lẻ (SPOF).
3. **Xác thực đa lớp:** QR layer (physical copy-detection) + AI layer (packaging appearance) + Blockchain layer (scan telemetry) hoạt động song song.
4. **Chuỗi ký số:** Mọi giao dịch được ký bằng private key của từng tổ chức — không thể giả mạo danh tính.

---

## 2. Kiến Trúc Tổng Thể (System Architecture)

### 2.1 High-Level Architecture

Drug Guard áp dụng kiến trúc **Hybrid: Microservices + Layered Architecture**.

- Ở cấp độ **liên service**: Microservices (Backend, Protected QR, AI Service, Fabric Network) — độc lập về runtime, deploy, và scale.
- Ở cấp độ **nội bộ Backend**: Layered Architecture nghiêm ngặt — Controller → Service → Repository → Integration.

```mermaid
graph TB
    subgraph "Người dùng"
        MFG[Manufacturer<br/>Nhà sản xuất]
        DIST[Distributor<br/>Nhà phân phối]
        PUB[Public / Pharmacist<br/>Người tiêu dùng]
        REG[Regulator<br/>Cơ quan quản lý]
    end

    subgraph "Backend API — Node.js/Express :8090"
        AUTH[Auth Module<br/>/api/v1/auth]
        PROD[Product Module<br/>/api/v1/batches]
        RGLT[Regulator Module<br/>/api/v1/regulator]
        SCS[SupplyChainService<br/>Orchestrator]
        QRS[QrService]
        AIS[AiVerifierService]
        ALRT[AlertService]
    end

    subgraph "Protected QR Service — Node + Python"
        QRNODE[qr-service<br/>:8080]
        QRPY[qr-python-core<br/>FastAPI :8000]
    end

    subgraph "AI Service — Node + Python"
        AINODE[ai-service<br/>:8700]
        AIPY[ai-python-core<br/>FastAPI / YOLOv8 :8701]
    end

    subgraph "Blockchain — Hyperledger Fabric"
        ORG1[Org1 — RegulatorMSP<br/>peer0.org1 :7051]
        ORG2[Org2 — ManufacturerMSP<br/>peer0.org2 :9051]
        ORG3[Org3 — DistributorMSP<br/>peer0.org3 :11051]
        CC[Chaincode: drugtracker<br/>channel: mychannel]
        ORD[Orderer Cluster<br/>3x EtcdRaft :7050/:8050/:9050]
    end

    subgraph "Storage"
        MONGO[(MongoDB<br/>drug_guard)]
        IPFS[(IPFS / Pinata<br/>document CID)]
    end

    MFG -->|Auth| AUTH
    MFG -->|Manage Batches| PROD
    DIST -->|Auth| AUTH
    DIST -->|Transfer| PROD
    PUB -->|Scan QR| PROD
    REG -->|Auth| AUTH
    REG -->|Audit & Alert| RGLT

    PROD --> SCS
    RGLT --> SCS
    SCS --> QRS --> QRNODE --> QRPY
    SCS --> AIS --> AINODE --> AIPY
    SCS --> ALRT
    SCS -->|Fabric Gateway gRPC + TLS| CC
    CC --- ORG1 & ORG2 & ORG3
    ORG1 & ORG2 & ORG3 -->|Raft consensus| ORD

    SCS -->|BatchState write-through cache| MONGO
    SCS -->|document CID| IPFS
```

---

### 2.2 Giao Thức Giao Tiếp Giữa Các Thành Phần

| Từ | Đến | Protocol | Ghi chú |
|---|---|---|---|
| Browser / Mobile | Backend :8090 | HTTPS / REST + JWT | Stateless, Bearer token |
| Backend | Protected QR :8080 | HTTP / REST + JSON | Internal network |
| Backend | AI Service :8700 | HTTP / REST + multipart | packagingImage field |
| Backend | Fabric Peer | gRPC + TLS + ECDSA | Fabric Gateway SDK |
| QR Node :8080 | QR Python :8000 | HTTP / REST | Docker internal |
| AI Node :8700 | AI Python :8701 | HTTP / REST | Docker internal |
| Backend | MongoDB :27017 | Mongoose / TCP | BatchState cache, alerts |
| Backend | IPFS / Pinata | HTTPS / REST | document CID anchor |
| Fabric Peer | Fabric Orderer | gRPC — EtcdRaft | Block ordering & consensus |
| Peer ↔ Peer | Gossip | gRPC + TLS | Block distribution |

> **Không có Message Queue (Kafka/RabbitMQ):** Alert dispatch là fire-and-forget async (`void Promise`). Dead-letter queue được implement bằng MongoDB `AlertDeadLetter` collection — đủ cho MVP scale.

---

### 2.3 Luồng Dữ Liệu Đầy Đủ — Từ FE Button đến Ledger

**Ví dụ: Manufacturer nhấn "Tạo lô thuốc mới" → `POST /api/v1/batches`**

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant MW as Middleware Chain
    participant CTL as ProductController
    participant SVC as SupplyChainService
    participant QR as QR Service :8080
    participant FAB as Hyperledger Fabric
    participant DB as MongoDB

    FE->>MW: POST /api/v1/batches<br/>Bearer JWT + {drugName, quantity, expiryDate}
    Note over MW: T=1ms
    MW->>MW: requestContextMiddleware → generate traceId
    MW->>MW: authMiddleware → jwt.verify() → req.user
    MW->>MW: requireRoleMiddleware("Manufacturer") → pass
    MW->>CTL: next()

    Note over CTL: T=2ms
    CTL->>CTL: Zod validate body
    CTL->>SVC: createBatch(input, actor)

    Note over SVC: T=3ms
    SVC->>SVC: generateBatchId() → "BATCH_1745134287_A3F"
    SVC->>SVC: hashBatchId() → dataHash [8-char sha256]
    SVC->>SVC: randomBytes(8) → metadataSeries
    SVC->>QR: POST /api/v1/qr/generate<br/>{dataHash, series, issued, expiry}

    Note over QR: T=15ms
    QR->>QR: Python: build 34-byte payload
    QR->>QR: Python: generate QR 600×600 ECL=H
    QR->>QR: Python: inject center pattern 154×154px
    QR->>QR: Node: HMAC-SHA256(payload, secret) = token
    QR-->>SVC: {token, qrImageBase64}

    Note over SVC: T=80ms
    SVC->>SVC: sha256(token) = tokenDigest
    SVC->>FAB: submit("CreateBatchWithExpiry", [...args])

    Note over FAB: T=84ms → ~2400ms
    FAB->>FAB: ECDSA sign proposal (ManufacturerMSP key)
    FAB->>FAB: Peer endorse → execute chaincode
    FAB->>FAB: Submit RWSet → Orderer EtcdRaft
    FAB->>FAB: Raft quorum (2/3) → new block
    FAB->>FAB: Block broadcast → all peers commit
    FAB-->>SVC: commitStatus = SUCCESS

    SVC->>FAB: submit("BindProtectedQR", [tokenDigest])
    FAB-->>SVC: SUCCESS
    SVC->>FAB: evaluate("ReadBatch", [batchID])
    FAB-->>SVC: batch JSON
    SVC->>DB: BatchState.findOneAndUpdate() — write-through cache

    SVC-->>FE: HTTP 201 {batch, tokenDigest, qrImageBase64}
    Note over FE: T=~2500ms — FE render QR image để in lên bao bì
```

---

### 2.4 Fabric Transaction Consensus — EtcdRaft Internals

```mermaid
graph LR
    BE["Backend API<br/>(Node.js)<br/>ManufacturerMSP Key"]
    P2["Peer Node<br/>peer0.manufacturer :9051<br/>Chaincode Container"]
    ORD["Orderer Cluster<br/>3 Nodes EtcdRaft<br/>:7050 / :8050 / :9050"]
    ALL["All Peers<br/>peer0.regulator<br/>peer0.distributor<br/>peer0.manufacturer"]

    BE -->|"① ECDSA-sign proposal"| P2
    P2 -->|"② Execute chaincode<br/>putState() → RWSet"| P2
    P2 -->|"③ Signed RWSet<br/>(Endorsement)"| ORD
    ORD -->|"④ Raft consensus<br/>leader + 2/3 quorum → block"| ORD
    ORD -->|"⑤ Block broadcast<br/>(Gossip)"| ALL
    ALL -->|"⑥ Validate + commit ledger"| ALL
    ALL -->|"⑦ commitStatus SUCCESS"| BE
```

> **EtcdRaft vs PoW:** Không có mining, không tốn năng lượng. Finality ngay lập tức. Quorum = ⌊n/2⌋ + 1 = **2 trong 3 orderers**.

---

## 3. Thiết Kế Chi Tiết Service & Module (Service Blueprint)

### 3.1 Backend Service — Kiến Trúc Nội Tại

```mermaid
graph TB
    subgraph "Bootstrap Layer — app.js"
        B1[helmet]
        B2["cors(configurable origins)"]
        B3[requestContextMiddleware]
        B4["express.json({limit:2mb})"]
        B5["authRateLimiter (10req/min/IP)"]
        B6["multer (multipart — QR + AI image)"]
    end

    subgraph "Routes Layer"
        R1["/api/v1/auth/*<br/>authRoutes"]
        R2["/api/v1/batches/*<br/>productRoutes"]
        R3["/api/v1/regulator/*<br/>regulatorRoutes"]
        RG["[authMiddleware + requireRoleMiddleware<br/>per route]"]
    end

    subgraph "Controllers Layer"
        C1["AuthController<br/>register() login() refresh()"]
        C2["ProductController<br/>createBatch() verifyBatch() shipBatch()<br/>receiveBatch() recallBatch() readProtectedQr()..."]
        C3["RegulatorAlertsController<br/>listAlerts() exportReport()"]
    end

    subgraph "Services Layer"
        S1["SupplyChainService (orchestrator)<br/>ledgerRepository · qrService · aiVerifierService<br/>alertArchiveRepo · alertDeliveryService<br/>documentStorageAdapter · documentArtifactRepo"]
        S2["RegulatorAlertsService<br/>alertArchiveRepository"]
        S3["AlertDeliveryService<br/>retry 3x + exponential backoff + dead-letter"]
    end

    subgraph "Repositories Layer"
        RP1["FabricLedgerRepository<br/>DisabledLedgerRepository (fallback)"]
        RP2["AlertArchiveRepo · AlertDeliveryRepo<br/>AlertDeadLetterRepo · DocumentArtifactRepo"]
        RP3["BatchState · BatchIndex (MongoDB models)"]
    end

    subgraph "Integrations Layer"
        I1["FabricGatewayClient<br/>gRPC session pool · ECDSA sign · audit trail"]
        I2["AlertSinkAdapter<br/>Logger Sink | Webhook Sink"]
        I3["DocumentStorageAdapter<br/>Mock | Kubo (IPFS) | Pinata"]
    end
```

---

### 3.2 Module Connection — Auth ↔ User

```mermaid
graph TB
    subgraph "Register Flow"
        REG1["POST /auth/register<br/>{username, password, role, mspId}"]
        REG2["Zod validate + superRefine<br/>isMspIdForRole() check"]
        REG3["User.findOne(username)<br/>→ duplicate check [MongoDB]"]
        REG4["bcrypt.hash(password, rounds=12)<br/>~300ms — brute-force safe"]
        REG5["User.create({username, passwordHash,<br/>role, mspId, distributorUnitId})"]
        REG6["Response: {id, username, role}<br/>passwordHash KHÔNG bao giờ trả về"]

        REG1 --> REG2 --> REG3 --> REG4 --> REG5 --> REG6
    end

    subgraph "Login Flow"
        LOG1["POST /auth/login<br/>{username, password}"]
        LOG2["User.findOne(username)<br/>→ fetch with passwordHash"]
        LOG3["bcrypt.compare(plaintext, hash)<br/>timing-safe"]
        LOG4["jwt.sign({userId, role, mspId,<br/>distributorUnitId}, secret, {expiresIn:8h})"]
        LOG5["Response: {token}"]

        LOG1 --> LOG2 --> LOG3 --> LOG4 --> LOG5
    end

    subgraph "Per-Request Auth — Stateless"
        AU1["Header: Bearer eyJhbGc..."]
        AU2["jwt.verify(token, secret)<br/>→ NO DB query"]
        AU3["normalizeRole() + normalizeMspId()"]
        AU4["isMspIdForRole() validation"]
        AU5["req.user = {id, role, mspId}"]
        AU6["requireRoleMiddleware('Manufacturer')"]
        AU7["→ Controller"]

        AU1 --> AU2 --> AU3 --> AU4 --> AU5 --> AU6 --> AU7
    end
```

> **Stateless design:** 1000 concurrent users = 0 auth DB queries. JWT tự-verify bằng secret trong memory.

---

### 3.3 SupplyChainService — Dependency Wiring

```mermaid
graph TB
    BOOT["app.js bootstrap<br/>createDependencies()"]

    BOOT --> LR["createLedgerRepository()<br/>① FABRIC_ENABLED=false → DisabledLedgerRepository<br/>② validateFabricRuntimeConfig() fail → Disabled<br/>③ hasAllFabricCredentials() fail → Disabled<br/>④ All pass → FabricGatewayClient + FabricLedgerRepository"]

    BOOT --> QR["new QrService(axiosInstance)<br/>baseURL = QR_SERVICE_URL"]
    BOOT --> AI["new AiVerifierService(axiosInstance)<br/>baseURL = AI_VERIFICATION_URL<br/>(nullable — AI_ENABLED=false → skip)"]
    BOOT --> AL["new AlertArchiveRepository(AlertArchive model)"]
    BOOT --> DL["new AlertDeliveryService(deliveryRepo,<br/>deadLetterRepo, alertSinkAdapter)"]

    LR & QR & AI & AL & DL --> SCS["new SupplyChainService(<br/>  ledgerRepository,<br/>  qrService,<br/>  aiVerifierService,<br/>  alertArchiveRepo,<br/>  alertDeliveryService,<br/>  documentStorageAdapter,<br/>  documentArtifactRepo<br/>)"]
```

> **Constructor injection:** Không có static singleton trong service → dễ mock trong test, dễ swap implementation.

---

### 3.4 Chaincode — Internal Structure

```mermaid
graph TB
    DT["drugTracker.js<br/>Contract — Public API"]

    DT --> BS["batchService.js"]
    BS --> BS1["createBatch() → putState()"]
    BS --> BS2["verifyBatch() → getState → mutate → putState<br/>emit: GovMonitor / PublicAlert"]
    BS --> BS3["confirmDeliveredToConsumption()<br/>emit: ConsumptionDeliveryConfirmed"]
    BS --> BS4["evaluateBatchRisk() → read-only"]

    DT --> PQ["protectedQrService.js"]
    PQ --> PQ1["bindProtectedQR() → putState(qrKey)"]
    PQ --> PQ2["verifyProtectedQR() → digest compare (read-only)"]
    PQ --> PQ3["recordQRVerification() → putState history<br/>emit: ProtectedQRVerificationRecorded"]
    PQ --> PQ4["updateTokenPolicy() → mutate<br/>emit: ProtectedQRTokenPolicyUpdated"]

    DT --> TS["transferService.js"]
    TS --> TS1["shipBatch() → transferStatus = IN_TRANSIT"]
    TS --> TS2["receiveBatch() → ownerMSP = receiver"]

    DT --> DS["documentService.js"]
    DS --> DS1["updateDocument() → batch.documents CID"]

    DT --> RS["recallService.js"]
    RS --> RS1["emergencyRecall() → status = RECALLED<br/>emit: RecallAlert"]

    DT --> UTIL["Shared Utils"]
    UTIL --> U1["getClientMSP(ctx)"]
    UTIL --> U2["isCanonicalMSP(id, canon)"]
    UTIL --> U3["getBatchOrThrow(ctx, id)"]
    UTIL --> U4["putBatch(ctx, id, batch)"]
```

---

### 3.5 Alert Taxonomy Pipeline

```mermaid
graph LR
    subgraph "Event Sources"
        EV1["Chaincode Events<br/>PublicAlert / GovMonitor<br/>RecallAlert / ProtectedQRTokenPolicyUpdated"]
        EV2["Backend Decisions<br/>SCAN_ACCEPTED / SCAN_REJECTED<br/>AI_REJECT / QR_MISMATCH"]
    end

    subgraph "Taxonomy Mapper"
        TM["alert-taxonomy.mapper.js<br/>CHAINCODE_EVENT_TO_CANONICAL_ALERT_KEY<br/>buildStandardAlertPayload({canonicalKey, severity})"]
    end

    subgraph "Archive — BLOCKING"
        AR["AlertArchiveRepository.save()<br/>→ MongoDB AlertArchive<br/>(Regulator dashboard queries this)"]
    end

    subgraph "Dispatch — NON-BLOCKING"
        DS["AlertDeliveryService<br/>3x retry + exponential backoff"]
        LG["Logger Sink"]
        WH["Webhook Sink"]
        DL["Dead Letter Queue<br/>MongoDB AlertDeadLetter"]
    end

    EV1 --> TM
    EV2 --> TM
    TM -->|canonical payload| AR
    AR -->|void Promise| DS
    DS --> LG
    DS --> WH
    DS -->|on failure| DL
```

---

## 4. Logic Chi Tiết Các Hàm Xương Sống

### 4.1 `verifyBatch()` — Hàm Quan Trọng Nhất Chaincode

```javascript
// File: chaincode-js/lib/services/batchService.js

async function verifyBatch(ctx, batchID) {
    // BƯỚC 1: Đọc state hiện tại từ ledger (READ — không ghi)
    const batch = await getBatchOrThrow(ctx, batchID);

    // BƯỚC 2: Gate checks (early return — scanCount KHÔNG tăng trên hàng đã biết là fake)
    if (batch.status === "RECALLED") {
        return JSON.stringify({ ...batch, verificationResult: "DANGER_RECALLED" });
    }
    if (batch.status === "SUSPICIOUS") {
        return JSON.stringify({ ...batch, verificationResult: "DANGER_FAKE" });
    }

    // BƯỚC 3: Kiểm tra consumptionConfirmed — emit warning nhưng KHÔNG block scan
    // Lý do: consumer không biết về logistics; chỉ Regulator cần biết
    if (!batch.consumptionConfirmed) {
        await ctx.stub.setEvent("GovMonitor", Buffer.from(JSON.stringify({
            batchID, code: "WARN_UNCONFIRMED_CONSUMPTION",
        })));
    }

    // BƯỚC 4: Tăng scan counter — WRITE đầu tiên
    batch.scanCount += 1;

    // BƯỚC 5: Đánh giá threshold — suspicious trước warning (priority cao hơn)
    if (batch.scanCount >= batch.suspiciousThreshold) {
        if (batch.status !== "SUSPICIOUS") {
            batch.status = "SUSPICIOUS";
            await ctx.stub.setEvent("PublicAlert", Buffer.from(JSON.stringify({
                batchID, msg: "Suspicious scan volume detected",
                scanCount: batch.scanCount,
            })));
            // "PublicAlert" → backend map → "LEDGER_SCAN_SUSPICIOUS" → severity "critical"
        }
    } else if (batch.scanCount >= batch.warningThreshold) {
        if (batch.status === "ACTIVE") {
            batch.status = "WARNING";
            await ctx.stub.setEvent("GovMonitor", Buffer.from(JSON.stringify({
                batchID, msg: "Scan anomaly threshold reached",
            })));
        }
    }

    // BƯỚC 6: Commit state — putState() trong Fabric transaction
    await putBatch(ctx, batchID, batch);

    // BƯỚC 7: Trả về JSON với risk evaluation
    return JSON.stringify({
        ...batch,
        verificationResult: evaluateRisk(batch), // "OK" | "WARNING" | "DANGER"
    });
}
```

**Tại sao thiết kế như vậy?**
- Gate checks trước `scanCount++` → không inflate số scan trên hàng đã là fake
- `!consumptionConfirmed` chỉ emit event, không block → UX tốt hơn, governance vẫn được thông báo
- Chaincode events không block transaction — emit rồi commit vẫn tiếp tục

---

### 4.2 `createLedgerRepository()` — Factory với Graceful Fallback

```javascript
// File: backend/src/repositories/ledger/create-ledger-repository.js

export const createLedgerRepository = () => {
    if (!repositoryInstance) {  // Singleton — tạo một lần duy nhất

        // TẦNG 1: Feature flag
        if (!config.fabric.enabled) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        // TẦNG 2: Runtime config validation (env vars đủ không?)
        if (!validateFabricRuntimeConfig()) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        // TẦNG 3: Filesystem check (cert files có tồn tại không?)
        if (!hasAllFabricCredentials()) {
            repositoryInstance = new DisabledLedgerRepository();
            return repositoryInstance;
        }

        // Tất cả checks pass → tạo real Fabric gateway
        const gatewayClient = new FabricGatewayClient();
        repositoryInstance = new FabricLedgerRepository(gatewayClient);
    }
    return repositoryInstance;
};
```

**Pattern "Graceful Degradation":** Thay vì crash khi Fabric chưa sẵn sàng, backend tự động fallback về `DisabledLedgerRepository`. FE nhận `FABRIC_DISABLED` error code với HTTP 503 — xử lý được. Pattern này là tự thiết kế, không phải boilerplate.

---

### 4.3 `FabricGatewayClient.submit()` — Session Pool + Audit Trail

```javascript
// File: backend/src/integrations/fabric/fabric-gateway.client.js

async submit(actor, transactionName, args, traceId) {
    // BƯỚC 1: Resolve identity — map actor.mspId → cert/key files
    const identityRef = resolveIdentity(actor);
    // actor.mspId = "ManufacturerMSP" → certPath/keyPath từ config
    // actor.distributorUnitId = "UNIT_HN_001" → identity riêng của unit đó

    // BƯỚC 2: Lazy session pool (reuse gRPC connection theo sessionKey)
    const session = await this.#getSession(identityRef);
    // cache miss: readPem → grpc.Client → ECDSA signer → connect() → contract

    try {
        // BƯỚC 3: Submit — Fabric SDK sign + endorse + order + commit
        const result = await session.contract.submitTransaction(transactionName, ...args);

        // BƯỚC 4: Audit trail SUCCESS → MongoDB FabricIdentityLink
        await recordFabricIdentityLink({ traceId, actor, transaction: { status: "SUCCESS" } });
        return result;

    } catch (error) {
        // BƯỚC 5: Translate Fabric SDK error → HttpException
        // "EndorseError" → 502, "CommitError" → 502, chaincode "Denied:" → 403
        const translated = translateFabricError(error, { transactionName });

        // BƯỚC 6: Audit trail FAILURE (kể cả lỗi cũng được ghi)
        await recordFabricIdentityLink({ ...fields, transaction: { status: "FAILED", errorCode: translated.code } });
        throw translated;
    }
}
```

---

### 4.4 `authMiddleware` — Stateless JWT Pipeline

```javascript
// File: backend/src/middleware/auth/auth.middleware.js

export const authMiddleware = (req, _res, next) => {
    // BƯỚC 1: Extract Bearer token
    const [scheme, token] = (req.header("authorization") ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new HttpException(401, "Missing authorization token");

    try {
        // BƯỚC 2: jwt.verify — không query DB
        const payload = jwt.verify(token, config.jwtSecret);

        // BƯỚC 3: Structural validation (defense in depth)
        if (!payload?.userId || !payload?.role || !payload?.mspId)
            throw new HttpException(403, "Invalid or expired token");

        // BƯỚC 4: Business rule validation
        const role  = normalizeRole(payload.role);
        const mspId = normalizeMspId(payload.mspId);
        if (!role || !mspId || !isMspIdForRole(role, mspId))
            throw new HttpException(403, "Invalid or expired token");

        // BƯỚC 5: Gắn vào request context
        req.user = { id: payload.userId, role, mspId,
                     distributorUnitId: normalizeDistributorUnitId(payload.distributorUnitId) };
        next();

    } catch {
        throw new HttpException(403, "Invalid or expired token");
    }
};
```

**Lý do stateless:** 1000 concurrent users = 0 auth DB queries. JWT tự-verify bằng secret trong memory. Đánh đổi: user bị bypass cho đến khi token hết hạn — xử lý bằng `JWT_EXPIRES_IN` ngắn + refresh flow.

---

### 4.5 `syncBatchSnapshot()` — Write-Through Cache Pattern

```javascript
// File: backend/src/repositories/ledger/fabric-ledger.helpers.js

export const syncBatchSnapshot = async (batch) => {
    // Vấn đề: Fabric không support range query, pagination, full-text search
    // Giải pháp: mỗi lần đọc batch từ ledger → đồng bộ về MongoDB

    await BatchState.findOneAndUpdate(
        { batchID: batch.batchID },
        { $set: { ...batch, syncedAt: new Date() } },
        { upsert: true, new: true }
    );
    // Luồng:
    // GET /api/v1/batches → query MongoDB BatchState (fast, indexed) — NOT Fabric
    // POST /verify → VerifyBatch submit → readBatch → syncBatchSnapshot → MongoDB updated
    // Source of truth: Fabric ledger. MongoDB: cache only.
};
```

---

### 4.6 `processAlertSideEffects()` — Non-Blocking Alert Pipeline

```javascript
// File: backend/src/services/supply-chain/supply-chain.service.js

async processAlertSideEffects(alertPayload) {
    // STEP 1: Archive vào MongoDB — BLOCKING (await)
    // Đảm bảo alert được lưu trước khi tiếp tục — dữ liệu Regulator không mất
    await this.archiveAlert(alertPayload);

    // STEP 2: Dispatch đến external sink — NON-BLOCKING (void Promise)
    // Không block main request path — người dùng nhận response ngay
    this.dispatchAlertNonBlocking(alertPayload);
}

dispatchAlertNonBlocking(alertPayload) {
    if (!this.alertDeliveryService?.dispatchAlert) return;

    void this.alertDeliveryService
        .dispatchAlert(alertPayload)
        .catch((error) => {
            logger.error({ message: "canonical-alert-dispatch-unhandled-error", error });
            // Không re-throw — không ảnh hưởng request đang xử lý
        });
}
```

**Pattern "Fire-and-Forget with Dead Letter":**
- `archiveAlert()` blocking → Regulator data không mất dù webhook down
- `dispatchNonBlocking()` async → UX không bị ảnh hưởng
- `AlertDeliveryService` có retry (3 lần, exponential backoff) + dead-letter queue (MongoDB `AlertDeadLetter`)

---

### 4.7 Bảng Tổng Kết: Default vs Custom

| Hàm / Block | Loại | Giải thích |
|---|---|---|
| `Contract extends Contract` | Default | Fabric contract base class |
| `ctx.stub.getState / putState` | Default | Fabric state DB API |
| `ctx.stub.setEvent()` | Default | Fabric event API |
| `buildDefaultBatch()` | **Custom** | Business schema + absolute threshold formula |
| `verifyBatch()` thresholds | **Custom** | `Math.max(50, ceil(qty×1.05))` logic |
| `evaluateRisk()` mapping | **Custom** | status → "OK" / "WARNING" / "DANGER" |
| `resolveIdentity(actor)` | **Custom** | MSP → cert/key path + distributorUnitId bridge |
| `#getSession()` pool | **Custom** | gRPC session reuse theo identity key |
| `translateFabricError()` | **Custom** | Fabric SDK errors → HTTP error codes |
| `syncBatchSnapshot()` | **Custom** | Write-through cache pattern |
| `processAlertSideEffects()` | **Custom** | Non-blocking fire-and-forget + dead-letter |
| `createLedgerRepository()` | **Custom** | 3-layer graceful fallback factory |
| `decide_packaging_authenticity()` | **Custom** | Counterfeit/authentic decision logic |
| `score_labels()` | **Custom** | Max confidence aggregation per label category |
| `buildStandardAlertPayload()` | **Custom** | Canonical key normalization pipeline |
| `jwt.sign / jwt.verify` | Default | jsonwebtoken library |
| `jwt.verify(ignoreExpiration)` + re-issue | **Custom** | Refresh flow |
| `bcrypt.hash / bcrypt.compare` | Default | bcryptjs library |
| `grpc.Client` creation | Default | gRPC library |
| `connect({ signer, hash })` | Default | Fabric Gateway SDK |
| HMAC-SHA256 token + center pattern | **Custom** | 34-byte payload + geometry injection |
| `infer_detections()` pipeline | **Custom** | YOLOv8 call + normalize detections |
| Alert taxonomy constants | **Custom** | Toàn bộ mapping table |

## 5. Phân Tích Kiến Trúc & Codebase

### 5.1 Cấu Trúc Thư Mục

```
DATN/
├── blockchain/                   # Hyperledger Fabric chaincode + infra
│   └── asset-transfer-drug/
│       ├── chaincode-js/         # Node.js chaincode (business logic bất biến)
│       │   └── lib/
│       │       ├── drugTracker.js            # Contract entry point
│       │       └── services/                 # Domain services (tự viết)
│       │           ├── batchService.js       # Vòng đời lô thuốc
│       │           ├── protectedQrService.js # QR binding & verification
│       │           ├── transferService.js    # Ship / Receive
│       │           ├── documentService.js    # CID document update
│       │           └── recallService.js      # Emergency recall
│       └── infrastructure/
│           └── canonical/
│               ├── configtx/configtx.yaml    # Cấu hình Channel & Policy
│               ├── organizations/            # Crypto material (MSP, certs, keys)
│               └── scripts/blockchain-run.sh # Automation deploy network
│
├── backend/                      # Express.js API server (tự viết toàn bộ)
│   └── src/
│       ├── app.js                # Express bootstrap, middleware, routes
│       ├── config/index.js       # Cấu hình tập trung toàn bộ env vars
│       ├── controllers/          # Request parsing + response formatting
│       ├── services/             # Business logic (domain layer)
│       │   ├── supply-chain/     # Orchestration chính
│       │   ├── alerts/           # Taxonomy & delivery pipeline
│       │   ├── qr/               # QrService gọi protected-qr
│       │   └── ai-verifier/      # AiVerifierService gọi ai-service
│       ├── repositories/
│       │   ├── ledger/           # Abstraction layer on Fabric Gateway
│       │   ├── alert/            # MongoDB alert archive
│       │   └── document/         # MongoDB document artifact
│       ├── integrations/
│       │   ├── fabric/           # FabricGatewayClient (tự viết)
│       │   ├── alert-sink/       # Logger/Webhook adapter
│       │   └── document-storage/ # IPFS/Pinata/Kubo adapter
│       ├── middleware/           # Auth, rate limit, error handler, trace ID
│       ├── models/               # Mongoose schema (off-chain data)
│       └── constants/            # Alert taxonomy, batch geo constants
│
├── protected-qr/                 # Microservice QR bảo mật (tự viết)
│   ├── src/                      # Node.js API (Express/TypeScript-like)
│   └── python-core/              # Python FastAPI: thuật toán QR geometry
│
├── ai-service/                   # Microservice phát hiện bao bì giả (tự viết)
│   ├── src/                      # Node.js proxy + request normalization
│   └── python-core/              # Python FastAPI + YOLOv8 inference
│       ├── app.py                # Model loading, inference pipeline
│       └── decision_policy.py    # Thuật toán quyết định authentic/fake
│
├── docs/                         # Tài liệu kỹ thuật (English)
├── scripts/run-all.sh            # Lệnh quản lý vòng đời toàn stack
└── docker-compose.yml            # Orchestration tất cả services
```

**Lý do chia như vậy:**

- `blockchain/` tách biệt hoàn toàn vì chaincode chạy trong môi trường Docker riêng của Fabric — không dùng chung runtime với backend.
- `backend/` theo **Layered Architecture**: Controller → Service → Repository → Integration, đảm bảo mỗi layer chỉ biết về layer ngay dưới nó.
- `protected-qr/` và `ai-service/` là microservice độc lập vì chúng có dependency Python riêng (OpenCV, Ultralytics) không tương thích với Node.js ecosystem và cần scale độc lập.

---

### 5.2 Phân Tích Module Chi Tiết

#### 5.2.1 Module Fabric Chaincode — `chaincode-js/lib/`

**Đây là code do nhóm tự viết 100%.** Hyperledger Fabric chỉ cung cấp class `Contract` và context API `ctx`.

**`drugTracker.js` — Contract Entry Point**

```javascript
class DrugTrackerContract extends Contract {
    async CreateBatchWithExpiry(ctx, batchID, drugName, quantityStr, expiryDate) {
        return batchService.createBatch(ctx, batchID, drugName, quantityStr, expiryDate);
    }
    async VerifyBatch(ctx, batchID) { ... }
    // 14 methods tổng cộng
}
```

Đây là **public API của chaincode**. Mỗi method tương ứng một transaction type. Fabric sẽ route request đến đúng method dựa trên tên function gọi từ client SDK.

**`batchService.js` — Domain Logic lô thuốc**

Hàm quan trọng nhất: `buildDefaultBatch()`:

```javascript
warningThreshold: Math.max(50, Math.ceil(quantity * 1.05)),
suspiciousThreshold: Math.max(100, Math.ceil(quantity * 1.1)),
```

Logic này hoàn toàn tự viết: Khi lô thuốc có 10.000 đơn vị, `warningThreshold = 10.500` — nếu QR bị scan 10.501 lần, hệ thống tự động chuyển status sang `WARNING`. Absolute floor 50/100 ngăn false positive với lô nhỏ (demo/pilot).

Hàm `verifyBatch()`:

```javascript
batch.scanCount += 1;
if (batch.scanCount >= batch.suspiciousThreshold) status = "SUSPICIOUS";
else if (batch.scanCount >= batch.warningThreshold) status = "WARNING";
// emit chaincode event → backend nhận qua event listener
ctx.stub.setEvent("GovMonitor" / "PublicAlert", ...)
```

**`protectedQrService.js` — QR binding & token policy**

```javascript
async function bindProtectedQR(ctx, batchID, dataHash, ..., tokenDigest) {
    // Ghi metadata QR lên state database của Fabric
    // tokenDigest = SHA-256(token) — không ghi raw token lên ledger
}
async function verifyProtectedQR(ctx, batchID, tokenDigest) {
    const qrState = await getProtectedQR(ctx, batchID);
    return { matched: qrState.tokenDigest === tokenDigest, ... }
}
```

Token digest chỉ lưu hash — ngay cả Fabric admin đọc ledger raw cũng không biết token gốc.

---

#### 5.2.2 Module Backend — Fabric Integration

**`fabric-gateway.client.js` — Tự viết, quan trọng nhất**

```javascript
// Session pooling theo identity (1 session/role)
async #getSession(identityRef) {
    if (this.sessions.has(identityRef.sessionKey)) return cached;
    
    // Đọc TLS cert, user cert, private key từ file system
    const [tlsCertPem, certPem, keyPem] = await Promise.all([
        readPem(identityRef.tlsCertPath),
        readPem(identityRef.certPath),
        readPem(identityRef.keyPath),
    ]);

    // Tạo gRPC connection với TLS
    const client = new grpc.Client(endpoint, grpc.credentials.createSsl(tlsCertPem));
    
    // Tạo signer từ ECDSA private key
    const privateKey = crypto.createPrivateKey(keyPem);
    const signer = signers.newPrivateKeySigner(privateKey);
    
    // Connect Fabric Gateway
    const gateway = connect({ client, identity, signer, hash: hash.sha256, ... });
    const contract = gateway.getNetwork(channelName).getContract(chaincodeName);
    return { client, gateway, contract };
}
```

Đây là điểm **khác biệt lớn nhất so với boilerplate**: session được pool theo role (không reconnect mỗi request), và mọi transaction đều được audit log vào MongoDB (`FabricIdentityLink`) bất kể thành công hay thất bại.

**`submit()` vs `evaluate()` — hai chế độ ledger:**

```javascript
// evaluate = READ (không tạo transaction, không consensus)
await this.fabricGatewayClient.evaluate(actor, "ReadBatch", [batchID], traceId);

// submit = WRITE (tạo transaction, qua Orderer, đồng thuận, ghi ledger)
await this.fabricGatewayClient.submit(actor, "VerifyBatch", [batchID], traceId);
```

**`fabric-ledger.helpers.js` — `syncBatchSnapshot()`**

```javascript
export const syncBatchSnapshot = async (batch) => {
    // Mỗi khi đọc dữ liệu từ Fabric về, cập nhật MongoDB cache (BatchState)
    await BatchState.findOneAndUpdate(
        { batchID: batch.batchID },
        { $set: { ...batch, syncedAt: new Date() } },
        { upsert: true }
    );
};
```

Đây là pattern **"write-through cache"** tự thiết kế: ledger là source of truth, MongoDB là cache phục vụ listing (vì không thể range query trên Fabric). Không phải boilerplate.

---

#### 5.2.3 Module Auth — `auth.controller.js`

```javascript
// Register: validate schema → check duplicate → bcrypt hash → MongoDB insert
const passwordHash = await bcrypt.hash(parsed.data.password, 12);
await User.create({ username, password: passwordHash, role, mspId, ... });

// Login: verify password → JWT sign với role/mspId/distributorUnitId
const token = jwt.sign({ userId, role, mspId, distributorUnitId },
    config.jwtSecret, { expiresIn: config.jwtExpiresIn });

// Refresh (mới): verify token ignoreExpiration → re-issue
payload = jwt.verify(token, config.jwtSecret, { ignoreExpiration: true });
const user = await User.findById(payload.userId);
const newToken = jwt.sign({ ...userFields }, config.jwtSecret, { expiresIn });
```

**Middleware chain:** `authMiddleware` → decode JWT → gắn `req.user` → `requireRoleMiddleware` → kiểm tra role → `controller`.

---

#### 5.2.4 Module AI Service — Pipeline Phát Hiện Bao Bì Giả

**Kiến trúc 2-tier:**

```
FE/Backend
    │  POST /api/v1/verify (multipart: packagingImage)
    ▼
ai-service/src/  (Node.js — tự viết)
    │  Normalize request → forward to Python
    ▼
ai-service/python-core/app.py  (FastAPI — tự viết)
    │  YOLOv8 inference → decision_policy.py
    ▼
Kết quả: { accepted, verdict, confidence_score, detections[] }
```

**`app.py` — Inference pipeline (tự viết):**

```python
def infer_detections(image_bgr):
    model = resolve_model()  # lazy-load, singleton pattern
    results = model.predict(source=image_bgr, conf=0.5, imgsz=640, device="cpu")
    
    # Normalize detections → score by label category
    counterfeit_score, authentic_score = score_labels(detections)
    
    # Delegate to policy module
    accepted, verdict, reason = decide_packaging_authenticity(...)
    return { "accepted": accepted, "confidence_score": ..., "detections": [...] }
```

**`decision_policy.py` — Logic quyết định (tự viết, testable riêng):**

```python
def decide_packaging_authenticity(counterfeit_score, authentic_score, ...):
    has_counterfeit_signal = counterfeit_score >= counterfeit_min_score  # 0.6
    has_authentic_evidence = authentic_score >= authentic_min_score      # 0.75
    
    accepted = (not has_counterfeit_signal) and has_authentic_evidence
    # Logic rõ ràng: chỉ ACCEPT khi KHÔNG có dấu hiệu giả VÀ CÓ đủ bằng chứng thật
```

Policy này được tách ra module riêng để có thể unit test độc lập và thay đổi threshold mà không ảnh hưởng inference pipeline.

---

#### 5.2.5 Module Protected QR — Chống Sao Chép Vật Lý

**Cơ chế hoạt động:**

```
Generate:
  Input hex fields (dataHash, series, issued, expiry) → 34-byte payload cố định
  → QR 600×600px, Error Correction H
  → Chèn center pattern hình học đặc biệt (154×154px)
  → HMAC-SHA256(payload) = token
  → SHA256(token) = tokenDigest → ghi lên Fabric ledger

Verify (vật lý):
  Scan QR → decode 34-byte payload → compute tokenDigest
  → So sánh với tokenDigest trên Fabric ledger (VerifyProtectedQR)
  → Crop center pattern → computer vision phân tích degradation
  → confidenceScore: bản gốc > 0.70, photocopy < 0.55
```

**Tại sao cơ chế này chống sao chép được?**  
QR tiêu chuẩn có thể photocopy 1:1. Protected QR có center pattern embed thêm các geometric marker — khi photocopy, pattern này bị degraded do giới hạn DPI máy in và máy scan. Python core phân tích pixel-level degradation của vùng 154×154px này để phân biệt bản gốc.

---

#### 5.2.6 Module Alert Taxonomy — Pipeline Cảnh Báo

```
Chaincode emit event (e.g. "PublicAlert")
    │
    ▼
CHAINCODE_EVENT_TO_CANONICAL_ALERT_KEY["PublicAlert"] = "LEDGER_SCAN_SUSPICIOUS"
    │
    ▼
buildStandardAlertPayload({ canonicalKey, sinkEventId: "DATN_LEDGER_SCAN_SUSPICIOUS", severity: "critical", ... })
    │
    ▼
AlertArchiveRepository.save()  → MongoDB (cho Regulator dashboard)
    ▼
AlertDeliveryService.dispatchAlert()  → Logger | Webhook (retry/backoff/dead-letter)
```

Taxonomy là pattern tự thiết kế: mọi cảnh báo, dù từ chaincode hay từ backend decision, đều quy về một canonical key duy nhất — đảm bảo consistency khi mở rộng sink (SIEM, email, v.v.).

---

### 5.3 Boilerplate vs Logic Tự Viết

| Thành phần | Boilerplate (Fabric/Framework cung cấp) | Logic tự viết |
|---|---|---|
| `Contract`, `ctx.stub.getState/putState` | ✅ Fabric API | — |
| `configtx.yaml` structure | ✅ Fabric template | Policies, org list, EtcdRaft config |
| `express()`, `Router`, middleware signature | ✅ Express | — |
| `grpc.Client`, `connect()`, `signers` | ✅ Fabric Gateway SDK | Session pooling, audit log, error translation |
| `jwt.sign/verify` | ✅ jsonwebtoken | Refresh logic, role validation |
| `YOLO().predict()` | ✅ Ultralytics | `score_labels()`, `decide_packaging_authenticity()`, lazy-load singleton |
| `bcrypt.hash/compare` | ✅ bcryptjs | — |
| `cors()`, `helmet()`, `rateLimit()` | ✅ Libraries | CORS env-configurable origin, auth limiter |
| QR generation | — | 34-byte payload encoding, center pattern injection |
| `syncBatchSnapshot()` | — | Write-through cache pattern |
| Alert taxonomy pipeline | — | Canonical key mapping, sink adapter, dead-letter |
| `decision_policy.py` | — | Threshold logic, label scoring |

---

### 5.4 Case Study: Luồng Transaction Thực Tế

#### Case A — Fabric Transaction: `VerifyBatch` (WRITE)

```mermaid
sequenceDiagram
    participant U as Người dùng (Scan QR)
    participant BE as Backend API
    participant QR as QrService :8080
    participant AI as AiVerifierService :8700
    participant FAB as Fabric Gateway
    participant ORD as Orderer (EtcdRaft)
    participant DB as MongoDB

    U->>BE: POST /api/v1/verify
    
    par Verify Protected QR
        BE->>QR: POST /api/v1/qr/verify
        QR-->>BE: { token, isAuthentic, confidenceScore }
    and Verify AI Packaging
        BE->>AI: POST /api/v1/verify
        AI-->>BE: { accepted, verdict }
    end
    
    BE->>BE: sha256(token) = tokenDigest
    
    BE->>FAB: evaluate("VerifyProtectedQR", [batchID, tokenDigest])
    Note over FAB: READ (Không ghi ledger)
    FAB-->>BE: { matched: true/false }
    
    BE->>FAB: submit("RecordProtectedQRVerification", [...])
    Note over FAB: WRITE Flow bắt đầu
    FAB->>FAB: 1-3. Endorse & Thực thi chaincode
    FAB->>ORD: 4-5. Gửi RWSet + Chữ ký ECDSA
    ORD->>ORD: 6-7. Raft đồng thuận (2/3) & Đóng Block
    ORD->>FAB: 8. Validate Block & Commit
    FAB-->>BE: 9. SUCCESS
    
    BE->>FAB: submit("VerifyBatch", [batchID])
    FAB-->>BE: { batch với scanCount tăng 1, status mới }
    
    BE->>DB: syncBatchSnapshot(batch)
    Note over DB: Cập nhật cache
    
    BE-->>U: { decision, safetyStatus }
```

**Cơ chế đồng thuận EtcdRaft** (không phải PoW, không tốn năng lượng):
- Orderer cluster gồm 3 node, chạy Raft consensus
- Leader được bầu bởi election; nếu Leader crash, Follower tự bầu Leader mới
- Block được commit khi có `quorum = floor(n/2) + 1 = 2/3` Orderer đồng ý
- **Finality tức thì** — không có fork như blockchain public

#### Case B — AI Inference Flow

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant BE as Backend: AiVerifierService
    participant NG as Proxy: ai-service :8700
    participant PY as Python: ai-python-core :8701

    U->>BE: POST /api/v1/verify (packagingImage)
    BE->>NG: POST /api/v1/verify
    NG->>PY: POST /verify (FastAPI)
    
    PY->>PY: YOLOv8.predict(image, conf=0.5, imgsz=640)
    Note over PY: detections: [{ label: "authentic", confidence: 0.82, ... }]
    
    PY->>PY: score_labels(detections)<br/>counterfeit_score = 0.0<br/>authentic_score = 0.82
    
    PY->>PY: decide_packaging_authenticity(...)<br/>has_counterfeit = False (0.0 < 0.6)<br/>has_authentic = True (0.82 >= 0.75)
    
    PY-->>NG: { accepted: true, verdict: "AUTHENTIC" }
    NG-->>BE: Normalize response
    BE-->>U: { accepted: true, confidence_score: 0.82, verdict: "AUTHENTIC" }
```

**Fail-open policy:** Nếu ai-service không khả dụng (`AI_VERIFICATION_FAIL_OPEN=true`), hệ thống vẫn cho qua và log cảnh báo — không block người dùng cuối.

#### Case C — Protected QR Generate Flow

```mermaid
sequenceDiagram
    participant U as Manufacturer
    participant BE as SupplyChainService
    participant QR as qr-service :8080
    participant PY as qr-python-core :8000
    participant FAB as Fabric Gateway

    U->>BE: POST /api/v1/batches
    BE->>BE: createBatch()
    
    BE->>QR: generate(dataHash, series, issued, expiry)
    QR->>PY: POST /generate-protected-qr
    
    PY->>PY: payload = concat(dataHash + series + issued + expiry) <br/>(34 bytes)
    PY->>PY: qr_image = generate_qr(payload)<br/>inject_center_pattern(size=154)
    PY-->>QR: qr_image
    
    QR->>QR: HMAC-SHA256(payload, HMAC_SECRET) = token
    QR-->>BE: { token, qrImageBase64 }
    
    BE->>BE: sha256(token) = tokenDigest
    
    BE->>FAB: submit("CreateBatchWithExpiry", [batchID, ...])
    BE->>FAB: submit("BindProtectedQR", [batchID, tokenDigest])
    Note over FAB: Ghi lên ledger: tokenDigest, dataHash...<br/>(Raw token KHÔNG bao giờ lên ledger)
    
    BE-->>U: { batch, token, qrImageBase64 }
```

---

## 6. Triển Khai & Scale (DevOps Playbook)

> Hướng dẫn triển khai production **step-by-step** từ VPS trống đến hệ thống Drug Guard hoạt động với HTTPS, Monitoring, và khả năng Scale thêm Organization mới vào mạng Fabric đang live.

---

### 6.0 Yêu Cầu Hạ Tầng

#### Cấu hình tối thiểu (MVP All-in-One)

| Thành phần | CPU | RAM | Disk |
|---|---|---|---|
| Fabric (3 Orderer + 3 Peer + 3 CA) | 4 vCPU | 8 GB | 40 GB SSD |
| Backend (Node.js API) | 1 vCPU | 1 GB | 10 GB |
| MongoDB | 1 vCPU | 2 GB | 20 GB SSD |
| Protected QR (Node + Python) | 1 vCPU | 1 GB | 5 GB |
| AI Service (YOLOv8 — CPU mode) | **2 vCPU** | **4 GB** | 10 GB |
| **Tổng cộng (all-in-one)** | **10 vCPU** | **16 GB** | **85 GB** |

> **Khuyến nghị thực tế:** Ubuntu 22.04 LTS · 8 vCPU · 16 GB RAM · 100 GB SSD NVMe  
> DigitalOcean CPU-Optimized $96/tháng hoặc Vultr High Frequency $80/tháng.

#### Phân tách Production (mỗi org 1 server)

| Server | Chạy gì | Spec đề nghị |
|---|---|---|
| **Regulator Node** | Orderer ×3 + Peer + CA + Backend + MongoDB | 8 vCPU / 16 GB |
| **Manufacturer Node** | Peer + CA | 4 vCPU / 8 GB |
| **Distributor Node** | Peer + CA | 4 vCPU / 8 GB |
| **AI/QR Services Node** | Docker containers AI + QR (Python heavy) | 4 vCPU / 8 GB |

---

### 6.1 Bước 0 — Chuẩn Bị VPS

#### 6.1.1 Cài đặt phần mềm hệ thống

```bash
# Đăng nhập VPS (Ubuntu 22.04)
ssh root@<VPS_IP>

# Cập nhật hệ thống
apt-get update && apt-get upgrade -y

# Cài dependencies cốt lõi
apt-get install -y \
    docker.io \
    docker-compose-plugin \
    curl git jq openssl \
    net-tools htop \
    nginx certbot python3-certbot-nginx \
    ufw

# Enable Docker không cần sudo
usermod -aG docker $USER && newgrp docker

# Verify
docker --version && docker compose version
```

#### 6.1.2 Cài Hyperledger Fabric Binaries

```bash
mkdir -p /opt/fabric && cd /opt/fabric

# Script chính thức — Fabric v2.5.0 (LTS) + CA v1.5.7
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.7

# Thêm vào PATH vĩnh viễn
echo 'export PATH=/opt/fabric/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Verify
peer version && orderer version && configtxgen --version
cryptogen version && fabric-ca-client version
```

#### 6.1.3 Cài Node.js 20 LTS & Python 3.11

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

# Python 3.11
apt-get install -y python3.11 python3-pip python3.11-venv

# Verify
node --version    # v20.x.x
python3 --version # 3.11.x
```

#### 6.1.4 Cấu hình Firewall (UFW)

```bash
ufw allow 22/tcp          # SSH — KHÔNG BAO GIỜ đóng
ufw allow 80/tcp          # HTTP (redirect to HTTPS)
ufw allow 443/tcp         # HTTPS (Nginx)

# Fabric Peer ports (internal — chỉ mở với các org server khác)
ufw allow 7051/tcp        # Regulator peer
ufw allow 9051/tcp        # Manufacturer peer
ufw allow 11051/tcp       # Distributor peer

# Orderer ports
ufw allow 7050/tcp        # orderer1
ufw allow 8050/tcp        # orderer2
ufw allow 9050/tcp        # orderer3

# App services — CHẶN công khai (đi qua Nginx)
ufw deny 8090/tcp         # Backend
ufw deny 8700/tcp         # AI Service
ufw deny 8080/tcp         # QR Service

ufw enable && ufw status
```

---

### 6.2 Bước 1 — Sinh Khóa & Chứng Chỉ (Key & Certificate Generation)

#### PKI Architecture

```mermaid
graph TD
    subgraph "Root CAs (mỗi Org 1 CA)"
        RCA1[ca.regulator.drugguard.vn<br/>Root CA — Self-signed]
        RCA2[ca.manufacturer.drugguard.vn<br/>Root CA — Self-signed]
        RCA3[ca.distributor.drugguard.vn<br/>Root CA — Self-signed]
    end

    subgraph "Identity Certs (ECDSA P-256)"
        RCA1 -->|signs| O1[Orderer Certs<br/>TLS + Identity]
        RCA1 -->|signs| P1[Peer0.Regulator<br/>TLS + Identity]
        RCA2 -->|signs| P2[Peer0.Manufacturer<br/>TLS + Identity]
        RCA3 -->|signs| P3[Peer0.Distributor<br/>TLS + Identity]
    end

    subgraph "Admin Users"
        RCA1 -->|signs| A1[Admin@regulator — Private Key + Cert]
        RCA2 -->|signs| A2[Admin@manufacturer — Private Key + Cert]
        RCA3 -->|signs| A3[Admin@distributor — Private Key + Cert]
    end
```

> **Thuật toán:** ECDSA P-256 (mặc định Fabric) — nhỏ gọn, nhanh, an toàn tương đương RSA-3072.  
> Mỗi thực thể có **2 cặp key riêng biệt**: 1 cho gRPC/TLS endpoint, 1 cho ký Transaction.

#### Option A: cryptogen (Dev / Lab)

```bash
cd DATN/blockchain/asset-transfer-drug/infrastructure/canonical

# Sinh toàn bộ crypto material cho tất cả orgs
cryptogen generate \
    --config=crypto-config.yaml \
    --output=organizations/

# Kết quả:
# organizations/
#   peerOrganizations/
#     regulator.drugguard.vn/
#       msp/           cacerts/ tlscacerts/ admincerts/
#       peers/peer0.regulator.drugguard.vn/
#         msp/
#           keystore/priv_sk       ← Private Key ECDSA P-256
#           signcerts/cert.pem     ← X.509 Certificate
#         tls/
#           server.key             ← TLS Private Key
#           server.crt             ← TLS Certificate
#   ordererOrganizations/drugguard.vn/ ...
```

#### Option B: Fabric CA (Production-grade)

```bash
# ── Step 1: Start CA containers ──────────────────────────────────────
docker compose -f docker-compose-ca.yaml up -d
docker ps | grep ca_   # Kiểm tra CA đã sẵn sàng

# ── Step 2: Enroll CA Admin ──────────────────────────────────────────
export FABRIC_CA_CLIENT_HOME=$PWD/organizations/peerOrganizations/regulator.drugguard.vn
mkdir -p $FABRIC_CA_CLIENT_HOME

fabric-ca-client enroll \
    -u https://admin:adminpw@ca.regulator.drugguard.vn:7054 \
    --caname ca-regulator \
    --tls.certfiles organizations/fabric-ca/regulator/ca-cert.pem

# ── Step 3: Register identities ──────────────────────────────────────
# Register Peer
fabric-ca-client register --caname ca-regulator \
    --id.name peer0 --id.secret peer0pw --id.type peer \
    --id.attrs 'role=peer:ecert' \
    -u https://ca.regulator.drugguard.vn:7054

# Register Admin user
fabric-ca-client register --caname ca-regulator \
    --id.name Admin --id.secret Adminpw --id.type admin \
    --id.attrs 'hf.Registrar.Roles=peer,admin,client:ecert' \
    -u https://ca.regulator.drugguard.vn:7054

# Register Application user (cho Backend)
fabric-ca-client register --caname ca-regulator \
    --id.name regulatorUser1 --id.secret user1pw --id.type client \
    -u https://ca.regulator.drugguard.vn:7054

# ── Step 4: Enroll Peer — sinh Private Key + Cert ────────────────────
fabric-ca-client enroll \
    -u https://peer0:peer0pw@ca.regulator.drugguard.vn:7054 \
    --caname ca-regulator \
    -M $FABRIC_CA_CLIENT_HOME/peers/peer0.regulator.drugguard.vn/msp \
    --csr.hosts peer0.regulator.drugguard.vn,localhost \
    --tls.certfiles organizations/fabric-ca/regulator/ca-cert.pem

# ── Step 5: Enroll Peer TLS cert (riêng) ─────────────────────────────
fabric-ca-client enroll \
    -u https://peer0:peer0pw@ca.regulator.drugguard.vn:7054 \
    --caname ca-regulator \
    -M $FABRIC_CA_CLIENT_HOME/peers/peer0.regulator.drugguard.vn/tls \
    --enrollment.profile tls \
    --csr.hosts peer0.regulator.drugguard.vn,localhost \
    --tls.certfiles organizations/fabric-ca/regulator/ca-cert.pem

# ── Step 6: Đổi tên key file cho Fabric SDK ──────────────────────────
cp $FABRIC_CA_CLIENT_HOME/peers/peer0.regulator.drugguard.vn/msp/keystore/*_sk \
   $FABRIC_CA_CLIENT_HOME/peers/peer0.regulator.drugguard.vn/msp/keystore/priv_sk

# Lặp lại Step 2-6 cho Manufacturer và Distributor CA
```

#### Sinh Application Secrets (JWT + HMAC)

```bash
# JWT Secret — 256-bit entropy
echo "JWT_SECRET=$(openssl rand -hex 32)"

# QR HMAC Secret — phải khớp giữa Backend và QR Service
echo "QR_HMAC_SECRET=$(openssl rand -hex 32)"

# MongoDB password (nếu không dùng Atlas)
echo "MONGO_PASSWORD=$(openssl rand -base64 20 | tr -d '=+/' | cut -c1-20)"

# Dán từng giá trị vào tương ứng backend/.env và protected-qr/.env
# KHÔNG commit các giá trị này vào git!
```

---

### 6.3 Bước 2 — Khởi Động Fabric Network

```bash
cd DATN/blockchain/asset-transfer-drug/infrastructure/canonical

# ── Step 1: Tải Fabric Docker images (lần đầu ~3 GB) ─────────────────
./scripts/blockchain-run.sh prereq

# ── Step 2: Generate artifacts ───────────────────────────────────────
./scripts/blockchain-run.sh generate
# Tạo: genesis.block, channel artifacts, anchor peer updates
# (dùng cryptogen hoặc kết nối Fabric CA tùy config)

# ── Step 3: Start Fabric containers ──────────────────────────────────
./scripts/blockchain-run.sh up

# Kiểm tra containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# Phải thấy: orderer1/2/3.drugguard.vn, peer0.regulator/manufacturer/distributor, ca_org*

# ── Step 4: Tạo channel & join peers ─────────────────────────────────
./scripts/blockchain-run.sh createChannel

# ── Step 5: Deploy Chaincode drugracker ─────────────────────────────
./scripts/blockchain-run.sh deployCC

# Verify
peer chaincode list --installed
peer chaincode list --instantiated -C mychannel

# ── Step 6: Smoke test chaincode ─────────────────────────────────────
peer chaincode invoke \
    -o orderer1.drugguard.vn:7050 \
    --ordererTLSHostnameOverride orderer1.drugguard.vn \
    --tls --cafile $ORDERER_CA \
    -C mychannel -n drugtracker \
    -c '{"function":"InitLedger","Args":[]}'
```

---

### 6.4 Bước 3 — Deploy Application Services

```bash
cd /DATN

# ── Step 1: Cấu hình .env files ──────────────────────────────────────
cp backend/.env.example backend/.env
cp ai-service/.env.example ai-service/.env
cp protected-qr/.env.example protected-qr/.env

# Điền vào backend/.env — các biến BẮT BUỘC thay đổi:
nano backend/.env
# JWT_SECRET=<openssl rand -hex 32>
# MONGO_URI=mongodb://localhost:27017/drug_guard
# QR_HMAC_SECRET=<openssl rand -hex 32>
# CORS_ALLOWED_ORIGINS=https://yourfrontend.drugguard.vn
# AI_SERVICE_URL=http://localhost:8700
# QR_SERVICE_URL=http://localhost:8080

# ── Step 2: Copy AI model weights (BẮT BUỘC) ─────────────────────────
cp /path/to/best.pt ai-service/models/best.pt
ls -lh ai-service/models/best.pt   # ~50 MB

# ── Step 3: Install dependencies ─────────────────────────────────────
cd backend && npm install --production && cd ..
cd ai-service && npm install --production && cd ..
cd protected-qr && npm install --production && cd ..

# ── Step 4: Setup Python venv cho AI service ─────────────────────────
cd ai-service/python-core
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate && cd ../..

# ── Step 5: Start services với pm2 (production) ───────────────────────
pm2 start backend/src/index.js --name drug-guard-backend
pm2 start ai-service/src/index.js --name drug-guard-ai
pm2 start protected-qr/src/index.js --name drug-guard-qr

# Auto start sau reboot
pm2 save && pm2 startup

# ── Step 6: Health check tất cả ──────────────────────────────────────
curl -s http://localhost:8090/health | jq .
curl -s http://localhost:8700/health | jq .
curl -s http://localhost:8080/health | jq .
```

---

### 6.5 Bước 4 — Nginx Reverse Proxy & HTTPS

```bash
# ── Step 1: Tạo Nginx config ─────────────────────────────────────────
cat > /etc/nginx/sites-available/drug-guard << 'NGINXEOF'
upstream backend    { server 127.0.0.1:8090; }

server {
    listen 80;
    server_name api.drugguard.drugguard.vn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.drugguard.drugguard.vn;

    ssl_certificate     /etc/letsencrypt/live/api.drugguard.drugguard.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.drugguard.drugguard.vn/privkey.pem;

    # Security headers
    add_header X-Frame-Options           DENY;
    add_header X-Content-Type-Options    nosniff;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # Rate limiting (30 req/min per IP)
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    limit_req zone=api burst=10 nodelay;

    # Tăng body size cho multipart image (AI verify)
    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://backend;
    }
}
NGINXEOF

# Kích hoạt config
ln -sf /etc/nginx/sites-available/drug-guard /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# ── Step 2: Lấy SSL cert (domain phải trỏ về VPS IP trước) ───────────
certbot --nginx -d api.drugguard.drugguard.vn \
    --non-interactive --agree-tos --email admin@drugguard.vn

# Auto renew cert
systemctl enable certbot.timer

# Verify HTTPS
curl -I https://api.drugguard.drugguard.vn/health
```

---

### 6.6 Bước 5 — Khởi Tạo Dữ Liệu

```bash
BASE="https://api.drugguard.drugguard.vn/api/v1"

# Tạo tài khoản Manufacturer
curl -X POST $BASE/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"mfr_admin","password":"Secure123!","role":"Manufacturer","mspId":"ManufacturerMSP"}'

# Tạo tài khoản Regulator
curl -X POST $BASE/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"reg_admin","password":"Secure123!","role":"Regulator","mspId":"RegulatorMSP"}'

# Tạo tài khoản Distributor
curl -X POST $BASE/auth/register \
    -H "Content-Type: application/json" \
    -d '{"username":"dist_admin","password":"Secure123!","role":"Distributor","mspId":"DistributorMSP"}'

# Test login và lấy token
TOKEN=$(curl -s -X POST $BASE/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"mfr_admin","password":"Secure123!"}' | jq -r '.data.accessToken')

echo "Token: $TOKEN"

# Chạy E2E smoke test
./scripts/run-all.sh test
```

---

### 6.7 Scale Out — Thêm Organization Mới (DistributorB)

```mermaid
sequenceDiagram
    participant DB as DistributorB Server
    participant REG as Regulator (Admin)
    participant MFG as Manufacturer
    participant CH as Fabric Channel

    DB->>DB: 1. Start Fabric CA Container
    DB->>DB: 2. Enroll CA Admin + Register Peer/User Identities
    DB->>DB: 3. Generate Crypto Material (certs + keys)
    DB->>REG: 4. Gửi MSP package (cacerts + tlscacerts)
    REG->>CH: 5. Fetch current channel config
    REG->>REG: 6. Tạo config update JSON (thêm DistributorBMSP)
    REG->>REG: 7. Ký config update (RegulatorMSP Admin)
    REG->>MFG: 8. Gửi file để Manufacturer co-sign (nếu policy yêu cầu)
    MFG->>REG: 9. Trả về file đã ký
    REG->>CH: 10. Submit channel update transaction
    DB->>CH: 11. Fetch genesis block, Join channel
    DB->>DB: 12. Install chaincode package trên peer mới
    REG->>REG: 13. Cập nhật Backend gateway config + restart
```

#### Chi tiết thực thi:

```bash
# ────── Trên server DistributorB ─────────────────────────────────────────────

# Bước 1: Start CA
docker run -d -p 12054:12054 \
    -v $PWD/fabric-ca/distributorb:/etc/hyperledger/fabric-ca-server \
    hyperledger/fabric-ca:1.5.7 \
    fabric-ca-server start -b admin:adminpw --port 12054

# Bước 2: Enroll CA Admin
export FABRIC_CA_CLIENT_HOME=$PWD/organizations/peerOrganizations/distributorb.drugguard.vn
mkdir -p $FABRIC_CA_CLIENT_HOME

fabric-ca-client enroll \
    -u https://admin:adminpw@ca.distributorb.drugguard.vn:12054 \
    --caname ca-distributorb \
    --tls.certfiles $PWD/fabric-ca/distributorb/ca-cert.pem

# Bước 3: Register + Enroll Peer
fabric-ca-client register --caname ca-distributorb \
    --id.name peer0 --id.secret peer0pw --id.type peer \
    -u https://ca.distributorb.drugguard.vn:12054

fabric-ca-client enroll \
    -u https://peer0:peer0pw@ca.distributorb.drugguard.vn:12054 \
    --caname ca-distributorb \
    -M $FABRIC_CA_CLIENT_HOME/peers/peer0.distributorb.drugguard.vn/msp \
    --csr.hosts peer0.distributorb.drugguard.vn,localhost \
    --tls.certfiles $PWD/fabric-ca/distributorb/ca-cert.pem

# Bước 4: Đóng gói MSP để gửi Regulator
tar czf distributorb-msp.tar.gz \
    $FABRIC_CA_CLIENT_HOME/msp/cacerts \
    $FABRIC_CA_CLIENT_HOME/msp/tlscacerts

# ────── Trên server Regulator ─────────────────────────────────────────────────

# Bước 5-6: Fetch config & compute delta
peer channel fetch config config_block.pb \
    -o orderer1.drugguard.vn:7050 \
    --ordererTLSHostnameOverride orderer1.drugguard.vn \
    -c mychannel --tls --cafile $ORDERER_CA

configtxlator proto_decode \
    --input config_block.pb --type common.Block \
    | jq .data.data[0].payload.data.config > config.json

# (Thêm DistributorBMSP vào config.json -> modified_config.json)

configtxlator proto_encode --input config.json --type common.Config --output original.pb
configtxlator proto_encode --input modified_config.json --type common.Config --output modified.pb
configtxlator compute_update --channel_id mychannel \
    --original original.pb --updated modified.pb --output config_update.pb

# Wrap vào Envelope
echo '{"payload":{"header":{"channel_header":{"channel_id":"mychannel","type":2}},"data":{"config_update":'$(configtxlator proto_decode --input config_update.pb --type common.ConfigUpdate)'}}}' \
    | jq . > config_update_in_envelope.json

configtxlator proto_encode \
    --input config_update_in_envelope.json \
    --type common.Envelope \
    --output config_update_in_envelope.pb

# Bước 7: Ký (Regulator Admin)
peer channel signconfigtx -f config_update_in_envelope.pb

# Bước 8: Gửi cho Manufacturer ký
scp config_update_in_envelope.pb manufacturer@<MFG_IP>:/tmp/

# ── Trên server Manufacturer ──
peer channel signconfigtx -f /tmp/config_update_in_envelope.pb

# Bước 10: Submit update (Regulator)
peer channel update \
    -f config_update_in_envelope.pb -c mychannel \
    -o orderer1.drugguard.vn:7050 --tls --cafile $ORDERER_CA

# ────── Trên server DistributorB (sau khi channel update thành công) ─────────

# Bước 11: Fetch genesis block & join channel
peer channel fetch 0 mychannel.block \
    -o orderer1.drugguard.vn:7050 \
    --ordererTLSHostnameOverride orderer1.drugguard.vn \
    -c mychannel --tls --cafile $ORDERER_CA

peer channel join -b mychannel.block

# Bước 12: Install chaincode
peer lifecycle chaincode install drugtracker.tar.gz

# Verify
peer channel list
peer lifecycle chaincode queryinstalled

# Bước 13: Cập nhật backend — thêm DistributorB vào fabric profileconfig & restart
pm2 restart drug-guard-backend
```

---

### 6.8 Monitoring & Observability

```bash
# pm2 monitoring
pm2 monit                       # Terminal dashboard realtime
pm2 logs drug-guard-backend     # Xem logs
pm2 logs --lines 200

# Docker container health
docker stats                    # CPU/RAM/Network realtime
docker logs peer0.regulator.drugguard.vn --tail 50

# Kiểm tra Fabric ledger
peer channel getinfo -c mychannel  # Block height hiện tại

# Query một batch trực tiếp từ ledger
peer chaincode query \
    -C mychannel -n drugtracker \
    -c '{"function":"GetBatch","Args":["BATCH-001"]}'

# Nginx access log (loại trừ health-check spam)
tail -f /var/log/nginx/access.log | grep -v "/health"
```

---

### 6.9 Backup & Disaster Recovery

```bash
# ── Backup MongoDB (daily) ────────────────────────────────────────────
mongodump \
    --uri="mongodb://localhost:27017/drug_guard" \
    --out /backup/mongodb/$(date +%F)

# ── Backup Crypto Material (CRITICAL — Private Keys) ──────────────────
tar czf /backup/crypto-$(date +%F).tar.gz \
    DATN/blockchain/asset-transfer-drug/infrastructure/canonical/organizations/
# ⚠️  Lưu trên encrypted storage hoặc HashiCorp Vault — KHÔNG để lộ

# ── Backup .env files ─────────────────────────────────────────────────
cp backend/.env /backup/env/backend-$(date +%F).env

# ── Recovery — Peer Fabric crash ──────────────────────────────────────
# Peer tự sync lại ledger từ các node khác qua Gossip Protocol sau restart
docker compose restart peer0.regulator.drugguard.vn
# Peer replay các blocks còn thiếu — không mất dữ liệu

# ── Recovery — Backend crash ──────────────────────────────────────────
pm2 restart drug-guard-backend   # pm2 tự restart (watch mode)
```

---


## 7. Tài Liệu Frontend (FE Docs)

### 7.1 Luồng Dữ Liệu Tổng Quan

```mermaid
graph TD
    A[UI Component] -->|User action: click, form, scan| B[API Client Layer<br/>Axios/fetch + interceptors]
    B -->|Authorization: Bearer Token<br/>Content-Type: JSON / multipart| C[Backend API<br/>Express.js :8090]
    
    C -->|Off-chain data: Users, Alerts, Geo| D[(MongoDB :27017)]
    C -->|QR validation & generation| E[Protected QR Service :8080<br/>Python Core :8000]
    C -->|Packaging classification| F[AI Service :8700<br/>Python Core :8701]
    C -->|On-chain immutable data<br/>Batch state, QR bind, History| G[(Hyperledger Fabric)]
    
    G -.-> G1[peer0.regulator:7051]
    G -.-> G2[peer0.manufacturer:9051]
    G -.-> G3[peer0.distributor:11051]
    
    classDef default fill:#f9f9f9,stroke:#333,stroke-width:1px;
    classDef db fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    class D,G db;
```

### 7.2 Danh Sách Endpoint API cho Frontend

#### Auth

| Method | Endpoint | Role | Request | Response |
|--------|----------|------|---------|---------|
| POST | `/api/v1/auth/register` | Tất cả | `{username, password, role, mspId, distributorUnitId?}` | `{success, data: {id, username, role, mspId}}` |
| POST | `/api/v1/auth/login` | Tất cả | `{username, password}` | `{success, data: {token}}` |
| POST | `/api/v1/auth/refresh` | Tất cả | Header: `Authorization: Bearer <token>` | `{success, data: {token}}` |

#### Batch — Vòng Đời Lô Thuốc

| Method | Endpoint | Role | Ghi chú |
|--------|----------|------|---------|
| POST | `/api/v1/batches` | Manufacturer | Tạo lô + bind QR. Response: `{batch, token, qrImageBase64}` |
| GET | `/api/v1/batches` | Tất cả | `?page=1&pageSize=20&status=ACTIVE&ownerMSP=ManufacturerMSP` |
| GET | `/api/v1/batches/:batchId` | Tất cả | Đọc đầy đủ state từ ledger |
| POST | `/api/v1/batches/:batchId/ship` | Manufacturer/Distributor | `{receiverMSP, receiverUnitId}` |
| POST | `/api/v1/batches/:batchId/receive` | Distributor | Nhận lô đang IN_TRANSIT |
| POST | `/api/v1/batches/:batchId/confirm-delivered-to-consumption` | Distributor | Xác nhận giao đến điểm tiêu thụ |
| POST | `/api/v1/batches/:batchId/recall` | Regulator | Thu hồi khẩn cấp |

#### QR & Verification

| Method | Endpoint | Role | Ghi chú |
|--------|----------|------|---------|
| POST | `/api/v1/verify` | Public (không cần auth) | `multipart: image (required), packagingImage (optional)` |
| GET | `/api/v1/batches/:batchId/protected-qr` | Tất cả | Đọc QR metadata từ ledger |
| POST | `/api/v1/batches/:batchId/protected-qr/bind` | Manufacturer | Re-bind QR metadata |
| POST | `/api/v1/batches/:batchId/protected-qr/token-policy` | Regulator | `{actionType: "BLOCKLIST"|"REVOKE"|"RESTORE", tokenDigest, reason}` |

#### Documents, Events, Analytics

| Method | Endpoint | Role | Ghi chú |
|--------|----------|------|---------|
| POST | `/api/v1/batches/:batchId/documents` | Manufacturer | `multipart: document` hoặc JSON CID |
| POST | `/api/v1/batches/:batchId/events` | Tất cả | `{lat, lng, eventType, note?}` |
| GET | `/api/v1/batches/:batchId/events` | Tất cả | Timeline địa lý |
| GET | `/api/v1/analytics/heatmap` | Tất cả | `?southwestLat=...&northeastLat=...&buckets=50` |

#### Regulator

| Method | Endpoint | Role | Ghi chú |
|--------|----------|------|---------|
| GET | `/api/v1/regulator/alerts` | Regulator | `?page=1&pageSize=20&canonicalKey=SCAN_REJECTED` |
| GET | `/api/v1/regulator/alerts/:alertId` | Regulator | Chi tiết cảnh báo |
| GET | `/api/v1/regulator/reports/export` | Regulator | `?format=json|csv` |

---

### 7.3 Verify Product — Request Chi Tiết (Endpoint quan trọng nhất)

```javascript
// FE gửi QR image (bắt buộc) và ảnh bao bì (tuỳ chọn)
const formData = new FormData();
formData.append("image", qrImageFile);           // Ảnh QR scan được
formData.append("packagingImage", boxImageFile); // Ảnh hộp thuốc (AI verification)

const response = await fetch("/api/v1/verify", {
    method: "POST",
    body: formData
    // Không cần Authorization header — endpoint public
});

// Response thành công
{
  "success": true,
  "data": {
    "decision": "SCAN_ACCEPTED",     // SCAN_ACCEPTED | SCAN_REJECTED
    "safetyStatus": {
      "level": "OK",                 // OK | WARNING | DANGER
      "code": "OK",
      "message": "Batch is active"
    },
    "batch": {
      "batchID": "BATCH_2026_DHG_A01",
      "drugName": "Hapacol 650 Extra",
      "status": "ACTIVE",
      "scanCount": 142,
      "ownerMSP": "DistributorMSP",
      "expiryDate": "2027-12-31",
      "transferStatus": "DELIVERED"
    },
    "qrVerification": {
      "ledgerMatch": true,
      "isAuthentic": true,
      "confidenceScore": 0.88
    },
    "aiVerification": {
      "accepted": true,
      "verdict": "AUTHENTIC",
      "confidence_score": 0.81,
      "aiEnabled": true
    }
  }
}
```

---

### 7.4 Create Batch — Request Chi Tiết

```javascript
// POST /api/v1/batches
const token = localStorage.getItem("jwt");
const response = await fetch("/api/v1/batches", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
        drugName: "Hapacol 650 Extra",
        quantity: 10000,
        expiryDate: "2027-12-31"  // Format: YYYY-MM-DD
    })
});

// Response
{
  "success": true,
  "data": {
    "batch": { "batchID": "BATCH_1745134287_A3F", "drugName": "...", ... },
    "tokenDigest": "6f1af1f8f6934f...",
    "qrImageBase64": "iVBORw0KGgoAAAANS..."  // Render thành <img> để in QR
  }
}

// FE render QR:
// <img src={`data:image/png;base64,${data.qrImageBase64}`} />
```

---

### 7.5 Xử Lý State & Error Trên FE

#### Mô hình State Management

```mermaid
mindmap
  root((Frontend State))
    authState
      token
      user: role, mspId, userId
    batchListState
      items array
      page & total
      loading & error
    batchDetailState
      batch data
      qrState
      loading & error
    verifyState
      decision
      safetyStatus
      qrVerification
      aiVerification
```

#### Chiến Lược Token Refresh

```javascript
// Axios interceptor tự động refresh khi nhận 401
axiosInstance.interceptors.response.use(
    response => response,
    async error => {
        if (error.response?.status === 401 && !error.config._retry) {
            error.config._retry = true;
            
            const { data } = await axios.post("/api/v1/auth/refresh", null, {
                headers: { Authorization: `Bearer ${getStoredToken()}` }
            });
            
            storeToken(data.data.token);
            error.config.headers["Authorization"] = `Bearer ${data.data.token}`;
            return axiosInstance(error.config);
        }
        return Promise.reject(error);
    }
);
```

#### Error Handling Pattern

Mọi error từ backend đều theo chuẩn:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied for this role",
    "traceId": "4f838f6f-5a6e-4f9d-9f73-7c8152f0249d",
    "details": {}
  }
}
```

```javascript
// FE xử lý error codes:
const ERROR_MESSAGES = {
    "FORBIDDEN": "Bạn không có quyền thực hiện thao tác này",
    "FABRIC_DISABLED": "Blockchain đang bảo trì, vui lòng thử lại sau",
    "BATCH_NOT_FOUND": "Không tìm thấy lô thuốc",
    "QR_VERIFY_REJECTED": "QR không hợp lệ hoặc đã hết hiệu lực",
    "RATE_LIMIT_EXCEEDED": "Quá nhiều yêu cầu, vui lòng thử lại sau 1 phút",
    "TOKEN_INVALID": "Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại",
};

function handleApiError(error) {
    const code = error.response?.data?.error?.code;
    const traceId = error.response?.data?.error?.traceId;
    const message = ERROR_MESSAGES[code] || "Đã xảy ra lỗi không xác định";
    
    showToast({ message, type: "error", detail: `Mã lỗi: ${traceId}` });
    
    if (code === "TOKEN_INVALID" || code === "TOKEN_MISSING") {
        clearAuthState();
        redirectToLogin();
    }
}
```

#### Xử Lý Distributed System Latency

```javascript
// Các WRITE operations (submit transaction) cần loading indicator dài hơn
// Fabric block commit thường mất 2-5 giây
const TIMEOUTS = {
    READ: 8000,    // evaluate() — chỉ đọc peer
    WRITE: 25000,  // submit() — qua Orderer → Raft → commit
    AI: 15000,     // YOLOv8 inference
    QR: 10000,     // QR generate/verify
};

// Hiển thị progress indicator rõ ràng:
// "Đang ghi lên blockchain, vui lòng không đóng trang..."
```

---

## 8. Câu Hỏi Thường Gặp Từ Hội Đồng

**Q: Tại sao dùng Hyperledger Fabric thay vì Ethereum?**  
A: Fabric là **permissioned blockchain** — phù hợp doanh nghiệp vì kiểm soát được ai tham gia mạng, tốc độ cao (~1000 TPS so với ~15 TPS của Ethereum public), finality tức thì, chi phí không phụ thuộc gas price, và dữ liệu nhạy cảm không công khai.

**Q: Dữ liệu trên Fabric có thực sự bất biến không? Admin có xóa được không?**  
A: Ledger trong Fabric là **append-only blockchain** — mỗi block chứa hash của block trước. Để xóa một record cần tạo lại toàn bộ blockchain từ đầu và phải có sự đồng ý của `> 50%` organizations (Regulator + Manufacturer + Distributor). Riêng lẻ không ai xóa được.

**Q: Nếu Orderer sập thì sao?**  
A: Hệ thống dùng EtcdRaft với 3 Orderer nodes. Raft consensus cần `quorum = 2/3`. Nếu 1 Orderer sập, 2 Orderer còn lại vẫn đủ quorum — **network tiếp tục hoạt động**. Chỉ thất bại khi cả 2 Orderer cùng sập.

**Q: AI của bạn train trên data nào?**  
A: Dataset [Medicine Logo Detection](https://universe.roboflow.com/medicine-logo-classification/medicine-logo-detection/dataset/2) từ Roboflow với ~2000 ảnh bao bì thuốc thật/giả. Model YOLOv8 được train để phát hiện "authentic" và "counterfeit" labels trên packaging image. Model weights (`best.pt`) được export từ Colab training notebook.

**Q: Hệ thống scale như thế nào?**  
A: Backend stateless — có thể chạy nhiều instance sau load balancer. Fabric scale bằng cách thêm Peer nodes trong cùng org (horizontal) hoặc thêm Organization mới (federation). MongoDB sử dụng Replica Set cho high availability.

**Q: tokenDigest vs token — tại sao không lưu token lên ledger?**  
A: Token chứa `Base64Url(payload) + HMAC`. Nếu lưu raw token lên ledger, bất kỳ ai đọc ledger cũng có thể reproduce token và giả mạo scan. Chỉ lưu `SHA256(token)` — không thể reverse hash để lấy token gốc.

---

## 9. Hồ Sơ Thiết Kế Kỹ Thuật (Lead System Architect Perspective)

Đây là tài liệu được biên soạn phục vụ trực tiếp cho việc bảo vệ Hội đồng, phản biện kiến trúc và cung cấp cái nhìn chuyên sâu nhất từ góc độ của một Lead System Architect.

### 9.1 Trực Quan Hóa Kiến Trúc Hiện Đại

#### 9.1.1 System Component Diagram & Protocols
Sơ đồ minh họa ranh giới kết nối mạng, các giao thức hạ tầng và cách các microservices phân mảnh độc lập.

```mermaid
graph TB
    subgraph "DMZ / Internet"
        API_GW[Nginx Reverse Proxy<br/>HTTPS :443]
    end

    subgraph "Backend Core Network"
        BE[Node.js Backend API<br/>REST / Express]
    end

    subgraph "Python Calculation Network"
        QRS[Protected QR Service<br/>HTTP REST]
        AIS[AI Verifier Service<br/>HTTP REST / Multipart]
    end

    subgraph "Ledger Network (VPC/VPN)"
        FAB[Fabric Gateway<br/>gRPC + TLS]
        P[Fabric Peer Nodes<br/>TCP :7051]
        O[Orderer Cluster EtcdRaft<br/>TCP :7050]
    end

    subgraph "Data Storage"
        MG[(MongoDB<br/>Mongoose TCP)]
        PF[(IPFS Pinata<br/>HTTPS API)]
    end

    API_GW -->|JWT Bearer| BE
    BE -->|application/json| QRS
    BE -->|multipart/form-data| AIS
    
    BE <-->|gRPC Bidirectional Stream| FAB
    FAB -->|ECDSA Signed Proposals| P
    P -->|Endorsed RWSet| O
    
    BE -->|Write-through Cache| MG
    BE -->|Immutable CID| PF
```

#### 9.1.2 Internal Layered Architecture & Orchestrator
Cấu trúc Layered Architecture thể hiện rõ `SupplyChainService` đóng vai trò là "Trái tim" (Orchestrator) của toàn bộ hệ thống.

```mermaid
graph TB
    subgraph "Presentation Layer"
        CTL[ProductController<br/>Zod Validator]
    end

    subgraph "Business Logic Layer"
        SCS((SupplyChainService<br/>Orchestrator))
    end

    subgraph "Integration Layer"
        QRA[QrService Adapter]
        AIA[AiVerifier Adapter]
        FAB[LedgerRepository]
        MGA[AlertArchiveRepo]
    end

    CTL -->|DTO Request| SCS
    
    SCS -->|1. check signature| QRA
    SCS -->|2. infer fake| AIA
    SCS -->|3. consensus| FAB
    SCS -->|4. telemetry| MGA
    
    style SCS fill:#1e40af,stroke:#60a5fa,stroke-width:2px,color:#fff
```

#### 9.1.3 Chaincode Logic Flow (Deep Dive: `verifyBatch`)
Sơ đồ xử lý on-chain, bảo vệ tính toàn vẹn của scan count và ngăn chặn inflation spam.

```mermaid
flowchart TD
    START([Bắt đầu: verifyBatch]) --> READ[ctx.stub.getState]
    READ --> CHK1{Status == RECALLED?}
    CHK1 -- Yes --> RET1[Return DANGER_RECALLED]
    CHK1 -- No --> CHK2{Status == SUSPICIOUS?}
    CHK2 -- Yes --> RET2[Return DANGER_FAKE]
    
    CHK2 -- No --> CHK3{consumed == false?}
    CHK3 -- Yes --> EMT1[Emit GovMonitor Event]
    CHK3 -- No --> INC[scanCount ++]
    
    INC --> CHK4{scan > suspiciousThreshold?}
    CHK4 -- Yes --> ST1[Set SUSPICIOUS] --> EMT2[Emit PublicAlert Event]
    CHK4 -- No --> CHK5{scan > warningThreshold?}
    CHK5 -- Yes --> ST2[Set WARNING] --> EMT3[Emit GovMonitor Event]
    CHK5 -- No --> NML[Giữ nguyên ACTIVE]
    
    EMT2 --> CMT
    EMT3 --> CMT
    NML --> CMT
    ST1 --> CMT
    ST2 --> CMT
    EMT1 --> INC
    
    CMT[ctx.stub.putState] --> END([Return batch stats])
```

#### 9.1.4 Security Pipeline: Chữ Ký Số (Digital Signature)
Minh họa luồng Private Key ký Transaction, đảm bảo tính Non-repudiation (Chống chối bỏ).

```mermaid
sequenceDiagram
    participant REQ as Request Context
    participant PK as FileSystem / Vault
    participant SDK as Fabric Gateway (Backend)
    participant PEER as Fabric Peer (Enclave)

    REQ->>SDK: Resolve Actor MSP (e.g. ManufacturerMSP)
    SDK->>PK: Load Private Key (ECDSA P-256)
    SDK->>SDK: Hash SHA-256(Transaction Payload)
    SDK->>SDK: Sign Hash bằng Private Key
    SDK->>PEER: Gửi Proposal (+ Chữ ký ECDSA)
    
    Note over PEER: Cryptographic Validation
    PEER->>PEER: Tra cứu Public Key từ MSP Configuration
    PEER->>PEER: Verify Signature
    PEER-->>SDK: Trả về Signed Endorsement
```

### 9.2 Đặc Tả Kỹ Thuật Chuyên Sâu (Deep Dive)

#### 9.2.1 The Orchestrator (`SupplyChainService`)
- **Vai trò Trái tim:** Hệ thống kiến trúc Loose Coupling yêu cầu một "nhạc trưởng". `SupplyChainService` thực hiện Saga/Orchestration pattern: nó tiếp nhận lệnh, gọi AI Service lấy dự đoán, gọi QR Service giải mã, và cuối cùng dùng Fabric SDK để commit lên mạng phân tán. Nếu bất kỳ service phụ trợ nào sập, nó cung cấp Graceful Fallback (Fail-open) để flow Blockchain không bị gián đoạn.
- **Write-Through Cache MongoDB:** Hyperledger Fabric dùng CouchDB/LevelDB lưu state, vốn không sinh ra để query diện rộng (pagination, complex range filter). Giải pháp: Khi có thay đổi trên Ledger, `SupplyChainService` commit on-chain trước (`write`), nếu thành công sẽ lưu luôn object JSON mới nhất vào MongoDB (`through cache`). Mọi API GET List/Search từ Frontend chỉ đọc từ MongoDB. Điều này giúp UX đạt độ trễ < 50ms, trong khi Source of Truth vẫn nằm nguyên trên Blockchain.

#### 9.2.2 Identity & Security Context
- **Cơ chế MSP & Session Pooling:** Thay vì mỗi request phải tạo lại một gRPC channel tốn kém tài nguyên (handshake TLS mất 100-200ms), backend Cache các `Connect Sessions` theo chuỗi `MspId`. Khi Manufacturer A gửi request, hệ thống lấy ra kênh gRPC đã được cấu hình sẵn Private Key của Manufacturer A, giảm 80% overhead cho các lượt submit liên tiếp.
- **Tại sao lưu `tokenDigest` thay vì `token`:** `Raw Token` là tấm vé chứng thực QR bản vật lý (sở hữu token = cầm gói thuốc). Blockchain là sổ cái minh bạch, mọi node (Peer) đều xem được data. Nếu lưu Raw Token lên ledger, một kẻ nội gián (hoặc hacker tấn công một node bất kỳ) có thể extract token và tạo ra hàng triệu bản scan giả dạng "tôi đang cầm thuốc thật". Bằng cách mã hóa một chiều `SHA256(token)`, Ledger chỉ dùng để Verify (so sánh Hash), bảo vệ hoàn hảo Secret vật lý.

#### 9.2.3 AI & Computer Vision Pipeline
- **Fail-open Policy trong Hệ thống phân tán:** `AI_VERIFICATION_FAIL_OPEN`. AI Service sử dụng YOLOv8 rất nặng về Compute (GPU/CPU) và dễ gặp Timeout/OOM. Thay vì để tính năng xác thực lô thuốc bị 'chết' theo AI, API Gateway Node.js bọc Python call bằng một ngắt Timeout (10s) + catch Error. Nếu AI timeout, nó tự động trả về `accepted: true, confidence: 0` và pass qua Blockchain. Lô thuốc vẫn được giao dịch bình thường, đảm bảo business continuity. Hệ thống cảnh báo sẽ âm thầm báo cho Regulator việc AI node đang offline.

#### 9.2.4 DevOps & Scaling
Để scale-out (Thêm Distributor 4 vào network đang live):
- **Idempotent Infrastructure:**
  1. Dùng Fabric CA Server cấp phát bộ Crypto Material (Cert + Key) mới cho Org4.
  2. Regulator (Admin Channel) Submit một Configuration Update Transaction yêu cầu bổ sung Org4 vào Channel.
  3. Các Org đang tồn tại (Org 1,2,3) thực hiện ký (Sign) đồng thuận Update này.
  4. Channel cập nhật. Spin-up Docker cho Peer0.Org4.
  5. Peer0.Org4 tự động kết nối (Gossip Protocol) và đồng bộ sổ cái từ Block 0 mà không cần copy database bằng tay.

### 9.3 Kịch Bản Phản Biện Hội Đồng (Defense Strategy)

| Trọng điểm Phản biện | Câu hỏi "Tử huyệt" | Trả lời bảo vệ (Defense Answer) |
|---|---|---|
| **#1. Bảo mật QR** | Nếu em nói hệ thống chống làm giả, vậy người ta tải ảnh QR trên mạng rồi in ra dán lên hộp giả thì hệ thống xử lý thế nào? | Hệ thống dùng **Protected QR** không dùng QR tiêu chuẩn thường. Python core nhúng *Center Pattern* 154x154px vào QR. Đây là dạng cấu trúc nhạy cảm về mặt vật lý (copy-sensitive). Bất kỳ phản ứng in ấn hay photocopy lậu nào cũng làm suy giảm phổ ảnh của Center Pattern này. Node AI/Python sẽ check độ nhiễu và vỡ hạt, cho ra `confidenceScore < 0.55`, Blockchain sẽ tự động REJECT giao dịch scan đó và bắn Alert về cho NSX. |
| **#2. Submit vs Evaluate** | Tôi thấy code Fabric có đoạn dùng `submitTransaction` có đoạn dùng `evaluateTransaction`. Hai cái khác gì nhau, tại sao không dùng chung 1 cái? | `evaluateTransaction` chỉ truy vấn (READ) dữ liệu về node local, không thay đổi sổ cái, response ngay lập tức (~10-20ms). Trong khi đó `submitTransaction` là ghi (WRITE), nó kích hoạt toàn bộ luồng đồng thuận (Endorse -> Orderer -> Commit), mất khoảng 2-3 giây. Việc dùng sai (ví dụ query mà dùng submit) sẽ gây quá tải trầm trọng cho Orderer của mạng lưới. Do đó em phân tách nghiêm ngặt để tối ưu hiệu năng. |
| **#3. Bất biến & Tính đúng đắn** | Nếu Blockchain không cho xóa/sửa data, lỡ nhập sai dữ liệu lô thuốc thì em fix lỗi kiểu gì? | Đặc tính của Ledger là **Immutable** (Bất biến). Chúng ta không thể `DELETE` hay `UPDATE` đè giá trị cũ. Tuy nhiên, Chaincode của em được thiết kế cơ chế **Emergency Recall** và **Status Append**. Nếu tạo sai, NSX sẽ gọi API thay đổi State thành `RECALLED` (hủy lô). Log cũ và quá trình sai sót vẫn lưu vĩnh viễn trên sổ cái (World State) dưới dạng Audit Trail, tạo sự minh bạch tuyệt đối theo đúng chuẩn y tế. |
| **#4. Hiệu năng & Consensus** | Tại sao em chọn EtcdRaft mà không dùng Proof of Work (PoW) hay Proof of Stake (PoS) như Bitcoin/Ethereum? | Hệ thống quản lý thuốc là *Permissioned Blockchain* mạng riêng tư. PoW/PoS giải quyết bài toán chống Sybil Attack với user giấu mặt trên Internet, phải đánh đổi bằng tốc độ rùa bò và tốn điện năng cực lớn. Drug Guard có CA chứng nhận danh tính rõ ràng, dùng **EtcdRaft** giúp hệ thống chỉ cần đạt Quorum (Leader + Follower vote) là chốt block ngay lập tức (Finality tức thì), throughput có thể đạt hàng ngàn TPS phù hợp vận hành doanh nghiệp. |
| **#5. Kiến trúc Microservice** | Thiết kế Microservice gồm AI, QR riêng, rủi ro là mạng bị đứt giữa chừng lúc gọi AI. Hệ thống của em giải quyết thế nào (Resilience)? | Đề tài em áp dụng kiến trúc **Loose Coupling**. Code triển khai *Fail-open Policy* và asynchronous *Dead-letter Queue*. Ví dụ: Khi hàm processAlert bị lỗi gọi webhook ra ngoài, luồng chính vẫn response HTTP 200 cho frontend để UX trơn tru. Báo cáo tĩnh sẽ rơi vào queue lưu tại MongoDB chờ retry. Nếu AI sập, transaction báo Warning nhưng vẫn chốt lên được Fabric — không bao giờ để một feature vi mô chặn đứng xương sống chuỗi cung ứng. |
