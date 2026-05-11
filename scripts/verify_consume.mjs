import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve("backend/.env") });

import { SupplyChainService } from "../backend/src/services/supply-chain/supply-chain.service.js";
import { FabricGatewayClient } from "../backend/src/integrations/fabric/fabric-gateway.client.js";
import { FabricLedgerRepository } from "../backend/src/repositories/ledger/fabric-ledger.repository.js";
import { DocumentStorageAdapter } from "../backend/src/integrations/ipfs/ipfs-storage.adapter.js";

async function verifyConsume() {
    try {
        await mongoose.connect("mongodb://localhost:27017/drug_guard");
        
        const client = new FabricGatewayClient();
        const repo = new FabricLedgerRepository(client);
        const storage = new DocumentStorageAdapter();
        const service = new SupplyChainService(repo, storage);

        const batchID = "BATCH_1777522003216_94ADC5";
        const actor = {
            id: "661f4c789182390123abcd", // Replace with a valid distributor ID if needed
            mspId: "DistributorMSP",
            role: "Distributor",
            username: "distributor_test"
        };

        console.log(`Testing consumption for ${batchID}...`);
        
        // This will trigger the updated method
        await service.confirmDeliveredToConsumption(batchID, actor);
        
        // Check MongoDB for GeoEvent
        const { BatchGeoEvent } = await import("../backend/src/models/batch/batch-geo-event.model.js");
        const lastEvent = await BatchGeoEvent.findOne({ batchID }).sort({ occurredAt: -1 });
        
        console.log("Last Geo Event:", lastEvent?.eventType);
        
        // Check BatchState
        const { BatchState } = await import("../backend/src/models/batch/batch-state.model.js");
        const state = await BatchState.findOne({ batchID });
        console.log("Consumption Confirmed in DB:", state?.consumptionConfirmed);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyConsume();
