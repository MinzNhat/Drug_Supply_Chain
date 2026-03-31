/**
 * Input payload for protected QR generation.
 * All fields must be hex strings with strict length requirements.
 *
 * @interface GenerateQrInput
 */
export interface GenerateQrInput {
    /**
     * Hex string (8 chars = 4 bytes) representing the data hash.
     * @type {string}
     */
    dataHash: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the series metadata.
     * @type {string}
     */
    metadataSeries: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the issued metadata.
     * @type {string}
     */
    metadataIssued: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the expiry metadata.
     * @type {string}
     */
    metadataExpiry: string;
}

/**
 * Output payload for protected QR generation.
 *
 * @interface GenerateQrOutput
 */
export interface GenerateQrOutput {
    /**
     * Base64Url token composed of payload and HMAC.
     * @type {string}
     */
    token: string;

    /**
     * Base64-encoded PNG image of the generated QR.
     * @type {string}
     */
    qrImageBase64: string;
}

/**
 * Decoded metadata extracted from a token payload.
 *
 * @interface DecodedMeta
 */
export interface DecodedMeta {
    /**
     * Hex string (8 chars = 4 bytes) representing the data hash.
     * @type {string}
     */
    dataHash: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the series metadata.
     * @type {string}
     */
    metadataSeries: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the issued metadata.
     * @type {string}
     */
    metadataIssued: string;

    /**
     * Hex string (16 chars = 8 bytes) representing the expiry metadata.
     * @type {string}
     */
    metadataExpiry: string;
}

/**
 * Output payload for QR verification.
 *
 * @interface VerifyQrOutput
 */
export interface VerifyQrOutput {
    /**
     * Original token decoded by Python core when available.
     * @type {string | null}
     */
    token: string | null;

    /**
     * Whether the QR is authentic based on pattern verification.
     * @type {boolean}
     */
    isAuthentic: boolean;

    /**
     * Confidence score from the pattern verification.
     * @type {number}
     */
    confidenceScore: number;

    /**
     * Decoded metadata from the token payload if available.
     * @type {DecodedMeta | null}
     */
    decodedMeta: DecodedMeta | null;
}
