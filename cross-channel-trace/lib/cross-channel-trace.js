'use strict';

const _ = require('lodash');
const { Contract } = require('fabric-contract-api');
const { assets, contracts, utils } = require('ol-common');

class CrossChannelTrace extends contracts.ExpiringBanknoteBase {
    /**
     * Send tokens to user in different channel
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} amount amount of tokens to send
     * @param {String} recipientId recipient userUuid
     * @param {String} recipientChannel recipient channel
     * @returns {Object} object with list of frozen Assets and CrossChannelEntry item
     */
    async CreateEntry(ctx, amount, recipientId, recipientChannel) {
        const txID = ctx.stub.getTxID();
        const clientId = this._getClientID(ctx);
        const channelName = ctx.stub.getChannelID();
        const txTime = utils.getTxTimestampSeconds(ctx);
        const timeoutSecondsSinceEpoch = 60 + txTime;

        const crossChannelEntry = await this._createCrossChannelEntry(
            txID,
            freezeOutcome,
            clientId,
            channelName,
            recipientId,
            recipientChannel,
            timeoutSecondsSinceEpoch,
        );
        return JSON.stringify({result: crossChannelEntry, txid: txID});
    }

    /**
     * Receive tokens send from user in different channel
     *
     * @param {Context} ctx the transaction context
     * @param {CrossChannelEntry} crossChannelEntry an entry to accommodate
     * @returns {Object} created asset + txid
     */
    async ResolveEntry(ctx, crossChannelEntry) {
        const txID = ctx.stub.getTxID();
        const clientId = this._getClientID(ctx);
        const channelName = ctx.stub.getChannelID();
        const txTime = utils.getTxTimestampSeconds(ctx);
        const timeoutSecondsSinceEpoch = 60 + txTime;

        const changeOutcome = await this.Change(ctx, amount);
        const assetsToFreeze = changeOutcome.result.outputs;
        const freezeOutcome = await this.Freeze(ctx, assetsToFreeze);
        const chaincodeResponse = await ctx.stub.invokeChaincode('expiring-banknote-contract', crossChannelEntryArgs, traceChannelName);

        const response = {
            frozenAssets: freezeOutcome,
            metadataObject: chaincodeResponse,
        };
        return JSON.stringify({result: response, txid: txID});
    }

    /**
     * Returns data about entry bond to the entry id
     *
     * @param {Context} ctx the transaction context
     * @param {CrossChannelEntry} crossChannelEntry an entry to accommodate
     * @returns {Object} created asset + txid
     */
    async GetEntry(ctx, entryId) {
        const txID = ctx.stub.getTxID();
        const clientId = this._getClientID(ctx);
        const channelName = ctx.stub.getChannelID();
        const txTime = utils.getTxTimestampSeconds(ctx);
        const timeoutSecondsSinceEpoch = 60 + txTime;

        const changeOutcome = await this.Change(ctx, amount);
        const assetsToFreeze = changeOutcome.result.outputs;
        const freezeOutcome = await this.Freeze(ctx, assetsToFreeze);
        const chaincodeResponse = await ctx.stub.invokeChaincode('expiring-banknote-contract', crossChannelEntryArgs, traceChannelName);

        const response = {
            frozenAssets: freezeOutcome,
            metadataObject: chaincodeResponse,
        };
        return JSON.stringify({result: response, txid: txID});
    }

    /**
     * Returns created entry
     *
     * @param {Context} ctx the transaction context
     * @param {String} crossChannelEntry an entry to accommodate
     * @returns {Object} created asset + txid
     */
    async _createCrossChannelEntry(
        ctx,
        txID,
            freezeOutcome,
            clientId,
            channelName,
            recipientId,
            recipientChannel,
            timeoutSecondsSinceEpoch
    ) {

    }
}

module.exports.contract = CrossChannelTrace;
