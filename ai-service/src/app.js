import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { errorHandler } from "./middleware/error-handler.js";
import { requestContextMiddleware } from "./middleware/request-context.js";
import { createAiRoutes } from "./routes/ai.routes.js";
import { logger } from "./utils/logger.js";

/**
 * Build Express app with middleware, routes, and error handling.
 *
 * @returns {import("express").Express} Configured app.
 */
export const createApp = () => {
    const app = express();

    morgan.token("trace-id", (req) => req.traceId || "unknown");
    const accessLogFormat =
        ':method :url :status :res[content-length] - :response-time ms traceId=":trace-id"';

    // Security headers and baseline hardening.
    app.use(helmet());
    // CORS is enabled for backend integration clients.
    app.use(cors());
    // Attach request trace id used by logs and error payloads.
    app.use(requestContextMiddleware);
    // Restrict JSON body size for defensive defaults.
    app.use(express.json({ limit: "1mb" }));
    // Forward HTTP access logs to structured logger output.
    app.use(
        morgan(accessLogFormat, {
            stream: {
                write: (message) => {
                    logger.info({ message: message.trim() });
                },
            },
        }),
    );

    // Health endpoint for readiness probes.
    app.get("/health", (_req, res) => {
        return res.json({ ok: true });
    });

    // Versioned API routes.
    app.use("/api/v1", createAiRoutes());

    // Standardized error response formatter.
    app.use(errorHandler);

    return app;
};
