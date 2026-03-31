import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { createLedgerRepository } from "./repositories/ledger/create-ledger-repository.js";
import { logger } from "./utils/logger/logger.js";

/**
 * Application entry point: connect to MongoDB and start HTTP server.
 */
const start = async () => {
    await mongoose.connect(config.mongoUri, {
        dbName: config.mongoDb,
    });

    const ledgerRepository = createLedgerRepository();
    const app = createApp();
    const server = app.listen(config.port, () => {
        logger.info({ message: `Server listening on ${config.port}` });
    });

    const shutdown = async () => {
        server.close();
        if (typeof ledgerRepository.fabricGatewayClient?.close === "function") {
            await ledgerRepository.fabricGatewayClient.close();
        }
        await mongoose.connection.close();
        process.exit(0);
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
};

start().catch((err) => {
    logger.error({ message: "Failed to start service", err });
    process.exit(1);
});
