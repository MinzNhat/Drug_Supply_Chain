/**
 * Ledger repository interface aligned with chaincode signatures.
 */
const notImplemented = (methodName, args) => {
    void args;
    throw new Error(`LedgerRepository.${methodName} is not implemented`);
};

/**
 * Abstract repository contract for ledger operations.
 *
 * Concrete adapters (Fabric or disabled fallback) must implement each method.
 */
export class LedgerRepository {
    /** Create one batch on ledger and return domain payload. */
    async createBatch(...args) {
        return notImplemented("createBatch", args);
    }

    /** Read one batch from ledger by batch id. */
    async readBatch(...args) {
        return notImplemented("readBatch", args);
    }

    /** Verify one batch and return updated batch state. */
    async verifyBatch(...args) {
        return notImplemented("verifyBatch", args);
    }

    /** Bind protected QR metadata to one batch. */
    async bindProtectedQr(...args) {
        return notImplemented("bindProtectedQr", args);
    }

    /** Validate protected QR token digest for one batch. */
    async verifyProtectedQr(...args) {
        return notImplemented("verifyProtectedQr", args);
    }

    /** Persist protected QR verification signal for one batch. */
    async recordProtectedQrVerification(...args) {
        return notImplemented("recordProtectedQrVerification", args);
    }

    /** Start ownership transfer for one batch. */
    async shipBatch(...args) {
        return notImplemented("shipBatch", args);
    }

    /** Finalize ownership transfer for one batch. */
    async receiveBatch(...args) {
        return notImplemented("receiveBatch", args);
    }

    /** Trigger emergency recall for one batch. */
    async emergencyRecall(...args) {
        return notImplemented("emergencyRecall", args);
    }

    /** Update one batch document CID. */
    async updateDocument(...args) {
        return notImplemented("updateDocument", args);
    }

    /** Resolve batch by protected-QR data hash lookup. */
    async getBatchByDataHash(...args) {
        return notImplemented("getBatchByDataHash", args);
    }
}

/**
 * Map ledger status string to API-facing safety classification.
 *
 * @param {string} status - Ledger batch status.
 * @returns {{ level: string, code: string, message: string }} Safety status payload.
 */
export const resolveSafetyStatus = (status) => {
    if (status === "RECALLED") {
        return {
            level: "DANGER",
            code: "DANGER_RECALLED",
            message: "Batch has been recalled",
        };
    }

    if (status === "SUSPICIOUS") {
        return {
            level: "DANGER",
            code: "DANGER_FAKE",
            message: "Batch flagged as suspicious",
        };
    }

    if (status === "WARNING") {
        return {
            level: "WARNING",
            code: "WARNING_THRESHOLD",
            message: "Batch exceeded warning threshold",
        };
    }

    return {
        level: "OK",
        code: "OK",
        message: "Batch is active",
    };
};
