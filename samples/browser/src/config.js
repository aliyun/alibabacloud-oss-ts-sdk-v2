// The browser analogue of the node samples' environment variables. A browser has no `process.env`
// to read them from, so fill these in for your own account before serving the page.
export const region = 'cn-hangzhou'
export const bucket = 'my-bucket'
// Optional; the SDK derives it from the region when this is left empty.
export const endpoint = ''
// Your own backend that hands back short-lived STS credentials as JSON. A browser must never carry a
// long-lived AccessKey. The bundled server/sts.mjs is a stand-in for local testing only.
export const stsEndpoint = 'http://localhost:9000/sts'
