'use strict';

// Variation of safe circular stringification code from
// https://github.com/trentm/node-bunyan

var safeJsonStringify;
try {
	safeJsonStringify = require('safe-json-stringify');
}
catch (e) {
	safeJsonStringify = null;
}

// A JSON stringifier that handles cycles safely - tracks seen values in a Set.
function safeCyclesSet() {
	var seen = new Set(); // eslint-disable-line no-undef
	return function(key, val) {
		if (!val || typeof val !== 'object') {
			return val;
		}
		if (seen.has(val)) {
			return '[Circular]';
		}
		seen.add(val);
		return val;
	};
}

/**
 * A JSON stringifier that handles cycles safely - tracks seen vals in an Array.
 *
 * Note: This approach has performance problems when dealing with large objects,
 * see trentm/node-bunyan#445, but since this is the only option for node 0.10
 * and earlier (as Set was introduced in Node 0.12), it's used as a fallback
 * when Set is not available.
 *
 * @private
 * @returns {function}
 */
function safeCyclesArray() {
	var seen = [];
	return function(key, val) {
		if (!val || typeof val !== 'object') {
			return val;
		}
		if (seen.indexOf(val) !== -1) {
			return '[Circular]';
		}
		seen.push(val);
		return val;
	};
}

/* istanbul ignore next: Ignoring compat condition to better track reduction in coverage %  */
/**
 * A JSON stringifier that handles cycles safely.
 *
 * Usage: JSON.stringify(obj, safeCycles())
 *
 * Choose the best safe cycle function from what is available - see
 * trentm/node-bunyan#445.
 *
 * @private
 */
var safeCycles = typeof Set !== 'undefined'
	? safeCyclesSet
	: safeCyclesArray;

/**
 * A fast JSON.stringify that handles cycles and getter exceptions (when
 * safeJsonStringify is installed).
 *
 * This function attempts to use the regular JSON.stringify for speed, but on
 * error (e.g. JSON cycle detection exception) it falls back to safe stringify
 * handlers that can deal with cycles and/or getter exceptions.
 *
 * @private
 * @param {*} rec
 * @returns {string}
 */
function fastAndSafeJsonStringify(rec) {
	try {
		return JSON.stringify(rec);
	}
	catch (ex) {
		try {
			return JSON.stringify(rec, safeCycles());
		}
		catch (e) {
			if (safeJsonStringify) {
				return safeJsonStringify(rec);
			}
			else {
				throw e;
			}
		}
	}
}

exports.safeCycles = safeCycles;
exports._safeCyclesSet = safeCyclesSet;
exports._safeCyclesArray = safeCyclesArray;
exports.fastAndSafeJsonStringify = fastAndSafeJsonStringify;
