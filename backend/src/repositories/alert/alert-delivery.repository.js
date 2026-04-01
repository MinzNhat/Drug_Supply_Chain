import { AlertDelivery } from "../../models/alert/alert-delivery.model.js";

/**
 * Delivery state repository for canonical alert sink operations.
 */
export class AlertDeliveryRepository {
    /**
     * Find one delivery row by idempotency key.
     *
     * @param {string} idempotencyKey - Unique delivery key.
     * @returns {Promise<Record<string, unknown> | null>} Delivery row when present.
     */
    async findByIdempotencyKey(idempotencyKey) {
        return AlertDelivery.findOne({ idempotencyKey }).lean();
    }

    /**
     * Create pending delivery row when key is first seen.
     *
     * @param {{ idempotencyKey: string, alertPayload: Record<string, unknown>, sinkChannel: string }} input - Seed payload.
     * @returns {Promise<Record<string, unknown>>} Existing or inserted row.
     */
    async ensurePending(input) {
        return AlertDelivery.findOneAndUpdate(
            { idempotencyKey: input.idempotencyKey },
            {
                $setOnInsert: {
                    idempotencyKey: input.idempotencyKey,
                    canonicalKey: input.alertPayload.canonicalKey,
                    sinkEventId: input.alertPayload.sinkEventId,
                    batchID: input.alertPayload.batchID ?? "",
                    traceId: input.alertPayload.traceId ?? "",
                    sourceType: input.alertPayload.source?.type ?? "",
                    sourceKey: input.alertPayload.source?.key ?? "",
                    sinkChannel: input.sinkChannel,
                    status: "PENDING",
                    attemptsCount: 0,
                    payload: input.alertPayload,
                    attempts: [],
                },
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                lean: true,
            },
        );
    }

    /**
     * Append one failed attempt to delivery history.
     *
     * @param {{ idempotencyKey: string, attempt: number, errorMessage: string, retryScheduledAt: Date | null, statusCode?: number | null }} input - Failure metadata.
     * @returns {Promise<void>}
     */
    async markAttemptFailure(input) {
        const executedAt = new Date();

        await AlertDelivery.updateOne(
            { idempotencyKey: input.idempotencyKey },
            {
                $set: {
                    status: "RETRYING",
                    lastAttemptAt: executedAt,
                    retryScheduledAt: input.retryScheduledAt,
                    lastErrorMessage: input.errorMessage,
                },
                $inc: { attemptsCount: 1 },
                $push: {
                    attempts: {
                        attempt: input.attempt,
                        succeeded: false,
                        statusCode:
                            typeof input.statusCode === "number"
                                ? input.statusCode
                                : null,
                        errorMessage: input.errorMessage,
                        executedAt,
                    },
                },
            },
        );
    }

    /**
     * Mark delivery as successful.
     *
     * @param {{ idempotencyKey: string, attempt: number, statusCode?: number | null }} input - Success metadata.
     * @returns {Promise<void>}
     */
    async markDelivered(input) {
        const deliveredAt = new Date();

        await AlertDelivery.updateOne(
            { idempotencyKey: input.idempotencyKey },
            {
                $set: {
                    status: "DELIVERED",
                    deliveredAt,
                    lastAttemptAt: deliveredAt,
                    retryScheduledAt: null,
                    lastErrorMessage: "",
                },
                $inc: { attemptsCount: 1 },
                $push: {
                    attempts: {
                        attempt: input.attempt,
                        succeeded: true,
                        statusCode:
                            typeof input.statusCode === "number"
                                ? input.statusCode
                                : null,
                        errorMessage: "",
                        executedAt: deliveredAt,
                    },
                },
            },
        );
    }

    /**
     * Mark delivery row as dead-lettered after exhausting retries.
     *
     * @param {{ idempotencyKey: string, errorMessage: string }} input - Dead-letter metadata.
     * @returns {Promise<void>}
     */
    async markDeadLetter(input) {
        const deadLetteredAt = new Date();
        await AlertDelivery.updateOne(
            { idempotencyKey: input.idempotencyKey },
            {
                $set: {
                    status: "DEAD_LETTER",
                    deadLetteredAt,
                    retryScheduledAt: null,
                    lastErrorMessage: input.errorMessage,
                },
            },
        );
    }
}

/**
 * Build alert delivery repository instance.
 *
 * @returns {AlertDeliveryRepository} Alert delivery repository.
 */
export const createAlertDeliveryRepository = () =>
    new AlertDeliveryRepository();
