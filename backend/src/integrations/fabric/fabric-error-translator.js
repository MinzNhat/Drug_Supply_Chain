import { status as grpcStatus } from "@grpc/grpc-js";
import { HttpException } from "../../utils/http-exception/http-exception.js";

/**
 * gRPC status codes considered transient and eligible for retry.
 */
const transientGrpcCodes = new Set([
    grpcStatus.UNAVAILABLE,
    grpcStatus.DEADLINE_EXCEEDED,
    grpcStatus.RESOURCE_EXHAUSTED,
    grpcStatus.ABORTED,
]);

/**
 * Mapping from gRPC status code to HTTP status used by API responses.
 */
const statusByGrpcCode = {
    [grpcStatus.INVALID_ARGUMENT]: 400,
    [grpcStatus.NOT_FOUND]: 404,
    [grpcStatus.PERMISSION_DENIED]: 403,
    [grpcStatus.FAILED_PRECONDITION]: 409,
    [grpcStatus.ABORTED]: 409,
    [grpcStatus.UNAVAILABLE]: 503,
    [grpcStatus.DEADLINE_EXCEEDED]: 504,
};

/**
 * Mapping from HTTP status to stable application error code.
 */
const codeByHttpStatus = {
    400: "FABRIC_INVALID_ARGUMENT",
    403: "FABRIC_FORBIDDEN",
    404: "FABRIC_NOT_FOUND",
    409: "FABRIC_CONFLICT",
    503: "FABRIC_UNAVAILABLE",
    504: "FABRIC_TIMEOUT",
};

/**
 * Infer HTTP status from plain-text Fabric error message when gRPC code is absent.
 *
 * @param {unknown} message - Raw error message.
 * @returns {number} Inferred HTTP status.
 */
const inferStatusFromMessage = (message) => {
    const normalized = String(message || "").toLowerCase();

    if (normalized.includes("does not exist")) {
        return 404;
    }
    if (normalized.includes("already exists")) {
        return 409;
    }
    if (normalized.includes("denied:")) {
        return 403;
    }
    if (normalized.includes("must be")) {
        return 400;
    }

    return 502;
};

/**
 * Normalize and truncate Fabric error message before exposing it in API payload.
 *
 * @param {unknown} message - Raw error message.
 * @param {string} transactionName - Fabric transaction name.
 * @returns {string} Sanitized message.
 */
const sanitizeMessage = (message, transactionName) => {
    if (!message) {
        return `Fabric transaction ${transactionName} failed`;
    }

    const text = String(message).trim();
    return text.length > 220 ? `${text.slice(0, 220)}...` : text;
};

/**
 * Determine whether an invocation failure can be retried safely.
 *
 * @param {unknown} error - Error thrown by Fabric SDK.
 * @returns {boolean} True when retry should be attempted.
 */
export const isRetriableFabricError = (error) => {
    const grpcCode = Number(error?.code);
    if (Number.isFinite(grpcCode) && transientGrpcCodes.has(grpcCode)) {
        return true;
    }

    const message = String(error?.message || "").toLowerCase();
    return (
        message.includes("timeout") ||
        message.includes("temporarily unavailable") ||
        message.includes("connection")
    );
};

/**
 * Translate low-level Fabric errors into standardized API exceptions.
 *
 * @param {unknown} error - Error thrown by Fabric SDK.
 * @param {{ transactionName: string, mode: string, traceId: string }} context - Invocation context.
 * @returns {HttpException} Normalized HTTP exception.
 */
export const translateFabricError = (
    error,
    { transactionName, mode, traceId },
) => {
    const grpcCode = Number(error?.code);
    const hasGrpcCode = Number.isFinite(grpcCode);

    const status = hasGrpcCode
        ? (statusByGrpcCode[grpcCode] ?? 502)
        : inferStatusFromMessage(error?.message);

    const code = codeByHttpStatus[status] ?? "FABRIC_GATEWAY_ERROR";
    const message = sanitizeMessage(error?.message, transactionName);

    return new HttpException(status, code, message, {
        traceId,
        mode,
        transactionName,
        grpcCode: hasGrpcCode ? grpcCode : undefined,
    });
};
