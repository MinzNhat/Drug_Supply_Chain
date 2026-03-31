import { RequestHandler } from "express";

/**
 * Wrap an async Express handler and forward errors to next().
 *
 * @param handler - Express request handler.
 * @returns Wrapped handler with error propagation.
 */
export const asyncHandler = (handler: RequestHandler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};
