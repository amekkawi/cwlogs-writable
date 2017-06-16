<a name="CWLogsWritable"></a>

## CWLogsWritable ⇐ <code>Writable</code>
**Kind**: global class  
**Extends:** <code>Writable</code>  
**Emits**: <code>[putLogEvents](#CWLogsWritable+event_putLogEvents)</code>, <code>[createLogGroup](#CWLogsWritable+event_createLogGroup)</code>, <code>[createLogStream](#CWLogsWritable+event_createLogStream)</code>, <code>[stringifyError](#CWLogsWritable+event_stringifyError)</code>  

* [CWLogsWritable](#CWLogsWritable) ⇐ <code>Writable</code>
    * [new CWLogsWritable(options)](#new_CWLogsWritable_new)
    * [.logGroupName](#CWLogsWritable+logGroupName) : <code>string</code>
    * [.logStreamName](#CWLogsWritable+logStreamName) : <code>string</code>
    * [.writeInterval](#CWLogsWritable+writeInterval) : <code>string</code> &#124; <code>number</code>
    * [.ignoreDataAlreadyAcceptedException](#CWLogsWritable+ignoreDataAlreadyAcceptedException) : <code>boolean</code>
    * [.retryOnInvalidSequenceToken](#CWLogsWritable+retryOnInvalidSequenceToken) : <code>boolean</code>
    * [.retryableMax](#CWLogsWritable+retryableMax) : <code>number</code>
    * [.retryableDelay](#CWLogsWritable+retryableDelay) : <code>string</code> &#124; <code>number</code>
    * [.maxBatchCount](#CWLogsWritable+maxBatchCount) : <code>number</code>
    * [.maxBatchSize](#CWLogsWritable+maxBatchSize) : <code>number</code>
    * [.cloudwatch](#CWLogsWritable+cloudwatch) : <code>CloudWatchLogs</code>
    * [.getQueueSize()](#CWLogsWritable+getQueueSize) ⇒ <code>number</code>
    * [.clearQueue()](#CWLogsWritable+clearQueue) ⇒ <code>Array.&lt;{message:string, timestamp:number}&gt;</code>
    * [.onError(err, logEvents, next)](#CWLogsWritable+onError)
    * [.filterWrite(rec)](#CWLogsWritable+filterWrite) ⇒ <code>boolean</code>
    * [.reduceOversizedMessage(logEventMessage)](#CWLogsWritable+reduceOversizedMessage) ⇒ <code>\*</code> &#124; <code>string</code>
    * ["putLogEvents" (logEvents)](#CWLogsWritable+event_putLogEvents)
    * ["createLogGroup"](#CWLogsWritable+event_createLogGroup)
    * ["createLogStream"](#CWLogsWritable+event_createLogStream)
    * ["stringifyError" (err, rec)](#CWLogsWritable+event_stringifyError)
    * ["oversizeLogEvent" (logEventMessage)](#CWLogsWritable+event_oversizeLogEvent)

<a name="new_CWLogsWritable_new"></a>

### new CWLogsWritable(options)
Writable stream for AWS CloudWatch Logs.

**Params**

- options <code>object</code>
    - .logGroupName <code>string</code> - AWS CloudWatch [LogGroup](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.
    - .logStreamName <code>string</code> - AWS CloudWatch [LogStream](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name. It will be created if it doesn't exist.
    - [.cloudWatchLogsOptions] <code>object</code> <code> = {}</code> - Options passed to [AWS.CloudWatchLogs](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#constructor-property) service.
    - [.writeInterval] <code>string</code> | <code>number</code> <code> = &quot;nextTick&quot;</code> - Amount of wait time after a Writable#_write call to allow batching of log events. Must be a positive number or "nextTick". If "nextTick", `process.nextTick` is used. If a number, `setTimeout` is used.
    - [.retryableDelay] <code>string</code> | <code>number</code> <code> = 150</code>
    - [.retryableMax] <code>number</code> <code> = 100</code> - Maximum number of times an AWS error marked as "retryable" will be retried before the error is instead passed to [onError](#CWLogsWritable+onError).
    - [.maxBatchCount] <code>number</code> <code> = 10000</code> - Maximum number of log events allowed in a single PutLogEvents API call.
    - [.maxBatchSize] <code>number</code> <code> = 1048576</code> - Maximum number of bytes allowed in a single PutLogEvents API call.
    - [.ignoreDataAlreadyAcceptedException] <code>boolean</code> <code> = true</code> - Ignore `DataAlreadyAcceptedException` errors. This will bypass [onError](#CWLogsWritable+onError). See [cwlogs-writable/issues/10](https://github.com/amekkawi/cwlogs-writable/issues/10).
    - [.retryOnInvalidSequenceToken] <code>boolean</code> <code> = true</code> - Retry on `InvalidSequenceTokenException` errors. This will bypass [onError](#CWLogsWritable+onError). See [cwlogs-writable/issues/12](https://github.com/amekkawi/cwlogs-writable/issues/12).
    - [.onError] <code>function</code> - Called when an AWS error is encountered. Overwrites [onError](#CWLogsWritable+onError) method.
    - [.filterWrite] <code>function</code> - Filter writes to CWLogsWritable. Overwrites [filterWrite](#CWLogsWritable+filterWrite) method.
    - [.objectMode] <code>boolean</code> <code> = true</code> - Passed to the Writable constructor. See https://nodejs.org/api/stream.html#stream_object_mode.

**Example**  
```javascript
var CWLogsWritable = require('cwlogs-writable');
var stream = new CWLogsWritable({
  logGroupName: 'my-log-group',
  logStreamName: 'my-stream',
  cloudWatchLogsOptions: {
    region: 'us-east-1',
    accessKeyId: '{AWS-IAM-USER-ACCESS-KEY-ID}',
    secretAccessKey: '{AWS-SECRET-ACCESS-KEY}'
  }
});
```
<a name="CWLogsWritable+logGroupName"></a>

### cwLogsWritable.logGroupName : <code>string</code>
AWS CloudWatch [LogGroup](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name.
The LogGroup will be created if it doesn't exist.
Changes to this property will only take affect for the next PutLogEvents API call.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+logStreamName"></a>

### cwLogsWritable.logStreamName : <code>string</code>
AWS CloudWatch [LogStream](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/CloudWatchLogs.html#putLogEvents-property) name.
The LogStream will be created if it doesn't exist.
Changes to this property will only take affect for the next PutLogEvents API call.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+writeInterval"></a>

### cwLogsWritable.writeInterval : <code>string</code> &#124; <code>number</code>
Amount of wait time after a Writable#_write call to allow batching of
log events. Must be a positive number or "nextTick".
If "nextTick", `process.nextTick` is used.
If a number, `setTimeout` is used.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>&quot;nextTick&quot;</code>  
<a name="CWLogsWritable+ignoreDataAlreadyAcceptedException"></a>

### cwLogsWritable.ignoreDataAlreadyAcceptedException : <code>boolean</code>
Ignore `DataAlreadyAcceptedException` errors returned by
[PutLogEvents](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html) requests.

This will bypass [onError](#CWLogsWritable+onError).

See [cwlogs-writable/issues/10](https://github.com/amekkawi/cwlogs-writable/issues/10).

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>true</code>  
<a name="CWLogsWritable+retryOnInvalidSequenceToken"></a>

### cwLogsWritable.retryOnInvalidSequenceToken : <code>boolean</code>
Resend log events if
[PutLogEvents](http://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html)
requests return a `InvalidSequenceTokenException` error.

This will bypass [onError](#CWLogsWritable+onError).

See [cwlogs-writable/issues/12](https://github.com/amekkawi/cwlogs-writable/issues/12).

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>true</code>  
<a name="CWLogsWritable+retryableMax"></a>

### cwLogsWritable.retryableMax : <code>number</code>
Maximum number of times an AWS error marked as "retryable" will be
retried before the error is instead passed to [onError](#CWLogsWritable+onError).

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>100</code>  
<a name="CWLogsWritable+retryableDelay"></a>

### cwLogsWritable.retryableDelay : <code>string</code> &#124; <code>number</code>
**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>&quot;150&quot;</code>  
<a name="CWLogsWritable+maxBatchCount"></a>

### cwLogsWritable.maxBatchCount : <code>number</code>
Maximum number of log events allowed in a single PutLogEvents API call.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>10000</code>  
<a name="CWLogsWritable+maxBatchSize"></a>

### cwLogsWritable.maxBatchSize : <code>number</code>
Maximum number of bytes allowed in a single PutLogEvents API call.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Default**: <code>1048576</code>  
<a name="CWLogsWritable+cloudwatch"></a>

### cwLogsWritable.cloudwatch : <code>CloudWatchLogs</code>
The AWS.CloudWatchLogs instance.

**Kind**: instance property of <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+getQueueSize"></a>

### cwLogsWritable.getQueueSize() ⇒ <code>number</code>
Get the number of log events queued to be sent to AWS CloudWatch Logs.

Does not include events that are actively being sent.

**Kind**: instance method of <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+clearQueue"></a>

### cwLogsWritable.clearQueue() ⇒ <code>Array.&lt;{message:string, timestamp:number}&gt;</code>
Remove all log events that are still queued.

**Kind**: instance method of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Returns**: <code>Array.&lt;{message:string, timestamp:number}&gt;</code> - Log events removed from the queue.  
<a name="CWLogsWritable+onError"></a>

### cwLogsWritable.onError(err, logEvents, next)
Called when an AWS error is encountered. Do not call directly.

The default behavior of this method is call the `next` argument
with the error as the first argument.

`logEvents` argument will be either:

- An array of log event objects (see [CWLogsWritable#createLogEvent](CWLogsWritable#createLogEvent))
  if error is from PutLogEvents action.
- `null` if error is from any action besides PutLogEvents.

The `next` argument must be called in one of the following ways:

- **`next(err)`** — If the first argument is an instance of `Error`, an 'error'
  event will be emitted on the stream, [clearQueue](#CWLogsWritable+clearQueue) is called,
  and [filterWrite](#CWLogsWritable+filterWrite) is replaced so no further logging
  will be processed by the stream. This effectively disables the stream.

- **`next()` or `next(logEvents)`** — The stream will recover from the error and
  resume sending logs to AWS CloudWatch Logs. The first argument may optionally be
  an array of log event objects (i.e. `logEvents` argument) that will be added to
  the head of the log events queue.

**Kind**: instance method of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Params**

- err <code>Error</code> - AWS error
- logEvents <code>null</code> | <code>Array.&lt;{message:string, timestamp:number}&gt;</code>
- next <code>function</code>

**Example**  
```javascript
var CWLogsWritable = require('cwlogs-writable');
var stream = new CWLogsWritable({
  logGroupName: 'my-log-group',
  logStreamName: 'my-stream',
  onError: function(err, logEvents, next) {
    if (logEvents) {
      console.error(
        'CWLogsWritable PutLogEvents error',
        err,
        JSON.stringify(logEvents)
      );

      // Resume without adding the log events back to the queue.
      next();
    }
    else {
      // Use built-in behavior of emitting an error,
      // clearing the queue, and ignoring all writes to the stream.
      next(err);
    }
  }
}).on('error', function(err) {
  // Always listen for 'error' events to catch non-AWS errors as well.
  console.error(
    'CWLogsWritable error',
    err
  );
});
```
<a name="CWLogsWritable+filterWrite"></a>

### cwLogsWritable.filterWrite(rec) ⇒ <code>boolean</code>
Filter writes to CWLogsWritable.

Default behavior is to return true if `rec` is not null or undefined.

**Kind**: instance method of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Returns**: <code>boolean</code> - true to include, and false to exclude.  
**Params**

- rec <code>string</code> | <code>object</code> - Raw log record passed to Writable#write.

<a name="CWLogsWritable+reduceOversizedMessage"></a>

### cwLogsWritable.reduceOversizedMessage(logEventMessage) ⇒ <code>\*</code> &#124; <code>string</code>
Attempt to reduce the specified message so it fits within the
262118 byte limit enforced by PutLogEvents.

Only called for messages that are over the byte limit.

Use [Buffer.byteLength()](https://nodejs.org/api/buffer.html#buffer_class_method_buffer_bytelength_string_encoding)
to accurately measure the message size before returning it.

If the string returned is still over the byte limit, this method
will _not_ be called again for the log event.

**Kind**: instance method of <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Returns**: <code>\*</code> &#124; <code>string</code> - - The reduced string, or a non-string (i.e. undefined or null) indicating the message cannot be reduced.  
**See**: {CWLogsWritable#event:oversizeLogEvent}  
**Params**

- logEventMessage <code>string</code> - Stringified log event.

<a name="CWLogsWritable+event_putLogEvents"></a>

### "putLogEvents" (logEvents)
Fired on successful PutLogEvent API calls.

**Kind**: event emitted by <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Params**

- logEvents <code>Array.&lt;{message:string, timestamp:number}&gt;</code>

<a name="CWLogsWritable+event_createLogGroup"></a>

### "createLogGroup"
Fired on successful CreateLogGroup API call.

**Kind**: event emitted by <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+event_createLogStream"></a>

### "createLogStream"
Fired on successful CreateLogStream API call.

**Kind**: event emitted by <code>[CWLogsWritable](#CWLogsWritable)</code>  
<a name="CWLogsWritable+event_stringifyError"></a>

### "stringifyError" (err, rec)
Fired when an error is thrown while stringifying a log event.

**Kind**: event emitted by <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Params**

- err <code>Error</code>
- rec <code>object</code> | <code>string</code>

<a name="CWLogsWritable+event_oversizeLogEvent"></a>

### "oversizeLogEvent" (logEventMessage)
Fired when a log event message is larger than the 262118 byte limit enforced by PutLogEvents.

**Kind**: event emitted by <code>[CWLogsWritable](#CWLogsWritable)</code>  
**Params**

- logEventMessage <code>string</code> - Stringified log event.

