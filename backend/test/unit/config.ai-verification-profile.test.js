import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..", "..");

const baseEnv = {
    MONGO_URI: "mongodb://localhost:27017",
    MONGO_DB: "drug_guard_test",
    QR_SERVICE_URL: "http://localhost:8080",
    JWT_SECRET: "test-secret",
};

const runConfigProbe = (extraEnv = {}) => {
    const script = `
import { config } from "./src/config/index.js";

console.log(JSON.stringify({
  profile: config.aiVerification.profile,
  strictConfig: config.aiVerification.strictConfig,
  enabled: config.aiVerification.enabled,
  serviceUrl: config.aiVerification.serviceUrl,
  ownership: config.aiVerification.ownership,
}));
`;

    const env = {
        ...process.env,
        ...baseEnv,
        ...extraEnv,
    };

    for (const [key, value] of Object.entries(env)) {
        if (value === null || value === undefined) {
            delete env[key];
        }
    }

    return spawnSync("node", ["--input-type=module", "--eval", script], {
        cwd: backendRoot,
        env,
        encoding: "utf8",
    });
};

const getCombinedOutput = (result) =>
    `${result.stdout || ""}\n${result.stderr || ""}`;

test("unit: ai verification uses local defaults", () => {
    const result = runConfigProbe({
        AI_VERIFICATION_PROFILE: null,
        AI_VERIFICATION_PROFILE_FILE: null,
        AI_VERIFICATION_ENABLED: null,
        AI_VERIFICATION_STRICT_CONFIG: null,
        AI_VERIFICATION_URL: null,
        AI_VERIFICATION_OWNER_SERVICE: null,
        AI_VERIFICATION_OWNER_ML: null,
        AI_VERIFICATION_OWNER_ONCALL: null,
    });

    assert.equal(result.status, 0, getCombinedOutput(result));
    const parsed = JSON.parse(result.stdout.trim());

    assert.equal(parsed.profile, "local");
    assert.equal(parsed.strictConfig, false);
    assert.equal(parsed.enabled, false);
});

test("unit: ai verification staging profile file passes strict checks", () => {
    const result = runConfigProbe({
        AI_VERIFICATION_PROFILE: "staging",
        AI_VERIFICATION_PROFILE_FILE:
            "./config/ai-profiles/staging.example.json",
        AI_VERIFICATION_ENABLED: null,
        AI_VERIFICATION_STRICT_CONFIG: null,
        AI_VERIFICATION_URL: null,
        AI_VERIFICATION_OWNER_SERVICE: null,
        AI_VERIFICATION_OWNER_ML: null,
        AI_VERIFICATION_OWNER_ONCALL: null,
    });

    assert.equal(result.status, 0, getCombinedOutput(result));
    const parsed = JSON.parse(result.stdout.trim());

    assert.equal(parsed.profile, "staging");
    assert.equal(parsed.strictConfig, true);
    assert.equal(parsed.enabled, true);
    assert.equal(
        parsed.serviceUrl,
        "http://ai-service.staging.svc.cluster.local:8701",
    );
    assert.equal(parsed.ownership.serviceOwner, "platform-backend@company.example");
});

test("unit: ai verification strict staging rejects local-only endpoint", () => {
    const result = runConfigProbe({
        AI_VERIFICATION_PROFILE: "staging",
        AI_VERIFICATION_ENABLED: "true",
        AI_VERIFICATION_STRICT_CONFIG: "true",
        AI_VERIFICATION_URL: "http://localhost:8701",
        AI_VERIFICATION_TIMEOUT_MS: "10000",
        AI_VERIFICATION_OWNER_SERVICE: "platform-backend@company.example",
        AI_VERIFICATION_OWNER_ML: "ml-quality@company.example",
        AI_VERIFICATION_OWNER_ONCALL: "#supplychain-ai-staging",
    });

    assert.notEqual(result.status, 0);
    assert.match(
        getCombinedOutput(result),
        /AI_VERIFICATION_URL cannot target local-only host in staging profile/,
    );
});

test("unit: ai verification rejects profile mismatch with profile file", () => {
    const result = runConfigProbe({
        AI_VERIFICATION_PROFILE: "prod",
        AI_VERIFICATION_PROFILE_FILE:
            "./config/ai-profiles/staging.example.json",
    });

    assert.notEqual(result.status, 0);
    assert.match(
        getCombinedOutput(result),
        /AI_VERIFICATION_PROFILE \(prod\) does not match AI_VERIFICATION_PROFILE_FILE profile \(staging\)/,
    );
});