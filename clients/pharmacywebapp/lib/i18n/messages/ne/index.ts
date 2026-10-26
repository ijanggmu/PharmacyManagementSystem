/** Nepali dictionary — every namespace is typed against its English counterpart. */

import type { Messages } from "../en"
import { appointments } from "./appointments"
import { common } from "./common"
import { customers } from "./customers"
import { dashboard } from "./dashboard"
import { goLive } from "./go-live"
import { nav } from "./nav"
import { pos } from "./pos"
import { print } from "./print"
import { reports } from "./reports"
import { suppliers } from "./suppliers"

export const ne: Messages = { common, nav, dashboard, pos, customers, suppliers, print, reports, goLive, appointments }
