"use client"

import { useState, useEffect, useMemo } from "react"
import DashboardLayout from "@/components/dashboard-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Plus, Building2, Pencil, Trash2, MapPin, Phone, Mail } from "lucide-react"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { Pagination } from "@/components/ui/pagination"
import { getCSRFToken } from "@/lib/api/client-helpers"

type Branch = {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  email: string | null
  is_active: boolean
  created_at: string
}

export default function BranchesPage() {
  const [hasSession, setHasSession] = useState(false)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", email: "", is_active: true })
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage] = useState(10)
  const { toast } = useToast()

  useEffect(() => {
    const checkUser = async () => {
      const res = await fetch("/api/auth/session", { cache: "no-store" })
      if (!res.ok) {
        window.location.href = "/?auth=signin"
        return
      }
      setHasSession(true)
      setLoading(false)
    }
    checkUser()
  }, [])

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (!res.ok) return
    const json = await res.json()
    setBranches(json?.data ?? [])
  }

  useEffect(() => {
    if (!hasSession) return
    setLoading(true)
    loadBranches().finally(() => setLoading(false))
  }, [hasSession])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: "", code: "", address: "", phone: "", email: "", is_active: true })
    setDialogOpen(true)
  }

  const openEdit = (b: Branch) => {
    setEditing(b)
    setForm({
      name: b.name,
      code: b.code,
      address: b.address ?? "",
      phone: b.phone ?? "",
      email: b.email ?? "",
      is_active: b.is_active,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const csrfToken = await getCSRFToken()
      if (editing) {
        const res = await fetch(`/api/branches/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err?.message ?? "Update failed")
        }
        toast({ title: "Branch updated" })
      } else {
        const res = await fetch("/api/branches", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err?.message ?? "Create failed")
        }
        toast({ title: "Branch created" })
      }
      setDialogOpen(false)
      await loadBranches()
    } catch (err: any) {
      toast({ title: "Error", description: err?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this branch? Sales and data linked to it may be affected.")) return
    const csrfToken = await getCSRFToken()
    const res = await fetch(`/api/branches/${id}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": csrfToken },
    })
    if (!res.ok) {
      const err = await res.json()
      toast({ title: "Error", description: err?.message, variant: "destructive" })
      return
    }
    toast({ title: "Branch deleted" })
    await loadBranches()
  }

  const filteredBranches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return branches
    return branches.filter((b) => {
      const fields = [
        b.name,
        b.code,
        b.address ?? "",
        b.phone ?? "",
        b.email ?? "",
      ]
      return fields.some((f) => f.toLowerCase().includes(term))
    })
  }, [search, branches])

  const totalItems = filteredBranches.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedBranches = filteredBranches.slice(startIndex, startIndex + itemsPerPage)

  if (!hasSession) return null
  if (loading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading branches..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Branches"
          description="Set up and manage your pharmacy branches. Switch branches from the header."
        />

        <Section spacing="lg">
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                All branches
              </CardTitle>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Input
                  placeholder="Search by name, code, address or contact"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full sm:w-80"
                />
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <Button onClick={openCreate} className="whitespace-nowrap">
                    <Plus className="h-4 w-4 mr-2" />
                    Add branch
                  </Button>
                  <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
                  <DialogHeader>
                    <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
                    <DialogDescription>
                      Branch code is used internally (e.g. in reports). Use lowercase letters and hyphens.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                          id="name"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          placeholder="Main Branch"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="code">Code *</Label>
                        <Input
                          id="code"
                          value={form.code}
                          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                          placeholder="main-branch"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        placeholder="Street, City"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone</Label>
                        <Input
                          id="phone"
                          value={form.phone}
                          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                          placeholder="+977 ..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder="branch@pharmacy.com"
                        />
                      </div>
                    </div>
                    {editing && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={form.is_active}
                          onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                        />
                        <Label>Active</Label>
                      </div>
                    )}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? "Saving..." : editing ? "Update" : "Create"}
                      </Button>
                    </DialogFooter>
                  </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {branches.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No branches yet. Add one to get started. You can switch branches from the dropdown in the header.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedBranches.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-muted-foreground">{b.code}</TableCell>
                          <TableCell className="text-sm">
                            {b.address && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {b.address}
                              </span>
                            )}
                            {b.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {b.phone}
                              </span>
                            )}
                            {b.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {b.email}
                              </span>
                            )}
                            {!b.address && !b.phone && !b.email && "—"}
                          </TableCell>
                          <TableCell>
                            <span className={b.is_active ? "text-green-600" : "text-muted-foreground"}>
                              {b.is_active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(b)} title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(b.id)}
                                title="Delete"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    startIndex={startIndex}
                    onPageChange={setCurrentPage}
                    className="mt-4"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
