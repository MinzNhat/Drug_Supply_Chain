import axios from "axios";
import FormData from "form-data";
import { config } from "../config/index.js";
import { HttpException } from "../utils/http-exception.js";

/**
 * AI appearance verification service that proxies to Python inference core.
 */
export class AiAppearanceService {
    /**
     * Build Python-core HTTP client.
     */
    constructor() {
        this.http = axios.create({
            baseURL: config.pythonServiceUrl,
            timeout: config.requestTimeoutMs,
        });
    }

    /**
     * Verify packaging appearance by forwarding image payload to Python core.
     *
     * @param {Buffer | null} imageBuffer - Uploaded image bytes.
     * @param {string} traceId - Request trace id.
     * @returns {Promise<Record<string, unknown>>} AI verdict payload.
     */
    async verify(imageBuffer, traceId = "") {
        if (!imageBuffer) {
            throw new HttpException(
                400,
                "IMAGE_REQUIRED",
                "image field is required",
            );
        }

        const form = new FormData();
        form.append("image", imageBuffer, {
            filename: "packaging.png",
            contentType: "image/png",
        });

        const headers = {
            ...form.getHeaders(),
        };

        if (traceId) {
            headers["x-trace-id"] = traceId;
        }

        try {
            const response = await this.http.post("/verify", form, {
                headers,
            });
            return response.data ?? {};
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const detail = error.response?.data?.detail;

                if (status === 400) {
                    throw new HttpException(
                        400,
                        "AI_BAD_IMAGE",
                        typeof detail === "string"
                            ? detail
                            : "Invalid AI input image",
                    );
                }

                if (status === 503) {
                    throw new HttpException(
                        503,
                        "AI_MODEL_UNAVAILABLE",
                        typeof detail === "string"
                            ? detail
                            : "AI model is unavailable",
                    );
                }
            }

            throw new HttpException(
                502,
                "AI_UPSTREAM_FAILED",
                "AI inference core request failed",
                {
                    reason:
                        error instanceof Error ? error.message : String(error),
                },
            );
        }
    }
}
