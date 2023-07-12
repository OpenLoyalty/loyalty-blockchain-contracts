const stringify = require("json-stringify-deterministic");

const { assets, contracts, utils } = require("loyalty-blockchain-common");

class PrepaidCardContract extends contracts.ExpiringStandaloneValueAssetBase {
  /**
   * Mint creates a Prepaid Card
   *
   * @param {Context} ctx the transaction context
   * @param {String} userId recipient user identifier
   * @param {Integer} amount amount of initial card balance
   * @param {String} currency in which amount is represented
   * @param {Integer} enforcementDate timestamp since when card is active
   * @param {Integer} expirationDate timestamp of card expiration
   * @returns {Object} Created card id
   */
  async Mint(ctx, userId, amount, currency, enforcementDate, expirationDate) {
    // assert minter is admin
    this._assertSignerIsAdmin(ctx);

    const txID = ctx.stub.getTxID();
    const txTime = utils.getTxTimestampSeconds(ctx);
    const amountInt = parseInt(amount, 10);
    const enforcementDateInt = parseInt(enforcementDate, 10);
    const expirationDateInt = parseInt(expirationDate, 10);
    // TODO: verify that currency is a valid string
    console.log(
      `Mint called with: ${userId} ; ${amountInt} ; ${currency} ; ${enforcementDateInt} : ${expirationDateInt} against txTime: ${txTime}`
    );
    const newAsset = new assets.ExpiringStandaloneValueAsset(
      `${txID}.0`,
      userId,
      assets.types.AssetType.PREPAID_CARD,
      amountInt,
      currency,
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
   * Recharge card with extra amount extending its expiration date
   *
   * @param {Context} ctx the transaction context
   * @param {Integer} amount amount of tokens to recharge
   * @param {Integer} extendPeriodDays number of days to extend card validity
   * @param {String} assetId asset id to spend from
   * @returns {Object} new asset state
   */
  async Recharge(ctx, amount, extendPeriodDays, assetId) {
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertAssetRechargeable(asset);
    const result = await this._recharge(ctx, asset, amount, extendPeriodDays);

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

    const allAssets = {}; // Renamed from `assets` to `allAssets` to avoid variable shadowing
    const assetOwnersAndKeysEntries = Object.entries(assetOwnersAndKeys);

    await Promise.all(
      assetOwnersAndKeysEntries.map(async ([assetOwner, assetKeys]) => {
        const assetPromises = assetKeys.map((assetKey) =>
          this._retrieveAssetByKey(ctx, assetKey)
        );
        const resolvedAssets = await Promise.all(assetPromises);
        resolvedAssets.forEach((asset, index) => {
          const assetKey = assetKeys[index];
          if (allAssets[assetKey] !== undefined) {
            throw new Error("the same asset cannot be burned twice");
          }
          this._assertIsOwner(asset, assetOwner);
          this._assertAssetSpendable(asset, txTime);
          allAssets[assetKey] = asset;
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
   * Spend some tokens from card to provider
   *
   * @param {Context} ctx the transaction context
   * @param {Integer} amount amount of tokens to spend
   * @param {String} assetId asset id to spend from
   * @returns {Object} new asset state
   */
  async Spend(ctx, amount, assetId) {
    const clientId = this._getClientID(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, clientId);
    this._assertAssetSpendable(asset, txTime);
    const result = await this._spend(ctx, asset, amount);

    ctx.stub.setEvent("SpendEvent", await utils.wrapEvent(ctx, result));

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
   * Spend tokens to provider on behalf of user
   *
   * @param {Context} ctx the transaction context
   * @param {String} senderId sender userUuid
   * @param {Integer} amount amount of tokens to spend
   * @param {String} assetId asset id to spend from
   * @returns {Object} object with list of removed input UTXOs and (optionally) created one for change
   */
  async AdminSpend(ctx, senderId, assetId, amount) {
    this._assertSignerIsAdmin(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertIsOwner(asset, senderId);
    this._assertAssetSpendable(asset, txTime);
    const result = await this._spend(ctx, asset, amount);

    ctx.stub.setEvent("SpendEvent", await utils.wrapEvent(ctx, result));

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
   * AdminRecharge card with extra amount extending its expiration date
   *
   * @param {Context} ctx the transaction context
   * @param {Integer} amount amount of tokens to recharge
   * @param {Integer} extendPeriodDays number of days to extend card validity
   * @param {String} assetId asset id to spend from
   * @returns {Object} new asset state
   */
  async AdminRecharge(ctx, amount, extendPeriodDays, assetId) {
    this._assertSignerIsAdmin(ctx);
    const txID = ctx.stub.getTxID();
    const amountInt = parseInt(amount, 10);
    if (amountInt <= 0) {
      throw new Error("asset amount must be a positive integer.");
    }
    const asset = await this._retrieveAssetByKey(ctx, assetId);
    this._assertAssetRechargeable(asset);
    const result = await this._recharge(
      ctx,
      asset,
      amountInt,
      extendPeriodDays
    );

    return JSON.stringify({ result, txid: txID });
  }

  _assertAssetRechargeable(asset) {
    if (!Object.prototype.hasOwnProperty.call(asset, "state")) {
      throw new Error("asset non-spendable due to lack of required fields");
    }
    if (asset.state !== assets.types.AssetState.LIQUID) {
      throw new Error(
        `asset to be spent needs to be in state: ${assets.types.AssetState.LIQUID} but it is: ${asset.state}`
      );
    }
  }

  _isAssetRechargeable(asset) {
    try {
      this._assertAssetRechargeable(asset);
      return true;
    } catch (e) {
      if (e instanceof Error) {
        return false;
      }
      throw e; // re-throw the error unchanged
    }
  }

  /**
   * Execute atomic recharge without any validation
   *
   * @param {Context} ctx the transaction context
   * @param {assets.ExpiringStandaloneValueAsset} asset
   * @param {Integer} amount
   * @param {Integer} extendPeriodDays
   * @param {String} newOwner new asset owner
   * @returns {Object} transferred asset
   */
  async _recharge(ctx, asset, amount, extendPeriodDays) {
    const oldAmount = asset.amount;
    const oldExpirationDate = asset.expirationDate;
    asset.amount = oldAmount + amount;
    asset.expirationDate = oldExpirationDate + extendPeriodDays * 24 * 60 * 60;
    asset.metadata.action = "recharge";
    const assetCompositeKey = ctx.stub.createCompositeKey(
      asset.type.toString(),
      [asset.key]
    );
    await ctx.stub.putState(
      assetCompositeKey,
      Buffer.from(stringify(asset.chainRepr()))
    );
    console.log(
      `asset ${asset.key} recharged. previous amount: ${oldAmount} current amount: ${asset.amount} previous expirationDate: ${oldExpirationDate} current expirationDate: ${asset.expirationDate}`
    );
    return asset;
  }

  /**
   * Execute atomic transfer without any validation
   *
   * @param {Context} ctx the transaction context
   * @param {assets.ExpiringStandaloneValueAsset} asset list of assets to transfer
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
   * Execute atomic transfer without any validation
   *
   * @param {Context} ctx the transaction context
   * @param {assets.ExpiringStandaloneValueAsset} asset asset to modify
   * @param {Int} amount amount to spend
   * @returns {Object} new asset state
   */
  async _spend(ctx, asset, amount) {
    const oldAmount = asset.amount;
    asset.amount -= amount;
    asset.metadata.action = "spend";
    const assetCompositeKey = ctx.stub.createCompositeKey(
      asset.type.toString(),
      [asset.key]
    );
    await ctx.stub.putState(
      assetCompositeKey,
      Buffer.from(stringify(asset.chainRepr()))
    );
    console.log(
      `asset ${asset.key} balance changed from ${oldAmount} to ${asset.amount}`
    );
    return asset;
  }

  async _retrieveAssetByKey(ctx, assetKey) {
    const assetCompositeKey = ctx.stub.createCompositeKey(
      assets.types.AssetType.PREPAID_CARD.toString(),
      [assetKey]
    );

    // validate that client has a utxo matching the input key
    const assetPropertiesJson = await ctx.stub.getState(assetCompositeKey); // get the asset from chaincode state
    if (!assetPropertiesJson || assetPropertiesJson.length === 0) {
      throw new Error(`asset ${assetKey} not found`);
    }
    const assetPropertiesObject = JSON.parse(assetPropertiesJson);
    return new assets.ExpiringStandaloneValueAsset(
      assetKey,
      assetPropertiesObject.owner,
      assets.types.AssetType.PREPAID_CARD,
      parseInt(assetPropertiesObject.amount, 10),
      assetPropertiesObject.currency,
      parseInt(assetPropertiesObject.enforcementDate, 10),
      parseInt(assetPropertiesObject.expirationDate, 10),
      assetPropertiesObject.metadata || {},
      assetPropertiesObject.state || assets.types.AssetState.LIQUID
    );
  }
}

module.exports.contract = PrepaidCardContract;
