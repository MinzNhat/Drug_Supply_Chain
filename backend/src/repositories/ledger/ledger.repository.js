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

    /** Read anchored protected QR state for one batch. */
    async readProtectedQr(...args) {
        return notImplemented("readProtectedQr", args);
    }

    /** Persist protected QR verification signal for one batch. */
    async recordProtectedQrVerification(...args) {
        return notImplemented("recordProtectedQrVerification", args);
    }

    /** Update protected QR token lifecycle policy for one batch. */
    async updateProtectedQrTokenPolicy(...args) {
        return notImplemented("updateProtectedQrTokenPolicy", args);
    }

    /** Start ownership transfer for one batch. */
    async shipBatch(...args) {
        return notImplemented("shipBatch", args);
    }

    /** Finalize ownership transfer for one batch. */
    async receiveBatch(...args) {
        return notImplemented("receiveBatch", args);
    }

    /** Confirm delivery to consumption point before scan-count growth. */
    async confirmDeliveredToConsumption(...args) {
        return notImplemented("confirmDeliveredToConsumption", args);
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
export const resolveSafetyStatus = (status, transferStatus = "") => {
    if (status === "RECALLED") {
        return {
            level: "DANGER",
            code: "DANGER_RECALLED",
            message: "Lô hàng đã bị thu hồi bởi cơ quan quản lý",
        };
    }

    if (status === "SUSPICIOUS") {
        return {
            level: "DANGER",
            code: "DANGER_FAKE",
            message: "Lô hàng bị đánh dấu là nghi ngờ hàng giả",
        };
    }

    // New logic: Check if the product has actually reached the market
    if (status === "ACTIVE") {
        if (transferStatus === "MINTED" || transferStatus === "CREATED") {
            return {
                level: "WARNING",
                code: "NOT_IN_MARKET",
                message: "Sản phẩm mới được khởi tạo, chưa xuất kho nhà máy",
            };
        }
        if (transferStatus === "IN_TRANSIT" || transferStatus === "SHIPPED") {
            return {
                level: "WARNING",
                code: "IN_TRANSIT",
                message: "Sản phẩm đang được vận chuyển, chưa sẵn sàng để bán",
            };
        }
    }

    if (status === "MINTED") {
        return {
            level: "WARNING",
            code: "NOT_IN_MARKET",
            message: "Sản phẩm chưa được đưa ra lưu thông (Đang ở nhà máy)",
        };
    }

    return {
        level: "OK",
        code: "OK",
        message: "Sản phẩm hợp lệ và đã sẵn sàng sử dụng",
    };
};
