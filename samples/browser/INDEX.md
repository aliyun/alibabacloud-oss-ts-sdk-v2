# Browser Samples

The same API calls as the node samples, in a page served by [Vite](https://vitejs.dev). The client
code is identical to node's — `new oss.Client({ region, credentialsProvider })`. One thing differs,
forced by the platform: a browser must never carry a long-lived AccessKey, so every sample signs with
STS credentials fetched from your own backend. `server/sts.mjs` is a stand-in for that backend.

## Directory structure

| Path | Description |
|---|---|
| [src/api/](src/api/INDEX.md) | One sample per API operation |
| [src/scenario/](src/scenario/INDEX.md) | Cross-cutting tasks: presigning, STS credentials, cancellation |
| `src/SampleConfig.js` | The client setup and error reporter every sample shares; not a sample itself |
| `src/config.js` | Region, bucket, endpoint and the STS backend URL — the browser's stand-in for env vars |
| `src/main.js` | The harness that wires one button per sample; not a sample itself |
| `server/sts.mjs` | A local stand-in for the STS backend a real app must run |

## Run

This directory is its own npm project: it depends on `@alicloud/oss-v2` by version, so install here:

    cd samples/browser
    npm install

**Installing from source:** pack this repository's build and install the tarball here:

    npm pack                                          # in the repo root
    npm install --no-save ../../alicloud-oss-v2-*.tgz

Fill in your account details in `src/config.js`. Then start the STS stand-in: it signs in as a RAM
user (a sub-account) and assumes a RAM role to mint the short-lived credentials the page signs with,
so the RAM user's long-lived key stays on the server and never reaches the browser. Give it the RAM
user's key and the role to assume, then start Vite:

    export OSS_RAM_ACCESS_KEY_ID=...        # the RAM user's AccessKey, kept server-side
    export OSS_RAM_ACCESS_KEY_SECRET=...
    export OSS_STS_ROLE_ARN=acs:ram::<account-id>:role/<role-name>
    # optional; defaults to oss-browser-sample
    # export OSS_STS_ROLE_SESSION_NAME=oss-browser-sample
    npm run sts            # assumes the role and serves credentials at http://localhost:9000/sts

    npm run dev            # in another shell; opens the page

The RAM user needs permission to assume the role (`sts:AssumeRole`), and the role needs the OSS
permissions the samples exercise.

Click a sample to run it; its output and any error appears in the box. A failure the service reported
prints the operation, code, message, request id, status code and EC, the same as node.
