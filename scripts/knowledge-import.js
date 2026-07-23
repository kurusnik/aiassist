#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const KnowledgeImporter = require('../services/knowledge/importer');

async function main() {
  const importer = new KnowledgeImporter();
  try {
    const ok = await importer.import();
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
