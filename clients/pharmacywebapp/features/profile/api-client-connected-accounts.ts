import { dotnetClient } from "@/lib/api/dotnet-client"

export interface ConnectedLogin {
  provider: string
  /** For Google, the account's email. */
  displayName: string | null
}

export interface ConnectedAccounts {
  logins: ConnectedLogin[]
  /** False for accounts that only sign in with Google. */
  hasPassword: boolean
  /** Whether Google sign-in is configured on the server. */
  googleEnabled: boolean
}

/** The signed-in user's connected sign-in accounts (Google). */
export const connectedAccountsApi = {
  get: () => dotnetClient.get<ConnectedAccounts>("/identity/external-logins"),
  /** Connects the Google account behind this ID token to the signed-in user. */
  connectGoogle: (idToken: string) => dotnetClient.post<ConnectedLogin>("/identity/external-logins/google", { idToken }),
  disconnectGoogle: () => dotnetClient.delete<{ disconnected: boolean }>("/identity/external-logins/google"),
}
