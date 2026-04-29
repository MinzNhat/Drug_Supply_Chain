import http from "http";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger/logger.js";
import fs from "fs";
import path from "path";

/**
 * Node type discriminators for topology graph rendering.
 *
 * @typedef {"orderer"|"peer"|"ca"} NodeType
 */

/**
 * Status values for a topology node.
 *
 * @typedef {"UP"|"DOWN"|"UNKNOWN"} NodeStatus
 */

/**
 * @typedef {Object} TopologyNode
 * @property {string} id         - Stable unique identifier for the node (e.g. "peer0.manufacturer").
 * @property {string} label      - Human-readable display name.
 * @property {NodeType} type     - Node role in the Fabric network.
 * @property {string} org        - Organisation this node belongs to (e.g. "Manufacturer").
 * @property {string} mspId      - MSP identifier for the org.
 * @property {string} host       - Resolvable hostname or IP used by the backend.
 * @property {number} port       - gRPC/listen port exposed by the node.
 * @property {NodeStatus} status - Live health status returned to the frontend.
 * @property {number|null} latencyMs - Round-trip probe latency, null when unreachable.
 * @property {string} checkedAt  - ISO timestamp of the last health probe.
 */

/**
 * Topology definition is intentionally derived from the existing Fabric config
 * objects already present in `config.fabric.organizations`.
 * Each entry maps directly to a running Docker container in the network.
 *
 * Operations listener is always available on the same host as the peer/orderer
 * but on a fixed well-known port (9443 for peers, 8443 for orderers).
 */
const PEER_OPS_PORT = Number(process.env.FABRIC_PEER_OPERATIONS_PORT ?? 9443);
const ORDERER_OPS_PORT = Number(
    process.env.FABRIC_ORDERER_OPERATIONS_PORT ?? 8443,
);

/**
 * Probe timeout for a single health check request (ms).
 * Kept deliberately short so the aggregate topology call stays fast.
 */
const PROBE_TIMEOUT_MS = Number(
    process.env.FABRIC_NODE_PROBE_TIMEOUT_MS ?? 2000,
);

/**
 * Build the static node registry from environment config & well-known
 * container naming conventions used in docker-compose.yml.
 *
 * @returns {TopologyNode[]} Ordered list of topology nodes (status = UNKNOWN).
 */
const buildNodeRegistry = () => {
    const orgs = config.fabric.organizations;

    /** @param {string} endpoint - "host:port" string from Fabric org config. */
    const parseHost = (endpoint) => {
        if (!endpoint) return { host: "localhost", port: 0 };
        const parts = endpoint.split(":");
        return { host: parts[0] || "localhost", port: Number(parts[1]) || 0 };
    };

    const nodes = [];

    // ── Orderer nodes (3× EtcdRaft cluster, hosted by Regulator org) ──────────
    const regulatorHost = parseHost(orgs.Regulator?.peerEndpoint).host;
    [
        { id: "orderer0", label: "Orderer 1", port: 7050, opsPort: 9443 },
        { id: "orderer1", label: "Orderer 2", port: 7052, opsPort: 9446 },
        { id: "orderer2", label: "Orderer 3", port: 7056, opsPort: 9447 },
    ].forEach(({ id, label, port, opsPort }) => {
        nodes.push({
            id,
            label,
            type: "orderer",
            org: "Regulator",
            mspId: "RegulatorMSP",
            host: regulatorHost,
            port,
            opsPort, // Store custom opsPort
            status: "UNKNOWN",
            latencyMs: null,
            checkedAt: new Date().toISOString(),
        });
    });

    // ── Peer nodes — one entry per configured organisation ────────────────────
    const peerDefs = [
        {
            id: "peer0.regulator",
            label: "Peer: Regulator",
            org: "Regulator",
            mspId: "RegulatorMSP",
            endpoint: orgs.Regulator?.peerEndpoint,
        },
        {
            id: "peer0.manufacturer",
            label: "Peer: Manufacturer",
            org: "Manufacturer",
            mspId: "ManufacturerMSP",
            endpoint: orgs.Manufacturer?.peerEndpoint,
        },
        {
            id: "peer0.distributor",
            label: "Peer: Distributor",
            org: "Distributor",
            mspId: "DistributorMSP",
            endpoint: orgs.Distributor?.peerEndpoint,
        },
    ];

    // Merge any distributor bridge units as additional peer nodes.
    const bridge = config.fabric.distributorIdentityBridge;
    if (bridge?.enabled && bridge.units) {
        Object.entries(bridge.units).forEach(([unitId, unit]) => {
            peerDefs.push({
                id: `peer0.distributor.${unitId}`,
                label: `Peer: ${unit.identityLabel || unitId}`,
                org: `Distributor (${unitId})`,
                mspId: unit.mspId || "DistributorMSP",
                endpoint: unit.peerEndpoint,
            });
        });
    }

    peerDefs.forEach(({ id, label, org, mspId, endpoint }) => {
        const { host, port } = parseHost(endpoint);
        nodes.push({
            id,
            label,
            type: "peer",
            org,
            mspId,
            host,
            port,
            status: "UNKNOWN",
            latencyMs: null,
            checkedAt: new Date().toISOString(),
        });
    });

    // ── On-demand nodes from registry ─────────────────────────────────────────
    try {
        const registryPath = path.join(process.cwd(), "blockchain", "on-demand-nodes.json");
        if (fs.existsSync(registryPath)) {
            const onDemandNodes = JSON.parse(fs.readFileSync(registryPath, "utf8"));
            onDemandNodes.forEach((node) => {
                nodes.push({
                    ...node,
                    status: "UNKNOWN",
                    latencyMs: null,
                    checkedAt: new Date().toISOString(),
                });
            });
        }
    } catch (err) {
        logger.error({ message: "failed-to-read-node-registry", error: err.message });
    }

    return nodes;
};

/**
 * Perform a single HTTP GET probe against the Fabric Operations HTTP endpoint.
 * Fabric exposes `GET /healthz` → `{"status":"OK"}` when healthy.
 *
 * Uses Node.js built-in `http` to avoid pulling an HTTP client dependency
 * and to keep the probe as lightweight as possible.
 *
 * @param {string} host - Target hostname or IP.
 * @param {number} opsPort - Operations listener port.
 * @returns {Promise<{ok: boolean, latencyMs: number}>} Probe result.
 */
const probeNode = (host, opsPort) =>
    new Promise((resolve) => {
        const start = Date.now();
        const req = http.get(
            { hostname: host, port: opsPort, path: "/healthz", timeout: PROBE_TIMEOUT_MS },
            (res) => {
                // Drain the response body to allow socket reuse.
                res.resume();
                const latencyMs = Date.now() - start;
                resolve({ ok: res.statusCode === 200, latencyMs });
            },
        );

        req.on("error", () => resolve({ ok: false, latencyMs: Date.now() - start }));
        req.on("timeout", () => {
            req.destroy();
            resolve({ ok: false, latencyMs: PROBE_TIMEOUT_MS });
        });
    });

/**
 * Query live network topology by probing every registered Fabric node.
 * All probes run in parallel to keep overall latency bounded by the slowest
 * unreachable node (capped by PROBE_TIMEOUT_MS).
 *
 * This service is intentionally stateless — no caching — so that the FE
 * polling interval controls freshness without server-side state drift.
 *
 * @returns {Promise<{nodes: TopologyNode[], fabric: {enabled: boolean, channelName: string, chaincodeName: string}}>}
 */
export const getNetworkTopology = async () => {
    const registry = buildNodeRegistry();
    const now = new Date().toISOString();

    // Determine the right operations port for each node type.
    const probes = registry.map(async (node) => {
        const opsPort = node.opsPort || (node.type === "orderer" ? ORDERER_OPS_PORT : PEER_OPS_PORT);

        // Skip probe for nodes with no configured host (e.g. optional distributor units).
        if (!node.host || node.host === "localhost" && node.port === 0) {
            return { ...node, status: /** @type {NodeStatus} */ ("UNKNOWN"), checkedAt: now };
        }

        try {
            const { ok, latencyMs } = await probeNode(node.host, opsPort);
            return {
                ...node,
                status: /** @type {NodeStatus} */ (ok ? "UP" : "DOWN"),
                latencyMs: ok ? latencyMs : null,
                checkedAt: now,
            };
        } catch (err) {
            logger.warn({
                message: "fabric-node-probe-error",
                nodeId: node.id,
                error: String(err),
            });
            return { ...node, status: /** @type {NodeStatus} */ ("DOWN"), checkedAt: now };
        }
    });

    const nodes = await Promise.all(probes);

    return {
        nodes,
        fabric: {
            enabled: config.fabric.enabled,
            channelName: config.fabric.channelName,
            chaincodeName: config.fabric.chaincodeName,
        },
    };
};
