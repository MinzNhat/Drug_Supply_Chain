import axios from "axios";
import FormData from "form-data";
import { config } from "../../config/index.js";

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
        const response = await this.http.post("/api/v1/qr/generate", {
            dataHash: input.dataHash,
            metadataSeries: input.metadataSeries,
            metadataIssued: input.metadataIssued,
            metadataExpiry: input.metadataExpiry,
        });

        const data = response.data?.data ?? response.data;
        return {
            token: data?.token ?? "",
            qrImageBase64: data?.qrImageBase64 ?? "",
        };
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

        const response = await this.http.post("/api/v1/qr/verify", form, {
            headers: form.getHeaders(),
        });

        const payload = response.data ?? {};
        const decodedMeta = payload?.decodedMeta ?? {};

        return {
            token: payload?.token ?? "",
            isAuthentic: Boolean(payload?.isAuthentic),
            confidenceScore: Number(payload?.confidenceScore ?? 0),
            decodedMeta: {
                dataHash: decodedMeta?.dataHash ?? "",
                metadataSeries: decodedMeta?.metadataSeries ?? "",
                metadataIssued: decodedMeta?.metadataIssued ?? "",
                metadataExpiry: decodedMeta?.metadataExpiry ?? "",
            },
        };
    }
}
