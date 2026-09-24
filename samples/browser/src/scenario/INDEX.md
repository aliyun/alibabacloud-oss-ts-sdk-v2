# Scenario Samples

Tasks that cut across operations rather than exercising a single API. Each exports `run(log, arg)`
and is wired to a button by the harness in [../main.js](../main.js).

| Use case | File | Argument |
|---|---|---|
| Presign a GET URL that needs no SDK or credentials to fetch | [PresignUrl.js](PresignUrl.js) | object key (default `sample/hello.txt`) |
| Sign with STS credentials from a custom provider | [StsCredentials.js](StsCredentials.js) | object key (default `sample/hello.txt`) |
| Cancel an in-flight request with an AbortSignal | [Cancellation.js](Cancellation.js) | object key (default `sample/hello.txt`) |

`StsCredentials.js` builds its own client with an inline provider to show the shape
[../SampleConfig.js](../SampleConfig.js) hides — the plain `{ getCredentials }` object that structural
typing lets you pass where a `CredentialsProvider` is expected. In the browser this is not an
alternative but the only safe credential path.
