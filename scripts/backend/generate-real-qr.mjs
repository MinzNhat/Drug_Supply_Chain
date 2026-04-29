import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPackage } from "./load-deps.mjs";

const axios = loadPackage("axios");
const Jimp = loadPackage("jimp");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8090";
const API_BASE = `${BASE_URL}/api/v1`;
const TMP_DIR =
    process.env.TMP_DIR ?? path.join(__dirname, "../../test-output/real-qr");
const OUT_PATH = path.join(TMP_DIR, "qr-real.png");
const SKEW_PATH = path.join(TMP_DIR, "qr-real-skew.png");
const ROTATE_DEG = Number(process.env.ROTATE_DEG ?? "0");

if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
}

const http = axios.create({
    baseURL: API_BASE,
    validateStatus: () => true,
});

const registerIfNeeded = async () => {
    const res = await http.post("/auth/register", {
        username: "manu1",
        password: "StrongPass123",
        role: "Manufacturer",
        mspId: "ManufacturerMSP",
    });

    if (res.status !== 201 && res.status !== 409) {
        throw new Error(`Register failed: ${res.status}`);
    }
};

const login = async () => {
    const res = await http.post("/auth/login", {
        username: "manu1",
        password: "StrongPass123",
    });

    if (res.status !== 200) {
        throw new Error(`Login failed: ${res.status}`);
    }

    return res.data?.data?.token ?? "";
};

const createBatch = async (token) => {
    const res = await http.post(
        "/batches",
        {
            drugName: "QR Real Sample",
            quantity: 1000,
            expiryDate: "2028-12-31T00:00:00Z",
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        },
    );

    if (res.status !== 201) {
        throw new Error(`Create batch failed: ${res.status}`);
    }

    return res.data;
};

const createSkewedImage = async () => {
    const qrImage = await Jimp.read(OUT_PATH);
    const canvasSize =
        Math.max(qrImage.bitmap.width, qrImage.bitmap.height) + 200;
    const canvas = new Jimp(canvasSize, canvasSize, 0xffffffff);
    const base = qrImage.clone().background(0xffffffff);

    if (!Number.isNaN(ROTATE_DEG) && ROTATE_DEG !== 0) {
        base.rotate(ROTATE_DEG);
    }

    const offsetX = Math.floor(canvasSize * 0.18);
    const offsetY = Math.floor(canvasSize * 0.12);
    canvas.composite(base, offsetX, offsetY);

    await canvas.writeAsync(SKEW_PATH);
};

const run = async () => {
    console.log("== Generate QR Real Image ==");
    await registerIfNeeded();
    const token = await login();
    if (!token) {
        throw new Error("Missing token");
    }

    const payload = await createBatch(token);
    const qrB64 = payload?.data?.qrImageBase64 ?? "";
    if (!qrB64) {
        throw new Error("Missing qrImageBase64 in response");
    }

    fs.writeFileSync(OUT_PATH, Buffer.from(qrB64, "base64"));
    console.log(`Saved: ${OUT_PATH}`);
    await createSkewedImage();
    console.log(`Saved skewed: ${SKEW_PATH}`);
    console.log(
        "Now print/scan this image as qr-real.png and place it in the tmp folder.",
    );
};

run().catch((err) => {
    const message = err?.message ? String(err.message) : String(err);
    console.error("Failed:", message);
    process.exit(1);
});
