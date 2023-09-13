'use strict';

const { contracts, utils } = require('loyalty-blockchain-common');

class CrossChannelTransfer extends contracts.ExpiringBanknoteBase {
    /**
     * Send tokens to user in different channel
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} amount amount of tokens to send
     * @param {String} recipientId recipient userUuid
     * @param {String} traceChannel mutual agreement trace channel name
     * @returns {Object} object with list of frozen Assets and CrossChannelEntry item
     */
    async SendCrossChannelTransfer(ctx, amount, recipientId, traceChannel) {
        const crossChannelEntryArgs = {};
        const crossChannelEntry = await ctx.stub.invokeChaincode(
            'cross-channel-trace',
            crossChannelEntryArgs,
            traceChannel
        );
        const txID = ctx.stub.getTxID();

        const changeOutcome = await this.Change(ctx, amount);
        const assetsToFreeze = changeOutcome.result.outputs;
        const freezeOutcome = await this.Freeze(ctx, assetsToFreeze);
        const response = {
            frozenAssets: freezeOutcome,
            metadataObject: crossChannelEntry,
        };
        return JSON.stringify({result: response, txid: txID});
    }

    /**
     * Change any amount of assets into different set of assets
     * This method is introduced to enable freezing exact amount of tokens in order to spend them
     * on a different channel (in different organization)
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} requestedAmount required asset size
     * @returns {Object} object with list of removed input UTXOs and new created UTXOs
     */
    async Change(ctx, requestedAmount) {
        return this.Send(ctx, requestedAmount, this._getClientID(ctx));
    }

    /**
     * ReceiveCrossChannelTransfer creates a new unspent transaction output (UTXO) in FROZEN state (unspendable)
     *
     * @param {Context} ctx the transaction context
     * @param {String} userId owner of fresh minted tokens (base64 encoded clientId aka X509 certificate)
     * @param {Integer} amount amount of tokens to be minted
     * @param {Integer} enforcementDate timestamp since when tokens are spendable
     * @param {Integer} expirationDate timestamp of tokens expiration date
     * @returns {Object} Created UTXO descriptor
     */
    async ReceiveCrossChannelTransfer(ctx, userId, amount, enforcementDate, expirationDate) {
        // assert minter is admin
        this._assertSignerIsAdmin(ctx);

        const txID = ctx.stub.getTxID();
        const txTime = utils.getTxTimestampSeconds(ctx);

        const newUtxo = new contracts.ExpiringBanknote(
            `${txID}.0`,
            userId,
            amountInt,
            enforcementDateInt,
            expirationDateInt,
            {},
            AssetState.FROZEN,
        );
        this._assertMintConditions(newUtxo, txTime);

        const mintedUtxos = await this._mint(ctx, [newUtxo]);
        const result = mintedUtxos[0];

        ctx.stub.setEvent('MintFrozenEvent', await wrapEvent(ctx, result));
        return JSON.stringify({ result, txid: txID });
    }
}

module.exports.contract = CrossChannelTransfer;
