import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: 'backend/.env' });
if (!process.env.MONGO_URI) {
    dotenv.config({ path: './backend/.env' });
}

async function seedProvinces() {
    try {
        const isContainer = fs.existsSync('/app/src');
        const provinceModelPath = isContainer 
            ? '/app/src/models/location/province.model.js' 
            : path.resolve(process.cwd(), 'backend/src/models/location/province.model.js');
        
        const { Province } = await import(provinceModelPath);
        
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/drug_guard';
        const mongoDb = process.env.MONGO_DB || 'drug_guard';
        
        await mongoose.connect(mongoUri, { dbName: mongoDb });
        console.log("Connected to MongoDB.");

        const provinces = [
            // NORTH
            { name: "Hà Nội", code: "01", region: "NORTH", lat: 21.0285, lng: 105.8542 },
            { name: "Hải Phòng", code: "31", region: "NORTH", lat: 20.8449, lng: 106.6881 },
            { name: "Bắc Ninh", code: "27", region: "NORTH", lat: 21.1861, lng: 106.0763 },
            { name: "Hà Nam", code: "35", region: "NORTH", lat: 20.5463, lng: 105.9125 },
            { name: "Hải Dương", code: "30", region: "NORTH", lat: 20.9405, lng: 106.3330 },
            { name: "Hưng Yên", code: "33", region: "NORTH", lat: 20.6464, lng: 106.0511 },
            { name: "Nam Định", code: "36", region: "NORTH", lat: 20.4231, lng: 106.1683 },
            { name: "Ninh Bình", code: "37", region: "NORTH", lat: 20.2506, lng: 105.9745 },
            { name: "Thái Bình", code: "34", region: "NORTH", lat: 20.4462, lng: 106.3364 },
            { name: "Vĩnh Phúc", code: "26", region: "NORTH", lat: 21.3089, lng: 105.6048 },
            { name: "Hà Giang", code: "02", region: "NORTH", lat: 22.8233, lng: 104.9835 },
            { name: "Cao Bằng", code: "04", region: "NORTH", lat: 22.6664, lng: 106.2625 },
            { name: "Bắc Kạn", code: "06", region: "NORTH", lat: 22.1466, lng: 105.8344 },
            { name: "Tuyên Quang", code: "08", region: "NORTH", lat: 21.8155, lng: 105.2132 },
            { name: "Lào Cai", code: "10", region: "NORTH", lat: 22.4856, lng: 103.9707 },
            { name: "Điện Biên", code: "11", region: "NORTH", lat: 21.3853, lng: 103.0195 },
            { name: "Lai Châu", code: "12", region: "NORTH", lat: 22.3951, lng: 103.4735 },
            { name: "Sơn La", code: "14", region: "NORTH", lat: 21.3259, lng: 103.9126 },
            { name: "Yên Bái", code: "15", region: "NORTH", lat: 21.7167, lng: 104.8833 },
            { name: "Hòa Bình", code: "17", region: "NORTH", lat: 20.8167, lng: 105.3333 },
            { name: "Thái Nguyên", code: "19", region: "NORTH", lat: 21.5939, lng: 105.8442 },
            { name: "Lạng Sơn", code: "20", region: "NORTH", lat: 21.8519, lng: 106.7611 },
            { name: "Quảng Ninh", code: "22", region: "NORTH", lat: 20.9505, lng: 107.0733 },
            { name: "Bắc Giang", code: "24", region: "NORTH", lat: 21.2731, lng: 106.1946 },
            { name: "Phú Thọ", code: "25", region: "NORTH", lat: 21.3229, lng: 105.3941 },

            // CENTRAL
            { name: "Đà Nẵng", code: "48", region: "CENTRAL", lat: 16.0471, lng: 108.2062 },
            { name: "Thanh Hóa", code: "38", region: "CENTRAL", lat: 19.8067, lng: 105.7767 },
            { name: "Nghệ An", code: "40", region: "CENTRAL", lat: 18.6667, lng: 105.6667 },
            { name: "Hà Tĩnh", code: "42", region: "CENTRAL", lat: 18.3333, lng: 105.9000 },
            { name: "Quảng Bình", code: "44", region: "CENTRAL", lat: 17.4833, lng: 106.6000 },
            { name: "Quảng Trị", code: "45", region: "CENTRAL", lat: 16.7500, lng: 107.1833 },
            { name: "Thừa Thiên Huế", code: "46", region: "CENTRAL", lat: 16.4633, lng: 107.5908 },
            { name: "Quảng Nam", code: "49", region: "CENTRAL", lat: 15.5667, lng: 108.4833 },
            { name: "Quảng Ngãi", code: "51", region: "CENTRAL", lat: 15.1167, lng: 108.8000 },
            { name: "Bình Định", code: "52", region: "CENTRAL", lat: 13.7667, lng: 109.2333 },
            { name: "Phú Yên", code: "54", region: "CENTRAL", lat: 13.0833, lng: 109.3000 },
            { name: "Khánh Hòa", code: "56", region: "CENTRAL", lat: 12.2500, lng: 109.1833 },
            { name: "Ninh Thuận", code: "58", region: "CENTRAL", lat: 11.5667, lng: 108.9833 },
            { name: "Bình Thuận", code: "60", region: "CENTRAL", lat: 10.9333, lng: 108.1000 },
            { name: "Kon Tum", code: "62", region: "CENTRAL", lat: 14.3500, lng: 108.0000 },
            { name: "Gia Lai", code: "64", region: "CENTRAL", lat: 13.9833, lng: 108.0000 },
            { name: "Đắk Lắk", code: "66", region: "CENTRAL", lat: 12.6667, lng: 108.0333 },
            { name: "Đắk Nông", code: "67", region: "CENTRAL", lat: 12.0000, lng: 107.6833 },
            { name: "Lâm Đồng", code: "68", region: "CENTRAL", lat: 11.9333, lng: 108.4333 },

            // SOUTH
            { name: "TP. Hồ Chí Minh", code: "79", region: "SOUTH", lat: 10.7626, lng: 106.6602 },
            { name: "Bình Phước", code: "70", region: "SOUTH", lat: 11.5333, lng: 106.8833 },
            { name: "Tây Ninh", code: "72", region: "SOUTH", lat: 11.3000, lng: 106.1000 },
            { name: "Bình Dương", code: "74", region: "SOUTH", lat: 11.1667, lng: 106.6667 },
            { name: "Đồng Nai", code: "75", region: "SOUTH", lat: 10.9500, lng: 106.8167 },
            { name: "Bà Rịa - Vũng Tàu", code: "77", region: "SOUTH", lat: 10.4119, lng: 107.1358 },
            { name: "Long An", code: "80", region: "SOUTH", lat: 10.5333, lng: 106.4000 },
            { name: "Tiền Giang", code: "82", region: "SOUTH", lat: 10.3500, lng: 106.3500 },
            { name: "Bến Tre", code: "83", region: "SOUTH", lat: 10.2333, lng: 106.3833 },
            { name: "Trà Vinh", code: "84", region: "SOUTH", lat: 9.9333, lng: 106.3333 },
            { name: "Vĩnh Long", code: "86", region: "SOUTH", lat: 10.2500, lng: 105.9667 },
            { name: "Đồng Tháp", code: "87", region: "SOUTH", lat: 10.3667, lng: 105.6333 },
            { name: "An Giang", code: "89", region: "SOUTH", lat: 10.5000, lng: 105.1167 },
            { name: "Kiên Giang", code: "91", region: "SOUTH", lat: 10.0000, lng: 105.1333 },
            { name: "Cần Thơ", code: "92", region: "SOUTH", lat: 10.0333, lng: 105.7833 },
            { name: "Hậu Giang", code: "93", region: "SOUTH", lat: 9.7833, lng: 105.4667 },
            { name: "Sóc Trăng", code: "94", region: "SOUTH", lat: 9.6000, lng: 105.9667 },
            { name: "Bạc Liêu", code: "95", region: "SOUTH", lat: 9.2833, lng: 105.7167 },
            { name: "Cà Mau", code: "96", region: "SOUTH", lat: 9.1833, lng: 105.1500 }
        ];

        for (const p of provinces) {
            await Province.findOneAndUpdate(
                { name: p.name },
                p,
                { upsert: true, new: true }
            );
        }

        console.log(`Successfully seeded ${provinces.length} provinces with Lat/Lng.`);
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error("Error seeding provinces:", error);
        process.exit(1);
    }
}

seedProvinces();
