import type { XmlNode } from './parse.js'

/** Escapes the five predefined entities, and a carriage return. */
function escapeXmlText(value: string): string {
  let out = ''
  for (const c of value) {
    if (c === '&') out += '&amp;'
    else if (c === '<') out += '&lt;'
    else if (c === '>') out += '&gt;'
    else if (c === '"') out += '&quot;'
    else if (c === "'") out += '&apos;'
    else if (c === '\r') out += '&#x0D;'
    else out += c
  }
  return out
}

/**
 * Escapes an object key for an XML request body. C0 controls become numeric references and invalid
 * XML 1.0 code points become the replacement character.
 */
export function escapeXmlKey(value: string): string {
  let out = ''
  for (const c of value) {
    const cp = c.codePointAt(0) as number
    if (c === '&') out += '&amp;'
    else if (c === '<') out += '&lt;'
    else if (c === '>') out += '&gt;'
    else if (c === '"') out += '&quot;'
    else if (c === "'") out += '&apos;'
    else if (cp < 0x20) out += '&#x' + cp.toString(16).toUpperCase().padStart(2, '0') + ';'
    else if ((cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || cp >= 0x10000) out += c
    else out += String.fromCharCode(0xfffd)
  }
  return out
}

function writeNode(node: XmlNode): string {
  if (node.children.length > 0) {
    let inner = ''
    for (const child of node.children) inner += writeNode(child)
    return '<' + node.name + '>' + inner + '</' + node.name + '>'
  }
  if (node.text.length === 0) return '<' + node.name + '/>'
  return '<' + node.name + '>' + escapeXmlText(node.text) + '</' + node.name + '>'
}

/** Serialises the tree with an XML declaration in front, as OSS request bodies carry. */
export function buildXml(root: XmlNode): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' + writeNode(root)
}
