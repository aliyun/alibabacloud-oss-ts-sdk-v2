# Scenario Samples

Tasks that cut across operations rather than exercising a single API. Each exports `run(arg)`.

| Use case | File | Argument |
|---|---|---|
| Presign a GET URL that needs no SDK or credentials to fetch | [PresignUrl.ets](PresignUrl.ets) | object key (default `sample/hello.txt`) |
| Sign with STS credentials from a custom provider | [StsCredentials.ets](StsCredentials.ets) | object key (default `sample/hello.txt`) |
| Cancel an in-flight request with a hand-built signal | [Cancellation.ets](Cancellation.ets) | object key (default `sample/hello.txt`) |

`StsCredentials.ets` builds its own client with a provider written as a **class**: ArkTS has no
structural typing, so where node hands a plain `{ getCredentials }` object to a `CredentialsProvider`
parameter, here you implement the interface. Point its `getCredentials` at your own AssumeRole
backend.

`Cancellation.ets` implements the `AbortSignalLike` the SDK expects itself, because OpenHarmony has
no global `AbortController`. That hand-built signal is the part worth copying on this platform.
