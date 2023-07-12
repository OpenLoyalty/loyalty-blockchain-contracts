# ExpiringUtxoContract

Welcome to the `ExpiringUtxoContract` documentation. This contract is a part of the 
[Loyalty Blockchain](https://github.com/OpenLoyalty/loyalty-blockchain) project, 
managing transactions using the unspent transaction output (UTXO) model.

## Functionalities

- **Mint:** Creates a new UTXO for a specific user with given parameters like amount, enforcement date, 
and expiration date.
- **Burn:** Destroys specific UTXOs owned by users.
- **Spend:** Allows users to spend tokens to a provider.
- **Send:** Enables users to send tokens to another user.
- **AdminSpend on Behalf of user:** Provides functionality for spending tokens on behalf of a user.
- **AdminSend on Behalf of user:** Allows for the sending of tokens on behalf of a user to another user.
