import { z } from "zod";
import type { GenerateQrInput } from "../services/qr.types.js";

/**
 * Validation schema for the generate endpoint.
 * Enforces fixed-length hex strings to match the 34-byte payload layout.
 */
export const generateQrSchema = z.object({
    /**
     * Hex string (8 chars = 4 bytes).
     */
    dataHash: z.string().length(8),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadataSeries: z.string().length(16),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadataIssued: z.string().length(16),

    /**
     * Hex string (16 chars = 8 bytes).
     */
    metadataExpiry: z.string().length(16),
});

/**
 * Type for validated generate request payloads.
 */
export type GenerateQrDto = z.infer<typeof generateQrSchema>;

/**
 * Map HTTP DTO to internal domain model.
 */
export const toGenerateQrInput = (dto: GenerateQrDto): GenerateQrInput => {
    return {
        dataHash: dto.dataHash,
        metadataSeries: dto.metadataSeries,
        metadataIssued: dto.metadataIssued,
        metadataExpiry: dto.metadataExpiry,
    };
};
