import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";

/**
 * Application entry point for AI gateway API.
 */
const start = async () => {
    const app = createApp();
    app.listen(config.port, () => {
        logger.info({ message: `AI service listening on ${config.port}` });
    });
};

start().catch((error) => {
    logger.error({
        message: "Failed to start AI service",
        error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
});
