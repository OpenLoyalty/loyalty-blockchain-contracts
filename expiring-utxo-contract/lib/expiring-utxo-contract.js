const _ = require("lodash");
const { assets, contracts, utils } = require("loyalty-blockchain-common");

class ExpiringUtxoContract extends contracts.ExpiringBanknoteBase {
  /**
   * Mint creates a new unspent transaction output (UTXO)
   *
   * @param {Context} ctx the transaction context
   * @param {String} userId recipient user identifier
   * @param {Integer} amount amount of tokens to be minted
   * @param {Integer} enforcementDate timestamp since when tokens are spendable
   * @param {Integer} expirationDate timestamp of tokens expiration date
   * @returns {Object} Created UTXO descriptor
   */
  async Mint(ctx, userId, amount, enforcementDate, expirationDate) {
    // assert minter is admin
    this._assertSignerIsAdmin(ctx);

    const txID = ctx.stub.getTxID();
    const txTime = utils.getTxTimestampSeconds(ctx);

    const amountInt = parseInt(amount, 10);
    const enforcementDateInt = parseInt(enforcementDate, 10);
    const expirationDateInt = parseInt(expirationDate, 10);

    const newUtxo = new assets.ExpiringBanknote(
      `${txID}.0`,
      userId,
      amountInt,
      enforcementDateInt,
      expirationDateInt,
      {},
      assets.types.AssetState.LIQUID
    );
    this._assertMintConditions(newUtxo, txTime);

    const mintedUtxos = await this._mint(ctx, [newUtxo]);
    const result = mintedUtxos[0];

    ctx.stub.setEvent("MintEvent", await utils.wrapEvent(ctx, result));
    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Burn given utxos
   *
   * @param {Context} ctx the transaction context
   * @param {Object} utxoOwnersAndKeys dict of utxo {owner: [keys]} of utxos to be burned
   * @returns {Object} burned utxo(s)
   */
  async Burn(ctx, utxoOwnersAndKeys) {
    // assert burner is admin
    this._assertSignerIsAdmin(ctx);

    utxoOwnersAndKeys =
      typeof utxoOwnersAndKeys === "string"
        ? JSON.parse(utxoOwnersAndKeys)
        : utxoOwnersAndKeys;
    const utxoOwnersAndKeysEntries = Object.entries(utxoOwnersAndKeys);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const utxoInputs = {};

    const processUtxoInput = async (utxoInputKey, utxoOwner) => {
      if (utxoInputs[utxoInputKey] !== undefined) {
        throw new Error("the same utxo input cannot be burned twice");
      }
      const utxo = await this._retrieveAssetByKey(ctx, utxoInputKey);
      this._assertIsOwner(utxo, utxoOwner);
      this._assertAssetSpendable(utxo, txTime);
      utxoInputs[utxoInputKey] = utxo;
    };

    await Promise.all(
      utxoOwnersAndKeysEntries.flatMap(([utxoOwner, utxoInputKeys]) =>
        utxoInputKeys.map((utxoInputKey) =>
          processUtxoInput(utxoInputKey, utxoOwner)
        )
      )
    );

    const txID = ctx.stub.getTxID();
    const burntInputs = this._burn(ctx, Object.values(utxoInputs));

    ctx.stub.setEvent(
      "BurnEvent",
      await utils.wrapEvent(ctx, { inputs: Object.values(utxoInputs) })
    );

    return JSON.stringify({ result: { burntInputs }, txid: txID });
  }

  /**
   * Spend tokens to provider
   *
   * @param {Context} ctx the transaction context
   * @param {Integer} amount amount of tokens to spend
   * @returns {Object} object with list of removed input UTXOs and (optionally) created one for change
   */
  async Spend(ctx, amount) {
    const clientId = this._getClientID(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const prep = await this._prepareInputs(ctx, clientId, amount, txTime);
    const utxoOutputs = [];
    // now check if any input needs to be split and proceed if required
    const changeAmount = prep.totalAmount - amount;
    if (changeAmount !== 0 && prep.utxoToSplit === null) {
      throw new Error(
        `sth went wrong and utxoToSplit is not detected while there is inputOutput diff of ${changeAmount}`
      );
    }
    if (changeAmount !== 0) {
      prep.spentUtxos.push(prep.utxoToSplit);
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          clientId,
          changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
    }
    const result = await this._transfer(ctx, prep.spentUtxos, utxoOutputs);

    ctx.stub.setEvent(
      "SpendEvent",
      await utils.wrapEvent(ctx, {
        inputs: prep.spentUtxos,
        outputs: utxoOutputs,
      })
    );

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Send tokens to different user
   *
   * @param {Context} ctx the transaction context
   * @param {Integer} amount amount of tokens to send
   * @param {String} recipientId recipient userUuid
   * @returns {Object} object with list of removed input UTXOs and list of created UTXOs
   */
  async Send(ctx, amount, recipientId) {
    const clientId = this._getClientID(ctx);
    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const prep = await this._prepareInputs(ctx, clientId, amount, txTime);
    const utxosGrouped = _.groupBy(
      prep.spentUtxos,
      (spentUtxo) =>
        `"${spentUtxo.expirationDate}+${spentUtxo.enforcementDate}"`
    );

    const utxoOutputs = Object.values(utxosGrouped).map(
      (groupedUtxo, index) => {
        const utxoOutputAmount = groupedUtxo.reduce(
          (totalAmount, singleUtxo) =>
            totalAmount + parseInt(singleUtxo.amount, 10),
          0
        );
        return new assets.ExpiringBanknote(
          `${txID}.${index}`,
          recipientId,
          utxoOutputAmount,
          groupedUtxo[0].enforcementDate,
          groupedUtxo[0].expirationDate,
          groupedUtxo[0].metadata || {},
          groupedUtxo[0].state || assets.types.AssetState.LIQUID
        );
      }
    );

    // now check if any input needs to be split and proceed if required
    const changeAmount = prep.totalAmount - amount;
    if (changeAmount !== 0 && prep.utxoToSplit === null) {
      throw new Error(
        `Something went wrong: utxoToSplit is not detected while there is an input-output difference of ${changeAmount}`
      );
    }
    if (changeAmount !== 0) {
      prep.spentUtxos.push(prep.utxoToSplit);
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          recipientId,
          prep.utxoToSplit.amount - changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          clientId,
          changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
    }
    const result = await this._transfer(ctx, prep.spentUtxos, utxoOutputs);

    ctx.stub.setEvent(
      "SendEvent",
      await utils.wrapEvent(ctx, {
        inputs: prep.spentUtxos,
        outputs: utxoOutputs,
      })
    );

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * AdminSpend tokens to provider on behalf of user
   *
   * @param {Context} ctx the transaction context
   * @param {String} senderId sender userUuid
   * @param {Integer} amount amount of tokens to spend
   * @returns {Object} object with list of removed input UTXOs and (optionally) created one for change
   */
  async AdminSpend(ctx, senderId, amount) {
    this._assertSignerIsAdmin(ctx);

    const txTime = utils.getTxTimestampSeconds(ctx);
    const txID = ctx.stub.getTxID();

    const prep = await this._prepareInputs(ctx, senderId, amount, txTime);
    const utxoOutputs = [];
    // now check if any input needs to be split and proceed if required
    const changeAmount = prep.totalAmount - amount;
    if (changeAmount !== 0 && prep.utxoToSplit === null) {
      throw new Error(
        `sth went wrong and utxoToSplit is not detected while there is inputOutput diff of ${changeAmount}`
      );
    }
    if (changeAmount !== 0) {
      prep.spentUtxos.push(prep.utxoToSplit);
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          senderId,
          changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
    }
    const result = await this._transfer(ctx, prep.spentUtxos, utxoOutputs);

    ctx.stub.setEvent(
      "SpendEvent",
      await utils.wrapEvent(ctx, {
        inputs: prep.spentUtxos,
        outputs: utxoOutputs,
      })
    );

    return JSON.stringify({ result, txid: txID });
  }

  /**
   * AdminSend tokens on behalf of user to different user
   *
   * @param {Context} ctx the transaction context
   * @param {String} senderId sender userUuid
   * @param {Integer} amount amount of tokens to send
   * @param {String} recipientId recipient userUuid
   * @returns {Object} object with list of removed input UTXOs and list of created UTXOs
   */
  async AdminSend(ctx, senderId, amount, recipientId) {
    this._assertSignerIsAdmin(ctx);

    const txTime = utils.getTxTimestampSeconds(ctx);
    const prep = await this._prepareInputs(ctx, senderId, amount, txTime);

    const utxosGrouped = _.groupBy(
      prep.spentUtxos,
      (spentUtxo) =>
        `"${spentUtxo.expirationDate}+${spentUtxo.enforcementDate}"`
    );
    const utxoOutputs = [];
    const txID = ctx.stub.getTxID();
    let index = 0;
    Object.values(utxosGrouped).forEach((groupedUtxo) => {
      const utxoOutputAmount = groupedUtxo.reduce(
        (total, singleUtxo) => total + parseInt(singleUtxo.amount, 10),
        0
      );
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${index}`,
          recipientId,
          utxoOutputAmount,
          groupedUtxo[0].enforcementDate,
          groupedUtxo[0].expirationDate,
          groupedUtxo[0].metadata || {},
          groupedUtxo[0].state || assets.types.AssetState.LIQUID
        )
      );
      index += 1;
    });

    // now check if any input needs to be split and proceed if required
    const changeAmount = prep.totalAmount - amount;
    if (changeAmount !== 0 && prep.utxoToSplit === null) {
      throw new Error(
        `sth went wrong and utxoToSplit is not detected while there is inputOutput diff of ${changeAmount}`
      );
    }
    if (changeAmount !== 0) {
      prep.spentUtxos.push(prep.utxoToSplit);
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          recipientId,
          prep.utxoToSplit.amount - changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
      utxoOutputs.push(
        new assets.ExpiringBanknote(
          `${txID}.${utxoOutputs.length}`,
          senderId,
          changeAmount,
          prep.utxoToSplit.enforcementDate,
          prep.utxoToSplit.expirationDate,
          prep.utxoToSplit.metadata || {},
          prep.utxoToSplit.state || assets.types.AssetState.LIQUID
        )
      );
    }
    const result = await this._transfer(ctx, prep.spentUtxos, utxoOutputs);

    ctx.stub.setEvent(
      "SendEvent",
      await utils.wrapEvent(ctx, {
        inputs: prep.spentUtxos,
        outputs: utxoOutputs,
      })
    );
    return JSON.stringify({ result, txid: txID });
  }

  /**
   * Execute atomic transfer without any validation
   *
   * @param {Context} ctx the transaction context
   * @param {Array.<assets.ExpiringBanknote>} utxoInputs list of inputs to dismiss
   * @param {Array.<assets.ExpiringBanknote>} utxoOutputs list of outputs to create
   * @returns {Object} object with list of removed input UTXOs and list of created UTXOs
   */
  async _transfer(ctx, utxoInputs, utxoOutputs) {
    // delete utxo inputs from owner's state
    const burnedInputs = await this._burn(ctx, utxoInputs);
    console.log("UTXO burned");
    console.log(JSON.stringify(burnedInputs, null, 2));
    // Create utxo outputs using a composite key based on the owner and utxo key
    const mintedOutputs = await this._mint(ctx, utxoOutputs);
    console.log("UTXO minted");
    console.log(JSON.stringify(mintedOutputs, null, 2));

    return { inputs: burnedInputs, outputs: mintedOutputs };
  }
}

module.exports.contract = ExpiringUtxoContract;
