# Scenario Samples

Tasks that cut across operations rather than exercising a single API.

| Use case | File | Argument |
|---|---|---|
| Presign a GET URL that needs no SDK or credentials to fetch | [PresignUrl.mjs](PresignUrl.mjs) | object key (default `sample/hello.txt`) |
| Sign with STS credentials from a custom provider | [StsCredentials.mjs](StsCredentials.mjs) | object key (default `sample/hello.txt`) |
| Cancel an in-flight request with an AbortSignal | [Cancellation.mjs](Cancellation.mjs) | object key (default `sample/hello.txt`) |

`StsCredentials.mjs` reads its own `OSS_STS_ACCESS_KEY_ID`, `OSS_STS_ACCESS_KEY_SECRET` and
`OSS_STS_SECURITY_TOKEN` rather than the long-lived AccessKey the other samples use, and builds its
own client to show the custom provider — so it does not go through `../SampleConfig.mjs`.
