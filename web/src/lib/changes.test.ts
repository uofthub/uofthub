import { describe, expect, it } from 'vitest'
import { describeChange, summarizeChanges } from './changes'

describe('describeChange', () => {
  it('words each kind of change the way the pills do', () => {
    expect(describeChange({ kind: 'renamed', from: 'Old', to: 'New' })).toBe(
      'Renamed it from “Old” to “New”'
    )
    expect(describeChange({ kind: 'status', to: 'SHIPPED' })).toBe('Marked it finished')
    expect(describeChange({ kind: 'status', to: null })).toBe('Cleared its status')
    expect(describeChange({ kind: 'visibility', to: 'PUBLIC' })).toBe('Made it public')
    expect(describeChange({ kind: 'removed', what: 'link', name: 'GitHub' })).toBe(
      'Removed the link “GitHub”'
    )
    expect(describeChange({ kind: 'restored', versionNum: 2 })).toBe('Restored v2')
  })
})

describe('summarizeChanges', () => {
  it('says one change as it is', () => {
    expect(summarizeChanges([{ kind: 'edited', part: 'tags' }])).toBe('Edited the tags')
  })
})
