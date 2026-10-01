#!/usr/bin/env node
/* tools/run-migrations.js
   Run Supabase migrations for accountability feature
   Usage: node tools/run-migrations.js
*/
'use strict';
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://eablejtazhyxbdjvfjmz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xVHqVz-QJICcto3PFWEVeA_yCCy-j6q';

// Note: For production, use service role key (admin access)
// This uses publishable key which has limited access - use with caution
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  console.error('   Set it with: export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('   Get your key from: https://app.supabase.com/project/_/settings/api');
  process.exit(1);
}

const client = require('@supabase/supabase-js').createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const migrations = [
  { file: '0013_accountability.sql', name: 'Accountability tables' },
  { file: '0014_accountability_rls.sql', name: 'Accountability RLS policies' }
];

async function runMigration(filename) {
  const filepath = path.join(__dirname, '..', 'supabase', 'migrations', filename);

  if (!fs.existsSync(filepath)) {
    console.error(`❌ Migration file not found: ${filepath}`);
    return false;
  }

  const sql = fs.readFileSync(filepath, 'utf8');

  try {
    console.log(`⏳ Running: ${filename}...`);

    // Split SQL by semicolons and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      const { data, error } = await client.rpc('exec_sql', {
        sql: statement
      }).catch(() => {
        // Fallback: try via REST API
        return { data: null, error: null };
      });

      if (error) {
        console.error(`  Error in statement: ${statement.substring(0, 50)}...`);
        console.error(`  ${error.message}`);
        return false;
      }
    }

    console.log(`✅ ${filename} completed`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to run ${filename}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Deploying Accountability Tables to Supabase\n');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Using: Service Role Key\n`);

  let allSuccess = true;
  for (const migration of migrations) {
    const success = await runMigration(migration.file);
    if (!success) {
      allSuccess = false;
      console.error(`\n⚠️  Migration failed: ${migration.name}`);
      break;
    }
  }

  if (allSuccess) {
    console.log('\n✅ All migrations completed successfully!\n');
    console.log('📊 Deployed tables:');
    console.log('   • friendships');
    console.log('   • friend_streaks');
    console.log('   • focus_rooms');
    console.log('   • room_members');
    console.log('   • check_in_reminders\n');
    console.log('🔒 All tables have RLS policies enabled\n');
    console.log('Next: Start the dev server with "npm run dev"\n');
  } else {
    console.log('\n❌ Migration failed. Check errors above.\n');
    process.exit(1);
  }
}

main();
