import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from backend
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const MONGODB_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.MONGO_DB || "drug_guard";
const FULL_URI = `${MONGODB_URI}/${DB_NAME}`;

async function migrate() {
    try {
        console.log("Connecting to:", FULL_URI);
        await mongoose.connect(FULL_URI);
        console.log("Connected to MongoDB");

        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
        const BatchState = mongoose.model('BatchState', new mongoose.Schema({}, { strict: false }));
        const BatchIndex = mongoose.model('BatchIndex', new mongoose.Schema({}, { strict: false }));

        // 1. Update admin_yte to HIGH level
        const adminYte = await User.findOne({ username: 'admin_yte' });
        if (adminYte) {
            await User.updateOne({ _id: adminYte._id }, { 
                $set: { 
                    role: 'Regulator', 
                    regulatorLevel: 'HIGH',
                    mspId: 'RegulatorMSP',
                    province: 'Hà Nội'
                } 
            });
            console.log("Updated admin_yte to Regulator (HIGH) in Hà Nội");
        }

        // 2. Map existing users to their provinces if missing
        // (This is a manual guess based on existing data if needed)

        // 3. Update all Batches to have a province (important for hierarchy)
        // We'll take the province from manufacturer's details or default to 'Hà Nội' for existing ones
        const batches = await BatchState.find({});
        console.log(`Found ${batches.length} batches to update`);

        for (const batch of batches) {
            let province = batch.province || "";
            
            // Try to extract from details if empty
            if (!province) {
                province = batch.manufacturerDetails?.province || 
                           batch.ownerDetails?.province || 
                           (batch.batch?.manufacturerDetails?.province) ||
                           "TP. Hồ Chí Minh"; // Default for demo data
            }

            await BatchState.updateOne({ _id: batch._id }, { $set: { province } });
            await BatchIndex.updateOne({ batchID: batch.batchID }, { $set: { province } });
        }

        console.log("Migration completed successfully");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
