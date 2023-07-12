const stringify = require("json-stringify-deterministic");

const { assets, contracts, utils } = require("loyalty-blockchain-common");

class UtilityTokenContract extends contracts.ExpiringStandaloneUtilityAssetBase {
  /**
   * Mint creates a Utility Token
   *
   * @param {Context} ctx the transaction context
   * @param {String} userId recipient user identifier
   * @param {Object} utilities key:value pairs of enabled features
   * @param {Integer} usageLimits
   * @param {Integer} enforcementDate timestamp since when token is active
   * @param {Integer} expirationDate timestamp of token expiration
   * @returns {Object} Created token id
   */
  async Mint(
    ctx,
    userId,
    utilities,
    usageLimits,
    enforcementDate,
    expirationDate
  ) {
    // assert minter is admin
    this._assertSignerIsAdmin(ctx);

    const txID = ctx.stub.getTxID();
    const txTime = utils.getTxTimestampSeconds(ctx);

    const enforcementDateInt = parseInt(enforcementDate, 10);
    const expirationDateInt = parseInt(expirationDate, 10);
    // TODO: verify that currency is a valid string

    const newAsset = new assets.ExpiringStandaloneUtilityAsset(
      `${txID}.0`,
      userId,
      assets.types.AssetType.UTILITY_TOKEN,
      utilities,
      usageLimits,
      enforcementDateInt,
      expirationDateInt,
      {},
      assets.types.AssetState.LIQUID
    );
    this._assertMintConditions(newAsset, txTime);

    const mintedAssets = await this._mint(ctx, [newAsset]);
    const result = mintedAssets[0];

    ctx.stub.setEvent("MintEvent", await utils.wrapEvent(ctx, result));
    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Burn dismisses existing Prepaid Card
   *
   * @param {Context} ctx the transaction context
   * @param {Object} assetOwnersAndKeys dict of utxo {owner: [keys]} of utxos to be burned
   * @returns {Object} burned utxo(s)
   */
  async Burn(ctx, assetOwnersAndKeys) {
    // assert burner is admin
    this._assertSignerIsAdmin(ctx);

    assetOwnersAndKeys =
      typeof assetOwnersAndKeys === "string"
        ? JSON.parse(assetOwnersAndKeys)
        : assetOwnersAndKeys;
    console.log(assetOwnersAndKeys);

    const txTime = utils.getTxTimestampSeconds(ctx);

    const assetMap = {}; // Renamed to avoid variable shadowing
    const assetOwnersAndKeysEntries = Object.entries(assetOwnersAndKeys);

    await Promise.all(
      assetOwnersAndKeysEntries.map(async ([assetOwner, assetKeys]) => {
        const assetPromises = assetKeys.map((assetKey) =>
          this._retrieveAssetByKey(ctx, assetKey)
        );
        const resolvedAssets = await Promise.all(assetPromises);
        resolvedAssets.forEach((asset, index) => {
          const assetKey = assetKeys[index];
          if (assetMap[assetKey] !== undefined) {
            throw new Error("the same asset cannot be burned twice");
          }
          this._assertIsOwner(asset, assetOwner);
          this._assertAssetSpendable(asset, txTime);
          assetMap[assetKey] = asset;
        });
      })
    );

    const txID = ctx.stub.getTxID();
    const burntAssets = await this._burn(ctx, Object.values(assets));

    ctx.stub.setEvent(
      "BurnEvent",
      await utils.wrapEvent(ctx, { inputs: Object.values(assets) })
    );

    return JSON.stringify({ result: { burntAssets }, txid: txID });
  }

  /**
   * Use some utility from card
   *
   * @param {Context} ctx the transaction context
   * @param {String} utility utility name
   * @param {String} assetId asset id to spend from
   * @returns {Object} new asset state
   */
  async Use(ctx, utility, assetId) {
    const clientId = this._getClientID(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, clientId);
    this._assertAssetSpendable(asset, txTime);
    this._assertUtilityProvided(asset, utility);
    const result = await this._use(ctx, asset, utility);

    ctx.stub.setEvent("UseEvent", await utils.wrapEvent(ctx, result));

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Transfer asset to different user
   *
   * @param {Context} ctx the transaction context
   * @param {String} assetId id of transferred asset
   * @param {String} recipientId recipient userUuid
   * @returns {Object} updated asset
   */
  async Transfer(ctx, assetId, recipientId) {
    const clientId = this._getClientID(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, clientId);
    this._assertAssetSpendable(asset, txTime);

    const result = await this._transfer(ctx, asset, recipientId);

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Use some utility from card
   *
   * @param {Context} ctx the transaction context
   * @param {String} senderId sender userUuid
   * @param {String} utility utility name
   * @param {String} assetId asset id to spend from
   * @returns {Object} new asset state
   */
  async AdminUse(ctx, senderId, utility, assetId) {
    this._assertSignerIsAdmin(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, senderId);
    this._assertAssetSpendable(asset, txTime);
    this._assertUtilityProvided(asset, utility);
    const result = await this._use(ctx, asset, utility);

    ctx.stub.setEvent("UseEvent", await utils.wrapEvent(ctx, result));

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * AdminTransfer asset on behalf of user to different user
   *
   * @param {Context} ctx the transaction context
   * @param {String} senderId sender userUuid
   * @param {String} assetId asset id to spend from
   * @param {String} recipientId recipient userUuid
   * @returns {Object} object with list of removed input UTXOs and list of created UTXOs
   */
  async AdminTransfer(ctx, senderId, assetId, recipientId) {
    this._assertSignerIsAdmin(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, senderId);
    this._assertAssetSpendable(asset, txTime);

    const result = await this._transfer(ctx, asset, recipientId);

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Execute atomic transfer without any validation
   *
   * @param {Context} ctx the transaction context
   * @param {assets.ExpiringStandaloneUtilityAsset} asset list of assets to transfer
   * @param {String} newOwner new asset owner
   * @returns {Object} transferred asset
   */
  async _transfer(ctx, asset, newOwner) {
    const oldOwner = asset.owner;
    asset.owner = newOwner;
    asset.metadata.action = "transfer";
    const assetCompositeKey = ctx.stub.createCompositeKey(
      asset.type.toString(),
      [asset.key]
    );
    await ctx.stub.putState(
      assetCompositeKey,
      Buffer.from(stringify(asset.chainRepr()))
    );
    console.log(
      `asset ${asset.key} transferred from ${oldOwner} to ${newOwner}`
    );
    return asset;
  }

  /**
   * Execute atomic asset use without validation
   *
   * @param {Context} ctx the transaction context
   * @param {assets.ExpiringStandaloneUtilityAsset} asset asset to modify
   * @param {String} utility utility to use
   * @returns {Object} new asset state
   */
  async _use(ctx, asset, utility) {
    const oldRemainingUses = asset.remainingUses;
    asset.remainingUses -= 1;
    asset.metadata.action = "use";
    asset.metadata.utility = utility;
    const assetCompositeKey = ctx.stub.createCompositeKey(
      asset.type.toString(),
      [asset.key]
    );
    await ctx.stub.putState(
      assetCompositeKey,
      Buffer.from(stringify(asset.chainRepr()))
    );
    console.log(
      `asset ${asset.key} uses count changed from ${oldRemainingUses} to ${asset.remainingUses}`
    );
    return asset;
  }

  async _retrieveAssetByKey(ctx, assetKey) {
    const assetCompositeKey = ctx.stub.createCompositeKey(
      assets.types.AssetType.VOUCHER.toString(),
      [assetKey]
    );

    // validate that client has a utxo matching the input key
    const assetPropertiesJson = await ctx.stub.getState(assetCompositeKey); // get the asset from chaincode state
    if (!assetPropertiesJson || assetPropertiesJson.length === 0) {
      throw new Error(`asset ${assetKey} not found`);
    }
    const assetPropertiesObject = JSON.parse(assetPropertiesJson);
    return new assets.ExpiringStandaloneUtilityAsset(
      assetKey,
      assetPropertiesObject.owner,
      assets.types.AssetType.UTILITY_TOKEN,
      assetPropertiesObject.utility,
      parseInt(assetPropertiesObject.remainingUses, 10),
      parseInt(assetPropertiesObject.enforcementDate, 10),
      parseInt(assetPropertiesObject.expirationDate, 10),
      assetPropertiesObject.metadata || {},
      assetPropertiesObject.state || assets.types.AssetState.LIQUID
    );
  }
}

module.exports.contract = UtilityTokenContract;
