#!/usr/bin/env node
// Usage: node scripts/inspect_call.js <callId|providerCallId> [--provider]
const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const arg = process.argv[2];
const provider = process.argv.includes('--provider');
if (!arg) { console.error('usage: node inspect_call.js <id> [--provider]'); process.exit(2); }
(async ()=>{
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT||5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try{
    if (provider) {
      const r = await client.query('SELECT * FROM provider_calls WHERE provider_call_id=$1', [arg]);
      console.log('provider_calls rows:', JSON.stringify(r.rows, null, 2));
      if (r.rows[0]){
        const c = await client.query('SELECT * FROM calls WHERE id=$1', [r.rows[0].call_id]);
        console.log('linked call:', JSON.stringify(c.rows, null, 2));
      }
    } else {
      const c = await client.query('SELECT * FROM calls WHERE id=$1', [arg]);
      console.log('calls rows:', JSON.stringify(c.rows, null, 2));
      const r = await client.query('SELECT * FROM provider_calls WHERE call_id=$1', [arg]);
      console.log('provider_calls linked:', JSON.stringify(r.rows, null, 2));
    }
  }catch(e){ console.error('query error', e); process.exitCode=3 }
  finally{ await client.end(); }
})();
