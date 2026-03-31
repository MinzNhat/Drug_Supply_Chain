import winston from "winston";
import { config } from "../config/index.js";

// Base format: timestamp + JSON for structured logging.
const { combine, timestamp, json } = winston.format;

/**
 * Application-wide logger configured for structured JSON output.
 */
export const logger = winston.createLogger({
    level: config.logLevel,
    defaultMeta: {
        service: "protected-qr",
    },
    format: combine(timestamp(), json()),
    transports: [new winston.transports.Console()],
});
