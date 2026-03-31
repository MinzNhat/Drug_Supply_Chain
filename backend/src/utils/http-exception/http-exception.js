/**
 * Standard HTTP exception carrying status code and optional details.
 */
export class HttpException extends Error {
    /**
     * HTTP status code for the error.
     *
     * @type {number}
     */
    status;

    /**
     * Stable machine-readable error code.
     *
     * @type {string}
     */
    code;

    /**
     * Optional request trace id.
     *
     * @type {string | undefined}
     */
    traceId;

    /**
     * Optional structured details for troubleshooting or validation.
     *
     * @type {Record<string, unknown> | undefined}
     */
    details;

    /**
     * Create a new HttpException.
     *
     * @param {number} status - HTTP status code.
     * @param {string} codeOrMessage - Error code or legacy message.
     * @param {string | Record<string, unknown>=} messageOrDetails - Message (new style) or details (legacy style).
     * @param {Record<string, unknown>=} details - Optional structured details.
     */
    constructor(status, codeOrMessage, messageOrDetails, details) {
        let code = toDefaultCode(status);
        let message = "Unexpected error";
        let payload = undefined;

        if (typeof messageOrDetails === "string" && details !== undefined) {
            code = codeOrMessage;
            message = messageOrDetails;
            payload = details;
        } else if (typeof messageOrDetails === "string") {
            code = codeOrMessage;
            message = messageOrDetails;
        } else {
            message = codeOrMessage;
            payload = messageOrDetails;
        }

        super(message);
        this.status = status;
        this.code = code;
        this.details = payload;
        this.traceId =
            payload && typeof payload.traceId === "string"
                ? payload.traceId
                : undefined;
    }
}

/**
 * Resolve fallback machine code from HTTP status.
 *
 * @param {number} status - HTTP status code.
 * @returns {string} Default error code.
 */
const toDefaultCode = (status) => {
    if (status === 400) {
        return "BAD_REQUEST";
    }
    if (status === 401) {
        return "UNAUTHORIZED";
    }
    if (status === 403) {
        return "FORBIDDEN";
    }
    if (status === 404) {
        return "NOT_FOUND";
    }
    if (status === 409) {
        return "CONFLICT";
    }
    if (status === 429) {
        return "TOO_MANY_REQUESTS";
    }
    if (status === 502) {
        return "BAD_GATEWAY";
    }
    if (status === 503) {
        return "SERVICE_UNAVAILABLE";
    }
    if (status === 504) {
        return "GATEWAY_TIMEOUT";
    }
    return "INTERNAL_SERVER_ERROR";
};
