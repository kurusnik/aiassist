const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

describe('Migration 019 — semantic_memory', () => {
  const TABLE_NAMES = ['semantic_concepts', 'semantic_aliases', 'semantic_mappings', 'semantic_examples'];

  async function countRows(table) {
    const result = await pool.query(`SELECT count(*)::int AS cnt FROM ${table}`);
    return result.rows[0].cnt;
  }

  async function readMigrationSQL(fileName) {
    return fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), 'utf8');
  }

  before(async () => {
    await pool.query('DROP TABLE IF EXISTS semantic_validation_logs CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_mappings CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_aliases CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_examples CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_concepts CASCADE');
  });

  it('019_semantic_memory.sql runs without error', async () => {
    const sql = await readMigrationSQL('019_semantic_memory.sql');
    await pool.query(sql);
  });

  it('creates all 4 semantic tables', async () => {
    for (const tableName of TABLE_NAMES) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
        [tableName]
      );
      assert.equal(result.rows[0].exists, true, `Table ${tableName} should exist`);
    }
  });

  it('inserts 11 semantic_concepts', async () => {
    const cnt = await countRows('semantic_concepts');
    assert.equal(cnt, 11);
  });

  it('inserts 25 semantic_aliases', async () => {
    const cnt = await countRows('semantic_aliases');
    assert.equal(cnt, 25);
  });

  it('inserts 12 semantic_mappings', async () => {
    const cnt = await countRows('semantic_mappings');
    assert.equal(cnt, 12);
  });

  it('is idempotent — re-running produces no errors', async () => {
    const sql = await readMigrationSQL('019_semantic_memory.sql');
    await pool.query(sql);
  });

  it('idempotent — no duplicate concepts after re-run', async () => {
    const cnt = await countRows('semantic_concepts');
    assert.equal(cnt, 11);
  });

  it('idempotent — no duplicate aliases after re-run', async () => {
    const cnt = await countRows('semantic_aliases');
    assert.equal(cnt, 25);
  });

  it('idempotent — no duplicate mappings after re-run', async () => {
    const cnt = await countRows('semantic_mappings');
    assert.equal(cnt, 12);
  });

  it('aliases reference existing concepts only', async () => {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS orphan_count
      FROM semantic_aliases sa
      LEFT JOIN semantic_concepts c ON c.id = sa.concept_id
      WHERE c.id IS NULL
    `);
    assert.equal(result.rows[0].orphan_count, 0);
  });

  it('mappings reference existing concepts only', async () => {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS orphan_count
      FROM semantic_mappings sm
      LEFT JOIN semantic_concepts c ON c.id = sm.concept_id
      WHERE c.id IS NULL
    `);
    assert.equal(result.rows[0].orphan_count, 0);
  });

  it('concept "бренд" has 3 aliases', async () => {
    const result = await pool.query(`
      SELECT count(*)::int AS cnt
      FROM semantic_aliases sa
      JOIN semantic_concepts c ON c.id = sa.concept_id
      WHERE c.name = 'бренд'
    `);
    assert.equal(result.rows[0].cnt, 3);
  });

  it('mapping for "контрагент" is pre-approved', async () => {
    const result = await pool.query(`
      SELECT approved FROM semantic_mappings sm
      JOIN semantic_concepts c ON c.id = sm.concept_id
      WHERE c.name = 'контрагент' AND sm.metadata_object = 'Справочник.Контрагенты'
    `);
    assert.equal(result.rows[0].approved, true);
  });

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS semantic_validation_logs CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_mappings CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_aliases CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_examples CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_concepts CASCADE');
  });
});

describe('Migration 020 — semantic_project_context', () => {
  before(async () => {
    const sql019 = fs.readFileSync(path.join(MIGRATIONS_DIR, '019_semantic_memory.sql'), 'utf8');
    await pool.query(sql019);
  });

  it('020_semantic_project_context.sql runs without error', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '020_semantic_project_context.sql'), 'utf8');
    await pool.query(sql);
  });

  it('adds project_id, source, business_term columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'semantic_mappings' AND column_name IN ('project_id', 'source', 'business_term')
      ORDER BY column_name
    `);
    assert.equal(result.rows.length, 3);
  });

  it('is idempotent — re-running produces no errors', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '020_semantic_project_context.sql'), 'utf8');
    await pool.query(sql);
  });

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS semantic_mappings CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_aliases CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_examples CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_concepts CASCADE');
  });
});

describe('Migration 021 — semantic_validation_logs', () => {
  before(async () => {
    const sql019 = fs.readFileSync(path.join(MIGRATIONS_DIR, '019_semantic_memory.sql'), 'utf8');
    await pool.query(sql019);
    const sql020 = fs.readFileSync(path.join(MIGRATIONS_DIR, '020_semantic_project_context.sql'), 'utf8');
    await pool.query(sql020);
  });

  it('021_semantic_validation_logs.sql runs without error', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '021_semantic_validation_logs.sql'), 'utf8');
    await pool.query(sql);
  });

  it('creates semantic_validation_logs table', async () => {
    const result = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'semantic_validation_logs') AS exists`
    );
    assert.equal(result.rows[0].exists, true);
  });

  it('is idempotent — re-running produces no errors', async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, '021_semantic_validation_logs.sql'), 'utf8');
    await pool.query(sql);
  });

  after(async () => {
    await pool.query('DROP TABLE IF EXISTS semantic_validation_logs CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_mappings CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_aliases CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_examples CASCADE');
    await pool.query('DROP TABLE IF EXISTS semantic_concepts CASCADE');
  });
});