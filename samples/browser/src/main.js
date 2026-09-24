// The harness, not a sample: it wires one button per sample to the page. Every sample is a module
// exporting `run(log, arg)`; read the sample files themselves for how each call is made.
import { run as PutObject } from './api/PutObject.js'
import { run as GetObject } from './api/GetObject.js'
import { run as HeadObject } from './api/HeadObject.js'
import { run as DeleteObject } from './api/DeleteObject.js'
import { run as ListObjectsV2 } from './api/ListObjectsV2.js'
import { run as PutBucket } from './api/PutBucket.js'
import { run as DeleteBucket } from './api/DeleteBucket.js'
import { run as PresignUrl } from './scenario/PresignUrl.js'
import { run as StsCredentials } from './scenario/StsCredentials.js'
import { run as Cancellation } from './scenario/Cancellation.js'

const samples = {
  api: [
    ['PutObject', PutObject],
    ['GetObject', GetObject],
    ['HeadObject', HeadObject],
    ['DeleteObject', DeleteObject],
    ['ListObjectsV2', ListObjectsV2],
    ['PutBucket', PutBucket],
    ['DeleteBucket', DeleteBucket],
  ],
  scenario: [
    ['PresignUrl', PresignUrl],
    ['StsCredentials', StsCredentials],
    ['Cancellation', Cancellation],
  ],
}

const output = document.querySelector('#output')
const keyInput = document.querySelector('#key')
const log = (line) => {
  output.textContent += line + '\n'
}

for (const [group, entries] of Object.entries(samples)) {
  const section = document.querySelector('#' + group)
  for (const [name, run] of entries) {
    const button = document.createElement('button')
    button.textContent = name
    button.addEventListener('click', async () => {
      output.textContent = ''
      log('> ' + name + ' ' + keyInput.value)
      await run(log, keyInput.value)
    })
    section.append(button)
  }
}
