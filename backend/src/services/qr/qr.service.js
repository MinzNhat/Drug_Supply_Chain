import axios from "axios";
import FormData from "form-data";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";

/**
 * Check whether a value is a plain object-like record.
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null;

/**
 * Build normalized HttpException from protected-QR upstream failures.
 *
 * @param {unknown} error
 * @param {string} fallbackCode
 * @param {string} fallbackMessage
 * @returns {HttpException}
 */
const mapQrServiceError = (error, fallbackCode, fallbackMessage) => {
    const statusCandidate = Number(error?.response?.status);
    const status =
        Number.isInteger(statusCandidate) &&
        statusCandidate >= 400 &&
        statusCandidate <= 599
            ? statusCandidate
            : 502;

    const responsePayload = isRecord(error?.response?.data)
        ? error.response.data
        : {};
    const errorPayload = isRecord(responsePayload.error)
        ? responsePayload.error
        : responsePayload;

    const code =
        typeof errorPayload.code === "string" && errorPayload.code.trim()
            ? errorPayload.code
            : fallbackCode;
    const message =
        typeof errorPayload.message === "string" && errorPayload.message.trim()
            ? errorPayload.message
            : fallbackMessage;

    const details = {};
    const legacyTraceId =
        typeof errorPayload.trace_id === "string" && errorPayload.trace_id
            ? errorPayload.trace_id
            : "";
    if (typeof errorPayload.traceId === "string" && errorPayload.traceId) {
        details.traceId = errorPayload.traceId;
    } else if (legacyTraceId) {
        details.traceId = legacyTraceId;
    }
    if (isRecord(errorPayload.details)) {
        details.upstreamDetails = errorPayload.details;
    }

    return new HttpException(status, code, message, details);
};

/**
 * Validate the generate endpoint success payload.
 *
 * @param {unknown} payload
 * @returns {{ token: string, qrImageBase64: string }}
 */
const parseGeneratePayload = (payload) => {
    const envelope = isRecord(payload) ? payload : {};
    const data = isRecord(envelope.data) ? envelope.data : envelope;

    if (
        typeof data.token !== "string" ||
        typeof data.qrImageBase64 !== "string" ||
        data.token.length === 0 ||
        data.qrImageBase64.length === 0
    ) {
        throw new HttpException(
            502,
            "QR_GENERATE_BAD_CONTRACT",
            "Protected QR generate response contract mismatch",
            {
                expectedFields: ["token", "qrImageBase64"],
            },
        );
    }

    return {
        token: data.token,
        qrImageBase64: data.qrImageBase64,
    };
};

/**
 * Validate the verify endpoint success payload.
 *
 * @param {unknown} payload
 * @returns {{ token: string, isAuthentic: boolean, confidenceScore: number, decodedMeta: { dataHash: string, metadataSeries: string, metadataIssued: string, metadataExpiry: string } }}
 */
const parseVerifyPayload = (payload) => {
    const body = isRecord(payload) ? payload : {};
    const decodedMeta = isRecord(body.decodedMeta) ? body.decodedMeta : {};

    if (
        typeof body.token !== "string" ||
        typeof body.isAuthentic !== "boolean" ||
        typeof body.confidenceScore !== "number" ||
        !Number.isFinite(body.confidenceScore)
    ) {
        throw new HttpException(
            502,
            "QR_VERIFY_BAD_CONTRACT",
            "Protected QR verify response contract mismatch",
            {
                expectedFields: ["token", "isAuthentic", "confidenceScore"],
            },
        );
    }

    return {
        token: body.token,
        isAuthentic: body.isAuthentic,
        confidenceScore: body.confidenceScore,
        decodedMeta: {
            dataHash:
                typeof decodedMeta.dataHash === "string"
                    ? decodedMeta.dataHash
                    : "",
            metadataSeries:
                typeof decodedMeta.metadataSeries === "string"
                    ? decodedMeta.metadataSeries
                    : "",
            metadataIssued:
                typeof decodedMeta.metadataIssued === "string"
                    ? decodedMeta.metadataIssued
                    : "",
            metadataExpiry:
                typeof decodedMeta.metadataExpiry === "string"
                    ? decodedMeta.metadataExpiry
                    : "",
        },
    };
};

/**
 * Service layer for protected QR generation and verification.
 */
export class QrService {
    /**
     * Initialize QR service HTTP client.
     */
    constructor() {
        this.http = axios.create({
            baseURL: config.qrServiceUrl,
            timeout: config.requestTimeoutMs,
        });
    }

    /**
     * Generate a protected QR token by delegating to the QR service.
     *
     * @param {{ dataHash: string, metadataSeries: string, metadataIssued: string, metadataExpiry: string }} input
     * @returns {Promise<{ token: string, qrImageBase64: string }>} Generated token and image.
     */
    async generate(input) {
        try {
            const response = await this.http.post("/api/v1/qr/generate", {
                dataHash: input.dataHash,
                metadataSeries: input.metadataSeries,
                metadataIssued: input.metadataIssued,
                metadataExpiry: input.metadataExpiry,
            });

            return parseGeneratePayload(response.data);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw mapQrServiceError(
                error,
                "QR_GENERATE_FAILED",
                "Protected QR generate request failed",
            );
        }
    }

    /**
     * Verify a QR image using the QR service.
     *
     * @param {Buffer} imageBuffer - Image data buffer.
     * @returns {Promise<{ token: string, isAuthentic: boolean, confidenceScore: number, decodedMeta: object | null }>} Verification result.
     */
    async verify(imageBuffer) {
        const form = new FormData();
        form.append("image", imageBuffer, {
            filename: "scan.png",
            contentType: "image/png",
        });

        try {
            const response = await this.http.post("/api/v1/qr/verify", form, {
                headers: form.getHeaders(),
            });

            return parseVerifyPayload(response.data);
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }

            throw mapQrServiceError(
                error,
                "QR_VERIFY_FAILED",
                "Protected QR verify request failed",
            );
        }
    }
}
