/**
 * ============================================================
 *  PrazoJus — Autenticação e Gerenciamento de Usuários
 * ============================================================
 *
 *  Armazena os usuários da equipe em data/users.json (fora do
 *  controle de versão — contém hashes de senha). Senhas nunca
 *  são guardadas em texto puro: cada uma usa scrypt com salt
 *  aleatório, via módulo nativo "crypto" do Node (sem
 *  dependências externas para essa parte).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

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

function loadUsers() {
  ensureDataDir();
  if (!fs.existsSync(USERS_FILE)) return [];

  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch (erro) {
    console.error('[ERRO] Falha ao ler data/users.json:', erro.message);
    return [];
  }
}

function saveUsers(users) {
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

/** Retorna os usuários sem o hash de senha (seguro para expor via API) */
function listPublicUsers() {
  return loadUsers().map(({ id, username, nome, criadoEm }) => ({ id, username, nome, criadoEm }));
}

function findUserByUsername(username) {
  const alvo = String(username || '').trim().toLowerCase();
  return loadUsers().find(u => u.username.toLowerCase() === alvo) || null;
}

function findUserById(id) {
  return loadUsers().find(u => u.id === id) || null;
}

function createUser({ username, password, nome }) {
  const usernameLimpo = String(username || '').trim();
  if (!usernameLimpo || usernameLimpo.length < 3) {
    throw new Error('Usuário deve ter pelo menos 3 caracteres.');
  }
  if (!password || password.length < 6) {
    throw new Error('Senha deve ter pelo menos 6 caracteres.');
  }
  if (findUserByUsername(usernameLimpo)) {
    throw new Error('Já existe um usuário com esse nome de usuário.');
  }

  const users = loadUsers();
  const novoUsuario = {
    id: crypto.randomUUID(),
    username: usernameLimpo,
    nome: (nome || usernameLimpo).trim(),
    passwordHash: hashPassword(password),
    criadoEm: new Date().toISOString(),
  };

  users.push(novoUsuario);
  saveUsers(users);
  return novoUsuario;
}

function deleteUser(id) {
  const users = loadUsers();
  if (users.length <= 1) {
    throw new Error('Não é possível remover o último usuário do sistema.');
  }

  const filtrados = users.filter(u => u.id !== id);
  if (filtrados.length === users.length) {
    throw new Error('Usuário não encontrado.');
  }

  saveUsers(filtrados);
  return true;
}

/**
 * Cria o usuário administrador inicial na primeira execução (quando
 * data/users.json ainda não existe ou está vazio). A senha é gerada
 * aleatoriamente e retornada apenas uma vez, para exibição no console.
 */
function ensureSeedAdmin() {
  if (loadUsers().length > 0) return null;

  const senhaGerada = crypto.randomBytes(9).toString('base64url');
  const admin = createUser({ username: 'admin', password: senhaGerada, nome: 'Administrador' });
  return { username: admin.username, password: senhaGerada };
}

// ── Proteção contra força bruta ─────────────────────────────
// Contador simples em memória por usuário: bloqueia tentativas
// após muitas falhas seguidas em curto período.
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
