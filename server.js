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
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { fetch, ProxyAgent } = require('undici');
// Usa o fetch exportado pelo pacote undici (não o global do Node) porque só
// ele respeita a opção "dispatcher" usada para rotear pelo proxy do DJEN.
const auth = require('./auth');
const db = require('./db');
const dataRoutes = require('./dataRoutes');

// ── Configuração ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';
const TIMEOUT_MS = 30_000; // 30 segundos de timeout para requisições

// Alguns provedores (DataJud, DJEN) filtram/bloqueiam requisições sem um
// User-Agent de navegador, servindo uma página HTML de bloqueio em vez do
// JSON esperado — isso é mais comum vindo de IPs de datacenter (ex: Render)
// do que de conexões residenciais, por isso o problema não aparece local.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * O DJEN roda atrás de um CloudFront configurado para bloquear por país —
 * de fora do Brasil (ex: Render hospedado nos EUA), a resposta é uma página
 * de erro da AWS, não da API. Detecta esse caso pra dar uma mensagem
 * honesta em vez de "resposta inesperada".
 */
function mensagemErroDJEN(textoResposta) {
  if (/CloudFront distribution is configured to block access from your country/i.test(textoResposta)) {
    return 'A API do DJEN bloqueia acesso de fora do Brasil (CloudFront). Isso é uma restrição de rede do próprio DJEN, não um erro do sistema — funciona normalmente se o servidor estiver hospedado no Brasil ou você acessar localmente.';
  }
  return 'A API do DJEN retornou uma resposta inesperada.';
}

// Proxy HTTP opcional (com saída no Brasil) só para as chamadas ao DJEN —
// contorna o bloqueio por país do CloudFront sem afetar o DataJud, que
// já funciona normalmente de qualquer região.
// Formato esperado: http://usuario:senha@host:porta
const DJEN_PROXY_URL = process.env.DJEN_PROXY_URL || '';
const djenProxyAgent = DJEN_PROXY_URL ? new ProxyAgent(DJEN_PROXY_URL) : null;

if (DJEN_PROXY_URL) {
  console.log(`[INFO] Proxy configurado para chamadas ao DJEN: ${new URL(DJEN_PROXY_URL).hostname}`);
}

/** Opções extras de fetch para rotear uma requisição pelo proxy do DJEN, se configurado */
function opcoesProxyDJEN() {
  return djenProxyAgent ? { dispatcher: djenProxyAgent } : {};
}

// Segredo de sessão gerado a cada início do servidor. Como o armazenamento
// de sessões é em memória (reinicia junto com o servidor), não há motivo
// para persistir esse valor em disco.
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

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

// Sessão de login (cookie assinado, HttpOnly)
app.use(session({
  name: 'prazojus.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  },
}));

// ── Autenticação — usuário atual em req.usuario, se logado ──
app.use(async (req, res, next) => {
  try {
    if (req.session?.userId) {
      req.usuario = await auth.findUserById(req.session.userId);
    }
    next();
  } catch (erro) {
    console.error('[ERRO] Falha ao carregar usuário da sessão:', erro.message);
    next();
  }
});

// Login desativado: para reativar, troque para true (o restante do sistema
// de contas/sessão continua intacto e funcionando normalmente).
const AUTH_ENABLED = false;

function requireAuth(req, res, next) {
  if (!AUTH_ENABLED || req.usuario) return next();

  // Requisições de API recebem 401 JSON; navegação de página vai pro login
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ erro: true, mensagem: 'Sessão expirada ou não autenticada. Faça login novamente.' });
  }

  return res.redirect('/login.html');
}

// ── Página de login e assets públicos (sem autenticação) ────
app.get('/login.html', (req, res) => {
  if (req.usuario) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js/login.js', express.static(path.join(__dirname, 'js', 'login.js')));

// ── Endpoints de Autenticação ────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ erro: true, mensagem: 'Informe usuário e senha.' });
    }

    const bloqueio = auth.verificarBloqueio(username);
    if (bloqueio.bloqueado) {
      return res.status(429).json({
        erro: true,
        mensagem: `Muitas tentativas com este usuário. Tente novamente em ${Math.ceil(bloqueio.segundosRestantes / 60)} minuto(s).`,
      });
    }

    const usuario = await auth.findUserByUsername(username);
    if (!usuario || !auth.verifyPassword(password, usuario.passwordHash)) {
      auth.registrarTentativaFalha(username);
      return res.status(401).json({ erro: true, mensagem: 'Usuário ou senha inválidos.' });
    }

    auth.limparTentativas(username);
    req.session.regenerate((err) => {
      if (err) {
        console.error('[ERRO] Falha ao criar sessão:', err.message);
        return res.status(500).json({ erro: true, mensagem: 'Erro ao criar sessão.' });
      }
      req.session.userId = usuario.id;
      res.json({ id: usuario.id, username: usuario.username, nome: usuario.nome });
    });
  } catch (erro) {
    console.error('[ERRO] Falha no login:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao processar login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('prazojus.sid');
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.usuario) {
    return res.status(401).json({ erro: true, mensagem: 'Não autenticado.' });
  }
  res.json({ id: req.usuario.id, username: req.usuario.username, nome: req.usuario.nome });
});

app.get('/api/auth/users', requireAuth, async (req, res) => {
  try {
    res.json(await auth.listPublicUsers());
  } catch (erro) {
    console.error('[ERRO] Falha ao listar usuários:', erro.message);
    res.status(500).json({ erro: true, mensagem: 'Erro ao listar usuários.' });
  }
});

app.post('/api/auth/users', requireAuth, async (req, res) => {
  try {
    const novoUsuario = await auth.createUser(req.body || {});
    res.status(201).json({ id: novoUsuario.id, username: novoUsuario.username, nome: novoUsuario.nome, criadoEm: novoUsuario.criadoEm });
  } catch (erro) {
    res.status(400).json({ erro: true, mensagem: erro.message });
  }
});

app.delete('/api/auth/users/:id', requireAuth, async (req, res) => {
  if (req.params.id === req.usuario.id) {
    return res.status(400).json({ erro: true, mensagem: 'Você não pode remover sua própria conta enquanto estiver logado nela.' });
  }
  try {
    await auth.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: true, mensagem: erro.message });
  }
});

// ── API de Dados (clientes, processos, prazos, honorários, config, feriados) ──
app.use('/api/data', requireAuth, dataRoutes);

// ── Arquivos Estáticos (protegidos por login) ────────────────
// Serve index.html, css/, js/ e demais assets do diretório raiz
app.use(requireAuth, express.static(path.join(__dirname)));

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
app.post('/api/datajud/:tribunal', requireAuth, async (req, res) => {
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
        'Accept': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    // Limpa o timeout após receber a resposta
    clearTimeout(timeoutId);

    // Tenta parsear a resposta como JSON pelo conteúdo, não pelo header
    // Content-Type (o DataJud, assim como o DJEN, às vezes rotula respostas
    // de erro como text/html mesmo quando o corpo já é um JSON válido)
    let dados;
    const textoResposta = await respostaDataJud.text();

    try {
      dados = JSON.parse(textoResposta);
    } catch {
      console.error(`[ERRO] DataJud respondeu status ${respostaDataJud.status} com corpo não-JSON: ${textoResposta.substring(0, 300)}`);
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
app.get('/api/djen/comunicacao', requireAuth, async (req, res) => {
  const queryString = new URLSearchParams(req.query).toString();
  const urlDestino = `https://comunicaapi.pje.jus.br/api/v1/comunicacao${queryString ? '?' + queryString : ''}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const respostaDJEN = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      ...opcoesProxyDJEN(),
    });

    clearTimeout(timeoutId);

    // Repassa headers de rate limit
    const rateLimit = respostaDJEN.headers.get('x-ratelimit-limit');
    const rateRemaining = respostaDJEN.headers.get('x-ratelimit-remaining');
    if (rateLimit) res.setHeader('x-ratelimit-limit', rateLimit);
    if (rateRemaining) res.setHeader('x-ratelimit-remaining', rateRemaining);

    // Tenta parsear pelo conteúdo — o DJEN às vezes rotula erros (ex: "sistema
    // muito ocupado") como text/html mesmo respondendo um JSON válido
    let dados;
    const textoResposta = await respostaDJEN.text();

    try {
      dados = JSON.parse(textoResposta);
    } catch {
      console.error(`[ERRO] DJEN (comunicacao) respondeu status ${respostaDJEN.status} com corpo não-JSON: ${textoResposta.substring(0, 300)}`);
      dados = {
        erro: true,
        mensagem: mensagemErroDJEN(textoResposta),
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
app.get('/api/djen/tribunais', requireAuth, async (req, res) => {
  const urlDestino = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao/tribunal';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resposta = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      ...opcoesProxyDJEN(),
    });

    clearTimeout(timeoutId);
    const textoResposta = await resposta.text();
    let dados;
    try {
      dados = JSON.parse(textoResposta);
    } catch {
      console.error(`[ERRO] DJEN (tribunais) respondeu status ${resposta.status} com corpo não-JSON: ${textoResposta.substring(0, 300)}`);
      dados = { erro: true, mensagem: mensagemErroDJEN(textoResposta), detalhes: textoResposta.substring(0, 500) };
    }
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
app.get('/api/djen/caderno/:sigla/:data/:meio', requireAuth, async (req, res) => {
  const { sigla, data, meio } = req.params;
  const urlDestino = `https://comunicaapi.pje.jus.br/api/v1/caderno/${sigla}/${data}/${meio}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const resposta = await fetch(urlDestino, {
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      ...opcoesProxyDJEN(),
    });

    clearTimeout(timeoutId);
    const textoResposta = await resposta.text();
    let dados;
    try {
      dados = JSON.parse(textoResposta);
    } catch {
      console.error(`[ERRO] DJEN (caderno) respondeu status ${resposta.status} com corpo não-JSON: ${textoResposta.substring(0, 300)}`);
      dados = { erro: true, mensagem: mensagemErroDJEN(textoResposta), detalhes: textoResposta.substring(0, 500) };
    }
    return res.status(resposta.status).json(dados);

  } catch (erro) {
    console.error(`[ERRO] Falha ao baixar caderno DJEN: ${erro.message}`);
    return res.status(500).json({ erro: true, mensagem: 'Erro ao buscar caderno do DJEN.' });
  }
});

// ── Rota Catch-All — SPA ────────────────────────────────────
// Redireciona rotas desconhecidas para o index.html (suporte a SPA)
app.get('*', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Inicialização do Servidor ───────────────────────────────
// As migrações e o seed do admin dependem do banco, então o
// servidor só começa a aceitar conexões depois que isso terminar.
(async () => {
  try {
    console.log('Conectando ao PostgreSQL e aplicando migrações...');
    await db.runMigrations();

    const credenciaisSemeadas = await auth.ensureSeedAdmin();

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
      console.log('║   🗄️  Dados:               PostgreSQL (/api/data)     ║');
      console.log('║                                                      ║');
      console.log('╚══════════════════════════════════════════════════════╝');
      console.log('');

      if (credenciaisSemeadas) {
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║   🔑 Primeira execução — conta admin criada:         ║');
        console.log(`║      Usuário: ${credenciaisSemeadas.username.padEnd(38)}║`);
        console.log(`║      Senha:   ${credenciaisSemeadas.password.padEnd(38)}║`);
        console.log('║   Guarde essa senha agora — ela não será mostrada    ║');
        console.log('║   de novo. Depois de entrar, crie uma conta sua em   ║');
        console.log('║   Configurações > Equipe (e pode remover esta, se    ║');
        console.log('║   quiser, contanto que sobre pelo menos uma conta).  ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('');
      }
    });
  } catch (erro) {
    console.error('[ERRO FATAL] Não foi possível iniciar o servidor:', erro.message);
    process.exit(1);
  }
})();
