import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGO_URI) {
    dotenv.config({ path: './backend/.env' });
}

async function createAdmin() {
    try {
        // Dynamic path resolution for both host and container
        const isContainer = fs.existsSync('/app/src');
        const userModelPath = isContainer 
            ? '/app/src/models/user/user.model.js' 
            : path.resolve(process.cwd(), 'backend/src/models/user/user.model.js');
        
        console.log(`Loading model from: ${userModelPath}`);
        const { User } = await import(userModelPath);
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/drug_guard';
        const mongoDb = process.env.MONGO_DB || 'drug_guard';
        
        await mongoose.connect(mongoUri, {
            dbName: mongoDb
        });
        console.log(`Connected to MongoDB (URI: ${mongoUri}, DB: ${mongoDb})`);

        const username = 'admin_yte';
        const password = 'Admin@2004';
        const role = 'Admin';
        const mspId = 'RegulatorMSP';

        const existing = await User.findOne({ username });
        if (existing) {
            console.log(`User ${username} already exists. Updating password and role...`);
            existing.password = await bcrypt.hash(password, 12);
            existing.role = role;
            existing.mspId = mspId;
            existing.status = 'APPROVED';
            await existing.save();
        } else {
            const passwordHash = await bcrypt.hash(password, 12);
            await User.create({
                username,
                password: passwordHash,
                role,
                mspId,
                status: 'APPROVED'
            });
            console.log(`User ${username} created successfully.`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error creating admin:', error);
        process.exit(1);
    }
}

createAdmin();
