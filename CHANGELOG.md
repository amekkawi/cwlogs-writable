# cwlogs-writable Change Log #

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
