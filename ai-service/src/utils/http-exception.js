/**
 * HTTP exception wrapper for standardized API error responses.
 */
export class HttpException extends Error {
    /**
     * @param {number} status - HTTP status code.
     * @param {string} code - Stable machine-readable error code.
     * @param {string} message - Human-readable message.
     * @param {Record<string, unknown>=} details - Optional details.
     */
    constructor(status, code, message, details = undefined) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
