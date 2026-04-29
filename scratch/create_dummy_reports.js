const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/drug_guard';

const reportSchema = new mongoose.Schema({
    productName: { type: String, required: true },
    issues: { type: String, required: true },
    description: { type: String },
    paymentBillMeta: { fileName: String, size: Number },
    additionalImageMeta: { fileName: String, size: Number },
    status: { type: String, enum: ["PENDING", "RESOLVED", "REJECTED"], default: "PENDING" },
    severity: { type: String, enum: ["info", "warn", "critical"], default: "warn" },
    lat: Number,
    lng: Number,
    reporterIP: String,
    province: { type: String, required: true },
}, { timestamps: true });

const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

async function createDummyReports() {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // 1. Clear existing reports
    await Report.deleteMany({});
    console.log('Cleared existing reports');

    const reports = [
        {
            _id: new ObjectId("662f1a1a1a1a1a1a1a1a1a21"),
            productName: "Paracetamol 500mg",
            issues: "Counterfeit packaging detected",
            description: "Bao bì có font chữ lạ, không có số lô sản xuất rõ ràng. Mua tại cửa hàng thuốc gần chợ Bà Chiểu.",
            province: "TP Hồ Chí Minh",
            lat: 10.8015,
            lng: 106.6990,
            severity: "critical",
            status: "PENDING",
            reporterIP: "1.2.3.4",
            paymentBillMeta: { fileName: "receipt.png", size: 45000 },
            additionalImageMeta: { fileName: "box.png", size: 120000 }
        },
        {
            _id: new ObjectId("662f1a1a1a1a1a1a1a1a1a22"),
            productName: "Ceftriaxone Injection",
            issues: "Suspected fake active ingredient",
            description: "Bệnh nhân phản ứng lạ sau khi tiêm. Kiểm tra vỉ thuốc thấy nhãn mác bị dán chồng lên nhau.",
            province: "Hà Nội",
            lat: 21.0123,
            lng: 105.8456,
            severity: "critical",
            status: "PENDING",
            reporterIP: "5.6.7.8",
            paymentBillMeta: { fileName: "hospital_bill.png", size: 67000 },
            additionalImageMeta: { fileName: "vial.png", size: 89000 }
        },
        {
            _id: new ObjectId("662f1a1a1a1a1a1a1a1a1a23"),
            productName: "Vitamin C 1000mg",
            issues: "Expired product sold as new",
            description: "Hạn sử dụng trên hộp bị tẩy xóa và in đè hạn mới. Nhà thuốc tại quận Hải Châu.",
            province: "Đà Nẵng",
            lat: 16.0678,
            lng: 108.2201,
            severity: "warn",
            status: "PENDING",
            reporterIP: "10.0.0.1",
            paymentBillMeta: { fileName: "bill_danang.png", size: 34000 },
            additionalImageMeta: { fileName: "expired_date.png", size: 76000 }
        },
        {
            _id: new ObjectId("662f1a1a1a1a1a1a1a1a1a24"),
            productName: "Amoxicillin 500mg",
            issues: "Unauthorized vendor",
            description: "Bán thuốc qua Facebook không có giấy phép. Giao hàng tại Ninh Kiều.",
            province: "Cần Thơ",
            lat: 10.0345,
            lng: 105.7890,
            severity: "info",
            status: "PENDING",
            reporterIP: "172.16.1.1",
            paymentBillMeta: { fileName: "fb_screenshot.png", size: 55000 },
            additionalImageMeta: null
        }
    ];

    for (const r of reports) {
        await Report.create(r);
        console.log(`Report created: ${r.productName} in ${r.province}`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

    console.log('\n--- NEXT STEPS: RUN THESE COMMANDS TO CREATE DUMMY IMAGE FILES ---');
    for (const r of reports) {
        const id = r._id.toString();
        console.log(`docker exec drug-guard-backend mkdir -p uploads/reports/${id}`);
        if (r.paymentBillMeta) {
            console.log(`docker exec drug-guard-backend touch uploads/reports/${id}/paymentBill_${r.paymentBillMeta.fileName}`);
        }
        if (r.additionalImageMeta) {
            console.log(`docker exec drug-guard-backend touch uploads/reports/${id}/additionalImage_${r.additionalImageMeta.fileName}`);
        }
    }
}

createDummyReports().catch(console.error);
