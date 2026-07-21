// ============================================================
// PrazoJus - Módulo de Persistência (localStorage)
// Gerencia o armazenamento local de processos, prazos e config
// ============================================================

const STORAGE_KEYS = {
    PROCESSOS: 'prazojus_processos',
    PRAZOS: 'prazojus_prazos',
    CONFIG: 'prazojus_config',
    FERIADOS_CUSTOM: 'prazojus_feriados_custom',
    CLIENTES: 'prazojus_clientes',
    HONORARIOS: 'prazojus_honorarios'
};

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
// Funções auxiliares de acesso ao localStorage
// ============================================================

function storageGet(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error(`Erro ao ler ${key} do localStorage:`, e);
        return null;
    }
}

function storageSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        console.error(`Erro ao salvar ${key} no localStorage:`, e);
        showToast('Erro ao salvar dados. Verifique o espaço de armazenamento.', 'error');
        return false;
    }
}

// ============================================================
// PROCESSOS - CRUD
// ============================================================

/** Retorna todos os processos salvos */
function getProcessos() {
    return storageGet(STORAGE_KEYS.PROCESSOS) || [];
}

/** Retorna um processo pelo ID */
function getProcessoById(id) {
    const processos = getProcessos();
    return processos.find(p => p.id === id) || null;
}

/** Retorna um processo pelo número CNJ */
function getProcessoByNumero(numero) {
    const processos = getProcessos();
    const clean = numero.replace(/[^0-9]/g, '');
    return processos.find(p => p.numero.replace(/[^0-9]/g, '') === clean) || null;
}

/** Salva um novo processo */
function saveProcesso(processo) {
    const processos = getProcessos();

    // Verifica duplicata por número
    const existing = processos.find(p =>
        p.numero.replace(/[^0-9]/g, '') === processo.numero.replace(/[^0-9]/g, '')
    );
    if (existing) {
        showToast('Processo já cadastrado!', 'warning');
        return existing;
    }

    const novoProcesso = {
        id: generateId(),
        numero: processo.numero,
        tribunal: processo.tribunal || '',
        tribunalAlias: processo.tribunalAlias || '',
        classe: processo.classe || '',
        classeNome: processo.classeNome || '',
        assuntos: processo.assuntos || [],
        orgaoJulgador: processo.orgaoJulgador || '',
        orgaoJulgadorNome: processo.orgaoJulgadorNome || '',
        clienteId: processo.clienteId || '',
        partes: processo.partes || [],
        movimentos: processo.movimentos || [],
        status: processo.status || 'ativo',
        observacoes: processo.observacoes || '',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString()
    };

    processos.push(novoProcesso);
    storageSet(STORAGE_KEYS.PROCESSOS, processos);
    return novoProcesso;
}

/** Atualiza um processo existente */
function updateProcesso(id, updates) {
    const processos = getProcessos();
    const index = processos.findIndex(p => p.id === id);

    if (index === -1) {
        showToast('Processo não encontrado.', 'error');
        return null;
    }

    processos[index] = {
        ...processos[index],
        ...updates,
        atualizadoEm: new Date().toISOString()
    };

    storageSet(STORAGE_KEYS.PROCESSOS, processos);
    return processos[index];
}

/** Remove um processo e seus prazos vinculados */
function deleteProcesso(id) {
    let processos = getProcessos();
    processos = processos.filter(p => p.id !== id);
    storageSet(STORAGE_KEYS.PROCESSOS, processos);

    // Remove prazos vinculados
    let prazos = getPrazos();
    prazos = prazos.filter(p => p.processoId !== id);
    storageSet(STORAGE_KEYS.PRAZOS, prazos);

    return true;
}

// ============================================================
// PRAZOS - CRUD
// ============================================================

/** Retorna todos os prazos salvos */
function getPrazos() {
    return storageGet(STORAGE_KEYS.PRAZOS) || [];
}

/** Retorna um prazo pelo ID */
function getPrazoById(id) {
    const prazos = getPrazos();
    return prazos.find(p => p.id === id) || null;
}

/** Retorna prazos de um processo específico */
function getPrazosByProcesso(processoId) {
    const prazos = getPrazos();
    return prazos.filter(p => p.processoId === processoId);
}

/** Salva um novo prazo */
function savePrazo(prazo) {
    const prazos = getPrazos();

    const novoPrazo = {
        id: generateId(),
        processoId: prazo.processoId,
        tipo: prazo.tipo || 'outro',
        tipoDescricao: prazo.tipoDescricao || '',
        baseLegal: prazo.baseLegal || '',
        dataInicio: prazo.dataInicio, // ISO string
        dataFim: prazo.dataFim,       // ISO string
        diasPrazo: prazo.diasPrazo || 0,
        contagem: prazo.contagem || 'uteis', // 'uteis', 'corridos', 'data_fixa'
        status: prazo.status || 'pendente', // 'pendente', 'cumprido', 'perdido'
        observacoes: prazo.observacoes || '',
        criadoEm: new Date().toISOString()
    };

    prazos.push(novoPrazo);
    storageSet(STORAGE_KEYS.PRAZOS, prazos);
    return novoPrazo;
}

/** Atualiza um prazo existente */
function updatePrazo(id, updates) {
    const prazos = getPrazos();
    const index = prazos.findIndex(p => p.id === id);

    if (index === -1) {
        showToast('Prazo não encontrado.', 'error');
        return null;
    }

    prazos[index] = {
        ...prazos[index],
        ...updates
    };

    storageSet(STORAGE_KEYS.PRAZOS, prazos);
    return prazos[index];
}

/** Remove um prazo */
function deletePrazo(id) {
    let prazos = getPrazos();
    prazos = prazos.filter(p => p.id !== id);
    storageSet(STORAGE_KEYS.PRAZOS, prazos);
    return true;
}

/** Marca prazo como cumprido */
function marcarPrazoCumprido(id) {
    return updatePrazo(id, { status: 'cumprido' });
}

/** Marca prazo como pendente */
function marcarPrazoPendente(id) {
    return updatePrazo(id, { status: 'pendente' });
}

// ============================================================
// CONSULTAS E ESTATÍSTICAS
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
    const prazos = getPrazos();
    return prazos.filter(prazo => {
        const date = new Date(prazo.dataFim);
        return date.getFullYear() === year && date.getMonth() === month;
    });
}

/** Retorna prazos de um dia específico */
function getPrazosByDate(dateStr) {
    const prazos = getPrazos();
    return prazos.filter(prazo => {
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
    return storageGet(STORAGE_KEYS.CONFIG) || { ...DEFAULT_CONFIG };
}

/** Salva configuração */
function saveConfig(config) {
    const current = getConfig();
    const updated = { ...current, ...config };
    storageSet(STORAGE_KEYS.CONFIG, updated);
    return updated;
}

/** Retorna a API Key configurada */
function getApiKey() {
    const config = getConfig();
    return config.apiKey || '';
}

/** Salva a API Key */
function saveApiKey(apiKey) {
    return saveConfig({ apiKey });
}

// ============================================================
// FERIADOS CUSTOMIZADOS
// ============================================================

/** Retorna feriados customizados */
function getCustomHolidays() {
    return storageGet(STORAGE_KEYS.FERIADOS_CUSTOM) || [];
}

/** Salva feriados customizados */
function saveCustomHolidays(holidays) {
    storageSet(STORAGE_KEYS.FERIADOS_CUSTOM, holidays);
}

/** Adiciona um feriado customizado */
function addCustomHoliday(date, name) {
    const holidays = getCustomHolidays();
    holidays.push({ date, name });
    saveCustomHolidays(holidays);
    return holidays;
}

/** Remove um feriado customizado */
function removeCustomHoliday(date) {
    let holidays = getCustomHolidays();
    holidays = holidays.filter(h => h.date !== date);
    saveCustomHolidays(holidays);
    return holidays;
}

// ============================================================
// CLIENTES - CRUD
// ============================================================

/** Retorna todos os clientes salvos */
function getClientes() {
    return storageGet(STORAGE_KEYS.CLIENTES) || [];
}

/** Retorna um cliente pelo ID */
function getClienteById(id) {
    return getClientes().find(c => c.id === id) || null;
}

/** Salva um novo cliente */
function saveCliente(cliente) {
    const clientes = getClientes();

    const novoCliente = {
        id: generateId(),
        nome: cliente.nome || '',
        cpfCnpj: cliente.cpfCnpj || '',
        email: cliente.email || '',
        telefone: cliente.telefone || '',
        linkDrive: cliente.linkDrive || '',
        observacoes: cliente.observacoes || '',
        criadoEm: new Date().toISOString()
    };

    clientes.push(novoCliente);
    storageSet(STORAGE_KEYS.CLIENTES, clientes);
    return novoCliente;
}

/** Atualiza um cliente existente */
function updateCliente(id, updates) {
    const clientes = getClientes();
    const index = clientes.findIndex(c => c.id === id);

    if (index === -1) {
        showToast('Cliente não encontrado.', 'error');
        return null;
    }

    clientes[index] = { ...clientes[index], ...updates };
    storageSet(STORAGE_KEYS.CLIENTES, clientes);
    return clientes[index];
}

/** Remove um cliente e desvincula seus processos */
function deleteCliente(id) {
    let clientes = getClientes();
    clientes = clientes.filter(c => c.id !== id);
    storageSet(STORAGE_KEYS.CLIENTES, clientes);

    // Desvincula processos que apontavam para este cliente
    const processos = getProcessos();
    processos.forEach(p => {
        if (p.clienteId === id) {
            updateProcesso(p.id, { clienteId: '' });
        }
    });

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
    return storageGet(STORAGE_KEYS.HONORARIOS) || [];
}

/** Retorna um honorário pelo ID */
function getHonorarioById(id) {
    return getHonorarios().find(h => h.id === id) || null;
}

/** Retorna honorários vinculados a um cliente */
function getHonorariosByCliente(clienteId) {
    return getHonorarios().filter(h => h.clienteId === clienteId);
}

/** Salva um novo honorário */
function saveHonorario(honorario) {
    const honorarios = getHonorarios();

    const novoHonorario = {
        id: generateId(),
        clienteId: honorario.clienteId || '',
        processoId: honorario.processoId || '',
        descricao: honorario.descricao || '',
        tipo: honorario.tipo || 'contratual', // 'contratual', 'exito', 'hora'
        valor: parseFloat(honorario.valor) || 0,
        vencimento: honorario.vencimento || '', // ISO string (opcional)
        status: honorario.status || 'pendente', // 'pendente', 'pago'
        observacoes: honorario.observacoes || '',
        criadoEm: new Date().toISOString()
    };

    honorarios.push(novoHonorario);
    storageSet(STORAGE_KEYS.HONORARIOS, honorarios);
    return novoHonorario;
}

/** Atualiza um honorário existente */
function updateHonorario(id, updates) {
    const honorarios = getHonorarios();
    const index = honorarios.findIndex(h => h.id === id);

    if (index === -1) {
        showToast('Honorário não encontrado.', 'error');
        return null;
    }

    honorarios[index] = { ...honorarios[index], ...updates };
    storageSet(STORAGE_KEYS.HONORARIOS, honorarios);
    return honorarios[index];
}

/** Remove um honorário */
function deleteHonorario(id) {
    let honorarios = getHonorarios();
    honorarios = honorarios.filter(h => h.id !== id);
    storageSet(STORAGE_KEYS.HONORARIOS, honorarios);
    return true;
}

/** Marca honorário como pago */
function marcarHonorarioPago(id) {
    return updateHonorario(id, { status: 'pago', pagoEm: new Date().toISOString() });
}

/** Marca honorário como pendente */
function marcarHonorarioPendente(id) {
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

/** Importa dados de um arquivo JSON */
function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                if (!data.version || !data.processos || !data.prazos) {
                    throw new Error('Arquivo de backup inválido');
                }

                storageSet(STORAGE_KEYS.PROCESSOS, data.processos);
                storageSet(STORAGE_KEYS.PRAZOS, data.prazos);

                if (data.config) {
                    storageSet(STORAGE_KEYS.CONFIG, data.config);
                }
                if (data.feriadosCustom) {
                    storageSet(STORAGE_KEYS.FERIADOS_CUSTOM, data.feriadosCustom);
                }
                if (data.clientes) {
                    storageSet(STORAGE_KEYS.CLIENTES, data.clientes);
                }
                if (data.honorarios) {
                    storageSet(STORAGE_KEYS.HONORARIOS, data.honorarios);
                }

                showToast(`Backup importado! ${data.processos.length} processos e ${data.prazos.length} prazos restaurados.`, 'success');
                resolve(data);
            } catch (err) {
                showToast('Erro ao importar: arquivo inválido.', 'error');
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

        reader.onload = (e) => {
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
                linhasClientes.forEach(linha => {
                    const nome = String(linha['Nome'] || '').trim();
                    if (!nome) return;

                    saveCliente({
                        nome,
                        cpfCnpj: String(linha['CPF/CNPJ'] || '').trim(),
                        telefone: String(linha['Telefone'] || '').trim(),
                        email: String(linha['E-mail'] || '').trim(),
                        linkDrive: String(linha['Link Drive'] || '').trim(),
                        observacoes: String(linha['Observações'] || '').trim()
                    });
                    clientesImportados++;
                });

                let processosImportados = 0;
                linhasProcessos.forEach(linha => {
                    const numero = String(linha['Número'] || '').trim();
                    if (!numero) return;

                    const nomeCliente = String(linha['Cliente'] || '').trim();
                    const cliente = nomeCliente
                        ? getClientes().find(c => c.nome.toLowerCase() === nomeCliente.toLowerCase())
                        : null;

                    saveProcesso({
                        numero,
                        tribunal: String(linha['Tribunal'] || '').trim(),
                        classeNome: String(linha['Classe'] || '').trim(),
                        orgaoJulgadorNome: String(linha['Órgão Julgador'] || '').trim(),
                        clienteId: cliente ? cliente.id : '',
                        observacoes: String(linha['Observações'] || '').trim()
                    });
                    processosImportados++;
                });

                let prazosImportados = 0;
                linhasPrazos.forEach(linha => {
                    const descricao = String(linha['Descrição'] || '').trim();
                    const numeroProcesso = String(linha['Processo (Número)'] || '').trim();
                    const dataVencimento = parseDataPlanilha(linha['Data Vencimento']);
                    if (!descricao || !numeroProcesso || !dataVencimento) return;

                    const processo = getProcessoByNumero(numeroProcesso);
                    if (!processo) return;

                    savePrazo({
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
                });

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

/** Limpa todos os dados (com confirmação) */
function clearAllData() {
    Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
    });
    showToast('Todos os dados foram apagados.', 'warning');
}
