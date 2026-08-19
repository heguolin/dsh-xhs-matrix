import { describe, expect, it } from 'vitest'
import { checkMatrixStoreInvariant } from '../src/invariant.ts'
import { MATRIX_STORE_VERSION } from '../src/store.ts'

describe('invariant', () => {
  it('版本一致通过', () => {
    expect(checkMatrixStoreInvariant(MATRIX_STORE_VERSION)).toBeUndefined()
  })
  it('版本不一致给出诊断', () => {
    expect(checkMatrixStoreInvariant(MATRIX_STORE_VERSION + 1)).toMatch(/版本不匹配/)
  })
})
