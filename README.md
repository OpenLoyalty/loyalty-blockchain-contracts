# Loyalty Blockchain Contracts

Welcome to the Loyalty Blockchain Contracts repository. These contracts are part of the 
[Loyalty Blockchain](https://github.com/OpenLoyalty/loyalty-blockchain) project, managing 
various transaction types in a loyalty ecosystem.

## Contracts

This repository contains the following contracts:

### 1. ExpiringUtxoContract

This contract handles transactions using the UTXO model. It includes functionalities such as
minting, burning, spending, sending, and transferring tokens. Also, it allows for execution 
of atomic transfers.

### 2. GiftCardContract

GiftCardContract enables the creation, recharging, and dismissal of prepaid cards. It also 
allows for the spending and transferring of assets, with functionality for administrators 
to execute these operations on behalf of a user.

### 3. UtilityTokenContract

UtilityTokenContract allows for the creation of utility tokens, providing users with access 
to various features. The contract also facilitates the usage of utilities, the transfer of 
assets, and provides similar functionality for administrators to perform operations on 
behalf of a user.

### 4. VoucherContract

VoucherContract manages the issuance and usage of vouchers. Like the previous contracts, 
it provides minting, burning, spending, and transferring functionalities, with 
administrative privileges to perform operations on behalf of a user.

For a detailed overview of each contract, please refer to their individual README files.

## Contributions

We appreciate and welcome contributions to this project, be it in the form of feature requests, issues,
or pull requests. Please see our [contributing guidelines](./CONTRIBUTING.md) for more information.

## License

This project is licensed under the Apache 2.0 license - see the [LICENSE](./LICENSE) file for details.

