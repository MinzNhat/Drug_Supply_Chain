"use strict";

const {
    getClientMSP,
    isOwnerOrRegulator,
    sameMSP,
    toCanonicalMSP,
} = require("../helpers/identity");
const { getTimestampISO } = require("../helpers/time");
const {
    assertHex,
    parseBoolean,
    parseConfidenceScore,
} = require("../helpers/validation");
const { getBatchOrThrow, putBatch } = require("../repositories/batchRepository");

/**
 * evaluateProtectedQrVerdict is a helper function that determines the verification verdict for a protected QR code based on its authenticity, confidence score, and the defined verification policy. It categorizes the QR code as "AUTHENTIC", "FAKE", or "REVIEW_REQUIRED" based on whether the authenticity and confidence score meet the thresholds specified in the verification policy.
 *
 * @param {boolean} isAuthentic - A boolean indicating whether the QR code is considered authentic based on the verification process.
 * @param {number} confidenceScore - A numerical score representing the confidence level of the authenticity assessment, typically ranging from 0 to 1.
 * @param {Object} verificationPolicy - An object containing the thresholds for determining the verdict, including "authentic_threshold" and "fake_threshold".
 * @returns {string} The verdict for the protected QR code, which can be "AUTHENTIC", "FAKE", or "REVIEW_REQUIRED" based on the evaluation against the verification policy.
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
 * bindProtectedQR is a function that allows the current owner of a batch to bind protected QR code metadata to the batch. It validates the input parameters, updates the protected QR information in the batch, and emits an event to signal that the protected QR has been bound.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch to which the protected QR metadata will be bound.
 * @param {string} dataHash - A hexadecimal string representing the hash of the data associated with the protected QR code.
 * @param {string} metadataSeries - A hexadecimal string representing the series information for the protected QR code.
 * @param {string} metadataIssued - A hexadecimal string representing the issued timestamp for the protected QR code.
 * @param {string} metadataExpiry - A hexadecimal string representing the expiry timestamp for the protected QR code.
 * @param {string} tokenDigest - A hexadecimal string representing the digest of the token associated with the protected QR code.
 * @returns {string} A JSON string representation of the updated protected QR information after binding.
 * @throws Will throw an error if the caller is not the current owner, if any of the input parameters are invalid, or if there is an issue with updating the batch in the ledger.
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
 * readProtectedQR is a function that retrieves the protected QR code information associated with a batch. It uses the getBatchOrThrow helper function to fetch the batch and then returns the protected QR information as a JSON string.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch whose protected QR information is being retrieved.
 * @returns {string} A JSON string representation of the protected QR information associated with the specified batch.
 * @throws Will throw an error if the batch does not exist in the ledger.
 */
async function readProtectedQR(ctx, batchID) {
    const batch = await getBatchOrThrow(ctx, batchID);

    return JSON.stringify(batch.protected_qr);
}

/**
 * verifyProtectedQR is a function that performs a read-only check to verify if the provided token digest matches the anchored token digest in the protected QR information for a batch. It returns a JSON string indicating whether the token digest matches, along with relevant metadata about the anchored protected QR code.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state.
 * @param {string} batchID - The unique identifier of the batch whose protected QR information is being verified.
 * @param {string} tokenDigest - A hexadecimal string representing the token digest to be verified against the anchored protected QR information.
 * @returns {string} A JSON string containing the verification result, including whether the token digest matches, the anchored token digest, provided token digest, and metadata about the anchored protected QR code.
 * @throws Will throw an error if the batch does not exist in the ledger or if there is an issue with retrieving the batch information.
 */
async function verifyProtectedQR(ctx, batchID, tokenDigest) {
    const batch = await getBatchOrThrow(ctx, batchID);
    const protectedQr = batch.protected_qr;
    const normalizedTokenDigest = assertHex(tokenDigest, 64, "token_digest");
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
 * recordProtectedQRVerification is a function that allows the current owner or a regulator to record the results of a physical QR code verification process. It validates the input parameters, checks that the provided token digest matches the anchored token digest, evaluates the verification verdict based on the authenticity and confidence score, and then stores the verification record in the protected QR information for the batch. It also emits an event to signal that a protected QR verification has been recorded.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes access to the ledger state and client identity.
 * @param {string} batchID - The unique identifier of the batch for which the protected QR verification is being recorded.
 * @param {boolean} isAuthentic - A boolean indicating whether the physical QR code was verified as authentic.
 * @param {number} confidenceScore - A numerical score representing the confidence level of the authenticity assessment, typically ranging from 0 to 1.
 * @param {string} tokenDigest - A hexadecimal string representing the token digest that was verified during the physical QR code verification process.
 * @returns {string} A JSON string representation of the recorded verification information, including the verdict and relevant metadata.
 * @throws Will throw an error if the caller is not authorized, if the protected QR metadata is not bound, if the token digest does not match, or if there is an issue with updating the batch in
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

module.exports = {
    bindProtectedQR,
    readProtectedQR,
    verifyProtectedQR,
    recordProtectedQRVerification,
};
