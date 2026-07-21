// ============================================================
// PrazoJus - Módulo de Integração com API DataJud
// Comunicação com a API Pública do DataJud via proxy local
// ============================================================

const API_BASE = '/api/datajud';

// ============================================================
// Mapeamento de aliases dos tribunais
// ============================================================
const TRIBUNAIS = {
    // Justiça Estadual
    tjac: 'TJAC - Acre', tjal: 'TJAL - Alagoas', tjap: 'TJAP - Amapá',
    tjam: 'TJAM - Amazonas', tjba: 'TJBA - Bahia', tjce: 'TJCE - Ceará',
    tjdft: 'TJDFT - Distrito Federal', tjes: 'TJES - Espírito Santo',
    tjgo: 'TJGO - Goiás', tjma: 'TJMA - Maranhão', tjmt: 'TJMT - Mato Grosso',
    tjms: 'TJMS - Mato Grosso do Sul', tjmg: 'TJMG - Minas Gerais',
    tjpa: 'TJPA - Pará', tjpb: 'TJPB - Paraíba', tjpe: 'TJPE - Pernambuco',
    tjpi: 'TJPI - Piauí', tjpr: 'TJPR - Paraná', tjrj: 'TJRJ - Rio de Janeiro',
    tjrn: 'TJRN - Rio Grande do Norte', tjro: 'TJRO - Rondônia',
    tjrr: 'TJRR - Roraima', tjrs: 'TJRS - Rio Grande do Sul',
    tjsc: 'TJSC - Santa Catarina', tjse: 'TJSE - Sergipe',
    tjsp: 'TJSP - São Paulo', tjto: 'TJTO - Tocantins',

    // Justiça Federal
    trf1: 'TRF1 - 1ª Região', trf2: 'TRF2 - 2ª Região',
    trf3: 'TRF3 - 3ª Região', trf4: 'TRF4 - 4ª Região',
    trf5: 'TRF5 - 5ª Região', trf6: 'TRF6 - 6ª Região',

    // Justiça do Trabalho
    tst: 'TST - Tribunal Superior do Trabalho',
    trt1: 'TRT1 - Rio de Janeiro', trt2: 'TRT2 - São Paulo',
    trt3: 'TRT3 - Minas Gerais', trt4: 'TRT4 - Rio Grande do Sul',
    trt5: 'TRT5 - Bahia', trt6: 'TRT6 - Pernambuco',
    trt7: 'TRT7 - Ceará', trt8: 'TRT8 - Pará/Amapá',
    trt9: 'TRT9 - Paraná', trt10: 'TRT10 - Distrito Federal/Tocantins',
    trt11: 'TRT11 - Amazonas/Roraima', trt12: 'TRT12 - Santa Catarina',
    trt13: 'TRT13 - Paraíba', trt14: 'TRT14 - Rondônia/Acre',
    trt15: 'TRT15 - Campinas', trt16: 'TRT16 - Maranhão',
    trt17: 'TRT17 - Espírito Santo', trt18: 'TRT18 - Goiás',
    trt19: 'TRT19 - Alagoas', trt20: 'TRT20 - Sergipe',
    trt21: 'TRT21 - Rio Grande do Norte', trt22: 'TRT22 - Piauí',
    trt23: 'TRT23 - Mato Grosso', trt24: 'TRT24 - Mato Grosso do Sul',

    // Tribunais Superiores
    stj: 'STJ - Superior Tribunal de Justiça',
    stm: 'STM - Superior Tribunal Militar'
};

// ============================================================
// Função principal de consulta à API DataJud
// ============================================================

/**
 * Consulta a API DataJud via proxy local
 * @param {string} tribunal - Alias do tribunal (ex: 'tjsp', 'trf1')
 * @param {object} query - Query Elasticsearch
 * @returns {Promise<object>} Resposta da API
 */
async function consultarDataJud(tribunal, query) {
    const apiKey = getApiKey();

    if (!apiKey) {
        showToast('Configure sua API Key do DataJud nas Configurações.', 'warning');
        throw new Error('API Key não configurada');
    }

    if (!tribunal || !TRIBUNAIS[tribunal]) {
        showToast('Tribunal inválido.', 'error');
        throw new Error('Tribunal inválido: ' + tribunal);
    }

    try {
        const response = await fetch(`${API_BASE}/${tribunal}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-DataJud-Key': apiKey
            },
            body: JSON.stringify(query)
        });

        if (!response.ok) {
            if (response.status === 429) {
                const msg = 'Limite de requisições da API DataJud atingido. Aguarde 1 minuto antes de tentar novamente.';
                showToast(msg, 'error');
                throw new Error(msg);
            }

            const errorData = await response.json().catch(() => ({}));
            // "mensagem" traz o texto legível; "erro" é só um booleano de sinalização
            const msg = (typeof errorData.mensagem === 'string' && errorData.mensagem)
                || (typeof errorData.erro === 'string' && errorData.erro)
                || `Erro ${response.status} ao consultar DataJud`;
            showToast(msg, 'error');
            throw new Error(msg);
        }

        return await response.json();
    } catch (error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            showToast('Servidor local não encontrado. Execute "npm start" no terminal.', 'error');
        }
        throw error;
    }
}

// ============================================================
// Buscar processo por número CNJ
// ============================================================

/**
 * Busca um processo pelo número no formato CNJ
 * @param {string} numero - Número do processo (com ou sem máscara)
 * @param {string} [tribunalOverride] - Alias do tribunal (opcional, auto-detectado)
 * @returns {Promise<object|null>} Dados do processo ou null
 */
async function buscarProcesso(numero, tribunalOverride = null) {
    // Limpa o número
    const numeroLimpo = numero.replace(/[^0-9]/g, '');

    if (numeroLimpo.length !== 20) {
        showToast('Número do processo deve ter 20 dígitos.', 'warning');
        return null;
    }

    // Formata no padrão CNJ
    const numeroCNJ = formatCNJ(numeroLimpo);

    // Detecta o tribunal
    const tribunal = tribunalOverride || getTribunalFromCNJ(numeroCNJ);

    if (!tribunal) {
        showToast('Não foi possível identificar o tribunal. Selecione manualmente.', 'warning');
        return null;
    }

    // Monta a query Elasticsearch (numeroProcesso é indexado só com dígitos, sem máscara)
    const query = {
        query: {
            match: {
                numeroProcesso: numeroLimpo
            }
        },
        size: 1
    };

    const resultado = await consultarDataJud(tribunal, query);

    if (!resultado.hits || !resultado.hits.hits || resultado.hits.hits.length === 0) {
        showToast('Processo não encontrado no DataJud.', 'warning');
        return null;
    }

    const hit = resultado.hits.hits[0]._source;

    // Normaliza os dados do processo
    return normalizarProcesso(hit, tribunal);
}

// ============================================================
// Normalização dos dados retornados pela API
// ============================================================

/**
 * Normaliza os dados do processo da API para o formato interno
 */
function normalizarProcesso(dados, tribunalAlias) {
    return {
        numero: dados.numeroProcesso || '',
        tribunal: (TRIBUNAIS[tribunalAlias] || tribunalAlias).split(' - ')[0],
        tribunalAlias: tribunalAlias,
        classe: dados.classe?.codigo || '',
        classeNome: dados.classe?.nome || '',
        assuntos: (dados.assuntos || []).map(a => ({
            codigo: a.codigo,
            nome: a.nome
        })),
        orgaoJulgador: dados.orgaoJulgador?.codigo || '',
        orgaoJulgadorNome: dados.orgaoJulgador?.nome || '',
        partes: normalizarPartes(dados),
        movimentos: normalizarMovimentos(dados.movimentos || []),
        grau: dados.grau || '',
        dataAjuizamento: dados.dataAjuizamento || '',
        nivelSigilo: dados.nivelSigilo || 0,
        status: 'ativo'
    };
}

/**
 * Normaliza as partes do processo
 */
function normalizarPartes(dados) {
    // A API pode retornar partes em diferentes formatos
    if (!dados.partes && !dados.polo_ativo && !dados.polo_passivo) {
        return [];
    }

    const partes = [];

    // Tenta o formato com array de partes
    if (Array.isArray(dados.partes)) {
        dados.partes.forEach(p => {
            partes.push({
                nome: p.nome || 'Não informado',
                tipo: p.tipo || p.polo || '',
                documento: p.documento || ''
            });
        });
    }

    return partes;
}

/**
 * Normaliza movimentações do processo
 * Ordena por data (mais recente primeiro) e limita a 50
 */
function normalizarMovimentos(movimentos) {
    if (!Array.isArray(movimentos)) return [];

    return movimentos
        .map(m => ({
            codigo: m.codigo || 0,
            nome: m.nome || 'Movimentação sem descrição',
            dataHora: m.dataHora || '',
            complementos: m.complementosTabelados || []
        }))
        .sort((a, b) => {
            const dateA = new Date(a.dataHora);
            const dateB = new Date(b.dataHora);
            return dateB - dateA; // Mais recente primeiro
        })
        .slice(0, 50); // Limita a 50 movimentações
}

// ============================================================
// Testar conexão com a API
// ============================================================

/**
 * Testa a conexão com a API DataJud
 * Faz uma consulta simples ao TJDFT para validar a API Key
 * @returns {Promise<boolean>} true se a conexão funcionar
 */
async function testarConexaoAPI() {
    const apiKey = getApiKey();

    if (!apiKey) {
        showToast('Insira a API Key antes de testar.', 'warning');
        return false;
    }

    try {
        const query = {
            query: {
                match_all: {}
            },
            size: 1
        };

        await consultarDataJud('tjdft', query);
        showToast('Conexão com DataJud estabelecida com sucesso!', 'success');
        return true;
    } catch (error) {
        showToast('Falha ao conectar com DataJud. Verifique a API Key.', 'error');
        return false;
    }
}

// ============================================================
// Atualizar movimentações de um processo existente
// ============================================================

/**
 * Consulta o DataJud novamente para atualizar as movimentações
 * @param {string} processoId - ID interno do processo
 * @returns {Promise<object|null>} Processo atualizado ou null
 */
async function atualizarMovimentacoes(processoId) {
    const processo = getProcessoById(processoId);

    if (!processo) {
        showToast('Processo não encontrado.', 'error');
        return null;
    }

    try {
        const dadosAtualizados = await buscarProcesso(processo.numero, processo.tribunalAlias);

        if (dadosAtualizados) {
            const atualizado = updateProcesso(processoId, {
                movimentos: dadosAtualizados.movimentos,
                partes: dadosAtualizados.partes || processo.partes
            });

            showToast('Movimentações atualizadas com sucesso!', 'success');
            return atualizado;
        }
    } catch (error) {
        showToast('Erro ao atualizar movimentações.', 'error');
    }

    return null;
}

// ============================================================
// Obter lista de tribunais para select
// ============================================================

/**
 * Retorna array de tribunais agrupados por justiça para popular selects
 */
function getTribunaisAgrupados() {
    return {
        'Justiça Estadual': Object.entries(TRIBUNAIS)
            .filter(([k]) => k.startsWith('tj'))
            .map(([alias, nome]) => ({ alias, nome })),
        'Justiça Federal': Object.entries(TRIBUNAIS)
            .filter(([k]) => k.startsWith('trf'))
            .map(([alias, nome]) => ({ alias, nome })),
        'Justiça do Trabalho': Object.entries(TRIBUNAIS)
            .filter(([k]) => k.startsWith('trt') || k === 'tst')
            .map(([alias, nome]) => ({ alias, nome })),
        'Tribunais Superiores': Object.entries(TRIBUNAIS)
            .filter(([k]) => k === 'stj' || k === 'stm')
            .map(([alias, nome]) => ({ alias, nome }))
    };
}

// ============================================================
// BUSCA AVANÇADA — Por Nome da Parte
// ============================================================

/**
 * Busca processos por nome da parte em um tribunal específico
 * @param {string} nome - Nome da parte (pessoa ou empresa)
 * @param {string} tribunal - Alias do tribunal
 * @param {number} size - Número máximo de resultados (default: 20)
 * @returns {Promise<Array>} Array de processos normalizados
 */
async function buscarPorParte(nome, tribunal, size = 20) {
    if (!nome || nome.trim().length < 3) {
        showToast('Digite pelo menos 3 caracteres para buscar.', 'warning');
        return [];
    }

    const query = {
        query: {
            bool: {
                should: [
                    { match: { "partes.nome": { query: nome, operator: "and" } } },
                    { match_phrase: { "partes.nome": nome } }
                ],
                minimum_should_match: 1
            }
        },
        size: size,
        sort: [{ "@timestamp": { order: "desc" } }]
    };

    const resultado = await consultarDataJud(tribunal, query);

    if (!resultado.hits || !resultado.hits.hits || resultado.hits.hits.length === 0) {
        return [];
    }

    return resultado.hits.hits.map(hit => normalizarProcesso(hit._source, tribunal));
}

// ============================================================
// BUSCA AVANÇADA — Por Nome do Advogado
// ============================================================

/**
 * Busca processos por nome do advogado em um tribunal específico
 * @param {string} nome - Nome do advogado
 * @param {string} tribunal - Alias do tribunal
 * @param {number} size - Número máximo de resultados (default: 20)
 * @returns {Promise<Array>} Array de processos normalizados
 */
async function buscarPorAdvogado(nome, tribunal, size = 20) {
    if (!nome || nome.trim().length < 3) {
        showToast('Digite pelo menos 3 caracteres para buscar.', 'warning');
        return [];
    }

    const query = {
        query: {
            bool: {
                should: [
                    { match: { "partes.advogados.nome": { query: nome, operator: "and" } } },
                    { match_phrase: { "partes.advogados.nome": nome } }
                ],
                minimum_should_match: 1
            }
        },
        size: size,
        sort: [{ "@timestamp": { order: "desc" } }]
    };

    const resultado = await consultarDataJud(tribunal, query);

    if (!resultado.hits || !resultado.hits.hits || resultado.hits.hits.length === 0) {
        return [];
    }

    return resultado.hits.hits.map(hit => normalizarProcesso(hit._source, tribunal));
}

// ============================================================
// BUSCA MULTI-TRIBUNAL
// ============================================================

/**
 * Busca em múltiplos tribunais simultaneamente
 * @param {string} nome - Nome para buscar
 * @param {string} tipoBusca - 'parte' ou 'advogado'
 * @param {Array<string>} tribunais - Array de aliases dos tribunais
 * @param {Function} onProgress - Callback de progresso (tribunal, index, total)
 * @returns {Promise<Array>} Array de {tribunal, processos[], erro?}
 */
async function buscarMultiTribunal(nome, tipoBusca, tribunais, onProgress = null) {
    const resultados = [];
    const buscaFn = tipoBusca === 'advogado' ? buscarPorAdvogado : buscarPorParte;

    for (let i = 0; i < tribunais.length; i++) {
        const tribunal = tribunais[i];

        if (onProgress) {
            onProgress(tribunal, i + 1, tribunais.length);
        }

        try {
            const processos = await buscaFn(nome, tribunal, 10);
            if (processos.length > 0) {
                resultados.push({
                    tribunal,
                    tribunalNome: TRIBUNAIS[tribunal] || tribunal,
                    processos,
                    erro: null
                });
            }
        } catch (error) {
            resultados.push({
                tribunal,
                tribunalNome: TRIBUNAIS[tribunal] || tribunal,
                processos: [],
                erro: error.message
            });
        }

        // Delay para não sobrecarregar a API (rate limit)
        if (i < tribunais.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    return resultados;
}

// ============================================================
// MONITORAMENTO EM LOTE
// ============================================================

/**
 * Verifica todos os processos salvos por novas movimentações
 * @param {Function} onProgress - Callback (processo, index, total)
 * @returns {Promise<Array>} Array de {processo, novasMovimentacoes[], novosPrazos[]}
 */
async function monitorarTodosProcessos(onProgress = null) {
    const processos = getProcessos().filter(p => p.status === 'ativo');
    const alertas = [];

    for (let i = 0; i < processos.length; i++) {
        const processo = processos[i];

        if (onProgress) {
            onProgress(processo, i + 1, processos.length);
        }

        try {
            const dadosAtuais = await buscarProcesso(processo.numero, processo.tribunalAlias);

            if (!dadosAtuais) continue;

            // Compara movimentações: detecta novas
            const movimentosAntigos = new Set(
                (processo.movimentos || []).map(m => `${m.codigo}_${m.dataHora}`)
            );

            const novasMovimentacoes = (dadosAtuais.movimentos || []).filter(
                m => !movimentosAntigos.has(`${m.codigo}_${m.dataHora}`)
            );

            if (novasMovimentacoes.length > 0) {
                // Atualiza o processo no storage
                updateProcesso(processo.id, {
                    movimentos: dadosAtuais.movimentos
                });

                // Detecta intimações nas novas movimentações
                const novosPrazos = detectarIntimacoes(novasMovimentacoes);

                alertas.push({
                    processo,
                    novasMovimentacoes,
                    novosPrazos
                });
            }
        } catch (error) {
            console.warn(`Erro ao monitorar processo ${processo.numero}:`, error.message);
        }

        // Rate limit
        if (i < processos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    return alertas;
}

// ============================================================
// DETECÇÃO AUTOMÁTICA DE INTIMAÇÕES
// ============================================================

/**
 * Analisa movimentações novas e detecta intimações/eventos que geram prazos
 * @param {Array} movimentos - Array de movimentações novas
 * @returns {Array} Array de prazos sugeridos
 */
function detectarIntimacoes(movimentos) {
    const prazosDetectados = [];

    const regras = [
        {
            pattern: /cita[çc][ãa]o|citad[oa]/i,
            tipo: 'contestacao',
            descricao: 'Contestação (auto-detectado)',
            dias: 15,
            base: 'Art. 335 CPC'
        },
        {
            pattern: /intima[çc][ãa]o|intimad[oa]/i,
            tipo: 'manifestacao',
            descricao: 'Manifestação (auto-detectado)',
            dias: 5,
            base: 'Art. 218 CPC'
        },
        {
            pattern: /senten[çc]a\s+(publicad|proferid|prolatad)/i,
            tipo: 'apelacao',
            descricao: 'Apelação (auto-detectado)',
            dias: 15,
            base: 'Art. 1.003 CPC'
        },
        {
            pattern: /ac[oó]rd[ãa]o\s+(publicad|registrad)/i,
            tipo: 'recurso_especial',
            descricao: 'Recurso Especial (auto-detectado)',
            dias: 15,
            base: 'Art. 1.029 CPC'
        },
        {
            pattern: /despacho.*intim/i,
            tipo: 'manifestacao',
            descricao: 'Manifestação por Despacho (auto-detectado)',
            dias: 5,
            base: 'Art. 218 CPC'
        },
        {
            pattern: /audi[eê]ncia.*designad/i,
            tipo: 'audiencia',
            descricao: 'Audiência Designada (auto-detectado)',
            dias: 0,
            base: ''
        },
        {
            pattern: /embargos.*declar/i,
            tipo: 'embargos_declaracao',
            descricao: 'Embargos de Declaração (auto-detectado)',
            dias: 5,
            base: 'Art. 1.023 CPC'
        }
    ];

    movimentos.forEach(mov => {
        const texto = mov.nome || '';
        for (const regra of regras) {
            if (regra.pattern.test(texto)) {
                const dataInicio = mov.dataHora ? new Date(mov.dataHora) : new Date();
                let dataFim;

                if (typeof calculateDeadline === 'function' && regra.dias > 0) {
                    const resultado = calculateDeadline(dataInicio, regra.dias, 'uteis', getCustomHolidays());
                    dataFim = resultado.dataFim;
                } else {
                    dataFim = new Date(dataInicio);
                    dataFim.setDate(dataFim.getDate() + regra.dias);
                }

                prazosDetectados.push({
                    tipo: regra.tipo,
                    descricao: regra.descricao,
                    baseLegal: regra.base,
                    dias: regra.dias,
                    dataInicio: dataInicio.toISOString(),
                    dataFimSugerida: dataFim.toISOString(),
                    movimentoOrigem: texto
                });
                break; // Cada movimentação gera no máximo um prazo
            }
        }
    });

    return prazosDetectados;
}

// ============================================================
// JURIMETRIA — Estatísticas agregadas
// ============================================================

/**
 * Retorna estatísticas dos processos salvos localmente (jurimetria)
 * @returns {object} Estatísticas calculadas
 */
function calcularJurimetria() {
    const processos = getProcessos();
    const prazos = getPrazos();

    // Processos por tribunal
    const porTribunal = {};
    processos.forEach(p => {
        const t = p.tribunal || 'Não informado';
        porTribunal[t] = (porTribunal[t] || 0) + 1;
    });

    // Processos por classe
    const porClasse = {};
    processos.forEach(p => {
        const c = p.classeNome || 'Não informada';
        porClasse[c] = (porClasse[c] || 0) + 1;
    });

    // Processos por assunto (top)
    const porAssunto = {};
    processos.forEach(p => {
        (p.assuntos || []).forEach(a => {
            const nome = a.nome || 'Não informado';
            porAssunto[nome] = (porAssunto[nome] || 0) + 1;
        });
    });

    // Prazos por tipo
    const prazosPorTipo = {};
    prazos.forEach(p => {
        const t = p.tipoDescricao || p.tipo || 'Outro';
        prazosPorTipo[t] = (prazosPorTipo[t] || 0) + 1;
    });

    // Prazos por status
    const prazosPorStatus = { cumprido: 0, pendente: 0, vencido: 0 };
    const hoje = new Date();
    prazos.forEach(p => {
        if (p.status === 'cumprido') {
            prazosPorStatus.cumprido++;
        } else if (new Date(p.dataFim) < hoje) {
            prazosPorStatus.vencido++;
        } else {
            prazosPorStatus.pendente++;
        }
    });

    // Taxa de cumprimento
    const totalPrazos = prazos.length;
    const taxaCumprimento = totalPrazos > 0
        ? Math.round((prazosPorStatus.cumprido / totalPrazos) * 100)
        : 0;

    // Distribuição temporal — prazos por mês (últimos 6 meses)
    const prazosPorMes = {};
    for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        prazosPorMes[key] = 0;
    }
    prazos.forEach(p => {
        const d = new Date(p.dataFim);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (prazosPorMes.hasOwnProperty(key)) {
            prazosPorMes[key]++;
        }
    });

    // Órgãos julgadores mais frequentes
    const porOrgao = {};
    processos.forEach(p => {
        const o = p.orgaoJulgadorNome || 'Não informado';
        porOrgao[o] = (porOrgao[o] || 0) + 1;
    });

    return {
        totalProcessos: processos.length,
        totalPrazos,
        taxaCumprimento,
        prazosPorStatus,
        porTribunal,
        porClasse,
        porAssunto,
        prazosPorTipo,
        prazosPorMes,
        porOrgao
    };
}

/**
 * Retorna os aliases de todos os TJs estaduais para busca multi-tribunal
 */
function getTJsEstaduais() {
    return Object.keys(TRIBUNAIS).filter(k => k.startsWith('tj'));
}

/**
 * Retorna todos os aliases disponíveis
 */
function getTodosAliases() {
    return Object.keys(TRIBUNAIS);
}

// ============================================================
// INTEGRAÇÃO DJEN — Diário de Justiça Eletrônico Nacional
// ============================================================

const DJEN_BASE = '/api/djen';

/**
 * Consulta publicações no DJEN
 * @param {object} params - Parâmetros de busca
 * @param {string} [params.numeroOab] - Número OAB
 * @param {string} [params.ufOab] - UF da OAB
 * @param {string} [params.nomeAdvogado] - Nome do advogado
 * @param {string} [params.nomeParte] - Nome da parte
 * @param {string} [params.numeroProcesso] - Número do processo (somente dígitos)
 * @param {string} [params.siglaTribunal] - Sigla do tribunal
 * @param {string} [params.dataDisponibilizacaoInicio] - Data início (yyyy-mm-dd)
 * @param {string} [params.dataDisponibilizacaoFim] - Data fim (yyyy-mm-dd)
 * @param {number} [params.pagina] - Página atual
 * @param {number} [params.itensPorPagina] - Itens por página (5 ou 100)
 * @param {string} [params.meio] - 'D' para Diário, 'E' para Edital
 * @returns {Promise<object>} Resultado com count e items
 */
async function consultarDJEN(params) {
    // Remove parâmetros vazios
    const queryParams = {};
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
            queryParams[key] = value;
        }
    }

    const queryString = new URLSearchParams(queryParams).toString();
    const url = `${DJEN_BASE}/comunicacao${queryString ? '?' + queryString : ''}`;

    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 429) {
            throw new Error('Rate limit atingido. Aguarde 1 minuto antes de fazer novas consultas.');
        }
        if (response.status === 422) {
            throw new Error('Parâmetros inválidos. A busca precisa incluir pelo menos um filtro (tribunal, nome, OAB ou processo).');
        }
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || body.mensagem || `Erro ${response.status} ao consultar o DJEN.`);
    }

    return await response.json();
}

/**
 * Busca publicações por número OAB
 * @param {string} numeroOab - Número OAB (ex: '12345')
 * @param {string} ufOab - UF da OAB (ex: 'SP', 'RJ')
 * @param {number} pagina - Número da página
 * @returns {Promise<object>} Resultado {count, items}
 */
async function buscarPublicacoesPorOAB(numeroOab, ufOab, pagina = 1) {
    return consultarDJEN({
        numeroOab,
        ufOab,
        itensPorPagina: 100,
        pagina,
        meio: 'D'
    });
}

/**
 * Busca publicações por número de processo no DJEN
 * @param {string} numeroProcesso - Número do processo (com ou sem máscara)
 * @param {number} pagina - Número da página
 * @returns {Promise<object>} Resultado {count, items}
 */
async function buscarPublicacoesPorProcesso(numeroProcesso, pagina = 1) {
    // Remove máscara CNJ: somente dígitos
    const somenteDigitos = numeroProcesso.replace(/\D/g, '');
    return consultarDJEN({
        numeroProcesso: somenteDigitos,
        itensPorPagina: 100,
        pagina,
        meio: 'D'
    });
}

/**
 * Busca publicações por nome da parte no DJEN
 * @param {string} nomeParte - Nome da parte
 * @param {string} [siglaTribunal] - Filtro opcional por tribunal
 * @param {number} pagina - Número da página
 * @returns {Promise<object>} Resultado {count, items}
 */
async function buscarPublicacoesPorParte(nomeParte, siglaTribunal = '', pagina = 1) {
    return consultarDJEN({
        nomeParte,
        siglaTribunal,
        itensPorPagina: 100,
        pagina,
        meio: 'D'
    });
}

/**
 * Busca publicações por nome do advogado no DJEN
 * @param {string} nomeAdvogado - Nome do advogado
 * @param {string} [siglaTribunal] - Filtro opcional por tribunal
 * @param {number} pagina - Número da página
 * @returns {Promise<object>} Resultado {count, items}
 */
async function buscarPublicacoesPorAdvogadoDJEN(nomeAdvogado, siglaTribunal = '', pagina = 1) {
    return consultarDJEN({
        nomeAdvogado,
        siglaTribunal,
        itensPorPagina: 100,
        pagina,
        meio: 'D'
    });
}

/**
 * Busca publicações recentes de um tribunal
 * @param {string} siglaTribunal - Sigla do tribunal
 * @param {string} dataInicio - Data início (yyyy-mm-dd)
 * @param {string} dataFim - Data fim (yyyy-mm-dd)
 * @param {number} pagina - Número da página
 * @returns {Promise<object>} Resultado {count, items}
 */
async function buscarPublicacoesPorTribunalDJEN(siglaTribunal, dataInicio, dataFim, pagina = 1) {
    return consultarDJEN({
        siglaTribunal,
        dataDisponibilizacaoInicio: dataInicio,
        dataDisponibilizacaoFim: dataFim,
        itensPorPagina: 100,
        pagina,
        meio: 'D'
    });
}

/**
 * Lista tribunais disponíveis no DJEN
 * @returns {Promise<Array>} Array de tribunais
 */
async function listarTribunaisDJEN() {
    const response = await fetch(`${DJEN_BASE}/tribunais`);
    if (!response.ok) {
        throw new Error('Erro ao listar tribunais do DJEN.');
    }
    return await response.json();
}

/**
 * Busca metadados/URL de download do caderno (Diário Oficial) de um tribunal
 * @param {string} sigla - Sigla do tribunal (ex: 'tjsp')
 * @param {string} data - Data no formato yyyy-mm-dd
 * @param {string} meio - 'D' para Diário, 'E' para Edital
 * @returns {Promise<object>} Metadados do caderno (URL de download, etc.)
 */
async function buscarCadernoDJEN(sigla, data, meio = 'D') {
    const response = await fetch(`${DJEN_BASE}/caderno/${sigla}/${data}/${meio}`);
    const dados = await response.json();

    if (!response.ok || dados.erro) {
        throw new Error(dados.mensagem || `Erro ${response.status} ao buscar o caderno.`);
    }

    return dados;
}

/**
 * Verifica publicações recentes de processos salvos no DJEN
 * Útil para detectar intimações/citações publicadas
 * @param {Function} onProgress - Callback (processo, index, total)
 * @returns {Promise<Array>} Array de {processo, publicacoes[]}
 */
async function monitorarPublicacoesDJEN(onProgress = null) {
    const processos = getProcessos().filter(p => p.status === 'ativo');
    const resultados = [];

    for (let i = 0; i < processos.length; i++) {
        const processo = processos[i];

        if (onProgress) {
            onProgress(processo, i + 1, processos.length);
        }

        try {
            const numero = processo.numero.replace(/\D/g, '');
            const resultado = await consultarDJEN({
                numeroProcesso: numero,
                itensPorPagina: 5,
                pagina: 1,
                meio: 'D'
            });

            if (resultado.items && resultado.items.length > 0) {
                // Filtra publicações que o usuário ainda não viu
                const ultimaVerificacao = processo.ultimaVerificacaoDJEN || '1970-01-01';
                const novas = resultado.items.filter(item => {
                    const dataDisp = item.data_disponibilizacao || item.datadisponibilizacao;
                    return dataDisp && dataDisp > ultimaVerificacao;
                });

                if (novas.length > 0) {
                    resultados.push({
                        processo,
                        publicacoes: novas
                    });
                }

                // Atualiza data da última verificação
                updateProcesso(processo.id, {
                    ultimaVerificacaoDJEN: new Date().toISOString().split('T')[0]
                });
            }
        } catch (error) {
            console.warn(`Erro ao verificar DJEN para ${processo.numero}:`, error.message);
        }

        // Rate limit — aguardar entre requisições
        if (i < processos.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }

    return resultados;
}
