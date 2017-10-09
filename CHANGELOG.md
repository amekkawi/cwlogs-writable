# cwlogs-writable Change Log #

## 1.0.0 (Oct 9, 2017)

  * Bump to v1.0.0

## 0.4.3 (Jun 19, 2017)

  * Add support for validating max message bytes
     * Add [CWLogsWritable#reduceOversizedMessage](docs/api-protected.md#CWLogsWritable+reduceOversizedMessage) method to allow custom
       handling of oversized messages to reduce their size.
     * Add [CWLogsWritable#event:oversizeLogEvent](docs/api-protected.md#CWLogsWritable+event_oversizeLogEvent) event that is fired for
       messages that are dropped due to their size.
     * Change [CWLogsWritable#getMessageSize](docs/api-protected.md#CWLogsWritable+getMessageSize) to accurately measure the byte
       size if the estimate puts it over the max size.
     * Change [CWLogsWritable#dequeueNextLogBatch](docs/api-protected.md#CWLogsWritable+dequeueNextLogBatch) to drop log events if:
        * getMessageSize returns a size for the message that is over the
          limit, and...
        * Passing the message through reduceOversizedMessage does not
          reduce the message to fit within the limit.

## 0.4.2 (Jun 17, 2017)

  * Fix determining log "message" size not handling multi-byte chars [#13]

## 0.4.1 (Jun 13, 2017)

  * Fix error thrown if no 'error' event listeners on stream [#15]

## 0.4.0 (Jun 11, 2017)

  **Breaking Changes:**

  * Remove `CWLogsWritable#nextLogBatchSize` in favor of [CWLogsWritable#dequeueNextLogBatch](docs/api-protected.md#CWLogsWritable+dequeueNextLogBatch)

  **Non-Breaking Changes:**

  * Add [CWLogsWritable#dequeueNextLogBatch](docs/api-protected.md#CWLogsWritable+dequeueNextLogBatch) to get the next batch of log events,
    and also handle chronological limits of PutLogEvents API call [#2]
     * Batch of log events must be in chronological order by timestamp
     * Batch of log events cannot exceed 24 hours
  * Add live tests for chronological limits of PutLogEvents

## 0.3.0 (June 2, 2017)

  * Add options for auto-handling common AWS errors [#10][#12]
  * Add code coverage support (including coveralls)
  * Add missing CWLogsWritable test for internal filter method
  * Change logGroupName/logStreamName props to be writable [#11]
  * Fix CWLogsWritable test for error handling

## 0.2.0 (May 14, 2017)

  * Add optional "safe-json-stringify" NPM dependency
  * Add [CWLogsWritable#safeStringifyLogEvent](docs/api-protected.md#CWLogsWritable+safeStringifyLogEvent) protected method
  * Add [CWLogsWritable#event:stringifyError](docs/api-protected.md#CWLogsWritable+event_stringifyError) event
  * Change [CWLogsWritable#createLogEvent](docs/api-protected.md#CWLogsWritable+createLogEvent) to call
    CWLogsWritable#event:safeStringifyLogEvent to safely stringify
    non-string log events. Circular references are replaced with `"[Circular]"`
    and any other errors will fire a CWLogsWritable#stringifyError
    event.

## 0.1.0 (February 14, 2017)

  * Initial version
