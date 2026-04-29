import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../backend/.env") });

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/drug-guard";

async function checkIndex() {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const BatchIndex = mongoose.model("BatchIndex", new mongoose.Schema({
        batchID: String,
        dataHash: String,
        qrImageBase64: String
    }), "batchindexes");

    const targetHash = "4cbc40d4";
    const targetBatchId = "BATCH_1777413705285_75FE95";

    console.log(`Searching for BatchID: ${targetBatchId} or DataHash: ${targetHash}...`);
    
    const byId = await BatchIndex.findOne({ batchID: targetBatchId });
    const byHash = await BatchIndex.findOne({ dataHash: { $regex: new RegExp(`^${targetHash}$`, "i") } });

    console.log("Result by ID:", byId ? "FOUND" : "NOT FOUND");
    if (byId) console.log("   - DataHash in DB:", byId.dataHash);

    console.log("Result by Hash (case-insensitive):", byHash ? "FOUND" : "NOT FOUND");
    if (byHash) {
        console.log("   - BatchID in DB:", byHash.batchID);
        console.log("   - QR Length:", byHash.qrImageBase64?.length || 0);
    }

    if (!byId && !byHash) {
        console.log("Listing last 5 indexes for debugging:");
        const lastFive = await BatchIndex.find().sort({ _id: -1 }).limit(5);
        lastFive.forEach(idx => console.log(`   - ID: ${idx.batchID}, Hash: ${idx.dataHash}`));
    }

    await mongoose.disconnect();
}

checkIndex().catch(console.error);
