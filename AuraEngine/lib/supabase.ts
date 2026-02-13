
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://oqbumrekdudtqlsphkoj.supabase.co';
const supabaseAnonKey = 'sb_publishable_HNGX9S9r5JuCR5emZTO_lA_JrFOabPo'; // Using the public key provided

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
