import { describe, expect, it } from 'vitest'
import { allowedTenantIds, tenantAllowed, tenantOfIdToken } from './microsoftTenant.js'

const UOFT = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'

/** An unsigned id_token carrying these claims — only the payload is read. */
const idToken = (claims: object) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`

describe('Microsoft tenant check', () => {
  it('reads the tenant from an id_token', () => {
    expect(tenantOfIdToken(idToken({ tid: UOFT.toUpperCase() }))).toBe(UOFT)
    expect(tenantOfIdToken(idToken({}))).toBeNull()
    expect(tenantOfIdToken('not a token')).toBeNull()
    expect(tenantOfIdToken(undefined)).toBeNull()
  })

  it('takes the allowed list, or a single-tenant authority', () => {
    expect(allowedTenantIds({ MICROSOFT_ALLOWED_TENANT_IDS: ` ${UOFT}, ${OTHER} ` })).toEqual([
      UOFT,
      OTHER,
    ])
    expect(allowedTenantIds({ MICROSOFT_TENANT_ID: UOFT })).toEqual([UOFT])
    expect(allowedTenantIds({ MICROSOFT_TENANT_ID: 'organizations' })).toEqual([])
  })

  it('refuses a token from any other directory, whatever address it claims', () => {
    const env = { MICROSOFT_ALLOWED_TENANT_IDS: UOFT, NODE_ENV: 'production' }
    expect(tenantAllowed(idToken({ tid: UOFT }), env)).toBe(true)
    expect(tenantAllowed(idToken({ tid: OTHER, email: 'victim@mail.utoronto.ca' }), env)).toBe(
      false
    )
    expect(tenantAllowed(undefined, env)).toBe(false)
  })

  it('refuses every Microsoft sign-in in production when no tenant is configured', () => {
    expect(tenantAllowed(idToken({ tid: UOFT }), { NODE_ENV: 'production' })).toBe(false)
    expect(tenantAllowed(idToken({ tid: UOFT }), { NODE_ENV: 'development' })).toBe(true)
  })
})
