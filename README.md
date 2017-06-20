# cwlogs-writable #

Writable stream for AWS CloudWatch Logs, inspired by [bunyan-cloudwatch](https://github.com/mirkokiefer/bunyan-cloudwatch).

[![Build Status](https://travis-ci.org/amekkawi/cwlogs-writable.svg?branch=v0.4.3)](https://travis-ci.org/amekkawi/cwlogs-writable)
[![Coverage Status](https://coveralls.io/repos/github/amekkawi/cwlogs-writable/badge.svg?branch=v0.4.3)](https://coveralls.io/github/amekkawi/cwlogs-writable?branch=v0.4.3)
[![Dependencies Status](https://david-dm.org/amekkawi/cwlogs-writable/v0.4.3/status.svg)](https://david-dm.org/amekkawi/cwlogs-writable/v0.4.3)
[![Optional Dependencies Status](https://david-dm.org/amekkawi/cwlogs-writable/v0.4.3/optional-status.svg)](https://david-dm.org/amekkawi/cwlogs-writable/v0.4.3?type=optional)

* [Features](#features)
* [API Docs](#api-docs)
* [Quick Start](#quick-start)
* [Bunyan Example](#bunyan-example)
* [Capturing Log Record Stringification Errors](#capturing-log-record-stringification-errors)
* [Picking LogStream Names](#picking-logstream-names)
* [Recovering from Errors](#recovering-from-errors)
* [Custom Handling of InvalidSequenceTokenException AWS Errors](#custom-handling-of-invalidsequencetokenexception-aws-errors)
* [CWLogsWritable Options](#cwlogswritable-options)
* [Change Log](CHANGELOG.md)
* [License](#license)

---

## Features ##

* Uses [aws-sdk](https://www.npmjs.com/package/aws-sdk).
* Can be used anywhere Writable streams are allowed.
* Allows for recovery from AWS errors.
* Creates log groups and streams if they do not exist.
* Filtering of log events by the stream itself.
* Safe stringification of log events.

## API Docs ##

There are two forms of the API docs:

* [Normal API docs](docs/api.md) - Use this if you using cwlogs-writable
  as-is and not customizing/extending it's functionality.
* [Extended API docs](docs/api-protected.md) - Use this to also view
  `protected` methods that you can use to customize/extend cwlogs-writable.

## Quick Start ##

Install the library using NPM into your existing node project:

```
npm install cwlogs-writable
```

Create and write to the stream.

```javascript
var CWLogsWritable = require('cwlogs-writable');

// Make stream name as unique as possible (see "Picking LogStream Names").
var streamName = 'my-log-stream/' + Date.now()
  + '/' + Math.round(Math.random() * 4026531839 + 268435456).toString(16);

var stream = new CWLogsWritable({
  logGroupName: 'my-aws-log-group',
  logStreamName: streamName,

  // Options passed to the AWS.CloudWatchLogs service.
  cloudWatchLogsOptions: {
    // Change the AWS region as needed.
    region: 'us-east-1',

    // Example authenticating using access key.
    accessKeyId: '{AWS-IAM-USER-ACCESS-KEY-ID}',
    secretAccessKey: '{AWS-SECRET-ACCESS-KEY}'
  }
});

stream.write('example-log-message');
```

Also consider this checklist:

* Are my log stream names [unique enough](#picking-logstream-names)?
* What if a log record [stringification fails](#capturing-log-record-stringification-errors)?
* Should my logging [recover from errors](#recovering-from-errors) or fail fast?

## Bunyan Example ##

```javascript
var bunyan = require('bunyan');
var CWLogsWritable = require('cwlogs-writable');

// Make stream name as unique as possible (see "Picking LogStream Names").
var streamName = 'my-log-stream/' + Date.now()
  + '/' + Math.round(Math.random() * 4026531839 + 268435456).toString(16);

var logger = bunyan.createLogger({
  name: 'foo',
  streams: [
    {
      level: 'debug',

      // If 'raw' the CloudWatch log event timestamp will
      // be taken from the bunyan JSON (i.e. rec.time).
      type: 'raw',

      stream: new CWLogsWritable({
        logGroupName: 'my-aws-log-group',
        logStreamName: streamName,
        cloudWatchLogsOptions: { /* ... */ }
      })
    }
  ]
});
```

## Picking LogStream Names ##

In AWS CloudWatch Logs a LogStream represents "a sequence of log events from a
single emitter of logs".

The important part is "single emitter", as this implies that log events should
not be put into a LogStream concurrently by multiple emitters.

This is enforced by the [PutLogEvents API action](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
which requires each call to include a "sequenceToken". That token is changed
each time a call is successful, and the new token is used for the next call.

If an emitter provides an incorrect token, the API will respond with
an __InvalidSequenceTokenException__.

To avoid this error, you must pick LogStream names that are unique to the
emitter or at least include enough randomness.

```javascript
// Example generation of LogStream name
var logStreamName = [

  // Environment identifier (e.g. "production")
  process.env.NODE_ENV || 'development',

  // Current UTC date
  new Date().toISOString().substr(0, 10),

  // EC2 instance ID, optionally provided as an env variable
  process.env.EC2_INSTANCE_ID || null,

  // Process ID
  'p' + process.pid,

  // Random hex string (from "10000000" to "ffffffff")
  Math.round(Math.random() * 4026531839 + 268435456).toString(16),

].filter(Boolean).join('/').replace(/[:*]/g, '');
```

## Capturing Log Record Stringification Errors ##

Before log records are sent to AWS they must be stringified.
cwlogs-writable uses safe stringification techniques to handle
circular references that would normally cause JSON.stringify to fail.

Other errors thrown during stringification (e.g. one thrown by a
[property getter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get))
will also be handled if the optional dependency
[safe-json-stringify](https://npmjs.com/package/safe-json-stringify)
is installed.

If it is not installed, cwlogs-writable will catch the error and emit a
`stringifyError` event.

```javascript
var stream = new CWLogsWritable({ ... });

// Catch errors if safe-json-stringify is not installed
stream.on('stringifyError', function(err, record) {
  console.log('Failed to stringify log entry!', err);

  // You can attempt to manually process the record argument,
  // but be careful as you will may hit the same error.
  //customBadRecordProcessing(record);
});
```

## Recovering from Errors ##

By default cwlogs-writable will handle the two most common AWS errors,
`InvalidSequenceTokenException` and `DataAlreadyAcceptedException`, to
give your application as much resiliency as possible.

For all other errors, the default behavior of a CWLogsWritable stream is to
emit an 'error' event, clear any queued logs, and ignore all further writes to
the stream to prevent memory leaks.

To override this behavior you can provide a `onError` callback that will
allow you to recover from these errors.

```javascript
var CWLogsWritable = require('cwlogs-writable');

function onError(err, logEvents, next) {
  // Use built-in behavior if the error is not
  // from a PutLogEvents action (logEvents will be null).
  if (!logEvents) {
    next(err);
    return;
  }

  // Requeue the log events after a delay,
  // if the queue is small enough.
  if (this.getQueueSize() < 100) {
    setTimeout(function() {
      // Pass the logEvents to the "next" callback
      // so they are added back to the head of the queue.
      next(logEvents);
    }, 2000);
  }

  // Otherwise, log the events to the console
  // and resume streaming.
  else {
    console.error(
      'Failed to send logEvents: ' +
      JSON.stringify(logEvents)
    );

    next();
  }
}

// Make stream name as unique as possible (see "Picking LogStream Names").
var streamName = 'my-log-stream/' + Date.now()
  + '/' + Math.round(Math.random() * 4026531839 + 268435456).toString(16);

var stream = new CWLogsWritable({
  logGroupName: 'my-aws-log-group',
  logStreamName: streamName,
  cloudWatchLogsOptions: { /* ... */ },

  // Pass the onError callback to CWLogsWritable
  onError: onError
});
```

## Custom Handling of InvalidSequenceTokenException AWS Errors ##

Frequent `InvalidSequenceTokenException` AWS errors may indicate a
problem with the uniqueness of your LogStream name
(see [Picking LogStream Names](#picking-logstream-names)).

If you are experiencing throttling on
[PutLogEvents](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
or [DescribeLogStreams](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_DescribeLogStreams.html)
actions, you may want to add custom handling of `InvalidSequenceTokenException` errors.

```javascript
// Example of changing the logStreamName on
// InvalidSequenceTokenException errors
// to attempt to avoid further collisions.

function getLogStreamName() {
  return 'my-log-stream/' + Date.now()
    + '/' + Math.round(Math.random() * 4026531839 + 268435456).toString(16);
}

function onError(err, logEvents, next) {
  // Change the LogStream name to get a new
  // randomized value, and requeue the log events.
  if (err.code === 'InvalidSequenceTokenException') {
    this.logStreamName = getLogStreamName();
    next(logEvents);
  }

  // Default to built-in behavior.
  else {
    next(err);
  }
}

var stream = new CWLogsWritable({
  logGroupName: 'my-aws-log-group',
  logStreamName: getLogStreamName(),
  cloudWatchLogsOptions: { /* ... */ },

  // Disable the default handling of
  // InvalidSequenceTokenException errors
  // so onError will get them instead.
  retryOnInvalidSequenceToken: false,

  // Pass the onError callback to CWLogsWritable
  onError: onError
});
```

## CWLogsWritable Options ##

- **logGroupName**

   Required  
   Type: <code>string</code>

   AWS CloudWatch [LogGroup](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.

- **logStreamName**

   Required  
   Type: <code>string</code>

   AWS CloudWatch [LogStream](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.

- **cloudWatchLogsOptions**

   Optional  
   Type: <code>object</code>  
   Default: <code>{}</code>

   Options passed to [AWS.CloudWatchLogs](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property) service.

- **writeInterval**

   Optional  
   Type: <code>string</code> | <code>number</code>  
   Default: <code>&quot;nextTick&quot;</code>

   Amount of wait time after a Writable#_write call to allow batching of log events. Must be a positive number or "nextTick". If "nextTick", `process.nextTick` is used. If a number, `setTimeout` is used.

- **retryableDelay**

   Optional  
   Type: <code>string</code> | <code>number</code>  
   Default: <code>150</code>

- **retryableMax**

   Optional  
   Type: <code>number</code>  
   Default: <code>100</code>

   Maximum number of times an AWS error marked as "retryable" will be retried before the error is instead passed to [CWLogsWritable#onError](docs/api.md#CWLogsWritable+onError).

- **maxBatchCount**

   Optional  
   Type: <code>number</code>  
   Default: <code>10000</code>

   Maximum number of log events allowed in a single PutLogEvents API call.

- **maxBatchSize**

   Optional  
   Type: <code>number</code>  
   Default: <code>1048576</code>

   Maximum number of bytes allowed in a single PutLogEvents API call.

- **ignoreDataAlreadyAcceptedException**

   Optional  
   Type: <code>boolean</code>  
   Default: <code>true</code>

   Ignore `DataAlreadyAcceptedException` errors. This will bypass [CWLogsWritable#onError](docs/api.md#CWLogsWritable+onError). See [cwlogs-writable/issues/10](https://github.com/amekkawi/cwlogs-writable/issues/10).

- **retryOnInvalidSequenceToken**

   Optional  
   Type: <code>boolean</code>  
   Default: <code>true</code>

   Retry on `InvalidSequenceTokenException` errors. This will bypass [CWLogsWritable#onError](docs/api.md#CWLogsWritable+onError). See [cwlogs-writable/issues/12](https://github.com/amekkawi/cwlogs-writable/issues/12).

- **onError**

   Optional  
   Type: <code>function</code>

   Called when an AWS error is encountered. Overwrites [CWLogsWritable#onError](docs/api.md#CWLogsWritable+onError) method.

- **filterWrite**

   Optional  
   Type: <code>function</code>

   Filter writes to CWLogsWritable. Overwrites [CWLogsWritable#filterWrite](docs/api.md#CWLogsWritable+filterWrite) method.

- **objectMode**

   Optional  
   Type: <code>boolean</code>  
   Default: <code>true</code>

   Passed to the Writable constructor. See https://nodejs.org/api/stream.html#stream_object_mode.

## Change Log ##

See [CHANGELOG.md](CHANGELOG.md)

## License ##

The MIT License (MIT)

Copyright (c) 2017 Andre Mekkawi &lt;github@andremekkawi.com&gt;

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
