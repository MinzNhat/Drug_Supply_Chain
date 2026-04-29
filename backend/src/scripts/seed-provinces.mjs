import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: '../backend/.env' });

const provinces = [
    { name: "An Giang", region: "SOUTH" },
    { name: "Bà Rịa - Vũng Tàu", region: "SOUTH" },
    { name: "Bắc Giang", region: "NORTH" },
    { name: "Bắc Kạn", region: "NORTH" },
    { name: "Bạc Liêu", region: "SOUTH" },
    { name: "Bắc Ninh", region: "NORTH" },
    { name: "Bến Tre", region: "SOUTH" },
    { name: "Bình Định", region: "CENTRAL" },
    { name: "Bình Dương", region: "SOUTH" },
    { name: "Bình Phước", region: "SOUTH" },
    { name: "Bình Thuận", region: "CENTRAL" },
    { name: "Cà Mau", region: "SOUTH" },
    { name: "Cần Thơ", region: "SOUTH" },
    { name: "Cao Bằng", region: "NORTH" },
    { name: "Đà Nẵng", region: "CENTRAL" },
    { name: "Đắk Lắk", region: "CENTRAL" },
    { name: "Đắk Nông", region: "CENTRAL" },
    { name: "Điện Biên", region: "NORTH" },
    { name: "Đồng Nai", region: "SOUTH" },
    { name: "Đồng Tháp", region: "SOUTH" },
    { name: "Gia Lai", region: "CENTRAL" },
    { name: "Hà Giang", region: "NORTH" },
    { name: "Hà Nam", region: "NORTH" },
    { name: "Hà Nội", region: "NORTH" },
    { name: "Hà Tĩnh", region: "CENTRAL" },
    { name: "Hải Dương", region: "NORTH" },
    { name: "Hải Phòng", region: "NORTH" },
    { name: "Hậu Giang", region: "SOUTH" },
    { name: "Hòa Bình", region: "NORTH" },
    { name: "Hưng Yên", region: "NORTH" },
    { name: "Khánh Hòa", region: "CENTRAL" },
    { name: "Kiên Giang", region: "SOUTH" },
    { name: "Kon Tum", region: "CENTRAL" },
    { name: "Lai Châu", region: "NORTH" },
    { name: "Lâm Đồng", region: "CENTRAL" },
    { name: "Lạng Sơn", region: "NORTH" },
    { name: "Lào Cai", region: "NORTH" },
    { name: "Long An", region: "SOUTH" },
    { name: "Nam Định", region: "NORTH" },
    { name: "Nghệ An", region: "CENTRAL" },
    { name: "Ninh Bình", region: "NORTH" },
    { name: "Ninh Thuận", region: "CENTRAL" },
    { name: "Phú Thọ", region: "NORTH" },
    { name: "Phú Yên", region: "CENTRAL" },
    { name: "Quảng Bình", region: "CENTRAL" },
    { name: "Quảng Nam", region: "CENTRAL" },
    { name: "Quảng Ngãi", region: "CENTRAL" },
    { name: "Quảng Ninh", region: "NORTH" },
    { name: "Quảng Trị", region: "CENTRAL" },
    { name: "Sóc Trăng", region: "SOUTH" },
    { name: "Sơn La", region: "NORTH" },
    { name: "Tây Ninh", region: "SOUTH" },
    { name: "Thái Bình", region: "NORTH" },
    { name: "Thái Nguyên", region: "NORTH" },
    { name: "Thanh Hóa", region: "CENTRAL" },
    { name: "Thừa Thiên Huế", region: "CENTRAL" },
    { name: "Tiền Giang", region: "SOUTH" },
    { name: "TP Hồ Chí Minh", region: "SOUTH" },
    { name: "Trà Vinh", region: "SOUTH" },
    { name: "Tuyên Quang", region: "NORTH" },
    { name: "Vĩnh Long", region: "SOUTH" },
    { name: "Vĩnh Phúc", region: "NORTH" },
    { name: "Yên Bái", region: "NORTH" }
];

async function seedProvinces() {
    try {
        const isContainer = fs.existsSync('/app/src');
        const provinceModelPath = isContainer 
            ? '/app/src/models/location/province.model.js' 
            : path.resolve(process.cwd(), 'backend/src/models/location/province.model.js');
        
        const { Province } = await import(provinceModelPath);
        
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/drug_guard';
        await mongoose.connect(mongoUri, { dbName: process.env.MONGO_DB || 'drug_guard' });
        console.log("Connected to MongoDB for seeding...");

        for (const p of provinces) {
            await Province.findOneAndUpdate(
                { name: p.name },
                { $set: p },
                { upsert: true, new: true }
            );
        }

        console.log(`Successfully seeded ${provinces.length} provinces.`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error seeding provinces:', error);
        process.exit(1);
    }
}

seedProvinces();
