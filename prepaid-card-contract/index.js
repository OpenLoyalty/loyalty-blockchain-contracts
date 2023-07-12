const contractModule = require("./lib/prepaid-card-contract");

module.exports.prepaidCardContract = contractModule.contract;
module.exports.contracts = [contractModule.contract];
