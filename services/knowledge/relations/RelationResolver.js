const pool = require('../../../db');

class RelationResolver {
  async resolve(objectId) {
    if (!objectId) return [];
    const map = await this.resolveMany([objectId]);
    return map.get(objectId) || [];
  }

  async resolveMany(objectIds) {
    const resultMap = new Map();
    if (!objectIds || objectIds.length === 0) return resultMap;

    for (const id of objectIds) {
      resultMap.set(id, []);
    }

    const [fieldRelations, registerRelations, storedRelations] = await Promise.all([
      this._resolveFieldRelationsMany(objectIds),
      this._resolveRegisterRelationsMany(objectIds),
      this._resolveStoredRelationsMany(objectIds)
    ]);

    for (const [objectId, relations] of fieldRelations) {
      const existing = resultMap.get(objectId) || [];
      existing.push(...relations);
      resultMap.set(objectId, existing);
    }

    for (const [objectId, relations] of registerRelations) {
      const existing = resultMap.get(objectId) || [];
      existing.push(...relations);
      resultMap.set(objectId, existing);
    }

    for (const [objectId, relations] of storedRelations) {
      const existing = resultMap.get(objectId) || [];
      existing.push(...relations);
      resultMap.set(objectId, existing);
    }

    return resultMap;
  }

  async resolveByFullName(fullName) {
    if (!fullName) return [];
    try {
      const result = await pool.query(
        `SELECT id FROM knowledge.objects WHERE full_name = $1`,
        [fullName]
      );
      if (!result.rows.length) return [];
      return this.resolve(result.rows[0].id);
    } catch (err) {
      console.error(`[RelationResolver] resolveByFullName error: ${err.message}`);
      return [];
    }
  }

  async resolveByFullNames(fullNames) {
    if (!fullNames || fullNames.length === 0) return new Map();
    try {
      const result = await pool.query(
        `SELECT id, full_name FROM knowledge.objects WHERE full_name = ANY($1)`,
        [fullNames]
      );
      const ids = result.rows.map(r => r.id);
      const relationMap = await this.resolveMany(ids);

      const fullNameMap = new Map();
      for (const row of result.rows) {
        fullNameMap.set(row.full_name, relationMap.get(row.id) || []);
      }
      return fullNameMap;
    } catch (err) {
      console.error(`[RelationResolver] resolveByFullNames error: ${err.message}`);
      return new Map();
    }
  }

  async _resolveFieldRelationsMany(objectIds) {
    const resultMap = new Map();
    if (!objectIds.length) return resultMap;

    try {
      const res = await pool.query(
        `SELECT f.object_id, f.name, f.synonym, f.datatype, f.reference_type
         FROM knowledge.fields f
         WHERE f.object_id = ANY($1::uuid[]) AND f.reference_type IS NOT NULL`,
        [objectIds]
      );

      for (const row of res.rows) {
        if (!resultMap.has(row.object_id)) resultMap.set(row.object_id, []);
        const relations = resultMap.get(row.object_id);

        if (row.reference_type.startsWith('Справочник.') || row.reference_type.startsWith('Документ.') || row.reference_type.startsWith('Регистр')) {
          relations.push({
            type: 'references_object',
            target: row.reference_type,
            field: row.name,
            confidence: 0.9
          });
        }

        if (row.reference_type.startsWith('Перечисление.')) {
          relations.push({
            type: 'references_enum',
            target: row.reference_type,
            field: row.name,
            confidence: 0.8
          });
        }
      }
    } catch (err) {
      console.error(`[RelationResolver] Field relations error: ${err.message}`);
    }

    for (const id of objectIds) {
      if (!resultMap.has(id)) resultMap.set(id, []);
    }

    return resultMap;
  }

  async _resolveRegisterRelationsMany(objectIds) {
    const resultMap = new Map();
    if (!objectIds.length) return resultMap;

    try {
      const registers = await pool.query(
        `SELECT o.id, o.full_name, o.name, o.type
         FROM knowledge.objects o
         WHERE o.full_name ILIKE 'Регистр%'`
      );

      const registerNames = registers.rows.map(r => r.full_name);

      for (const reg of registers.rows) {
        const regName = reg.full_name || '';
        const regType = reg.type || '';

        const refRes = await pool.query(
          `SELECT f.object_id, f.name FROM knowledge.fields f
           WHERE f.object_id = ANY($1::uuid[]) AND f.reference_type = $2`,
          [objectIds, regName]
        );

        for (const row of refRes.rows) {
          if (!resultMap.has(row.object_id)) resultMap.set(row.object_id, []);
          resultMap.get(row.object_id).push({
            type: 'related_to_register',
            target: regName,
            field: row.name,
            confidence: 0.85
          });
        }

        if (regType.includes('РегистрНакопления') || regType.includes('РегистрСведений')) {
          const suffix = regName.split('.').pop();
          if (!suffix) continue;
          const pattern = `%${suffix}%`;
          const nameRes = await pool.query(
            `SELECT f.object_id, f.name FROM knowledge.fields f
             WHERE f.object_id = ANY($1::uuid[]) AND (f.name ILIKE $2 OR f.synonym ILIKE $3)`,
            [objectIds, pattern, pattern]
          );

          for (const row of nameRes.rows) {
            if (!resultMap.has(row.object_id)) resultMap.set(row.object_id, []);
            resultMap.get(row.object_id).push({
              type: 'related_to_register',
              target: regName,
              field: row.name,
              confidence: 0.6
            });
          }
        }
      }
    } catch (err) {
      console.error(`[RelationResolver] Register relations error: ${err.message}`);
    }

    for (const id of objectIds) {
      if (!resultMap.has(id)) resultMap.set(id, []);
    }

    return resultMap;
  }

  async _resolveStoredRelationsMany(objectIds) {
    const resultMap = new Map();
    if (!objectIds.length) return resultMap;

    try {
      const outgoing = await pool.query(
        `SELECT r.from_object_id, r.relation_type, r.to_object_id, o.name, o.full_name
         FROM knowledge.relations r
         JOIN knowledge.objects o ON o.id = r.to_object_id
         WHERE r.from_object_id = ANY($1::uuid[])`,
        [objectIds]
      );

      for (const row of outgoing.rows) {
        if (!resultMap.has(row.from_object_id)) resultMap.set(row.from_object_id, []);
        resultMap.get(row.from_object_id).push({
          type: row.relation_type || 'stored_relation',
          target: row.full_name || row.name || String(row.to_object_id),
          field: null,
          confidence: 0.9
        });
      }

      const incoming = await pool.query(
        `SELECT r.to_object_id, r.relation_type, r.from_object_id, o.name, o.full_name
         FROM knowledge.relations r
         JOIN knowledge.objects o ON o.id = r.from_object_id
         WHERE r.to_object_id = ANY($1::uuid[])`,
        [objectIds]
      );

      for (const row of incoming.rows) {
        if (!resultMap.has(row.to_object_id)) resultMap.set(row.to_object_id, []);
        resultMap.get(row.to_object_id).push({
          type: (row.relation_type || 'stored_relation') + '_inverse',
          target: row.full_name || row.name || String(row.from_object_id),
          field: null,
          confidence: 0.8
        });
      }
    } catch (err) {
      console.error(`[RelationResolver] Stored relations error: ${err.message}`);
    }

    for (const id of objectIds) {
      if (!resultMap.has(id)) resultMap.set(id, []);
    }

    return resultMap;
  }
}

module.exports = RelationResolver;