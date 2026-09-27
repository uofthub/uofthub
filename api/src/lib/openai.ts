import OpenAI from 'openai'

/**
 * The one OpenAI client the API shares — AI discovery (lib/discovery.ts) and
 * link import (lib/linkEnrich.ts). Both treat it as optional: with no key each
 * becomes its plain, non-AI version rather than an error, so local dev and a
 * deploy without an AI budget keep working.
 */

/** Overridable per deployment; this is the default when `OPENAI_MODEL` is unset. */
export const DEFAULT_MODEL = 'gpt-5.6-luna'

export const aiModel = (): string => process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL

let client: OpenAI | null | undefined

export function openaiClient(): OpenAI | null {
  if (client === undefined) {
    client = process.env.OPENAI_API_KEY ? new OpenAI() : null
    if (!client)
      console.warn(
        'OPENAI_API_KEY is not set — /discover falls back to keyword search and link import to page metadata'
      )
  }
  return client
}
