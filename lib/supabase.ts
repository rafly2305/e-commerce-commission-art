import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !secretKey) {
  throw new Error('Supabase configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your hosting environment.');
}

// This client uses the server-only secret key. Never import it into client components.
export const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
