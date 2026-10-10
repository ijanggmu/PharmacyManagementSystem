import { Badge } from "@/components/ui/badge"
import { Briefcase, Crown, Pill, ShieldCheck, User, Wallet, type LucideIcon } from "lucide-react"

/**
 * One visual treatment for staff roles everywhere (users table, roles table, tenant users).
 * Privileged roles get the filled brand badge; everyone else a soft neutral one. The label and
 * icon always carry the meaning, never color alone.
 */
const ROLE_META: Record<string, { label: string; icon: LucideIcon; privileged: boolean }> = {
  superadmin: { label: "Super admin", icon: Crown, privileged: true },
  admin: { label: "Admin", icon: ShieldCheck, privileged: true },
  manager: { label: "Manager", icon: Briefcase, privileged: false },
  pharmacist: { label: "Pharmacist", icon: Pill, privileged: false },
  cashier: { label: "Cashier", icon: Wallet, privileged: false },
  staff: { label: "Staff", icon: User, privileged: false },
}

export function roleLabel(role: string): string {
  return ROLE_META[role]?.label ?? (role ? role.charAt(0).toUpperCase() + role.slice(1) : "—")
}

export function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role]
  const Icon = meta?.icon ?? User
  return (
    <Badge variant={meta?.privileged ? "default" : "muted"}>
      <Icon aria-hidden />
      {roleLabel(role)}
    </Badge>
  )
}
