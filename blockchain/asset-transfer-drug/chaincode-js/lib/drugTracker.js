"use strict";

const { Contract } = require("fabric-contract-api");
const batchService = require("./services/batchService");
const documentService = require("./services/documentService");
const protectedQrService = require("./services/protectedQrService");
const transferService = require("./services/transferService");
const recallService = require("./services/recallService");

class DrugTrackerContract extends Contract {
    async BatchExists(ctx, batchID) {
        return batchService.batchExists(ctx, batchID);
    }

    async ReadBatch(ctx, batchID) {
        return batchService.readBatch(ctx, batchID);
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
        ownerId,
    ) {
        return batchService.createBatch(
            ctx,
            batchID,
            drugName,
            quantityStr,
            expiryDate,
            ownerId,
        );
    }

    /**
     * Register one scan verification attempt and update risk status.
     */
    async VerifyBatch(ctx, batchID, isInternal) {
        const internal = String(isInternal) === "true";
        return batchService.verifyBatch(ctx, batchID, internal);
    }

    /**
     * Confirm delivery to consumption point before public scan count growth.
     */
    async ConfirmDeliveredToConsumption(ctx, batchID) {
        return batchService.confirmDeliveredToConsumption(ctx, batchID);
    }

    /**
     * Read-only risk evaluation for a batch.
     */
    async EvaluateBatchRisk(ctx, batchID) {
        return batchService.evaluateBatchRisk(ctx, batchID);
    }

    /**
     * Update a batch document CID and emit pinning request event.
     */
    async UpdateDocument(ctx, batchID, docType, newCID) {
        return documentService.updateDocument(ctx, batchID, docType, newCID);
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
        return protectedQrService.bindProtectedQR(
            ctx,
            batchID,
            dataHash,
            metadataSeries,
            metadataIssued,
            metadataExpiry,
            tokenDigest,
        );
    }

    /**
     * Read anchored Protected QR state for a batch.
     */
    async ReadProtectedQR(ctx, batchID) {
        return protectedQrService.readProtectedQR(ctx, batchID);
    }

    /**
     * Read-only digest match check against anchored Protected QR data.
     */
    async VerifyProtectedQR(ctx, batchID, tokenDigest) {
        return protectedQrService.verifyProtectedQR(ctx, batchID, tokenDigest);
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
        return protectedQrService.recordProtectedQRVerification(
            ctx,
            batchID,
            isAuthentic,
            confidenceScore,
            tokenDigest,
        );
    }

    /**
     * Mark batch transfer to another owner MSP.
     */
    async ShipBatch(ctx, batchID, receiverMSP, senderUnitId, receiverUnitId, targetOwnerId) {
        return transferService.shipBatch(
            ctx,
            batchID,
            receiverMSP,
            senderUnitId,
            receiverUnitId,
            targetOwnerId,
        );
    }

    /**
     * Confirm receipt of an in-transit batch by target owner MSP.
     */
    async ReceiveBatch(ctx, batchID, receiverUnitId, receiverId) {
        return transferService.receiveBatch(ctx, batchID, receiverUnitId, receiverId);
    }

    /**
     * Mark a batch as recalled (Regulator only).
     */
    async EmergencyRecall(ctx, batchID) {
        return recallService.emergencyRecall(ctx, batchID);
    }
}

module.exports = DrugTrackerContract;
