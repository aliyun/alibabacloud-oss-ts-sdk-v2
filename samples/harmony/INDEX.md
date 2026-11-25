# OpenHarmony (ArkTS) Samples

Samples for a device or emulator. This directory is its own DevEco project. `@alicloud/oss-v2` is
not published to ohpm, so [entry/oh-package.json5](entry/oh-package.json5) depends on the har built
from this repository. Build it once, then install:

    npm install                                             # in the repo root
    npm run build:har                                       # writes alicloud-oss-v2-0.1.0-alpha.0.har
    cd samples/harmony
    ohpm install --all

The client code reads like node's — `new Client({ region, credentialsProvider })` — and the API calls
are the same. Two things differ from node, both forced by the platform:

- **Credentials.** A device must never carry a long-lived AccessKey, so every sample signs with STS
  credentials your own backend hands out.
  [entry/src/main/ets/SampleConfig.ets](entry/src/main/ets/SampleConfig.ets) holds them as constants
  you fill in; the refetching provider is in
  [entry/src/main/ets/scenario/StsCredentials.ets](entry/src/main/ets/scenario/StsCredentials.ets).
- **The home page is the runner.** [entry/src/main/ets/pages/OssConsole.ets](entry/src/main/ets/pages/OssConsole.ets)
  is an ArkUI page: type STS credentials, a bucket and a key, then call Put/Get/Head/Delete, list and
  presign. The files under `api/` and `scenario/` still export `run(arg)` if you want to call one
  operation from your own ability.

## Directory structure

| Path | Description |
|---|---|
| [entry/src/main/ets/api/](entry/src/main/ets/api/INDEX.md) | One sample per API operation |
| [entry/src/main/ets/scenario/](entry/src/main/ets/scenario/INDEX.md) | Cross-cutting tasks: presigning, STS credentials, cancellation |
| `entry/src/main/ets/SampleConfig.ets` | The client setup, account constants and error reporter every sample shares; not a sample itself |
| `entry/src/ohosTest/` | Device test: a smoke test driven through the public API |
| `AppScope/`, `build-profile.json5`, `hvigor/` | DevEco project scaffolding |

## Build and run

Open this directory in DevEco Studio, fill in `SampleConfig.ets`, then run the app on a device. From a
command line, with the HarmonyOS command-line tools on `PATH` and `DEVECO_SDK_HOME` set:

    hvigorw assembleHap --mode module -p product=default -p buildMode=debug --no-daemon

## Limitations that shape these samples

- **Bodies are buffered.** A request body must be a string or `Uint8Array`, not a stream; a response
  is buffered and capped at 100 MiB, so `GetObject` on a large object needs a ranged request.
- **No `AbortController`.** [entry/src/main/ets/scenario/Cancellation.ets](entry/src/main/ets/scenario/Cancellation.ets)
  implements the small signal the SDK needs by hand, which is the whole point of that sample here.

## Verification

Running the samples needs a device; the CI only compiles them, it does not run them.
[.github/workflows/check-sample-harmony.yml](../../.github/workflows/check-sample-harmony.yml) builds the har, installs it into
this project and compiles both the sample HAP and the test HAP.
