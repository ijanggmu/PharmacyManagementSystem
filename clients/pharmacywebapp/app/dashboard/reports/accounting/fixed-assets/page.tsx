"use client"

import DepreciationRunTab from "../tabs/depreciation-run-tab"
import DepreciationScheduleTab from "../tabs/depreciation-schedule-tab"
import FixedAssetRegisterTab from "../tabs/fixed-asset-register-tab"
import TaxDepreciationTab from "../tabs/tax-depreciation-tab"
import { AccountingTabPanel } from "../accounting-view"

/** Fixed assets: assets (register, default) | depreciation (preview + run) | schedule (book) | tax-pools (Schedule 2). */
export default function FixedAssetsPage() {
  return (
    <>
      <AccountingTabPanel view="assets">
        <FixedAssetRegisterTab />
      </AccountingTabPanel>
      <AccountingTabPanel view="depreciation">
        <DepreciationRunTab />
      </AccountingTabPanel>
      <AccountingTabPanel view="schedule">
        <DepreciationScheduleTab />
      </AccountingTabPanel>
      <AccountingTabPanel view="tax-pools">
        <TaxDepreciationTab />
      </AccountingTabPanel>
    </>
  )
}
