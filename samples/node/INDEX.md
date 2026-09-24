# Node Samples

Runnable Node samples. This directory is its own npm project: the samples import
`@alicloud/oss-v2` by name, declared as a version dependency, so install it here:

    cd samples/node
    npm install

**Installing from source:** pack this repository's build and install the tarball here:

    npm pack                                          # in the repo root
    npm install --no-save ../../alicloud-oss-v2-*.tgz

## Directory structure

| Directory | Description |
|---|---|
| [api/](api/INDEX.md) | One sample per API operation |
| [scenario/](scenario/INDEX.md) | Cross-cutting tasks: presigning, STS credentials, cancellation |
| `SampleConfig.mjs` | The client setup and error reporter every sample shares; not a sample itself |

## Run

Set the environment, then run one:

    export OSS_REGION=cn-hangzhou
    export OSS_ACCESS_KEY_ID=...
    export OSS_ACCESS_KEY_SECRET=...
    export OSS_BUCKET=my-bucket
    # optional; derived from OSS_REGION when unset
    # export OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com

    node api/PutObject.mjs sample/hello.txt

Use a RAM user with only the permissions the sample needs, never the account AccessKey.

Every sample exits non-zero on failure. When the service reported the failure it prints the
operation, error code, message, request id, status code and EC. Otherwise there is no request id to
quote, so it prints the error on its own — all the evidence there is. It may come from the SDK's own
checks, from the network, or from a reply that arrived but would not parse.
