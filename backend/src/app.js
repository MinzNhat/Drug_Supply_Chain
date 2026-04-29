import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { errorHandler } from "./middleware/error/error-handler.js";
import { requestContextMiddleware } from "./middleware/request-context/request-context.middleware.js";
import { createAuthRoutes } from "./routes/auth/auth.routes.js";
import { createNetworkRoutes } from "./routes/network/network.routes.js";
import { createProductRoutes } from "./routes/product/product.routes.js";
import { createRegulatorRoutes } from "./routes/regulator/regulator.routes.js";
import { createSystemRoutes } from "./routes/system/system.routes.js";
import { createLocationRoutes } from "./routes/location/location.routes.js";
import { logger } from "./utils/logger/logger.js";

/**
 * Rate limiter for the public verify-product endpoint.
 * Prevents scanCount spam that would trigger false WARNING / SUSPICIOUS states.
 */
const verifyProductRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 100, // 100 verify requests per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many verification requests, please try again later",
    },
});

/**
 * Rate limiter for register and login endpoints.
 * Prevents brute-force attacks and register endpoint abuse.
 */
const authRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 20, // 20 auth attempts per IP per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many authentication requests, please try again later",
    },
});

/**
 * Build the Express application with middleware, routes, and error handling.
 *
 * @returns {import("express").Express} Configured Express app instance.
 */
export const createApp = () => {
    const app = express();

    morgan.token("trace-id", (req) => req.traceId || "unknown");
    const accessLogFormat =
        ':method :url :status :res[content-length] - :response-time ms traceId=":trace-id"';

    // Security headers and baseline hardening.
    app.use(
        helmet({
            crossOriginResourcePolicy: { policy: "cross-origin" },
        }),
    );
    // CORS: restrict to known frontend origins. Set CORS_ALLOWED_ORIGINS=* only for local dev.
    const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS ?? "*";
    const corsOptions =
        corsAllowedOrigins === "*"
            ? {}
            : {
                  origin: corsAllowedOrigins
                      .split(",")
                      .map((o) => o.trim())
                      .filter(Boolean),
                  credentials: true,
              };
    app.use(cors(corsOptions));
    // Request context enables trace propagation across logs and error payloads.
    app.use(requestContextMiddleware);
    // Limit JSON payload size to protect from oversized requests.
    app.use(express.json({ limit: "2mb" }));
    // HTTP access logs are forwarded to Winston for structured output.
    app.use(
        morgan(accessLogFormat, {
            stream: {
                write: (message) => {
                    logger.info({ message: message.trim() });
                },
            },
        }),
    );

    // Health endpoint for container probes.
    app.get("/health", (_req, res) => {
        return res.json({ ok: true });
    });

    // Rate limit the public QR verify endpoint to prevent scanCount spam.
    app.use("/api/v1/verify", verifyProductRateLimiter);
    // Rate limit auth endpoints to prevent brute-force and register abuse.
    app.use("/api/v1/auth", authRateLimiter);

    // Versioned API routes.
    app.use("/api/v1/auth", createAuthRoutes());
    app.use("/api/v1", createProductRoutes());
    app.use("/api/v1/regulator", createRegulatorRoutes());
    // Network topology routes for FE node graph.
    app.use("/api/v1/network", createNetworkRoutes());
    // System routes for logs and diagnostics.
    app.use("/api/v1/system", createSystemRoutes());
    // Location data routes.
    app.use("/api/v1/location", createLocationRoutes());

    // Centralized error handler with standardized error shape.
    app.use(errorHandler);

    return app;
};
