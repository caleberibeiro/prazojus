// ============================================================
// PrazoJus - Módulo de Persistência (PostgreSQL via API REST)
// ============================================================
// Os dados agora vivem no servidor (compartilhados pela equipe),
// não mais no localStorage do navegador. Para manter o resto do
// app simples, este módulo guarda um CACHE em memória alimentado
// pelo servidor:
//   - Leituras (getProcessos, getClienteById, ...) continuam
//     SÍNCRONAS, lendo do cache.
//   - Escritas (saveProcesso, updateCliente, ...) são
//     ASSÍNCRONAS: batem na API, e só then atualizam o cache.
// Chame carregarDadosDoServidor() (e aguarde) antes de renderizar
// qualquer página.
// ============================================================

// ============================================================
// Configuração padrão
// ============================================================
const DEFAULT_CONFIG = {
    apiKey: '',
    diasAlertaCritico: 3,
    diasAlertaAtencao: 7,
    mostrarVencidos: true,
    recessoForense: true
};

// ============================================================
// Cache em memória + carga inicial
// ============================================================
let appData = {
    processos: [],
    prazos: [],
    clientes: [],
    honorarios: [],
    config: { ...DEFAULT_CONFIG },
    feriadosCustom: []
};

let appDataCarregado = false;

/** Busca todos os dados do servidor e popula o cache em memória */
async function carregarDadosDoServidor() {
    const resposta = await fetch('/api/data/tudo');
    if (!resposta.ok) {
        throw new Error('Não foi possível carregar os dados do servidor.');
    }
    const dados = await resposta.json();

    appData.clientes = dados.clientes || [];
    appData.processos = dados.processos || [];
    appData.prazos = dados.prazos || [];
    appData.honorarios = dados.honorarios || [];
    appData.feriadosCustom = dados.feriadosCustom || [];
    appData.config = { ...DEFAULT_CONFIG, ...(dados.config || {}) };

    appDataCarregado = true;
}

/** Helper de requisição à API de dados — trata erro e mostra toast automaticamente */
async function apiRequest(method, url, body) {
    const options = { method };
    if (body !== undefined) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
    }

    const resposta = await fetch(url, options);
    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
        const msg = dados.mensagem || `Erro ${resposta.status} ao acessar ${url}`;
        showToast(msg, 'error');
        throw new Error(msg);
    }

    return { dados, status: resposta.status };
}

// ============================================================
// PROCESSOS - CRUD
// ============================================================

/** Retorna todos os processos salvos */
function getProcessos() {
    return [...appData.processos];
}

/** Retorna um processo pelo ID */
function getProcessoById(id) {
    return appData.processos.find(p => p.id === id) || null;
}

/** Retorna um processo pelo número CNJ */
function getProcessoByNumero(numero) {
    const clean = numero.replace(/[^0-9]/g, '');
    return appData.processos.find(p => p.numero.replace(/[^0-9]/g, '') === clean) || null;
}

/** Salva um novo processo (ou retorna o existente, se o número já estiver cadastrado) */
async function saveProcesso(processo) {
    const { dados, status } = await apiRequest('POST', '/api/data/processos', processo);

    const index = appData.processos.findIndex(p => p.id === dados.id);
    if (index === -1) {
        appData.processos.push(dados);
    } else {
        appData.processos[index] = dados;
    }

    if (status === 200) {
        showToast('Processo já cadastrado!', 'warning');
    }

    return dados;
}

/** Atualiza um processo existente */
async function updateProcesso(id, updates) {
    const { dados } = await apiRequest('PUT', `/api/data/processos/${id}`, updates);
    const index = appData.processos.findIndex(p => p.id === id);
    if (index !== -1) appData.processos[index] = dados;
    return dados;
}

/** Remove um processo (o servidor cuida do cascade dos prazos vinculados) */
async function deleteProcesso(id) {
    await apiRequest('DELETE', `/api/data/processos/${id}`);
    appData.processos = appData.processos.filter(p => p.id !== id);
    appData.prazos = appData.prazos.filter(p => p.processoId !== id);
    return true;
}

// ============================================================
// PRAZOS - CRUD
// ============================================================

/** Retorna todos os prazos salvos */
function getPrazos() {
    return [...appData.prazos];
}

/** Retorna um prazo pelo ID */
function getPrazoById(id) {
    return appData.prazos.find(p => p.id === id) || null;
}

/** Retorna prazos de um processo específico */
function getPrazosByProcesso(processoId) {
    return appData.prazos.filter(p => p.processoId === processoId);
}

/** Salva um novo prazo */
async function savePrazo(prazo) {
    const { dados } = await apiRequest('POST', '/api/data/prazos', prazo);
    appData.prazos.push(dados);
    return dados;
}

/** Atualiza um prazo existente */
async function updatePrazo(id, updates) {
    const { dados } = await apiRequest('PUT', `/api/data/prazos/${id}`, updates);
    const index = appData.prazos.findIndex(p => p.id === id);
    if (index !== -1) appData.prazos[index] = dados;
    return dados;
}

/** Remove um prazo */
async function deletePrazo(id) {
    await apiRequest('DELETE', `/api/data/prazos/${id}`);
    appData.prazos = appData.prazos.filter(p => p.id !== id);
    return true;
}

/** Marca prazo como cumprido */
async function marcarPrazoCumprido(id) {
    return updatePrazo(id, { status: 'cumprido' });
}

/** Marca prazo como pendente */
async function marcarPrazoPendente(id) {
    return updatePrazo(id, { status: 'pendente' });
}

// ============================================================
// CONSULTAS E ESTATÍSTICAS (síncronas — leem o cache)
// ============================================================

/** Retorna prazos ordenados por urgência (mais urgente primeiro) */
function getPrazosOrdenados(incluirCumpridos = false) {
    let prazos = getPrazos();

    if (!incluirCumpridos) {
        prazos = prazos.filter(p => p.status !== 'cumprido');
    }

    return prazos.sort((a, b) => {
        const dateA = new Date(a.dataFim);
        const dateB = new Date(b.dataFim);
        return dateA - dateB;
    });
}

/** Retorna audiências marcadas (prazos do tipo "audiencia"), ordenadas por data */
function getAudienciasMarcadas(incluirCumpridas = false) {
    return getPrazosOrdenados(incluirCumpridas).filter(p => p.tipo === 'audiencia');
}

/** Retorna estatísticas para o dashboard */
function getDashboardStats() {
    const prazos = getPrazos().filter(p => p.status !== 'cumprido');
    const processos = getProcessos().filter(p => p.status === 'ativo');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let vencidos = 0;
    let urgentes = 0;
    let estaSemana = 0;

    // Calcular fim da semana (domingo)
    const fimSemana = new Date(hoje);
    fimSemana.setDate(fimSemana.getDate() + (7 - fimSemana.getDay()));

    prazos.forEach(prazo => {
        const dataFim = new Date(prazo.dataFim);
        dataFim.setHours(0, 0, 0, 0);

        const diff = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));

        if (diff < 0) {
            vencidos++;
        } else if (diff <= 3) {
            urgentes++;
        }

        if (dataFim >= hoje && dataFim <= fimSemana) {
            estaSemana++;
        }
    });

    return {
        vencidos,
        urgentes,
        estaSemana,
        processosAtivos: processos.length
    };
}

/** Retorna prazos de um mês específico para o calendário */
function getPrazosByMonth(year, month) {
    return getPrazos().filter(prazo => {
        const date = new Date(prazo.dataFim);
        return date.getFullYear() === year && date.getMonth() === month;
    });
}

/** Retorna prazos de um dia específico */
function getPrazosByDate(dateStr) {
    return getPrazos().filter(prazo => {
        const date = new Date(prazo.dataFim);
        const target = new Date(dateStr);
        return date.toDateString() === target.toDateString();
    });
}

// ============================================================
// CONFIGURAÇÃO
// ============================================================

/** Retorna a configuração atual */
function getConfig() {
    return { ...appData.config };
}

/** Salva configuração (merge parcial) */
async function saveConfig(config) {
    const { dados } = await apiRequest('PUT', '/api/data/config', config);
    appData.config = { ...DEFAULT_CONFIG, ...dados };
    return { ...appData.config };
}

/** Retorna a API Key configurada */
function getApiKey() {
    return appData.config.apiKey || '';
}

/** Salva a API Key */
async function saveApiKey(apiKey) {
    return saveConfig({ apiKey });
}

// ============================================================
// FERIADOS CUSTOMIZADOS
// ============================================================

/** Retorna feriados customizados */
function getCustomHolidays() {
    return [...appData.feriadosCustom];
}

/** Adiciona um feriado customizado */
async function addCustomHoliday(date, name) {
    const { dados } = await apiRequest('POST', '/api/data/feriados', { date, name });
    appData.feriadosCustom = dados;
    return appData.feriadosCustom;
}

/** Remove um feriado customizado */
async function removeCustomHoliday(date) {
    await apiRequest('DELETE', `/api/data/feriados/${encodeURIComponent(date)}`);
    appData.feriadosCustom = appData.feriadosCustom.filter(h => h.date !== date);
    return appData.feriadosCustom;
}

// ============================================================
// CLIENTES - CRUD
// ============================================================

/** Retorna todos os clientes salvos */
function getClientes() {
    return [...appData.clientes];
}

/** Retorna um cliente pelo ID */
function getClienteById(id) {
    return appData.clientes.find(c => c.id === id) || null;
}

/** Salva um novo cliente */
async function saveCliente(cliente) {
    const { dados } = await apiRequest('POST', '/api/data/clientes', cliente);
    appData.clientes.push(dados);
    return dados;
}

/** Atualiza um cliente existente */
async function updateCliente(id, updates) {
    const { dados } = await apiRequest('PUT', `/api/data/clientes/${id}`, updates);
    const index = appData.clientes.findIndex(c => c.id === id);
    if (index !== -1) appData.clientes[index] = dados;
    return dados;
}

/** Remove um cliente (o servidor desvincula os processos dele) */
async function deleteCliente(id) {
    await apiRequest('DELETE', `/api/data/clientes/${id}`);
    appData.clientes = appData.clientes.filter(c => c.id !== id);
    appData.processos = appData.processos.map(p => p.clienteId === id ? { ...p, clienteId: '' } : p);
    return true;
}

/** Retorna os processos vinculados a um cliente */
function getProcessosByCliente(clienteId) {
    return getProcessos().filter(p => p.clienteId === clienteId);
}

/** Retorna os prazos pendentes (não cumpridos) vinculados a um cliente */
function getPrazosByCliente(clienteId, incluirCumpridos = false) {
    const processoIds = getProcessosByCliente(clienteId).map(p => p.id);
    let prazos = getPrazos().filter(p => processoIds.includes(p.processoId));
    if (!incluirCumpridos) {
        prazos = prazos.filter(p => p.status !== 'cumprido');
    }
    return prazos.sort((a, b) => new Date(a.dataFim) - new Date(b.dataFim));
}

// ============================================================
// FINANCEIRO / HONORÁRIOS - CRUD
// ============================================================

/** Retorna todos os honorários salvos */
function getHonorarios() {
    return [...appData.honorarios];
}

/** Retorna um honorário pelo ID */
function getHonorarioById(id) {
    return appData.honorarios.find(h => h.id === id) || null;
}

/** Retorna honorários vinculados a um cliente */
function getHonorariosByCliente(clienteId) {
    return getHonorarios().filter(h => h.clienteId === clienteId);
}

/** Salva um novo honorário */
async function saveHonorario(honorario) {
    const { dados } = await apiRequest('POST', '/api/data/honorarios', honorario);
    appData.honorarios.push(dados);
    return dados;
}

/** Atualiza um honorário existente */
async function updateHonorario(id, updates) {
    const { dados } = await apiRequest('PUT', `/api/data/honorarios/${id}`, updates);
    const index = appData.honorarios.findIndex(h => h.id === id);
    if (index !== -1) appData.honorarios[index] = dados;
    return dados;
}

/** Remove um honorário */
async function deleteHonorario(id) {
    await apiRequest('DELETE', `/api/data/honorarios/${id}`);
    appData.honorarios = appData.honorarios.filter(h => h.id !== id);
    return true;
}

/** Marca honorário como pago */
async function marcarHonorarioPago(id) {
    return updateHonorario(id, { status: 'pago', pagoEm: new Date().toISOString() });
}

/** Marca honorário como pendente */
async function marcarHonorarioPendente(id) {
    return updateHonorario(id, { status: 'pendente', pagoEm: '' });
}

/** Retorna estatísticas financeiras (recebido, pendente, atrasado) */
function getFinanceiroStats() {
    const honorarios = getHonorarios();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    let recebido = 0;
    let pendente = 0;
    let atrasado = 0;
    let qtdAtrasados = 0;

    honorarios.forEach(h => {
        if (h.status === 'pago') {
            recebido += h.valor;
            return;
        }

        const vencido = h.vencimento && new Date(h.vencimento + 'T12:00:00') < hoje;
        if (vencido) {
            atrasado += h.valor;
            qtdAtrasados++;
        } else {
            pendente += h.valor;
        }
    });

    return { recebido, pendente, atrasado, qtdAtrasados, total: honorarios.length };
}

// ============================================================
// EXPORTAR / IMPORTAR
// ============================================================

/** Exporta todos os dados como JSON */
function exportData() {
    const data = {
        version: '1.0.0',
        exportDate: new Date().toISOString(),
        processos: getProcessos(),
        prazos: getPrazos(),
        config: getConfig(),
        feriadosCustom: getCustomHolidays(),
        clientes: getClientes(),
        honorarios: getHonorarios()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prazojus_backup_${formatDate(new Date()).replace(/\//g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Backup exportado com sucesso!', 'success');
}

/** Importa dados de um arquivo JSON (SUBSTITUI tudo que está no banco) */
function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.version || !data.processos || !data.prazos) {
                    throw new Error('Arquivo de backup inválido');
                }

                await apiRequest('DELETE', '/api/data/tudo');

                for (const cliente of data.clientes || []) {
                    await apiRequest('POST', '/api/data/clientes', cliente);
                }
                for (const processo of data.processos || []) {
                    await apiRequest('POST', '/api/data/processos', processo);
                }
                for (const prazo of data.prazos || []) {
                    await apiRequest('POST', '/api/data/prazos', prazo);
                }
                for (const honorario of data.honorarios || []) {
                    await apiRequest('POST', '/api/data/honorarios', honorario);
                }
                for (const feriado of data.feriadosCustom || []) {
                    await apiRequest('POST', '/api/data/feriados', feriado);
                }
                if (data.config) {
                    await apiRequest('PUT', '/api/data/config', data.config);
                }

                await carregarDadosDoServidor();

                showToast(`Backup importado! ${data.processos.length} processos e ${data.prazos.length} prazos restaurados.`, 'success');
                resolve(data);
            } catch (err) {
                showToast('Erro ao importar: ' + (err.message || 'arquivo inválido.'), 'error');
                reject(err);
            }
        };

        reader.onerror = () => {
            showToast('Erro ao ler o arquivo.', 'error');
            reject(reader.error);
        };

        reader.readAsText(file);
    });
}

// ============================================================
// IMPORTAÇÃO VIA PLANILHA (EXCEL)
// ============================================================
// Diferente do backup em JSON (que SUBSTITUI todos os dados),
// a importação por planilha é ADITIVA: cada linha vira um novo
// registro, sem apagar o que já existe. Abas aceitas (pelo nome):
// "Clientes", "Processos" e "Prazos" — todas opcionais.
// ============================================================

/** Converte uma célula de data da planilha (Date, dd/mm/aaaa ou aaaa-mm-dd) em Date */
function parseDataPlanilha(valor) {
    if (!valor) return null;

    if (valor instanceof Date && !isNaN(valor.getTime())) {
        return valor;
    }

    if (typeof valor === 'string') {
        const texto = valor.trim();
        const viaFormatoBr = typeof parseDate === 'function' ? parseDate(texto) : null;
        if (viaFormatoBr) return viaFormatoBr;

        const viaISO = new Date(texto + 'T12:00:00');
        if (!isNaN(viaISO.getTime())) return viaISO;
    }

    return null;
}

/** Importa clientes, processos e prazos a partir de uma planilha .xlsx/.xls */
function importExcelData(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            const msg = 'Biblioteca de planilhas não carregada. Recarregue a página e tente novamente.';
            showToast(msg, 'error');
            reject(new Error(msg));
            return;
        }

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });

                const lerAba = (nome) => {
                    const sheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === nome);
                    return sheetName ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) : [];
                };

                const linhasClientes = lerAba('clientes');
                const linhasProcessos = lerAba('processos');
                const linhasPrazos = lerAba('prazos');

                if (linhasClientes.length === 0 && linhasProcessos.length === 0 && linhasPrazos.length === 0) {
                    throw new Error('Nenhuma aba "Clientes", "Processos" ou "Prazos" com dados foi encontrada na planilha.');
                }

                let clientesImportados = 0;
                for (const linha of linhasClientes) {
                    const nome = String(linha['Nome'] || '').trim();
                    if (!nome) continue;

                    await saveCliente({
                        nome,
                        cpfCnpj: String(linha['CPF/CNPJ'] || '').trim(),
                        telefone: String(linha['Telefone'] || '').trim(),
                        email: String(linha['E-mail'] || '').trim(),
                        linkDrive: String(linha['Link Drive'] || '').trim(),
                        observacoes: String(linha['Observações'] || '').trim()
                    });
                    clientesImportados++;
                }

                let processosImportados = 0;
                for (const linha of linhasProcessos) {
                    const numero = String(linha['Número'] || '').trim();
                    if (!numero) continue;

                    const nomeCliente = String(linha['Cliente'] || '').trim();
                    const cliente = nomeCliente
                        ? getClientes().find(c => c.nome.toLowerCase() === nomeCliente.toLowerCase())
                        : null;

                    await saveProcesso({
                        numero,
                        tribunal: String(linha['Tribunal'] || '').trim(),
                        classeNome: String(linha['Classe'] || '').trim(),
                        orgaoJulgadorNome: String(linha['Órgão Julgador'] || '').trim(),
                        clienteId: cliente ? cliente.id : '',
                        observacoes: String(linha['Observações'] || '').trim()
                    });
                    processosImportados++;
                }

                let prazosImportados = 0;
                for (const linha of linhasPrazos) {
                    const descricao = String(linha['Descrição'] || '').trim();
                    const numeroProcesso = String(linha['Processo (Número)'] || '').trim();
                    const dataVencimento = parseDataPlanilha(linha['Data Vencimento']);
                    if (!descricao || !numeroProcesso || !dataVencimento) continue;

                    const processo = getProcessoByNumero(numeroProcesso);
                    if (!processo) continue;

                    await savePrazo({
                        processoId: processo.id,
                        tipo: 'outro',
                        tipoDescricao: descricao,
                        dataInicio: new Date().toISOString(),
                        dataFim: dataVencimento.toISOString(),
                        diasPrazo: 0,
                        contagem: 'data_fixa',
                        observacoes: String(linha['Observações'] || '').trim()
                    });
                    prazosImportados++;
                }

                const resumo = `${clientesImportados} cliente(s), ${processosImportados} processo(s) e ${prazosImportados} prazo(s) importados da planilha.`;
                showToast(resumo, 'success');
                resolve({ clientesImportados, processosImportados, prazosImportados });
            } catch (err) {
                showToast('Erro ao importar planilha: ' + err.message, 'error');
                reject(err);
            }
        };

        reader.onerror = () => {
            showToast('Erro ao ler o arquivo.', 'error');
            reject(reader.error);
        };

        reader.readAsArrayBuffer(file);
    });
}

/** Gera e baixa uma planilha-modelo com as abas e colunas esperadas para importação */
function baixarModeloPlanilhaImportacao() {
    if (typeof XLSX === 'undefined') {
        showToast('Biblioteca de planilhas não carregada.', 'error');
        return;
    }

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { 'Nome': 'João da Silva Santos', 'CPF/CNPJ': '123.456.789-00', 'Telefone': '(11) 90000-0000', 'E-mail': 'joao@email.com', 'Link Drive': '', 'Observações': '' }
    ]), 'Clientes');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { 'Número': '0001339-48.2023.5.10.0013', 'Tribunal': 'TRT10', 'Classe': 'Ação Trabalhista', 'Órgão Julgador': '1ª Vara do Trabalho', 'Cliente': 'João da Silva Santos', 'Observações': '' }
    ]), 'Processos');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
        { 'Descrição': 'Audiência de Instrução', 'Processo (Número)': '0001339-48.2023.5.10.0013', 'Data Vencimento': '25/08/2026', 'Observações': '' }
    ]), 'Prazos');

    XLSX.writeFile(wb, 'modelo_importacao_prazojus.xlsx');
    showToast('Modelo de planilha baixado!', 'success');
}

/** Apaga todos os dados no banco (com confirmação) */
async function clearAllData() {
    await apiRequest('DELETE', '/api/data/tudo');
    appData = {
        processos: [],
        prazos: [],
        clientes: [],
        honorarios: [],
        config: { ...DEFAULT_CONFIG },
        feriadosCustom: []
    };
    showToast('Todos os dados foram apagados.', 'warning');
}

// ============================================================
// MIGRAÇÃO ÚNICA — dados antigos que ainda estejam no localStorage
// ============================================================
// Versões anteriores do PrazoJus guardavam tudo no localStorage do
// navegador. Estas funções detectam e importam esses dados pro
// banco, uma única vez, sem apagar o que já foi cadastrado depois
// da migração para o servidor.
// ============================================================

const LEGACY_STORAGE_KEYS = {
    PROCESSOS: 'prazojus_processos',
    PRAZOS: 'prazojus_prazos',
    CONFIG: 'prazojus_config',
    FERIADOS_CUSTOM: 'prazojus_feriados_custom',
    CLIENTES: 'prazojus_clientes',
    HONORARIOS: 'prazojus_honorarios'
};

function temDadosAntigosNoNavegador() {
    return Object.values(LEGACY_STORAGE_KEYS).some(key => !!localStorage.getItem(key));
}

async function migrarDadosDoLocalStorage() {
    const lerLegado = (key) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    };

    const clientesAntigos = lerLegado(LEGACY_STORAGE_KEYS.CLIENTES) || [];
    const processosAntigos = lerLegado(LEGACY_STORAGE_KEYS.PROCESSOS) || [];
    const prazosAntigos = lerLegado(LEGACY_STORAGE_KEYS.PRAZOS) || [];
    const honorariosAntigos = lerLegado(LEGACY_STORAGE_KEYS.HONORARIOS) || [];
    const feriadosAntigos = lerLegado(LEGACY_STORAGE_KEYS.FERIADOS_CUSTOM) || [];
    const configAntiga = lerLegado(LEGACY_STORAGE_KEYS.CONFIG);

    for (const cliente of clientesAntigos) await apiRequest('POST', '/api/data/clientes', cliente);
    for (const processo of processosAntigos) await apiRequest('POST', '/api/data/processos', processo);
    for (const prazo of prazosAntigos) await apiRequest('POST', '/api/data/prazos', prazo);
    for (const honorario of honorariosAntigos) await apiRequest('POST', '/api/data/honorarios', honorario);
    for (const feriado of feriadosAntigos) await apiRequest('POST', '/api/data/feriados', feriado);
    if (configAntiga) await apiRequest('PUT', '/api/data/config', configAntiga);

    Object.values(LEGACY_STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

    await carregarDadosDoServidor();

    return {
        clientes: clientesAntigos.length,
        processos: processosAntigos.length,
        prazos: prazosAntigos.length,
        honorarios: honorariosAntigos.length,
        feriados: feriadosAntigos.length
    };
}
