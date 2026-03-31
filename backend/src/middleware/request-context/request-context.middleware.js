import crypto from "crypto";

/**
 * Request/response header used for trace correlation.
 */
const TRACE_ID_HEADER = "x-trace-id";

/**
 * Validate incoming trace id format before reusing it.
 *
 * @param {string | undefined} value - Candidate trace id.
 * @returns {boolean} True when value matches accepted trace-id pattern.
 */
const isValidTraceId = (value) => {
    if (!value) {
        return false;
    }
    return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
};

/**
 * Attach a request-scoped trace id for logging and error responses.
 */
export const requestContextMiddleware = (req, res, next) => {
    const incomingTraceId = req.header(TRACE_ID_HEADER);
    const traceId = isValidTraceId(incomingTraceId)
        ? incomingTraceId
        : crypto.randomUUID();

    req.traceId = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);
    next();
};
