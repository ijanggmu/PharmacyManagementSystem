# Module: Payroll

Nepal payroll: employees, salary structures, monthly runs per branch and Nepali month, payslips and the SSF / salary TDS reports. Module `Order = 860`, schema `payroll`, routes `/api/v1/payroll/...`. Publishes only.

**Entities:** `Employee` (branch, PAN, SSF no. + `SsfEnrolled`, bank, `MaritalStatus` Single/Married, optional `UserId`), `SalaryStructure` (history; a run uses the latest `EffectiveFrom` ≤ month end), `PayrollSettings` (one per tenant: SSF rates, retirement deduction cap), `PayrollRun` + `PayrollRunLine` (snapshots; unique per tenant/branch/BS year/month).

## Rules

- **Statutory figures live in ONE place:** `Domain/NepalPayrollDefaults.cs` (SSF 11% + 20% of basic, retirement cap Rs 5,00,000 or 1/3 of income, single/couple slabs with the 1% first band as social security tax, waived for SSF contributors). Verify against the current Finance Act before each fiscal year; add a new `SalaryTaxSchedule` row rather than editing an old one.
- **Tax math is pure:** `Domain/PayrollCalculator.cs` — projected year (recorded months + missing earlier months at the full rate + this month + remaining months), monthly TDS = (annual − withheld − assumed for missing months) ÷ remaining months; joining month pro-rated by days. Unit-tested in `Payroll.Tests`.
- **Lifecycle:** Draft (recalculate / delete) → Approved → Posted → Paid. Post and pay write `PayrollRunPostedIntegrationEvent` / `PayrollRunPaidIntegrationEvent` to the outbox in the same transaction; Accounting books them (JV `system_payroll`, PMT `system_payroll_payment`) on accounts 5400, 5410, 2200, 2210, 2155 (salary TDS, separate from vendor TDS 2150), 2220, 2230 — seeded and created on first use (`PayrollAccounts`).
- **Permissions:** only `Payroll.Payroll.View` is in the token (web nav/pages); `Manage`, `Approve`, `Post` are server-only gates. Accountant role gets the whole resource; Manager does not (salaries are confidential).
- **Logging:** never log names with amounts — log run ids, branch ids and counts only.
