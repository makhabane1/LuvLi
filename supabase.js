const SUPABASE_URL = "https://eablejtazhyxbdjvfjmz.supabase.co";
const SUPABASE_KEY = "sb_publishable_xVHqVz-QJICcto3PFWEVeA_yCCy-j6q";

// Exposed globally so other scripts (js/auth.js's Supabase provider, added in
// Phase 4) can reach it without re-creating the client.
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);