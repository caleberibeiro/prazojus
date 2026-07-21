/**
 * ============================================================
 *  PrazoJus — Servidor Proxy para a API Pública do DataJud
 * ============================================================
 *
 *  Este servidor cumpre duas funções:
 *    1. Servir os arquivos estáticos do front-end (HTML/CSS/JS)
 *    2. Atuar como proxy reverso para a API do DataJud/CNJ,
 *       evitando problemas de CORS no navegador e protegendo
 *       a chave de API do usuário.
 *
 *  Requisitos: Node.js 18+ (utiliza fetch nativo)
 * ============================================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// ── Configuração ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';
const TIMEOUT_MS = 30_000; // 30 segundos de timeout para requisições

const app = express();

// ── Middlewares Globais ─────────────────────────────────────

// Habilita CORS para todas as origens (desenvolvimento local)
app.use(cors());

// Parseia o corpo da requisição como JSON (limite de 1 MB)
app.use(express.json({ limit: '1mb' }));

// Middleware de log — registra cada requisição com data/hora
app.use((req, _res, next) => {
  const agora = new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(`[${agora}] ${req.method} ${req.url}`);
  next();
});

// ── Arquivos Estáticos ──────────────────────────────────────
// Serve index.html, css/, js/ e demais assets do diretório raiz
app.use(express.static(path.join(__dirname)));

// ── Endpoint Proxy — DataJud ────────────────────────────────
/**
 * POST /api/datajud/:tribunal
 *
 * Parâmetros:
 *   - :tribunal  → alias do tribunal (ex.: tjsp, trf1, trt3, stj)
 *
 * Headers esperados:
 *   - X-DataJud-Key  → chave de API fornecida pelo CNJ
 *   - Content-Type   → application/json
 *
 * Body:
 *   - Query Elasticsearch no formato JSON
 *
 * Resposta:
 *   - Retorna o JSON da API do DataJud ou mensagem de erro
 */
app.post('/api/datajud/:tribunal', async (req, res) => {
  const { tribunal } = req.params;
  const apiKey = req.headers['x-datajud-key'];

  // Validação: chave de API obrigatória
  if (!apiKey) {
    return res.status(400).json({
      erro: true,
      mensagem: 'Chave de API não fornecida. Envie o header "X-DataJud-Key".',
    });
  }

  // Validação: alias do tribunal não pode estar vazio
  if (!tribunal || tribunal.trim() === '') {
    return res.status(400).json({
      erro: true,
      mensagem: 'Alias do tribunal não informado na URL.',
    });
  }

  // Validação: alias do tribunal — apenas letras e números (ex.: tjsp, trf1)
  if (!/^[a-zA-Z0-9_]+$/.test(tribunal)) {
    return res.status(400).json({
      erro: true,
      mensagem: 'Alias do tribunal contém caracteres inválidos. Use apenas letras, números e underline.',
    });
  }

  // Monta a URL de destino no DataJud
  const urlDestino = `${DATAJUD_BASE_URL}/api_publica_${tribunal.toLowerCase()}/_search`;

  try {
    // Cria um AbortController para controlar o timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Encaminha a requisição para o DataJud
    const respostaDataJud = await fetch(urlDestino, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `APIKey ${apiKey}`,
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    // Limpa o timeout após receber a resposta
    clearTimeout(timeoutId);

    // Tenta parsear a resposta como JSON
    let dados;
    const contentType = respostaDataJud.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      dados = await respostaDataJud.json();
    } else {
      // Se não for JSON, retorna o texto bruto como mensagem de erro
      const textoResposta = await respostaDataJud.text();
      dados = {
        erro: true,
        mensagem: 'A API do DataJud retornou uma resposta inesperada.',
        detalhes: textoResposta.substring(0, 500),
      };
    }

    // Retorna com o mesmo status code da API original
    return res.status(respostaDataJud.status).json(dados);

  } catch (erro) {
    // Tratamento de erros específicos
    if (erro.name === 'AbortError') {
      console.error(`[ERRO] Timeout ao conectar com o DataJud (${TIMEOUT_MS / 1000}s): ${urlDestino}`);
      return res.status(504).json({
        erro: true,
        mensagem: `A requisição ao DataJud excedeu o tempo limite de ${TIMEOUT_MS / 1000} segundos. Tente novamente.`,
      });
    }

    if (erro.cause?.code === 'ENOTFOUND' || erro.cause?.code === 'EAI_AGAIN') {
      console.error(`[ERRO] Não foi possível resolver o DNS do DataJud: ${erro.message}`);
      return res.status(502).json({
        erro: true,
        mensagem: 'Não foi possível conectar ao servidor do DataJud. Verifique sua conexão com a internet.',
      });
    }

    if (erro.cause?.code === 'ECONNREFUSED' || erro.cause?.code === 'ECONNRESET') {
      console.error(`[ERRO] Conexão recusada/resetada pelo DataJud: ${erro.message}`);
      return res.status(502).json({
        erro: true,
        mensagem: 'O servidor do DataJud recusou ou encerrou a conexão. Tente novamente em alguns instantes.',
      });
    }

    // Erro genérico de rede ou outro
    console.error(`[ERRO] Falha ao acessar o DataJud: ${erro.message}`);
    return res.status(500).json({
      erro: true,
      mensagem: 'Ocorreu um erro ao se comunicar com a API do DataJud.',
      detalhes: erro.message,
    });
  }
});

// ── Endpoint Proxy — DJEN (Diário de Justiça Eletrônico Nacional) ──
/**
 * GET /api/djen/comunicacao
 *
 * Proxy para a API pública do DJEN.
 * Não requer autenticação (API pública do CNJ).
 * Repassa todos os query params recebidos.
 *
 * Query params aceitos pela API:
 *   - numeroOab, ufOab, nomeAdvogado, nomeParte
 *   - numeroProcesso, siglaTribunal
 *   - dataDisponibilizacaoInicio, dataDisponibilizacaoFim
 *   - pagina, itensPorPagina (5 ou 100), meio (D ou E)
 *   - numeroComunicacao, orgaoId
 */
app.get('/api/djen/comunicacao', async (req, res) => {
  const queryString = new URLSearchParams(req.query).toString();
  const urlDestino = `https://comunicaapi.pje.jus.br/api/v1/comunicacao${queryString ? '?' + queryString : ''}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const respostaDJEN = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Repassa headers de rate limit
    const rateLimit = respostaDJEN.headers.get('x-ratelimit-limit');
    const rateRemaining = respostaDJEN.headers.get('x-ratelimit-remaining');
    if (rateLimit) res.setHeader('x-ratelimit-limit', rateLimit);
    if (rateRemaining) res.setHeader('x-ratelimit-remaining', rateRemaining);

    let dados;
    const contentType = respostaDJEN.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      dados = await respostaDJEN.json();
    } else {
      const textoResposta = await respostaDJEN.text();
      dados = {
        erro: true,
        mensagem: 'A API do DJEN retornou uma resposta inesperada.',
        detalhes: textoResposta.substring(0, 500),
      };
    }

    return res.status(respostaDJEN.status).json(dados);

  } catch (erro) {
    if (erro.name === 'AbortError') {
      return res.status(504).json({
        erro: true,
        mensagem: `Timeout ao conectar com o DJEN (${TIMEOUT_MS / 1000}s).`,
      });
    }

    if (erro.cause?.code === 'ENOTFOUND' || erro.cause?.code === 'EAI_AGAIN') {
      return res.status(502).json({
        erro: true,
        mensagem: 'Não foi possível conectar ao servidor do DJEN.',
      });
    }

    console.error(`[ERRO] Falha ao acessar o DJEN: ${erro.message}`);
    return res.status(500).json({
      erro: true,
      mensagem: 'Erro ao se comunicar com a API do DJEN.',
      detalhes: erro.message,
    });
  }
});

/**
 * GET /api/djen/tribunais
 * Retorna lista de tribunais cadastrados no DJEN.
 */
app.get('/api/djen/tribunais', async (req, res) => {
  const urlDestino = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resposta = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const dados = await resposta.json();
    return res.status(resposta.status).json(dados);

  } catch (erro) {
    console.error(`[ERRO] Falha ao listar tribunais DJEN: ${erro.message}`);
    return res.status(500).json({ erro: true, mensagem: 'Erro ao buscar tribunais do DJEN.' });
  }
});

/**
 * GET /api/djen/caderno/:sigla/:data/:meio
 * Retorna metadados e URL de download do caderno de um tribunal.
 */
app.get('/api/djen/caderno/:sigla/:data/:meio', async (req, res) => {
  const { sigla, data, meio } = req.params;
  const urlDestino = `https://comunicaapi.pje.jus.br/api/v1/caderno/${sigla}/${data}/${meio}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resposta = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const dados = await resposta.json();
    return res.status(resposta.status).json(dados);

  } catch (erro) {
    console.error(`[ERRO] Falha ao baixar caderno DJEN: ${erro.message}`);
    return res.status(500).json({ erro: true, mensagem: 'Erro ao buscar caderno do DJEN.' });
  }
});

// ── Rota Catch-All — SPA ────────────────────────────────────
// Redireciona rotas desconhecidas para o index.html (suporte a SPA)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Inicialização do Servidor ───────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║                                                      ║');
  console.log('║        ⚖️  PrazoJus — Gestão de Prazos Judiciais     ║');
  console.log('║                                                      ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║                                                      ║');
  console.log(`║   🌐 Servidor rodando em: http://localhost:${PORT}      ║`);
  console.log('║   📡 Proxy DataJud:       /api/datajud/:tribunal     ║');
  console.log('║   📡 Proxy DJEN:          /api/djen/comunicacao       ║');
  console.log('║                                                      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
