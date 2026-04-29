import { loadPackage } from "./load-deps.mjs";

const axios = loadPackage("axios");

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8090";
export const API_BASE = `${BASE_URL}/api/v1`;
const PASSWORD = process.env.E2E_PASSWORD ?? "StrongPass123";
const E2E_TIMEOUT_MS = Number(process.env.E2E_TIMEOUT_MS ?? 30000);

export const createE2eRequest = () =>
    axios.create({
        baseURL: API_BASE,
        timeout: E2E_TIMEOUT_MS,
        validateStatus: () => true,
    });

export const fail = (message, context = undefined) => {
    const detail = context ? ` | ${JSON.stringify(context)}` : "";
    throw new Error(`${message}${detail}`);
};

export const assertStatus = (label, response, expectedStatus) => {
    if (response.status !== expectedStatus) {
        fail(`${label} failed`, {
            expected: expectedStatus,
            actual: response.status,
            body: response.data,
        });
    }
};

export const register = async (
    request,
    username,
    role,
    mspId,
    distributorUnitId = "",
) => {
    const response = await request.post("/auth/register", {
        username,
        password: PASSWORD,
        role,
        mspId,
        distributorUnitId,
    });
    assertStatus(`register ${username}`, response, 201);
};

export const login = async (request, username) => {
    const response = await request.post("/auth/login", {
        username,
        password: PASSWORD,
    });
    assertStatus(`login ${username}`, response, 200);

    const token = response.data?.data?.token;
    if (!token) {
        fail(`login ${username} missing token`, response.data);
    }

    return token;
};

export const authHeader = (token) => ({
    Authorization: `Bearer ${token}`,
});
