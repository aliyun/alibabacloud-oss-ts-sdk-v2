# API Samples

One sample per API operation. Each exports `run(log, arg)` and takes the client setup and
error reporter from [../SampleConfig.js](../SampleConfig.js); the harness in
[../main.js](../main.js) wires each to a button. Setup and credentials are described in
[../../INDEX.md](../../INDEX.md).

## Object operations

| Use case | File | Argument |
|---|---|---|
| Upload a string as an object | [PutObject.js](PutObject.js) | object key (default `sample/hello.txt`) |
| Download an object and read its body | [GetObject.js](GetObject.js) | object key (default `sample/hello.txt`) |
| Read an object's metadata only | [HeadObject.js](HeadObject.js) | object key (default `sample/hello.txt`) |
| Delete an object | [DeleteObject.js](DeleteObject.js) | object key (default `sample/hello.txt`) |
| List objects under a prefix | [ListObjectsV2.js](ListObjectsV2.js) | key prefix (default `sample/`; pass `""` for every key) |

`PutObject` overwrites the key if it already exists and leaves it behind; `DeleteObject` on the same
default key is the cleanup. Pass your own key to keep out of the way of anyone else touring the bucket.

## Bucket operations

| Use case | File | Argument |
|---|---|---|
| Create a bucket | [PutBucket.js](PutBucket.js) | bucket name (default: the working bucket) |
| Delete an empty bucket | [DeleteBucket.js](DeleteBucket.js) | bucket name (default: the working bucket) |

Pass a fresh bucket name rather than reusing the working one: `PutBucket` fails if the name is
already taken, and `DeleteBucket` fails unless the bucket is empty.
