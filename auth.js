/**
 * ============================================================
 *  PrazoJus — Autenticação e Gerenciamento de Usuários
 * ============================================================
 *
 *  Usuários da equipe ficam na tabela "usuarios" do PostgreSQL
 *  (ver db.js). Senhas nunca são guardadas em texto puro: cada
 *  uma usa scrypt com salt aleatório, via módulo nativo "crypto"
 *  do Node (sem dependências externas para essa parte).
 * ============================================================
 */

const crypto = require('crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, 'hex');
  const testBuffer = crypto.scryptSync(password, salt, 64);

  return hashBuffer.length === testBuffer.length && crypto.timingSafeEqual(hashBuffer, testBuffer);
}

function rowToUser(r) {
  return { id: r.id, username: r.username, nome: r.nome, passwordHash: r.password_hash, criadoEm: r.criado_em };
}

async function loadUsers() {
  const resultado = await db.query('SELECT * FROM usuarios ORDER BY criado_em');
  return resultado.rows.map(rowToUser);
}

/** Retorna os usuários sem o hash de senha (seguro para expor via API) */
async function listPublicUsers() {
  const usuarios = await loadUsers();
  return usuarios.map(({ id, username, nome, criadoEm }) => ({ id, username, nome, criadoEm }));
}

async function findUserByUsername(username) {
  const resultado = await db.query('SELECT * FROM usuarios WHERE lower(username) = lower($1)', [String(username || '').trim()]);
  return resultado.rows[0] ? rowToUser(resultado.rows[0]) : null;
}

async function findUserById(id) {
  if (!id) return null;
  const resultado = await db.query('SELECT * FROM usuarios WHERE id = $1', [id]);
  return resultado.rows[0] ? rowToUser(resultado.rows[0]) : null;
}

async function createUser({ username, password, nome }) {
  const usernameLimpo = String(username || '').trim();
  if (!usernameLimpo || usernameLimpo.length < 3) {
    throw new Error('Usuário deve ter pelo menos 3 caracteres.');
  }
  if (!password || password.length < 6) {
    throw new Error('Senha deve ter pelo menos 6 caracteres.');
  }
  if (await findUserByUsername(usernameLimpo)) {
    throw new Error('Já existe um usuário com esse nome de usuário.');
  }

  const id = crypto.randomUUID();
  const resultado = await db.query(
    'INSERT INTO usuarios (id, username, nome, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
    [id, usernameLimpo, (nome || usernameLimpo).trim(), hashPassword(password)]
  );
  return rowToUser(resultado.rows[0]);
}

async function deleteUser(id) {
  const total = await db.query('SELECT count(*)::int AS total FROM usuarios');
  if (total.rows[0].total <= 1) {
    throw new Error('Não é possível remover o último usuário do sistema.');
  }

  const resultado = await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
  if (resultado.rowCount === 0) {
    throw new Error('Usuário não encontrado.');
  }
  return true;
}

/**
 * Cria o usuário administrador inicial na primeira execução (quando
 * a tabela usuarios ainda está vazia). A senha é gerada aleatoriamente
 * e retornada apenas uma vez, para exibição no console.
 */
async function ensureSeedAdmin() {
  const total = await db.query('SELECT count(*)::int AS total FROM usuarios');
  if (total.rows[0].total > 0) return null;

  const senhaGerada = crypto.randomBytes(9).toString('base64url');
  const admin = await createUser({ username: 'admin', password: senhaGerada, nome: 'Administrador' });
  return { username: admin.username, password: senhaGerada };
}

// ── Proteção contra força bruta ─────────────────────────────
// Contador simples em memória por usuário: bloqueia tentativas
// após muitas falhas seguidas em curto período. Não precisa
// persistir no banco — reiniciar o servidor já limpa os contadores.
const tentativasFalhas = new Map(); // username -> { count, bloqueadoAte }
const MAX_TENTATIVAS = 5;
const JANELA_BLOQUEIO_MS = 5 * 60 * 1000; // 5 minutos

function verificarBloqueio(username) {
  const chave = String(username || '').trim().toLowerCase();
  const registro = tentativasFalhas.get(chave);
  if (!registro) return { bloqueado: false };

  if (registro.bloqueadoAte && registro.bloqueadoAte > Date.now()) {
    const segundosRestantes = Math.ceil((registro.bloqueadoAte - Date.now()) / 1000);
    return { bloqueado: true, segundosRestantes };
  }

  return { bloqueado: false };
}

function registrarTentativaFalha(username) {
  const chave = String(username || '').trim().toLowerCase();
  const registro = tentativasFalhas.get(chave) || { count: 0, bloqueadoAte: null };
  registro.count++;

  if (registro.count >= MAX_TENTATIVAS) {
    registro.bloqueadoAte = Date.now() + JANELA_BLOQUEIO_MS;
    registro.count = 0;
  }

  tentativasFalhas.set(chave, registro);
}

function limparTentativas(username) {
  tentativasFalhas.delete(String(username || '').trim().toLowerCase());
}

module.exports = {
  loadUsers,
  listPublicUsers,
  findUserByUsername,
  findUserById,
  createUser,
  deleteUser,
  verifyPassword,
  ensureSeedAdmin,
  verificarBloqueio,
  registrarTentativaFalha,
  limparTentativas,
};
