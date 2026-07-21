/**
 * ============================================================
 *  PrazoJus — Camada de Banco de Dados (PostgreSQL)
 * ============================================================
 *
 *  Lê a conexão de process.env.DATABASE_URL. Na Render, essa
 *  variável é injetada automaticamente ao vincular um banco
 *  Postgres gerenciado ao serviço web. Localmente, aponte para
 *  qualquer instância Postgres (ex: um container Docker).
 *
 *  As tabelas usam snake_case (convenção SQL); as funções deste
 *  módulo convertem cada linha para o formato camelCase que o
 *  resto da aplicação já espera, para minimizar mudanças no
 *  frontend.
 * ============================================================
 */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[ERRO] Variável DATABASE_URL não definida. Configure a conexão com o PostgreSQL antes de iniciar o servidor.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function query(texto, parametros) {
  return pool.query(texto, parametros);
}

// ── Migrações ─────────────────────────────────────────────
// Idempotentes (CREATE TABLE IF NOT EXISTS) — rodam a cada início
// do servidor, sem precisar de uma ferramenta de migração separada.
async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id UUID PRIMARY KEY,
      nome TEXT NOT NULL,
      cpf_cnpj TEXT DEFAULT '',
      email TEXT DEFAULT '',
      telefone TEXT DEFAULT '',
      link_drive TEXT DEFAULT '',
      observacoes TEXT DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS processos (
      id UUID PRIMARY KEY,
      numero TEXT NOT NULL,
      tribunal TEXT DEFAULT '',
      tribunal_alias TEXT DEFAULT '',
      classe TEXT DEFAULT '',
      classe_nome TEXT DEFAULT '',
      assuntos JSONB DEFAULT '[]',
      orgao_julgador TEXT DEFAULT '',
      orgao_julgador_nome TEXT DEFAULT '',
      cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
      partes JSONB DEFAULT '[]',
      movimentos JSONB DEFAULT '[]',
      status TEXT DEFAULT 'ativo',
      observacoes TEXT DEFAULT '',
      grau TEXT DEFAULT '',
      data_ajuizamento TEXT DEFAULT '',
      nivel_sigilo INTEGER DEFAULT 0,
      ultima_verificacao_djen TEXT DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS prazos (
      id UUID PRIMARY KEY,
      processo_id UUID REFERENCES processos(id) ON DELETE CASCADE,
      tipo TEXT DEFAULT 'outro',
      tipo_descricao TEXT DEFAULT '',
      base_legal TEXT DEFAULT '',
      data_inicio TIMESTAMPTZ,
      data_fim TIMESTAMPTZ,
      dias_prazo INTEGER DEFAULT 0,
      contagem TEXT DEFAULT 'uteis',
      status TEXT DEFAULT 'pendente',
      observacoes TEXT DEFAULT '',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS honorarios (
      id UUID PRIMARY KEY,
      cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
      processo_id UUID REFERENCES processos(id) ON DELETE SET NULL,
      descricao TEXT DEFAULT '',
      tipo TEXT DEFAULT 'contratual',
      valor NUMERIC(12,2) DEFAULT 0,
      vencimento DATE,
      status TEXT DEFAULT 'pendente',
      observacoes TEXT DEFAULT '',
      pago_em TIMESTAMPTZ,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS feriados_customizados (
      date TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      api_key TEXT DEFAULT '',
      dias_alerta_critico INTEGER DEFAULT 3,
      dias_alerta_atencao INTEGER DEFAULT 7,
      mostrar_vencidos BOOLEAN DEFAULT true,
      recesso_forense BOOLEAN DEFAULT true,
      CHECK (id = 1)
    );

    INSERT INTO config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}

// ── Conversores linha (snake_case) -> objeto (camelCase) ────

function rowToCliente(r) {
  return {
    id: r.id,
    nome: r.nome,
    cpfCnpj: r.cpf_cnpj,
    email: r.email,
    telefone: r.telefone,
    linkDrive: r.link_drive,
    observacoes: r.observacoes,
    criadoEm: r.criado_em,
  };
}

function rowToProcesso(r) {
  return {
    id: r.id,
    numero: r.numero,
    tribunal: r.tribunal,
    tribunalAlias: r.tribunal_alias,
    classe: r.classe,
    classeNome: r.classe_nome,
    assuntos: r.assuntos || [],
    orgaoJulgador: r.orgao_julgador,
    orgaoJulgadorNome: r.orgao_julgador_nome,
    clienteId: r.cliente_id || '',
    partes: r.partes || [],
    movimentos: r.movimentos || [],
    status: r.status,
    observacoes: r.observacoes,
    grau: r.grau,
    dataAjuizamento: r.data_ajuizamento,
    nivelSigilo: r.nivel_sigilo,
    ultimaVerificacaoDJEN: r.ultima_verificacao_djen,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  };
}

function rowToPrazo(r) {
  return {
    id: r.id,
    processoId: r.processo_id,
    tipo: r.tipo,
    tipoDescricao: r.tipo_descricao,
    baseLegal: r.base_legal,
    dataInicio: r.data_inicio,
    dataFim: r.data_fim,
    diasPrazo: r.dias_prazo,
    contagem: r.contagem,
    status: r.status,
    observacoes: r.observacoes,
    criadoEm: r.criado_em,
  };
}

function rowToHonorario(r) {
  return {
    id: r.id,
    clienteId: r.cliente_id || '',
    processoId: r.processo_id || '',
    descricao: r.descricao,
    tipo: r.tipo,
    valor: Number(r.valor),
    vencimento: r.vencimento,
    status: r.status,
    observacoes: r.observacoes,
    pagoEm: r.pago_em,
    criadoEm: r.criado_em,
  };
}

function rowToConfig(r) {
  return {
    apiKey: r.api_key,
    diasAlertaCritico: r.dias_alerta_critico,
    diasAlertaAtencao: r.dias_alerta_atencao,
    mostrarVencidos: r.mostrar_vencidos,
    recessoForense: r.recesso_forense,
  };
}

function rowToFeriado(r) {
  return { date: r.date, name: r.name };
}

module.exports = {
  pool,
  query,
  runMigrations,
  rowToCliente,
  rowToProcesso,
  rowToPrazo,
  rowToHonorario,
  rowToConfig,
  rowToFeriado,
};
