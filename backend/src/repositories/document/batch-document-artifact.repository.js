import { BatchDocumentArtifact } from "../../models/batch/batch-document-artifact.model.js";

/**
 * Repository for off-chain document artifact metadata.
 */
export class BatchDocumentArtifactRepository {
    /**
     * Persist one artifact record.
     *
     * @param {Record<string, unknown>} payload
     * @returns {Promise<Record<string, unknown>>}
     */
    async save(payload) {
        const created = await BatchDocumentArtifact.create(payload);
        return created.toObject();
    }
}

/**
 * Build document artifact repository instance.
 *
 * @returns {BatchDocumentArtifactRepository}
 */
export const createBatchDocumentArtifactRepository =
    () => new BatchDocumentArtifactRepository();