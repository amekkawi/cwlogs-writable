'use strict';

var util = require('util');
var Writable = require('stream').Writable;
var AWS = require('aws-sdk');
var hasOwnProperty = Object.prototype.hasOwnProperty;
var safeStringify = require('./safe-stringify');
var ONE_DAY = 86400000;
var MAX_MESSAGE_SIZE = 262118;

module.exports = CWLogsWritable;

util.inherits(CWLogsWritable, Writable);

/**
 * Writable stream for AWS CloudWatch Logs.
 *
 * @constructor
 * @param {object} options
 * @param {string} options.logGroupName - AWS CloudWatch [LogGroup](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.
 * @param {string} options.logStreamName - AWS CloudWatch [LogStream](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.
 * @param {object} [options.cloudWatchLogsOptions={}] - Options passed to [AWS.CloudWatchLogs](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property) service.
 * @param {string|number} [options.writeInterval=nextTick] - Amount of wait time after a Writable#_write call to allow batching of log events. Must be a positive number or "nextTick". If "nextTick", `process.nextTick` is used. If a number, `setTimeout` is used.
 * @param {string|number} [options.retryableDelay=150]
 * @param {number} [options.retryableMax=100] - Maximum number of times an AWS error marked as "retryable" will be retried before the error is instead passed to {@link CWLogsWritable#onError}.
 * @param {number} [options.maxBatchCount=10000] - Maximum number of log events allowed in a single PutLogEvents API call.
 * @param {number} [options.maxBatchSize=1048576] - Maximum number of bytes allowed in a single PutLogEvents API call.
 * @param {boolean} [options.ignoreDataAlreadyAcceptedException=true] - Ignore `DataAlreadyAcceptedException` errors. This will bypass {@link CWLogsWritable#onError}. See [cwlogs-writable/issues/10](https://github.com/amekkawi/cwlogs-writable/issues/10).
 * @param {boolean} [options.retryOnInvalidSequenceToken=true] - Retry on `InvalidSequenceTokenException` errors. This will bypass {@link CWLogsWritable#onError}. See [cwlogs-writable/issues/12](https://github.com/amekkawi/cwlogs-writable/issues/12).
 * @param {function} [options.onError] - Called when an AWS error is encountered. Overwrites {@link CWLogsWritable#onError} method.
 * @param {function} [options.filterWrite] - Filter writes to CWLogsWritable. Overwrites {@link CWLogsWritable#filterWrite} method.
 * @param {boolean} [options.objectMode=true] - Passed to the Writable constructor. See https://nodejs.org/api/stream.html#stream_object_mode.
 * @augments {Writable}
 * @fires CWLogsWritable#putLogEvents
 * @fires CWLogsWritable#createLogGroup
 * @fires CWLogsWritable#createLogStream
 * @fires CWLogsWritable#stringifyError
 * @example
 * ```javascript
 * var CWLogsWritable = require('cwlogs-writable');
 * var stream = new CWLogsWritable({
 *   logGroupName: 'my-log-group',
 *   logStreamName: 'my-stream',
 *   cloudWatchLogsOptions: {
 *     region: 'us-east-1',
 *     accessKeyId: '{AWS-IAM-USER-ACCESS-KEY-ID}',
 *     secretAccessKey: '{AWS-SECRET-ACCESS-KEY}'
 *   }
 * });
 * ```
 */
function CWLogsWritable(options) {
	if (!(this instanceof CWLogsWritable)) {
		return new CWLogsWritable(options);
	}

	this.validateOptions(options);

	Writable.call(this, { objectMode: options.objectMode !== false });

	this._onErrorNextCbId = 1;
	this.sequenceToken = null;
	this.writeQueued = false;

	/**
	 * Logs queued to be sent to AWS CloudWatch Logs. Do not modify directly.
	 *
	 * @protected
	 * @member {Array.<{message:string,timestamp:number}>} CWLogsWritable#queuedLogs
	 */
	this.queuedLogs = [];

	var _logGroupName = options.logGroupName;
	/**
	 * AWS CloudWatch [LogGroup](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name.
	 * The LogGroup will be created if it doesn't exist.
	 * Changes to this property will only take affect for the next PutLogEvents API call.
	 *
	 * @member {string} CWLogsWritable#logGroupName
	 */
	Object.defineProperty(this, 'logGroupName', {
		enumerable: true,
		get: function() {
			return _logGroupName;
		},
		set: function(logGroupName) {
			if (logGroupName !== _logGroupName) {
				_logGroupName = logGroupName;
				this.sequenceToken = null;
			}
		}
	});

	var _logStreamName = options.logStreamName;
	/**
	 * AWS CloudWatch [LogStream](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name.
	 * The LogStream will be created if it doesn't exist.
	 * Changes to this property will only take affect for the next PutLogEvents API call.
	 *
	 * @member {string} CWLogsWritable#logStreamName
	 */
	Object.defineProperty(this, 'logStreamName', {
		enumerable: true,
		get: function() {
			return _logStreamName;
		},
		set: function(logStreamName) {
			if (logStreamName !== _logStreamName) {
				_logStreamName = logStreamName;
				this.sequenceToken = null;
			}
		}
	});

	/**
	 * Amount of wait time after a Writable#_write call to allow batching of
	 * log events. Must be a positive number or "nextTick".
	 * If "nextTick", `process.nextTick` is used.
	 * If a number, `setTimeout` is used.
	 *
	 * @member {string|number} CWLogsWritable#writeInterval
	 * @default nextTick
	 */
	this.writeInterval = typeof options.writeInterval === 'number'
		? options.writeInterval
		: 'nextTick';

	/**
	 * Ignore `DataAlreadyAcceptedException` errors returned by
	 * [PutLogEvents](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html) requests.
	 *
	 * This will bypass {@link CWLogsWritable#onError}.
	 *
	 * See [cwlogs-writable/issues/10](https://github.com/amekkawi/cwlogs-writable/issues/10).
	 *
	 * @member {boolean} CWLogsWritable#ignoreDataAlreadyAcceptedException
	 * @default true
	 */
	this.ignoreDataAlreadyAcceptedException = options.ignoreDataAlreadyAcceptedException !== false;

	/**
	 * Resend log events if
	 * [PutLogEvents](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
	 * requests return a `InvalidSequenceTokenException` error.
	 *
	 * This will bypass {@link CWLogsWritable#onError}.
	 *
	 * See [cwlogs-writable/issues/12](https://github.com/amekkawi/cwlogs-writable/issues/12).
	 *
	 * @member {boolean} CWLogsWritable#retryOnInvalidSequenceToken
	 * @default true
	 */
	this.retryOnInvalidSequenceToken = options.retryOnInvalidSequenceToken !== false;

	/**
	 * Maximum number of times an AWS error marked as "retryable" will be
	 * retried before the error is instead passed to {@link CWLogsWritable#onError}.
	 *
	 * @member {number} CWLogsWritable#retryableMax
	 * @default 100
	 */
	this.retryableMax = typeof options.retryableMax === 'number'
		? Math.max(0, options.retryableMax)
		: 100;

	/**
	 * @member {string|number} CWLogsWritable#retryableDelay
	 * @default 150
	 */
	this.retryableDelay = options.retryableDelay === 'nextTick' || typeof options.retryableDelay === 'number'
		? options.retryableDelay
		: 150;

	/**
	 * Maximum number of log events allowed in a single PutLogEvents API call.
	 *
	 * @member {number} CWLogsWritable#maxBatchCount
	 * @default 10000
	 */
	this.maxBatchCount = typeof options.maxBatchCount === 'number'
		? Math.min(10000, Math.max(1, options.maxBatchCount))
		: 10000;

	/**
	 * Maximum number of bytes allowed in a single PutLogEvents API call.
	 *
	 * @member {number} CWLogsWritable#maxBatchSize
	 * @default 1048576
	 */
	this.maxBatchSize = typeof options.maxBatchSize === 'number'
		? Math.min(1048576, Math.max(1024, options.maxBatchSize))
		: 1048576;

	if (options.onError) {
		this.onError = options.onError;
	}

	if (options.filterWrite) {
		this.filterWrite = options.filterWrite;
	}

	/**
	 * The AWS.CloudWatchLogs instance.
	 *
	 * @member {CloudWatchLogs} CWLogsWritable#cloudwatch
	 */
	Object.defineProperty(this, 'cloudwatch', {
		enumerable: true,
		writable: false,
		value: this.createService(options.cloudWatchLogsOptions || {})
	});
}

/**
 * Validate the options passed to {@link CWLogsWritable}.
 *
 * @protected
 * @param {object} options
 * @throws Error
 */
CWLogsWritable.prototype.validateOptions = function(options) {
	if (!options || typeof options !== 'object') {
		throw new Error('options must be an object');
	}

	if (typeof options.logGroupName !== 'string') {
		throw new Error('logGroupName option must be a string');
	}

	if (typeof options.logStreamName !== 'string') {
		throw new Error('logStreamName option must be a string');
	}

	if (hasOwnProperty.call(options, 'objectMode') && typeof options.objectMode !== 'boolean') {
		throw new Error('objectMode option must be a boolean, if specified');
	}

	if (hasOwnProperty.call(options, 'writeInterval') && !isInterval(options.writeInterval)) {
		throw new Error('writeInterval option must be a positive number or "nextTick", if specified');
	}

	if (hasOwnProperty.call(options, 'ignoreDataAlreadyAcceptedException') && typeof options.ignoreDataAlreadyAcceptedException !== 'boolean') {
		throw new Error('ignoreDataAlreadyAcceptedException option must be a boolean');
	}

	if (hasOwnProperty.call(options, 'retryOnInvalidSequenceToken') && typeof options.retryOnInvalidSequenceToken !== 'boolean') {
		throw new Error('retryOnInvalidSequenceToken option must be a boolean');
	}

	if (hasOwnProperty.call(options, 'retryableMax') && (!isFiniteNumber(options.retryableMax) || options.retryableMax < 1)) {
		throw new Error('retryableMax option must be a non-zero positive number, if specified');
	}

	if (hasOwnProperty.call(options, 'retryableDelay') && !isInterval(options.retryableDelay)) {
		throw new Error('retryableDelay option must be a positive number or "nextTick", if specified');
	}

	if (hasOwnProperty.call(options, 'maxBatchCount') && (!isFiniteNumber(options.maxBatchCount) || options.maxBatchCount < 1 || options.maxBatchCount > 10000)) {
		throw new Error('maxBatchCount option must be a positive number from 1 to 10000, if specified');
	}

	if (hasOwnProperty.call(options, 'maxBatchSize') && (!isFiniteNumber(options.maxBatchSize) || options.maxBatchSize < 256 || options.maxBatchSize > 1048576)) {
		throw new Error('maxBatchSize option must be a positive number from 256 to 1048576, if specified');
	}

	if (hasOwnProperty.call(options, 'onError') && typeof options.onError !== 'function') {
		throw new Error('onError option must be a function, if specified');
	}

	if (hasOwnProperty.call(options, 'filterWrite') && typeof options.filterWrite !== 'function') {
		throw new Error('filterWrite option must be a function, if specified');
	}
};

/**
 * Get the number of log events queued to be sent to AWS CloudWatch Logs.
 *
 * Does not include events that are actively being sent.
 *
 * @returns {number}
 */
CWLogsWritable.prototype.getQueueSize = function() {
	return this.queuedLogs.length;
};

/**
 * Remove all log events that are still queued.
 *
 * @returns {Array.<{message:string,timestamp:number}>} Log events removed from the queue.
 */
CWLogsWritable.prototype.clearQueue = function() {
	var oldQueue = this.queuedLogs;
	this.queuedLogs = [];
	return oldQueue;
};

/**
 * Create a log event object from the log record.
 *
 * @protected
 * @param {object|string} rec
 * @returns {{message: string, timestamp: number}}
 */
CWLogsWritable.prototype.createLogEvent = function(rec) {
	return {
		message: typeof rec === 'string'
			? rec
			: this.safeStringifyLogEvent(rec),

		timestamp: typeof rec === 'object' && rec.time
			? new Date(rec.time).getTime()
			: Date.now()
	};
};

/**
 * Safe stringify a log record. Use by {@link CWLogsWritable#createLogEvent}.
 *
 * @protected
 * @param {*} rec
 * @returns {string}
 */
CWLogsWritable.prototype.safeStringifyLogEvent = function(rec) {
	return safeStringify.fastAndSafeJsonStringify(rec);
};

/**
 * Called when an AWS error is encountered. Do not call directly.
 *
 * The default behavior of this method is call the `next` argument
 * with the error as the first argument.
 *
 * `logEvents` argument will be either:
 *
 * - An array of log event objects (see {@link CWLogsWritable#createLogEvent})
 *   if error is from PutLogEvents action.
 * - `null` if error is from any action besides PutLogEvents.
 *
 * The `next` argument must be called in one of the following ways:
 *
 * - **`next(err)`** — If the first argument is an instance of `Error`, an 'error'
 *   event will be emitted on the stream, {@link CWLogsWritable#clearQueue} is called,
 *   and {@link CWLogsWritable#filterWrite} is replaced so no further logging
 *   will be processed by the stream. This effectively disables the stream.
 *
 * - **`next()` or `next(logEvents)`** — The stream will recover from the error and
 *   resume sending logs to AWS CloudWatch Logs. The first argument may optionally be
 *   an array of log event objects (i.e. `logEvents` argument) that will be added to
 *   the head of the log events queue.
 *
 * @param {Error} err - AWS error
 * @param {null|Array.<{message:string,timestamp:number}>} logEvents
 * @param {function} next
 * @example
 * ```javascript
 * var CWLogsWritable = require('cwlogs-writable');
 * var stream = new CWLogsWritable({
 *   logGroupName: 'my-log-group',
 *   logStreamName: 'my-stream',
 *   onError: function(err, logEvents, next) {
 *     if (logEvents) {
 *       console.error(
 *         'CWLogsWritable PutLogEvents error',
 *         err,
 *         JSON.stringify(logEvents)
 *       );
 *
 *       // Resume without adding the log events back to the queue.
 *       next();
 *     }
 *     else {
 *       // Use built-in behavior of emitting an error,
 *       // clearing the queue, and ignoring all writes to the stream.
 *       next(err);
 *     }
 *   }
 * }).on('error', function(err) {
 *   // Always listen for 'error' events to catch non-AWS errors as well.
 *   console.error(
 *     'CWLogsWritable error',
 *     err
 *   );
 * });
 * ```
 */
CWLogsWritable.prototype.onError = function(err, logEvents, next) {
	next(err);
};

/**
 * Filter writes to CWLogsWritable.
 *
 * Default behavior is to return true if `rec` is not null or undefined.
 *
 * @param {string|object} rec - Raw log record passed to Writable#write.
 * @returns {boolean} true to include, and false to exclude.
 */
CWLogsWritable.prototype.filterWrite = function(rec) {
	return rec != null;
};

/**
 * Create the AWS.CloudWatchLogs service.
 *
 * @protected
 * @param {object} opts - Passed as first argument to AWS.CloudWatchLogs.
 * @returns {CloudWatchLogs}
 */
CWLogsWritable.prototype.createService = function(opts) {
	return new AWS.CloudWatchLogs(opts);
};

/**
 * Get the next batch of log events to send,
 * based on the the constraints of PutLogEvents.
 *
 * @protected
 * @see http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
 * @returns {Array.<{message: string, timestamp: number}>}
 */
CWLogsWritable.prototype.dequeueNextLogBatch = function() {
	if (!this.queuedLogs.length) {
		return [];
	}

	var batchCount = 1;
	var sizeEstimate = 0;
	var earliestTimestamp = this.queuedLogs[0].timestamp;
	var lastTimestamp = earliestTimestamp;
	var needsSorting = false;
	var dropIndexes = [];

	// Rules for PutLogEvents:
	// (DONE) Log event message cannot be more than 262,118 bytes (256 * 1024 - 26)
	// (DONE) The maximum batch size is 1,048,576 bytes, and this size is calculated as the sum of all event messages in UTF-8, plus 26 bytes for each log event.
	// (SKIP) None of the log events in the batch can be more than 2 hours in the future.
	// (SKIP) None of the log events in the batch can be older than 14 days or the retention period of the log group.
	// (DONE) The log events in the batch must be in chronological ordered by their timestamp (the time the event occurred, expressed as the number of milliseconds since Jan 1, 1970 00:00:00 UTC).
	// (DONE) The maximum number of log events in a batch is 10,000.
	// (DONE) A batch of log events in a single request cannot span more than 24 hours. Otherwise, the operation fails.

	for (var i = 0, l = this.queuedLogs.length; i < l; i++) {
		var dropLogEvent = false;
		var logEvent = this.queuedLogs[i];

		// Cut off if the logs would no longer fit within 24 hours.
		if (logEvent.timestamp > earliestTimestamp + ONE_DAY) {
			break;
		}

		var messageSize = this.getMessageSize(logEvent.message);

		// Handle messages beyond the limit allowed by PutLogEvents.
		if (messageSize > MAX_MESSAGE_SIZE) {
			var reducedMessage = this.reduceOversizedMessage(logEvent.message);

			// Drop the log event if the message could not be reduced.
			if (typeof reducedMessage !== 'string') {
				dropLogEvent = true;
				this._emitOversizeLogEvent(logEvent.message);
			}
			else {
				messageSize = this.getMessageSize(reducedMessage);

				// Drop the log event if the message is still over the limit.
				if (messageSize > MAX_MESSAGE_SIZE) {
					dropLogEvent = true;
					this._emitOversizeLogEvent(logEvent.message);
				}

				// Otherwise, use the now reduced message.
				else {
					logEvent.message = reducedMessage;
				}
			}
		}

		if (dropLogEvent) {
			dropIndexes.push(i);
		}
		else {
			if (lastTimestamp > logEvent.timestamp) {
				needsSorting = true;
			}

			lastTimestamp = logEvent.timestamp;
			sizeEstimate += 26 + messageSize;

			// Cut off at the max bytes limit.
			if (sizeEstimate > this.maxBatchSize || batchCount - dropIndexes.length >= this.maxBatchCount) {
				break;
			}
		}

		batchCount = i + 1;
	}

	var batch;

	// Put all queued items since they fit.
	if (batchCount === this.queuedLogs.length) {
		batch = this.queuedLogs;
		this.queuedLogs = [];
	}

	// Queue just the items that fit within a PutLogEvents call.
	else {
		batch = this.queuedLogs.splice(0, batchCount);
	}

	// Remove any entries that are being dropped.
	if (dropIndexes.length) {
		for (var si = dropIndexes.length - 1; si >= 0; si--) {
			batch.splice(dropIndexes[si], 1);
		}
	}

	if (needsSorting) {
		batch.sort(logEventComparator);
	}

	return batch;
};

/**
 * Get the size of the message in bytes.
 *
 * By default this is calculated as the string character length × 4
 * (UTF-8 characters can have up to 4 bytes), which is cheaper
 * than determining the exact byte length.
 *
 * You may override this method to provide your own implementation
 * to correctly measure the number of bytes in the string
 * (i.e. using [Buffer.byteLength()](https://nodejs.org/api/buffer.html#buffer_class_method_buffer_bytelength_string_encoding)).
 *
 * @protected
 * @param {string} message - The "message" prop of a LogEvent.
 * @returns {number} The size of the message in bytes.
 */
CWLogsWritable.prototype.getMessageSize = function(message) {
	// Estimate size assuming each character is 4 bytes.
	var size = message.length * 4;

	// Calculate exact bytes if estimate is over message limit.
	if (size > MAX_MESSAGE_SIZE) {
		size = Buffer.byteLength(message, 'utf8');
	}

	return size;
};

/**
 * Attempt to reduce the specified message so it fits within the
 * 262118 byte limit enforced by PutLogEvents.
 *
 * Only called for messages that are over the byte limit.
 *
 * Use [Buffer.byteLength()](https://nodejs.org/api/buffer.html#buffer_class_method_buffer_bytelength_string_encoding)
 * to accurately measure the message size before returning it.
 *
 * If the string returned is still over the byte limit, this method
 * will _not_ be called again for the log event.
 *
 * @see {CWLogsWritable#event:oversizeLogEvent}
 * @param {string} logEventMessage - Stringified log event.
 * @returns {*|string} - The reduced string, or a non-string (i.e. undefined or null) indicating the message cannot be reduced.
 */
CWLogsWritable.prototype.reduceOversizedMessage = function(logEventMessage) { // eslint-disable-line no-unused-vars
	return null;
};

/**
 * Schedule a call of CWLogsWritable#_sendQueuedLogs to run.
 *
 * @private
 */
CWLogsWritable.prototype._scheduleSendLogs = function() {
	if (this.writeInterval === 'nextTick') {
		process.nextTick(this._sendLogs.bind(this));
	}
	else {
		setTimeout(this._sendLogs.bind(this), this.writeInterval);
	}
};

/**
 * Internal method called by Writable#_write.
 *
 * @param {object|string} record - Logging record. Can be an object if objectMode options is true.
 * @param {*} _enc - Ignored
 * @param {function} cb - Always called with no arguments.
 * @private
 */
CWLogsWritable.prototype._write = function _write(record, _enc, cb) {
	// TODO: Also catch errors during filterWrite?
	if (this.filterWrite(record)) {
		// TODO: Handle records that are over (256 * 1024 - 26) bytes, the limit for a CloudWatch Log event minus 26 byte overhead

		try {
			this.queuedLogs.push(this.createLogEvent(record));
		}
		catch (err) {
			err.message = 'Error while stringifying record (install safe-json-stringify to fallback to safer stringification) -- ' + err.message;
			this._emitStringifyError(err, record);
		}

		if (!this.writeQueued) {
			this.writeQueued = true;
			this._scheduleSendLogs();
		}
	}

	cb();
};

/**
 * Send the next batch of log events to AWS CloudWatch Logs.
 *
 * @private
 * @returns {void}
 */
CWLogsWritable.prototype._sendLogs = function() {
	var logGroupName = this.logGroupName;
	var logStreamName = this.logStreamName;

	if (this.sequenceToken === null) {
		this._getSequenceToken(logGroupName, logStreamName, function(err, sequenceToken) {
			if (err) {
				this.onError(
					err,
					null,
					this._nextAfterError.bind(this, ++this._onErrorNextCbId)
				);
			}
			else {
				this.sequenceToken = sequenceToken;
				this._sendLogs();
			}
		}.bind(this));
		return;
	}

	if (!this.queuedLogs.length) {
		this.writeQueued = false;
		return;
	}

	var apiParams = {
		logGroupName: this.logGroupName,
		logStreamName: this.logStreamName,
		sequenceToken: this.sequenceToken,
		logEvents: this.dequeueNextLogBatch()
	};

	this._putLogEvents(apiParams, function(err, sequenceToken) {
		if (err) {
			this._onErrorNextCbId++;

			if (err.code === 'InvalidSequenceTokenException' && this.retryOnInvalidSequenceToken) {
				this._nextAfterError(this._onErrorNextCbId, apiParams.logEvents);
			}

			else if (err.code === 'DataAlreadyAcceptedException' && this.ignoreDataAlreadyAcceptedException) {
				this._nextAfterError(this._onErrorNextCbId);
			}

			else {
				this.onError(
					err,
					apiParams.logEvents,
					this._nextAfterError.bind(this, this._onErrorNextCbId)
				);
			}
		}
		else {
			this.sequenceToken = sequenceToken;
			this._emitPutLogEvents(apiParams.logEvents);

			if (this.queuedLogs.length) {
				this._scheduleSendLogs();
			}
			else {
				this.writeQueued = false;
			}
		}
	}.bind(this));
};

/**
 * Attempt to continue sending log events to AWS CloudWatch Logs after an error was previously returned.
 *
 * @param {number} _onErrorNextCbId - Internal ID used to prevent multiple calls.
 * @param {Error|Array.<{message:string,timestamp:number}>} [errOrLogEvents] - The log events that failed to send, which will be returned to the beginning of the queue.
 * @private
 */
CWLogsWritable.prototype._nextAfterError = function(_onErrorNextCbId, errOrLogEvents) {
	// Abort if not the current 'next' callback.
	if (this._onErrorNextCbId !== _onErrorNextCbId) {
		return;
	}

	// Increment to prevent calling again.
	this._onErrorNextCbId++;

	// Reset sequence token since we don't know if it's accurate anymore
	this.sequenceToken = null;

	if (errOrLogEvents instanceof Error) {
		this._handleError(errOrLogEvents);
		return;
	}

	if (errOrLogEvents) {
		// Return the log events to the beginning of the queue
		if (this.queuedLogs.length) {
			this.queuedLogs = errOrLogEvents.concat(this.queuedLogs);
		}
		else {
			this.queuedLogs = errOrLogEvents;
		}
	}

	this._scheduleSendLogs();
};

/**
 * Handle a critial error. This effectively disables the stream.
 *
 * @param {Error} err
 * @private
 */
CWLogsWritable.prototype._handleError = function(err) {
	// Only throw error if there are listeners.
	// See https://nodejs.org/docs/latest-v4.x/api/events.html#events_emitter_listenercount_eventname
	if (this.listeners('error').length) {
		this.emit('error', err);
	}

	this.clearQueue();
	this.filterWrite = CWLogsWritable._falseFilterWrite;
};

/**
 * Send a PutLogEvents action to AWS.
 *
 * @param {object} apiParams
 * @param {function} cb
 * @private
 */
CWLogsWritable.prototype._putLogEvents = function(apiParams, cb) {
	var retries = 0;
	var retryableDelay = this.retryableDelay;
	var retryableMax = this.retryableMax;
	var cloudwatch = this.cloudwatch;

	attemptPut();

	function attemptPut() {
		cloudwatch.putLogEvents(apiParams, function(err, res) {
			if (err) {
				if (err.retryable && retryableMax > retries++) {
					if (retryableDelay === 'nextTick') {
						process.nextTick(attemptPut);
					}
					else {
						setTimeout(attemptPut, retryableDelay);
					}
				}
				else {
					cb(err);
				}
			}
			else {
				cb(null, res.nextSequenceToken);
			}
		});
	}
};

/**
 * Describe the LogStream in AWS CloudWatch Logs to get the next sequence token.
 *
 * @param {string} logGroupName
 * @param {string} logStreamName
 * @param {function} cb
 * @private
 */
CWLogsWritable.prototype._getSequenceToken = function(logGroupName, logStreamName, cb) {
	this.cloudwatch.describeLogStreams({
		logGroupName: logGroupName,
		logStreamNamePrefix: logStreamName
	}, function(err, data) {
		if (err) {
			if (err.name === 'ResourceNotFoundException') {
				this._createLogGroupAndStream(logGroupName, logStreamName, function(err) {
					if (err) {
						cb(err);
					}
					else {
						this._getSequenceToken(logGroupName, logStreamName, cb);
					}
				}.bind(this));
			}
			else {
				cb(err);
			}
		}
		else if (data.logStreams.length === 0) {
			this._createLogStream(logGroupName, logStreamName, function(err) {
				if (err) {
					cb(err);
				}
				else {
					this._emitCreateLogStream();
					this._getSequenceToken(logGroupName, logStreamName, cb);
				}
			}.bind(this));
		}
		else {
			cb(null, data.logStreams[0].uploadSequenceToken);
		}
	}.bind(this));
};

/**
 * Create both the LogGroup and LogStream in AWS CloudWatch Logs.
 *
 * @param {string} logGroupName
 * @param {string} logStreamName
 * @param {function} cb
 * @private
 */
CWLogsWritable.prototype._createLogGroupAndStream = function(logGroupName, logStreamName, cb) {
	this._createLogGroup(logGroupName, function(err) {
		if (err) {
			cb(err);
		}
		else {
			this._emitCreateLogGroup();
			this._createLogStream(logGroupName, logStreamName, function(err) {
				if (err) {
					cb(err);
				}
				else {
					this._emitCreateLogStream();
					cb();
				}
			}.bind(this));
		}
	}.bind(this));
};

/**
 * Create the LogGroup in AWS CloudWatch Logs.
 *
 * @param {string} logGroupName
 * @param {function} cb
 * @private
 */
CWLogsWritable.prototype._createLogGroup = function(logGroupName, cb) {
	this.cloudwatch.createLogGroup({
		logGroupName: logGroupName
	}, cb);
};

/**
 * Create the LogStream in AWS CloudWatch Logs.
 *
 * @param {string} logGroupName
 * @param {string} logStreamName
 * @param {function} cb
 * @private
 */
CWLogsWritable.prototype._createLogStream = function(logGroupName, logStreamName, cb) {
	this.cloudwatch.createLogStream({
		logGroupName: logGroupName,
		logStreamName: logStreamName
	}, cb);
};

/**
 * Fired on successful PutLogEvent API calls.
 *
 * @event CWLogsWritable#putLogEvents
 * @param {Array.<{message:string,timestamp:number}>} logEvents
 */
CWLogsWritable.prototype._emitPutLogEvents = function(logEvents) {
	this.emit('putLogEvents', logEvents);
};

/**
 * Fired on successful CreateLogGroup API call.
 *
 * @event CWLogsWritable#createLogGroup
 */
CWLogsWritable.prototype._emitCreateLogGroup = function() {
	this.emit('createLogGroup');
};

/**
 * Fired on successful CreateLogStream API call.
 *
 * @event CWLogsWritable#createLogStream
 */
CWLogsWritable.prototype._emitCreateLogStream = function() {
	this.emit('createLogStream');
};

/**
 * Fired when an error is thrown while stringifying a log event.
 *
 * @event CWLogsWritable#stringifyError
 * @param {Error} err
 * @param {object|string} rec
 */
CWLogsWritable.prototype._emitStringifyError = function(err, rec) {
	this.emit('stringifyError', err, rec);
};

/**
 * Fired when a log event message is larger than the 262118 byte limit enforced by PutLogEvents.
 *
 * @event CWLogsWritable#oversizeLogEvent
 * @param {string} logEventMessage - Stringified log event.
 */
CWLogsWritable.prototype._emitOversizeLogEvent = function(logEventMessage) {
	this.emit('oversizeLogEvent', logEventMessage);
};

CWLogsWritable._falseFilterWrite = function() {
	return false;
};

function isFiniteNumber(val) {
	return typeof val === 'number' && isFinite(val);
}

function isInterval(val) {
	return val === 'nextTick' || isFiniteNumber(val) && val >= 0;
}

function logEventComparator(a, b) {
	return a.timestamp < b.timestamp ? -1
		: a.timestamp > b.timestamp ? 1 : 0;
}
