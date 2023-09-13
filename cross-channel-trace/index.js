/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const crossChannelTrace = require('./lib/cross-channel-trace');

module.exports.crossChannelTrace = crossChannelTrace.contract;
module.exports.contracts = [crossChannelTrace.contract];
