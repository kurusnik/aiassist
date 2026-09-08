const knowledge = require('./service');

async function build(userQuery) {
  if (!userQuery || !userQuery.trim()) {
    return { found: false, objects: [] };
  }

  const matches = await knowledge.findObjects(userQuery);

  if (!matches || matches.length === 0) {
    return { found: false, objects: [] };
  }

  const objects = [];
  for (const match of matches) {
    const obj = await knowledge.getObject(match.full_name);
    if (obj) {
      objects.push({
        type: obj.type,
        name: obj.name,
        full_name: obj.full_name,
        synonym: obj.synonym,
        comment: obj.comment,
        fields: obj.fields.map(f => ({
          name: f.name,
          synonym: f.synonym,
          datatype: f.datatype,
          required: f.required,
          length: f.length,
          precision: f.precision,
          reference_type: f.reference_type
        }))
      });
    }
  }

  return {
    found: objects.length > 0,
    objects
  };
}

function render(context) {
  if (!context || !context.found || !context.objects || context.objects.length === 0) {
    return 'Объекты конфигурации не найдены.';
  }

  const MAX_FIELDS = 10;
  const parts = ['Найдены объекты конфигурации:'];

  for (const obj of context.objects) {
    parts.push('');
    parts.push(obj.full_name);

    if (obj.synonym) {
      parts.push(`  Синоним: ${obj.synonym}`);
    }
    if (obj.comment) {
      parts.push(`  Комментарий: ${obj.comment}`);
    }

    if (obj.fields && obj.fields.length > 0) {
      parts.push('  Реквизиты:');
      const shown = obj.fields.slice(0, MAX_FIELDS);
      const hidden = obj.fields.length - MAX_FIELDS;
      for (const field of shown) {
        let line = `    - ${field.name}`;
        if (field.synonym && field.synonym !== field.name) {
          line += ` (${field.synonym})`;
        }
        line += ` — ${field.datatype || '?'}`;
        if (field.reference_type) {
          line += ` -> ${field.reference_type}`;
        }
        if (field.required) {
          line += ` [обяз.]`;
        }
        parts.push(line);
      }
      if (hidden > 0) {
        parts.push(`  ... (+${hidden} реквизитов)`);
      }
    }
  }

  parts.push('');
  return parts.join('\n');
}

module.exports = { build, render };
