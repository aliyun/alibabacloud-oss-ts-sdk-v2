import { describe, expect, it } from 'vitest'
import { buildXml, escapeXmlKey } from '../../../src/xml/build.js'

describe('buildXml', () => {
  it('builds a flat document', () => {
    expect(buildXml({ name: 'A', text: 'v', children: [] }))
      .toBe('<?xml version="1.0" encoding="UTF-8"?><A>v</A>')
  })

  it('builds nested children and omits text when children exist', () => {
    expect(
      buildXml({
        name: 'Delete',
        text: '',
        children: [
          { name: 'Quiet', text: 'true', children: [] },
          { name: 'Object', text: '', children: [{ name: 'Key', text: 'a.txt', children: [] }] },
        ],
      }),
    ).toBe('<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet><Object><Key>a.txt</Key></Object></Delete>')
  })

  it('emits a self-closing tag for an empty leaf', () => {
    expect(buildXml({ name: 'A', text: '', children: [] })).toBe('<?xml version="1.0" encoding="UTF-8"?><A/>')
  })

  it('escapes text', () => {
    expect(buildXml({ name: 'A', text: 'a & b <c> "d"', children: [] }))
      .toBe('<?xml version="1.0" encoding="UTF-8"?><A>a &amp; b &lt;c&gt; &quot;d&quot;</A>')
  })

  it('leaves astral and multi-script text alone while escaping around it', () => {
    expect(buildXml({ name: 'A', text: '\u{1F600} 中文 & Ж', children: [] }))
      .toBe('<?xml version="1.0" encoding="UTF-8"?><A>\u{1F600} 中文 &amp; Ж</A>')
  })

  it('escapes a carriage return, leaving a line feed and a tab alone', () => {
    expect(buildXml({ name: 'A', text: 'a\r\nb\tc', children: [] }))
      .toBe('<?xml version="1.0" encoding="UTF-8"?><A>a&#x0D;\nb\tc</A>')
  })

  it('round-trips through parseXml', async () => {
    const { parseXml, textOf } = await import('../../../src/xml/parse.js')
    const xml = buildXml({ name: 'A', text: '', children: [{ name: 'B', text: 'a & <b>', children: [] }] })
    expect(textOf(parseXml(xml), 'B')).toBe('a & <b>')
  })

  it('round-trips a carriage return through parseXml', async () => {
    const { parseXml, textOf } = await import('../../../src/xml/parse.js')
    const xml = buildXml({ name: 'A', text: '', children: [{ name: 'B', text: 'a\r\nb', children: [] }] })
    expect(textOf(parseXml(xml), 'B')).toBe('a\r\nb')
  })
})

describe('escapeXmlKey', () => {
  it('escapes the five predefined entities', () => {
    expect(escapeXmlKey('a & b <c> "d" \'e\'')).toBe('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')
  })

  it('turns every C0 control, tab and newline included, into a numeric reference', () => {
    expect(escapeXmlKey('a\x00b\x1fc\td\ne\rf')).toBe('a&#x00;b&#x1F;c&#x09;d&#x0A;e&#x0D;f')
  })

  it('leaves astral and multi-script text alone', () => {
    expect(escapeXmlKey('\u{1F600} 中文 Ж')).toBe('\u{1F600} 中文 Ж')
  })

  it('substitutes the replacement character for a lone surrogate', () => {
    expect(escapeXmlKey('a\uD800b')).toBe('a' + String.fromCharCode(0xfffd) + 'b')
  })

  it('escapes a key inside a document without double-escaping the references it emits', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Object><Key>' + escapeXmlKey('a&\x01b') + '</Key></Object>'
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?><Object><Key>a&amp;&#x01;b</Key></Object>')
  })
})
