import { HttpException } from "./http-exception.js";

/**
 * Validate that a string is hex and matches the required length.
 *
 * @param label - Field name for error messages.
 * @param value - Input value to validate.
 * @param expectedLength - Required hex length.
 */
export const assertHexLength = (
    label: string,
    value: string,
    expectedLength: number,
) => {
    if (!/^[0-9a-fA-F]+$/.test(value)) {
        throw new HttpException(400, `${label} must be hex string`);
    }
    if (value.length !== expectedLength) {
        throw new HttpException(
            400,
            `${label} must be ${expectedLength} hex chars`,
        );
    }
};

/**
 * Convert a hex string into a Buffer.
 *
 * @param value - Hex string input.
 * @returns Buffer containing the decoded bytes.
 */
export const hexToBuffer = (value: string) => Buffer.from(value, "hex");
