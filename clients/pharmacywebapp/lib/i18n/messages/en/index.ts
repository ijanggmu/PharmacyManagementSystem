/**
 * English dictionary — the source of truth for message keys. One file per feature namespace; the
 * Nepali files are typed against these shapes, so adding a key here without translating it is a
 * TypeScript error (and the parity test in lib/i18n/messages.test.ts fails).
 */

import { common } from "./common"
import { customers } from "./customers"
import { dashboard } from "./dashboard"
import { goLive } from "./go-live"
import { nav } from "./nav"
import { pos } from "./pos"
import { print } from "./print"
import { reports } from "./reports"
import { suppliers } from "./suppliers"

export const en = { common, nav, dashboard, pos, customers, suppliers, print, reports, goLive }

export type Messages = typeof en
