import axios from "axios";
import FormData from "form-data";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";

/**
 * Parse numeric payload value safely.
 *
 * @param {unknown} value - Candidate numeric value.
 * @returns {number | null} Finite number or null.
 */
const safeNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Normalize AI verifier response payload to a stable internal shape.
 *
 * @param {Record<string, unknown>} payload - Raw verifier response body.
 * @returns {{ accepted: boolean, confidenceScore: number, verdict: string, raw: Record<string, unknown> }} Normalized response.
 */
const normalizeResult = (payload = {}) => {
    const confidenceScore =
        safeNumber(payload.confidence_score ?? payload.confidenceScore) ?? 0;

    const maybeAuthentic = payload.is_authentic ?? payload.isAuthentic;
    const maybeAccepted = payload.accepted ?? payload.is_genuine;
    const accepted =
        typeof maybeAccepted === "boolean"
            ? maybeAccepted
            : Boolean(maybeAuthentic);

    return {
        accepted,
        confidenceScore,
        verdict: accepted ? "AUTHENTIC" : "SUSPICIOUS",
        raw: payload,
    };
};

/**
 * Optional adapter for future AI-powered physical package verification.
 */
export class AiVerifierService {
    /**
     * Build optional AI verifier HTTP client from runtime config.
     */
    constructor() {
        this.enabled = config.aiVerification.enabled;
        this.failOpen = config.aiVerification.failOpen;
        this.http = this.enabled
            ? axios.create({
                  baseURL: config.aiVerification.serviceUrl,
                  timeout: config.aiVerification.timeoutMs,
              })
            : null;
    }

    /**
     * Verify optional packaging image and return normalized AI decision payload.
     *
     * @param {Buffer | null} imageBuffer - Optional packaging image bytes.
     * @param {string} traceId - Trace id propagated to downstream verifier.
     * @returns {Promise<Record<string, unknown>>} Verification decision payload.
     */
    async verify(imageBuffer, traceId = "") {
        if (!this.enabled) {
            return {
                enabled: false,
                code: "AI_DISABLED",
                accepted: true,
                confidenceScore: null,
                verdict: "NOT_RUN",
            };
        }

        if (!imageBuffer) {
            return {
                enabled: true,
                code: "AI_SKIPPED_NO_IMAGE",
                accepted: true,
                confidenceScore: null,
                verdict: "NOT_RUN",
            };
        }

        const form = new FormData();
        form.append("image", imageBuffer, {
            filename: "packaging.png",
            contentType: "image/png",
        });

        const headers = form.getHeaders();

        if (traceId) {
            headers["x-trace-id"] = traceId;
        }

        try {
            // Prefer the Node gateway contract and keep a compatibility fallback.
            let response;
            try {
                response = await this.http.post("/api/v1/verify", form, {
                    headers,
                });
            } catch (primaryError) {
                if (
                    axios.isAxiosError(primaryError) &&
                    primaryError.response?.status === 404
                ) {
                    response = await this.http.post("/verify", form, {
                        headers,
                    });
                } else {
                    throw primaryError;
                }
            }

            const result = normalizeResult(response.data ?? {});

            return {
                enabled: true,
                code: result.accepted ? "AI_ACCEPTED" : "AI_REJECTED",
                accepted: result.accepted,
                confidenceScore: result.confidenceScore,
                verdict: result.verdict,
                raw: result.raw,
            };
        } catch (error) {
            if (this.failOpen) {
                return {
                    enabled: true,
                    code: "AI_UNAVAILABLE_FAIL_OPEN",
                    accepted: true,
                    confidenceScore: null,
                    verdict: "UNKNOWN",
                };
            }

            throw new HttpException(
                502,
                "AI_VERIFY_FAILED",
                "Physical AI verification service is unavailable",
                {
                    reason:
                        error instanceof Error ? error.message : String(error),
                },
            );
        }
    }
}
