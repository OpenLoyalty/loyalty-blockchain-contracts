const { Context } = require("fabric-contract-api");
const { ChaincodeStub, ClientIdentity } = require("fabric-shim");
const Long = require("long");

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const sinon = require("sinon");
const stringify = require("json-stringify-deterministic");

const { expect } = chai;
const _ = require("lodash");
const { assets } = require("loyalty-blockchain-common");
const { MockStateQueryIterator } = require("./MockStateQueryIterator");
const { MockKeyValue } = require("./MockKeyValue");
const { expiringBanknoteContract } = require("..");

chai.should();
chai.use(chaiAsPromised);

function createUtxo(
  utxoKey,
  utxoOwner,
  amount,
  enforcementDate,
  expirationDate,
  metadata = {},
  state = assets.types.AssetState.LIQUID
) {
  const utxo = {
    amount,
    enforcementDate,
    expirationDate,
    owner: utxoOwner,
    metadata,
    state,
  };
  const utxoRich = new assets.ExpiringBanknote(
    utxoKey,
    utxo.owner,
    utxo.amount,
    utxo.enforcementDate,
    utxo.expirationDate,
    utxo.metadata,
    utxo.state
  );
  return utxoRich;
}

// eslint-disable-next-line no-unused-vars
function createRandomUtxo(utxoKey, utxoOwner) {
  return createUtxo(
    utxoKey,
    utxoOwner,
    _.random(50, 500),
    _.random(
      Math.floor(Date.now() / 1000) - 60 * 60,
      Math.floor(Date.now() / 1000)
    ),
    _.random(
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000) + 60 * 60
    )
  );
}

describe("Chaincode", () => {
  let sandbox;
  let token;
  let ctx;
  let mockStub;
  let mockClientIdentity;
  const enforcementDate = 100000;
  const expirationDate = 100000000000000;

  beforeEach("Sandbox creation", () => {
    sandbox = sinon.createSandbox();
    token = new expiringBanknoteContract("expiring-utxo-contract");

    ctx = sinon.createStubInstance(Context);
    mockStub = sinon.createStubInstance(ChaincodeStub);
    ctx.stub = mockStub;
    mockClientIdentity = sinon.createStubInstance(ClientIdentity);
    ctx.clientIdentity = mockClientIdentity;

    mockStub.putState.resolves("some state");
    mockStub.setEvent.returns("set event");
    mockStub.getTxID.returns("TxId0");
  });

  afterEach("Sandbox restoration", () => {
    sandbox.restore();
  });

  describe("#Transfer", () => {
    it("should fail when we try to spend input that is not ours", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = {
        amount: "1000",
        enforcementDate: 1234567,
        expirationDate: 1235555,
        owner: "Alice",
      };
      const utxoOutput1 = new assets.ExpiringBanknote(
        "",
        "Bob",
        100,
        1234567,
        1235555
      );
      const utxoOutput2 = new assets.ExpiringBanknote(
        "",
        "Charlie",
        900,
        1234567,
        1235555
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["bob_key1"])
        .returns("utxo_bob_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1)));

      await expect(
        token.Transfer(ctx, ["bob_key1"], [utxoOutput1, utxoOutput2])
      ).to.be.rejectedWith(Error, "utxoInput bob_key1 not found");
    });
    it("should fail when we try to spend the same input twice", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = {
        amount: "1000",
        enforcementDate: 1234567,
        expirationDate: 1235555,
        owner: "Alice",
      };
      const utxoOutput1 = new assets.ExpiringBanknote(
        "",
        "Bob",
        100,
        1234567,
        1235555
      );
      const utxoOutput2 = new assets.ExpiringBanknote(
        "",
        "Charlie",
        900,
        1234567,
        1235555
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1)));

      await expect(
        token.Transfer(
          ctx,
          ["alice_key1", "alice_key1"],
          [utxoOutput1, utxoOutput2]
        )
      ).to.be.rejectedWith(Error, "the same utxo input can not be spend twice");
    });

    it("should fail when any input is not yet enforced", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = {
        amount: "1000",
        enforcementDate: 1234567,
        expirationDate: 1235555,
        owner: "Alice",
      };
      const utxoOutput1 = new assets.ExpiringBanknote(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = new assets.ExpiringBanknote(
        "",
        "Charlie",
        900,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1)));

      await expect(
        token.Transfer(ctx, ["alice_key1"], [utxoOutput1, utxoOutput2])
      );
    });

    it("should fail when any input is expired", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1236666);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = createUtxo("", "Alice", 1000, 1234567, 1235555);
      const utxoOutput1 = createUtxo(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = createUtxo(
        "",
        "Charlie",
        900,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1.chainRepr())));

      await expect(
        token.Transfer(ctx, ["alice_key1"], [utxoOutput1, utxoOutput2])
      ).to.be.rejectedWith(
        Error,
        "asset alice_key1 has expired (expiration timestamp: 1235555 txTimestamp: 1236666)"
      );
    });

    it("should fail when input amount dont match output amount", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = createUtxo("", "Alice", 1000, 1234567, 1235555);
      const utxoOutput1 = createUtxo(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = createUtxo(
        "",
        "Charlie",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1.chainRepr())));

      await expect(
        token.Transfer(ctx, ["alice_key1"], [utxoOutput1, utxoOutput2])
      ).to.be.rejectedWith(
        Error,
        "total utxoInput amount 1000 does not equal total utxoOutput amount 200"
      );
    });

    it("should fail when the input enforcement dont match outputs enforcement", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = createUtxo("", "Alice", 1000, 1234567, 1235555);
      const utxoOutput1 = createUtxo(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = createUtxo(
        "",
        "Charlie",
        900,
        1234566,
        utxoInput1.expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1.chainRepr())));

      await expect(
        token.Transfer(ctx, ["alice_key1"], [utxoOutput1, utxoOutput2])
      ).to.be.rejectedWith(
        Error,
        "enforcement timestamps don't match between inputs and outputs"
      );
    });

    it("should fail when the input expiration dont match outputs expiration", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = createUtxo("", "Alice", 1000, 1234567, 1235555);
      const utxoOutput1 = createUtxo(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = createUtxo(
        "",
        "Charlie",
        900,
        utxoInput1.enforcementDate,
        1235556
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1.chainRepr())));

      await expect(
        token.Transfer(
          ctx,
          ["alice_key1"],
          JSON.stringify([utxoOutput1, utxoOutput2])
        )
      ).to.be.rejectedWith(
        Error,
        "expiration timestamps don't match between inputs and outputs"
      );
    });

    it("should transfer and create new utxos", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxoInput1 = createUtxo(
        "alice_key1",
        "Alice",
        1000,
        1234567,
        1235555
      );
      const utxoOutput1 = createUtxo(
        "",
        "Bob",
        100,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );
      const utxoOutput2 = createUtxo(
        "",
        "Charlie",
        900,
        utxoInput1.enforcementDate,
        utxoInput1.expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["alice_key1"])
        .returns("utxo_alice_1");
      mockStub.getState
        .withArgs("utxo_alice_1")
        .resolves(Buffer.from(stringify(utxoInput1.chainRepr())));

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["TxId0.0"])
        .returns("utxo_bob_1");

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["TxId0.1"])
        .returns("utxo_charlie_1");

      const response = await token.Transfer(
        ctx,
        ["alice_key1"],
        [utxoOutput1, utxoOutput2]
      );

      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "utxo_bob_1",
        Buffer.from(stringify(utxoOutput1.chainRepr()))
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(1),
        "utxo_charlie_1",
        Buffer.from(stringify(utxoOutput2.chainRepr()))
      );
      sinon.assert.calledWith(mockStub.deleteState.getCall(0), "utxo_alice_1");

      expect(response).to.equals(
        JSON.stringify({
          result: {
            inputs: [utxoInput1],
            outputs: [utxoOutput1, utxoOutput2],
          },
          txid: mockStub.getTxID(),
        })
      );
    });
  });

  describe("#Send", () => {
    it("should detect most suitable inputs and transfer tokens to other user", async () => {
      const sender = "Alice";
      const receiver = "Bob";
      const txId = mockStub.getTxID();
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      mockClientIdentity.getID.returns(sender);
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxos = {};
      for (let i = 0; i < 3; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createUtxo(
          key,
          "Alice",
          100 * i + 200,
          enforcementDate,
          expirationDate + i
        );
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
        mockStub.createCompositeKey
          .withArgs(assets.types.AssetType.UTXO.toString(), [utxos[key].key])
          .returns(key);
      }

      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, JSON.stringify(utxos[k].chainRepr()))
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      const utxoOutput0 = createUtxo(
        `${txId}.0`,
        receiver,
        200,
        enforcementDate,
        expirationDate
      );
      const utxoOutput1 = createUtxo(
        `${txId}.1`,
        receiver,
        300,
        enforcementDate,
        expirationDate + 1
      );
      const utxoOutput2 = createUtxo(
        `${txId}.2`,
        receiver,
        100,
        enforcementDate,
        expirationDate + 2
      );
      const utxoChange = createUtxo(
        `${txId}.3`,
        "Alice",
        300,
        enforcementDate,
        expirationDate + 2
      );
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoOutput0.key])
        .returns("utxo_bob_0");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoOutput1.key])
        .returns("utxo_bob_1");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoOutput2.key])
        .returns("utxo_bob_2");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoChange.key])
        .returns("utxo_alice_change");

      const response = await token.Send(ctx, 600, "Bob");
      for (let i = 0; i < 3; i++) {
        const key = `Alice_input_${i}`;
        sinon.assert.calledWith(mockStub.deleteState.getCall(i), key);
      }
      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "utxo_bob_0",
        Buffer.from(stringify(utxoOutput0.chainRepr()))
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(1),
        "utxo_bob_1",
        Buffer.from(stringify(utxoOutput1.chainRepr()))
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(2),
        "utxo_bob_2",
        Buffer.from(stringify(utxoOutput2.chainRepr()))
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(3),
        "utxo_alice_change",
        Buffer.from(stringify(utxoChange.chainRepr()))
      );

      expect(response).to.equals(
        JSON.stringify({
          result: {
            inputs: Object.values(utxos).map((k) => k),
            outputs: [utxoOutput0, utxoOutput1, utxoOutput2, utxoChange],
          },
          txid: txId,
        })
      );
    });
    it("FOR NOW ITS FAILING!! should shrink multiple inputs into single output when possible", async () => {
      // This one fails, but lets keep it as it should pass.
      // Thing is we create utxo Bob_90, Bob_5 and Alice_5 (change).
      // This is because implementation arbitrarily splits last input while it could check if split part
      // also matches previously created utxo and could be added there (in terms of expiration/enforcement dates)

      const sender = "Alice";
      const receiver = "Bob";
      const txId = mockStub.getTxID();
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      mockClientIdentity.getID.returns(sender);
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      const utxos = {};
      for (let i = 0; i < 10; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createUtxo(
          key,
          "Alice",
          10,
          enforcementDate,
          expirationDate
        );
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
        mockStub.createCompositeKey
          .withArgs(assets.types.AssetType.UTXO.toString(), [utxos[key].key])
          .returns(key);
      }

      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, JSON.stringify(utxos[k].chainRepr()))
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      const utxoOutput0 = new assets.ExpiringBanknote(
        `${txId}.0`,
        receiver,
        95,
        enforcementDate,
        expirationDate
      );
      const utxoOutputChange = new assets.ExpiringBanknote(
        `${txId}.1`,
        "Alice",
        5,
        enforcementDate,
        expirationDate
      );
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoOutput0.key])
        .returns("utxo_bob_0");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [
          utxoOutputChange.key,
        ])
        .returns("utxo_alice_change");

      const response = await token.Send(ctx, 95, "Bob");

      for (let i = 0; i < 10; i++) {
        const key = `Alice_input_${i}`;
        sinon.assert.calledWith(mockStub.deleteState.getCall(i), key);
      }
      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "utxo_bob_0",
        Buffer.from(stringify(utxoOutput0.chainRepr()))
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(1),
        "utxo_alice_change",
        Buffer.from(stringify(utxoOutputChange.chainRepr()))
      );

      expect(response).to.equals(
        JSON.stringify({
          result: {
            inputs: Object.values(utxos).map((k) => k),
            outputs: [utxoOutput0, utxoOutputChange],
          },
          txid: txId,
        })
      );
    });
    it("should shrink multiple inputs into single output when possible", async () => {
      const sender = "Alice";
      const receiver = "Bob";
      const txId = mockStub.getTxID();
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      mockClientIdentity.getID.returns(sender);
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      const utxos = {};
      for (let i = 0; i < 10; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createUtxo(
          key,
          "Alice",
          10,
          enforcementDate,
          expirationDate
        );
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
        mockStub.createCompositeKey
          .withArgs(assets.types.AssetType.UTXO.toString(), [utxos[key].key])
          .returns(key);
      }

      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, JSON.stringify(utxos[k].chainRepr()))
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      const utxoOutput0 = new assets.ExpiringBanknote(
        `${txId}.0`,
        receiver,
        90,
        enforcementDate,
        expirationDate
      );

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoOutput0.key])
        .returns("utxo_bob_0");

      const response = await token.Send(ctx, 90, "Bob");

      for (let i = 0; i < 9; i++) {
        const key = `Alice_input_${i}`;
        sinon.assert.calledWith(mockStub.deleteState.getCall(i), key);
      }
      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "utxo_bob_0",
        Buffer.from(stringify(utxoOutput0.chainRepr()))
      );

      expect(response).to.equals(
        JSON.stringify({
          result: {
            inputs: Object.values(_.omit(utxos, ["Alice_input_9"])).map(
              (k) => k
            ),
            outputs: [utxoOutput0],
          },
          txid: txId,
        })
      );
    });
  });

  describe("#Spend", () => {
    it("should detect most suitable inputs and burn them, with optional new utxo for change", async () => {
      const txId = mockStub.getTxID();
      const sender = "Alice";
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      mockClientIdentity.getID.returns(sender);
      const epoch = new Long.fromInt(1234577);
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));

      const utxos = {};
      for (let i = 0; i < 3; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createUtxo(
          key,
          "Alice",
          100 * i + 200,
          enforcementDate,
          expirationDate + i
        );
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
        mockStub.createCompositeKey
          .withArgs(assets.types.AssetType.UTXO.toString(), [utxos[key].key])
          .returns(key);
      }

      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, JSON.stringify(utxos[k].chainRepr()))
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      const utxoChange = new assets.ExpiringBanknote(
        `${txId}.0`,
        "Alice",
        300,
        enforcementDate,
        expirationDate + 2
      );
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [utxoChange.key])
        .returns("utxo_alice_change");

      const response = await token.Spend(ctx, 600);
      for (let i = 0; i < 3; i++) {
        const key = `Alice_input_${i}`;
        sinon.assert.calledWith(mockStub.deleteState.getCall(i), key);
      }
      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "utxo_alice_change",
        Buffer.from(stringify(utxoChange.chainRepr()))
      );

      expect(response).to.equals(
        JSON.stringify({
          result: {
            inputs: Object.values(utxos).map((k) => k),
            outputs: [utxoChange],
          },
          txid: txId,
        })
      );
    });
  });

  describe("#Mint", () => {
    it("should add token as a new utxo", async () => {
      const txId = mockStub.getTxID();
      const epoch = new Long(Math.floor(Date.now() / 1000));
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      mockClientIdentity.getMSPID.returns("Org1MSP");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("admin");
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), [`${txId}.0`])
        .returns("Alice_utxo0");

      const utxo = createRandomUtxo(`${txId}.0`, "Alice");

      const response = await token.Mint(
        ctx,
        "Alice",
        utxo.amount,
        utxo.enforcementDate,
        utxo.expirationDate
      );
      sinon.assert.calledWith(
        mockStub.putState.getCall(0),
        "Alice_utxo0",
        Buffer.from(stringify(utxo.chainRepr()))
      );
      expect(response).to.equals(JSON.stringify({ result: utxo, txid: txId }));
    });
  });

  describe("#Burn", () => {
    it("should fail when input does not exist", async () => {
      mockClientIdentity.getMSPID.returns("Org1MSP");
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("admin");
      const epoch = new Long(Math.floor(Date.now() / 1000));
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["Alice_123"])
        .returns("Alice_utxo123");

      mockStub.getState.withArgs("Alice_utxo123").resolves(null);

      await expect(
        token.Burn(ctx, { Alice: ["Alice_123"] })
      ).to.be.rejectedWith(Error, "utxoInput Alice_123 not found");
      await expect(
        token.Burn(ctx, { Bob: ["Alice_utxo0"] })
      ).to.be.rejectedWith(Error, "Alice_utxo0 not found");
    });

    it("should work", async () => {
      mockClientIdentity.getMSPID.returns("Org1MSP");
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("admin");
      const epoch = new Long(Math.floor(Date.now() / 1000));
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      const utxo = createRandomUtxo("somekey", "Alice");

      mockStub.createCompositeKey
        .withArgs(assets.types.AssetType.UTXO.toString(), ["somekey"])
        .returns("Alice_utxo0");
      mockStub.getState
        .withArgs("Alice_utxo0")
        .resolves(JSON.stringify(utxo.chainRepr()));

      const response = await token.Burn(ctx, { Alice: ["somekey"] });
      sinon.assert.calledWith(mockStub.deleteState.getCall(0), "Alice_utxo0");
      expect(response).to.equals(
        JSON.stringify({
          result: { burntInputs: Object.values([utxo]) },
          txid: mockStub.getTxID(),
        })
      );
    });
  });

  describe("#ClientUTXOs", () => {
    it("add one utxo, get one utxo", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long(Math.floor(Date.now() / 1000));
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      const utxo0Name = "Alice_utxo0";
      const utxo1Name = "Alice_utxo1";
      // Add utxo
      const utxo0 = {
        amount: 1000,
        enforcementDate: 1234567,
        expirationDate: 1235555,
      };
      const utxo1 = JSON.parse(JSON.stringify(utxo0));
      utxo1.amount = 500;
      const utxo0Rich = new assets.ExpiringBanknote(
        utxo0Name,
        "Alice",
        utxo0.amount,
        utxo0.enforcementDate,
        utxo0.expirationDate
      );
      const utxo1Rich = JSON.parse(JSON.stringify(utxo0Rich));
      utxo1Rich.key = utxo1Name;
      utxo1Rich.amount = 500;

      const utxos = {};
      for (let i = 0; i < 3; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createUtxo(
          key,
          "Alice",
          100 * i + 200,
          enforcementDate,
          expirationDate + i
        );
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
        mockStub.createCompositeKey
          .withArgs(assets.types.AssetType.UTXO.toString(), [utxos[key].key])
          .returns(key);
      }

      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, utxos[k])
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      // query utxo
      // const response = await token.ClientUTXOs(ctx);
      // expect(response).to.equals(JSON.stringify(Object.values(utxos).map((k) => k)));
    });
  });

  describe("#GetBalance", () => {
    it("get user balance", async () => {
      mockClientIdentity.getAttributeValue
        .withArgs("userUuid")
        .returns("Alice");
      mockClientIdentity.getAttributeValue.withArgs("role").returns("user");
      const epoch = new Long(Math.floor(Date.now() / 1000));
      mockStub.getDateTimestamp.returns(new Date(epoch * 1000));
      // Add inputs
      const utxos = {};
      for (let i = 0; i < 10; i++) {
        const key = `Alice_input_${i}`;
        utxos[key] = createRandomUtxo(key, "Alice");
        mockStub.splitCompositeKey.withArgs(key).resolves({
          objectType: assets.types.AssetType.UTXO.toString(),
          attributes: [key],
        });
      }
      const items = Object.keys(utxos).map(
        (k) => new MockKeyValue(k, JSON.stringify(utxos[k].chainRepr()))
      );
      mockStub.getQueryResult.resolves(new MockStateQueryIterator(items));

      // query utxo
      const response = await token.GetBalance(ctx, 0);
      console.log(`user balance: ${JSON.parse(response).balance}`);
      expect(JSON.parse(response).balance).to.equals(
        _.sumBy(
          Object.values(utxos).map((k) => k),
          "amount"
        )
      );
    });
  });

  describe("#ClientID", () => {
    it("should work", async () => {
      mockClientIdentity.getAttributeValue.returns("abc");

      const response = await token.ClientID(ctx);
      sinon.assert.calledOnce(
        mockClientIdentity.getAttributeValue.withArgs("userUuid")
      );
      expect(JSON.parse(response).clientId).to.equals("abc");
    });
  });
});
