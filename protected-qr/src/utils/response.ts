/**
 * Standard success response wrapper.
 *
 * @template T
 */
export type ApiSuccess<T> = {
    /**
     * Indicates a successful request.
     */
    success: true;

    /**
     * Response payload.
     */
    data: T;
};

/**
 * Standard error response wrapper.
 */
export type ApiError = {
    /**
     * Indicates a failed request.
     */
    success: false;

    /**
     * Error details with optional validation metadata.
     */
    error: {
        code: string;
        message: string;
        traceId: string;
        trace_id?: string;
        details?: Record<string, unknown>;
    };
};
