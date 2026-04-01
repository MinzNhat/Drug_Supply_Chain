/**
 * Wrap async route handlers and forward errors to Express middleware.
 *
 * @param {(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => Promise<unknown>} handler - Async handler.
 * @returns {import("express").RequestHandler} Wrapped handler.
 */
export const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};
