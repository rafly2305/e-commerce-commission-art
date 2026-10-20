
import { cookies } from 'next/headers';
import { supabase } from './supabase';

export async function currentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ca_session')?.value;

  if (!token) return null;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('token', token)
    .maybeSingle();

  if (sessionError || !session) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('id', session.user_id)
    .maybeSingle();

  if (userError || !user) return null;

  return user;
}
