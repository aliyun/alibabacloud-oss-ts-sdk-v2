# OpenHarmony (ArkTS) Samples

Samples for a device or emulator. This directory is its own DevEco project: the samples import
`@alicloud/oss-v2` by name, declared as a version dependency in
[entry/oh-package.json5](entry/oh-package.json5), so install it there:

    cd samples/harmony/entry
    ohpm install

**Installing from source:** build this repository's har and install it here:

    npm install                                             # in the repo root
    npm run build:har                                       # in the repo root
    ohpm install --no-save ../../../alicloud-oss-v2-*.har   # in samples/harmony/entry

The client code reads like node's — `new Client({ region, credentialsProvider })` — and the API calls
are the same. Two things differ from node, both forced by the platform:

- **Credentials.** A device must never carry a long-lived AccessKey, so every sample signs with STS
  credentials your own backend hands out.
  [entry/src/main/ets/SampleConfig.ets](entry/src/main/ets/SampleConfig.ets) holds them as constants
  you fill in; the refetching provider is in
  [entry/src/main/ets/scenario/StsCredentials.ets](entry/src/main/ets/scenario/StsCredentials.ets).
- **No runner.** There is no CLI here. Each sample exports `run(arg)`; call it from an ability or a
  button's `onClick` in your own code.

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
