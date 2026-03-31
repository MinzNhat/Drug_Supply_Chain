import cors from "cors";
import express, { Request } from "express";
import helmet from "helmet";
import { Db } from "mongodb";
import morgan from "morgan";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { createQrRoutes } from "./routes/qr.routes.js";
import { logger } from "./utils/logger.js";

/**
 * Build the Express application with middleware, routes, and error handling.
 *
 * @param db - Mongo database handle.
 * @returns Configured Express app instance.
 */
export const createApp = (db: Db) => {
    const app = express();

    morgan.token("trace-id", (req) => {
        return (req as Request).traceId ?? "unknown";
    });
    const accessLogFormat =
        ':method :url :status :res[content-length] - :response-time ms traceId=":trace-id"';

    // Security headers and baseline hardening.
    app.use(helmet());
    // CORS is enabled for SaaS multi-tenant access.
    app.use(cors());
    // Add request-scoped trace id for logs and errors.
    app.use(requestContextMiddleware);
    // Limit JSON payload size to protect from oversized requests.
    app.use(express.json({ limit: "2mb" }));
    // HTTP access logs are forwarded to Winston for structured output.
    app.use(
        morgan(accessLogFormat, {
            stream: {
                write: (message: string) => {
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
    app.use("/api/v1/qr", createQrRoutes(db));

    // Centralized error handler with standardized error shape.
    app.use(errorHandler);

    return app;
};
