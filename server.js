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
    role TEXT NOT NULL DEFAULT 'student',
    approval_status TEXT NOT NULL DEFAULT 'pending',
    semester INTEGER NOT NULL DEFAULT 1,
    classroom TEXT NOT NULL DEFAULT '',
    profile_photo TEXT NOT NULL DEFAULT '',
    rejection_reason TEXT NOT NULL DEFAULT '',
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
  CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, author TEXT NOT NULL, description TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', semester INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS achievements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '🏆', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', semester INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS grades (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), subject TEXT NOT NULL, score REAL NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id), semester INTEGER NOT NULL, classroom TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const q = {
  insertUser: db.prepare('INSERT INTO users (name, email, password_hash, role, approval_status, semester, classroom, profile_photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  userCount: db.prepare('SELECT COUNT(*) AS count FROM users'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
  sessionUser: db.prepare('SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  updateProgress: db.prepare('UPDATE users SET correct = ?, total = ?, errors_json = ?, streak = ?, last_day = ? WHERE id = ?'),
  cleanSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
  completedLessons: db.prepare('SELECT lesson_id FROM lesson_progress WHERE user_id = ? ORDER BY completed_at'),
  completeLesson: db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)'),
  listBooks: db.prepare('SELECT * FROM books WHERE semester <= ? ORDER BY semester, created_at DESC'),
  listVideos: db.prepare('SELECT * FROM videos WHERE semester <= ? ORDER BY semester, created_at DESC'),
  listMessages: db.prepare('SELECT messages.*, users.name FROM messages JOIN users ON users.id = messages.user_id WHERE messages.semester = ? AND messages.classroom = ? ORDER BY messages.id DESC LIMIT 80'),
  listGrades: db.prepare('SELECT * FROM grades WHERE user_id = ? ORDER BY created_at DESC'),
  listUsers: db.prepare('SELECT id, name, email, role, approval_status, semester, classroom, rejection_reason, correct, total, streak, created_at FROM users ORDER BY created_at'),
  addBook: db.prepare('INSERT INTO books (title, author, description, url, semester) VALUES (?, ?, ?, ?, ?)'),
  addVideo: db.prepare('INSERT INTO videos (title, url, description, semester) VALUES (?, ?, ?, ?)'),
  addAchievement: db.prepare('INSERT INTO achievements (title, description, icon) VALUES (?, ?, ?)'),
  listAchievements: db.prepare('SELECT * FROM achievements ORDER BY id DESC'),
  addMessage: db.prepare('INSERT INTO messages (user_id, semester, classroom, content) VALUES (?, ?, ?, ?)'),
  setApproval: db.prepare("UPDATE users SET approval_status = ?, rejection_reason = ? WHERE id = ?"),
  setSemester: db.prepare('UPDATE users SET semester = ? WHERE id = ?'),
  addGrade: db.prepare('INSERT INTO grades (user_id, subject, score, note) VALUES (?, ?, ?, ?)'),
  setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  setting: db.prepare('SELECT value FROM settings WHERE key = ?'),
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
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, approvalStatus: user.approval_status, semester: user.semester, classroom: user.classroom, profilePhoto: user.profile_photo, rejectionReason: user.rejection_reason, correct: user.correct, total: user.total, errors: JSON.parse(user.errors_json || '[]'), streak: user.streak, lastDay: user.last_day, completedLessons: completedLessons(user.id) }; }
function requireAdmin(req, res) { const user = currentUser(req); if (!user || user.role !== 'admin') { json(res, 403, { error: 'Acesso exclusivo do administrador.' }); return null; } return user; }
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
  const type = absolute.endsWith('.html') ? 'text/html; charset=utf-8' : absolute.endsWith('.webmanifest') ? 'application/manifest+json; charset=utf-8' : absolute.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(absolute).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (!url.pathname.startsWith('/api/')) return serveFile(res, url.pathname);

    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const { name = '', email = '', password = '', semester, classroom = '', profilePhoto = '' } = await readBody(req);
      if (name.trim().length < 2) return json(res, 400, { error: 'Informe um nome com pelo menos 2 caracteres.' });
      if (!/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Informe um e-mail válido.' });
      if (password.length < 8) return json(res, 400, { error: 'A senha deve ter pelo menos 8 caracteres.' });
      if (!Number.isInteger(semester) || semester < 1 || semester > 12) return json(res, 400, { error: 'Selecione um semestre válido.' });
      if (classroom.trim().length < 1 || classroom.trim().length > 40) return json(res, 400, { error: 'Informe sua turma.' });
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(profilePhoto) || profilePhoto.length > 2_700_000) return json(res, 400, { error: 'Envie uma foto de rosto em JPG, PNG ou WEBP de até 2 MB.' });
      if (q.userByEmail.get(email.trim().toLowerCase())) return json(res, 409, { error: 'Este e-mail já está cadastrado.' });
      const isFirstAccount = q.userCount.get().count === 0;
      const result = q.insertUser.run(name.trim(), email.trim().toLowerCase(), hashPassword(password), isFirstAccount ? 'admin' : 'student', isFirstAccount ? 'approved' : 'pending', semester, classroom.trim(), profilePhoto);
      const user = q.userById.get(Number(result.lastInsertRowid));
      return json(res, 201, { user: publicUser(user), pending: !isFirstAccount }, { 'Set-Cookie': createSession(res, user.id) });
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const { email = '', password = '' } = await readBody(req);
      const user = q.userByEmail.get(email.trim().toLowerCase());
      if (!user || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'E-mail ou senha incorretos.' });
      if (user.approval_status === 'rejected') return json(res, 403, { error: `Cadastro recusado: ${user.rejection_reason || 'fale com a administração.'}` });
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

    if (req.method === 'GET' && url.pathname === '/api/books') { const user = currentUser(req); return user ? json(res, 200, { books: q.listBooks.all(user.semester) }) : json(res, 401, { error: 'Faça login.' }); }
    if (req.method === 'GET' && url.pathname === '/api/videos') { const user = currentUser(req); return user ? json(res, 200, { videos: q.listVideos.all(user.semester) }) : json(res, 401, { error: 'Faça login.' }); }
    if (req.method === 'GET' && url.pathname === '/api/rules') return json(res, 200, { rules: q.setting.get('rules')?.value || 'Respeite colegas, professores e os horários. Use o chat apenas para fins de estudo.' });
    if (req.method === 'GET' && url.pathname === '/api/chat') { const user = currentUser(req); return user ? json(res, 200, { messages: q.listMessages.all(user.semester, user.classroom).reverse() }) : json(res, 401, { error: 'Faça login.' }); }
    if (req.method === 'POST' && url.pathname === '/api/chat') { const user = currentUser(req); if (!user) return json(res, 401, { error: 'Faça login.' }); const { content = '' } = await readBody(req); if (content.trim().length < 1 || content.length > 500) return json(res, 400, { error: 'A mensagem deve ter até 500 caracteres.' }); q.addMessage.run(user.id, user.semester, user.classroom, content.trim()); return json(res, 201, { ok: true }); }

    if (url.pathname.startsWith('/api/admin/')) {
      const admin = requireAdmin(req, res); if (!admin) return;
      if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') { const students = q.listUsers.all(); return json(res, 200, { students, books: q.listBooks.all(99), videos: q.listVideos.all(99), achievements: q.listAchievements.all(), rules: q.setting.get('rules')?.value || '', insight: students.map(s => ({ id:s.id, name:s.name, signal:s.total ? `${Math.round(s.correct / s.total * 100)}% de acertos em ${s.total} respostas` : 'Ainda sem atividade', recommendation:s.total && s.correct / s.total < .6 ? 'Sugira revisão e prática fácil.' : 'Pronto para novos desafios.' })) }); }
      if (req.method === 'POST' && url.pathname === '/api/admin/books') { const {title='',author='',description='',url='',semester}=await readBody(req); if(!title.trim()||!author.trim()||!Number.isInteger(semester)) return json(res,400,{error:'Preencha título, autor e semestre.'}); q.addBook.run(title.trim(),author.trim(),description.trim(),url.trim(),semester); return json(res,201,{ok:true}); }
      if (req.method === 'POST' && url.pathname === '/api/admin/videos') { const {title='',url='',description='',semester}=await readBody(req); if(!title.trim()||!/^https?:\/\//.test(url)||!Number.isInteger(semester)) return json(res,400,{error:'Informe título, link de vídeo e semestre.'}); q.addVideo.run(title.trim(),url.trim(),description.trim(),semester); return json(res,201,{ok:true}); }
      if (req.method === 'POST' && url.pathname === '/api/admin/achievements') { const {title='',description='',icon='🏆'}=await readBody(req); if(!title.trim()) return json(res,400,{error:'Informe o título da conquista.'}); q.addAchievement.run(title.trim(),description.trim(),icon.slice(0,8)); return json(res,201,{ok:true}); }
      if (req.method === 'PUT' && url.pathname === '/api/admin/rules') { const {rules=''}=await readBody(req); if(!rules.trim()) return json(res,400,{error:'As regras não podem ficar vazias.'}); q.setSetting.run('rules',rules.trim()); return json(res,200,{ok:true}); }
      const studentMatch=url.pathname.match(/^\/api\/admin\/students\/(\d+)\/(approve|reject|semester|grade)$/);
      if (req.method === 'POST' && studentMatch) { const [,id,action]=studentMatch; const student=q.userById.get(Number(id)); if(!student) return json(res,404,{error:'Aluno não encontrado.'}); const body=await readBody(req); if(action==='approve') q.setApproval.run('approved','',student.id); if(action==='reject') { if(!body.justification?.trim()) return json(res,400,{error:'A reprovação exige justificativa.'}); q.setApproval.run('rejected',body.justification.trim(),student.id); } if(action==='semester') { if(!Number.isInteger(body.semester)||body.semester<1||body.semester>12) return json(res,400,{error:'Semestre inválido.'}); q.setSemester.run(body.semester,student.id); } if(action==='grade') { if(!body.subject?.trim()||typeof body.score!=='number'||body.score<0||body.score>10) return json(res,400,{error:'Informe disciplina e nota de 0 a 10.'}); q.addGrade.run(student.id,body.subject.trim(),body.score,(body.note||'').trim()); } return json(res,200,{ok:true}); }
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
