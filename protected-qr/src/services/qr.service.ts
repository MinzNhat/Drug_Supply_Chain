import axios from "axios";
import crypto from "crypto";
import { Collection, Db } from "mongodb";
import { config } from "../config/index.js";
import { assertHexLength, hexToBuffer } from "../utils/hex.js";
import type {
    GenerateQrInput,
    GenerateQrOutput,
    VerifyQrOutput,
} from "./qr.types.js";

/**
 * Service layer for protected QR generation and verification.
 */
export class QrService {
    /**
     * Collection for immutable generation audit records.
     */
    private readonly auditCollection: Collection;

    /**
     * Collection for verification events and confidence scores.
     */
    private readonly verifyCollection: Collection;

    /**
     * Create a new service with MongoDB dependencies.
     *
     * @param db - Mongo database handle.
     */
    constructor(db: Db) {
        // Use dedicated collections for auditability and verification history.
        this.auditCollection = db.collection("qr_audit");
        this.verifyCollection = db.collection("qr_verify_logs");
    }

    /**
     * Generate a fixed-geometry protected QR token and image.
     *
     * The payload is a strict 34-byte structure:
     *  - Timestamp (6 bytes)
     *  - DataHash (4 bytes)
     *  - Series (8 bytes)
     *  - Issued (8 bytes)
     *  - Expiry (8 bytes)
     */
    async generate(input: GenerateQrInput): Promise<GenerateQrOutput> {
        // Strict hex validation to preserve byte-accurate packing.
        assertHexLength("dataHash", input.dataHash, 8);
        assertHexLength("metadataSeries", input.metadataSeries, 16);
        assertHexLength("metadataIssued", input.metadataIssued, 16);
        assertHexLength("metadataExpiry", input.metadataExpiry, 16);

        // Timestamp is written as 6 bytes (uint48) to meet the fixed payload layout.
        const timestampMs = Date.now();
        const tsBuffer = Buffer.alloc(6);
        tsBuffer.writeUIntBE(timestampMs, 0, 6);

        // Pack the payload in the exact byte order required by the standard.
        const payloadBinary = Buffer.concat([
            tsBuffer,
            hexToBuffer(input.dataHash),
            hexToBuffer(input.metadataSeries),
            hexToBuffer(input.metadataIssued),
            hexToBuffer(input.metadataExpiry),
        ]);

        // HMAC is truncated to 16 bytes (32 hex chars) for the fixed token length.
        const hmac = crypto
            .createHmac("sha256", config.hmacSecret)
            .update(payloadBinary)
            .digest("hex")
            .slice(0, 32);

        // URL-safe Base64 without padding ensures deterministic token length.
        const payloadB64 = payloadBinary
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        const token = `${payloadB64}.${hmac}`;

        // Delegate QR rendering to the Python core for deterministic geometry.
        const pythonRes = await axios.post(
            `${config.pythonServiceUrl}/generate-protected-qr`,
            {
                token,
                size: 600,
                border: 1,
            },
            { timeout: config.requestTimeoutMs },
        );

        const qrImageBase64 = pythonRes.data?.qr_image_base64;

        // Persist audit metadata for traceability and compliance.
        await this.auditCollection.insertOne({
            token,
            dataHash: input.dataHash,
            metadataSeries: input.metadataSeries,
            metadataIssued: input.metadataIssued,
            metadataExpiry: input.metadataExpiry,
            createdAt: new Date(),
        });

        return {
            token,
            qrImageBase64,
        };
    }

    /**
     * Verify a QR image using the Python core and decode the embedded metadata.
     */
    async verify(imageBase64: string): Promise<VerifyQrOutput> {
        // Delegate verification to Python to keep geometry-specific logic centralized.
        const pythonRes = await axios.post(
            `${config.pythonServiceUrl}/verify-protected-qr`,
            { image_base64: imageBase64 },
            { timeout: config.requestTimeoutMs },
        );

        const rawToken = pythonRes.data?.token ?? null;
        const token =
            rawToken && this.isTokenSignatureValid(rawToken) ? rawToken : null;
        const confidenceScore = Number(pythonRes.data?.confidence_score ?? 0);
        const isAuthentic = Boolean(pythonRes.data?.is_authentic) && Boolean(token);
        const decodedMeta = token ? this.decodeToken(token) : null;

        // Store verification results for audit trails.
        await this.verifyCollection.insertOne({
            token,
            confidenceScore,
            isAuthentic,
            tokenSignatureValid: Boolean(token),
            createdAt: new Date(),
        });

        return {
            token,
            isAuthentic,
            confidenceScore,
            decodedMeta,
        };
    }

    /**
     * Decode Base64Url payload into raw bytes.
     */
    private decodePayloadBuffer(payloadB64: string): Buffer | null {
        if (!payloadB64) {
            return null;
        }

        const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
        const padLength = (4 - (padded.length % 4)) % 4;
        const paddedB64 = padded + "=".repeat(padLength);

        let payload: Buffer;
        try {
            payload = Buffer.from(paddedB64, "base64");
        } catch {
            return null;
        }

        const normalized = payload
            .toString("base64")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");

        if (normalized !== payloadB64) {
            return null;
        }

        return payload;
    }

    /**
     * Verify token HMAC signature with timing-safe comparison.
     */
    private isTokenSignatureValid(token: string): boolean {
        const [payloadB64, providedSignature] = token.split(".");
        if (!payloadB64 || !providedSignature) {
            return false;
        }

        if (!/^[a-fA-F0-9]{32}$/.test(providedSignature)) {
            return false;
        }

        const payload = this.decodePayloadBuffer(payloadB64);
        if (!payload) {
            return false;
        }

        const expectedSignature = crypto
            .createHmac("sha256", config.hmacSecret)
            .update(payload)
            .digest("hex")
            .slice(0, 32);

        try {
            return crypto.timingSafeEqual(
                Buffer.from(providedSignature.toLowerCase(), "hex"),
                Buffer.from(expectedSignature, "hex"),
            );
        } catch {
            return false;
        }
    }

    /**
     * Decode the Base64Url payload back into fixed-size metadata fields.
     * Returns null if the payload length is not exactly 34 bytes.
     */
    private decodeToken(token: string) {
        const [payloadB64, signature] = token.split(".");
        if (!payloadB64 || !signature) {
            return null;
        }

        const payload = this.decodePayloadBuffer(payloadB64);
        if (!payload) {
            return null;
        }

        if (payload.length !== 34) {
            return null;
        }

        return {
            // Byte offsets must match the fixed payload layout.
            dataHash: payload.subarray(6, 10).toString("hex"),
            metadataSeries: payload.subarray(10, 18).toString("hex"),
            metadataIssued: payload.subarray(18, 26).toString("hex"),
            metadataExpiry: payload.subarray(26, 34).toString("hex"),
        };
    }
}
