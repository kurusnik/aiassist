const knowledge = require('./service');
const KnowledgeScorer = require('./scoring/KnowledgeScorer');
const RelationResolver = require('./relations/RelationResolver');

const scorer = new KnowledgeScorer();
const relationResolver = new RelationResolver();

function _buildMeta(object, fields, relations) {
  return {
    objectType: object.type || null,
    fields: (fields || []).map(f => ({
      name: f.name,
      synonym: f.synonym,
      datatype: f.datatype,
      required: f.required,
      reference_type: f.reference_type
    })),
    relations: relations || [],
    synonym: object.synonym || null,
    comment: object.comment || null
  };
}

function _buildStructuredText(object, fields, relations) {
  const lines = [];
  lines.push(`[Knowledge Object]`);
  lines.push(`Name: ${object.full_name || object.name}`);
  lines.push(`Type: ${object.type || 'Unknown'}`);

  if (object.synonym) {
    lines.push(`Synonym: ${object.synonym}`);
  }
  if (object.comment) {
    lines.push(`Purpose: ${object.comment}`);
  }

  if (fields && fields.length > 0) {
    lines.push(``);
    lines.push(`Fields:`);
    for (const field of fields) {
      let fieldLine = `- ${field.name}`;
      if (field.synonym && field.synonym !== field.name) {
        fieldLine += ` (${field.synonym})`;
      }
      fieldLine += `: ${field.datatype || '?'}`;
      if (field.reference_type) {
        fieldLine += ` -> ${field.reference_type}`;
      }
      if (field.required) {
        fieldLine += ` [required]`;
      }
      lines.push(fieldLine);
    }
  }

  if (relations && relations.length > 0) {
    lines.push(``);
    lines.push(`Relations:`);
    for (const rel of relations) {
      lines.push(`- ${rel.type}: ${rel.target} (confidence: ${rel.confidence.toFixed(2)})`);
    }
  }

  return lines.join('\n');
}

async function build(userQuery, queryContext = null) {
  if (!userQuery || !userQuery.trim()) {
    return { found: false, objects: [] };
  }

  const matches = await knowledge.findObjects(userQuery);

  if (!matches || matches.length === 0) {
    return { found: false, objects: [] };
  }

  const matchIds = matches.map(m => m.id);
  const fullNames = matches.map(m => m.full_name || m.name);

  const [fieldsMap, relationsMap] = await Promise.all([
    knowledge.getFieldsBatch(matchIds).catch(() => ({})),
    relationResolver.resolveByFullNames(fullNames).catch(() => new Map())
  ]);

  const objects = [];
  for (const match of matches) {
    const fields = fieldsMap[match.id] || [];
    const fullName = match.full_name || match.name;
    const relations = relationsMap.get(fullName) || [];

    const enriched = {
      ...match,
      id: match.id,
      type: match.type,
      name: match.name,
      full_name: fullName,
      synonym: match.synonym,
      comment: match.comment,
      fields,
      _relations: relations
    };

    const qc = queryContext || { rawQuery: userQuery, normalizedQuery: null, intent: null, entities: [] };
    const computedScore = scorer.score(enriched, qc);

    const meta = _buildMeta(enriched, fields, relations);

    objects.push({
      id: match.id,
      type: enriched.type,
      name: enriched.name,
      full_name: enriched.full_name,
      synonym: enriched.synonym,
      comment: enriched.comment,
      score: computedScore,
      structuredText: _buildStructuredText(enriched, fields, relations),
      meta
    });
  }

  objects.sort((a, b) => b.score - a.score);

  return {
    found: objects.length > 0,
    objects
  };
}

function render(context) {
  if (!context || !context.found || !context.objects || context.objects.length === 0) {
    return 'Configuration objects not found.';
  }

  const parts = ['Found configuration objects:'];
  for (const obj of context.objects) {
    parts.push('');
    parts.push(obj.structuredText || obj.full_name || obj.name);
  }

  parts.push('');
  return parts.join('\n');
}

module.exports = { build, render };