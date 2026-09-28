#!/usr/bin/env node
/* =============================================================================
   tools/generate-vapid-keys.js — one-time setup for real push notifications
   -----------------------------------------------------------------------------
   Generates a VAPID key pair (P-256, base64url — the format the Web Push
   standard and the `web-push` library expect) using only Node's built-in
   crypto, and writes BOTH halves to .env.vapid.local (git-ignored by the
   `.env.*.local` rule). It prints only the PUBLIC key.

   The private key never appears in any terminal output. Open
   .env.vapid.local yourself and copy VAPID_PRIVATE_KEY into Netlify's
   environment variables (mark it as a secret).

   Refuses to overwrite an existing .env.vapid.local — regenerating keys
   invalidates every device already subscribed.

   Usage:  node tools/generate-vapid-keys.js
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', '.env.vapid.local');
if (fs.existsSync(out)) {
  console.log('.env.vapid.local already exists — not overwriting (that would break existing subscriptions).');
  process.exit(1);
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const publicKey = b64url(ecdh.getPublicKey());      // 65-byte uncompressed point
const privateKey = b64url(ecdh.getPrivateKey());    // 32-byte scalar

fs.writeFileSync(out,
  '# Luvli push notification keys — NEVER commit this file.\n' +
  '# Copy VAPID_PRIVATE_KEY into Netlify -> Site configuration -> Environment variables (secret).\n' +
  'VAPID_PUBLIC_KEY=' + publicKey + '\n' +
  'VAPID_PRIVATE_KEY=' + privateKey + '\n');

console.log('Wrote .env.vapid.local');
console.log('VAPID public key (safe to share / commit):');
console.log(publicKey);
