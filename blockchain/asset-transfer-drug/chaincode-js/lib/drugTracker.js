"use strict";

const { Contract } = require("fabric-contract-api");
const {
    MSP_CANONICAL,
    PROTECTED_QR_VERIFICATION_POLICY,
} = require("./drugTracker.constants");

class DrugTrackerContract extends Contract {
    _requireNonEmptyString(value, fieldName) {
        const normalized = value ? String(value).trim() : "";
        if (!normalized) {
            throw new Error(`Denied: ${fieldName} must be provided.`);
        }
        return normalized;
    }

    _requireOptionalString(value) {
        if (value === undefined || value === null) {
            return "";
        }
        return String(value);
    }

    _assertHex(value, expectedLength, fieldName) {
        const normalized = this._requireNonEmptyString(
            value,
            fieldName,
        ).toLowerCase();
        const regex = new RegExp(`^[0-9a-f]{${expectedLength}}$`);
        if (!regex.test(normalized)) {
            throw new Error(
                `Denied: ${fieldName} must be ${expectedLength} hex chars.`,
            );
        }
        return normalized;
    }

    _parseBoolean(value, fieldName) {
        const normalized = this._requireNonEmptyString(
            value,
            fieldName,
        ).toLowerCase();
        if (normalized === "true" || normalized === "1") {
            return true;
        }
        if (normalized === "false" || normalized === "0") {
            return false;
        }
        throw new Error(`Denied: ${fieldName} must be true/false or 1/0.`);
    }

    _parseConfidenceScore(value) {
        const parsed = Number(
            this._requireNonEmptyString(value, "confidence_score"),
        );
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
            throw new Error(
                "Denied: confidence_score must be a number in range [0, 1].",
            );
        }
        return parsed;
    }

    _getClientMSP(ctx) {
        return ctx.clientIdentity.getMSPID();
    }

    _toCanonicalMSP(mspID) {
        return MSP_CANONICAL[mspID] || mspID;
    }

    _isCanonicalMSP(mspID, targetCanonical) {
        return this._toCanonicalMSP(mspID) === targetCanonical;
    }

    _sameMSP(mspA, mspB) {
        return this._toCanonicalMSP(mspA) === this._toCanonicalMSP(mspB);
    }

    _isOwnerOrRegulator(clientOrgID, batch) {
        return (
            this._sameMSP(clientOrgID, batch.ownerMSP) ||
            this._isCanonicalMSP(clientOrgID, "RegulatorMSP")
        );
    }

    _getTimestampISO(ctx) {
        const ts = ctx.stub.getTxTimestamp();
        const secondsRaw =
            typeof ts.getSeconds === "function" ? ts.getSeconds() : ts.seconds;
        const nanosRaw =
            typeof ts.getNanos === "function" ? ts.getNanos() : ts.nanos;

        const seconds =
            typeof secondsRaw === "object" && secondsRaw !== null
                ? Number(secondsRaw.low ?? secondsRaw.toString())
                : Number(secondsRaw);
        const nanos = Number(nanosRaw ?? 0);

        return new Date(
            seconds * 1000 + Math.floor(nanos / 1000000),
        ).toISOString();
    }

    _normalizeExpiryDate(expiryDate) {
        const normalizedExpiryDate = expiryDate
            ? String(expiryDate).trim()
            : "";
        if (
            normalizedExpiryDate &&
            Number.isNaN(Date.parse(normalizedExpiryDate))
        ) {
            throw new Error(
                "Denied: expiryDate must be a valid date string (ISO-8601 recommended).",
            );
        }
        return normalizedExpiryDate;
    }

    _normalizeProtectedQrPolicy(policy) {
        const authenticThreshold = Number(
            policy && policy.authentic_threshold !== undefined
                ? policy.authentic_threshold
                : PROTECTED_QR_VERIFICATION_POLICY.authentic_threshold,
        );
        const fakeThreshold = Number(
            policy && policy.fake_threshold !== undefined
                ? policy.fake_threshold
                : PROTECTED_QR_VERIFICATION_POLICY.fake_threshold,
        );

        if (
            !Number.isFinite(authenticThreshold) ||
            !Number.isFinite(fakeThreshold)
        ) {
            throw new Error(
                "Denied: protected QR verification policy is invalid.",
            );
        }

        return {
            authentic_threshold: authenticThreshold,
            fake_threshold: fakeThreshold,
        };
    }

    _buildProtectedQrDefaults(protectedQrState) {
        // Ledger schema remains snake_case for backward compatibility across existing states and events.
        return {
            data_hash: this._requireOptionalString(
                protectedQrState.data_hash || protectedQrState.dataHash,
            ),
            metadata_series: this._requireOptionalString(
                protectedQrState.metadata_series ||
                    protectedQrState.metadataSeries,
            ),
            metadata_issued: this._requireOptionalString(
                protectedQrState.metadata_issued ||
                    protectedQrState.metadataIssued,
            ),
            metadata_expiry: this._requireOptionalString(
                protectedQrState.metadata_expiry ||
                    protectedQrState.metadataExpiry,
            ),
            token_digest: this._requireOptionalString(
                protectedQrState.token_digest || protectedQrState.tokenDigest,
            ),
            last_bound_at: this._requireOptionalString(
                protectedQrState.last_bound_at || protectedQrState.lastBoundAt,
            ),
            bound_by: this._requireOptionalString(
                protectedQrState.bound_by || protectedQrState.boundBy,
            ),
            history: Array.isArray(protectedQrState.history)
                ? protectedQrState.history
                : [],
            verification_policy: this._normalizeProtectedQrPolicy(
                protectedQrState.verification_policy,
            ),
            verification_history: Array.isArray(
                protectedQrState.verification_history,
            )
                ? protectedQrState.verification_history
                : [],
        };
    }

    _ensureBatchDefaults(batch) {
        const protectedQr = this._buildProtectedQrDefaults(
            batch.protected_qr || batch.protectedQR || {},
        );
        batch.protected_qr = protectedQr;

        if (batch.protectedQR) {
            delete batch.protectedQR;
        }

        return batch;
    }

    async _getBatchOrThrow(ctx, batchID) {
        const buffer = await ctx.stub.getState(batchID);
        if (!buffer || buffer.length === 0) {
            throw new Error(`Denied: Batch ${batchID} does not exist.`);
        }
        return this._ensureBatchDefaults(JSON.parse(buffer.toString()));
    }

    async _putBatch(ctx, batchID, batch) {
        await ctx.stub.putState(
            batchID,
            Buffer.from(JSON.stringify(this._ensureBatchDefaults(batch))),
        );
    }

    async BatchExists(ctx, batchID) {
        const buffer = await ctx.stub.getState(batchID);
        return Boolean(buffer && buffer.length > 0);
    }

    async ReadBatch(ctx, batchID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        return JSON.stringify(batch);
    }

    _evaluateRisk(batch) {
        if (batch.status === "RECALLED") {
            return "DANGER_RECALLED";
        }
        if (batch.status === "SUSPICIOUS") {
            return "DANGER_FAKE";
        }
        if (
            batch.scanCount >= batch.warningThreshold ||
            batch.status === "WARNING"
        ) {
            return "WARNING";
        }
        return "SAFE";
    }

    _evaluateProtectedQrVerdict(
        isAuthentic,
        confidenceScore,
        verificationPolicy,
    ) {
        if (
            isAuthentic &&
            confidenceScore > verificationPolicy.authentic_threshold
        ) {
            return "AUTHENTIC";
        }
        if (
            !isAuthentic &&
            confidenceScore < verificationPolicy.fake_threshold
        ) {
            return "FAKE";
        }
        return "REVIEW_REQUIRED";
    }

    _buildDefaultBatch(batchID, drugName, ownerMSP, quantity, expiryDate) {
        return {
            docType: "batch",
            batchID,
            drugName,
            manufacturerMSP: ownerMSP,
            ownerMSP,
            expiryDate,
            totalSupply: quantity,
            scanCount: 0,
            warningThreshold: Math.ceil(quantity * 1.05),
            suspiciousThreshold: Math.ceil(quantity * 1.1),
            status: "ACTIVE",
            documents: {
                packageImage: {
                    currentCID: "",
                    lastUpdated: "",
                    pinned: false,
                    history: [],
                },
                qualityCert: {
                    currentCID: "",
                    lastUpdated: "",
                    pinned: true,
                    history: [],
                },
            },
            targetOwnerMSP: "",
            transferStatus: "NONE",
            transferHistory: [],
        };
    }

    async _createBatch(ctx, batchID, drugName, quantityStr, expiryDate) {
        const clientOrgID = this._getClientMSP(ctx);
        if (!this._isCanonicalMSP(clientOrgID, "ManufacturerMSP")) {
            throw new Error("Denied: Only ManufacturerMSP can create batches.");
        }

        const normalizedBatchID = this._requireNonEmptyString(
            batchID,
            "batchID",
        );
        const normalizedDrugName = this._requireNonEmptyString(
            drugName,
            "drugName",
        );

        const exists = await this.BatchExists(ctx, normalizedBatchID);
        if (exists) {
            throw new Error(
                `Denied: Batch ${normalizedBatchID} already exists.`,
            );
        }

        const quantity = parseInt(quantityStr, 10);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new Error("Denied: quantity must be a positive integer.");
        }

        const normalizedExpiryDate = this._normalizeExpiryDate(expiryDate);
        const canonicalOwnerMSP = this._toCanonicalMSP(clientOrgID);
        const batch = this._buildDefaultBatch(
            normalizedBatchID,
            normalizedDrugName,
            canonicalOwnerMSP,
            quantity,
            normalizedExpiryDate,
        );

        await this._putBatch(ctx, normalizedBatchID, batch);
        return JSON.stringify(batch);
    }

    /**
     * Create a batch without expiry date.
     */
    async CreateBatch(ctx, batchID, drugName, quantityStr) {
        return this._createBatch(ctx, batchID, drugName, quantityStr, "");
    }

    /**
     * Create a batch with expiry date validation.
     */
    async CreateBatchWithExpiry(
        ctx,
        batchID,
        drugName,
        quantityStr,
        expiryDate,
    ) {
        return this._createBatch(
            ctx,
            batchID,
            drugName,
            quantityStr,
            expiryDate,
        );
    }

    /**
     * Register one scan verification attempt and update risk status.
     */
    async VerifyBatch(ctx, batchID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);

        if (batch.status === "RECALLED") {
            return JSON.stringify({
                result: "DANGER_RECALLED",
                batchID,
                status: batch.status,
            });
        }

        if (batch.status === "SUSPICIOUS") {
            return JSON.stringify({
                result: "DANGER_FAKE",
                batchID,
                status: batch.status,
            });
        }

        batch.scanCount += 1;

        if (batch.scanCount >= batch.suspiciousThreshold) {
            if (batch.status !== "SUSPICIOUS") {
                batch.status = "SUSPICIOUS";
                await ctx.stub.setEvent(
                    "PublicAlert",
                    Buffer.from(
                        JSON.stringify({
                            batchID,
                            msg: "Suspicious scan volume detected",
                            scanCount: batch.scanCount,
                            suspiciousThreshold: batch.suspiciousThreshold,
                        }),
                    ),
                );
            }
        } else if (batch.scanCount >= batch.warningThreshold) {
            if (batch.status === "ACTIVE") {
                batch.status = "WARNING";
                await ctx.stub.setEvent(
                    "GovMonitor",
                    Buffer.from(
                        JSON.stringify({
                            batchID,
                            msg: "Scan anomaly threshold reached",
                            scanCount: batch.scanCount,
                            warningThreshold: batch.warningThreshold,
                        }),
                    ),
                );
            }
        }

        await this._putBatch(ctx, batchID, batch);
        return JSON.stringify(batch);
    }

    /**
     * Read-only risk evaluation for a batch.
     */
    async EvaluateBatchRisk(ctx, batchID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        return JSON.stringify({
            batchID,
            status: batch.status,
            scanCount: batch.scanCount,
            warningThreshold: batch.warningThreshold,
            suspiciousThreshold: batch.suspiciousThreshold,
            riskLevel: this._evaluateRisk(batch),
        });
    }

    /**
     * Update a batch document CID and emit pinning request event.
     */
    async UpdateDocument(ctx, batchID, docType, newCID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const clientOrgID = this._getClientMSP(ctx);

        if (!this._sameMSP(clientOrgID, batch.ownerMSP)) {
            throw new Error("Denied: Only current owner can update documents.");
        }

        if (!newCID || !newCID.trim()) {
            throw new Error("Denied: newCID must be provided.");
        }

        if (!batch.documents || !batch.documents[docType]) {
            throw new Error(`Denied: Unsupported document type ${docType}.`);
        }

        const ts = this._getTimestampISO(ctx);
        const document = batch.documents[docType];
        const oldCID = document.currentCID;

        if (oldCID) {
            document.history.push({
                cid: oldCID,
                updatedAt: document.lastUpdated || ts,
                updatedBy: ctx.clientIdentity.getID(),
            });
        }

        document.currentCID = newCID;
        document.lastUpdated = ts;
        document.pinned = false;

        await this._putBatch(ctx, batchID, batch);
        await ctx.stub.setEvent(
            "PinningRequest",
            Buffer.from(
                JSON.stringify({
                    batchID,
                    docType,
                    newCID,
                    oldCID: oldCID || "",
                }),
            ),
        );

        return JSON.stringify(batch);
    }

    /**
     * Anchor Protected QR metadata and digest for a batch.
     */
    async BindProtectedQR(
        ctx,
        batchID,
        dataHash,
        metadataSeries,
        metadataIssued,
        metadataExpiry,
        tokenDigest,
    ) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const protectedQr = batch.protected_qr;
        const clientOrgID = this._getClientMSP(ctx);

        if (!this._sameMSP(clientOrgID, batch.ownerMSP)) {
            throw new Error(
                "Denied: Only current owner can bind protected QR metadata.",
            );
        }

        const normalizedDataHash = this._assertHex(dataHash, 8, "data_hash");
        const normalizedSeries = this._assertHex(
            metadataSeries,
            16,
            "metadata_series",
        );
        const normalizedIssued = this._assertHex(
            metadataIssued,
            16,
            "metadata_issued",
        );
        const normalizedExpiry = this._assertHex(
            metadataExpiry,
            16,
            "metadata_expiry",
        );
        const normalizedTokenDigest = this._assertHex(
            tokenDigest,
            64,
            "token_digest",
        );

        const ts = this._getTimestampISO(ctx);
        if (protectedQr.token_digest) {
            protectedQr.history.push({
                data_hash: protectedQr.data_hash,
                metadata_series: protectedQr.metadata_series,
                metadata_issued: protectedQr.metadata_issued,
                metadata_expiry: protectedQr.metadata_expiry,
                token_digest: protectedQr.token_digest,
                replaced_at: ts,
                replaced_by: ctx.clientIdentity.getID(),
            });
        }

        protectedQr.data_hash = normalizedDataHash;
        protectedQr.metadata_series = normalizedSeries;
        protectedQr.metadata_issued = normalizedIssued;
        protectedQr.metadata_expiry = normalizedExpiry;
        protectedQr.token_digest = normalizedTokenDigest;
        protectedQr.last_bound_at = ts;
        protectedQr.bound_by = ctx.clientIdentity.getID();

        await this._putBatch(ctx, batchID, batch);
        await ctx.stub.setEvent(
            "ProtectedQRBound",
            Buffer.from(
                JSON.stringify({
                    batch_id: batchID,
                    token_digest: normalizedTokenDigest,
                    owner_msp: batch.ownerMSP,
                    bound_at: ts,
                }),
            ),
        );

        return JSON.stringify(protectedQr);
    }

    /**
     * Read anchored Protected QR state for a batch.
     */
    async ReadProtectedQR(ctx, batchID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        return JSON.stringify(batch.protected_qr);
    }

    /**
     * Read-only digest match check against anchored Protected QR data.
     */
    async VerifyProtectedQR(ctx, batchID, tokenDigest) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const protectedQr = batch.protected_qr;
        const normalizedTokenDigest = this._assertHex(
            tokenDigest,
            64,
            "token_digest",
        );
        const anchored = protectedQr.token_digest || "";
        const matched = anchored !== "" && anchored === normalizedTokenDigest;

        const payload = {
            batch_id: batchID,
            matched,
            anchored_token_digest: anchored,
            provided_token_digest: normalizedTokenDigest,
            last_bound_at: protectedQr.last_bound_at,
            bound_by: protectedQr.bound_by,
            verification_policy: protectedQr.verification_policy,
            // Backward-compatible aliases.
            batchID: batchID,
            anchoredTokenDigest: anchored,
            providedTokenDigest: normalizedTokenDigest,
            lastBoundAt: protectedQr.last_bound_at,
            boundBy: protectedQr.bound_by,
        };

        return JSON.stringify(payload);
    }

    /**
     * Persist physical QR verification evidence with confidence-based verdict.
     */
    async RecordProtectedQRVerification(
        ctx,
        batchID,
        isAuthentic,
        confidenceScore,
        tokenDigest,
    ) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const protectedQr = batch.protected_qr;
        const clientOrgID = this._getClientMSP(ctx);

        if (!this._isOwnerOrRegulator(clientOrgID, batch)) {
            throw new Error(
                "Denied: Only current owner or RegulatorMSP can record protected QR verification.",
            );
        }

        if (!protectedQr.token_digest) {
            throw new Error(
                "Denied: Protected QR metadata is not bound for this batch.",
            );
        }

        const normalizedTokenDigest = this._assertHex(
            tokenDigest,
            64,
            "token_digest",
        );
        if (normalizedTokenDigest !== protectedQr.token_digest) {
            throw new Error(
                "Denied: token_digest does not match the anchored protected QR digest.",
            );
        }

        const normalizedIsAuthentic = this._parseBoolean(
            isAuthentic,
            "is_authentic",
        );
        const normalizedConfidenceScore =
            this._parseConfidenceScore(confidenceScore);
        const verificationPolicy = protectedQr.verification_policy;
        const verdict = this._evaluateProtectedQrVerdict(
            normalizedIsAuthentic,
            normalizedConfidenceScore,
            verificationPolicy,
        );

        const verificationRecord = {
            is_authentic: normalizedIsAuthentic,
            confidence_score: normalizedConfidenceScore,
            token_digest: normalizedTokenDigest,
            verdict,
            recorded_at: this._getTimestampISO(ctx),
            recorded_by: ctx.clientIdentity.getID(),
            recorded_msp: this._toCanonicalMSP(clientOrgID),
        };

        protectedQr.verification_history.push(verificationRecord);

        await this._putBatch(ctx, batchID, batch);
        await ctx.stub.setEvent(
            "ProtectedQRVerificationRecorded",
            Buffer.from(
                JSON.stringify({
                    batch_id: batchID,
                    verdict,
                    confidence_score: normalizedConfidenceScore,
                    recorded_msp: verificationRecord.recorded_msp,
                }),
            ),
        );

        return JSON.stringify(verificationRecord);
    }

    /**
     * Mark batch transfer to another owner MSP.
     */
    async ShipBatch(ctx, batchID, receiverMSP) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const clientOrgID = this._getClientMSP(ctx);
        const normalizedReceiverMSP = this._requireNonEmptyString(
            receiverMSP,
            "receiverMSP",
        );

        if (!this._sameMSP(clientOrgID, batch.ownerMSP)) {
            throw new Error("Denied: Only current owner can ship the batch.");
        }

        if (batch.status !== "ACTIVE") {
            throw new Error("Denied: Only ACTIVE batches can be shipped.");
        }

        if (batch.transferStatus !== "NONE") {
            throw new Error("Denied: Batch is already in transit.");
        }

        if (this._sameMSP(normalizedReceiverMSP, clientOrgID)) {
            throw new Error(
                "Denied: receiverMSP must be different from current owner.",
            );
        }

        batch.targetOwnerMSP = this._toCanonicalMSP(normalizedReceiverMSP);
        batch.transferStatus = "IN_TRANSIT";

        await this._putBatch(ctx, batchID, batch);
        return JSON.stringify(batch);
    }

    /**
     * Confirm receipt of an in-transit batch by target owner MSP.
     */
    async ReceiveBatch(ctx, batchID) {
        const batch = await this._getBatchOrThrow(ctx, batchID);
        const clientOrgID = this._getClientMSP(ctx);

        if (batch.transferStatus !== "IN_TRANSIT") {
            throw new Error("Denied: Batch is not in transit.");
        }

        if (!this._sameMSP(clientOrgID, batch.targetOwnerMSP)) {
            throw new Error(
                "Denied: Only targetOwnerMSP can receive this batch.",
            );
        }

        const canonicalReceiver = this._toCanonicalMSP(clientOrgID);

        batch.transferHistory.push({
            from: batch.ownerMSP,
            to: canonicalReceiver,
            timestamp: this._getTimestampISO(ctx),
        });

        batch.ownerMSP = canonicalReceiver;
        batch.targetOwnerMSP = "";
        batch.transferStatus = "NONE";

        await this._putBatch(ctx, batchID, batch);
        return JSON.stringify(batch);
    }

    /**
     * Mark a batch as recalled (Regulator only).
     */
    async EmergencyRecall(ctx, batchID) {
        const clientOrgID = this._getClientMSP(ctx);
        if (!this._isCanonicalMSP(clientOrgID, "RegulatorMSP")) {
            throw new Error(
                "Denied: Only RegulatorMSP can initiate an emergency recall.",
            );
        }

        const batch = await this._getBatchOrThrow(ctx, batchID);

        if (batch.status !== "RECALLED") {
            batch.status = "RECALLED";
        }

        await this._putBatch(ctx, batchID, batch);
        return JSON.stringify(batch);
    }
}

module.exports = DrugTrackerContract;
