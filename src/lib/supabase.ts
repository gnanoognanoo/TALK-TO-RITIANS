import { createClient } from '@supabase/supabase-js';
import { Database } from '../types';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL || '';
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  configuredUrl &&
  configuredAnonKey &&
  !configuredUrl.includes('your-project-id') &&
  !configuredAnonKey.includes('placeholder')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[SupabaseClient] Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined. ' +
    'Running in unconfigured development mode. Please configure .env.local with valid Supabase credentials.'
  );
}

// Safe placeholder so createClient never throws an uncaught exception during ES module evaluation
const supabaseUrl = isSupabaseConfigured ? configuredUrl : 'https://unconfigured.supabase.co';
const supabaseAnonKey = isSupabaseConfigured ? configuredAnonKey : 'unconfigured-anon-key';

/**
 * Shared Supabase browser client.
 * Configured with persistent browser session handling and Realtime enabled.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
