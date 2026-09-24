# Samples

Samples organised by platform. The API calls are identical across all three — the same request
objects, the same results. What differs is only what each platform forces: how the SDK is consumed,
how credentials are obtained, and how a sample is run.

## Platforms

| Platform | Directory | Language | How to run |
|---|---|---|---|
| Node | [node/](node/INDEX.md) | `.mjs` | `cd samples/node`, `npm install`, then `node api/PutObject.mjs` |
| Browser | [browser/](browser/INDEX.md) | `.js` under [Vite](https://vitejs.dev) | `cd samples/browser`, `npm install`, then `npm run dev` |
| OpenHarmony | [harmony/](harmony/INDEX.md) | ArkTS `.ets` | `cd samples/harmony/entry`, `ohpm install`, then run the project in DevEco Studio and call a sample's `run` |

Each directory has the same shape: a `SampleConfig` every sample shares, an `api/` directory with one
sample per operation, and a `scenario/` directory for cross-cutting tasks (presigning, STS
credentials, cancellation) — inside `entry/src/main/ets/` on OpenHarmony. Read the per-platform
`INDEX.md` for its setup.

Node signs with an AccessKey from the environment; a browser or a device must not carry one and signs
with STS credentials from your own backend instead.
