"use client"

/**
 * Real role + permission editor over the .NET Identity API (lib/api/roles-api.ts). Custom roles
 * are fully editable: name, description and the per-permission checklist, grouped by the catalog's
 * Resource segment. System roles (Admin, Basic) are shown read-only with the server's own rejection
 * reason, matching what RoleService actually enforces — see roles-api.ts for the confirmed routes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ShieldCheck, Lock, Plus, Pencil, Trash2, Info, CheckSquare, Square, Building2, Globe2, Search, type LucideIcon } from "lucide-react"
import { Pagination } from "@/components/ui/pagination"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { roleKeys } from "@/features/users/hooks/use-roles"
import {
  BRANCHES_VIEW_ALL_PERMISSION,
  branchAccessOf,
  type BranchAccess,
  canCreateRoles,
  canDeleteRoles,
  canUpdateRoles,
  deleteRole,
  getPermissionCatalog,
  getRoleWithPermissions,
  groupPermissionsByResource,
  isSystemRole,
  listRoles,
  roleErrorMessage,
  updateRolePermissions,
  upsertRole,
  type DotnetRoleDto,
  type PermissionCatalogEntry,
  type PermissionGroup,
} from "@/lib/api/roles-api"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"

const ROLES_PAGE_SIZE = 10
const PERMISSION_GROUPS_PAGE_SIZE = 6

function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  return !q || fields.some((field) => field?.toLowerCase().includes(q))
}

/** Client-side page slice; clamps the page so a shrinking list never strands the view on an empty page. */
function pageOf<T>(items: readonly T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const currentPage = Math.min(page, totalPages)
  const startIndex = (currentPage - 1) * size
  return { currentPage, totalPages, startIndex, items: items.slice(startIndex, startIndex + size) }
}

interface EditorState {
  role: DotnetRoleDto | null // null => creating a new role
  name: string
  description: string
  permissions: Set<string>
}

function toEditorState(role: DotnetRoleDto | null): EditorState {
  return {
    role,
    name: role?.name ?? "",
    description: role?.description ?? "",
    permissions: new Set(role?.permissions ?? []),
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const value of a) if (!b.has(value)) return false
  return true
}

const BRANCH_ACCESS_OPTIONS: { value: BranchAccess; label: string; description: string; icon: LucideIcon }[] = [
  {
    value: "assigned",
    label: "Assigned branch only",
    description: "Lists and reports show only the branch each person works in.",
    icon: Building2,
  },
  {
    value: "all",
    label: "All branches",
    description: "Lists and reports show every branch's records by default.",
    icon: Globe2,
  },
]

/** One clear choice for MultitenancyPermissions.Branches.ViewAll, instead of a switch buried in the checklist. */
function BranchAccessField({
  value,
  disabled,
  onChange,
}: {
  value: BranchAccess
  disabled: boolean
  onChange: (value: BranchAccess) => void
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">Branch access</legend>
      <p className="text-xs text-muted-foreground">Which branches people with this role can view.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BRANCH_ACCESS_OPTIONS.map((option) => {
          const checked = value === option.value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="branch-access"
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="min-w-0 space-y-0.5">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className={cn("h-4 w-4", checked ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  {option.label}
                </span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function RoleManagement() {
  const queryClient = useQueryClient()
  const [roles, setRoles] = useState<DotnetRoleDto[]>([])
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[] | null>(null)
  const catalogLoaded = useRef(false)
  const [permissions, setPermissions] = useState<string[] | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [initial, setInitial] = useState<EditorState | null>(null)
  const [draft, setDraft] = useState<EditorState | null>(null)

  const [deleting, setDeleting] = useState<DotnetRoleDto | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [roleSearch, setRoleSearch] = useState("")
  const [rolePage, setRolePage] = useState(1)
  const [permissionSearch, setPermissionSearch] = useState("")
  const [permissionPage, setPermissionPage] = useState(1)

  useEffect(() => {
    loadDotnetCurrentUser()
      .then((current) => setPermissions(current?.info.permissions ?? []))
      .catch(() => setPermissions([]))
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setRoles(await listRoles())
    } catch (error) {
      setLoadError(roleErrorMessage(error, "We couldn't load roles"))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Permission catalog is effectively static per login — fetch once and reuse across every role click. */
  const ensureCatalog = useCallback(async (): Promise<PermissionCatalogEntry[]> => {
    if (catalogLoaded.current && catalog) return catalog
    const entries = await getPermissionCatalog()
    catalogLoaded.current = true
    setCatalog(entries)
    return entries
  }, [catalog])

  const canCreate = permissions ? canCreateRoles(permissions) : false
  const canUpdate = permissions ? canUpdateRoles(permissions) : false
  const canDelete = permissions ? canDeleteRoles(permissions) : false

  // Branch-wide visibility has its own control above the checklist, so keep it out of the Branches group.
  const groups: PermissionGroup[] = useMemo(
    () => groupPermissionsByResource((catalog ?? []).filter((p) => p.name !== BRANCHES_VIEW_ALL_PERMISSION)),
    [catalog],
  )

  const filteredRoles = useMemo(
    () => roles.filter((role) => matchesQuery(roleSearch, role.name, role.description)),
    [roles, roleSearch],
  )
  const rolesPage = pageOf(filteredRoles, rolePage, ROLES_PAGE_SIZE)

  // Search narrows each group to matching permissions; a resource-name match keeps the whole group.
  const filteredGroups: PermissionGroup[] = useMemo(
    () =>
      groups
        .map((group) =>
          matchesQuery(permissionSearch, group.resource)
            ? group
            : {
                ...group,
                permissions: group.permissions.filter((p) =>
                  matchesQuery(permissionSearch, p.action, p.description, p.name),
                ),
              },
        )
        .filter((group) => group.permissions.length > 0),
    [groups, permissionSearch],
  )
  const groupsPage = pageOf(filteredGroups, permissionPage, PERMISSION_GROUPS_PAGE_SIZE)
  const fullGroups = useMemo(() => new Map(groups.map((g) => [g.resource, g.permissions])), [groups])

  const systemLocked = draft?.role ? isSystemRole(draft.role.name) : false
  const dirty = !!draft && !!initial && (
    draft.name !== initial.name ||
    draft.description !== initial.description ||
    !sameSet(draft.permissions, initial.permissions)
  )

  function openCreate() {
    void (async () => {
      setEditorOpen(true)
      setPermissionSearch("")
      setPermissionPage(1)
      setEditorLoading(true)
      setEditorError(null)
      setSaveError(null)
      try {
        await ensureCatalog()
        const state = toEditorState(null)
        setInitial(state)
        setDraft(state)
      } catch (error) {
        setEditorError(roleErrorMessage(error, "We couldn't load the permission catalog"))
      } finally {
        setEditorLoading(false)
      }
    })()
  }

  function openEdit(role: DotnetRoleDto) {
    void (async () => {
      setEditorOpen(true)
      setPermissionSearch("")
      setPermissionPage(1)
      setEditorLoading(true)
      setEditorError(null)
      setSaveError(null)
      try {
        const [, full] = await Promise.all([ensureCatalog(), getRoleWithPermissions(role.id)])
        const state = toEditorState(full)
        setInitial(state)
        setDraft(state)
      } catch (error) {
        setEditorError(roleErrorMessage(error, "We couldn't load this role"))
      } finally {
        setEditorLoading(false)
      }
    })()
  }

  function closeEditor() {
    if (saving) return
    setEditorOpen(false)
    setInitial(null)
    setDraft(null)
    setEditorError(null)
    setSaveError(null)
  }

  function discard() {
    if (initial) setDraft({ ...initial, permissions: new Set(initial.permissions) })
  }

  function togglePermission(name: string, checked: boolean) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = new Set(prev.permissions)
      if (checked) next.add(name)
      else next.delete(name)
      return { ...prev, permissions: next }
    })
  }

  function toggleGroup(group: PermissionGroup, grant: boolean) {
    setDraft((prev) => {
      if (!prev) return prev
      const next = new Set(prev.permissions)
      for (const entry of group.permissions) {
        if (grant) next.add(entry.name)
        else next.delete(entry.name)
      }
      return { ...prev, permissions: next }
    })
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await upsertRole({ id: draft.role?.id, name: draft.name, description: draft.description })
      await updateRolePermissions(saved.id, [...draft.permissions])
      void queryClient.invalidateQueries({ queryKey: roleKeys.all })
      setEditorOpen(false)
      setInitial(null)
      setDraft(null)
      await load()
    } catch (error) {
      setSaveError(roleErrorMessage(error, "We couldn't save this role"))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteRole(deleting.id)
      void queryClient.invalidateQueries({ queryKey: roleKeys.all })
      setDeleting(null)
      await load()
    } catch (error) {
      setDeleteError(roleErrorMessage(error, "We couldn't delete this role"))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Custom roles are fully editable. <span className="font-medium text-foreground">Admin</span> and{" "}
          <span className="font-medium text-foreground">Basic</span> are framework roles managed by the system.
        </p>
        {canCreate && (
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            New role
          </Button>
        )}
      </div>

      {!isLoading && !loadError && roles.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search roles by name or description"
            placeholder="Search roles…"
            value={roleSearch}
            onChange={(e) => {
              setRoleSearch(e.target.value)
              setRolePage(1)
            }}
            className="pl-8"
          />
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : loadError ? (
        <ErrorState message={loadError} onRetry={() => void load()} retrying={isLoading} size="compact" />
      ) : roles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No roles yet"
          description="Create a role to control what your staff can see and do."
          action={canCreate ? { label: "New role", onClick: openCreate, icon: Plus } : undefined}
          size="compact"
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rolesPage.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                    No roles match &ldquo;{roleSearch}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
              {rolesPage.items.map((role) => {
                const locked = isSystemRole(role.name)
                return (
                  <TableRow
                    key={role.id}
                    className="cursor-pointer"
                    onClick={() => openEdit(role)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {locked && (
                          <Badge variant="muted" className="gap-1">
                            <Lock className="h-3 w-3" aria-hidden />
                            System
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">
                      {role.description || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${role.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(role)
                        }}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      {canDelete && !locked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${role.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleting(role)
                            setDeleteError(null)
                          }}
                        >
                          <Trash2 className="text-destructive" aria-hidden />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {!isLoading && !loadError && (
        <Pagination
          currentPage={rolesPage.currentPage}
          totalPages={rolesPage.totalPages}
          totalItems={filteredRoles.length}
          itemsPerPage={ROLES_PAGE_SIZE}
          startIndex={rolesPage.startIndex}
          onPageChange={setRolePage}
        />
      )}

      <Dialog open={editorOpen} onOpenChange={(open) => !open && closeEditor()}>
        <DialogContent className={DIALOG_CONTENT_SCROLL_BODY_CLASS}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>{draft?.role ? `Edit role — ${draft.role.name}` : "New role"}</DialogTitle>
            <DialogDescription>
              {systemLocked
                ? "System roles cannot be modified. Their permissions are managed by the framework."
                : "Set the role's name, description, and the permissions it grants."}
            </DialogDescription>
          </DialogHeader>

          <DialogScrollBody>
            {editorLoading ? (
              <SkeletonTable rows={6} cols={2} />
            ) : editorError ? (
              <ErrorState message={editorError} size="compact" />
            ) : draft ? (
              <div className="space-y-6">
                {systemLocked && (
                  <Alert className="border-info/20 bg-info/5">
                    <Info className="h-4 w-4 text-info" aria-hidden />
                    <AlertTitle>Read-only system role</AlertTitle>
                    <AlertDescription>
                      {draft.role?.name} is a framework role. The server rejects edits to its profile and
                      permissions — this view mirrors that restriction.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="role-name">Name</Label>
                    <Input
                      id="role-name"
                      value={draft.name}
                      disabled={systemLocked}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="role-description">Description</Label>
                    <Textarea
                      id="role-description"
                      value={draft.description}
                      disabled={systemLocked}
                      rows={2}
                      onChange={(e) =>
                        setDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                      }
                    />
                  </div>
                </div>

                <BranchAccessField
                  value={branchAccessOf(draft.permissions)}
                  disabled={systemLocked}
                  onChange={(access) => togglePermission(BRANCHES_VIEW_ALL_PERMISSION, access === "all")}
                />

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">
                      Permissions{" "}
                      <span className="font-normal text-muted-foreground">· {draft.permissions.size} granted</span>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <Input
                        type="search"
                        aria-label="Search permissions"
                        placeholder="Search permissions…"
                        value={permissionSearch}
                        onChange={(e) => {
                          setPermissionSearch(e.target.value)
                          setPermissionPage(1)
                        }}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No permissions in the catalog.</p>
                  ) : filteredGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No permissions match &ldquo;{permissionSearch}&rdquo;.</p>
                  ) : (
                    groupsPage.items.map((group) => {
                      // Select all / Clear act on the permissions shown, which a search may narrow.
                      const allGranted = group.permissions.every((p) => draft.permissions.has(p.name))
                      const noneGranted = group.permissions.every((p) => !draft.permissions.has(p.name))
                      const full = fullGroups.get(group.resource) ?? group.permissions
                      const grantedCount = full.filter((p) => draft.permissions.has(p.name)).length
                      return (
                        <div key={group.resource} className="space-y-2 rounded-lg border p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                              {group.resource}
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {grantedCount} of {full.length} granted
                              </span>
                            </div>
                            {!systemLocked && (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={allGranted}
                                  onClick={() => toggleGroup(group, true)}
                                >
                                  <CheckSquare aria-hidden />
                                  Select all
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={noneGranted}
                                  onClick={() => toggleGroup(group, false)}
                                >
                                  <Square aria-hidden />
                                  Clear
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {group.permissions.map((entry) => {
                              const checked = draft.permissions.has(entry.name)
                              return (
                                <label
                                  key={entry.name}
                                  htmlFor={`perm-${entry.name}`}
                                  className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
                                >
                                  <span className="flex flex-col">
                                    <span>{entry.action}</span>
                                    {entry.description && (
                                      <span className="text-xs text-muted-foreground">{entry.description}</span>
                                    )}
                                  </span>
                                  <Switch
                                    id={`perm-${entry.name}`}
                                    checked={checked}
                                    disabled={systemLocked}
                                    onCheckedChange={(value) => togglePermission(entry.name, value)}
                                  />
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                  <Pagination
                    currentPage={groupsPage.currentPage}
                    totalPages={groupsPage.totalPages}
                    totalItems={filteredGroups.length}
                    itemsPerPage={PERMISSION_GROUPS_PAGE_SIZE}
                    startIndex={groupsPage.startIndex}
                    onPageChange={setPermissionPage}
                  />
                </div>

                {saveError && (
                  <Alert variant="destructive">
                    <AlertTitle>Couldn&apos;t save</AlertTitle>
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : null}
          </DialogScrollBody>

          <DialogStickyFooter>
            <DialogFooter className="w-full sm:items-center">
              {dirty && !systemLocked && (
                <span role="status" className="mr-auto flex items-center gap-1.5 text-xs font-medium text-warning">
                  <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />
                  Unsaved changes
                </span>
              )}
              <Button variant="outline" onClick={closeEditor} disabled={saving}>
                Close
              </Button>
              {!systemLocked && draft && !editorLoading && !editorError && (
                <>
                  <Button variant="outline" onClick={discard} disabled={!dirty || saving}>
                    Discard
                  </Button>
                  <Button onClick={() => void save()} loading={saving} disabled={!dirty || !canUpdate || !draft.name.trim()}>
                    Save
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogStickyFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => {
          if (!deleteBusy) {
            setDeleting(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => void confirmDelete()}
        title={`Delete role "${deleting?.name ?? ""}"?`}
        description={
          deleteError ?? "This cannot be undone. Users holding this role lose the permissions it grants."
        }
        confirmText="Delete role"
        variant="destructive"
        loading={deleteBusy}
      />
    </div>
  )
}
