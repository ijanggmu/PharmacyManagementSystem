/** Tab ids for the System logs page (plain module so the server page can validate ?tab=). */
export const SYSTEM_LOG_TABS = ["requests", "errors", "security", "integrations", "entities", "email"] as const
export type SystemLogTab = (typeof SYSTEM_LOG_TABS)[number]

export function isSystemLogTab(value: string | undefined | null): value is SystemLogTab {
  return !!value && (SYSTEM_LOG_TABS as readonly string[]).includes(value)
}
