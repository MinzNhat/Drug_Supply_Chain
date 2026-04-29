"use strict";

const {
    getClientMSP,
    isCanonicalMSP,
    isOwnerOrRegulator,
    sameMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const {
    assertHex,
    parseBoolean,
    parseConfidenceScore,
    requireNonEmptyString,
} = require("../helpers/validation");
const {
    getBatchOrThrow,
    putBatch,
} = require("../repositories/batchRepository");

const TOKEN_POLICY_BLOCKING_STATUSES = new Set(["BLOCKLISTED", "REVOKED"]);
const TOKEN_POLICY_ACTIONS = new Set(["BLOCKLIST", "REVOKE", "RESTORE"]);

function ensureTokenPolicy(protectedQr) {
    const tokenPolicy = protectedQr.token_policy || {};

    if (!Array.isArray(tokenPolicy.history)) {
        tokenPolicy.history = [];
    }

    tokenPolicy.status = tokenPolicy.status || "ACTIVE";
    tokenPolicy.token_digest = tokenPolicy.token_digest || "";
    tokenPolicy.reason = tokenPolicy.reason || "";
    tokenPolicy.note = tokenPolicy.note || "";
    tokenPolicy.action_type = tokenPolicy.action_type || "NONE";
    tokenPolicy.action_at = tokenPolicy.action_at || "";
    tokenPolicy.action_by = tokenPolicy.action_by || "";
    tokenPolicy.action_by_msp = tokenPolicy.action_by_msp || "";

    protectedQr.token_policy = tokenPolicy;
    return tokenPolicy;
}

function isBlockedByTokenPolicy(tokenPolicy, tokenDigest) {
    return (
        TOKEN_POLICY_BLOCKING_STATUSES.has(tokenPolicy.status) &&
        tokenPolicy.token_digest === tokenDigest
    );
}

/**
 * Determine the verification verdict for a protected QR based on AI authenticity and confidence.
 *
 * @param {boolean} isAuthentic - AI authenticity decision.
 * @param {number} confidenceScore - AI confidence score (0–1).
 * @param {Object} verificationPolicy - Thresholds: authentic_threshold, fake_threshold.
 * @returns {string} "AUTHENTIC" | "FAKE" | "REVIEW_REQUIRED".
 */
function evaluateProtectedQrVerdict(
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

    if (!isAuthentic && confidenceScore < verificationPolicy.fake_threshold) {
        return "FAKE";
    }

    return "REVIEW_REQUIRED";
}

/**
 * Bind protected QR metadata to a batch (manufacturer owner only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Target batch identifier.
 * @param {string} dataHash - Hex data hash of QR payload.
 * @param {string} metadataSeries - Hex metadata series.
 * @param {string} metadataIssued - Hex issued timestamp.
 * @param {string} metadataExpiry - Hex expiry timestamp.
 * @param {string} tokenDigest - Hex token digest.
 * @returns {string} JSON-serialized updated protected QR state.
 */
async function bindProtectedQR(
    ctx,
    batchID,
    dataHash,
    metadataSeries,
    metadataIssued,
    metadataExpiry,
    tokenDigest,
) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const protectedQr = batch.protected_qr;
    const clientOrgID = getClientMSP(ctx);

    if (!sameMSP(clientOrgID, batch.ownerMSP)) {
        throw new Error(
            "Denied: Only current owner can bind protected QR metadata.",
        );
    }

    if (!sameMSP(clientOrgID, "ManufacturerMSP")) {
        throw new Error(
            "Denied: Only ManufacturerMSP can bind protected QR metadata.",
        );
    }

    const normalizedDataHash = assertHex(dataHash, 8, "data_hash");
    const normalizedSeries = assertHex(metadataSeries, 16, "metadata_series");
    const normalizedIssued = assertHex(metadataIssued, 16, "metadata_issued");
    const normalizedExpiry = assertHex(metadataExpiry, 16, "metadata_expiry");
    const normalizedTokenDigest = assertHex(tokenDigest, 64, "token_digest");

    const ts = getTimestampISO(ctx);
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

    await putBatch(ctx, batchID, batch);
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
 * Read the protected QR state for a batch.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @returns {string} JSON-serialized protected QR object.
 */
async function readProtectedQR(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);

    return JSON.stringify(batch.protected_qr);
}

/**
 * Read-only token digest match check against anchored protected QR data.
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {string} tokenDigest - Hex token digest to verify.
 * @returns {string} JSON-serialized match result with policy status.
 */
async function verifyProtectedQR(ctx, batchID, tokenDigest) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const protectedQr = batch.protected_qr;
    const normalizedTokenDigest = assertHex(tokenDigest, 64, "token_digest");
    const anchored = protectedQr.token_digest || "";
    const digestMatched = anchored !== "" && anchored === normalizedTokenDigest;
    const tokenPolicy = ensureTokenPolicy(protectedQr);
    const policyBlocked =
        digestMatched && isBlockedByTokenPolicy(tokenPolicy, normalizedTokenDigest);
    const matched = digestMatched && !policyBlocked;

    const payload = {
        batch_id: batchID,
        matched,
        digest_matched: digestMatched,
        policy_blocked: policyBlocked,
        policy_status: tokenPolicy.status,
        anchored_token_digest: anchored,
        provided_token_digest: normalizedTokenDigest,
        last_bound_at: protectedQr.last_bound_at,
        bound_by: protectedQr.bound_by,
        verification_policy: protectedQr.verification_policy,
        // Backward-compatible aliases.
        batchID: batchID,
        digestMatched,
        policyBlocked,
        policyStatus: tokenPolicy.status,
        anchoredTokenDigest: anchored,
        providedTokenDigest: normalizedTokenDigest,
        lastBoundAt: protectedQr.last_bound_at,
        boundBy: protectedQr.bound_by,
    };

    return JSON.stringify(payload);
}

/**
 * Record physical QR verification evidence (owner or regulator only).
 *
 * @param {Context} ctx - Fabric transaction context.
 * @param {string} batchID - Batch identifier.
 * @param {boolean} isAuthentic - AI/human authenticity decision.
 * @param {number} confidenceScore - Confidence score (0–1).
 * @param {string} tokenDigest - Hex token digest from verified QR.
 * @returns {string} JSON-serialized recorded verification payload.
 */
async function recordProtectedQRVerification(
    ctx,
    batchID,
    isAuthentic,
    confidenceScore,
    tokenDigest,
) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const protectedQr = batch.protected_qr;
    const clientOrgID = getClientMSP(ctx);

    if (!isOwnerOrRegulator(clientOrgID, batch)) {
        throw new Error(
            "Denied: Only current owner or RegulatorMSP can record protected QR verification.",
        );
    }

    if (!protectedQr.token_digest) {
        throw new Error(
            "Denied: Protected QR metadata is not bound for this batch.",
        );
    }

    const normalizedTokenDigest = assertHex(tokenDigest, 64, "token_digest");
    if (normalizedTokenDigest !== protectedQr.token_digest) {
        throw new Error(
            "Denied: token_digest does not match the anchored protected QR digest.",
        );
    }

    const tokenPolicy = ensureTokenPolicy(protectedQr);
    if (isBlockedByTokenPolicy(tokenPolicy, normalizedTokenDigest)) {
        throw new Error(
            `Denied: token_digest is ${tokenPolicy.status} by regulator token policy.`,
        );
    }

    const normalizedIsAuthentic = parseBoolean(isAuthentic, "is_authentic");
    const normalizedConfidenceScore = parseConfidenceScore(confidenceScore);
    const verificationPolicy = protectedQr.verification_policy;
    const verdict = evaluateProtectedQrVerdict(
        normalizedIsAuthentic,
        normalizedConfidenceScore,
        verificationPolicy,
    );

    const verificationRecord = {
        is_authentic: normalizedIsAuthentic,
        confidence_score: normalizedConfidenceScore,
        token_digest: normalizedTokenDigest,
        verdict,
        recorded_at: getTimestampISO(ctx),
        recorded_by: ctx.clientIdentity.getID(),
        recorded_msp: toCanonicalMSP(clientOrgID),
    };

    protectedQr.verification_history.push(verificationRecord);

    await putBatch(ctx, batchID, batch);
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
 * updateProtectedQRTokenPolicy updates protected QR token lifecycle policy.
 */
async function updateProtectedQRTokenPolicy(
    ctx,
    batchID,
    actionType,
    tokenDigest,
    reason,
    note,
) {
    const clientOrgID = getClientMSP(ctx);
    if (!isCanonicalMSP(clientOrgID, "RegulatorMSP")) {
        throw new Error(
            "Denied: Only RegulatorMSP can update protected QR token policy.",
        );
    }

    const batch = await getBatchOrThrow(ctx, batchID);
    const protectedQr = batch.protected_qr;

    if (!protectedQr.token_digest) {
        throw new Error(
            "Denied: Protected QR metadata is not bound for this batch.",
        );
    }

    const normalizedActionType = requireNonEmptyString(
        actionType,
        "action_type",
    ).toUpperCase();
    if (!TOKEN_POLICY_ACTIONS.has(normalizedActionType)) {
        throw new Error(
            "Denied: action_type must be one of BLOCKLIST, REVOKE, RESTORE.",
        );
    }

    const normalizedTokenDigest = assertHex(tokenDigest, 64, "token_digest");
    if (normalizedTokenDigest !== protectedQr.token_digest) {
        throw new Error(
            "Denied: token_digest does not match the anchored protected QR digest.",
        );
    }

    const normalizedReason = String(reason || "").trim();
    const normalizedNote = String(note || "").trim();
    if (
        (normalizedActionType === "BLOCKLIST" ||
            normalizedActionType === "REVOKE") &&
        !normalizedReason
    ) {
        throw new Error(
            `Denied: reason is required for ${normalizedActionType}.`,
        );
    }

    const tokenPolicy = ensureTokenPolicy(protectedQr);
    const statusBefore = tokenPolicy.status;
    let statusAfter = statusBefore;

    if (normalizedActionType === "BLOCKLIST") {
        statusAfter = "BLOCKLISTED";
    } else if (normalizedActionType === "REVOKE") {
        statusAfter = "REVOKED";
        batch.status = "SUSPICIOUS";
    } else {
        if (statusBefore !== "BLOCKLISTED") {
            throw new Error(
                "Denied: RESTORE is only allowed when token policy is BLOCKLISTED.",
            );
        }
        statusAfter = "ACTIVE";
    }

    const actedAt = getTimestampISO(ctx);
    const actedBy = ctx.clientIdentity.getID();
    const actedByMsp = toCanonicalMSP(clientOrgID);

    tokenPolicy.status = statusAfter;
    tokenPolicy.token_digest = normalizedTokenDigest;
    tokenPolicy.reason = normalizedReason;
    tokenPolicy.note = normalizedNote;
    tokenPolicy.action_type = normalizedActionType;
    tokenPolicy.action_at = actedAt;
    tokenPolicy.action_by = actedBy;
    tokenPolicy.action_by_msp = actedByMsp;
    tokenPolicy.history.push({
        action_type: normalizedActionType,
        status_before: statusBefore,
        status_after: statusAfter,
        token_digest: normalizedTokenDigest,
        reason: normalizedReason,
        note: normalizedNote,
        acted_at: actedAt,
        acted_by: actedBy,
        acted_by_msp: actedByMsp,
    });

    await putBatch(ctx, batchID, batch);
    await ctx.stub.setEvent(
        "ProtectedQRTokenPolicyUpdated",
        Buffer.from(
            JSON.stringify({
                batch_id: batchID,
                action_type: normalizedActionType,
                status_before: statusBefore,
                status_after: statusAfter,
                acted_by_msp: actedByMsp,
                acted_at: actedAt,
            }),
        ),
    );

    return JSON.stringify({
        batchID,
        actionType: normalizedActionType,
        policyStatus: statusAfter,
        batchStatus: batch.status,
    });
}

module.exports = {
    bindProtectedQR,
    readProtectedQR,
    verifyProtectedQR,
    recordProtectedQRVerification,
    recordProtectedQrVerification: recordProtectedQRVerification,
    updateProtectedQRTokenPolicy,
};
