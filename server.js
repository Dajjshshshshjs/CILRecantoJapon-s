const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { CURRICULUM, LESSON_IDS } = require('./curriculum');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'nihongo.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    errors_json TEXT NOT NULL DEFAULT '[]',
    streak INTEGER NOT NULL DEFAULT 0,
    last_day TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lesson_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, lesson_id)
  );
`);

const q = {
  insertUser: db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  updateProgress: db.prepare('UPDATE users SET correct = ?, total = ?, errors_json = ?, streak = ?, last_day = ? WHERE id = ?'),
  cleanSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  completedLessons: db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ? ORDER BY completed_at'),
  completeLesson: db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)'),
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  const actual = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function completedLessons(userId) { return q.completedLessons.all(userId).map(row => row.lesson_id); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, correct: user.correct, total: user.total, errors: JSON.parse(user.errors_json || '[]'), streak: user.streak, lastDay: user.last_day, completedLessons: completedLessons(user.id) }; }
function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
function cookie(req, name) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(item => item.trim().split('=')));
  return cookies[name];
}
function currentUser(req) {
  const token = cookie(req, 'nihongo_session');
  if (!token) return null;
  return q.sessionUser.get(hashToken(token), Date.now());
}
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 14;
  q.cleanSessions.run(Date.now());
  q.insertSession.run(hashToken(token), userId, expires);
  return `nihongo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 14}`;
}
function serveFile(res, pathname) {
  const file = pathname === '/' ? 'nihongo_battle_game.html' : pathname.slice(1);
  const absolute = path.resolve(ROOT, file);
  if (!absolute.startsWith(ROOT) || !fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) return json(res, 404, { error: 'Página não encontrada.' });
  const type = absolute.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(absolute).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/')) return serveFile(res, url.pathname);

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const { name = '', email = '', password = '' } = await readBody(req);
      if (name.trim().length < 2) return json(res, 400, { error: 'Informe um nome com pelo menos 2 caracteres.' });
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Informe um e-mail válido.' });
      if (password.length < 8) return json(res, 400, { error: 'A senha deve ter pelo menos 8 caracteres.' });
      if (q.userByEmail.get(email.trim().toLowerCase())) return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
      const result = q.insertUser.run(name.trim(), email.trim().toLowerCase(), hashPassword(password));
      const user = q.userById.get(Number(result.lastInsertRowid));
      return json(res, 201, { user: publicUser(user) }, { 'Set-Cookie': createSession(res, user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email = '', password = '' } = await readBody(req);
      const user = q.userByEmail.get(email.trim().toLowerCase());
      if (!user || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'E-mail ou senha incorretos.' });
      return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': createSession(res, user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = cookie(req, 'nihongo_session');
      if (token) q.deleteSession.run(hashToken(token));
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'nihongo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const user = currentUser(req);
      return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'Sessão não encontrada.' });
    }

    if (req.method === 'GET' && url.pathname === '/api/curriculum') {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: 'Faça login para acessar a trilha.' });
      return json(res, 200, { curriculum: CURRICULUM, completedLessons: completedLessons(user.id) });
    }

    const lessonMatch = url.pathname.match(/^\/api\/lessons\/([a-z0-9-]+)\/complete$/);
    if (req.method === 'POST' && lessonMatch) {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: 'Faça login para concluir uma aula.' });
      const lessonId = lessonMatch[1];
      if (!LESSON_IDS.has(lessonId)) return json(res, 404, { error: 'Aula não encontrada na trilha.' });
      q.completeLesson.run(user.id, lessonId);
      return json(res, 200, { completedLessons: completedLessons(user.id) });
    }

    if (req.method === 'PATCH' && url.pathname === '/api/me/progress') {
      const user = currentUser(req);
      if (!user) return json(res, 401, { error: 'Faça login para salvar o progresso.' });
      const { correct, total, errors, streak, lastDay } = await readBody(req);
      const validNumbers = [correct, total, streak].every(value => Number.isInteger(value) && value >= 0);
      if (!validNumbers || !Array.isArray(errors) || !errors.every(Number.isInteger) || typeof lastDay !== 'string') return json(res, 400, { error: 'Dados de progresso inválidos.' });
      q.updateProgress.run(correct, total, JSON.stringify([...new Set(errors)].slice(0, 100)), streak, lastDay.slice(0, 32), user.id);
      return json(res, 200, { user: publicUser(q.userById.get(user.id)) });
    }
    return json(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Não foi possível concluir a solicitação.' });
  }
});

server.listen(PORT, () => console.log(`Nihongo disponível em http://localhost:${PORT}`));
