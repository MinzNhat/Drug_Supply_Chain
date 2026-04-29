import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Audit record linking API actor identity to effective Fabric submit/evaluate identity.
 */
const fabricIdentityLinkSchema = new Schema(
    {
        traceId: { type: String, default: "", index: true },
        actor: {
            userId: { type: String, default: "", index: true },
            role: { type: String, default: "", index: true },
            mspId: { type: String, default: "", index: true },
            distributorUnitId: { type: String, default: "", index: true },
        },
        fabricIdentity: {
            sessionKey: { type: String, default: "", index: true },
            label: { type: String, default: "" },
            source: { type: String, default: "" },
            role: { type: String, default: "" },
            mspId: { type: String, default: "", index: true },
            peerEndpoint: { type: String, default: "" },
            peerHostAlias: { type: String, default: "" },
            certPath: { type: String, default: "" },
            keyPath: { type: String, default: "" },
        },
        network: {
            channelName: { type: String, default: "" },
            chaincodeName: { type: String, default: "" },
        },
        transaction: {
            name: { type: String, default: "", index: true },
            mode: { type: String, default: "", index: true },
            status: { type: String, default: "", index: true },
            errorCode: { type: String, default: "" },
            errorMessage: { type: String, default: "" },
        },
        occurredAt: { type: Date, default: Date.now, index: true },
    },
    {
        timestamps: true,
    },
);

fabricIdentityLinkSchema.index({ "actor.userId": 1, occurredAt: -1 });
fabricIdentityLinkSchema.index({ "actor.distributorUnitId": 1, occurredAt: -1 });
fabricIdentityLinkSchema.index({ "fabricIdentity.sessionKey": 1, occurredAt: -1 });

export const FabricIdentityLink = mongoose.model(
    "FabricIdentityLink",
    fabricIdentityLinkSchema,
);
