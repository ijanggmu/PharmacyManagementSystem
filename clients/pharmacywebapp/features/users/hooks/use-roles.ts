import { useQuery } from "@tanstack/react-query"
import { branchAccessOf, getRoleWithPermissions, listRoles, type BranchAccess } from "@/lib/api/roles-api"

export const roleKeys = {
  all: ["roles"] as const,
  list: () => [...roleKeys.all, "list"] as const,
  detail: (id: string) => [...roleKeys.all, "detail", id] as const,
}

/** The tenant's roles, by name. Shared cache for role pickers. */
export function useRoles() {
  return useQuery({
    queryKey: roleKeys.list(),
    queryFn: async () => (await listRoles()).sort((a, b) => a.name.localeCompare(b.name)),
    staleTime: 5 * 60 * 1000,
  })
}

/** Whether the named role sees every branch or only the user's own. Undefined until known. */
export function useRoleBranchAccess(roleName: string): { access: BranchAccess | undefined; isLoading: boolean } {
  const { data: roles } = useRoles()
  const roleId = roles?.find((r) => r.name.toLowerCase() === roleName.toLowerCase())?.id ?? ""
  const query = useQuery({
    queryKey: roleKeys.detail(roleId),
    queryFn: () => getRoleWithPermissions(roleId),
    enabled: !!roleId,
    staleTime: 5 * 60 * 1000,
  })
  return {
    access: query.data ? branchAccessOf(query.data.permissions) : undefined,
    isLoading: !!roleName && (!roles || query.isLoading),
  }
}
