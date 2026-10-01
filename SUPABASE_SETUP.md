# Supabase Setup: Shared Accountability

This guide sets up your Supabase database for the shared accountability feature (friends, focus rooms, check-ins, achievements).

## Quick Setup (5 minutes)

### 1. Open Supabase SQL Editor

1. Go to [https://app.supabase.com/project/_/sql](https://app.supabase.com/project/_/sql) (replace project ID)
2. Or: Dashboard → SQL Editor → New Query

### 2. Run Migration 1: Accountability Tables

Copy the entire contents of `supabase/migrations/0013_accountability.sql` and paste into the SQL editor.

Click **Run** (or Ctrl+Enter).

**Expected result:** ✅ "Query executed successfully" with no errors.

### 3. Run Migration 2: Row-Level Security

Copy the entire contents of `supabase/migrations/0014_accountability_rls.sql` and paste into the SQL editor.

Click **Run**.

**Expected result:** ✅ All RLS policies created successfully.

### 4. Verify Tables Were Created

In Supabase Dashboard → Table Editor, you should see:

- `friendships` — friend relationships with invite codes
- `friend_streaks` — daily streak tracking
- `focus_rooms` — collaborative study sessions
- `room_members` — live member status in rooms
- `check_in_reminders` — scheduled buddy check-ins

All tables should have 🔒 (RLS enabled) next to them.

---

## Start Using It Locally

Once migrations are deployed:

```bash
npm run dev
```

Then:

1. Open http://localhost:8080
2. Create an account (local or Google)
3. Go to **Friends** page
4. Try:
   - Invite a friend by email
   - Create a focus room
   - Join by room code

**Data syncs to Supabase automatically** when you're signed in with a real account (not the local provider).

---

## Troubleshooting

### "Foreign key constraint failed"

**Cause:** Migrations ran out of order.

**Fix:** In SQL Editor, run:
```sql
drop table if exists check_in_reminders cascade;
drop table if exists room_members cascade;
drop table if exists focus_rooms cascade;
drop table if exists friend_streaks cascade;
drop table if exists friendships cascade;
```

Then re-run both migration files in order (0013, then 0014).

### "Permission denied" errors

**Cause:** RLS policies haven't been applied yet.

**Fix:** Make sure migration 0014 ran successfully. Check that all policies exist:

```sql
select * from pg_policies where tablename like 'friendship%' or tablename like 'friend_streak%' or tablename like 'focus_room%' or tablename like 'room_member%' or tablename like 'check_in%';
```

You should see ~25 policies listed.

### Data not syncing to Supabase

**Cause:** You're using the local auth provider (anonymous account).

**Fix:** Sign in with a real account (Google or create one with email). The sync only works when `Auth.activeProvider()` returns a real provider (not local).

To verify:
```javascript
// In browser console
Auth.activeProvider()  // should return { isLocal: false }
AccountabilitySync.enabled()  // should return true
```

---

## Data Privacy

All tables have **Row-Level Security (RLS)** enabled:

- Users can only see their own data
- Friendships visible to both users
- Streaks visible only to connected friends
- Rooms visible to owner + members only

See `0014_accountability_rls.sql` for the complete policy definitions.

---

## Next: Real Google Sign-In (Optional)

The app works great with local accounts, but for a better UX, add real Google sign-in:

See `SETUP.md` for Google OAuth setup (5 minutes).

---

## Sync Architecture

```
Local App (localStorage)
    ↓
    ├─ Offline: Works fine, uses local cache
    │
    └─ Online + Signed In:
       ↓
       AccountabilitySync
       ↓
       Supabase Database
       ↓
       ✅ Data persists across devices
       ✅ Friends can see your streaks
       ✅ Real-time room sync (30-second polling)
```

---

## Monitoring Sync

In browser console:

```javascript
// Check if sync is enabled
AccountabilitySync.enabled()  // true/false

// Last sync time
AccountabilitySync.getLastSyncTime()  // Date or null

// Force a sync test
await AccountabilitySync.syncStreak({ 
  user_id: Auth.current().id,
  date: '2026-10-01',
  focus_minutes: 120,
  tasks_completed: 5,
  showed_up: true
})
```

---

## Deployment

When you're ready to ship:

1. ✅ Migrations applied to Supabase ← **You are here**
2. Set up real Google OAuth (see SETUP.md)
3. Deploy the web app to Netlify/Vercel
4. Update Google OAuth allowed origins
5. Share the URL with friends

The app handles the rest!
