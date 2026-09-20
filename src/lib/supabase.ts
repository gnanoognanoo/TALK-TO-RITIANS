import { createClient } from '@supabase/supabase-js';
import { Database } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[SupabaseClient] Warning: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined in environment variables. ' +
    'Please copy .env.example to .env.local and configure your keys.'
  );
}

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
