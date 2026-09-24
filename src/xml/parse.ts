/** One element: its name, its concatenated text, and its child elements. */
export interface XmlNode {
  name: string
  text: string
  children: XmlNode[]
}

const UNESCAPED_AMPERSAND = 'xml: unescaped & in text, which has to be written &amp;'

function isNameChar(c: string): boolean {
  return (
    (c >= '0' && c <= '9') ||
    (c >= 'a' && c <= 'z') ||
    (c >= 'A' && c <= 'Z') ||
    c === '_' ||
    c === '-' ||
    c === '.' ||
    c === ':'
  )
}

function isEntityName(entity: string): boolean {
  const first = entity.charAt(0)
  const start = (first >= 'a' && first <= 'z') || (first >= 'A' && first <= 'Z') || first === '_' || first === ':'
  if (!start) return false
  for (const c of entity) {
    if (!isNameChar(c)) return false
  }
  return true
}

function quoteRef(entity: string): string {
  return '&' + (entity.length > 24 ? entity.substring(0, 24) + '...' : entity) + ';'
}

function fromCharRef(entity: string): string {
  const hex = entity.charAt(1) === 'x'
  const digits = entity.substring(hex ? 2 : 1)
  let valid = digits.length > 0
  for (const c of digits) {
    if (!((c >= '0' && c <= '9') || (hex && ((c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))))) valid = false
  }
  if (!valid) throw new Error('xml: invalid character reference ' + quoteRef(entity))
  const code = parseInt(digits, hex ? 16 : 10)
  if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    throw new Error('xml: character reference out of range ' + quoteRef(entity))
  }
  return String.fromCodePoint(code)
}

function decodeEntities(input: string): string {
  if (input.indexOf('&') < 0) return input
  let out = ''
  let i = 0
  while (i < input.length) {
    if (input[i] !== '&') {
      out += input[i]
      i += 1
      continue
    }
    let end = -1
    for (let j = i + 1; j < input.length; j += 1) {
      const c = input[j]
      if (c === ';') {
        end = j
        break
      }
      if (!isNameChar(c) && c !== '#') break
    }
    if (end < 0) throw new Error(UNESCAPED_AMPERSAND)
    const entity = input.substring(i + 1, end)
    if (entity === 'amp') out += '&'
    else if (entity === 'lt') out += '<'
    else if (entity === 'gt') out += '>'
    else if (entity === 'quot') out += '"'
    else if (entity === 'apos') out += "'"
    else if (entity.charAt(0) === '#') out += fromCharRef(entity)
    else if (!isEntityName(entity)) throw new Error(UNESCAPED_AMPERSAND)
    i = end + 1
  }
  return out
}

function tagName(source: string): string {
  let end = 0
  while (end < source.length) {
    const c = source[end]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') break
    end += 1
  }
  return source.substring(0, end)
}

/**
 * Parses the XML subset OSS returns: elements, text, CDATA, comments, entities. Attributes are
 * skipped, namespaces are not resolved, and a `>` inside an attribute value is not supported.
 */
export function parseXml(raw: string): XmlNode {
  const input = raw.indexOf('\r') < 0 ? raw : raw.replace(/\r\n?/g, '\n')
  const root: XmlNode = { name: '', text: '', children: [] }
  const stack: XmlNode[] = [root]
  let i = 0
  while (i < input.length) {
    const lt = input.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) {
      stack[stack.length - 1].text += decodeEntities(input.substring(i, lt))
    }
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4)
      if (end < 0) throw new Error('xml: unclosed comment')
      i = end + 3
      continue
    }
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt)
      if (end < 0) throw new Error('xml: unclosed CDATA section')
      stack[stack.length - 1].text += input.substring(lt + 9, end)
      i = end + 3
      continue
    }
    if (input.startsWith('<?', lt)) {
      const end = input.indexOf('?>', lt + 2)
      if (end < 0) throw new Error('xml: unclosed processing instruction')
      i = end + 2
      continue
    }
    if (input.startsWith('<!', lt)) {
      const end = input.indexOf('>', lt)
      if (end < 0) throw new Error('xml: unclosed declaration')
      i = end + 1
      continue
    }
    const gt = input.indexOf('>', lt)
    if (gt < 0) throw new Error('xml: unclosed tag')
    const inner = input.substring(lt + 1, gt)
    if (inner.startsWith('/')) {
      const name = inner.substring(1).trim()
      const open = stack.length > 1 ? stack.pop() : undefined
      if (open === undefined || open.name !== name) {
        throw new Error('xml: mismatched closing tag ' + name)
      }
      i = gt + 1
      continue
    }
    const selfClosing = inner.endsWith('/')
    const node: XmlNode = {
      name: tagName(selfClosing ? inner.substring(0, inner.length - 1) : inner),
      text: '',
      children: [],
    }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
    i = gt + 1
  }
  if (stack.length !== 1) throw new Error('xml: unclosed element ' + stack[stack.length - 1].name)
  if (root.children.length === 0) throw new Error('xml: no root element')
  return root.children[0]
}

/** The first child with that name, or undefined. */
export function childOf(node: XmlNode, name: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.name === name) return child
  }
  return undefined
}

/** Every child with that name, in document order. */
export function childrenOf(node: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = []
  for (const child of node.children) {
    if (child.name === name) out.push(child)
  }
  return out
}

/** Trimmed text of the named child, or undefined when the child is absent. */
export function textOf(node: XmlNode, name: string): string | undefined {
  const child = childOf(node, name)
  if (child === undefined) return undefined
  return child.text.trim()
}
