// scripts/diagnostics.mjs
import 'dotenv/config';
import os from 'os';
import fs from 'fs';
import path from 'path';
import process from 'process';
import fetch from 'node-fetch';
import pg from 'pg';

function safe(v) { return v ? 'SET' : 'MISSING'; }

async function checkDb() {
  const res = { ok: false, tables: [], errors: [] };
  if (!process.env.DATABASE_URL) {
    res.errors.push('DATABASE_URL is missing');
    return res;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('users','projects','messages')
      ORDER BY table_name ASC
    `);
    res.tables = rows.map(r => r.table_name);
    res.ok = true;
  } catch (e) {
    res.errors.push(e.message);
  } finally {
    await client.end().catch(()=>{});
  }
  return res;
}

async function checkServer() {
  const url = `http://localhost:${process.env.PORT || 3000}/health`;
  try {
    const r = await fetch(url, { timeout: 3000 }).catch(err => { throw err; });
    const ok = r.ok;
    let body = null;
    try { body = await r.json(); } catch {}
    return { ok, status: r.status, body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json','utf8')) : null;
  const diagnostics = {
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    node: process.version,
    cwd: process.cwd(),
    env: {
      PORT: process.env.PORT || '3000',
      DATABASE_URL: safe(process.env.DATABASE_URL),
      OPENROUTER_API_KEY: safe(process.env.OPENROUTER_API_KEY),
      OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || '(default)'
    },
    package: {
      name: pkg?.name,
      engines: pkg?.engines,
      scripts: pkg?.scripts,
      deps: Object.keys(pkg?.dependencies || {}).slice(0,50),
      devDeps: Object.keys(pkg?.devDependencies || {}).slice(0,50),
    },
    files: {
      hasServer: fs.existsSync('server.js'),
      hasDb: fs.existsSync('db.js'),
      hasOpenRouter: fs.existsSync('openrouter.js'),
      hasPublic: fs.existsSync('public'),
      hasSql: fs.existsSync('sql') || fs.existsSync('schema.sql')
    },
    checks: {
      db: await checkDb(),
      server: await checkServer()
    }
  };
  console.log(JSON.stringify(diagnostics, null, 2));
}

main().catch(e => {
  console.error('Diagnostics failed:', e);
  process.exit(1);
});