const contractModule = require("./lib/gift-card-contract");

module.exports.prepaidCardContract = contractModule.contract;
module.exports.contracts = [contractModule.contract];
