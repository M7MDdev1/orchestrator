#!/usr/bin/env node
// Insert a provider_calls mapping for testing settleFromProvider
const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const callId = process.argv[2];
const providerCallId = process.argv[3] || `sim-test-${Date.now()}`;
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
    await client.query('INSERT INTO provider_calls(provider_call_id, call_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [providerCallId, callId]);
    console.log('Inserted provider mapping:', providerCallId, '->', callId);
  }catch(e){ console.error(e); process.exitCode=2 } finally{ await client.end(); }
})();
