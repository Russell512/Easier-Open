import { captureAccountUser } from './accountUser'
import type { ShareSettings, SharedShortlist } from './sharedShortlist'

export interface ShareConfiguration {
  enabled: boolean
  requireLogin: boolean
  rotate?: boolean
  shortlist: SharedShortlist | null
}

/** Capture the initiating account before any settings read or publication. */
export async function captureShortlistSharing(userId: string) {
  const account = await captureAccountUser(userId)
  account.assert()
  return {
    assert: account.assert,
    async read(): Promise<ShareSettings | null> {
      account.assert()
      const { data, error } = await account.client.from('easier_shortlist_shares')
        .select('token,enabled,require_login,published_at').eq('user_id', userId).maybeSingle()
      account.assert()
      if (error) throw error
      return data as ShareSettings | null
    },
    async configure(configuration: ShareConfiguration): Promise<ShareSettings> {
      account.assert()
      const { data, error } = await account.client.rpc('configure_easier_share', {
        share_enabled: configuration.enabled, login_required: configuration.requireLogin,
        next_shortlist: configuration.shortlist, rotate_token: configuration.rotate ?? false,
      })
      account.assert()
      if (error) throw error
      return data as ShareSettings
    },
  }
}
