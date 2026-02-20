/**
 * Smoke-тест streaming (SSE) для /assistant.
 *
 * Запуск:
 *   node scripts/stream-smoke.js
 *
 * Параметры через env (опционально):
 *   TEST_USERNAME, TEST_PASSWORD, TEST_MODEL
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.TEST_USERNAME || 'testuser';
const PASSWORD = process.env.TEST_PASSWORD || 'password123';
const MODEL = process.env.TEST_MODEL || 'openai/gpt-5.2';

function cookieFromSetCookie(setCookie) {
  // Берём только первую cookie (connect.sid)
  if (!setCookie) return '';
  const first = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return String(first).split(';')[0];
}

async function login() {
  const res = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Login failed: ${res.status} ${res.statusText} ${t}`);
  }

  const setCookie = res.headers.get('set-cookie');
  const cookie = cookieFromSetCookie(setCookie);
  if (!cookie) throw new Error('No set-cookie header from /login');

  return cookie;
}

async function createProject(cookie) {
  const res = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({ name: `stream-smoke-${Date.now()}` })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Create project failed: ${res.status} ${res.statusText} ${t}`);
  }

  return res.json();
}

async function streamAssistant(cookie, projectId) {
  const res = await fetch(`${BASE_URL}/assistant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie
    },
    body: JSON.stringify({
      projectId,
      userMessage: 'Скажи "ok" и затем допиши 20 коротких слов через пробел.',
      model: MODEL
    })
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Assistant failed: ${res.status} ${res.statusText} ${t}`);
  }

  if (!res.body) {
    throw new Error('No response body (stream)');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let startedAt = Date.now();
  let lastAt = startedAt;
  let chunkCount = 0;
  let textLen = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.split('\n').find(l => l.startsWith('data: '));
      if (!line) continue;

      const now = Date.now();
      const deltaMs = now - lastAt;
      lastAt = now;

      let payload;
      try {
        payload = JSON.parse(line.slice('data: '.length));
      } catch {
        continue;
      }

      if (payload.content) {
        chunkCount += 1;
        textLen += String(payload.content).length;
        process.stdout.write(payload.content);
        process.stderr.write(`\n[chunk#${chunkCount}] +${deltaMs}ms\n`);
      }

      if (payload.done) {
        const totalMs = Date.now() - startedAt;
        process.stderr.write(`\n[done] chunks=${chunkCount} textLen=${textLen} total=${totalMs}ms\n`);
        return;
      }
    }
  }
}

(async () => {
  const cookie = await login();
  const project = await createProject(cookie);
  await streamAssistant(cookie, project.id);
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

