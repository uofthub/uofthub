import { describe, expect, it } from 'vitest'
import { mainSubjects } from './faculties.js'

describe('mainSubjects', () => {
  it('keeps the subjects with at least half as many courses as the biggest', () => {
    expect(
      mainSubjects(['CSC108H1', 'CSC148H1', 'CSC207H1', 'CSC209H1', 'MAT137Y1', 'MAT223H1'])
    ).toEqual(['CSC', 'MAT'])
    expect(mainSubjects(['CSC108H1', 'CSC148H1', 'CSC207H1', 'MAT137Y1'])).toEqual(['CSC'])
  })

  it('keeps every subject when they are even', () => {
    expect(mainSubjects(['CSC108H1', 'MAT137Y1', 'PSY100H1', 'ECO101H1'])).toEqual([
      'CSC',
      'MAT',
      'PSY',
      'ECO',
    ])
  })

  it('reads UTSC codes, counts a course once, and ignores anything that is not a course', () => {
    expect(
      mainSubjects(['CSCA08H3', 'csca08h3', 'CSCA48H3', 'CSCA67H3', 'MATA31H3', 'hackathon'])
    ).toEqual(['CSC'])
    expect(mainSubjects([])).toEqual([])
  })
})
