const contractModule = require("./lib/voucher-contract");

module.exports.voucherContract = contractModule.contract;
module.exports.contracts = [contractModule.contract];
