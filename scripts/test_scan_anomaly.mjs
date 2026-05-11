import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve("backend/.env") });

import { config } from "../backend/src/config/index.js";
import { FabricGatewayClient } from "../backend/src/integrations/fabric/fabric-gateway.client.js";
import { FabricLedgerRepository } from "../backend/src/repositories/ledger/fabric-ledger.repository.js";

async function runTest() {
    try {
        await mongoose.connect("mongodb://localhost:27017/drug_guard");
        console.log("Connected to MongoDB");

        const client = new FabricGatewayClient();
        const repo = new FabricLedgerRepository(client);

        const batchID = "BATCH_1777522003216_94ADC5";
        const actor = {
            role: "Regulator",
            mspId: "RegulatorMSP",
            id: "system_test",
            traceId: "test_anomaly_" + Date.now()
        };

        console.log(`Starting scan test for ${batchID}...`);
        
        // Let's check current state
        const initialBatch = await repo.readBatch(actor, batchID);
        console.log(`Initial Scan Count: ${initialBatch.scanCount}`);
        console.log(`Warning Threshold: ${initialBatch.warningThreshold}`);

        // Perform 5 scans
        for (let i = 1; i <= 5; i++) {
            process.stdout.write(`Scanning ${i}/5... `);
            const result = await repo.verifyBatch(actor, batchID, false);
            console.log(`Count: ${result.batch.scanCount}`);
        }

        console.log("\nDone. Check MongoDB 'alertarchives' for GovMonitor events.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

runTest();
