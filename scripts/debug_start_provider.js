#!/usr/bin/env node
// Debug helper: pick one IN_PROGRESS call and call startProviderCall(call)
const dotenv = require('dotenv'); dotenv.config();
const { AppDataSource } = require('../dist/data-source');
const { startProviderCall } = require('../dist/services/worker.service');
(async ()=>{
  await AppDataSource.initialize();
  const r = await AppDataSource.manager.query("SELECT * FROM calls WHERE status='IN_PROGRESS' LIMIT 1");
  if (!r[0]) { console.log('no in_progress call'); process.exit(0); }
  console.log('picked', r[0].id);
  try{
    await startProviderCall(r[0]);
    console.log('startProviderCall succeeded');
    const pc = await AppDataSource.manager.query('SELECT * FROM provider_calls WHERE call_id=$1',[r[0].id]);
    console.log('provider_calls now:', pc);
  }catch(e){ console.error('startProviderCall error', e && e.stack ? e.stack : e); }
  process.exit(0);
})();
