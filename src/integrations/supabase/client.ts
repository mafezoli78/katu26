import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://ynothcoqcdkrfalxfwjj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlub3RoY29xY2RrcmZhbHhmd2pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwOTAxMjgsImV4cCI6MjA4NDY2NjEyOH0.rLyMb4KU5u5dmJPCwWBevfTH-9HUuE-Xl2LfIBB9wdk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
