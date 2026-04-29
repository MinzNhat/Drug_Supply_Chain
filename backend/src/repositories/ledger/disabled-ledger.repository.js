import { HttpException } from "../../utils/http-exception/http-exception.js";
import { LedgerRepository } from "./ledger.repository.js";

/**
 * Throw standardized error when Fabric repository is intentionally disabled.
 */
const disabledError = () => {
    throw new HttpException(
        503,
        "FABRIC_DISABLED",
        "Fabric integration is disabled. Set FABRIC_ENABLED=true and provide gateway credentials.",
    );
};

/**
 * Null-object ledger repository used when Fabric integration is unavailable.
 *
 * All operations fail fast with the same standardized `FABRIC_DISABLED` error.
 */
export class DisabledLedgerRepository extends LedgerRepository {
    async createBatch() {
        disabledError();
    }

    async readBatch() {
        disabledError();
    }

    async verifyBatch() {
        disabledError();
    }

    async bindProtectedQr() {
        disabledError();
    }

    async verifyProtectedQr() {
        disabledError();
    }

    async readProtectedQr() {
        disabledError();
    }

    async recordProtectedQrVerification() {
        disabledError();
    }

    async updateProtectedQrTokenPolicy() {
        disabledError();
    }

    async shipBatch() {
        disabledError();
    }

    async receiveBatch() {
        disabledError();
    }

    async confirmDeliveredToConsumption() {
        disabledError();
    }

    async emergencyRecall() {
        disabledError();
    }

    async updateDocument() {
        disabledError();
    }

    async getBatchByDataHash() {
        disabledError();
    }
}
