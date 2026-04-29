import crypto from "crypto";
import axios from "axios";
import FormData from "form-data";
import { config } from "../../config/index.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";

/**
 * Parse JSON body that may be returned as text.
 *
 * @param {unknown} payload
 * @returns {Record<string, unknown>}
 */
const asJsonObject = (payload) => {
    if (payload && typeof payload === "object") {
        return payload;
    }

    if (typeof payload === "string") {
        const normalized = payload.trim();
        const lastLine = normalized.includes("\n")
            ? normalized.split("\n").pop() ?? normalized
            : normalized;

        try {
            const parsed = JSON.parse(lastLine);
            if (parsed && typeof parsed === "object") {
                return parsed;
            }
        } catch (error) {
            void error;
        }
    }

    return {};
};

/**
 * Normalize and sanitize CID-like values from upstream providers.
 *
 * @param {unknown} rawCid
 * @returns {string}
 */
const normalizeCid = (rawCid) => {
    if (typeof rawCid !== "string") {
        return "";
    }

    return rawCid.trim();
};

/**
 * Build deterministic mock CID from digest for local fallback.
 *
 * @param {string} digestSha256
 * @returns {string}
 */
const buildMockCid = (digestSha256) => {
    return `mock${digestSha256.slice(0, 58)}`;
};

/**
 * Provider adapter for document storage backends.
 */
export class DocumentStorageAdapter {
    constructor(httpClient = axios.create()) {
        this.httpClient = httpClient;
    }

    /**
     * Upload document bytes and return storage metadata.
     *
     * @param {Buffer} fileBuffer
     * @param {{ fileName?: string, mediaType?: string, docType: string }} options
     * @returns {Promise<{ cid: string, provider: string, pinStatus: "pinned" | "uploaded", digestSha256: string, sizeBytes: number, mediaType: string }>} 
     */
    async uploadDocument(fileBuffer, options) {
        if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
            throw new HttpException(
                400,
                "INVALID_DOCUMENT_PAYLOAD",
                "Uploaded document payload is empty",
            );
        }

        const digestSha256 = crypto
            .createHash("sha256")
            .update(fileBuffer)
            .digest("hex");
        const sizeBytes = fileBuffer.length;
        const mediaType = options.mediaType || "application/octet-stream";
        const provider = config.documentUpload.provider;

        if (provider === "mock") {
            return {
                cid: buildMockCid(digestSha256),
                provider,
                pinStatus: "pinned",
                digestSha256,
                sizeBytes,
                mediaType,
            };
        }

        if (provider === "kubo") {
            const uploaded = await this.uploadToKubo(fileBuffer, {
                fileName: options.fileName,
                mediaType,
            });

            return {
                ...uploaded,
                provider,
                digestSha256,
                sizeBytes,
                mediaType,
            };
        }

        if (provider === "pinata") {
            const uploaded = await this.uploadToPinata(fileBuffer, {
                fileName: options.fileName,
                mediaType,
                docType: options.docType,
            });

            return {
                ...uploaded,
                provider,
                digestSha256,
                sizeBytes,
                mediaType,
            };
        }

        throw new HttpException(
            500,
            "DOC_STORAGE_PROVIDER_UNSUPPORTED",
            "Unsupported document storage provider",
            {
                provider,
            },
        );
    }

    /**
     * Upload to Kubo HTTP API.
     *
     * @param {Buffer} fileBuffer
     * @param {{ fileName?: string, mediaType: string }} options
     * @returns {Promise<{ cid: string, pinStatus: "pinned" | "uploaded" }>}
     */
    async uploadToKubo(fileBuffer, options) {
        const apiUrl = config.documentUpload.kubo.apiUrl;
        const token = config.documentUpload.kubo.authToken;
        const timeoutMs = config.documentUpload.timeoutMs;

        const formData = new FormData();
        formData.append("file", fileBuffer, {
            filename: options.fileName || "document.bin",
            contentType: options.mediaType,
        });

        const headers = {
            ...formData.getHeaders(),
        };

        if (token) {
            headers.authorization = token;
        }

        const url = `${apiUrl.replace(/\/$/, "")}/api/v0/add?pin=true&cid-version=1`;

        let response;
        try {
            response = await this.httpClient.post(url, formData, {
                headers,
                timeout: timeoutMs,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
        } catch (error) {
            throw new HttpException(
                502,
                "DOC_UPLOAD_FAILED",
                "Failed to upload document to Kubo",
                {
                    provider: "kubo",
                    reason: error instanceof Error ? error.message : "Unknown error",
                },
            );
        }

        const payload = asJsonObject(response.data);
        const cid = normalizeCid(payload.Hash);

        if (!cid) {
            throw new HttpException(
                502,
                "DOC_UPLOAD_FAILED",
                "Kubo did not return a CID",
                {
                    provider: "kubo",
                    status: response.status,
                },
            );
        }

        return {
            cid,
            pinStatus: "pinned",
        };
    }

    /**
     * Upload to Pinata pinning API.
     *
     * @param {Buffer} fileBuffer
     * @param {{ fileName?: string, mediaType: string, docType: string }} options
     * @returns {Promise<{ cid: string, pinStatus: "pinned" | "uploaded" }>}
     */
    async uploadToPinata(fileBuffer, options) {
        const apiUrl = config.documentUpload.pinata.apiUrl;
        const jwt = config.documentUpload.pinata.jwt;
        const timeoutMs = config.documentUpload.timeoutMs;

        if (!jwt) {
            throw new HttpException(
                500,
                "DOC_STORAGE_CONFIG_INVALID",
                "PINATA_JWT is required when provider is pinata",
            );
        }

        const formData = new FormData();
        formData.append("file", fileBuffer, {
            filename: options.fileName || "document.bin",
            contentType: options.mediaType,
        });
        formData.append(
            "pinataMetadata",
            JSON.stringify({
                name: options.fileName || "document.bin",
                keyvalues: {
                    docType: options.docType,
                },
            }),
        );

        const headers = {
            ...formData.getHeaders(),
            authorization: `Bearer ${jwt}`,
        };

        const url = `${apiUrl.replace(/\/$/, "")}/pinning/pinFileToIPFS`;

        let response;
        try {
            response = await this.httpClient.post(url, formData, {
                headers,
                timeout: timeoutMs,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
        } catch (error) {
            throw new HttpException(
                502,
                "DOC_UPLOAD_FAILED",
                "Failed to upload document to Pinata",
                {
                    provider: "pinata",
                    reason: error instanceof Error ? error.message : "Unknown error",
                },
            );
        }

        const payload = asJsonObject(response.data);
        const cid = normalizeCid(payload.IpfsHash);

        if (!cid) {
            throw new HttpException(
                502,
                "DOC_UPLOAD_FAILED",
                "Pinata did not return a CID",
                {
                    provider: "pinata",
                    status: response.status,
                },
            );
        }

        return {
            cid,
            pinStatus: "pinned",
        };
    }

    /**
     * Fetch document buffer by CID.
     * 
     * @param {string} cid 
     * @returns {Promise<{ buffer: Buffer, mediaType: string }>}
     */
    /**
     * Detect media type from buffer magic bytes.
     * 
     * @param {Buffer} buffer 
     * @returns {string | null}
     */
    detectMediaType(buffer) {
        if (!buffer || buffer.length < 4) return null;

        // PNG: 89 50 4E 47
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
            return "image/png";
        }

        // JPG: FF D8 FF
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            return "image/jpeg";
        }

        // PDF: 25 50 44 46 (%PDF)
        if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
            return "application/pdf";
        }

        // WEBP: RIFF....WEBP
        if (buffer.length > 12 &&
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
            return "image/webp";
        }

        return null;
    }

    async getDocument(cid) {
        const provider = config.documentUpload.provider;

        if (provider === "mock") {
            return {
                buffer: Buffer.from("Mock content for CID " + cid),
                mediaType: "text/plain",
            };
        }

        if (provider === "kubo") {
            const apiUrl = config.documentUpload.kubo.apiUrl;
            const url = `${apiUrl.replace(/\/$/, "")}/api/v0/cat?arg=${cid}`;
            
            try {
                const response = await this.httpClient.post(url, null, {
                    responseType: "arraybuffer",
                    timeout: config.documentUpload.timeoutMs,
                });
                const buffer = Buffer.from(response.data);
                const mediaType = this.detectMediaType(buffer) || response.headers["content-type"] || "application/octet-stream";
                
                return { buffer, mediaType };
            } catch (error) {
                throw new HttpException(502, "DOC_FETCH_FAILED", "Failed to fetch from Kubo", { cid });
            }
        }

        if (provider === "pinata") {
            const gatewayUrl = process.env.DOC_UPLOAD_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs";
            const url = `${gatewayUrl.replace(/\/$/, "")}/${cid}`;

            try {
                const response = await this.httpClient.get(url, {
                    responseType: "arraybuffer",
                    timeout: config.documentUpload.timeoutMs,
                });
                const buffer = Buffer.from(response.data);
                const mediaType = this.detectMediaType(buffer) || response.headers["content-type"] || "application/octet-stream";
                
                return { buffer, mediaType };
            } catch (error) {
                throw new HttpException(502, "DOC_FETCH_FAILED", "Failed to fetch from Pinata Gateway", { cid });
            }
        }

        throw new HttpException(500, "DOC_STORAGE_PROVIDER_UNSUPPORTED", "Unsupported provider");
    }
}