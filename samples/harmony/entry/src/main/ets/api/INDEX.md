# API Samples

One sample per API operation. Each exports `run(arg)` and takes the client setup and error
reporter from [../SampleConfig.ets](../SampleConfig.ets); fill in your account details there first,
as described in [../../../INDEX.md](../../../INDEX.md).

## Object operations

| Use case | File | Argument |
|---|---|---|
| Upload a string as an object | [PutObject.ets](PutObject.ets) | object key (default `sample/hello.txt`) |
| Download an object and read its body | [GetObject.ets](GetObject.ets) | object key (default `sample/hello.txt`) |
| Read an object's metadata only | [HeadObject.ets](HeadObject.ets) | object key (default `sample/hello.txt`) |
| Delete an object | [DeleteObject.ets](DeleteObject.ets) | object key (default `sample/hello.txt`) |
| List objects under a prefix | [ListObjectsV2.ets](ListObjectsV2.ets) | key prefix (default `sample/`; pass `""` for every key) |

`PutObject` overwrites the key if it already exists and leaves it behind; `DeleteObject` on the same
default key is the cleanup. Pass your own key to keep out of the way of anyone else touring the
bucket. `GetObject` buffers the whole body in memory (capped at 100 MiB here), so fetch a large
object with a ranged request instead.

## Bucket operations

| Use case | File | Argument |
|---|---|---|
| Create a bucket | [PutBucket.ets](PutBucket.ets) | bucket name (default: the working bucket) |
| Delete an empty bucket | [DeleteBucket.ets](DeleteBucket.ets) | bucket name (default: the working bucket) |

Pass a fresh bucket name rather than reusing the working one: `PutBucket` fails if the name is
already taken, and `DeleteBucket` fails unless the bucket is empty.
