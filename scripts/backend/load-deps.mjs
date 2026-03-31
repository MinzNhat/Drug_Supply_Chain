import { createRequire } from "module";

const localRequire = createRequire(import.meta.url);
const backendRequire = createRequire(
    new URL("../../backend/package.json", import.meta.url),
);
const protectedQrRequire = createRequire(
    new URL("../../protected-qr/package.json", import.meta.url),
);

const requireCandidates = [localRequire, backendRequire, protectedQrRequire];

/**
 * Resolve shared script dependencies from either script runtime, backend, or protected-qr package roots.
 */
export const loadPackage = (packageName) => {
    const errors = [];

    for (const requireFrom of requireCandidates) {
        try {
            const loaded = requireFrom(packageName);
            return loaded?.default ?? loaded;
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(
        `Cannot resolve package '${packageName}'. Tried script, backend, and protected-qr dependency roots. Last errors: ${errors.join(" | ")}`,
    );
};
