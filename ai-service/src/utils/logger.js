/**
 * Build structured logger payload and write to stdout.
 *
 * @param {"info" | "warn" | "error"} level - Log severity.
 * @param {Record<string, unknown>} payload - Structured payload.
 */
const write = (level, payload) => {
    const entry = {
        timestamp: new Date().toISOString(),
        service: "ai-service",
        level,
        ...payload,
    };
    const text = JSON.stringify(entry);

    if (level === "error") {
        console.error(text);
        return;
    }

    console.log(text);
};

/**
 * Structured logger helpers.
 */
export const logger = {
    /**
     * Log informational payload.
     *
     * @param {Record<string, unknown>} payload - Structured payload.
     */
    info(payload) {
        write("info", payload);
    },

    /**
     * Log warning payload.
     *
     * @param {Record<string, unknown>} payload - Structured payload.
     */
    warn(payload) {
        write("warn", payload);
    },

    /**
     * Log error payload.
     *
     * @param {Record<string, unknown>} payload - Structured payload.
     */
    error(payload) {
        write("error", payload);
    },
};
