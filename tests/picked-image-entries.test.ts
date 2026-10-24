/**
 * Entry rules for the list a host returns from the bulk image pick hook.
 */
import { describe, it, expect } from 'vitest'
import { MAX_PICKED_IMAGES, readPickedImages } from '../src/editor/image-pick/picked-image-entries'

const valid = (i: number) => ({ url: `https://x.test/${i}.jpg`, name: `n${i}` })

describe('outcome per raw result', () => {
  it('treats null and an empty list as dismissed', () => {
    expect(readPickedImages(null)).toEqual({ kind: 'dismissed' })
    expect(readPickedImages([])).toEqual({ kind: 'dismissed' })
  })

  it('treats anything that is not a list as failed', () => {
    for (const v of ['x', {}, 1, undefined, true]) {
      expect(readPickedImages(v)).toEqual({ kind: 'failed' })
    }
  })

  it('fails above the cap even when every entry is valid', () => {
    const list = Array.from({ length: MAX_PICKED_IMAGES + 1 }, (_, i) => valid(i))
    expect(readPickedImages(list)).toEqual({ kind: 'failed' })
  })

  it('fails above the cap when half of the raw entries are invalid', () => {
    const list = Array.from({ length: 101 }, (_, i) => (i < 50 ? valid(i) : 'junk'))
    expect(readPickedImages(list)).toEqual({ kind: 'failed' })
  })

  it('accepts exactly the cap', () => {
    const list = Array.from({ length: 100 }, (_, i) => valid(i))
    const out = readPickedImages(list)
    expect(out.kind).toBe('images')
    if (out.kind === 'images') expect(out.images).toHaveLength(100)
  })

  it('keeps only valid entries in order with trimmed urls', () => {
    const out = readPickedImages([
      { url: '' }, { url: '   ' }, { url: 42 }, null, [], 'str',
      { url: '  https://x.test/a.jpg  ', name: 'A' },
      { name: 'no url' },
      { url: 'https://x.test/b.jpg' },
    ])
    expect(out).toEqual({
      kind: 'images',
      images: [
        { url: 'https://x.test/a.jpg', name: 'A' },
        { url: 'https://x.test/b.jpg', name: '' },
      ],
    })
  })

  it('fails when a non-empty list has no valid entry', () => {
    expect(readPickedImages([{ url: '' }, 3, null])).toEqual({ kind: 'failed' })
  })

  it('normalises names', () => {
    const names = [42, {}, '', '  ', '  Red shoe  '].map((name) =>
      readPickedImages([{ url: 'u', name }]),
    )
    expect(names.map((r) => (r.kind === 'images' ? r.images[0].name : null))).toEqual([
      '', '', '', '', 'Red shoe',
    ])
  })
})

describe('what is read from an entry', () => {
  it('reads only url and name, once each', () => {
    const reads: string[] = []
    const entry = new Proxy({ url: 'u', name: 'n', price: '1' }, {
      get(target, key, receiver) {
        reads.push(String(key))
        return Reflect.get(target, key, receiver)
      },
    })
    readPickedImages([entry])
    expect(reads.sort()).toEqual(['name', 'url'])
  })

  it('outputs plain objects with exactly url and name, values verbatim', () => {
    const polluted = JSON.parse('{"__proto__":{"x":1},"url":"https://x.test/p.jpg","name":"<b>hi</b>","price":"9","category":"c","onclick":"a()"}')
    const long = 'a'.repeat(10000)
    const out = readPickedImages([
      polluted,
      { url: 'javascript:alert(1)', name: '' },
      { url: 'data:image/png;base64,AAAA' },
      { url: long, name: long },
    ])
    expect(out.kind).toBe('images')
    if (out.kind !== 'images') return
    for (const img of out.images) {
      expect(Object.keys(img).sort()).toEqual(['name', 'url'])
      expect(Object.getPrototypeOf(img)).toBe(Object.prototype)
    }
    expect(out.images[0]).toEqual({ url: 'https://x.test/p.jpg', name: '<b>hi</b>' })
    expect(out.images[1].url).toBe('javascript:alert(1)')
    expect(out.images[2].url).toBe('data:image/png;base64,AAAA')
    expect(out.images[3]).toEqual({ url: long, name: long })
  })
})
