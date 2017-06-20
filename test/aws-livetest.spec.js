'use strict';

var MAX_MESSAGE_SIZE = 262118;
var expect = require('./setup');
var path = require('path');
require('dotenv').config({
	path: path.join(__dirname, '.aws-env')
});

describe('AWS Live Test', function() {
	this.slow(2000);
	this.timeout(5000);

	var CWLogsWritable = require('../lib/index');
	var logGroupName = process.env.LOG_GROUP_NAME;
	var logStreamName = process.env.LOG_STREAM_NAME;
	var region = process.env.AWS_REGION || 'us-east-1';
	var accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	var secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

	afterEach(function() {
		expect.restoreSpies();
	});

	it('has valid params', function() {
		expect(logGroupName).toBeA('string');
		expect(logGroupName.length).toBeGreaterThan(0);
		expect(logStreamName).toBeA('string');
		expect(logStreamName.length).toBeGreaterThan(0);
		expect(region).toBeA('string');
		expect(region.length).toBeGreaterThan(0);
		expect(accessKeyId).toBeA('string');
		expect(accessKeyId.length).toBeGreaterThan(0);
		expect(secretAccessKey).toBeA('string');
		expect(secretAccessKey.length).toBeGreaterThan(0);
	});

	it('should send log events', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', function(err) {
			done(err);
		});

		stream.on('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(5);
			done();
		});

		for (var i = 0; i < 5; i++) {
			stream.write({
				_time: Date.now(),
				index: i,
				rand: Math.random()
			});
		}
	});

	it('should handle invalid accessKeyId (UnrecognizedClientException)', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			onError: function(err) {
				expect(err.code).toBe('UnrecognizedClientException');

				// Set delay to make sure AWS-SDK doesn't throw an error.
				setTimeout(function() {
					done();
				}, 50);
			},
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: 'nope',
				secretAccessKey: 'nope'
			}
		});

		stream.write('foo');

		stream.on('putLogEvents', function() {
			done(new Error('Expected to not be called'));
		});
	});

	it('should handle invalid secretAccessKey (InvalidSignatureException)', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			onError: function(err) {
				expect(err.code).toBe('InvalidSignatureException');

				// Set delay to make sure AWS-SDK doesn't throw an error.
				setTimeout(function() {
					done();
				}, 50);
			},
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: '0OKW39DejMUcepCSKAkYuKLwuz3k60VdJXinDQHS'
			}
		});

		stream.write('foo');

		stream.on('putLogEvents', function() {
			done(new Error('Expected to not be called'));
		});
	});

	it('should allow up to 262118 bytes (256 KB - 26 bytes) for the message', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', function(err) {
			done(err);
		});

		stream.on('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(1);
			done();
		});

		var largeMessage = new Array(MAX_MESSAGE_SIZE + 1).join('0');
		stream.write(largeMessage);
	});

	it('should fail if message is over 262118 bytes (256 KB - 26 bytes) and is forced to send', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		// Force the overlarge message to be sent.
		stream.dequeueNextLogBatch = function() {
			return this.queuedLogs.splice(0, 1);
		};

		stream.on('error', function(err) {
			expect(err.name).toBe('InvalidParameterException');
			expect(err.message).toBe('Log event too large: 262145 bytes exceeds limit of 262144');
			done();
		});

		stream.on('putLogEvents', function() {
			done(new Error('Expected not to succeed'));
		});

		var largeMessage = new Array(MAX_MESSAGE_SIZE + 2).join('0');
		stream.write(largeMessage);
	});

	it('should send up to 10000 messages in one PutLogEvents', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', function(err) {
			var expectErr = new Error('Expected not to emit error -- ' + err.name + ': ' + err.message);
			var expectStack = expectErr.stack.split(/\n/g);
			expectStack = expectStack.length > 10
				? expectStack.slice(0, 10).join('\n') + '\n    ...'
				: expectStack.join('\n');
			expectErr.stack = expectStack + '\n' + err.stack;
			done(expectErr);
		});

		stream.on('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(10000);
			expect(this.queuedLogs.length).toBe(0);
			done();
		});

		for (var i = 0; i < 10000; i++) {
			stream.write('i:' + i);
		}
	});

	it('should retry on InvalidSequenceTokenException by default', function(done) {
		var errorEventSpy = expect.createSpy()
			.andCall(function() {
				done();
			});

		var onErrorSpy = expect.createSpy()
			.andCall(function(err, logEvents, next) {
				try {
					expect(errorEventSpy.calls.length).toBe(0);
					expect(err.code).toBe('InvalidSequenceTokenException');
				}
				catch (err) {
					done(err);
					return;
				}

				next(err);
			});

		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			onError: onErrorSpy,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.onError = function(err) {
			var expectErr = new Error('Expected onError not to be called -- ' + err.name + ': ' + err.message);
			var expectStack = expectErr.stack.split(/\n/g);
			expectStack = expectStack.length > 10
				? expectStack.slice(0, 10).join('\n') + '\n    ...'
				: expectStack.join('\n');
			expectErr.stack = expectStack + '\n' + err.stack;
			done(expectErr);
		};

		stream.write('foo');

		stream.once('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(1);
			expect(this.queuedLogs.length).toBe(0);

			// Force an invalid sequence token
			expect(stream.sequenceToken).toBeA('string');
			stream.sequenceToken = 'invalid-token';

			stream.write('bar');

			stream.on('error', function(err) {
				var expectErr = new Error('Expected not to emit error -- ' + err.name + ': ' + err.message);
				var expectStack = expectErr.stack.split(/\n/g);
				expectStack = expectStack.length > 10
					? expectStack.slice(0, 10).join('\n') + '\n    ...'
					: expectStack.join('\n');
				expectErr.stack = expectStack + '\n' + err.stack;
				done(expectErr);
			});

			stream.once('putLogEvents', function() {
				done();
			});
		});
	});

	it('should catch InvalidSequenceTokenException in onError handler if default behavior disabled', function(done) {
		var errorEventSpy = expect.createSpy()
			.andCall(function() {
				done();
			});

		var onErrorSpy = expect.createSpy()
			.andCall(function(err, logEvents, next) {
				try {
					expect(errorEventSpy.calls.length).toBe(0);
					expect(err.code).toBe('InvalidSequenceTokenException');
				}
				catch (err) {
					done(err);
					return;
				}

				next(err);
			});

		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			retryOnInvalidSequenceToken: false,
			onError: onErrorSpy,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', errorEventSpy);

		stream.write('foo');

		stream.once('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(1);
			expect(this.queuedLogs.length).toBe(0);

			// Force an invalid sequence token
			expect(stream.sequenceToken).toBeA('string');
			stream.sequenceToken = 'invalid-token';

			stream.write('bar');

			stream.once('putLogEvents', function() {
				done(new Error('Expected putLogEvents not to be fired'));
			});
		});
	});

	it('should catch DataAlreadyAcceptedException in onError handler if default behavior is disabled', function(done) {
		var errorEventSpy = expect.createSpy()
			.andCall(function() {
				done();
			});

		var onErrorSpy = expect.createSpy()
			.andCall(function(err, logEvents, next) {
				try {
					expect(errorEventSpy.calls.length).toBe(0);
					expect(err.code).toBe('DataAlreadyAcceptedException');
				}
				catch (err) {
					done(err);
					return;
				}

				next(err);
			});

		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			ignoreDataAlreadyAcceptedException: false,
			onError: onErrorSpy,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', errorEventSpy);

		stream.write('foo');

		var seqToken;
		stream.once('putLogEvents', function() {
			// Copy the seq token so it is reused.
			expect(stream.sequenceToken).toBeA('string');
			seqToken = stream.sequenceToken;

			stream.write('bar');

			stream.once('putLogEvents', function() {
				stream.sequenceToken = seqToken;

				// Send the same message again.
				stream.write('bar');
			});
		});
	});

	it('should allow timestamps in different batches to be out of order', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			ignoreDataAlreadyAcceptedException: false,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', function(err) {
			var expectErr = new Error('Expected not to throw -- ' + err.name + ': ' + err.message);
			var expectStack = expectErr.stack.split(/\n/g);
			expectStack = expectStack.length > 10
				? expectStack.slice(0, 10).join('\n') + '\n    ...'
				: expectStack.join('\n');
			expectErr.stack = expectStack + '\n' + err.stack;
			done(expectErr);
		});

		var now = Date.now();
		var rand = Math.round(Math.random() * 4026531839 + 268435456).toString(16);

		stream.write({ time: now, msg: rand + ' 2' });
		stream.write({ time: now + 60000, msg: rand + ' 3' });

		stream.once('putLogEvents', function() {
			stream.write({ time: now - 1200000, msg: rand + ' 1' });
			stream.write({ time: now + 600000, msg: rand + ' 4' });

			stream.once('putLogEvents', function() {
				done();
			});
		});
	});

	it('should catch InvalidParameterException in onError handler when timestamps are out of order', function(done) {
		var onErrorSpy = expect.createSpy()
			.andCall(function(err) {
				try {
					expect(dequeueSpy.calls.length).toBe(1);
					expect(err.code).toBe('InvalidParameterException');
					expect(err.message).toBe('Log events in a single PutLogEvents request must be in chronological order.');
				}
				catch (err) {
					done(err);
					return;
				}

				// Set delay to make sure AWS-SDK doesn't throw an error.
				setTimeout(function() {
					done();
				}, 50);
			});

		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			ignoreDataAlreadyAcceptedException: false,
			onError: onErrorSpy,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		// Get next batch without chronological checks.
		var dequeueSpy = stream.dequeueNextLogBatch = expect.createSpy()
			.andCall(function() {
				var batch = this.queuedLogs;
				this.queuedLogs = [];
				return batch;
			});

		var now = Date.now();
		var rand = Math.round(Math.random() * 4026531839 + 268435456).toString(16);

		stream.write({ time: now + 60000, msg: rand + ' 2' });
		stream.write({ time: now, msg: rand + ' 1' });

		stream.once('putLogEvents', function() {
			done(new Error('Expected not to be called'));
		});
	});

	it('should catch InvalidParameterException in onError handler when timestamps span more than 24 hours', function(done) {
		var onErrorSpy = expect.createSpy()
			.andCall(function(err) {
				try {
					expect(dequeueSpy.calls.length).toBe(1);
					expect(err.code).toBe('InvalidParameterException');
					expect(err.message).toBe('The batch of log events in a single PutLogEvents request cannot span more than 24 hours.');
				}
				catch (err) {
					done(err);
					return;
				}

				// Set delay to make sure AWS-SDK doesn't throw an error.
				setTimeout(function() {
					done();
				}, 50);
			});

		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			ignoreDataAlreadyAcceptedException: false,
			onError: onErrorSpy,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		// Get next batch without chronological checks.
		var dequeueSpy = stream.dequeueNextLogBatch = expect.createSpy()
			.andCall(function() {
				var batch = this.queuedLogs;
				this.queuedLogs = [];
				return batch;
			});

		var now = Date.now();
		var rand = Math.round(Math.random() * 4026531839 + 268435456).toString(16);

		stream.write({ time: now - 86400000 * 2, msg: rand + ' -2 days' });
		stream.write({ time: now, msg: rand + ' now' });

		stream.once('putLogEvents', function() {
			done(new Error('Expected not to be called'));
		});
	});

	it('should ignore log entries that are older than 14 days or over 2 hours in the future', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			ignoreDataAlreadyAcceptedException: false,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		stream.on('error', function(err) {
			var expectErr = new Error('Expected not to throw -- ' + err.name + ': ' + err.message);
			var expectStack = expectErr.stack.split(/\n/g);
			expectStack = expectStack.length > 10
				? expectStack.slice(0, 10).join('\n') + '\n    ...'
				: expectStack.join('\n');
			expectErr.stack = expectStack + '\n' + err.stack;
			done(expectErr);
		});

		var now = Date.now();
		var rand = Math.round(Math.random() * 4026531839 + 268435456).toString(16);

		stream.write({ time: now - 365 * 86400000, msg: rand + ' -1 year' });
		stream.write({ time: now - 15 * 86400000, msg: rand + ' -15 day' });
		stream.write({ time: now - 14 * 86400000, msg: rand + ' -14 day' });
		stream.write({ time: now - 13.5 * 86400000, msg: rand + ' -13.5 day' });

		stream.once('putLogEvents', function() {
			stream.write({ time: now + 3600000, msg: rand + ' +1 hour' });
			stream.write({ time: now + 1.5 * 3600000, msg: rand + ' +1.5 hours' });
			stream.write({ time: now + 2 * 3600000, msg: rand + ' +2 hours' });
			stream.write({ time: now + 4 * 3600000, msg: rand + ' +4 hours' });
			stream.write({ time: now + 86400000, msg: rand + ' +1 day' });

			stream.once('putLogEvents', function() {
				done();
			});
		});
	});
});
