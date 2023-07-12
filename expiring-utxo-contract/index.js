const contractModule = require("./lib/expiring-utxo-contract");

module.exports.expiringBanknoteContract = contractModule.contract;
module.exports.contracts = [contractModule.contract];
