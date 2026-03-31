import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

const TRACE_ID_HEADER = "x-trace-id";

const isValidTraceId = (value: string | undefined): value is string => {
    if (!value) {
        return false;
    }

    return /^[a-zA-Z0-9_-]{8,128}$/.test(value);
};

/**
 * Attach a trace id to each request for cross-service observability.
 */
export const requestContextMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    const incomingTraceId = req.header(TRACE_ID_HEADER);
    const traceId: string = isValidTraceId(incomingTraceId)
        ? incomingTraceId
        : crypto.randomUUID();

    req.traceId = traceId;
    res.setHeader(TRACE_ID_HEADER, traceId);
    next();
};
