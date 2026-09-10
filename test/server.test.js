const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const port = 3100;
let server;
function request(pathname, options = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, options);
}

before(async () => {
  fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const legacyDatabase = new DatabaseSync(path.join(root, 'data', 'nihongo.db'));
  legacyDatabase.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      correct INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      errors_json TEXT NOT NULL DEFAULT '[]',
      streak INTEGER NOT NULL DEFAULT 0,
      last_day TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'student',
      approval_status TEXT NOT NULL DEFAULT 'pending',
      semester INTEGER NOT NULL DEFAULT 1,
      classroom TEXT NOT NULL DEFAULT '',
      profile_photo TEXT NOT NULL DEFAULT '',
      rejection_reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  legacyDatabase.close();
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) } });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Servidor não iniciou.')), 5000);
    server.stdout.on('data', output => {
      if (output.toString().includes('CILRECANTOJAPONÊS disponível')) { clearTimeout(timeout); resolve(); }
    });
    server.on('error', reject);
  });
});

after(() => {
  server.kill();
  fs.rmSync(path.join(root, 'data'), { recursive: true, force: true });
});

test('cria uma conta sem foto de perfil, salva o progresso e encerra a sessão', async () => {
  const signup = await request('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana Silva', email: 'ana@example.com', password: 'senha-segura', semester: 1, classroom: '1º A' }),
  });
  assert.equal(signup.status, 201);
  const cookie = signup.headers.get('set-cookie').split(';')[0];
  assert.equal((await signup.json()).user.name, 'Ana Silva');

  const progress = await request('/api/me/progress', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ correct: 3, total: 4, errors: [2], streak: 1, lastDay: '2026-09-09' }),
  });
  assert.equal(progress.status, 200);
  assert.deepEqual((await progress.json()).user.errors, [2]);

  const roadmap = await request('/api/curriculum', { headers: { Cookie: cookie } });
  assert.equal(roadmap.status, 200);
  assert.equal((await roadmap.json()).curriculum.length, 7);

  const completed = await request('/api/lessons/hiragana/complete', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(completed.status, 200);
  assert.deepEqual((await completed.json()).completedLessons, ['hiragana']);

  const logout = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(logout.status, 200);

  const session = await request('/api/auth/session', { headers: { Cookie: cookie } });
  assert.equal(session.status, 401);
});

test('remove a coluna de foto dos bancos existentes', () => {
  const database = new DatabaseSync(path.join(root, 'data', 'nihongo.db'));
  const columns = database.prepare('PRAGMA table_info(users)').all();
  database.close();

  assert.equal(columns.some(column => column.name === 'profile_photo'), false);
});

test('impede senha fraca e e-mail duplicado', async () => {
  const weak = await request('/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'João', email: 'joao@example.com', password: '123', semester: 1, classroom: '1º A' }),
  });
  assert.equal(weak.status, 400);

  const valid = { name: 'João', email: 'joao@example.com', password: 'senha-segura', semester: 1, classroom: '1º A' };
  assert.equal((await request('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) })).status, 201);
  assert.equal((await request('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valid) })).status, 409);
});
