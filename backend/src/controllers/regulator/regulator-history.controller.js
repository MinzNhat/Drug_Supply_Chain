import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { BatchGeoEvent } from "../../models/batch/batch-geo-event.model.js";
import { BatchIndex } from "../../models/batch/batch-index.model.js";
import { DrugCategory } from "../../models/product/drug-category.model.js";
import { User } from "../../models/user/user.model.js";
import { HttpException } from "../../utils/http-exception/http-exception.js";
import { SupplyChainService } from "../../services/supply-chain/supply-chain.service.js";

const supplyChainService = new SupplyChainService();

/**
 * Helper to normalize IPFS URLs to the correct gateway port (8085)
 * and dynamic host (using the current request host instead of hardcoded localhost)
 */
const normalizeIpfsUrl = (url, requestHost) => {
    if (!url || typeof url !== 'string') return url;
    
    // Replace localhost with the actual host from request
    let normalized = url;
    if (requestHost) {
        const hostWithoutPort = requestHost.split(':')[0];
        normalized = normalized.replace('localhost', hostWithoutPort);
    }
    
    // Ensure port is 8085 for external access
    return normalized.replace(':8080/ipfs/', ':8085/ipfs/');
};

/**
 * Controller for regulator blockchain history and audit trail.
 */
export const createRegulatorHistoryController = (supplyChainService) => {
    /**
     * GET /api/v1/regulator/blockchain-history
     * List all blockchain transactions (geo events) with regional filtering for regulators.
     */
    const getBlockchainHistory = asyncHandler(async (req, res) => {
        const { user } = req;
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
        const skip = (page - 1) * limit;
        const requestHost = req.headers.host;

        const query = {};
        
        // Regional filter for LOW level regulators
        // BYPASS: If searching for a specific batchID, allow seeing all provinces to support full trace mapping
        if (user.role === "Regulator" && user.regulatorLevel === "LOW" && !req.query.batchID) {
            // They can only see transactions that happened in their province in the general list
            query.province = user.province;
        }

        // Additional filters from query params
        if (req.query.batchID) {
            query.batchID = { $regex: req.query.batchID, $options: "i" };
        }

        if (req.query.eventType) {
            query.eventType = req.query.eventType;
        } else {
            // Default: exclude VERIFY events which are noisy for audits
            query.eventType = { $ne: "VERIFY" };
        }

        const [total, items] = await Promise.all([
            BatchGeoEvent.countDocuments(query),
            BatchGeoEvent.find(query)
                .sort({ occurredAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
        ]);

        // Enrich items with actor business names and batch details (drugName, Images)
        const enrichedItems = await Promise.all(
            items.map(async (item) => {
                const [actor, batchIndex] = await Promise.all([
                    item.actorUserId ? 
                        User.findById(item.actorUserId).select("businessName").lean() :
                        User.findOne({ mspId: item.actorMSP }).select("businessName").lean(),
                    BatchIndex.findOne({ batchID: item.batchID.trim() }).lean()
                ]);

                // 1. Resolve Product Information (Priority: BatchIndex > Event Metadata > Fabric Fallback)
                let drugName = batchIndex?.drugName || item.metadata?.drugName || "N/A";
                let quantity = batchIndex?.quantity || item.metadata?.quantity || "N/A";
                let certificates = item.metadata?.certificates || batchIndex?.certificates || [];
                let productImage = item.metadata?.productImage || batchIndex?.productImage;
                let qrImage = item.metadata?.qrImage || batchIndex?.qrImageBase64;

                // CRITICAL FALLBACK: If still N/A, read from Fabric (Blockchain)
                if (drugName === "N/A" || !qrImage) {
                    try {
                        const fabricBatch = await supplyChainService.readBatch(item.batchID, { role: "Regulator", mspId: "RegulatorMSP" });
                        if (fabricBatch) {
                            drugName = fabricBatch.drugName || drugName;
                            quantity = fabricBatch.quantity || quantity;
                            qrImage = qrImage || fabricBatch.qrImageBase64;
                            
                            // Get certificates from enriched batch details
                            if (fabricBatch.drugDetails?.certificates) {
                                certificates = fabricBatch.drugDetails.certificates;
                            }
                            if (!productImage && fabricBatch.drugDetails?.imageCID) {
                                productImage = `http://localhost:8085/ipfs/${fabricBatch.drugDetails.imageCID}`;
                            }
                        }
                    } catch (err) {
                        // Ignore fabric read errors for individual items
                    }
                }

                // 2. Final Image Resolution (Category Fallback)
                if (!productImage && drugName !== "N/A") {
                    const category = await DrugCategory.findOne({ name: drugName }).select("imageCID").lean();
                    if (category?.imageCID) {
                        productImage = `http://localhost:8085/ipfs/${category.imageCID}`;
                    }
                }

                return {
                    ...item,
                    actorName: actor?.businessName || item.metadata?.organization || item.actorMSP,
                    drugName: drugName,
                    quantity: quantity,
                    metadata: {
                        ...item.metadata,
                        productImage: normalizeIpfsUrl(productImage, requestHost),
                        qrImage: qrImage?.startsWith("data:image") ? qrImage : (qrImage ? `data:image/png;base64,${qrImage}` : null),
                        certificates: (certificates || []).map(cert => ({
                            ...cert,
                            url: normalizeIpfsUrl(cert.url || `http://localhost:8085/ipfs/${cert.cid}`, requestHost)
                        }))
                    }
                };
            })
        );

        return res.json({
            success: true,
            data: {
                total,
                page,
                limit,
                items: enrichedItems,
            },
        });
    });

    /**
     * POST /api/v1/regulator/trace-by-qr
     * Identify a batch ID from a QR image without increasing scan count.
     */
    const traceByQr = asyncHandler(async (req, res) => {
        if (!req.file) {
            throw new HttpException(400, "IMAGE_REQUIRED", "QR image is required");
        }

        // Silent verification (Read-only on external QR service)
        const verifyResult = await supplyChainService.qrService.verify(req.file.buffer);
        
        console.log(`[QR_TRACE] Verify result:`, {
            isAuthentic: verifyResult.isAuthentic,
            confidenceScore: verifyResult.confidenceScore,
            hasMeta: !!verifyResult.decodedMeta?.dataHash
        });

        if (!verifyResult.decodedMeta?.dataHash) {
            // HEALING: Sometimes the dataHash is missing in decodedMeta but present in the token structure
            // Or the image was slightly blurry. We can try to use the token if it looks like a valid drug-guard token.
            if (verifyResult.token && verifyResult.token.includes('.')) {
                console.log(`[QR_TRACE] Metadata missing, attempting to extract from token: ${verifyResult.token.substring(0, 10)}...`);
            }
            throw new HttpException(400, "QR_DECODE_FAILED", "Hệ thống không thể giải mã thông tin từ ảnh QR này. Vui lòng đảm bảo ảnh chụp rõ nét và không bị lóa sáng.");
        }

        const dataHash = verifyResult.decodedMeta.dataHash;
        
        if (!dataHash) {
            throw new HttpException(400, "QR_DATA_HASH_MISSING", "QR decoded but no data hash found in metadata.");
        }

        // Silent lookup on ledger (Read-only)
        const batch = await supplyChainService.ledgerRepository.getBatchByDataHash(dataHash, verifyResult.token);
        
        if (!batch) {
            throw new HttpException(404, "BATCH_NOT_FOUND", `No batch found matching data hash: ${dataHash}`);
        }

        return res.json({
            success: true,
            data: {
                batchID: batch.batchID,
                hash: dataHash
            }
        });
    });

    return {
        getBlockchainHistory,
        traceByQr,
    };
};
