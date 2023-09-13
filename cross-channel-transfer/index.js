/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const crossChannelNative = require('./lib/cross-channel-transfer');

module.exports.crossChannelNative = crossChannelNative.contract;
module.exports.contracts = [crossChannelNative.contract];
