'use strict';

var expect = require('./setup');
var proxyquire = require('proxyquire');

describe('safe-stringify', function() {
	function getProxiedModule(safeJsonStringify) {
		return proxyquire('../lib/safe-stringify', {
			'safe-json-stringify': safeJsonStringify || null
		});
	}

	afterEach(function() {
		expect.restoreSpies();
	});

	describe('safeCycles', function() {
		it('should replace shallow circular references', function() {
			var safeStringify = getProxiedModule();
			var obj = {
				a: 'foo',
				b: {},
				c: []
			};
			obj.self = obj;
			obj.bref = obj.b;
			obj.cref = obj.c;

			expect(JSON.stringify(obj, safeStringify.safeCycles()))
				.toBe(JSON.stringify({
					a: 'foo',
					b: {},
					c: [],
					self: '[Circular]',
					bref: '[Circular]',
					cref: '[Circular]'
				}));
		});

		it('should replace deep circular references', function() {
			var safeStringify = getProxiedModule();
			var obj = {
				a: 'foo',
				b: {},
				c: []
			};

			obj.b.self = obj;
			obj.b.bref = obj.b;

			obj.c.push(obj);
			obj.c.push(obj.c);

			expect(JSON.stringify(obj, safeStringify.safeCycles()))
				.toBe(JSON.stringify({
					a: 'foo',
					b: {
						self: '[Circular]',
						bref: '[Circular]'
					},
					c: [
						'[Circular]',
						'[Circular]'
					]
				}));
		});

		it('should replace further instances based on key order', function() {
			var safeStringify = getProxiedModule();
			var obj = {
				a: 'foo',
				b: {},
				c: ['bar'],
				d: ['foobar'],
				e: {}
			};

			obj.b.cref = obj.c;
			obj.c.push(obj.b);
			obj.d.push(obj.e);
			obj.e.dref = obj.d;

			expect(JSON.stringify(obj, safeStringify.safeCycles()))
				.toBe(JSON.stringify({
					a: 'foo',
					b: {
						cref: ['bar', '[Circular]']
					},
					c: '[Circular]',
					d: ['foobar', { dref: '[Circular]' }],
					e: '[Circular]'
				}));
		});

		it('should not catch thrown errors', function() {
			var safeStringify = getProxiedModule();
			var expectedError = new Error('expected-error');
			var obj = {};
			Object.defineProperty(obj, 'a', {
				enumerable: true,
				get: function() {
					throw expectedError;
				}
			});

			try {
				JSON.stringify(obj, safeStringify.safeCycles());
			}
			catch (err) {
				if (err !== expectedError) {
					throw err;
				}

				return;
			}

			throw new Error('Expected to throw error');
		});
	});

	describe('fastAndSafeJsonStringify', function() {
		it('should not use safeCycles if no errors', function() {
			var safeJsonStringifySpy = expect.createSpy();
			var safeStringify = getProxiedModule(safeJsonStringifySpy);
			var stringifySpy = expect.spyOn(JSON, 'stringify').andCallThrough();

			var obj = {
				foo: 'bar'
			};

			var ret = safeStringify.fastAndSafeJsonStringify(obj);

			expect(stringifySpy.calls.length).toBe(1);
			expect(stringifySpy.calls[0].arguments.length).toBe(1);
			expect(stringifySpy.calls[0].arguments[0]).toBe(obj);
			expect(safeJsonStringifySpy.calls.length).toBe(0);

			expect(ret).toEqual(JSON.stringify({
				foo: 'bar'
			}));
		});

		it('should attempt to replace circular references if error thrown on first stringify', function() {
			var safeJsonStringifySpy = expect.createSpy();
			var safeStringify = getProxiedModule(safeJsonStringifySpy);
			var stringifySpy = expect.spyOn(JSON, 'stringify').andCallThrough();

			var obj = {
				foo: 'bar'
			};
			obj.self = obj;

			var ret = safeStringify.fastAndSafeJsonStringify(obj);

			expect(stringifySpy.calls.length).toBe(2);
			expect(stringifySpy.calls[0].arguments.length).toBe(1);
			expect(stringifySpy.calls[0].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments.length).toBe(2);
			expect(stringifySpy.calls[1].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments[1]).toBeA('function');
			expect(safeJsonStringifySpy.calls.length).toBe(0);

			expect(ret).toEqual(JSON.stringify({
				foo: 'bar',
				self: '[Circular]'
			}));
		});

		it('should stringify through safe-json-stringify if error thrown', function() {
			var safeJsonStringify = require('safe-json-stringify');
			var safeJsonStringifySpy = expect.createSpy()
				.andCall(function(rec) {
					expect(stringifySpy.calls.length).toBe(2);
					return safeJsonStringify(rec);
				});
			var safeStringify = getProxiedModule(safeJsonStringifySpy);
			var stringifySpy = expect.spyOn(JSON, 'stringify').andCallThrough();

			var obj = {};
			Object.defineProperty(obj, 'a', {
				enumerable: true,
				get: function() {
					throw new Error('expected-error');
				}
			});

			var ret = safeStringify.fastAndSafeJsonStringify(obj);

			expect(stringifySpy.calls.length).toBe(3);
			expect(stringifySpy.calls[0].arguments.length).toBe(1);
			expect(stringifySpy.calls[0].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments.length).toBe(2);
			expect(stringifySpy.calls[1].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments[1]).toBeA('function');
			expect(safeJsonStringifySpy.calls.length).toBe(1);
			expect(safeJsonStringifySpy.calls[0].arguments.length).toBe(1);
			expect(safeJsonStringifySpy.calls[0].arguments[0]).toBe(obj);

			expect(ret).toEqual('{"a":"[Throws: expected-error]"}');
		});

		it('should throw non-circular errors if safe-json-stringify isn\'t installed', function() {
			var expectedError = new Error('expected-error');
			var safeStringify = getProxiedModule();
			var stringifySpy = expect.spyOn(JSON, 'stringify').andCallThrough();

			var obj = {};
			Object.defineProperty(obj, 'a', {
				enumerable: true,
				get: function() {
					throw expectedError;
				}
			});

			var thrownError = false;
			try {
				safeStringify.fastAndSafeJsonStringify(obj);
			}
			catch (err) {
				if (err !== expectedError) {
					throw err;
				}

				thrownError = true;
			}

			if (!thrownError) {
				throw new Error('Expected to throw error');
			}

			expect(stringifySpy.calls.length).toBe(2);
			expect(stringifySpy.calls[0].arguments.length).toBe(1);
			expect(stringifySpy.calls[0].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments.length).toBe(2);
			expect(stringifySpy.calls[1].arguments[0]).toBe(obj);
			expect(stringifySpy.calls[1].arguments[1]).toBeA('function');
		});
	});
});
