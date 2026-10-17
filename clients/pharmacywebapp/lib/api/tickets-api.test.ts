import { describe, expect, it, vi } from "vitest"
import {
  buildCreateTicketBody,
  createIssueTicket,
  issueReportErrorMessage,
  listTickets,
  listTicketsAcrossTenants,
  getTicket,
  listTicketComments,
  addTicketComment,
  updateTicket,
  assignTicket,
  resolveTicket,
  reopenTicket,
  closeTicket,
  ticketsPermissionAllowed,
  canViewTickets,
  canUpdateTickets,
  canAssignTickets,
  canResolveTickets,
  canReopenTickets,
  canCloseTickets,
  canCommentOnTickets,
  canViewAllTickets,
  TICKETS_VIEW_PERMISSION,
  TICKETS_VIEW_ALL_PERMISSION,
  TICKETS_ASSIGN_PERMISSION,
  type DotnetTicketDto,
  type DotnetTicketCommentDto,
  type DotnetPagedResponse,
  type IssueReportInput,
} from "@/lib/api/tickets-api"
import { DotnetApiError } from "@/lib/api/dotnet-client"

type Client = Parameters<typeof createIssueTicket>[1]

function fakeClient() {
  const client = {
    post: vi.fn(async () => "t-1" as unknown),
    get: vi.fn(async () => ({ id: "t-1", number: "TK-0007" }) as unknown as DotnetTicketDto),
  }
  return { client: client as unknown as Client, spies: client }
}

function fakeFullClient() {
  const client = {
    get: vi.fn(async (_path: string) => ({}) as unknown),
    post: vi.fn(async (_path: string, _body?: unknown) => "ticket-id" as unknown),
    put: vi.fn(async (_path: string, _body?: unknown) => "ticket-id" as unknown),
  }
  return { client: client as unknown as Parameters<typeof listTickets>[1], spies: client }
}

const baseInput: IssueReportInput = {
  summary: "  Save button does nothing  ",
  description: "  Clicked save on the new sale page, nothing happened.  ",
  severity: "High",
  context: {
    pageUrl: "https://app.example.test/dashboard/sales/new",
    userAgent: "Mozilla/5.0 (test)",
    userId: "user-123",
    userEmail: "manager@demo-pharmacy.test",
  },
}

describe("buildCreateTicketBody", () => {
  it("maps summary to a trimmed title and folds context into the description", () => {
    const body = buildCreateTicketBody(baseInput)

    expect(body.title).toBe("Save button does nothing")
    expect(body.priority).toBe("High")
    expect(body.description).toContain("Clicked save on the new sale page, nothing happened.")
    expect(body.description).toContain("Page: https://app.example.test/dashboard/sales/new")
    expect(body.description).toContain("User agent: Mozilla/5.0 (test)")
    expect(body.description).toContain("Reported by: manager@demo-pharmacy.test / user-123")
  })

  it("falls back to a generic title when the summary is blank", () => {
    const body = buildCreateTicketBody({ ...baseInput, summary: "   " })
    expect(body.title).toBe("User-reported issue")
  })

  it("omits the 'Reported by' line when no user info is available", () => {
    const body = buildCreateTicketBody({
      ...baseInput,
      context: { pageUrl: "https://app.example.test", userAgent: "ua" },
    })
    expect(body.description).not.toContain("Reported by:")
  })

  it("includes the error message and a trimmed stack when triggered from an error boundary", () => {
    const stackLines = Array.from({ length: 20 }, (_, i) => `  at frame${i} (file.ts:${i}:1)`)
    const body = buildCreateTicketBody({
      ...baseInput,
      context: {
        ...baseInput.context,
        errorMessage: "TypeError: cannot read properties of undefined",
        errorStack: stackLines.join("\n"),
      },
    })

    expect(body.description).toContain("Error: TypeError: cannot read properties of undefined")
    expect(body.description).toContain("Stack (truncated):")
    expect(body.description).toContain("frame0")
    expect(body.description).not.toContain("frame10")
  })

  it("truncates an oversized title and description to the backend's validator limits", () => {
    const body = buildCreateTicketBody({
      ...baseInput,
      summary: "x".repeat(200),
      description: "y".repeat(5000),
    })

    expect(body.title.length).toBeLessThanOrEqual(160)
    expect(body.description.length).toBeLessThanOrEqual(4096)
  })
})

describe("createIssueTicket", () => {
  it("posts the mapped body to /tickets", async () => {
    const { client, spies } = fakeClient()
    await createIssueTicket(baseInput, client)

    expect(spies.post).toHaveBeenCalledWith("/tickets", buildCreateTicketBody(baseInput))
  })

  it("reads the new ticket back for its number (POST returns only the id)", async () => {
    const { client, spies } = fakeClient()
    await expect(createIssueTicket(baseInput, client)).resolves.toEqual({ id: "t-1", number: "TK-0007" })
    expect(spies.get).toHaveBeenCalledWith("/tickets/t-1")
  })

  it("still succeeds when the number can't be read", async () => {
    const { client, spies } = fakeClient()
    spies.get.mockRejectedValueOnce(new Error("offline"))
    await expect(createIssueTicket(baseInput, client)).resolves.toEqual({ id: "t-1", number: null })
  })
})

describe("issueReportErrorMessage", () => {
  it("prefers the normalized server message", () => {
    const error = new DotnetApiError({ code: "VALIDATION", message: "Title is required", status: 400 })
    expect(issueReportErrorMessage(error)).toBe("Title is required")
  })

  it("falls back to a generic message for unknown errors", () => {
    expect(issueReportErrorMessage("boom")).toBe("Could not submit the report")
  })
})

describe("listTickets", () => {
  it("GETs /tickets with pagination defaults and omits unset filters", async () => {
    const { client, spies } = fakeFullClient()
    spies.get.mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 1 })

    await listTickets({}, client)

    const url = spies.get.mock.calls[0][0] as string
    expect(url.startsWith("/tickets?")).toBe(true)
    expect(url).toContain("pageNumber=1")
    expect(url).toContain("pageSize=20")
    expect(url).not.toContain("search=")
    expect(url).not.toContain("status=")
    expect(url).not.toContain("priority=")
  })

  it("includes search/status/priority/assignee filters and a custom page", async () => {
    const { client, spies } = fakeFullClient()
    spies.get.mockResolvedValueOnce({ items: [], pageNumber: 2, pageSize: 10, totalCount: 0, totalPages: 1 })

    await listTickets(
      {
        search: " leak ",
        status: "Open",
        priority: "High",
        assignedToUserId: "user-1",
        reporterUserId: "user-2",
        pageNumber: 2,
        pageSize: 10,
        sortBy: "createdAtUtc",
        sortDir: "desc",
      },
      client,
    )

    const url = spies.get.mock.calls[0][0] as string
    expect(url).toContain("search=leak")
    expect(url).toContain("status=Open")
    expect(url).toContain("priority=High")
    expect(url).toContain("assignedToUserId=user-1")
    expect(url).toContain("reporterUserId=user-2")
    expect(url).toContain("pageNumber=2")
    expect(url).toContain("pageSize=10")
    expect(url).toContain("sortBy=createdAtUtc")
    expect(url).toContain("sortDir=desc")
  })

  it("returns the paged response as given by the server", async () => {
    const { client, spies } = fakeFullClient()
    const page: DotnetPagedResponse<DotnetTicketDto> = {
      items: [{ id: "t1" } as DotnetTicketDto],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 1,
      totalPages: 1,
    }
    spies.get.mockResolvedValueOnce(page)

    const result = await listTickets({}, client)
    expect(result).toEqual(page)
  })
})

describe("listTicketsAcrossTenants", () => {
  it("sends the keyword, tenant, status and priority to the server (not filtered client-side)", async () => {
    const { client, spies } = fakeFullClient()
    spies.get.mockResolvedValueOnce({ items: [], pageNumber: 3, pageSize: 10, totalCount: 0, totalPages: 1 })

    await listTicketsAcrossTenants(
      { search: " printer ", tenantId: " acme ", status: "InProgress", priority: "Critical", pageNumber: 3, pageSize: 10 },
      client,
    )

    const url = spies.get.mock.calls[0][0] as string
    expect(url.startsWith("/tickets/all-tenants?")).toBe(true)
    const params = new URLSearchParams(url.split("?")[1])
    expect(params.get("search")).toBe("printer")
    expect(params.get("tenantId")).toBe("acme")
    expect(params.get("status")).toBe("InProgress")
    expect(params.get("priority")).toBe("Critical")
    expect(params.get("pageNumber")).toBe("3")
    expect(params.get("pageSize")).toBe("10")
  })

  it("omits blank keyword and tenant", async () => {
    const { client, spies } = fakeFullClient()
    spies.get.mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0, totalPages: 1 })

    await listTicketsAcrossTenants({ search: "   ", tenantId: "" }, client)

    const params = new URLSearchParams((spies.get.mock.calls[0][0] as string).split("?")[1])
    expect(params.has("search")).toBe(false)
    expect(params.has("tenantId")).toBe(false)
  })
})

describe("getTicket", () => {
  it("GETs /tickets/{id}", async () => {
    const { client, spies } = fakeFullClient()
    spies.get.mockResolvedValueOnce({ id: "t1" } as DotnetTicketDto)

    await getTicket("t1", client)

    expect(spies.get).toHaveBeenCalledWith("/tickets/t1")
  })
})

describe("listTicketComments", () => {
  it("GETs /tickets/{id}/comments", async () => {
    const { client, spies } = fakeFullClient()
    const comments: DotnetTicketCommentDto[] = [
      { id: "c1", ticketId: "t1", authorUserId: "u1", body: "hi", createdAtUtc: "2026-01-01T00:00:00Z" },
    ]
    spies.get.mockResolvedValueOnce(comments)

    const result = await listTicketComments("t1", client)

    expect(spies.get).toHaveBeenCalledWith("/tickets/t1/comments")
    expect(result).toEqual(comments)
  })
})

describe("addTicketComment", () => {
  it("POSTs the trimmed comment body", async () => {
    const { client, spies } = fakeFullClient()

    await addTicketComment("t1", "  hello there  ", client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/comments", { body: "hello there" })
  })
})

describe("updateTicket", () => {
  it("PUTs trimmed title/description and the given priority", async () => {
    const { client, spies } = fakeFullClient()

    await updateTicket("t1", { title: "  New title  ", description: "  details  ", priority: "Low" }, client)

    expect(spies.put).toHaveBeenCalledWith("/tickets/t1", {
      title: "New title",
      description: "details",
      priority: "Low",
    })
  })

  it("sends null description when omitted or blank", async () => {
    const { client, spies } = fakeFullClient()

    await updateTicket("t1", { title: "Title", priority: "Medium" }, client)

    expect(spies.put).toHaveBeenCalledWith("/tickets/t1", {
      title: "Title",
      description: null,
      priority: "Medium",
    })
  })
})

describe("assignTicket", () => {
  it("POSTs the assignee id", async () => {
    const { client, spies } = fakeFullClient()

    await assignTicket("t1", "user-1", client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/assign", { assigneeUserId: "user-1" })
  })

  it("POSTs null to clear the assignment", async () => {
    const { client, spies } = fakeFullClient()

    await assignTicket("t1", null, client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/assign", { assigneeUserId: null })
  })
})

describe("resolveTicket", () => {
  it("POSTs a trimmed resolution note", async () => {
    const { client, spies } = fakeFullClient()

    await resolveTicket("t1", "  fixed it  ", client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/resolve", { resolutionNote: "fixed it" })
  })

  it("sends null when no note is given", async () => {
    const { client, spies } = fakeFullClient()

    await resolveTicket("t1", undefined, client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/resolve", { resolutionNote: null })
  })
})

describe("reopenTicket", () => {
  it("POSTs to /tickets/{id}/reopen", async () => {
    const { client, spies } = fakeFullClient()

    await reopenTicket("t1", client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/reopen", {})
  })
})

describe("closeTicket", () => {
  it("POSTs to /tickets/{id}/close", async () => {
    const { client, spies } = fakeFullClient()

    await closeTicket("t1", client)

    expect(spies.post).toHaveBeenCalledWith("/tickets/t1/close", {})
  })
})

describe("ticketsPermissionAllowed and the per-action helpers", () => {
  it("allows exactly when the raw permission is present", () => {
    expect(ticketsPermissionAllowed(TICKETS_VIEW_PERMISSION, [TICKETS_VIEW_PERMISSION])).toBe(true)
    expect(ticketsPermissionAllowed(TICKETS_VIEW_PERMISSION, [])).toBe(false)
  })

  it("denies an unrelated permission list", () => {
    expect(canViewTickets(["Permissions.Sales.Sales.View"])).toBe(false)
    expect(canAssignTickets(["Permissions.Sales.Sales.View"])).toBe(false)
  })

  it("each helper checks its own permission name", () => {
    expect(canViewTickets([TICKETS_VIEW_PERMISSION])).toBe(true)
    expect(canUpdateTickets(["Permissions.Tickets.Update"])).toBe(true)
    expect(canAssignTickets([TICKETS_ASSIGN_PERMISSION])).toBe(true)
    expect(canResolveTickets(["Permissions.Tickets.Resolve"])).toBe(true)
    expect(canReopenTickets(["Permissions.Tickets.Reopen"])).toBe(true)
    expect(canCloseTickets(["Permissions.Tickets.Close"])).toBe(true)
    expect(canCommentOnTickets(["Permissions.Tickets.Comment"])).toBe(true)
  })

  it("canViewTickets is true for own-ticket users (basic View) and tenant admins (ViewAll)", () => {
    expect(canViewTickets([TICKETS_VIEW_PERMISSION])).toBe(true)
    expect(canViewTickets([TICKETS_VIEW_ALL_PERMISSION])).toBe(true)
    expect(canViewTickets([])).toBe(false)
  })

  it("canViewAllTickets requires ViewAll — the basic View only grants own tickets", () => {
    expect(canViewAllTickets([TICKETS_VIEW_ALL_PERMISSION])).toBe(true)
    expect(canViewAllTickets([TICKETS_VIEW_PERMISSION, "Permissions.Tickets.Create"])).toBe(false)
  })
})
