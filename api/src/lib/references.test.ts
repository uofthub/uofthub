import { describe, expect, it } from 'vitest'
import { normalizeDoi, parseReferences, referenceKey, urlKey } from './references.js'

describe('normalizeDoi', () => {
  it.each([
    ['10.5281/zenodo.1234', '10.5281/zenodo.1234'],
    ['doi:10.5281/ZENODO.1234', '10.5281/zenodo.1234'],
    ['DOI: 10.1000/xyz', '10.1000/xyz'],
    ['https://doi.org/10.1000/XYZ', '10.1000/xyz'],
    ['http://dx.doi.org/10.1000/xyz', '10.1000/xyz'],
    ['https://doi.org/10.1000/a%2Fb', '10.1000/a/b'],
    ['10.1000/xyz.', '10.1000/xyz'],
    ['(10.1000/xyz)', null],
    ['not a doi', null],
    ['11.1000/xyz', null],
  ])('%s → %s', (raw, expected) => {
    expect(normalizeDoi(raw)).toBe(expected)
  })
})

describe('referenceKey', () => {
  it.each([
    // DOIs, however pasted.
    [{ doi: '10.5281/ZENODO.1234' }, 'doi:10.5281/zenodo.1234'],
    [{ url: 'https://doi.org/10.5281/zenodo.1234' }, 'doi:10.5281/zenodo.1234'],
    // A DOI beats the URL it came with.
    [{ doi: '10.1000/xyz', url: 'https://example.org/paper' }, 'doi:10.1000/xyz'],
    // arXiv: abstract, PDF, versioned, old-style, and arXiv's own DOI.
    [{ url: 'https://arxiv.org/abs/2101.00001' }, 'arxiv:2101.00001'],
    [{ url: 'https://arxiv.org/abs/2101.00001v3' }, 'arxiv:2101.00001'],
    [{ url: 'https://arxiv.org/pdf/2101.00001v2.pdf' }, 'arxiv:2101.00001'],
    [{ url: 'http://arxiv.org/abs/hep-th/9901001' }, 'arxiv:hep-th/9901001'],
    [{ doi: '10.48550/arXiv.2101.00001' }, 'arxiv:2101.00001'],
    // GitHub: owner and repo, whatever page of it was linked.
    [{ url: 'https://github.com/Owner/Repo' }, 'github:owner/repo'],
    [{ url: 'https://www.github.com/owner/repo.git' }, 'github:owner/repo'],
    [{ url: 'https://github.com/owner/repo/tree/main/data?tab=readme' }, 'github:owner/repo'],
    // Hugging Face datasets, spaces and models; Kaggle datasets.
    [{ url: 'https://huggingface.co/datasets/Owner/Squad/tree/main' }, 'hf:datasets/owner/squad'],
    [{ url: 'https://huggingface.co/spaces/owner/demo' }, 'hf:spaces/owner/demo'],
    [{ url: 'https://huggingface.co/bert-base/uncased' }, 'hf:bert-base/uncased'],
    [{ url: 'https://www.kaggle.com/datasets/Owner/Titanic/data' }, 'kaggle:owner/titanic'],
    // Anything else: one canonical URL.
    [{ url: 'http://WWW.Example.org/Data/?b=2&a=1#section' }, 'https://example.org/Data?a=1&b=2'],
    [{ url: 'https://m.example.org/data?utm_source=x&ref=tw' }, 'https://example.org/data'],
    [{ url: 'https://example.org:8443/data/' }, 'https://example.org:8443/data'],
    // Nothing to go on.
    [{}, null],
    [{ url: 'ftp://example.org/data' }, null],
    [{ doi: 'not a doi' }, null],
  ])('%j → %s', (ref, expected) => {
    expect(referenceKey(ref)).toBe(expected)
  })

  it('matches the same dataset pasted two different ways', () => {
    expect(urlKey('https://www.kaggle.com/datasets/owner/titanic')).toBe(
      urlKey('https://kaggle.com/datasets/Owner/Titanic/versions/3')
    )
  })
})

describe('parseReferences', () => {
  it('stores rows in order with their keys, dropping empty ones', () => {
    const result = parseReferences([
      { kind: 'DATASET', title: ' Titanic ', url: 'https://kaggle.com/datasets/o/titanic' },
      { kind: 'PAPER', title: '', url: '', doi: '' },
      { kind: 'PAPER', title: 'Attention', doi: 'doi:10.1000/ATTN', authors: 'Vaswani et al.', year: 2017 },
    ])
    expect(result).toEqual({
      value: [
        {
          kind: 'DATASET',
          title: 'Titanic',
          url: 'https://kaggle.com/datasets/o/titanic',
          doi: null,
          authors: null,
          year: null,
          note: null,
          key: 'kaggle:o/titanic',
          position: 0,
        },
        {
          kind: 'PAPER',
          title: 'Attention',
          url: null,
          doi: '10.1000/attn',
          authors: 'Vaswani et al.',
          year: 2017,
          note: null,
          key: 'doi:10.1000/attn',
          position: 1,
        },
      ],
    })
  })

  it('refuses a reference with no title, an unsafe link or a bad DOI', () => {
    const error = (row: object) => {
      const r = parseReferences([{ kind: 'OTHER', ...row }])
      return 'error' in r ? r.error : null
    }
    expect(error({ url: 'https://example.org' })).toMatch(/title/)
    expect(error({ title: 'x', url: 'javascript:alert(1)' })).toMatch(/http/)
    expect(error({ title: 'x', doi: 'abc' })).toMatch(/not a DOI/)
    expect(error({ title: 'x', year: 99999 })).toMatch(/year/)
    expect(parseReferences([{ kind: 'NOVEL', title: 'x' }])).toEqual({
      error: 'Unknown reference kind',
    })
  })

  it('treats null as clearing them', () => {
    expect(parseReferences(null)).toEqual({ value: [] })
  })
})
