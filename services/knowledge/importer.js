const pool = require('../../db');
const { onecConnectionManager, onecToolClient } = require('../mcp');

const CATEGORIES = [
  { type: 'Документ',        представление: 'Документы' },
  { type: 'Справочник',      представление: 'Справочники' },
  { type: 'РегистрСведений',    представление: 'Регистры сведений' },
  { type: 'РегистрНакопления',  представление: 'Регистры накопления' },
  { type: 'Перечисление',        представление: 'Перечисления' }
];

function normalizeMcpResponse(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (Array.isArray(raw.content) && raw.content.length > 0 && typeof raw.content[0].text === 'string') {
    const text = raw.content[0].text;
    try { return JSON.parse(text); } catch (_) { return text; }
  }
  return raw;
}

class KnowledgeImporter {
  constructor() {
    this.stats = {
      objects: 0,
      fields: 0,
      relations: 0,
      skipped: 0,
      startTime: null,
      endTime: null
    };
  }

  async import() {
    this.stats.startTime = Date.now();
    console.log('=== Knowledge Import ===');

    const connected = await this._connect();
    if (!connected) {
      console.log('MCP connection failed or disabled. Cannot import.');
      return false;
    }

    await this._clearTables();
    const configId = await this._importConfiguration();

    for (const cat of CATEGORIES) {
      await this._importObjectsByType(cat, configId);
    }

    await this._importRelations();

    await this._disconnect();
    this.stats.endTime = Date.now();
    this._printStats();
    return true;
  }

  async _connect() {
    if (onecConnectionManager.isConnected()) return true;
    if (!onecConnectionManager.config.enabled) {
      console.log('1C MCP is disabled (ONEC_MCP_ENABLED != true). Skipping import.');
      return false;
    }
    console.log('Connecting to 1C MCP...');
    return onecConnectionManager.connect();
  }

  async _disconnect() {
    onecConnectionManager.disconnect();
  }

  async _clearTables() {
    console.log('Clearing knowledge tables...');
    await pool.query('DELETE FROM knowledge.relations');
    await pool.query('DELETE FROM knowledge.fields');
    await pool.query('DELETE FROM knowledge.objects');
    await pool.query('DELETE FROM knowledge.configurations');
    console.log('Tables cleared.');
  }

  async _importConfiguration() {
    let name = 'Unknown';
    let version = null;
    let platform = null;

    try {
      const raw = await onecToolClient.config();
      if (raw.success) {
        const info = normalizeMcpResponse(raw.data);
        if (info && typeof info === 'object') {
          name = info.name || info.Name || info.Имя || info.Наименование || 'Unknown';
          version = info.version || info.Version || info.Версия || null;
          platform = info.platform || info.Platform || info.Платформа || null;
        }
      }
    } catch (err) {
      console.log(`Could not load config info: ${err.message}`);
    }

    const result = await pool.query(
      `INSERT INTO knowledge.configurations (name, version, platform) VALUES ($1, $2, $3) RETURNING id`,
      [name, version, platform]
    );
    const configId = result.rows[0].id;
    console.log(`Configuration: ${name} v${version || 'N/A'} (platform: ${platform || 'N/A'})`);
    return configId;
  }

  async _importObjectsByType(cat, configId) {
    console.log(`Loading objects of type "${cat.type}"...`);

    const raw = await onecToolClient._callTool('describe', { type: cat.type });
    if (!raw.success) {
      console.log(`  Category "${cat.type}" not available via MCP: ${raw.error}. Skipping.`);
      this.stats.skipped++;
      return;
    }

    const objects = normalizeMcpResponse(raw.data);
    if (!Array.isArray(objects)) {
      console.log(`  Category "${cat.type}" returned unexpected format. Skipping.`);
      this.stats.skipped++;
      return;
    }

    console.log(`  Found ${objects.length} objects`);
    for (const obj of objects) {
      await this._importObject(obj, cat.type, configId);
    }
  }

  async _importObject(obj, type, configId) {
    const name = obj.Имя || obj.name || obj.Name || '';
    const synonym = obj.Синоним || obj.synonym || obj.Synonym || null;
    let fullName = obj.ПолноеИмя || obj.full_name || obj.fullName || obj.FullName || '';
    const comment = obj.Комментарий || obj.comment || obj.Comment || null;

    // Обрезка аномально длинных full_name (безопасность для hash-индекса)
    if (fullName.length > 500) {
      console.log(`  Предупреждение: full_name обрезан с ${fullName.length} до 500 символов для объекта "${name}"`);
      fullName = fullName.substring(0, 500);
    }

    if (!name) {
      console.log(`  Skipping object with no name in category ${type}`);
      this.stats.skipped++;
      return;
    }

    const objectType = obj.Тип || type;
    const displayName = fullName || name;
    console.log(`  Object: ${displayName}`);

    const result = await pool.query(
      `INSERT INTO knowledge.objects (configuration_id, type, name, synonym, full_name, comment)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [configId, objectType, name, synonym, fullName, comment]
    );
    const objectId = result.rows[0].id;
    this.stats.objects++;

    await this._importFields(objectId, fullName);
  }

  async _importFields(objectId, fullName) {
    if (!fullName) return;

    try {
      const raw = await onecToolClient.getStructure(fullName);
      if (!raw.success) {
        console.log(`    getStructure failed: ${raw.error}`);
        return;
      }

      const structure = normalizeMcpResponse(raw.data);
      if (!structure || typeof structure !== 'object') return;

      const tables = structure.Таблицы || structure.tables || structure.Tables;
      if (!tables || typeof tables !== 'object') {
        console.log(`    No tables in structure response`);
        return;
      }

      let fieldsCount = 0;
      for (const tKey of Object.keys(tables)) {
        const table = tables[tKey];
        if (!table || typeof table !== 'object') continue;

        const tableName = table.Имя || table.name || '';

        const fields = table.Поля || table.fields || table.Poly;
        if (!Array.isArray(fields)) continue;

        for (const field of fields) {
          await this._importField(objectId, field);
          fieldsCount++;
        }
      }

      if (fieldsCount > 0) {
        console.log(`    Fields: ${fieldsCount}`);
      }
    } catch (err) {
      console.log(`    Error loading fields for ${fullName}: ${err.message}`);
    }
  }

  async _importField(objectId, field) {
    const name = field.Имя || field.name || field.Name || '';
    if (!name) {
      this.stats.skipped++;
      return null;
    }

    const synonym = field.Синоним || field.synonym || field.Synonym || null;
    let datatype = field.Тип || field.datatype || field.Type || field.dataType || null;
    const required = field.Обязательное || field.required || field.Required || false;
    const length = field.Длина || field.length || field.Length || null;
    const precision = field.Точность || field.precision || field.Precision || null;
    let referenceType = field.ТипСсылки || field.reference_type || field.referenceType || field.ReferenceType || null;

    if (datatype && datatype.startsWith('Справочник.') || datatype && datatype.startsWith('Документ.') || datatype && datatype.startsWith('Регистр') || datatype && datatype.startsWith('Перечисление.')) {
      referenceType = datatype;
      if (!datatype.includes('.')) {
        datatype = 'Ссылка';
      } else if (datatype.startsWith('Перечисление.')) {
        datatype = 'Перечисление';
      } else if (datatype.includes('.')) {
        datatype = datatype.split('.')[0];
      }
    }

    const requiredBool = required === true || required === 'true' || required === 1 || required === '1' || required === 'Да';

    try {
      const result = await pool.query(
        `INSERT INTO knowledge.fields (object_id, name, synonym, datatype, required, length, precision, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [objectId, name, synonym, datatype, requiredBool, length ? parseInt(length, 10) : null, precision ? parseInt(precision, 10) : null, referenceType]
      );
      this.stats.fields++;
      return { id: result.rows[0].id, name, referenceType };
    } catch (err) {
      console.log(`      Error saving field "${name}": ${err.message}`);
      this.stats.skipped++;
      return null;
    }
  }

  async _importRelations() {
    console.log('Building relations from field references...');
    let relationsCount = 0;

    try {
      const fieldsResult = await pool.query(
        `SELECT f.object_id AS from_object_id, f.name AS from_field, f.reference_type
         FROM knowledge.fields f
         WHERE f.reference_type IS NOT NULL AND f.reference_type != ''`
      );

      for (const field of fieldsResult.rows) {
        const refType = field.reference_type;

        let relationType = null;
        if (refType.startsWith('Справочник.') || refType.startsWith('Документ.')) {
          relationType = 'references_object';
        } else if (refType.startsWith('Перечисление.')) {
          relationType = 'references_enum';
        } else if (refType.startsWith('Регистр')) {
          relationType = 'related_to_register';
        }

        if (!relationType) continue;

        const targetResult = await pool.query(
          `SELECT id FROM knowledge.objects WHERE full_name = $1`,
          [refType]
        );
        if (targetResult.rows.length === 0) continue;

        const toObjectId = targetResult.rows[0].id;

        await pool.query(
          `INSERT INTO knowledge.relations (from_object_id, from_field, to_object_id, relation_type)
           VALUES ($1, $2, $3, $4)`,
          [field.from_object_id, field.from_field, toObjectId, relationType]
        );
        relationsCount++;
      }
    } catch (err) {
      console.log(`Error building relations: ${err.message}`);
    }

    this.stats.relations = relationsCount;
    console.log(`Relations created: ${relationsCount}`);
  }

  _printStats() {
    const elapsed = ((this.stats.endTime - this.stats.startTime) / 1000).toFixed(2);
    console.log('');
    console.log('=== Import Complete ===');
    console.log(`Configuration:    1`);
    console.log(`Objects imported: ${this.stats.objects}`);
    console.log(`Fields imported:  ${this.stats.fields}`);
    console.log(`Relations built:  ${this.stats.relations}`);
    console.log(`Skipped:          ${this.stats.skipped}`);
    console.log(`Elapsed time:     ${elapsed}s`);
    console.log('=======================');
  }
}

module.exports = KnowledgeImporter;
