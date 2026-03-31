import { MongoClient } from "mongodb";
import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";

/**
 * Application entry point: connect to MongoDB and start HTTP server.
 */
const start = async () => {
    const client = new MongoClient(config.mongoUri);
    await client.connect();
    const db = client.db(config.mongoDb);

    const app = createApp(db);
    app.listen(config.port, () => {
        logger.info({ message: `Server listening on ${config.port}` });
    });
};

start().catch((err) => {
    logger.error({ message: "Failed to start service", err });
    process.exit(1);
});
