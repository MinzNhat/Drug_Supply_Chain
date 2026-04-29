import { asyncHandler } from "../../utils/async-handler/async-handler.js";
import { DocumentStorageAdapter } from "../../integrations/document-storage/document-storage.adapter.js";

/**
 * Controller for serving stored files by CID.
 */
export const createFileController = () => {
    const adapter = new DocumentStorageAdapter();

    /**
     * GET /api/v1/files/:cid
     */
    const getFile = asyncHandler(async (req, res) => {
        const { cid } = req.params;
        const { buffer, mediaType } = await adapter.getDocument(cid);

        console.log(`FileController: Serving CID ${cid}, MediaType: ${mediaType}, Size: ${buffer.length} bytes`);

        res.setHeader("Content-Type", mediaType);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

        // Set Content-Disposition to help browser identify file and suggest filename
        const ext = mediaType.split("/")[1] || "bin";
        res.setHeader("Content-Disposition", `inline; filename="${cid}.${ext}"`);

        return res.send(buffer);
    });

    return { getFile };
};
