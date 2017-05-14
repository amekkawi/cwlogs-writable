'use strict';

var expect = require('expect');
var fs = require('fs');
var path = require('path');

describe('AWS Live Test', function() {
	this.slow(2000);
	this.timeout(5000);

	var CWLogsWritable = require('../lib/index');
	var logGroupName = process.env.LOG_GROUP_NAME;
	var logStreamName = process.env.LOG_STREAM_NAME;
	var region = process.env.AWS_REGION || 'us-east-1';
	var accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	var secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

	afterEach(function () {
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
			throw err;
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

		var maxSize = 256 * 1024 - 26;
		expect(maxSize).toBe(262118);

		stream.on('error', function(err) {
			//console.error({ m: err.message, c: err.code, s: err.statusCode });
			//console.log(Object.keys(err));
			throw err;
		});

		stream.on('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(1);
			done();
		});

		var largeMessage = new Array(maxSize + 1).join('0');
		stream.write(largeMessage);
	});

	it('should fail if message is over 262118 bytes (256 KB - 26 bytes) for the message', function(done) {
		var stream = new CWLogsWritable({
			logGroupName: logGroupName,
			logStreamName: logStreamName,
			cloudWatchLogsOptions: {
				region: region,
				accessKeyId: accessKeyId,
				secretAccessKey: secretAccessKey
			}
		});

		var maxSize = 256 * 1024 - 26;
		expect(maxSize).toBe(262118);

		stream.on('error', function(err) {
			expect(err.name).toBe('InvalidParameterException');
			expect(err.message).toBe('Log event too large: 262145 bytes exceeds limit of 262144');
			done();
		});

		stream.on('putLogEvents', function() {
			throw new Error('Expected not to succeed');
		});

		var largeMessage = new Array(maxSize + 2).join('0');
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
			throw err;
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

	it('should catch InvalidSequenceTokenException in onError handler', function(done) {
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

		stream.on('error', errorEventSpy);

		stream.write('foo');

		stream.once('putLogEvents', function(logEvents) {
			expect(logEvents.length).toBe(1);
			expect(this.queuedLogs.length).toBe(0);

			// Force an invalid sequence token
			stream.sequenceToken = 'invalid-token';

			stream.write('bar');

			stream.once('putLogEvents', function() {
				done(new Error('Expected putLogEvents not to be fired'));
			});
		});
	});

	it('should catch DataAlreadyAcceptedException in onError handler', function(done) {
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
		stream.once('putLogEvents', function(logEvents) {
			// Copy the seq token so it is reused.
			seqToken = stream.sequenceToken;

			stream.write('bar');

			stream.once('putLogEvents', function() {
				stream.sequenceToken = seqToken;

				// Send the same message again.
				stream.write('bar');
			});
		});
	});
});
