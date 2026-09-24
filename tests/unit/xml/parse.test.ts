import { describe, expect, it } from 'vitest'
import { childOf, childrenOf, parseXml, textOf } from '../../../src/xml/parse.js'

describe('parseXml', () => {
  it('parses an OSS error body', () => {
    const root = parseXml(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Error>\n' +
        '  <Code>NoSuchKey</Code>\n' +
        '  <Message>The specified key does not exist.</Message>\n' +
        '  <RequestId>65F3F4A1B2C3D4E5F6A7B8C9</RequestId>\n' +
        '  <EC>0026-00000001</EC>\n' +
        '</Error>',
    )
    expect(root.name).toBe('Error')
    expect(textOf(root, 'Code')).toBe('NoSuchKey')
    expect(textOf(root, 'Message')).toBe('The specified key does not exist.')
    expect(textOf(root, 'RequestId')).toBe('65F3F4A1B2C3D4E5F6A7B8C9')
    expect(textOf(root, 'EC')).toBe('0026-00000001')
  })

  it('returns undefined for a missing child', () => {
    expect(textOf(parseXml('<Error><Code>x</Code></Error>'), 'Message')).toBeUndefined()
  })

  it('collects repeated children in document order', () => {
    const root = parseXml('<List><Item>a</Item><Item>b</Item><Other>c</Other><Item>d</Item></List>')
    expect(childrenOf(root, 'Item').map((n) => n.text.trim())).toEqual(['a', 'b', 'd'])
  })

  it('parses nested structures', () => {
    const root = parseXml('<A><B><C>deep</C></B></A>')
    const b = childOf(root, 'B')
    expect(b).toBeDefined()
    expect(textOf(b!, 'C')).toBe('deep')
  })

  it('handles self-closing and empty elements', () => {
    const root = parseXml('<A><B/><C></C></A>')
    expect(childrenOf(root, 'B').length).toBe(1)
    expect(textOf(root, 'C')).toBe('')
  })

  it('collects a run of empty siblings, both spellings', () => {
    const tags = childrenOf(parseXml('<Tagging><Tag/><Tag></Tag><Tag/></Tagging>'), 'Tag')
    expect(tags.map((n) => n.text)).toEqual(['', '', ''])
  })

  it('ignores attributes', () => {
    expect(parseXml('<A x="1" y="two">t</A>').text).toBe('t')
  })

  // OSS puts `xmlns` on the root and callers match by name, so the name ends at the first whitespace.
  it('reads the name of a root carrying a namespace declaration', () => {
    const ns = ' xmlns="http://doc.oss-cn-hangzhou.aliyuncs.com"'
    expect(parseXml('<VersioningConfiguration' + ns + '/>').name).toBe('VersioningConfiguration')
    expect(parseXml('<VersioningConfiguration' + ns + ' />').name).toBe('VersioningConfiguration')
    const root = parseXml('<ListBucketResult' + ns + '><Name>b</Name></ListBucketResult>')
    expect(root.name).toBe('ListBucketResult')
    expect(textOf(root, 'Name')).toBe('b')
  })

  // A prefix is part of the name here, nothing resolves it. `:` is in NameChar for exactly this.
  it('keeps a namespace prefix in the name', () => {
    const root = parseXml('<oss:A xmlns:oss="http://doc.oss-cn-hangzhou.aliyuncs.com"><oss:B>v</oss:B></oss:A>')
    expect(root.name).toBe('oss:A')
    expect(textOf(root, 'oss:B')).toBe('v')
  })

  // An object key may carry runs of spaces, so the node holds what the wire said and only the accessor trims.
  it('keeps spaces inside text, trimming only at the edges', () => {
    const root = parseXml('<A><B> s p a c e d </B></A>')
    expect(childOf(root, 'B')?.text).toBe(' s p a c e d ')
    expect(textOf(root, 'B')).toBe('s p a c e d')
  })

  it('keeps literal astral and multi-script text intact', () => {
    expect(textOf(parseXml('<A><B>\u{1F600} 中文 Ж ع &amp; ok</B></A>'), 'B')).toBe('\u{1F600} 中文 Ж ع & ok')
  })

  it('decodes entities', () => {
    expect(textOf(parseXml('<A><B>a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65; &#x42;</B></A>'), 'B'))
      .toBe('a & b <c> "d" \'e\' A B')
  })

  it('decodes numeric references at both ends of the valid range', () => {
    expect(parseXml('<A>&#0;</A>').text).toBe('\u{0}')
    expect(parseXml('<A>&#x1F600;</A>').text).toBe('\u{1F600}')
    expect(parseXml('<A>&#x10FFFF;</A>').text).toBe('\u{10FFFF}')
  })

  // No declaration is ever read, so an undeclared entity resolves to nothing rather than staying as text.
  it('resolves an undeclared entity to nothing', () => {
    expect(parseXml('<A>&foo;</A>').text).toBe('')
    expect(parseXml('<A>x&foo;y</A>').text).toBe('xy')
    expect(parseXml('<A>&' + 'a'.repeat(40) + ';</A>').text).toBe('')
    expect(parseXml('<A>&my-entity.v2;</A>').text).toBe('')
  })

  it('rejects an ampersand that starts no reference', () => {
    for (const bad of ['a & b', 'a &amp b', '&', '&;', '&-foo;']) {
      expect(() => parseXml('<A>' + bad + '</A>'), bad).toThrow(/xml: unescaped &/)
    }
  })

  it('rejects a malformed numeric reference', () => {
    for (const bad of ['&#xZZ;', '&#x;', '&#;', '&#abc;', '&#-1;', '&#x1F600x;']) {
      expect(() => parseXml('<A>' + bad + '</A>'), bad).toThrow(/xml: invalid character reference/)
    }
  })

  // Only what no UTF-8 encoder can carry is rejected: past U+10FFFF and a lone surrogate. `&#0;` stays.
  it('rejects a numeric reference outside the encodable range', () => {
    for (const bad of ['&#x110000;', '&#1114112;', '&#xD800;', '&#xDFFF;', '&#55296;']) {
      expect(() => parseXml('<A>' + bad + '</A>'), bad).toThrow(/xml: character reference out of range/)
    }
  })

  // Enough digits to overflow to Infinity, a separate arm of the range comparison from a finite over-ceiling value.
  it('rejects a numeric reference whose digits overflow', () => {
    expect(() => parseXml('<A>&#xFFFFFFFF;</A>')).toThrow(/xml: character reference out of range/)
    expect(() => parseXml('<A>&#x' + 'F'.repeat(300) + ';</A>')).toThrow(/xml: character reference out of range/)
    expect(() => parseXml('<A>&#' + '9'.repeat(300) + ';</A>')).toThrow(/xml: character reference out of range/)
  })

  // Only a lowercase `x` introduces a hex reference; `X` is not XML and must not be invented.
  it('rejects a hex reference spelled with a capital X', () => {
    expect(() => parseXml('<A>&#X41;</A>')).toThrow(/xml: invalid character reference/)
  })

  // Decoding runs once, so a reference's output is never rescanned; a second pass would turn this into `A`.
  it('does not decode the output of a reference', () => {
    expect(parseXml('<A>&#38;#65;</A>').text).toBe('&#65;')
    expect(parseXml('<A>&amp;lt;</A>').text).toBe('&lt;')
  })

  it('resolves a reference next to one that resolves to nothing', () => {
    expect(parseXml('<A>&amp;&foo;</A>').text).toBe('&')
    expect(parseXml('<A>&#65;&foo;&bar;</A>').text).toBe('A')
    expect(() => parseXml('<A>&amp; & b</A>')).toThrow(/xml: unescaped &/)
  })

  // The defence against expansion bombs is that a doctype declares nothing, so every reference resolves to nothing.
  it('expands no nested entity a doctype declares', () => {
    let subset = '<!ENTITY a "aaa">'
    for (let level = 1; level <= 9; level += 1) {
      const inner = '&a' + (level === 1 ? '' : String(level - 1)) + ';'
      subset += '<!ENTITY a' + String(level) + ' "' + inner.repeat(10) + '">'
    }
    expect(textOf(parseXml('<!DOCTYPE Error [' + subset + ']><Error><Code>&a9;</Code></Error>'), 'Code')).toBe('')
  })

  it('expands no entity referenced many times', () => {
    const subset = '<!ENTITY big "' + 'x'.repeat(50000) + '">'
    const root = parseXml('<!DOCTYPE Error [' + subset + ']><Error><Code>' + '&big;'.repeat(100) + '</Code></Error>')
    expect(textOf(root, 'Code')).toBe('')
  })

  it('resolves no external entity', () => {
    const subset = '<!ENTITY xxe SYSTEM "file:///etc/passwd">'
    const root = parseXml('<!DOCTYPE Error [' + subset + ']><Error><Message>&xxe;</Message></Error>')
    expect(textOf(root, 'Message')).toBe('')
  })

  it('decodes a body of many references in linear time', () => {
    const started = Date.now()
    expect(parseXml('<A>' + '&amp;'.repeat(250000) + '</A>').text).toBe('&'.repeat(250000))
    expect(() => parseXml('<A>' + '&amp'.repeat(250000) + '</A>')).toThrow(/xml: unescaped &/)
    expect(Date.now() - started).toBeLessThan(2000)
  })

  // Normalization runs on raw input before decoding, so `&#x0D;` survives as CR while a literal one does not.
  it('normalizes line ends, sparing a carriage-return reference', () => {
    expect(textOf(parseXml('<A><B>a\r\nb</B></A>'), 'B')).toBe('a\nb')
    expect(textOf(parseXml('<A><B>a\rb</B></A>'), 'B')).toBe('a\nb')
    expect(textOf(parseXml('<A><B>a&#x0D;\nb</B></A>'), 'B')).toBe('a\r\nb')
  })

  it('treats a line feed before a carriage return as two line ends', () => {
    expect(textOf(parseXml('<A><B>a\n\rb</B></A>'), 'B')).toBe('a\n\nb')
  })

  it('keeps CDATA verbatim', () => {
    expect(textOf(parseXml('<A><B><![CDATA[<not a tag> & raw]]></B></A>'), 'B')).toBe('<not a tag> & raw')
  })

  it('normalizes line ends inside CDATA too', () => {
    expect(textOf(parseXml('<A><B><![CDATA[a\r\nb]]></B></A>'), 'B')).toBe('a\nb')
  })

  it('ends CDATA at the first terminator, keeping brackets before it', () => {
    expect(textOf(parseXml('<A><B><![CDATA[]]]]></B></A>'), 'B')).toBe(']]')
  })

  it('joins text on both sides of a CDATA section', () => {
    expect(textOf(parseXml('<A><B>x<![CDATA[ & y ]]>z</B></A>'), 'B')).toBe('x & y z')
  })

  it('skips comments', () => {
    expect(textOf(parseXml('<A><!-- note --><B>v</B></A>'), 'B')).toBe('v')
  })

  it('skips a processing instruction inside an element', () => {
    expect(textOf(parseXml('<A><B>a<?target data?>b</B></A>'), 'B')).toBe('ab')
  })

  it('accepts a closing tag padded with whitespace', () => {
    expect(textOf(parseXml('<A><B>v</B ></A >'), 'B')).toBe('v')
  })

  it('keeps the whitespace surrounding a child in the parent text', () => {
    const root = parseXml('<A>\n  <B>v</B>\n</A>')
    expect(root.text).toBe('\n  \n')
    expect(textOf(root, 'B')).toBe('v')
  })

  it('throws on a closing tag that does not match the open element', () => {
    expect(() => parseXml('<A><B>x</A>')).toThrow(/mismatched closing tag/)
  })

  it('throws on an element left unclosed at end of input', () => {
    expect(() => parseXml('<A><B>x')).toThrow(/unclosed element/)
  })

  it('throws on an empty document', () => {
    expect(() => parseXml('')).toThrow(/no root element/i)
  })

  it('skips a doctype declaration', () => {
    expect(parseXml('<!DOCTYPE A><A>v</A>').text).toBe('v')
  })

  // 1000 is the max-keys ceiling, so this is one listing response at its widest.
  it('collects a full page of repeated children', () => {
    let body = ''
    for (let n = 0; n < 1000; n += 1) body += '<Contents><Key>k' + String(n) + '</Key></Contents>'
    const contents = childrenOf(parseXml('<ListBucketResult>' + body + '</ListBucketResult>'), 'Contents')
    expect(contents.length).toBe(1000)
    expect(textOf(contents[999], 'Key')).toBe('k999')
  })

  // Depth costs an array entry, not a stack frame, so a deeply nested body cannot overflow.
  it('parses a body nested thousands deep', () => {
    const depth = 5000
    let node = parseXml('<L>'.repeat(depth) + 'x' + '</L>'.repeat(depth))
    let seen = 1
    while (node.children.length > 0) {
      node = node.children[0]!
      seen += 1
    }
    expect(seen).toBe(depth)
    expect(node.text).toBe('x')
  })

  // A caller classifies a parse failure solely by the `xml:` prefix, so any input that throws something
  // else escapes classification. `</>` once crashed: its empty name matched the sentinel root.
  it('brands every malformed body with the xml: prefix', () => {
    const malformed = [
      '</>',
      '</>x<A/>',
      '<A/></>x<B/>',
      '</A>',
      '<A><!-- oops',
      '<A><![CDATA[oops',
      // A terminator may not overlap its opening delimiter, so neither is the empty form of one.
      '<A><!--></A>',
      '<A><?></A>',
      '<?xml',
      '<!DOCTYPE A',
      '<A',
      '<A><B>x',
      '<A><B>x</A>',
      '',
      'not xml at all',
      '<A>a & b</A>',
      '<A>&#xZZ;</A>',
      '<A>&#x110000;</A>',
      '<A>&#xD800;</A>',
    ]
    for (const input of malformed) {
      let thrown: unknown
      try {
        parseXml(input)
      } catch (e) {
        thrown = e
      }
      expect(thrown, 'expected ' + JSON.stringify(input) + ' to throw').toBeInstanceOf(Error)
      expect((thrown as Error).message, 'thrown for ' + JSON.stringify(input)).toMatch(/^xml: /)
    }
  })

  it('throws on a non-XML body', () => {
    expect(() => parseXml('not xml at all')).toThrow(/no root element/i)
  })
})
