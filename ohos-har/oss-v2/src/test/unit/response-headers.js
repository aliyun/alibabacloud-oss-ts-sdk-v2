export function successHeaders() {
  return {
    'content-length': '5',
    'content-type': 'text/plain',
    etag: 'etag-value',
    'last-modified': 'Mon, 01 Jun 2026 00:00:00 GMT',
    'x-oss-request-id': 'request-id'
  }
}

export function okHeaders() {
  return {
    'x-oss-request-id': 'req-ok'
  }
}

export function putObjectHeaders() {
  return {
    'x-oss-request-id': 'req-put',
    etag: 'etag-put',
    'x-oss-version-id': 'version-put'
  }
}

export function headObjectHeaders() {
  return {
    'content-length': '11',
    'content-type': 'text/plain',
    etag: 'etag-head',
    'last-modified': 'Mon, 01 Jun 2026 00:00:00 GMT',
    'x-oss-version-id': 'version-head',
    'x-oss-request-id': 'req-head'
  }
}

export function deleteObjectHeaders() {
  return {
    'x-oss-request-id': 'req-del',
    'x-oss-version-id': 'version-del',
    'x-oss-delete-marker': 'true'
  }
}

export function serverErrorHeaders() {
  return {
    'content-type': 'text/plain',
    'x-oss-request-id': 'req-err'
  }
}
