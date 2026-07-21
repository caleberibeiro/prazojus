/**
 * ============================================================
 *  PrazoJus — API REST de Dados (Clientes, Processos, Prazos,
 *  Honorários, Configuração, Feriados)
 * ============================================================
 *
 *  Substitui o antigo armazenamento em localStorage: os dados
 *  agora vivem no PostgreSQL e são compartilhados por toda a
 *  equipe. Ver db.js para o schema e os conversores de linha.
 * ============================================================
 */

const express = require('express');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

/** Monta um UPDATE dinâmico só com os campos realmente presentes no corpo da requisição */
function buildUpdateQuery(table, id, fieldMap, { touchUpdatedAt = false } = {}) {
  const colunas = Object.keys(fieldMap);
  if (colunas.length === 0) return null;

  const sets = colunas.map((col, i) => `${col} = $${i + 2}`);
  if (touchUpdatedAt) sets.push('atualizado_em = now()');

  const valores = colunas.map(col => fieldMap[col]);
  const sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1 RETURNING *`;
  return { sql, valores: [id, ...valores] };
}

function presente(obj, chave) {
  return Object.prototype.hasOwnProperty.call(obj, chave);
}

// ============================================================
// CARGA INICIAL — tudo de uma vez, pro cache do frontend
// ============================================================
router.get('/tudo', async (req, res) => {
  try {
    const [clientes, processos, prazos, honorarios, feriados, configRow] = await Promise.all([
      db.query('SELECT * FROM clientes ORDER BY criado_em'),
      db.query('SELECT * FROM processos ORDER BY criado_em'),
      db.query('SELECT * FROM prazos ORDER BY criado_em'),
      db.query('SELECT * FROM honorarios ORDER BY criado_em'),
      db.query('SELECT * FROM feriados_customizados ORDER BY date'),
      db.query('SELECT * FROM config WHERE id = 1'),
    ]);

    res.json({
      clientes: clientes.rows.map(db.rowToCliente),
      processos: processos.rows.map(db.rowToProcesso),
      prazos: prazos.rows.map(db.rowToPrazo),
      honorarios: honorarios.rows.map(db.rowToHonorario),
      feriadosCustom: feriados.rows.map(db.rowToFeriado),
      config: configRow.rows[0] ? db.rowToConfig(configRow.rows[0]) : {},
    });
  } catch (erro) {
    console.error('[ERRO] Falha ao carregar dados:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao carregar dados do banco.' });
  }
});

router.delete('/tudo', async (req, res) => {
  try {
    await db.query('TRUNCATE prazos, honorarios, processos, clientes, feriados_customizados RESTART IDENTITY CASCADE');
    await db.query(`UPDATE config SET api_key = '', dias_alerta_critico = 3, dias_alerta_atencao = 7, mostrar_vencidos = true, recesso_forense = true WHERE id = 1`);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao limpar dados:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao limpar dados.' });
  }
});

// ============================================================
// CLIENTES
// ============================================================
router.post('/clientes', async (req, res) => {
  try {
    const c = req.body || {};
    if (!c.nome) return res.status(400).json({ erro: true, mensagem: 'Nome é obrigatório.' });

    const id = c.id || crypto.randomUUID();
    const resultado = await db.query(
      `INSERT INTO clientes (id, nome, cpf_cnpj, email, telefone, link_drive, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, c.nome, c.cpfCnpj || '', c.email || '', c.telefone || '', c.linkDrive || '', c.observacoes || '']
    );
    res.status(201).json(db.rowToCliente(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao criar cliente:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar cliente.' });
  }
});

router.put('/clientes/:id', async (req, res) => {
  try {
    const c = req.body || {};
    const campoMap = { nome: 'nome', cpfCnpj: 'cpf_cnpj', email: 'email', telefone: 'telefone', linkDrive: 'link_drive', observacoes: 'observacoes' };
    const fieldMap = {};
    for (const [jsKey, sqlCol] of Object.entries(campoMap)) {
      if (presente(c, jsKey)) fieldMap[sqlCol] = c[jsKey];
    }

    const query = buildUpdateQuery('clientes', req.params.id, fieldMap);
    if (!query) return res.status(400).json({ erro: true, mensagem: 'Nada para atualizar.' });

    const resultado = await db.query(query.sql, query.valores);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: true, mensagem: 'Cliente não encontrado.' });
    res.json(db.rowToCliente(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao atualizar cliente:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao atualizar cliente.' });
  }
});

router.delete('/clientes/:id', async (req, res) => {
  try {
    await db.query('UPDATE processos SET cliente_id = NULL WHERE cliente_id = $1', [req.params.id]);
    await db.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao remover cliente:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao remover cliente.' });
  }
});

// ============================================================
// PROCESSOS
// ============================================================
router.post('/processos', async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.numero) return res.status(400).json({ erro: true, mensagem: 'Número do processo é obrigatório.' });

    const existente = await db.query(
      `SELECT * FROM processos WHERE regexp_replace(numero, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')`,
      [p.numero]
    );
    if (existente.rows.length > 0) {
      return res.status(200).json(db.rowToProcesso(existente.rows[0]));
    }

    const id = p.id || crypto.randomUUID();
    const resultado = await db.query(
      `INSERT INTO processos (id, numero, tribunal, tribunal_alias, classe, classe_nome, assuntos,
        orgao_julgador, orgao_julgador_nome, cliente_id, partes, movimentos, status, observacoes,
        grau, data_ajuizamento, nivel_sigilo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [id, p.numero, p.tribunal || '', p.tribunalAlias || '', p.classe || '', p.classeNome || '',
        JSON.stringify(p.assuntos || []), p.orgaoJulgador || '', p.orgaoJulgadorNome || '',
        p.clienteId || null, JSON.stringify(p.partes || []), JSON.stringify(p.movimentos || []),
        p.status || 'ativo', p.observacoes || '', p.grau || '', p.dataAjuizamento || '', p.nivelSigilo || 0]
    );
    res.status(201).json(db.rowToProcesso(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao criar processo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar processo.' });
  }
});

router.put('/processos/:id', async (req, res) => {
  try {
    const p = req.body || {};
    const campoMap = {
      numero: 'numero', tribunal: 'tribunal', tribunalAlias: 'tribunal_alias',
      classe: 'classe', classeNome: 'classe_nome', orgaoJulgador: 'orgao_julgador',
      orgaoJulgadorNome: 'orgao_julgador_nome', status: 'status', observacoes: 'observacoes',
      ultimaVerificacaoDJEN: 'ultima_verificacao_djen',
    };
    const fieldMap = {};
    for (const [jsKey, sqlCol] of Object.entries(campoMap)) {
      if (presente(p, jsKey)) fieldMap[sqlCol] = p[jsKey];
    }
    if (presente(p, 'clienteId')) fieldMap.cliente_id = p.clienteId || null;
    if (presente(p, 'assuntos')) fieldMap.assuntos = JSON.stringify(p.assuntos);
    if (presente(p, 'partes')) fieldMap.partes = JSON.stringify(p.partes);
    if (presente(p, 'movimentos')) fieldMap.movimentos = JSON.stringify(p.movimentos);

    const query = buildUpdateQuery('processos', req.params.id, fieldMap, { touchUpdatedAt: true });
    if (!query) return res.status(400).json({ erro: true, mensagem: 'Nada para atualizar.' });

    const resultado = await db.query(query.sql, query.valores);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: true, mensagem: 'Processo não encontrado.' });
    res.json(db.rowToProcesso(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao atualizar processo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao atualizar processo.' });
  }
});

router.delete('/processos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM processos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao remover processo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao remover processo.' });
  }
});

// ============================================================
// PRAZOS
// ============================================================
router.post('/prazos', async (req, res) => {
  try {
    const p = req.body || {};
    if (!p.processoId || !p.dataFim) {
      return res.status(400).json({ erro: true, mensagem: 'processoId e dataFim são obrigatórios.' });
    }

    const id = p.id || crypto.randomUUID();
    const resultado = await db.query(
      `INSERT INTO prazos (id, processo_id, tipo, tipo_descricao, base_legal, data_inicio, data_fim, dias_prazo, contagem, status, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, p.processoId, p.tipo || 'outro', p.tipoDescricao || '', p.baseLegal || '',
        p.dataInicio || null, p.dataFim, p.diasPrazo || 0, p.contagem || 'uteis', p.status || 'pendente', p.observacoes || '']
    );
    res.status(201).json(db.rowToPrazo(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao criar prazo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar prazo.' });
  }
});

router.put('/prazos/:id', async (req, res) => {
  try {
    const p = req.body || {};
    const campoMap = {
      tipo: 'tipo', tipoDescricao: 'tipo_descricao', baseLegal: 'base_legal',
      dataInicio: 'data_inicio', dataFim: 'data_fim', diasPrazo: 'dias_prazo',
      contagem: 'contagem', status: 'status', observacoes: 'observacoes',
    };
    const fieldMap = {};
    for (const [jsKey, sqlCol] of Object.entries(campoMap)) {
      if (presente(p, jsKey)) fieldMap[sqlCol] = p[jsKey];
    }

    const query = buildUpdateQuery('prazos', req.params.id, fieldMap);
    if (!query) return res.status(400).json({ erro: true, mensagem: 'Nada para atualizar.' });

    const resultado = await db.query(query.sql, query.valores);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: true, mensagem: 'Prazo não encontrado.' });
    res.json(db.rowToPrazo(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao atualizar prazo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao atualizar prazo.' });
  }
});

router.delete('/prazos/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM prazos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao remover prazo:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao remover prazo.' });
  }
});

// ============================================================
// HONORÁRIOS
// ============================================================
router.post('/honorarios', async (req, res) => {
  try {
    const h = req.body || {};
    const id = h.id || crypto.randomUUID();
    const resultado = await db.query(
      `INSERT INTO honorarios (id, cliente_id, processo_id, descricao, tipo, valor, vencimento, status, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, h.clienteId || null, h.processoId || null, h.descricao || '', h.tipo || 'contratual',
        h.valor || 0, h.vencimento || null, h.status || 'pendente', h.observacoes || '']
    );
    res.status(201).json(db.rowToHonorario(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao criar honorário:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar honorário.' });
  }
});

router.put('/honorarios/:id', async (req, res) => {
  try {
    const h = req.body || {};
    const campoMap = { descricao: 'descricao', tipo: 'tipo', valor: 'valor', status: 'status', observacoes: 'observacoes' };
    const fieldMap = {};
    for (const [jsKey, sqlCol] of Object.entries(campoMap)) {
      if (presente(h, jsKey)) fieldMap[sqlCol] = h[jsKey];
    }
    if (presente(h, 'clienteId')) fieldMap.cliente_id = h.clienteId || null;
    if (presente(h, 'processoId')) fieldMap.processo_id = h.processoId || null;
    if (presente(h, 'vencimento')) fieldMap.vencimento = h.vencimento || null;
    if (presente(h, 'pagoEm')) fieldMap.pago_em = h.pagoEm || null;

    const query = buildUpdateQuery('honorarios', req.params.id, fieldMap);
    if (!query) return res.status(400).json({ erro: true, mensagem: 'Nada para atualizar.' });

    const resultado = await db.query(query.sql, query.valores);
    if (resultado.rows.length === 0) return res.status(404).json({ erro: true, mensagem: 'Honorário não encontrado.' });
    res.json(db.rowToHonorario(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao atualizar honorário:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao atualizar honorário.' });
  }
});

router.delete('/honorarios/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM honorarios WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao remover honorário:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao remover honorário.' });
  }
});

// ============================================================
// CONFIGURAÇÃO (singleton)
// ============================================================
router.get('/config', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM config WHERE id = 1');
    res.json(resultado.rows[0] ? db.rowToConfig(resultado.rows[0]) : {});
  } catch (erro) {
    console.error('[ERRO] Falha ao carregar configuração:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao carregar configuração.' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const c = req.body || {};
    const campoMap = {
      apiKey: 'api_key', diasAlertaCritico: 'dias_alerta_critico',
      diasAlertaAtencao: 'dias_alerta_atencao', mostrarVencidos: 'mostrar_vencidos',
      recessoForense: 'recesso_forense',
    };
    const fieldMap = {};
    for (const [jsKey, sqlCol] of Object.entries(campoMap)) {
      if (presente(c, jsKey)) fieldMap[sqlCol] = c[jsKey];
    }

    if (Object.keys(fieldMap).length === 0) {
      const atual = await db.query('SELECT * FROM config WHERE id = 1');
      return res.json(db.rowToConfig(atual.rows[0]));
    }

    const colunas = Object.keys(fieldMap);
    const sets = colunas.map((col, i) => `${col} = $${i + 1}`).join(', ');
    const valores = colunas.map(col => fieldMap[col]);
    const resultado = await db.query(`UPDATE config SET ${sets} WHERE id = 1 RETURNING *`, valores);
    res.json(db.rowToConfig(resultado.rows[0]));
  } catch (erro) {
    console.error('[ERRO] Falha ao salvar configuração:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar configuração.' });
  }
});

// ============================================================
// FERIADOS CUSTOMIZADOS
// ============================================================
router.post('/feriados', async (req, res) => {
  try {
    const { date, name } = req.body || {};
    if (!date || !name) return res.status(400).json({ erro: true, mensagem: 'Data e nome são obrigatórios.' });

    await db.query(
      'INSERT INTO feriados_customizados (date, name) VALUES ($1, $2) ON CONFLICT (date) DO UPDATE SET name = $2',
      [date, name]
    );
    const resultado = await db.query('SELECT * FROM feriados_customizados ORDER BY date');
    res.status(201).json(resultado.rows.map(db.rowToFeriado));
  } catch (erro) {
    console.error('[ERRO] Falha ao criar feriado:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao salvar feriado.' });
  }
});

router.delete('/feriados/:date', async (req, res) => {
  try {
    await db.query('DELETE FROM feriados_customizados WHERE date = $1', [req.params.date]);
    res.json({ ok: true });
  } catch (erro) {
    console.error('[ERRO] Falha ao remover feriado:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao remover feriado.' });
  }
});

module.exports = router;
