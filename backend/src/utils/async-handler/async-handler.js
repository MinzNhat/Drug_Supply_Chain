/**
 * Wrap an async Express handler and forward errors to next().
 *
 * @param {import("express").RequestHandler} handler - Express request handler.
 * @returns {import("express").RequestHandler} Wrapped handler with error propagation.
 */
export const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};
