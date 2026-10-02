# Luvli ♡ — Supabase Cloud Sync Setup

This guide helps you set up cloud synchronization for Luvli using Supabase.

## Quick Start (3 Steps)

### Step 1: Get Your Supabase Service Role Key

1. Go to [app.supabase.com](https://app.supabase.com)
2. Select the project: **eablejtazhyxbdjvfjmz**
3. Go to **Settings → API**
4. Copy the **Service Role Secret** (NOT the anon key)
   - ⚠️ Keep this private! Never commit it!

### Step 2: Set Environment Variable

**On Mac/Linux/Git Bash:**
```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

**On Windows PowerShell:**
```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
```

### Step 3: Run Migrations

```bash
npm run setup:db
```

If that doesn't work:
```bash
node tools/run-migrations.js
```

## What Gets Set Up

✅ Friends & streaks tables  
✅ Focus rooms for collaborative sessions  
✅ Check-in reminders  
✅ Gamification & achievements  
✅ Row-level security (RLS) policies  

## Verify It Works

1. Refresh Luvli in your browser
2. Sign in 
3. You should NOT see "Could not load your cloud data" anymore
4. Go to **Settings → Sync** and verify cloud is connected

## Troubleshooting

**"Could not load your cloud data" still appears?**
- The migrations may not have run successfully
- Check that SUPABASE_SERVICE_ROLE_KEY is set correctly
- Run migrations again: `node tools/run-migrations.js`

**"Table already exists"?**
- That's fine! Just means migrations already ran
- The app will work perfectly

## Features Unlocked

Once synced:
- ☁️ Cloud backup of your data
- 👥 Share focus rooms with friends
- 🎯 Buddy check-in reminders
- 📊 Shared streak leaderboards
- 💫 Real-time activity updates

---

## Alternative: Use Your Own Supabase Project

If you want your own project instead of the shared one:

1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Get your URL and anon key
4. Update `supabase.js`:
   ```javascript
   const SUPABASE_URL = "your-project-url";
   const SUPABASE_KEY = "your-anon-key";
   ```
5. Get service role key from project settings
6. Run migrations with that key
7. Done!

---

Questions? Check [supabase.com/docs](https://supabase.com/docs)
