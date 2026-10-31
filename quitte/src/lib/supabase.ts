import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

// Publieke (publishable) sleutel: veilig om in de app te bundelen. Alle data zit achter
// SECURITY DEFINER-functies die een geheime lijstcode vereisen; tabellen zijn niet direct leesbaar.
export const SUPABASE_URL = 'https://vuwfyhtejsxhdfyvkkeq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_miAZ6CBZShVcmmNwlnEDgA_aGw1X4aP';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 5 } },
});
