import fs from "fs";
import path from "path";

const complianceEnv = (process.env.DATN_COMPLIANCE_ENV ?? "staging").trim().toLowerCase();
const strictMode = complianceEnv === "staging" || complianceEnv === "prod";
const outputDir = path.resolve(
    process.env.DATN_COMPLIANCE_OUTPUT_DIR ?? path.join(process.cwd(), "test-output", "deploy"),
);
const manifestPath = (process.env.DATN_RELEASE_MANIFEST ?? "").trim();

const now = new Date();
const timestampUtc = now.toISOString();
const compactTimestamp = timestampUtc
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const reportFile = path.join(
    outputDir,
    `compliance-key-custody-${complianceEnv}-${compactTimestamp}.json`,
);

const checks = [];

const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const asText = (value, fallback = "") => (hasText(value) ? value.trim() : fallback);
const asBool = (value, fallback = false) => {
    if (!hasText(value)) {
        return fallback;
    }

    return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const parseIntStrict = (value, fallback) => {
    if (!hasText(value)) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
};

const resolvePath = (inputPath) => {
    if (!hasText(inputPath)) {
        return "";
    }

    return path.isAbsolute(inputPath)
        ? inputPath.trim()
        : path.resolve(process.cwd(), inputPath.trim());
};

const insecureSecretPattern = /(change_me|changeme|replace_me|replace-with-strong-secret|replace_with_strong_secret|local-dev-secret|test-secret|default-secret|secret123)/i;

const isStrongSecret = (value) => {
    if (!hasText(value)) {
        return false;
    }

    const normalized = value.trim();
    if (normalized.length < 32) {
        return false;
    }

    if (insecureSecretPattern.test(normalized)) {
        return false;
    }

    return true;
};

const addCheck = (id, pass, details) => {
    checks.push({
        id,
        pass,
        details,
    });
};

const loadSecret = (directKey, fileKey) => {
    const direct = asText(process.env[directKey], "");
    const fileEnv = asText(process.env[fileKey], "");

    if (hasText(direct) && hasText(fileEnv)) {
        return {
            source: "invalid",
            value: "",
            filePath: fileEnv,
            error: `Both ${directKey} and ${fileKey} are set`,
        };
    }

    if (hasText(fileEnv)) {
        const absolutePath = resolvePath(fileEnv);

        if (!absolutePath || !fs.existsSync(absolutePath)) {
            return {
                source: "file",
                value: "",
                filePath: absolutePath || fileEnv,
                error: `Secret file does not exist for ${fileKey}`,
            };
        }

        let raw = "";
        try {
            raw = fs.readFileSync(absolutePath, "utf8");
        } catch (error) {
            return {
                source: "file",
                value: "",
                filePath: absolutePath,
                error: `Cannot read secret file for ${fileKey}: ${error instanceof Error ? error.message : String(error)}`,
            };
        }

        return {
            source: "file",
            value: raw.trim(),
            filePath: absolutePath,
            error: "",
        };
    }

    if (hasText(direct)) {
        return {
            source: "env",
            value: direct,
            filePath: "",
            error: "",
        };
    }

    return {
        source: "missing",
        value: "",
        filePath: "",
        error: `Missing ${directKey} or ${fileKey}`,
    };
};

const runSecretChecks = () => {
    const backendSecret = loadSecret("DATN_BACKEND_JWT_SECRET", "DATN_BACKEND_JWT_SECRET_FILE");
    const qrSecret = loadSecret("DATN_QR_HMAC_SECRET", "DATN_QR_HMAC_SECRET_FILE");

    addCheck(
        "secret_source_backend",
        backendSecret.source === "file" || (!strictMode && backendSecret.source === "env"),
        backendSecret.error || `source=${backendSecret.source || "unknown"}`,
    );
    addCheck(
        "secret_source_qr",
        qrSecret.source === "file" || (!strictMode && qrSecret.source === "env"),
        qrSecret.error || `source=${qrSecret.source || "unknown"}`,
    );

    addCheck(
        "secret_strength_backend",
        isStrongSecret(backendSecret.value),
        backendSecret.value
            ? `length=${backendSecret.value.length}`
            : backendSecret.error || "missing secret value",
    );
    addCheck(
        "secret_strength_qr",
        isStrongSecret(qrSecret.value),
        qrSecret.value
            ? `length=${qrSecret.value.length}`
            : qrSecret.error || "missing secret value",
    );

    if (strictMode) {
        addCheck(
            "secret_file_mount_backend",
            backendSecret.source === "file" && hasText(backendSecret.filePath),
            backendSecret.filePath || backendSecret.error || "backend secret file path missing",
        );
        addCheck(
            "secret_file_mount_qr",
            qrSecret.source === "file" && hasText(qrSecret.filePath),
            qrSecret.filePath || qrSecret.error || "qr secret file path missing",
        );
    }
};

const runManifestChecks = () => {
    if (!hasText(manifestPath)) {
        addCheck(
            "manifest_secret_scan",
            !strictMode,
            strictMode
                ? "DATN_RELEASE_MANIFEST is required in strict mode"
                : "skipped (no DATN_RELEASE_MANIFEST provided)",
        );
        return;
    }

    const absoluteManifestPath = resolvePath(manifestPath);
    if (!absoluteManifestPath || !fs.existsSync(absoluteManifestPath)) {
        addCheck(
            "manifest_secret_scan",
            false,
            `Release manifest not found: ${manifestPath}`,
        );
        return;
    }

    const raw = fs.readFileSync(absoluteManifestPath, "utf8");
    const lines = raw.split(/\r?\n/);
    const leakedKeys = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
            continue;
        }

        const [rawKey, ...rest] = trimmed.split("=");
        const key = rawKey.trim();
        const value = rest.join("=").trim();

        const isSecretLike = /(SECRET|PASSWORD|PRIVATE_KEY|TOKEN)$/i.test(key);
        if (!isSecretLike) {
            continue;
        }

        if (!value) {
            continue;
        }

        leakedKeys.push(key);
    }

    addCheck(
        "manifest_secret_scan",
        leakedKeys.length === 0,
        leakedKeys.length === 0
            ? `No secret-like keys found in ${absoluteManifestPath}`
            : `Secret-like keys present in manifest: ${leakedKeys.join(", ")}`,
    );
};

const runCustodyPolicyChecks = () => {
    const keyCustodyProvider = asText(process.env.DATN_KEY_CUSTODY_PROVIDER, "kms").toLowerCase();
    const keyCustodyProviderRef = asText(
        process.env.DATN_KEY_CUSTODY_PROVIDER_REF,
        `kms://datn/${complianceEnv}/app-key-custody`,
    );
    const keyRotationMaxDays = parseIntStrict(
        process.env.DATN_KEY_ROTATION_MAX_DAYS,
        90,
    );
    const keyRevocationSlaHours = parseIntStrict(
        process.env.DATN_KEY_REVOCATION_SLA_HOURS,
        4,
    );

    addCheck(
        "key_custody_provider",
        ["kms", "hsm"].includes(keyCustodyProvider),
        `provider=${keyCustodyProvider}`,
    );
    addCheck(
        "key_custody_provider_ref",
        hasText(keyCustodyProviderRef) && !/replace_me|changeme/i.test(keyCustodyProviderRef),
        keyCustodyProviderRef || "missing key custody provider ref",
    );
    addCheck(
        "key_rotation_cadence",
        Number.isInteger(keyRotationMaxDays) && keyRotationMaxDays > 0 && keyRotationMaxDays <= 180,
        `rotationDays=${keyRotationMaxDays}`,
    );
    addCheck(
        "key_revocation_sla",
        Number.isInteger(keyRevocationSlaHours) && keyRevocationSlaHours > 0 && keyRevocationSlaHours <= 24,
        `revocationSlaHours=${keyRevocationSlaHours}`,
    );

    const fabricCustodyProvider = asText(
        process.env.DATN_FABRIC_IDENTITY_CUSTODY_PROVIDER,
        "hsm",
    ).toLowerCase();
    const fabricPolicyRef = asText(
        process.env.DATN_FABRIC_IDENTITY_POLICY_REF,
        `policy/fabric-identity-custody-${complianceEnv}`,
    );
    const fabricRotationDays = parseIntStrict(
        process.env.DATN_FABRIC_IDENTITY_ROTATION_MAX_DAYS,
        90,
    );
    const fabricRevocationSlaHours = parseIntStrict(
        process.env.DATN_FABRIC_IDENTITY_REVOCATION_SLA_HOURS,
        4,
    );

    addCheck(
        "fabric_custody_provider",
        ["kms", "hsm"].includes(fabricCustodyProvider),
        `provider=${fabricCustodyProvider}`,
    );
    addCheck(
        "fabric_identity_policy_ref",
        hasText(fabricPolicyRef) && !/replace_me|changeme/i.test(fabricPolicyRef),
        fabricPolicyRef || "missing fabric identity policy ref",
    );
    addCheck(
        "fabric_rotation_cadence",
        Number.isInteger(fabricRotationDays) && fabricRotationDays > 0 && fabricRotationDays <= 180,
        `rotationDays=${fabricRotationDays}`,
    );
    addCheck(
        "fabric_revocation_sla",
        Number.isInteger(fabricRevocationSlaHours) && fabricRevocationSlaHours > 0 && fabricRevocationSlaHours <= 24,
        `revocationSlaHours=${fabricRevocationSlaHours}`,
    );

    const breakGlassRunbookRef = asText(
        process.env.DATN_BREAK_GLASS_RUNBOOK_REF,
        "docs/platform/key-custody-compliance.md#break-glass-access-policy",
    );
    const breakGlassApproverGroup = asText(
        process.env.DATN_BREAK_GLASS_APPROVER_GROUP,
        "security-approvers",
    );

    addCheck(
        "break_glass_runbook",
        hasText(breakGlassRunbookRef) && !/replace_me|changeme/i.test(breakGlassRunbookRef),
        breakGlassRunbookRef || "missing break-glass runbook ref",
    );
    addCheck(
        "break_glass_approver_group",
        hasText(breakGlassApproverGroup),
        breakGlassApproverGroup || "missing break-glass approver group",
    );
};

const runAuditComplianceChecks = () => {
    const retentionDays = parseIntStrict(process.env.DATN_AUDIT_RETENTION_DAYS, 2555);
    const immutableStorage = asBool(process.env.DATN_AUDIT_IMMUTABLE_STORAGE, true);
    const legalHoldPolicyRef = asText(
        process.env.DATN_AUDIT_LEGAL_HOLD_POLICY_REF,
        "policy/legal-hold-v1",
    );
    const exportEncryptionKeyRef = asText(
        process.env.DATN_AUDIT_EXPORT_ENCRYPTION_KEY_REF,
        `kms://datn/${complianceEnv}/audit-export-key`,
    );
    const auditAccessLogEnabled = asBool(
        process.env.DATN_AUDIT_ACCESS_LOG_ENABLED,
        true,
    );

    addCheck(
        "audit_retention_days",
        Number.isInteger(retentionDays) && retentionDays >= 365,
        `retentionDays=${retentionDays}`,
    );
    addCheck(
        "audit_immutable_storage",
        immutableStorage,
        `immutableStorage=${immutableStorage}`,
    );
    addCheck(
        "audit_legal_hold_policy_ref",
        hasText(legalHoldPolicyRef) && !/replace_me|changeme/i.test(legalHoldPolicyRef),
        legalHoldPolicyRef || "missing legal hold policy ref",
    );
    addCheck(
        "audit_export_encryption_key_ref",
        hasText(exportEncryptionKeyRef) && !/replace_me|changeme/i.test(exportEncryptionKeyRef),
        exportEncryptionKeyRef || "missing audit export encryption key ref",
    );
    addCheck(
        "audit_access_log_enabled",
        auditAccessLogEnabled,
        `auditAccessLogEnabled=${auditAccessLogEnabled}`,
    );
};

runSecretChecks();
runManifestChecks();
runCustodyPolicyChecks();
runAuditComplianceChecks();

const passed = checks.every((check) => check.pass);
const report = {
    status: passed ? "PASSED" : "FAILED",
    generatedAtUtc: timestampUtc,
    complianceEnv,
    strictMode,
    manifestPath: hasText(manifestPath) ? resolvePath(manifestPath) : "",
    checks,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

const failedChecks = checks.filter((check) => !check.pass).map((check) => check.id);
console.log(
    JSON.stringify(
        {
            status: report.status,
            reportFile,
            failedChecks,
        },
        null,
        2,
    ),
);

if (!passed) {
    process.exit(1);
}
