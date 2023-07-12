# PrepaidCardContract

Welcome to the `PrepaidCardContract` documentation. This contract is another crucial part of the 
[Loyalty Blockchain](https://github.com/OpenLoyalty/loyalty-blockchain) project, 
aimed at managing prepaid card transactions.

## Functionalities

- **Mint:** Generates a new prepaid card with a specified initial balance, currency, 
activation, and expiration dates for a user.
- **Recharge:** Allows for recharging a prepaid card with a specified amount and extends its expiration 
period.
- **Burn:** Enables the dismissal of existing prepaid cards.
- **Spend:** Lets users spend tokens from the card to a provider, subsequently updating the card balance.
- **Transfer:** Facilitates the transfer of prepaid cards between users.
- **AdminSpend:** Provides functionality for an admin to spend tokens from a card on behalf of a user.
- **AdminTransfer:** Allows an admin to transfer a prepaid card on behalf of a user to another user.
- **AdminRecharge:** Gives an admin the capability to recharge a prepaid card with a specific amount and 
extend its expiration period on behalf of a user.
