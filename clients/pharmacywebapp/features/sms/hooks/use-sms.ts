"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  smsApi,
  type SmsMessage,
  type SmsMessageFilters,
  type SmsMessagePage,
  type SmsSettings,
  type SmsSettingsInput,
  type SmsStatusInfo,
} from "@/features/sms/api-client"

export const SMS_SETTINGS_QUERY_KEY = ["notifications", "sms", "settings"] as const
export const SMS_MESSAGES_QUERY_KEY = ["notifications", "sms", "messages"] as const

/** The tenant's SMS settings and templates (no secrets). */
export function useSmsSettings(options: { enabled?: boolean } = {}) {
  return useQuery<SmsSettings>({
    queryKey: SMS_SETTINGS_QUERY_KEY,
    queryFn: () => smsApi.getSettings(),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** SMS on/off for the checkout's "SMS receipt" tick. Failures (older API) read as off. */
export function useSmsStatus(options: { enabled?: boolean } = {}) {
  return useQuery<SmsStatusInfo>({
    queryKey: [...SMS_SETTINGS_QUERY_KEY, "status"],
    queryFn: () => smsApi.getStatus().catch(() => ({ enabled: false, receiptsEnabled: false })),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useUpdateSmsSettings() {
  const queryClient = useQueryClient()
  return useMutation<SmsSettings, Error, SmsSettingsInput>({
    mutationFn: (input) => smsApi.updateSettings(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(SMS_SETTINGS_QUERY_KEY, saved)
      void queryClient.invalidateQueries({ queryKey: [...SMS_SETTINGS_QUERY_KEY, "status"] })
    },
  })
}

export function useSmsMessages(filters: SmsMessageFilters) {
  return useQuery<SmsMessagePage>({
    queryKey: [...SMS_MESSAGES_QUERY_KEY, filters],
    queryFn: () => smsApi.listMessages(filters),
    placeholderData: keepPreviousData,
    // Queued messages change state within a minute; keep the log fresh while it is open.
    refetchInterval: 30_000,
  })
}

/** Per-call data (the phone, the message id, the customer id) always goes through mutate(arg). */
export function useSendTestSms() {
  const queryClient = useQueryClient()
  return useMutation<SmsMessage, Error, string>({
    mutationFn: (phone) => smsApi.sendTest(phone),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SMS_MESSAGES_QUERY_KEY }),
  })
}

export function useRetrySms() {
  const queryClient = useQueryClient()
  return useMutation<SmsMessage, Error, string>({
    mutationFn: (id) => smsApi.retry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SMS_MESSAGES_QUERY_KEY }),
  })
}

export function useSendDuesReminder() {
  const queryClient = useQueryClient()
  return useMutation<SmsMessage, Error, string>({
    mutationFn: (customerId) => smsApi.sendDuesReminder(customerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SMS_MESSAGES_QUERY_KEY }),
  })
}
