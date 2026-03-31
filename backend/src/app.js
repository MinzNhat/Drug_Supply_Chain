import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/error/error-handler.js";
import { requestContextMiddleware } from "./middleware/request-context/request-context.middleware.js";
import { createAuthRoutes } from "./routes/auth/auth.routes.js";
import { createProductRoutes } from "./routes/product/product.routes.js";
import { createRegulatorRoutes } from "./routes/regulator/regulator.routes.js";
import { logger } from "./utils/logger/logger.js";

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
    app.use(helmet());
    // CORS is enabled for multi-tenant access.
    app.use(cors());
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

    // Versioned API routes.
    app.use("/api/v1/auth", createAuthRoutes());
    app.use("/api/v1", createProductRoutes());
    app.use("/api/v1/regulator", createRegulatorRoutes());

    // Centralized error handler with standardized error shape.
    app.use(errorHandler);

    return app;
};
