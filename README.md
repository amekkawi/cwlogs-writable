# cwlogs-writable #

Writable stream for AWS CloudWatch Logs

## Features ##

* Can be used anywhere Writable streams are allowed.
* Allows for recovery from AWS errors.
* Filter log events.

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

var stream = new CWLogsWritable({
  logGroupName: 'my-aws-log-group',
  logStreamName: 'my-log-stream',

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

## Bunyan Example ##

```javascript
var bunyan = require('bunyan');
var CWLogsWritable = require('cwlogs-writable');

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
        logStreamName: 'my-log-stream',
        cloudWatchLogsOptions: { /* ... */ }
      })
    }
  ]
});
```

## Recovering from AWS Errors ##

When an AWS error is encounted, the default behavior of a CWLogsWritable
stream is to emit an 'error' event, clear any queued logs, and ignore all
further writes to the stream to prevent memory leaks.

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

var stream = new CWLogsWritable({
  logGroupName: 'my-aws-log-group',
  logStreamName: 'my-log-stream',
  cloudWatchLogsOptions: { /* ... */ },

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

   Options passed when creating [AWS.CloudWatchLogs](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property) service.

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

   Maximum number of times a AWS error marked as "retryable" will be retried before the error is instead passed to [CWLogsWritable#onError](docs/api.md#CWLogsWritable+onError).

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
