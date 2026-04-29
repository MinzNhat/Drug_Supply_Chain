import {
    ensureActor,
    parseBatchPayload,
    parseProtectedQrPayload,
    parseVerifyBatchPayload,
    requireBatchIndexByDataHash,
    requireString,
    sha256,
    syncBatchSnapshot,
    toPublicScanActor,
    upsertBatchIndex,
} from "./fabric-ledger.helpers.js";
import { LedgerRepository, resolveSafetyStatus } from "./ledger.repository.js";

/**
 * Fabric-backed ledger repository aligned with chaincode methods.
 */
export class FabricLedgerRepository extends LedgerRepository {
    /**
     * @param {import("../../integrations/fabric/fabric-gateway.client.js").FabricGatewayClient} fabricGatewayClient
     */
    constructor(fabricGatewayClient) {
        super();
        this.fabricGatewayClient = fabricGatewayClient;
    }

    /** Create batch and bind protected-QR metadata in one orchestration flow. */
    async createBatch(actor, batchID, drugName, quantity, expiryDate, qr) {
        ensureActor(actor);

        await this.fabricGatewayClient.submit(
            actor,
            "CreateBatchWithExpiry",
            [batchID, drugName, String(quantity), expiryDate, String(actor.id)],
            actor.traceId,
        );

        const tokenDigest = sha256(qr.token);

        await this.bindProtectedQr(
            actor,
            batchID,
            {
                dataHash: qr.dataHash,
                metadataSeries: qr.metadataSeries,
                metadataIssued: qr.metadataIssued,
                metadataExpiry: qr.metadataExpiry,
                tokenDigest,
                token: qr.token,
            },
            actor.traceId,
        );

        const batch = await this.readBatch(actor, batchID);
        return {
            batch,
            tokenDigest,
        };
    }

    /** Read one batch state from ledger and sync local snapshot cache. */
    async readBatch(actor, batchID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.evaluate(
            actor,
            "ReadBatch",
            [batchID],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Verify one batch on ledger and derive API safety status mapping. */
    async verifyBatch(actor, batchID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "VerifyBatch",
            [batchID],
            actor.traceId,
        );

        const batch = parseVerifyBatchPayload(payload);
        await syncBatchSnapshot(batch);

        return {
            batch,
            safetyStatus: resolveSafetyStatus(batch.status),
        };
    }

    /** Bind protected QR metadata fields to target batch on ledger. */
    async bindProtectedQr(actor, batchID, bindingInput) {
        ensureActor(actor);

        const args = [
            requireString(batchID, "batchID"),
            requireString(bindingInput.dataHash, "dataHash"),
            requireString(bindingInput.metadataSeries, "metadataSeries"),
            requireString(bindingInput.metadataIssued, "metadataIssued"),
            requireString(bindingInput.metadataExpiry, "metadataExpiry"),
            requireString(bindingInput.tokenDigest, "tokenDigest"),
        ];

        const payload = await this.fabricGatewayClient.submit(
            actor,
            "BindProtectedQR",
            args,
            actor.traceId,
        );

        await upsertBatchIndex(batchID, bindingInput);

        return parseProtectedQrPayload(payload);
    }

    /** Check whether protected QR token digest matches ledger binding. */
    async verifyProtectedQr(actor, batchID, tokenDigest) {
        ensureActor(actor);

        const payload = await this.fabricGatewayClient.evaluate(
            actor,
            "VerifyProtectedQR",
            [batchID, tokenDigest],
            actor.traceId,
        );

        return parseProtectedQrPayload(payload);
    }

    /** Read anchored protected QR state for one batch. */
    async readProtectedQr(actor, batchID) {
        ensureActor(actor);

        const payload = await this.fabricGatewayClient.evaluate(
            actor,
            "ReadProtectedQR",
            [batchID],
            actor.traceId,
        );

        return parseProtectedQrPayload(payload);
    }

    /** Record one protected-QR verification event to ledger. */
    async recordProtectedQrVerification(
        actor,
        batchID,
        isAuthentic,
        confidenceScore,
        tokenDigest,
    ) {
        ensureActor(actor);

        const payload = await this.fabricGatewayClient.submit(
            actor,
            "RecordProtectedQRVerification",
            [
                batchID,
                String(Boolean(isAuthentic)),
                String(Number(confidenceScore)),
                tokenDigest,
            ],
            actor.traceId,
        );

        return parseProtectedQrPayload(payload);
    }

    /** Apply protected QR token policy action for one batch. */
    async updateProtectedQrTokenPolicy(actor, batchID, input) {
        ensureActor(actor);

        const payload = await this.fabricGatewayClient.submit(
            actor,
            "UpdateProtectedQRTokenPolicy",
            [
                requireString(batchID, "batchID"),
                requireString(input.actionType, "actionType"),
                requireString(input.tokenDigest, "tokenDigest"),
                input.reason ?? "",
                input.note ?? "",
            ],
            actor.traceId,
        );

        return parseProtectedQrPayload(payload);
    }

    /** Put batch into in-transit state toward receiver MSP. */
    async shipBatch(actor, batchID, receiverMSP, receiverUnitId = "", targetOwnerId = "") {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "ShipBatch",
            [batchID, receiverMSP, actor.distributorUnitId || "", receiverUnitId, targetOwnerId],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Complete in-transit batch transfer for receiving MSP. */
    async receiveBatch(actor, batchID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "ReceiveBatch",
            [batchID, actor.distributorUnitId || "", String(actor.id)],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Confirm delivery to consumption point before scan count can grow. */
    async confirmDeliveredToConsumption(actor, batchID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "ConfirmDeliveredToConsumption",
            [batchID],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Apply emergency recall transition to target batch. */
    async emergencyRecall(actor, batchID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "EmergencyRecall",
            [batchID],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Update one document CID associated with target batch. */
    async updateDocument(actor, batchID, docType, newCID) {
        ensureActor(actor);
        const payload = await this.fabricGatewayClient.submit(
            actor,
            "UpdateDocument",
            [batchID, docType, newCID],
            actor.traceId,
        );
        const batch = parseBatchPayload(payload);
        await syncBatchSnapshot(batch);
        return batch;
    }

    /** Resolve batch by protected-QR data hash via index lookup and ledger read. */
    async getBatchByDataHash(dataHash, token = "") {
        const index = await requireBatchIndexByDataHash(dataHash, token);

        const actor = toPublicScanActor();
        const batch = await this.readBatch(actor, index.batchID);
        await syncBatchSnapshot(batch);
        return {
            ...batch,
            index,
        };
    }
}
