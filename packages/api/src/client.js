import { createClient } from '@supabase/supabase-js'

/**
 * Factory function to create a Supabase client instance.
 *
 * Because this package is consumed by both a Vite React web app and an
 * Expo React Native mobile app, we intentionally avoid creating a singleton.
 * Each platform needs to supply its own storage adapter for auth persistence:
 *
 *   - Web  → `localStorage` (browser built-in, usually the default)
 *   - React Native → `AsyncStorage` from @react-native-async-storage
 *
 * @example
 * // ── Web (Vite) ──────────────────────────────────────────────
 * import { createAppClient } from '@repo/api'
 *
 * export const supabase = createAppClient({
 *   supabaseUrl: 'https://uddbtfkgcfflcciaoola.supabase.co',
 *   supabaseKey: 'sb_publishable_UEjjmsv84THRnMJe6a8IaA_A1aroi3d',
 *   // storageAdapter is omitted → defaults to localStorage
 * })
 *
 * // ── React Native (Expo) ─────────────────────────────────────
 * import { createAppClient } from '@repo/api'
 * import AsyncStorage from '@react-native-async-storage/async-storage'
 *
 * export const supabase = createAppClient({
 *   supabaseUrl: 'https://uddbtfkgcfflcciaoola.supabase.co',
 *   supabaseKey: 'sb_publishable_UEjjmsv84THRnMJe6a8IaA_A1aroi3d',
 *   storageAdapter: AsyncStorage,
 * })
 *
 * @param {object}  options
 * @param {string}  options.supabaseUrl      - Your Supabase project URL.
 * @param {string}  options.supabaseKey      - Your Supabase anon / publishable key.
 * @param {object}  [options.storageAdapter]  - A storage backend for auth token
 *                                              persistence. Must implement
 *                                              getItem, setItem, and removeItem.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createAppClient({ supabaseUrl, supabaseKey, storageAdapter }) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      '[@repo/api] createAppClient requires both "supabaseUrl" and "supabaseKey".',
    )
  }

  /** @type {import('@supabase/supabase-js').SupabaseClientOptions} */
  const options = {}

  if (storageAdapter) {
    options.auth = {
      storage: storageAdapter,
    }
  }

  return createClient(supabaseUrl, supabaseKey, options)
}
