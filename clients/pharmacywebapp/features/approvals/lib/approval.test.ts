import { describe, expect, it } from "vitest"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import {
  approvalActionLabel,
  approvalStatusLabel,
  buildIssueApprovalBody,
  canViewApprovalsLog,
  formatApprovalAmount,
  parseApprovalRequired,
  withApprovalToken,
} from "@/features/approvals/lib/approval"
import { approvalsLogPath } from "@/features/approvals/api-client"

/** The ProblemDetails the .NET GlobalExceptionHandler writes for ApprovalRequiredException. */
function approvalProblem(errors: unknown[], title = "ApprovalRequiredException", status = 403) {
  return new DotnetApiError(
    problemToNormalizedError(status, {
      title,
      status,
      detail: "Manager approval is required: a 12.5% discount is above your 5% per line limit.",
      errors,
    }),
  )
}

describe("parseApprovalRequired", () => {
  it("reads action, amount and target from the 403 approval_required", () => {
    const parsed = parseApprovalRequired(approvalProblem(["approval_required", "sale.discount", "12.5", "checkout-key"]))
    expect(parsed).toEqual({
      action: "sale.discount",
      amount: 12.5,
      targetRef: "checkout-key",
      message: "Manager approval is required: a 12.5% discount is above your 5% per line limit.",
    })
  })

  it("treats an empty target as unbound", () => {
    expect(parseApprovalRequired(approvalProblem(["approval_required", "sale.void", "100", ""]))?.targetRef).toBeNull()
  })

  it("ignores other errors", () => {
    expect(parseApprovalRequired(approvalProblem(["approval_required", "sale.void", "100", "x"], "ForbiddenException"))).toBeNull()
    expect(parseApprovalRequired(approvalProblem(["approval_required", "sale.void", "100", "x"], "ApprovalRequiredException", 409))).toBeNull()
    expect(parseApprovalRequired(approvalProblem(["Not allowed."], "ForbiddenException"))).toBeNull()
    expect(parseApprovalRequired(approvalProblem(["approval_required", "sale.unknown", "1", ""]))).toBeNull()
    expect(parseApprovalRequired(approvalProblem(["approval_required", "sale.void", "abc", ""]))).toBeNull()
    expect(parseApprovalRequired(new Error("boom"))).toBeNull()
    expect(parseApprovalRequired(null)).toBeNull()
  })
})

describe("approval helpers", () => {
  it("formats a discount as a percent and everything else as money", () => {
    const money = (n: number) => `Rs ${n.toFixed(2)}`
    expect(formatApprovalAmount("sale.discount", 12.5, money)).toBe("12.5%")
    expect(formatApprovalAmount("sale.void", 1250, money)).toBe("Rs 1250.00")
  })

  it("collects tokens for one resubmission without duplicates, newest last, at most 5", () => {
    expect(withApprovalToken(undefined, "a")).toEqual(["a"])
    expect(withApprovalToken(["a", "b"], "a")).toEqual(["b", "a"])
    expect(withApprovalToken(["1", "2", "3", "4", "5"], "6")).toEqual(["2", "3", "4", "5", "6"])
  })

  it("builds the issue body with a trimmed login and optional reason", () => {
    expect(
      buildIssueApprovalBody({ action: "sale.refund", amount: 5000, targetRef: "sale-1" }, "  manager@x.np ", "pw", "  "),
    ).toEqual({ approverLogin: "manager@x.np", password: "pw", action: "sale.refund", amount: 5000, targetRef: "sale-1", reason: null })
  })

  it("labels actions and statuses", () => {
    expect(approvalActionLabel("sale.credit_override")).toBe("Credit limit override")
    expect(approvalActionLabel("sale.price_level")).toBe("Cheaper price level")
    expect(approvalActionLabel("custom")).toBe("custom")
    expect(approvalStatusLabel("used")).toBe("Used")
    expect(approvalStatusLabel("expired")).toBe("Not used (expired)")
  })

  it("shows the approvals log to holders of Approvals.View only", () => {
    expect(canViewApprovalsLog(["Permissions.Approvals.View"])).toBe(true)
    expect(canViewApprovalsLog(["Permissions.Sales.Sales.Create"])).toBe(false)
  })

  it("builds the log query without empty filters", () => {
    expect(approvalsLogPath({ page: 2, action: "all", search: "  " })).toBe("/api/v1/identity/approvals?pageNumber=2&pageSize=25")
    expect(approvalsLogPath({ action: "sale.void", search: "sita" })).toBe(
      "/api/v1/identity/approvals?pageNumber=1&pageSize=25&action=sale.void&search=sita",
    )
  })
})
