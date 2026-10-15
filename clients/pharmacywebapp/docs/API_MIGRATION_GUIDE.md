> **Historical:** this document records the completed Supabase → .NET migration and is kept for history only. It does not describe the current architecture. For that, see `../rule.md` and `/docs/adr/0003-nextjs-bff-over-dotnet-api.md`.

# API Migration Guide

## Overview

This guide helps migrate components from direct Supabase calls to using API routes for consistency and better architecture.

## Why Migrate?

1. **Consistency**: All data access goes through API routes
2. **Security**: Centralized authentication and authorization
3. **Rate Limiting**: Built-in protection against abuse
4. **Error Handling**: Standardized error responses
5. **Logging**: Centralized request logging
6. **Testing**: Easier to mock and test API routes

## Migration Steps

### Step 1: Identify Direct Supabase Calls

Look for patterns like:
```typescript
const supabase = createClient()
const { data, error } = await supabase.from("table").select("*")
```

### Step 2: Create or Use Existing API Route

Check if an API route exists in `app/api/`:
- `app/api/medicines/route.ts` - Medicine operations
- `app/api/customers/route.ts` - Customer operations
- `app/api/sales/route.ts` - Sales operations
- `app/api/prescriptions/route.ts` - Prescription operations

### Step 3: Replace Direct Calls with API Calls

**Before:**
```typescript
const supabase = createClient()
const { data, error } = await supabase
  .from("medicines")
  .select("*")
  .eq("id", medicineId)
  .single()
```

**After:**
```typescript
const response = await fetch(`/api/medicines/${medicineId}`)
if (!response.ok) {
  throw new Error("Failed to fetch medicine")
}
const result = await response.json()
const data = result.data
```

### Step 4: Use Standardized Response Format

All API routes return:
```typescript
{
  success: true,
  data: T,
  message?: string,
  meta?: { page, limit, total, totalPages },
  timestamp: string
}
```

Or on error:
```typescript
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  },
  timestamp: string
}
```

## Helper Functions

Use the provided helper functions in `lib/api/client-helpers.ts`:

```typescript
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api/client-helpers"

// GET request
const medicines = await apiGet<Medicine[]>("/api/medicines")

// POST request
const newMedicine = await apiPost<Medicine>("/api/medicines", medicineData)

// PUT request
const updated = await apiPut<Medicine>(`/api/medicines/${id}`, updates)

// DELETE request
await apiDelete(`/api/medicines/${id}`)
```

## Priority Migration List

1. **High Priority** (Security-sensitive):
   - Customer data access
   - Prescription data access
   - Sales data access
   - Medicine inventory updates

2. **Medium Priority**:
   - Supplier data
   - Settings
   - Reports

3. **Low Priority**:
   - Read-only operations
   - Internal utilities

## Example Migration

### Component: MedicineList

**Before:**
```typescript
"use client"
import { createClient } from "@/lib/supabase/client"

export default function MedicineList() {
  const [medicines, setMedicines] = useState([])
  
  useEffect(() => {
    const fetchMedicines = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("medicines")
        .select("*")
      
      if (error) {
        console.error(error)
        return
      }
      
      setMedicines(data || [])
    }
    
    fetchMedicines()
  }, [])
  
  // ... render
}
```

**After:**
```typescript
"use client"
import { apiGet } from "@/lib/api/client-helpers"
import { useQuery } from "@tanstack/react-query"

export default function MedicineList() {
  const { data: medicines = [], isLoading, error } = useQuery({
    queryKey: ["medicines"],
    queryFn: () => apiGet<Medicine[]>("/api/medicines"),
  })
  
  if (isLoading) return <Loading />
  if (error) return <Error message={error.message} />
  
  // ... render
}
```

## Benefits After Migration

1. ✅ All requests go through authentication
2. ✅ Rate limiting applied automatically
3. ✅ CSRF protection for mutating requests
4. ✅ Consistent error handling
5. ✅ Request logging for audit trails
6. ✅ Easier to test and mock

