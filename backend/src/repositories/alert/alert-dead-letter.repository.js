import { AlertDeadLetter } from "../../models/alert/alert-dead-letter.model.js";

/**
 * Repository for unrecoverable alert sink failures.
 */
export class AlertDeadLetterRepository {
    /**
     * Upsert one dead-letter row by idempotency key.
     *
     * @param {{
     *   idempotencyKey: string,
     *   canonicalKey: string,
     *   sinkEventId: string,
     *   sinkChannel: string,
     *   batchID?: string,
     *   traceId?: string,
     *   attemptsCount: number,
     *   finalErrorMessage: string,
     *   payload: Record<string, unknown>
     * }} input - Dead-letter payload.
     * @returns {Promise<Record<string, unknown>>} Persisted dead-letter row.
     */
    async upsert(input) {
        return AlertDeadLetter.findOneAndUpdate(
            { idempotencyKey: input.idempotencyKey },
            {
                $set: {
                    canonicalKey: input.canonicalKey,
                    sinkEventId: input.sinkEventId,
                    sinkChannel: input.sinkChannel,
                    batchID: input.batchID ?? "",
                    traceId: input.traceId ?? "",
                    attemptsCount: input.attemptsCount,
                    finalErrorMessage: input.finalErrorMessage,
                    failedAt: new Date(),
                    payload: input.payload,
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
}

/**
 * Build alert dead-letter repository instance.
 *
 * @returns {AlertDeadLetterRepository} Alert dead-letter repository.
 */
export const createAlertDeadLetterRepository = () =>
    new AlertDeadLetterRepository();
