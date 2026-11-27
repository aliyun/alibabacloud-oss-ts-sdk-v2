# Scenario Samples

Tasks that cut across operations rather than exercising a single API. Each exports `run(arg)`.

| Use case | File | Argument |
|---|---|---|
| Presign a GET URL that needs no SDK or credentials to fetch | [PresignUrl.ets](PresignUrl.ets) | object key (default `sample/hello.txt`) |
| Sign with STS credentials from a custom provider | [StsCredentials.ets](StsCredentials.ets) | object key (default `sample/hello.txt`) |
| Cancel an in-flight request with a hand-built signal | [Cancellation.ets](Cancellation.ets) | object key (default `sample/hello.txt`) |
| Hold a download in a buffer you own, past the 100 MiB a buffered body stops at | [UseMemorySink.ets](UseMemorySink.ets) | object key (default `sample/hello.txt`) |
| Write a download into a file, range by range, sequentially or concurrently | [UseFileSink.ets](UseFileSink.ets) | object key (default `sample/hello.txt`), then the directory to write to |

`StsCredentials.ets` builds its own client with a provider written as a **class**: ArkTS has no
structural typing, so where node hands a plain `{ getCredentials }` object to a `CredentialsProvider`
parameter, here you implement the interface. Point its `getCredentials` at your own AssumeRole
backend.

`Cancellation.ets` implements the `AbortSignalLike` the SDK expects itself, because OpenHarmony has
no global `AbortController`. That hand-built signal is the part worth copying on this platform.

`UseMemorySink.ets` and `UseFileSink.ets` hand the body to a `sinkFactory` instead of letting the SDK
buffer it. One sink serves one HTTP attempt and its writes never overlap; `oneShot` is what tells the
retryer whether a replay may write again, and both factories here are replayable, so a retried attempt
refills the same buffer or the same file range. Only this platform's transport fills a sink — node and
browser report no such capability and the client rejects the call rather than buffering it. Sinks reach
the samples through `ohos-har/oss-v2/Index.ets`, which re-exports the OpenHarmony runtime beside the
platform-neutral root; the npm package has no Harmony files.
