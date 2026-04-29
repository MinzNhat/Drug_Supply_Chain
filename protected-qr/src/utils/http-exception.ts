/**
 * Standard HTTP exception carrying status code and optional details.
 */
export class HttpException extends Error {
    /**
     * HTTP status code for the error.
     */
    public readonly status: number;

    /**
     * Stable machine-readable error code.
     */
    public readonly code: string;

    /**
     * Optional request trace id.
     */
    public readonly traceId?: string;

    /**
     * Optional structured details for troubleshooting or validation.
     */
    public readonly details?: Record<string, unknown>;

    /**
     * Create a new HttpException.
     *
     * @param status - HTTP status code.
     * @param codeOrMessage - Error code or legacy message.
     * @param messageOrDetails - Message (new style) or details (legacy style).
     * @param details - Optional structured details.
     */
    constructor(
        status: number,
        codeOrMessage: string,
        messageOrDetails?: string | Record<string, unknown>,
        details?: Record<string, unknown>,
    ) {
        let code = toDefaultCode(status);
        let message = "Unexpected error";
        let payload: Record<string, unknown> | undefined;

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
        const legacyTraceId =
            payload && typeof payload.trace_id === "string"
                ? payload.trace_id
                : undefined;
        this.traceId =
            payload && typeof payload.traceId === "string"
                ? payload.traceId
                : legacyTraceId;
    }
}

const toDefaultCode = (status: number) => {
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
