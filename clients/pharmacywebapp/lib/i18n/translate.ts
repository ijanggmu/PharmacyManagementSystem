/**
 * Typed lookup over the message dictionaries. Keys are dot paths derived from the English dictionary
 * ("pos.cart.title"), so a typo or a key missing from the type is a compile error; the Nepali
 * dictionary is typed against the English shape, so a key missing there is a compile error too.
 * Plain module — usable from Server Components, print builders and tests.
 */

import type { Locale } from "@/lib/i18n/config"
import { en, type Messages } from "@/lib/i18n/messages/en"
import { ne } from "@/lib/i18n/messages/ne"

export type { Messages }

export const DICTIONARIES: Record<Locale, Messages> = { en, ne }

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

export type Namespace = keyof Messages
export type MessageKey = Leaves<Messages>
export type NamespaceKey<N extends Namespace> = Leaves<Messages[N]>

export type MessageParams = Record<string, string | number>

/** Replaces `{name}` placeholders; unknown placeholders are left as-is so they are visible in QA. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

function lookup(messages: Messages, key: string): string | undefined {
  let node: unknown = messages
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === "string" ? node : undefined
}

/** Translate `key` for `locale`, falling back to English, then to the key itself. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const text = lookup(DICTIONARIES[locale], key) ?? lookup(en, key) ?? key
  return interpolate(text, params)
}

export type Translator = (key: MessageKey, params?: MessageParams) => string
export type NamespaceTranslator<N extends Namespace> = (key: NamespaceKey<N>, params?: MessageParams) => string

export function createTranslator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params)
}

export function createNamespaceTranslator<N extends Namespace>(locale: Locale, namespace: N): NamespaceTranslator<N> {
  return (key, params) => translate(locale, `${namespace}.${key}` as MessageKey, params)
}

/** Every leaf key of a dictionary as a dot path — used by the parity test. */
export function flattenKeys(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return []
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : flattenKeys(v, `${prefix}${k}.`),
  )
}
