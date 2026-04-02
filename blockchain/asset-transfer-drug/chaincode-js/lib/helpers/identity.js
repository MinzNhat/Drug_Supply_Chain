"use strict";

const { MSP_CANONICAL } = require("../drugTracker.constants");

/**
 * This module provides helper functions for working with client identities and MSPs (Membership Service Providers) in the context of Hyperledger Fabric chaincode.
 * It includes functions to retrieve the client's MSP ID, convert MSP IDs to a canonical form for consistent access control checks, and determine if a client belongs to a specific organization or is a regulator.
 * By using a canonical mapping of MSP IDs, the contract can enforce permissions and access control in a way that treats different organizational identifiers as equivalent when necessary.
 * This is particularly useful in scenarios where multiple organizations may have similar roles (e.g., multiple regulators or manufacturers) but are identified by different MSP IDs.
 *
 * @param {Context} ctx - The transaction context provided by the Fabric runtime, which includes client identity information.
 * @returns {string} The MSP ID of the client invoking the transaction.
 */
function getClientMSP(ctx) {
    return ctx.clientIdentity.getMSPID();
}

/**
 * toCanonicalMSP converts a given MSP ID to its canonical form based on the MSP_CANONICAL mapping.
 * If the provided MSP ID is not found in the mapping, it returns the original MSP ID.
 * This allows the contract to treat different MSP identifiers as equivalent when enforcing permissions.
 *
 * @param {string} mspID - The MSP ID to convert.
 * @returns {string} The canonical MSP ID.
 */
function toCanonicalMSP(mspID) {
    return MSP_CANONICAL[mspID] || mspID;
}

/**
 * isCanonicalMSP checks if a given MSP ID is equivalent to a target canonical MSP ID.
 * It uses the toCanonicalMSP function to normalize both IDs before comparison.
 *
 * @param {string} mspID - The MSP ID to check.
 * @param {string} targetCanonical - The target canonical MSP ID.
 * @returns {boolean} True if the MSP IDs are equivalent, false otherwise.
 */
function isCanonicalMSP(mspID, targetCanonical) {
    return toCanonicalMSP(mspID) === targetCanonical;
}

/** sameMSP checks if two MSP IDs are equivalent by converting them to their canonical forms and comparing the results.
 *
 * @param {string} mspA - The first MSP ID to compare.
 * @param {string} mspB - The second MSP ID to compare.
 * @returns {boolean} True if the MSP IDs are equivalent, false otherwise.
 */
function sameMSP(mspA, mspB) {
    return toCanonicalMSP(mspA) === toCanonicalMSP(mspB);
}

/**
 * isOwnerOrRegulator checks if the client is either the owner of the batch or a regulator.
 *
 * @param {string} clientOrgID - The MSP ID of the client invoking the transaction.
 * @param {Object} batch - The batch object containing owner information.
 * @returns {boolean} True if the client is the owner or a regulator, false otherwise.
 */
function isOwnerOrRegulator(clientOrgID, batch) {
    return (
        sameMSP(clientOrgID, batch.ownerMSP) ||
        isCanonicalMSP(clientOrgID, "RegulatorMSP")
    );
}

module.exports = {
    getClientMSP,
    toCanonicalMSP,
    isCanonicalMSP,
    sameMSP,
    isOwnerOrRegulator,
};
