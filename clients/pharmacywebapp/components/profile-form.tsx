"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Pencil, Save } from "lucide-react"
import { splitFullName } from "@/features/users/api-client"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { updateOwnProfile } from "@/lib/api/profile-api"
import type { ProfileUserData } from "@/lib/api/dashboard-dotnet"

interface ProfileFormProps {
  user: { id: string; email: string | null }
  userData: ProfileUserData | null
}

const PHONE_PATTERN = /^[+\d][\d\s-]{6,19}$/

function initialValues(userData: ProfileUserData | null) {
  return { full_name: userData?.full_name || "", phone: userData?.phone || "" }
}

export default function ProfileForm({ user, userData }: ProfileFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [touched, setTouched] = useState(false)
  const [formData, setFormData] = useState(() => initialValues(userData))

  useEffect(() => {
    setFormData(initialValues(userData))
  }, [userData])

  const initial = initialValues(userData)
  const dirty = formData.full_name !== initial.full_name || formData.phone !== initial.phone
  const nameError = !formData.full_name.trim() ? "Enter your name." : null
  const phoneError =
    formData.phone.trim() && !PHONE_PATTERN.test(formData.phone.trim())
      ? "Enter a valid phone number, e.g. 98XXXXXXXX."
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (nameError || phoneError) return
    setIsLoading(true)
    try {
      const names = splitFullName(formData.full_name)
      await updateOwnProfile({
        firstName: names.firstName,
        lastName: names.lastName,
        phoneNumber: formData.phone.trim() || null,
      })
      toast({ title: "Profile updated", description: "Your details have been saved." })
      setIsEditing(false)
      setTouched(false)
      router.refresh()
    } catch (error: unknown) {
      toast({ title: "Couldn't update profile", description: apiRequestErrorMessage(error), variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData(initialValues(userData))
    setTouched(false)
    setIsEditing(false)
  }

  const showNameError = isEditing && touched && !!nameError
  const showPhoneError = isEditing && (touched || formData.phone.length > 0) && !!phoneError

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="full_name">
            Full name
            {isEditing && (
              <span className="text-destructive" aria-hidden>
                {" "}*
              </span>
            )}
          </Label>
          <Input
            id="full_name"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            onBlur={() => setTouched(true)}
            readOnly={!isEditing}
            className={isEditing ? undefined : "bg-muted/50"}
            placeholder="Your full name"
            autoComplete="name"
            required
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? "full_name-error" : undefined}
          />
          {showNameError && (
            <p id="full_name-error" role="alert" className="text-xs text-destructive">
              {nameError}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            readOnly={!isEditing}
            className={isEditing ? undefined : "bg-muted/50"}
            placeholder={isEditing ? "98XXXXXXXX" : "Not set"}
            autoComplete="tel"
            aria-invalid={showPhoneError || undefined}
            aria-describedby={showPhoneError ? "phone-error" : "phone-help"}
          />
          {showPhoneError ? (
            <p id="phone-error" role="alert" className="text-xs text-destructive">
              {phoneError}
            </p>
          ) : (
            <p id="phone-help" className="text-xs text-muted-foreground">
              Colleagues use this to reach you about orders and shifts.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          value={user.email ?? ""}
          readOnly
          className="bg-muted/50"
          aria-describedby="email-help"
        />
        <p id="email-help" className="text-xs text-muted-foreground">
          Your sign-in email can&apos;t be changed here. Ask your pharmacy admin if it&apos;s wrong.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
        {!isEditing ? (
          <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil aria-hidden />
            Edit details
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" loading={isLoading} loadingText="Saving…" disabled={!dirty}>
              <Save aria-hidden />
              Save changes
            </Button>
          </>
        )}
      </div>
    </form>
  )
}
