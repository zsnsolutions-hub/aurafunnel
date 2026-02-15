
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://utvydxqiqedaaxmmpfpf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0dnlkeHFpcWVkYWF4bW1wZnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjYyOTIsImV4cCI6MjA4NjY0MjI5Mn0.IYKSSkoYieAcnLkMpkMkdffbO_TGUxXJzBjqPsk-ssY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
