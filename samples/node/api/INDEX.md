# API Samples

One sample per API operation. Each takes the client setup and error reporter from
[../SampleConfig.mjs](../SampleConfig.mjs) and reads its bucket and credentials from the environment
described in [../INDEX.md](../INDEX.md).

## Object operations

| Use case | File | Argument |
|---|---|---|
| Upload a string as an object | [PutObject.mjs](PutObject.mjs) | object key (default `sample/hello.txt`) |
| Download an object and read its body | [GetObject.mjs](GetObject.mjs) | object key (default `sample/hello.txt`) |
| Read an object's metadata only | [HeadObject.mjs](HeadObject.mjs) | object key (default `sample/hello.txt`) |
| Read a small fixed set of object metadata | [GetObjectMeta.mjs](GetObjectMeta.mjs) | object key (default `sample/hello.txt`) |
| Delete an object | [DeleteObject.mjs](DeleteObject.mjs) | object key (default `sample/hello.txt`) |
| Copy an object to another key | [CopyObject.mjs](CopyObject.mjs) | source key, dest key (defaults `sample/hello.txt`, `sample/hello-copy.txt`) |
| Append data to an appendable object | [AppendObject.mjs](AppendObject.mjs) | object key (default `sample/appendable.txt`) |
| Delete several objects at once | [DeleteMultipleObjects.mjs](DeleteMultipleObjects.mjs) | object keys (variadic; default `sample/a.txt sample/b.txt`) |
| Restore an Archive object | [RestoreObject.mjs](RestoreObject.mjs) | object key (default `sample/archived.dat`) |
| Discard a restored object's readable copy | [CleanRestoredObject.mjs](CleanRestoredObject.mjs) | object key (default `sample/archived.dat`) |
| List objects under a prefix | [ListObjectsV2.mjs](ListObjectsV2.mjs) | key prefix (default `sample/`; pass `""` for every key) |
| List objects under a prefix, V1 style | [ListObjects.mjs](ListObjects.mjs) | key prefix (default `sample/`; pass `""` for every key) |

`PutObject` overwrites the key if it already exists and leaves it behind; `DeleteObject` on the same
default key is the cleanup. Because that default is shared, two people touring one bucket at once
overwrite and delete each other's object — pass your own key to keep out of the way.

## Multipart upload

| Use case | File | Argument |
|---|---|---|
| Start a multipart upload and get its upload id | [InitiateMultipartUpload.mjs](InitiateMultipartUpload.mjs) | object key (default `sample/multipart.bin`) |
| Upload one part | [UploadPart.mjs](UploadPart.mjs) | object key (default `sample/multipart.bin`) |
| Upload one part by copying from an existing object | [UploadPartCopy.mjs](UploadPartCopy.mjs) | source key, dest key (defaults `sample/source.bin`, `sample/copied-multipart.bin`) |
| Assemble the parts into the final object | [CompleteMultipartUpload.mjs](CompleteMultipartUpload.mjs) | object key (default `sample/multipart.bin`) |
| Cancel an in-progress upload | [AbortMultipartUpload.mjs](AbortMultipartUpload.mjs) | object key (default `sample/multipart.bin`) |
| List in-progress multipart uploads | [ListMultipartUploads.mjs](ListMultipartUploads.mjs) | object key (default `sample/multipart.bin`) |
| List the parts uploaded so far | [ListParts.mjs](ListParts.mjs) | object key (default `sample/multipart.bin`) |

Each of these runs a small self-contained flow: the ones that need an upload id start one, and the
ones that leave nothing to complete abort it, so a tour leaves no in-progress upload behind.

## Object ACL, tagging, and symbolic links

| Use case | File | Argument |
|---|---|---|
| Set an object's ACL | [PutObjectAcl.mjs](PutObjectAcl.mjs) | object key, acl (defaults `sample/hello.txt`, `private`) |
| Read an object's ACL | [GetObjectAcl.mjs](GetObjectAcl.mjs) | object key (default `sample/hello.txt`) |
| Attach tags to an object | [PutObjectTagging.mjs](PutObjectTagging.mjs) | object key (default `sample/hello.txt`) |
| Read an object's tags | [GetObjectTagging.mjs](GetObjectTagging.mjs) | object key (default `sample/hello.txt`) |
| Remove an object's tags | [DeleteObjectTagging.mjs](DeleteObjectTagging.mjs) | object key (default `sample/hello.txt`) |
| Create a symbolic link | [PutSymlink.mjs](PutSymlink.mjs) | link key, target key (defaults `sample/link.txt`, `sample/target.txt`) |
| Read a symbolic link's target | [GetSymlink.mjs](GetSymlink.mjs) | link key, target key (defaults `sample/link.txt`, `sample/target.txt`) |

Each puts the object (or the symlink target) it needs first, so it runs against a fresh bucket.
`PutObjectAcl` leaves the object at `private`; pass your own key to keep out of a shared tour.

## Object processing

| Use case | File | Argument |
|---|---|---|
| Resize an image and save the result as a new object | [ProcessObject.mjs](ProcessObject.mjs) | source key, target key (defaults `sample/image.jpg`, `sample/image-100w.jpg`) |
| Submit an async media conversion task | [AsyncProcessObject.mjs](AsyncProcessObject.mjs) | source key, target key (defaults `sample/video.mp4`, `sample/video-converted.mp4`) |

Both read an object that already exists at the source key: `ProcessObject` needs an image, and
`AsyncProcessObject` a media file whose bucket is enrolled in the data processing service.

## Bucket operations

| Use case | File | Argument |
|---|---|---|
| Create a bucket | [PutBucket.mjs](PutBucket.mjs) | bucket name (default `OSS_BUCKET`) |
| Delete an empty bucket | [DeleteBucket.mjs](DeleteBucket.mjs) | bucket name (default `OSS_BUCKET`) |
| Read a bucket's configuration | [GetBucketInfo.mjs](GetBucketInfo.mjs) | none |
| Read the region a bucket lives in | [GetBucketLocation.mjs](GetBucketLocation.mjs) | none |
| Read a bucket's storage usage and object counts | [GetBucketStat.mjs](GetBucketStat.mjs) | none |
| Read a bucket's ACL and owner | [GetBucketAcl.mjs](GetBucketAcl.mjs) | none |
| Set a bucket's ACL | [PutBucketAcl.mjs](PutBucketAcl.mjs) | acl (default `private`) |
| Read a bucket's versioning state | [GetBucketVersioning.mjs](GetBucketVersioning.mjs) | none |
| Set a bucket's versioning state | [PutBucketVersioning.mjs](PutBucketVersioning.mjs) | status (default `Enabled`) |
| List object versions and delete markers | [ListObjectVersions.mjs](ListObjectVersions.mjs) | key prefix (default `sample/`) |
| Read a bucket's Referer configuration | [GetBucketReferer.mjs](GetBucketReferer.mjs) | none |
| Set a bucket's Referer whitelist | [PutBucketReferer.mjs](PutBucketReferer.mjs) | referer URLs (variadic) |

`PutBucket` and `DeleteBucket` change the bucket, so pass a fresh name rather than reusing
`OSS_BUCKET`: `PutBucket` fails if the name is already taken, and `DeleteBucket` fails unless the
bucket is empty. The three read-only `GetBucket*` samples run against `OSS_BUCKET` as they are.

## Service operations

| Use case | File | Argument |
|---|---|---|
| List every bucket the credentials own | [ListBuckets.mjs](ListBuckets.mjs) | none |
| List the OSS regions and their endpoints | [DescribeRegions.mjs](DescribeRegions.mjs) | region id (optional; default lists all) |

These are service-level calls that address the account, not a bucket, so they ignore `OSS_BUCKET`.
