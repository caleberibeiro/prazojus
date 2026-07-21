// ============================================================
// PrazoJus - Aplicação Principal
// Roteamento SPA, renderização de páginas e gerenciamento de estado
// ============================================================

// Estado global da aplicação
let appState = {
    currentPage: 'dashboard',
    searchLoading: false,
    searchResult: null
};

// ============================================================
// Inicialização
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    initRouter();
    initSidebar();
    loadCurrentUser();

    const main = document.getElementById('main-content');

    try {
        await carregarDadosDoServidor();
    } catch (error) {
        console.error('Erro ao carregar dados do servidor:', error);
        if (main) {
            main.innerHTML = renderEmptyState(
                'Não foi possível conectar ao servidor',
                'Verifique se o servidor está rodando e se o banco de dados (DATABASE_URL) está configurado, depois recarregue a página.'
            );
        }
        return;
    }

    if (temDadosAntigosNoNavegador()) {
        await oferecerMigracaoDadosAntigos();
    }

    renderPage(getPageFromHash());
});

/** Oferece importar, uma única vez, dados de uma versão antiga do app (localStorage) para o banco */
async function oferecerMigracaoDadosAntigos() {
    const quer = confirm(
        'Encontramos dados de uma versão antiga do PrazoJus salvos neste navegador ' +
        '(processos, prazos, clientes...). Deseja importá-los para o banco de dados agora? ' +
        'Isso não apaga nada que já esteja no banco.'
    );
    if (!quer) return;

    try {
        const resumo = await migrarDadosDoLocalStorage();
        showToast(
            `Dados antigos importados: ${resumo.clientes} cliente(s), ${resumo.processos} processo(s), ${resumo.prazos} prazo(s).`,
            'success', 8000
        );
    } catch (error) {
        console.error('Erro ao migrar dados antigos:', error);
        showToast('Erro ao importar dados antigos deste navegador. Eles continuam salvos localmente — tente de novo mais tarde.', 'error');
    }
}

// ============================================================
// Sessão do usuário logado
// ============================================================

async function loadCurrentUser() {
    try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
            // Sem sessão (ex: login desativado no servidor) — esconde o bloco de usuário
            document.getElementById('sidebar-user')?.classList.add('hidden');
            return;
        }

        const usuario = await response.json();
        appState.currentUser = usuario;

        const iniciais = (usuario.nome || usuario.username || '?')
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(p => p[0].toUpperCase())
            .join('');

        const avatar = document.getElementById('sidebar-user-avatar');
        const nome = document.getElementById('sidebar-user-name');
        if (avatar) avatar.textContent = iniciais;
        if (nome) nome.textContent = usuario.nome || usuario.username;
    } catch (error) {
        console.error('Erro ao carregar usuário logado:', error);
    }
}

async function handleLogout() {
    if (!confirm('Deseja sair do PrazoJus?')) return;

    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
        window.location.href = '/login.html';
    }
}

// ============================================================
// Roteamento SPA (hash-based)
// ============================================================

function initRouter() {
    window.addEventListener('hashchange', () => {
        const page = getPageFromHash();
        renderPage(page);
    });
}

function getPageFromHash() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    return hash;
}

function navigateTo(page) {
    window.location.hash = page;
}

function renderPage(page) {
    appState.currentPage = page;
    const main = document.getElementById('main-content');
    if (!main) return;

    // Atualiza nav ativa
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    updateNotificationBadge();

    // Renderiza a página com animação
    main.style.opacity = '0';
    main.style.transform = 'translateY(10px)';

    setTimeout(() => {
        switch (page) {
            case 'dashboard':
                renderDashboard();
                break;
            case 'buscar':
                renderBuscar();
                break;
            case 'processos':
                renderProcessos();
                break;
            case 'calendario':
                renderCalendarioPage();
                break;
            case 'config':
                renderConfig();
                break;
            case 'busca-avancada':
                renderBuscaAvancada();
                break;
            case 'monitoramento':
                renderMonitoramento();
                break;
            case 'jurimetria':
                renderJurimetria();
                break;
            case 'publicacoes':
                renderPublicacoes();
                break;
            case 'diario-oficial':
                renderDiarioOficial();
                break;
            case 'calculadora':
                renderCalculadora();
                break;
            case 'clientes':
                renderClientes();
                break;
            case 'notificacoes':
                renderNotificacoes();
                break;
            case 'financeiro':
                renderFinanceiro();
                break;
            case 'relatorios':
                renderRelatorios();
                break;
            default:
                renderDashboard();
        }

        // Animação de entrada
        requestAnimationFrame(() => {
            main.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            main.style.opacity = '1';
            main.style.transform = 'translateY(0)';
        });
    }, 150);
}

// ============================================================
// Sidebar
// ============================================================

function initSidebar() {
    // Toggle mobile sidebar
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });

        // Fechar sidebar ao clicar fora (mobile)
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768 &&
                sidebar.classList.contains('open') &&
                !sidebar.contains(e.target) &&
                e.target !== toggle) {
                sidebar.classList.remove('open');
            }
        });
    }

    // Nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            if (page) {
                navigateTo(page);
                // Fecha sidebar no mobile
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar')?.classList.remove('open');
                }
            }
        });
    });
}

// ============================================================
// DASHBOARD
// ============================================================

function renderDashboard() {
    const main = document.getElementById('main-content');
    const stats = getDashboardStats();
    const prazos = getPrazosOrdenados(false).slice(0, 10);
    const audiencias = getAudienciasMarcadas(false);

    main.innerHTML = `
        <div class="page-header">
            <h1>Dashboard</h1>
            <p class="text-muted">Visão geral dos seus prazos judiciais</p>
        </div>

        <div class="summary-cards">
            <div class="summary-card card-danger" onclick="navigateTo('processos')">
                <div class="card-icon">
                    <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div class="card-value">${stats.vencidos}</div>
                <div class="card-label">Prazos Vencidos</div>
            </div>
            <div class="summary-card card-warning" onclick="navigateTo('processos')">
                <div class="card-icon">
                    <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <div class="card-value">${stats.urgentes}</div>
                <div class="card-label">Urgentes (3 dias)</div>
            </div>
            <div class="summary-card card-info">
                <div class="card-icon">
                    <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                </div>
                <div class="card-value">${stats.estaSemana}</div>
                <div class="card-label">Esta Semana</div>
            </div>
            <div class="summary-card card-success" onclick="navigateTo('processos')">
                <div class="card-icon">
                    <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                </div>
                <div class="card-value">${stats.processosAtivos}</div>
                <div class="card-label">Processos Ativos</div>
            </div>
        </div>

        <div class="section-header flex-between mt-4">
            <div class="tabs" style="margin-bottom: 0; border-bottom: none;">
                <div class="tab-item active" id="dash-tab-prazos" onclick="switchDashboardTab('prazos')">Próximos Prazos</div>
                <div class="tab-item" id="dash-tab-audiencias" onclick="switchDashboardTab('audiencias')">Audiências Marcadas${audiencias.length > 0 ? ` (${audiencias.length})` : ''}</div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="navigateTo('buscar')">
                + Buscar Processo
            </button>
        </div>

        <div class="tab-content active" id="dash-content-prazos">
            <div class="deadline-list" id="deadline-list">
                ${prazos.length > 0 ? renderDeadlineList(prazos) : renderEmptyState('Nenhum prazo cadastrado', 'Busque um processo no DataJud para começar.')}
            </div>
        </div>

        <div class="tab-content" id="dash-content-audiencias">
            <div class="deadline-list" id="audiencias-list">
                ${audiencias.length > 0 ? renderDeadlineList(audiencias) : renderEmptyState('Nenhuma audiência marcada', 'Audiências aparecem aqui quando você adiciona um prazo do tipo "Audiência".')}
            </div>
        </div>
    `;
}

function switchDashboardTab(tab) {
    document.getElementById('dash-tab-prazos').classList.toggle('active', tab === 'prazos');
    document.getElementById('dash-tab-audiencias').classList.toggle('active', tab === 'audiencias');
    document.getElementById('dash-content-prazos').classList.toggle('active', tab === 'prazos');
    document.getElementById('dash-content-audiencias').classList.toggle('active', tab === 'audiencias');
}

function renderDeadlineList(prazos) {
    return prazos.map(prazo => {
        const processo = getProcessoById(prazo.processoId);
        const urgency = getUrgencyStatus(new Date(prazo.dataFim));
        const remaining = getDaysRemaining(new Date(prazo.dataFim));
        const relativeDate = formatRelativeDate(new Date(prazo.dataFim));
        const progress = typeof getDeadlineProgress === 'function'
            ? getDeadlineProgress(new Date(prazo.criadoEm), new Date(prazo.dataFim))
            : 0;

        return `
            <div class="deadline-item ${urgency.className}" style="animation: fadeIn 0.4s ease forwards;">
                <div class="deadline-status-bar"></div>
                <div class="deadline-info">
                    <div class="deadline-title">
                        <strong>${prazo.tipoDescricao || prazo.tipo}</strong>
                        ${prazo.baseLegal ? `<span class="text-muted" style="font-size: 0.8rem;"> · ${prazo.baseLegal}</span>` : ''}
                    </div>
                    <div class="deadline-meta">
                        ${processo ? `
                            <span class="badge badge-tribunal">${processo.tribunal}</span>
                            <span class="text-muted">${processo.numero}</span>
                        ` : ''}
                    </div>
                    ${processo && processo.orgaoJulgadorNome ? `
                        <div class="text-muted" style="font-size: 0.8rem; margin-top: 2px;">
                            ${escapeHtml(processo.orgaoJulgadorNome)}
                        </div>
                    ` : ''}
                </div>
                <div class="deadline-countdown">
                    <div class="countdown-value ${urgency.className}">${relativeDate}</div>
                    <div class="countdown-date">${formatDate(new Date(prazo.dataFim))}</div>
                    <div class="deadline-progress">
                        <div class="deadline-progress-bar ${urgency.className}" style="width: ${Math.min(progress, 100)}%"></div>
                    </div>
                </div>
                <div class="deadline-actions">
                    ${prazo.status !== 'cumprido' ? `
                        <button class="btn btn-sm btn-success" onclick="handleDashboardCumprido('${prazo.id}')" title="Marcar cumprido">✓</button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" onclick="handleDeletePrazo('${prazo.id}')" title="Excluir">✕</button>
                </div>
            </div>
        `;
    }).join('');
}

async function handleDashboardCumprido(prazoId) {
    await marcarPrazoCumprido(prazoId);
    renderPage(appState.currentPage);
    showToast('Prazo marcado como cumprido!', 'success', 6000, {
        label: 'Desfazer',
        onClick: async () => {
            await marcarPrazoPendente(prazoId);
            renderPage(appState.currentPage);
            showToast('Prazo reaberto.', 'info');
        }
    });
}

async function handleReabrirPrazo(prazoId) {
    await marcarPrazoPendente(prazoId);
    renderPage(appState.currentPage);
    showToast('Prazo reaberto.', 'info');
}

async function handleDeletePrazo(prazoId) {
    if (confirm('Deseja excluir este prazo?')) {
        await deletePrazo(prazoId);
        renderPage(appState.currentPage);
        showToast('Prazo excluído.', 'info');
    }
}

// ============================================================
// BUSCAR PROCESSO (DataJud)
// ============================================================

function renderBuscar() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div class="page-header">
            <h1>Buscar Processo</h1>
            <p class="text-muted">Consulte processos na base do DataJud (CNJ)</p>
        </div>

        <div class="search-section">
            <div class="search-input-group">
                <div class="form-group" style="flex: 1;">
                    <label class="form-label">Número do Processo (CNJ)</label>
                    <input type="text" 
                           id="search-numero" 
                           class="form-input search-input" 
                           placeholder="0000000-00.0000.0.00.0000"
                           maxlength="25"
                           oninput="onSearchInput(this)">
                </div>
                <div class="form-group" style="min-width: 200px;">
                    <label class="form-label">Tribunal (auto-detectado)</label>
                    <select id="search-tribunal" class="form-select">
                        <option value="">Automático</option>
                        ${renderTribunalOptions()}
                    </select>
                </div>
                <div class="form-group" style="display: flex; align-items: flex-end;">
                    <button id="btn-buscar" class="btn btn-primary" onclick="handleBuscarProcesso()" style="height: 48px;">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 6px;">
                            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                        </svg>
                        Consultar DataJud
                    </button>
                </div>
            </div>
        </div>

        <div id="search-results"></div>
    `;
}

function renderTribunalOptions() {
    const grupos = getTribunaisAgrupados();
    let html = '';
    for (const [grupo, tribunais] of Object.entries(grupos)) {
        html += `<optgroup label="${grupo}">`;
        tribunais.forEach(t => {
            html += `<option value="${t.alias}">${t.nome}</option>`;
        });
        html += '</optgroup>';
    }
    return html;
}

// Máscara CNJ no input
function onSearchInput(input) {
    let value = input.value.replace(/[^0-9]/g, '');
    if (value.length > 20) value = value.substring(0, 20);

    // Aplica máscara: NNNNNNN-DD.AAAA.J.TR.OOOO
    let formatted = '';
    for (let i = 0; i < value.length; i++) {
        if (i === 7) formatted += '-';
        if (i === 9) formatted += '.';
        if (i === 13) formatted += '.';
        if (i === 14) formatted += '.';
        if (i === 16) formatted += '.';
        formatted += value[i];
    }

    input.value = formatted;

    // Auto-detecta tribunal
    if (value.length >= 16) {
        const tribunal = getTribunalFromCNJ(formatted);
        if (tribunal) {
            const select = document.getElementById('search-tribunal');
            if (select) select.value = tribunal;
        }
    }
}

async function handleBuscarProcesso() {
    const numero = document.getElementById('search-numero').value;
    const tribunalSelect = document.getElementById('search-tribunal').value;
    const btn = document.getElementById('btn-buscar');
    const resultsDiv = document.getElementById('search-results');

    if (!numero || numero.replace(/[^0-9]/g, '').length < 20) {
        showToast('Digite o número completo do processo (20 dígitos).', 'warning');
        return;
    }

    // Loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Consultando...';
    resultsDiv.innerHTML = renderSkeletonCard();

    try {
        const tribunal = tribunalSelect || null;
        const resultado = await buscarProcesso(numero, tribunal);

        if (resultado) {
            appState.searchResult = resultado;
            renderSearchResult(resultado);
        } else {
            resultsDiv.innerHTML = renderEmptyState('Processo não encontrado', 'Verifique o número e o tribunal selecionado.');
        }
    } catch (error) {
        console.error('Erro na busca:', error);
        resultsDiv.innerHTML = renderEmptyState('Erro na consulta', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 6px;">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            Consultar DataJud
        `;
    }
}

function renderSearchResult(processo) {
    const resultsDiv = document.getElementById('search-results');

    // Sugere prazos a partir das movimentações
    const sugestoes = typeof suggestDeadlinesFromMovements === 'function'
        ? suggestDeadlinesFromMovements(processo.movimentos)
        : [];

    const jaExiste = getProcessoByNumero(processo.numero);

    resultsDiv.innerHTML = `
        <div class="process-card" style="animation: fadeIn 0.5s ease;">
            <div class="process-card-header">
                <div>
                    <h3 style="margin: 0;">${escapeHtml(processo.numero)}</h3>
                    <span class="badge badge-tribunal">${escapeHtml(processo.tribunal)}</span>
                    ${processo.grau ? `<span class="badge">${processo.grau}º Grau</span>` : ''}
                </div>
                ${jaExiste
                    ? '<span class="badge" style="background: var(--color-warning); color: #000;">Já cadastrado</span>'
                    : `<button class="btn btn-primary" onclick="handleSalvarProcesso()">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 4px;">
                            <path d="M12 4v16m8-8H4"/>
                        </svg>
                        Salvar Processo
                    </button>`
                }
            </div>

            <div class="process-details">
                <div class="detail-row">
                    <span class="detail-label">Classe:</span>
                    <span>${escapeHtml(processo.classeNome || 'Não informada')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Assuntos:</span>
                    <span>${processo.assuntos.length > 0 ? processo.assuntos.map(a => escapeHtml(a.nome)).join(', ') : 'Não informado'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Órgão Julgador:</span>
                    <span>${escapeHtml(processo.orgaoJulgadorNome || 'Não informado')}</span>
                </div>
                ${processo.dataAjuizamento ? `
                    <div class="detail-row">
                        <span class="detail-label">Ajuizamento:</span>
                        <span>${formatDateTime(new Date(processo.dataAjuizamento))}</span>
                    </div>
                ` : ''}
            </div>

            ${sugestoes.length > 0 ? `
                <div class="section-header mt-4">
                    <h3>Sugestões de Prazos</h3>
                    <p class="text-muted" style="font-size: 0.85rem;">Baseado nas últimas movimentações</p>
                </div>
                <div class="suggested-deadlines">
                    ${sugestoes.map((s, i) => `
                        <div class="suggested-deadline-item">
                            <label class="flex" style="gap: 0.75rem; align-items: center; cursor: pointer;">
                                <input type="checkbox" checked class="suggestion-check" data-index="${i}">
                                <div style="flex: 1;">
                                    <strong>${escapeHtml(s.descricao)}</strong>
                                    ${s.baseLegal ? `<span class="text-muted"> · ${escapeHtml(s.baseLegal)}</span>` : ''}
                                    <div class="text-muted" style="font-size: 0.85rem;">
                                        Início: ${formatDate(new Date(s.dataInicio))} → 
                                        Vencimento: <strong>${formatDate(new Date(s.dataFimSugerida))}</strong>
                                    </div>
                                </div>
                            </label>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${processo.movimentos.length > 0 ? `
                <div class="section-header mt-4">
                    <h3>Últimas Movimentações</h3>
                </div>
                <div class="movement-timeline">
                    ${processo.movimentos.slice(0, 15).map(m => `
                        <div class="movement-item">
                            <div class="movement-dot"></div>
                            <div class="movement-content">
                                <div class="movement-date">${m.dataHora ? formatDateTime(new Date(m.dataHora)) : 'Data não informada'}</div>
                                <div class="movement-name">${escapeHtml(m.nome)}</div>
                            </div>
                        </div>
                    `).join('')}
                    ${processo.movimentos.length > 15 ? `
                        <div class="text-muted" style="padding-left: 2rem; font-size: 0.85rem;">
                            ... e mais ${processo.movimentos.length - 15} movimentações
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

async function handleSalvarProcesso() {
    if (!appState.searchResult) return;

    const processo = await saveProcesso(appState.searchResult);
    if (!processo) return;

    // Salva prazos sugeridos que estão marcados
    const checks = document.querySelectorAll('.suggestion-check:checked');
    const sugestoes = typeof suggestDeadlinesFromMovements === 'function'
        ? suggestDeadlinesFromMovements(appState.searchResult.movimentos)
        : [];

    for (const check of checks) {
        const index = parseInt(check.dataset.index);
        const sugestao = sugestoes[index];
        if (sugestao) {
            await savePrazo({
                processoId: processo.id,
                tipo: sugestao.tipo,
                tipoDescricao: sugestao.descricao,
                baseLegal: sugestao.baseLegal,
                dataInicio: sugestao.dataInicio,
                dataFim: sugestao.dataFimSugerida,
                diasPrazo: sugestao.dias || 0,
                contagem: 'uteis'
            });
        }
    }

    showToast(`Processo salvo com ${checks.length} prazo(s)!`, 'success');
    navigateTo('dashboard');
}

// ============================================================
// PROCESSOS
// ============================================================

function renderProcessos() {
    const main = document.getElementById('main-content');
    const processos = getProcessos();

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>Processos</h1>
                <p class="text-muted">${processos.length} processo(s) cadastrado(s)</p>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary btn-sm" onclick="openAddPrazoModal()">+ Novo Prazo</button>
                <button class="btn btn-primary btn-sm" onclick="navigateTo('buscar')">+ Buscar no DataJud</button>
            </div>
        </div>

        <div class="search-section" style="margin-bottom: 1.5rem;">
            <input type="text" class="form-input" placeholder="Filtrar por número, tribunal ou observação..." 
                   id="filtro-processos" oninput="filtrarProcessos()">
        </div>

        <div id="processos-list">
            ${processos.length > 0 ? renderProcessosList(processos) : renderEmptyState('Nenhum processo cadastrado', 'Busque um processo no DataJud para começar.')}
        </div>
    `;
}

function renderProcessosList(processos) {
    return processos.map(processo => {
        const prazos = getPrazosByProcesso(processo.id);
        const prazosAtivos = prazos.filter(p => p.status !== 'cumprido');
        const prazoMaisUrgente = prazosAtivos.sort((a, b) => new Date(a.dataFim) - new Date(b.dataFim))[0];
        const cliente = processo.clienteId ? getClienteById(processo.clienteId) : null;

        let urgencyBadge = '';
        if (prazoMaisUrgente) {
            const urgency = getUrgencyStatus(new Date(prazoMaisUrgente.dataFim));
            urgencyBadge = `<span class="badge ${urgency.className}">${urgency.label} - ${formatRelativeDate(new Date(prazoMaisUrgente.dataFim))}</span>`;
        }

        return `
            <div class="deadline-item" style="animation: fadeIn 0.3s ease forwards; cursor: pointer;" onclick="toggleProcessoDetails('${processo.id}')">
                <div class="deadline-info" style="flex: 1;">
                    <div class="flex-between">
                        <strong>${escapeHtml(processo.numero)}</strong>
                        ${urgencyBadge}
                    </div>
                    <div class="deadline-meta" style="margin-top: 4px;">
                        <span class="badge badge-tribunal">${escapeHtml(processo.tribunal)}</span>
                        <span class="text-muted">${escapeHtml(processo.classeNome || '')}</span>
                        <span class="text-muted"> · ${prazos.length} prazo(s)</span>
                        ${cliente ? `<span class="badge badge-info">👤 ${escapeHtml(cliente.nome)}</span>` : ''}
                    </div>
                    ${processo.orgaoJulgadorNome ? `
                        <div class="text-muted" style="font-size: 0.8rem; margin-top: 2px;">
                            ${escapeHtml(processo.orgaoJulgadorNome)}
                        </div>
                    ` : ''}
                </div>
                <div class="deadline-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-secondary" onclick="handleAtualizarProcesso('${processo.id}')" title="Atualizar movimentações">↻</button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteProcesso('${processo.id}')" title="Excluir processo">✕</button>
                </div>
            </div>
            <div id="details-${processo.id}" class="process-details-expanded hidden">
                ${renderProcessoDetails(processo, prazos)}
            </div>
        `;
    }).join('');
}

function toggleProcessoDetails(processoId) {
    const details = document.getElementById(`details-${processoId}`);
    if (details) {
        details.classList.toggle('hidden');
    }
}

function renderProcessoDetails(processo, prazos) {
    let prazosHtml = '';
    if (prazos.length > 0) {
        prazosHtml = prazos.map(prazo => {
            const urgency = prazo.status === 'cumprido'
                ? { status: 'done', label: 'Cumprido', className: 'status-done' }
                : getUrgencyStatus(new Date(prazo.dataFim));

            return `
                <div class="deadline-item compact ${urgency.className}" style="margin: 0.25rem 0;">
                    <div class="deadline-status-bar"></div>
                    <div class="deadline-info" style="flex: 1;">
                        <strong>${escapeHtml(prazo.tipoDescricao || prazo.tipo)}</strong>
                        <span class="text-muted" style="font-size: 0.8rem;">
                            ${formatDate(new Date(prazo.dataFim))} · ${prazo.baseLegal || ''}
                        </span>
                    </div>
                    <span class="badge ${urgency.className}">${urgency.label}</span>
                    <div style="display: flex; gap: 0.25rem; margin-left: 0.5rem;" onclick="event.stopPropagation()">
                        ${prazo.status !== 'cumprido'
                            ? `<button class="btn btn-sm btn-success" onclick="handleDashboardCumprido('${prazo.id}')">✓</button>`
                            : `<button class="btn btn-sm btn-secondary" onclick="handleReabrirPrazo('${prazo.id}')">↩</button>`
                        }
                        <button class="btn btn-sm btn-danger" onclick="handleDeletePrazo('${prazo.id}')">✕</button>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        prazosHtml = '<p class="text-muted" style="padding: 0.5rem 0;">Nenhum prazo cadastrado para este processo.</p>';
    }

    const clientes = getClientes();

    return `
        <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.05);">
            <div class="flex gap-2 mb-2" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-primary" onclick="openAddPrazoModalFor('${processo.id}')">
                    + Adicionar Prazo
                </button>
                <select class="form-select" style="max-width: 220px;" onchange="handleAtribuirCliente('${processo.id}', this.value)">
                    <option value="">Cliente: nenhum</option>
                    ${clientes.map(c => `<option value="${c.id}" ${processo.clienteId === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
                </select>
            </div>
            ${prazosHtml}
        </div>
    `;
}

async function handleAtribuirCliente(processoId, clienteId) {
    await updateProcesso(processoId, { clienteId });
    showToast(clienteId ? 'Cliente vinculado ao processo!' : 'Cliente removido do processo.', 'success');
    renderProcessos();
}

function filtrarProcessos() {
    const filtro = document.getElementById('filtro-processos').value.toLowerCase();
    const processos = getProcessos().filter(p => {
        const search = `${p.numero} ${p.tribunal} ${p.classeNome} ${p.orgaoJulgadorNome} ${p.observacoes}`.toLowerCase();
        return search.includes(filtro);
    });

    const list = document.getElementById('processos-list');
    list.innerHTML = processos.length > 0
        ? renderProcessosList(processos)
        : renderEmptyState('Nenhum processo encontrado', 'Tente outro termo de busca.');
}

async function handleAtualizarProcesso(processoId) {
    showToast('Atualizando movimentações...', 'info');
    await atualizarMovimentacoes(processoId);
    renderProcessos();
}

async function handleDeleteProcesso(processoId) {
    if (confirm('Excluir este processo e todos os seus prazos?')) {
        await deleteProcesso(processoId);
        renderProcessos();
        showToast('Processo excluído.', 'info');
    }
}

// ============================================================
// CALENDÁRIO (página)
// ============================================================

function renderCalendarioPage() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>Calendário</h1>
                <p class="text-muted">Visualize seus prazos no calendário</p>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="goToToday()">Hoje</button>
        </div>

        <div id="calendar-content"></div>
    `;

    renderCalendar();
}

// ============================================================
// CONFIGURAÇÕES
// ============================================================

function renderConfig() {
    const main = document.getElementById('main-content');
    const config = getConfig();
    const customHolidays = getCustomHolidays();

    main.innerHTML = `
        <div class="page-header">
            <h1>Configurações</h1>
            <p class="text-muted">Configure a API, feriados e preferências</p>
        </div>

        <div class="config-section">
            <h3>🔑 API DataJud</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1rem;">
                Insira sua chave de acesso da API Pública do DataJud (CNJ).
                <a href="https://datajud.cnj.jus.br" target="_blank" style="color: var(--color-primary);">Obter chave →</a>
            </p>
            <div class="flex gap-2">
                <input type="password" id="config-apikey" class="form-input" style="flex: 1;"
                       placeholder="Cole sua API Key aqui..." value="${escapeHtml(config.apiKey)}">
                <button class="btn btn-secondary" onclick="toggleApiKeyVisibility()">👁</button>
                <button class="btn btn-primary" onclick="handleSalvarApiKey()">Salvar</button>
                <button class="btn btn-secondary" onclick="handleTestarConexao()">Testar Conexão</button>
            </div>
        </div>

        <div class="config-section mt-4">
            <h3>📦 Backup de Dados</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1rem;">
                Exporte um backup completo (.json) ou importe dados de um backup (.json) ou de uma planilha (.xlsx/.xls).
                Planilhas <strong>somem</strong> registros aos existentes; backups .json <strong>substituem</strong> tudo.
                PDF e Word não são aceitos aqui — não têm como virar cliente/processo/prazo de forma confiável.
            </p>
            <div class="flex gap-2 flex-wrap">
                <button class="btn btn-primary" onclick="exportData()">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 4px;">
                        <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                    </svg>
                    Exportar Backup
                </button>
                <label class="btn btn-secondary" style="cursor: pointer;">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 4px;">
                        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                    </svg>
                    Importar (.json ou .xlsx)
                    <input type="file" accept=".json,.xlsx,.xls" onchange="handleImportFile(this)" style="display: none;">
                </label>
                <button class="btn btn-secondary" onclick="baixarModeloPlanilhaImportacao()">
                    <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 4px;">
                        <path d="M9 17v-6h2v6H9zm4 0V7h2v10h-2zM5 17v-3h2v3H5zM3 21h18M4 4l4 4m0 0l4-4m-4 4V3"/>
                    </svg>
                    Baixar Modelo de Planilha
                </button>
                <button class="btn btn-danger" onclick="handleClearData()">Limpar Tudo</button>
            </div>
        </div>

        <div class="config-section mt-4">
            <h3>📅 Feriados Customizados</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1rem;">
                Adicione feriados estaduais ou municipais para cálculo correto de prazos.
            </p>
            <div class="flex gap-2 mb-2">
                <input type="date" id="custom-holiday-date" class="form-input" style="width: 200px;">
                <input type="text" id="custom-holiday-name" class="form-input" style="flex: 1;" placeholder="Nome do feriado">
                <button class="btn btn-primary btn-sm" onclick="handleAddCustomHoliday()">+ Adicionar</button>
            </div>
            <div id="custom-holidays-list">
                ${customHolidays.length > 0 ? customHolidays.map(h => `
                    <div class="flex-between" style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <span>${h.date} — ${escapeHtml(h.name)}</span>
                        <button class="btn btn-sm btn-danger" onclick="handleRemoveCustomHoliday('${h.date}')">✕</button>
                    </div>
                `).join('') : '<p class="text-muted">Nenhum feriado customizado adicionado.</p>'}
            </div>
        </div>

        <div class="config-section mt-4">
            <h3>👥 Equipe</h3>
            <p class="text-muted" style="font-size: 0.85rem; margin-bottom: 1rem;">
                Contas com acesso ao sistema. Cada pessoa da equipe deve ter seu próprio usuário e senha.
            </p>
            <div class="form-row mb-2">
                <input type="text" id="equipe-nome" class="form-input" placeholder="Nome">
                <input type="text" id="equipe-username" class="form-input" placeholder="Usuário (login)">
                <input type="password" id="equipe-senha" class="form-input" placeholder="Senha (mín. 6 caracteres)">
            </div>
            <button class="btn btn-primary btn-sm mb-2" onclick="handleAddUsuario()">+ Adicionar à Equipe</button>
            <div id="equipe-list">
                <p class="text-muted">Carregando...</p>
            </div>
        </div>
    `;

    carregarEquipe();
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('config-apikey');
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function handleSalvarApiKey() {
    const apiKey = document.getElementById('config-apikey').value.trim();
    await saveApiKey(apiKey);
    showToast('API Key salva com sucesso!', 'success');
}

async function handleTestarConexao() {
    const apiKey = document.getElementById('config-apikey').value.trim();
    if (apiKey) await saveApiKey(apiKey);
    await testarConexaoAPI();
}

// ============================================================
// EQUIPE — gerenciamento de usuários com acesso ao sistema
// ============================================================

async function carregarEquipe() {
    const listaDiv = document.getElementById('equipe-list');
    if (!listaDiv) return;

    try {
        const response = await fetch('/api/auth/users');
        if (!response.ok) throw new Error('Erro ao carregar a lista de usuários.');
        const usuarios = await response.json();

        listaDiv.innerHTML = usuarios.map(u => {
            const souEu = appState.currentUser && appState.currentUser.id === u.id;
            return `
                <div class="flex-between" style="padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span>
                        <strong>${escapeHtml(u.nome)}</strong>
                        <span class="text-muted"> · @${escapeHtml(u.username)}</span>
                        ${souEu ? '<span class="badge badge-info"> você</span>' : ''}
                    </span>
                    ${!souEu ? `<button class="btn btn-sm btn-danger" onclick="handleRemoveUsuario('${u.id}')">✕</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        listaDiv.innerHTML = `<p class="text-muted">${escapeHtml(error.message)}</p>`;
    }
}

async function handleAddUsuario() {
    const nome = document.getElementById('equipe-nome').value.trim();
    const username = document.getElementById('equipe-username').value.trim();
    const senha = document.getElementById('equipe-senha').value;

    if (!username || !senha) {
        showToast('Preencha usuário e senha.', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/auth/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, username, password: senha })
        });
        const dados = await response.json();

        if (!response.ok) {
            showToast(dados.mensagem || 'Erro ao criar usuário.', 'error');
            return;
        }

        showToast(`Usuário "${username}" adicionado à equipe!`, 'success');
        document.getElementById('equipe-nome').value = '';
        document.getElementById('equipe-username').value = '';
        document.getElementById('equipe-senha').value = '';
        carregarEquipe();
    } catch (error) {
        showToast('Erro ao criar usuário.', 'error');
    }
}

async function handleRemoveUsuario(id) {
    if (!confirm('Remover o acesso desta pessoa ao sistema?')) return;

    try {
        const response = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
        const dados = await response.json();

        if (!response.ok) {
            showToast(dados.mensagem || 'Erro ao remover usuário.', 'error');
            return;
        }

        showToast('Usuário removido.', 'info');
        carregarEquipe();
    } catch (error) {
        showToast('Erro ao remover usuário.', 'error');
    }
}

async function handleImportFile(input) {
    const file = input.files[0];
    if (!file) return;

    const extensao = file.name.split('.').pop().toLowerCase();

    try {
        if (extensao === 'json') {
            await importData(file);
        } else if (extensao === 'xlsx' || extensao === 'xls') {
            await importExcelData(file);
        } else {
            showToast(
                `Formato ".${extensao}" não suportado. Use um backup .json ou uma planilha .xlsx/.xls (PDF e Word não têm como virar dados estruturados aqui).`,
                'error'
            );
            input.value = '';
            return;
        }
        renderConfig();
    } catch (error) {
        // As funções de importação já mostram um toast com o motivo específico do erro
    }

    input.value = '';
}

async function handleClearData() {
    if (confirm('ATENÇÃO: Isso apagará TODOS os dados (processos, prazos, configurações). Deseja continuar?')) {
        if (confirm('Tem certeza? Esta ação não pode ser desfeita.')) {
            await clearAllData();
            renderConfig();
        }
    }
}

async function handleAddCustomHoliday() {
    const date = document.getElementById('custom-holiday-date').value;
    const name = document.getElementById('custom-holiday-name').value.trim();

    if (!date || !name) {
        showToast('Preencha a data e o nome do feriado.', 'warning');
        return;
    }

    await addCustomHoliday(date, name);
    renderConfig();
    showToast('Feriado adicionado!', 'success');
}

async function handleRemoveCustomHoliday(date) {
    await removeCustomHoliday(date);
    renderConfig();
    showToast('Feriado removido.', 'info');
}

// ============================================================
// MODAL - Adicionar Prazo Manual
// ============================================================

function openAddPrazoModal() {
    const processos = getProcessos();
    if (processos.length === 0) {
        showToast('Cadastre um processo primeiro.', 'warning');
        navigateTo('buscar');
        return;
    }

    const tipoOptions = typeof PRAZOS_PROCESSUAIS !== 'undefined'
        ? Object.entries(PRAZOS_PROCESSUAIS).map(([key, val]) =>
            `<option value="${key}">${val.descricao} (${val.dias} dias ${val.tipo}) ${val.base ? '- ' + val.base : ''}</option>`
        ).join('')
        : '<option value="outro">Outro (15 dias úteis)</option>';

    const html = `
        <div class="modal-header">
            <h3>Adicionar Prazo</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Processo</label>
                <select id="modal-processo" class="form-select">
                    ${processos.map(p => `<option value="${p.id}">${p.numero} - ${p.tribunal}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Tipo de Prazo</label>
                <select id="modal-tipo" class="form-select" onchange="onTipoChange()">
                    ${tipoOptions}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Data de Intimação (início)</label>
                <input type="date" id="modal-data-inicio" class="form-input" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label class="form-label">Dias do Prazo</label>
                <input type="number" id="modal-dias" class="form-input" value="15" min="0">
            </div>
            <div class="form-group">
                <label class="form-label">Contagem</label>
                <select id="modal-contagem" class="form-select">
                    <option value="uteis" selected>Dias Úteis</option>
                    <option value="corridos">Dias Corridos</option>
                    <option value="data_fixa">Data Fixa</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea id="modal-obs" class="form-textarea" rows="2" placeholder="Observações opcionais..."></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="handleSalvarPrazoModal()">Salvar Prazo</button>
        </div>
    `;

    openModal(html);
}

function openAddPrazoModalFor(processoId) {
    openAddPrazoModal();
    // Seleciona o processo no modal
    setTimeout(() => {
        const select = document.getElementById('modal-processo');
        if (select) select.value = processoId;
    }, 100);
}

function onTipoChange() {
    const tipo = document.getElementById('modal-tipo').value;
    if (typeof PRAZOS_PROCESSUAIS !== 'undefined' && PRAZOS_PROCESSUAIS[tipo]) {
        document.getElementById('modal-dias').value = PRAZOS_PROCESSUAIS[tipo].dias;
        document.getElementById('modal-contagem').value = PRAZOS_PROCESSUAIS[tipo].tipo;
    }
}

async function handleSalvarPrazoModal() {
    const processoId = document.getElementById('modal-processo').value;
    const tipo = document.getElementById('modal-tipo').value;
    const dataInicio = document.getElementById('modal-data-inicio').value;
    const dias = parseInt(document.getElementById('modal-dias').value) || 0;
    const contagem = document.getElementById('modal-contagem').value;
    const obs = document.getElementById('modal-obs').value.trim();

    if (!processoId || !dataInicio) {
        showToast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }

    // Calcula data fim
    const startDate = new Date(dataInicio + 'T12:00:00');
    let dataFim;

    if (typeof calculateDeadline === 'function' && contagem !== 'data_fixa') {
        const result = calculateDeadline(startDate, dias, contagem, getCustomHolidays());
        dataFim = result.dataFim;
    } else {
        dataFim = new Date(startDate);
        dataFim.setDate(dataFim.getDate() + dias);
    }

    const tipoInfo = typeof PRAZOS_PROCESSUAIS !== 'undefined' ? PRAZOS_PROCESSUAIS[tipo] : null;

    await savePrazo({
        processoId,
        tipo,
        tipoDescricao: tipoInfo ? tipoInfo.descricao : tipo,
        baseLegal: tipoInfo ? tipoInfo.base : '',
        dataInicio: startDate.toISOString(),
        dataFim: dataFim.toISOString(),
        diasPrazo: dias,
        contagem,
        observacoes: obs
    });

    closeModal();
    renderPage(appState.currentPage);
    showToast('Prazo adicionado com sucesso!', 'success');
}

// ============================================================
// MODAL - Genérico
// ============================================================

function openModal(contentHtml) {
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        overlay.className = 'modal-overlay';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `<div class="modal">${contentHtml}</div>`;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.innerHTML = '';
        }, 300);
    }
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

function renderEmptyState(title, subtitle) {
    return `
        <div class="empty-state">
            <div class="empty-state-icon">
                <svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
            </div>
            <h3 class="empty-state-text">${title}</h3>
            ${subtitle ? `<p class="text-muted">${subtitle}</p>` : ''}
        </div>
    `;
}

function renderSkeletonCard() {
    return `
        <div class="skeleton-card" style="animation: fadeIn 0.3s ease;">
            <div class="skeleton skeleton-text" style="width: 60%; height: 24px;"></div>
            <div class="skeleton skeleton-text" style="width: 40%; height: 16px; margin-top: 8px;"></div>
            <div class="skeleton skeleton-text" style="width: 80%; height: 16px; margin-top: 8px;"></div>
            <div class="skeleton skeleton-text" style="width: 50%; height: 16px; margin-top: 8px;"></div>
            <div class="skeleton skeleton-text" style="width: 100%; height: 100px; margin-top: 16px;"></div>
        </div>
    `;
}

// ============================================================
// BUSCA AVANÇADA — Por Parte, Por Advogado, Multi-Tribunal
// ============================================================

let buscaAvancadaState = {
    mode: 'parte', // 'parte', 'advogado', 'multi'
    loading: false,
    results: []
};

function renderBuscaAvancada() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div class="page-header">
            <h1>Busca Avançada</h1>
            <p class="text-muted">Encontre processos por parte, advogado ou em múltiplos tribunais</p>
        </div>

        <div class="search-mode-cards">
            <div class="search-mode-card ${buscaAvancadaState.mode === 'parte' ? 'active' : ''}" onclick="setBuscaMode('parte')">
                <div class="search-mode-icon">👤</div>
                <div class="search-mode-title">Por Nome da Parte</div>
                <div class="search-mode-desc">Encontre processos de um cliente</div>
            </div>
            <div class="search-mode-card ${buscaAvancadaState.mode === 'advogado' ? 'active' : ''}" onclick="setBuscaMode('advogado')">
                <div class="search-mode-icon">👨‍⚖️</div>
                <div class="search-mode-title">Por Advogado</div>
                <div class="search-mode-desc">Busque por nome do advogado</div>
            </div>
            <div class="search-mode-card ${buscaAvancadaState.mode === 'multi' ? 'active' : ''}" onclick="setBuscaMode('multi')">
                <div class="search-mode-icon">🗺️</div>
                <div class="search-mode-title">Multi-Tribunal</div>
                <div class="search-mode-desc">Busque em todos os TJs de uma vez</div>
            </div>
        </div>

        <div id="busca-avancada-form"></div>
        <div id="busca-avancada-results"></div>
    `;

    renderBuscaAvancadaForm();
}

function setBuscaMode(mode) {
    buscaAvancadaState.mode = mode;
    buscaAvancadaState.results = [];
    document.querySelectorAll('.search-mode-card').forEach(c => c.classList.remove('active'));
    document.querySelector(`.search-mode-card:nth-child(${mode === 'parte' ? 1 : mode === 'advogado' ? 2 : 3})`).classList.add('active');
    renderBuscaAvancadaForm();
    document.getElementById('busca-avancada-results').innerHTML = '';
}

function renderBuscaAvancadaForm() {
    const form = document.getElementById('busca-avancada-form');
    const mode = buscaAvancadaState.mode;

    if (mode === 'multi') {
        const tjs = typeof getTJsEstaduais === 'function' ? getTJsEstaduais() : [];
        form.innerHTML = `
            <div class="search-section">
                <div class="form-group">
                    <label class="form-label">${'Nome para buscar (parte ou advogado)'}</label>
                    <input type="text" id="multi-nome" class="form-input search-input" placeholder="Digite o nome completo...">
                </div>
                <div class="form-group">
                    <label class="form-label">Tipo de busca</label>
                    <select id="multi-tipo" class="form-select">
                        <option value="parte">Por Nome da Parte</option>
                        <option value="advogado">Por Advogado</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Tribunais (clique para selecionar/deselecionar)</label>
                    <div class="flex gap-2 mb-2">
                        <button class="btn btn-sm btn-secondary" onclick="toggleAllTribunais(true)">Selecionar Todos</button>
                        <button class="btn btn-sm btn-secondary" onclick="toggleAllTribunais(false)">Limpar</button>
                    </div>
                    <div class="tribunal-selector" id="tribunal-selector">
                        ${tjs.map(t => `
                            <span class="tribunal-chip selected" data-tribunal="${t}" onclick="toggleTribunalChip(this)">
                                ${t.toUpperCase()}
                            </span>
                        `).join('')}
                    </div>
                </div>
                <button class="btn btn-primary" id="btn-multi-buscar" onclick="handleBuscaMultiTribunal()">
                    🔍 Buscar em Todos os Tribunais Selecionados
                </button>
            </div>
            <div id="multi-progress" style="display:none;"></div>
        `;
    } else {
        const label = mode === 'parte' ? 'Nome da Parte (cliente)' : 'Nome do Advogado';
        const placeholder = mode === 'parte' ? 'Ex: João da Silva Santos' : 'Ex: Dr. Maria Oliveira';

        form.innerHTML = `
            <div class="search-section">
                <div class="search-input-group">
                    <div class="form-group" style="flex: 1;">
                        <label class="form-label">${label}</label>
                        <input type="text" id="busca-avancada-nome" class="form-input search-input" placeholder="${placeholder}">
                    </div>
                    <div class="form-group" style="min-width: 200px;">
                        <label class="form-label">Tribunal</label>
                        <select id="busca-avancada-tribunal" class="form-select">
                            ${renderTribunalOptions()}
                        </select>
                    </div>
                    <div class="form-group" style="display: flex; align-items: flex-end;">
                        <button id="btn-busca-avancada" class="btn btn-primary" onclick="handleBuscaAvancada()" style="height: 48px;">
                            🔍 Buscar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

function toggleAllTribunais(select) {
    document.querySelectorAll('.tribunal-chip').forEach(chip => {
        chip.classList.toggle('selected', select);
    });
}

function toggleTribunalChip(el) {
    el.classList.toggle('selected');
}

function getSelectedTribunais() {
    return Array.from(document.querySelectorAll('.tribunal-chip.selected')).map(c => c.dataset.tribunal);
}

async function handleBuscaAvancada() {
    const nome = document.getElementById('busca-avancada-nome').value.trim();
    const tribunal = document.getElementById('busca-avancada-tribunal').value;
    const btn = document.getElementById('btn-busca-avancada');
    const resultsDiv = document.getElementById('busca-avancada-results');

    if (!nome || nome.length < 3) {
        showToast('Digite pelo menos 3 caracteres.', 'warning');
        return;
    }

    if (!tribunal) {
        showToast('Selecione um tribunal.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Buscando...';
    resultsDiv.innerHTML = renderSkeletonCard();

    try {
        const buscaFn = buscaAvancadaState.mode === 'advogado' ? buscarPorAdvogado : buscarPorParte;
        const processos = await buscaFn(nome, tribunal);

        if (processos.length > 0) {
            resultsDiv.innerHTML = `
                <div class="section-header mt-4">
                    <h3>${processos.length} processo(s) encontrado(s)</h3>
                </div>
                ${processos.map(p => renderSearchResultCompact(p)).join('')}
            `;
        } else {
            resultsDiv.innerHTML = renderEmptyState('Nenhum processo encontrado', 'Tente outro nome ou tribunal.');
        }
    } catch (error) {
        resultsDiv.innerHTML = renderEmptyState('Erro na consulta', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Buscar';
    }
}

async function handleBuscaMultiTribunal() {
    const nome = document.getElementById('multi-nome').value.trim();
    const tipo = document.getElementById('multi-tipo').value;
    const tribunais = getSelectedTribunais();
    const btn = document.getElementById('btn-multi-buscar');
    const progressDiv = document.getElementById('multi-progress');
    const resultsDiv = document.getElementById('busca-avancada-results');

    if (!nome || nome.length < 3) {
        showToast('Digite pelo menos 3 caracteres.', 'warning');
        return;
    }

    if (tribunais.length === 0) {
        showToast('Selecione pelo menos um tribunal.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Buscando...';
    progressDiv.style.display = 'block';
    resultsDiv.innerHTML = '';

    const onProgress = (tribunal, current, total) => {
        const pct = Math.round((current / total) * 100);
        progressDiv.innerHTML = `
            <div class="monitor-progress">
                <div class="monitor-progress-bar">
                    <div class="monitor-progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="monitor-progress-text">
                    <span>Consultando ${tribunal.toUpperCase()}...</span>
                    <span>${current}/${total}</span>
                </div>
            </div>
        `;
    };

    try {
        const resultados = await buscarMultiTribunal(nome, tipo, tribunais, onProgress);

        progressDiv.style.display = 'none';

        const comResultados = resultados.filter(r => r.processos.length > 0);
        const totalProcessos = comResultados.reduce((sum, r) => sum + r.processos.length, 0);

        if (comResultados.length > 0) {
            resultsDiv.innerHTML = `
                <div class="section-header mt-4">
                    <h3>${totalProcessos} processo(s) em ${comResultados.length} tribunal(is)</h3>
                </div>
                ${comResultados.map(r => `
                    <div class="multi-result-group">
                        <div class="multi-result-header">
                            <h4>
                                <span class="badge badge-tribunal">${r.tribunal.toUpperCase()}</span>
                                ${r.tribunalNome}
                            </h4>
                            <span class="text-muted">${r.processos.length} processo(s)</span>
                        </div>
                        <div class="multi-result-body">
                            ${r.processos.map(p => `
                                <div class="multi-result-item">
                                    <div style="flex: 1;">
                                        <strong>${escapeHtml(p.numero)}</strong>
                                        <div class="text-muted" style="font-size: 0.8rem;">
                                            ${escapeHtml(p.classeNome || '')} · ${escapeHtml(p.orgaoJulgadorNome || '')}
                                        </div>
                                    </div>
                                    ${!getProcessoByNumero(p.numero) ? `
                                        <button class="btn btn-sm btn-primary" onclick="salvarProcessoRapido(this, '${escapeHtml(p.numero)}', '${r.tribunal}')">
                                            + Salvar
                                        </button>
                                    ` : '<span class="badge">Já salvo</span>'}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            `;
        } else {
            resultsDiv.innerHTML = renderEmptyState(
                'Nenhum resultado',
                `Nenhum processo encontrado para "${escapeHtml(nome)}" nos ${tribunais.length} tribunais consultados.`
            );
        }
    } catch (error) {
        progressDiv.style.display = 'none';
        resultsDiv.innerHTML = renderEmptyState('Erro na busca', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Buscar em Todos os Tribunais Selecionados';
    }
}

function renderSearchResultCompact(processo) {
    const jaExiste = getProcessoByNumero(processo.numero);
    return `
        <div class="deadline-item" style="animation: fadeIn 0.3s ease;">
            <div class="deadline-info" style="flex: 1;">
                <strong>${escapeHtml(processo.numero)}</strong>
                <div class="deadline-meta" style="margin-top: 4px;">
                    <span class="badge badge-tribunal">${escapeHtml(processo.tribunal)}</span>
                    <span class="text-muted">${escapeHtml(processo.classeNome || 'Classe não informada')}</span>
                </div>
                ${processo.orgaoJulgadorNome ? `<div class="text-muted" style="font-size: 0.8rem; margin-top: 2px;">${escapeHtml(processo.orgaoJulgadorNome)}</div>` : ''}
            </div>
            ${!jaExiste ? `
                <button class="btn btn-sm btn-primary" onclick="salvarProcessoRapido(this, '${escapeHtml(processo.numero)}', '${processo.tribunalAlias}')">
                    + Salvar
                </button>
            ` : '<span class="badge">Já salvo</span>'}
        </div>
    `;
}

async function salvarProcessoRapido(btn, numero, tribunal) {
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span>';

    try {
        const dados = await buscarProcesso(numero, tribunal);
        if (dados) {
            const processo = await saveProcesso(dados);
            if (processo) {
                // Sugere e salva prazos automaticamente
                if (typeof suggestDeadlinesFromMovements === 'function') {
                    const sugestoes = suggestDeadlinesFromMovements(dados.movimentos);
                    for (const s of sugestoes) {
                        await savePrazo({
                            processoId: processo.id,
                            tipo: s.tipo,
                            tipoDescricao: s.descricao,
                            baseLegal: s.baseLegal,
                            dataInicio: s.dataInicio,
                            dataFim: s.dataFimSugerida,
                            diasPrazo: s.dias || 0,
                            contagem: 'uteis'
                        });
                    }
                }
                btn.outerHTML = '<span class="badge">Salvo ✓</span>';
                showToast('Processo salvo!', 'success');
            }
        }
    } catch (error) {
        btn.disabled = false;
        btn.innerHTML = '+ Salvar';
        showToast('Erro ao salvar.', 'error');
    }
}

// ============================================================
// MONITORAMENTO EM LOTE
// ============================================================

function renderMonitoramento() {
    const main = document.getElementById('main-content');
    const processos = getProcessos().filter(p => p.status === 'ativo');

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>Monitoramento</h1>
                <p class="text-muted">Verifique novas movimentações em todos os seus processos</p>
            </div>
            <button class="btn btn-primary" id="btn-monitorar" onclick="handleMonitorar()" ${processos.length === 0 ? 'disabled' : ''}>
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 6px;">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                Verificar Atualizações
            </button>
        </div>

        <div id="monitor-progress-area"></div>

        <div class="summary-cards mb-4">
            <div class="summary-card card-info">
                <div class="card-value">${processos.length}</div>
                <div class="card-label">Processos Monitorados</div>
            </div>
        </div>

        <div id="monitor-results">
            ${processos.length === 0
                ? renderEmptyState('Nenhum processo para monitorar', 'Busque e salve processos para começar o monitoramento.')
                : `<div class="text-muted" style="text-align: center; padding: 2rem;">
                    <p>Clique em "Verificar Atualizações" para consultar o DataJud</p>
                    <p style="font-size: 0.8rem;">Cada processo será verificado individualmente com intervalo para respeitar o rate limit.</p>
                </div>`
            }
        </div>
    `;
}

async function handleMonitorar() {
    const btn = document.getElementById('btn-monitorar');
    const progressArea = document.getElementById('monitor-progress-area');
    const resultsDiv = document.getElementById('monitor-results');

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Monitorando...';

    const onProgress = (processo, current, total) => {
        const pct = Math.round((current / total) * 100);
        progressArea.innerHTML = `
            <div class="monitor-progress">
                <div class="monitor-progress-bar">
                    <div class="monitor-progress-fill" style="width: ${pct}%"></div>
                </div>
                <div class="monitor-progress-text">
                    <span>Verificando: ${escapeHtml(processo.numero)}</span>
                    <span>${current}/${total}</span>
                </div>
            </div>
        `;
    };

    try {
        const alertas = await monitorarTodosProcessos(onProgress);

        progressArea.innerHTML = '';

        if (alertas.length > 0) {
            const totalMovimentos = alertas.reduce((sum, a) => sum + a.novasMovimentacoes.length, 0);
            const totalPrazos = alertas.reduce((sum, a) => sum + a.novosPrazos.length, 0);

            showToast(`${alertas.length} processo(s) com novidades! ${totalMovimentos} movimentação(ões) nova(s).`, 'warning');

            resultsDiv.innerHTML = `
                <div class="section-header">
                    <h3>🔔 ${alertas.length} processo(s) com novidades</h3>
                    <p class="text-muted">${totalMovimentos} movimentação(ões) nova(s), ${totalPrazos} prazo(s) sugerido(s)</p>
                </div>
                ${alertas.map(alerta => renderAlertaMonitoramento(alerta)).join('')}
            `;
        } else {
            resultsDiv.innerHTML = `
                <div class="empty-state" style="padding: 3rem;">
                    <div class="empty-state-icon" style="font-size: 3rem;">✅</div>
                    <h3 class="empty-state-text">Tudo em dia!</h3>
                    <p class="text-muted">Nenhuma movimentação nova detectada nos seus processos.</p>
                </div>
            `;
        }
    } catch (error) {
        progressArea.innerHTML = '';
        resultsDiv.innerHTML = renderEmptyState('Erro no monitoramento', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right: 6px;">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Verificar Atualizações
        `;
    }
}

function renderAlertaMonitoramento(alerta) {
    const { processo, novasMovimentacoes, novosPrazos } = alerta;
    const hasUrgent = novosPrazos.some(p => p.tipo === 'contestacao' || p.tipo === 'apelacao');

    return `
        <div class="alert-card ${hasUrgent ? 'alert-urgent' : 'alert-new'}">
            <div class="alert-card-header">
                <div>
                    <div class="alert-card-title">${escapeHtml(processo.numero)}</div>
                    <span class="badge badge-tribunal">${escapeHtml(processo.tribunal)}</span>
                    <span class="text-muted" style="font-size: 0.8rem; margin-left: 0.5rem;">${escapeHtml(processo.orgaoJulgadorNome || '')}</span>
                </div>
                <span class="alert-badge alert-badge-new">
                    ${novasMovimentacoes.length} nova(s)
                </span>
            </div>

            <div class="alert-movements">
                <strong style="font-size: 0.85rem;">Movimentações novas:</strong>
                ${novasMovimentacoes.slice(0, 5).map(m => `
                    <div class="alert-movement-item">
                        <span class="alert-movement-dot"></span>
                        <div>
                            <span>${escapeHtml(m.nome)}</span>
                            ${m.dataHora ? `<span class="text-muted" style="font-size: 0.8rem;"> · ${formatDateTime(new Date(m.dataHora))}</span>` : ''}
                        </div>
                    </div>
                `).join('')}
                ${novasMovimentacoes.length > 5 ? `<div class="text-muted" style="font-size: 0.8rem; padding-left: 1rem;">... e mais ${novasMovimentacoes.length - 5}</div>` : ''}
            </div>

            ${novosPrazos.length > 0 ? `
                <div class="alert-suggested-deadlines">
                    <strong style="font-size: 0.85rem;">⚡ Prazos detectados automaticamente:</strong>
                    ${novosPrazos.map(p => `
                        <div class="flex-between" style="padding: 0.4rem 0; font-size: 0.85rem;">
                            <span>${escapeHtml(p.descricao)} ${p.baseLegal ? `(${p.baseLegal})` : ''}</span>
                            <div class="flex gap-2" style="align-items: center;">
                                <span class="text-muted">até ${formatDate(new Date(p.dataFimSugerida))}</span>
                                <button class="btn btn-sm btn-success" onclick="salvarPrazoDetectado('${processo.id}', ${JSON.stringify(p).replace(/'/g, "\\'").replace(/"/g, '&quot;')})">
                                    Salvar
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

async function salvarPrazoDetectado(processoId, prazoData) {
    // Parse do JSON encodado no onclick
    const p = typeof prazoData === 'string' ? JSON.parse(prazoData) : prazoData;

    await savePrazo({
        processoId: processoId,
        tipo: p.tipo,
        tipoDescricao: p.descricao,
        baseLegal: p.baseLegal,
        dataInicio: p.dataInicio,
        dataFim: p.dataFimSugerida,
        diasPrazo: p.dias || 0,
        contagem: 'uteis'
    });

    showToast(`Prazo "${p.descricao}" salvo!`, 'success');
}

// ============================================================
// JURIMETRIA — Estatísticas e Análises
// ============================================================

function renderJurimetria() {
    const main = document.getElementById('main-content');

    if (typeof calcularJurimetria !== 'function') {
        main.innerHTML = renderEmptyState('Módulo não disponível', 'A função de jurimetria não foi carregada.');
        return;
    }

    const stats = calcularJurimetria();

    if (stats.totalProcessos === 0) {
        main.innerHTML = `
            <div class="page-header">
                <h1>Jurimetria</h1>
                <p class="text-muted">Estatísticas e análises da sua carteira processual</p>
            </div>
            ${renderEmptyState('Sem dados para análise', 'Cadastre processos para ver estatísticas.')}
        `;
        return;
    }

    main.innerHTML = `
        <div class="page-header">
            <h1>Jurimetria</h1>
            <p class="text-muted">Estatísticas e análises da sua carteira processual</p>
        </div>

        <div class="summary-cards">
            <div class="summary-card card-info">
                <div class="card-value">${stats.totalProcessos}</div>
                <div class="card-label">Total de Processos</div>
            </div>
            <div class="summary-card card-warning">
                <div class="card-value">${stats.totalPrazos}</div>
                <div class="card-label">Total de Prazos</div>
            </div>
            <div class="summary-card card-success">
                <div class="card-value">${stats.taxaCumprimento}%</div>
                <div class="card-label">Taxa de Cumprimento</div>
            </div>
            <div class="summary-card card-danger">
                <div class="card-value">${stats.prazosPorStatus.vencido}</div>
                <div class="card-label">Prazos Vencidos</div>
            </div>
        </div>

        <div class="stats-grid mt-4">
            ${renderRingChart(stats)}
            ${renderBarChart('📊 Processos por Tribunal', stats.porTribunal, 'bar-primary')}
            ${renderBarChart('📋 Classes Processuais', stats.porClasse, 'bar-info')}
            ${renderBarChart('📝 Tipos de Prazo', stats.prazosPorTipo, 'bar-warning')}
            ${renderBarChart('🔖 Assuntos', stats.porAssunto, 'bar-success')}
            ${renderSparkline(stats)}
            ${renderBarChart('🏛️ Órgãos Julgadores', stats.porOrgao, 'bar-primary')}
        </div>
    `;
}

function renderRingChart(stats) {
    const { cumprido, pendente, vencido } = stats.prazosPorStatus;
    const total = cumprido + pendente + vencido;
    if (total === 0) return '';

    const circumference = 2 * Math.PI * 45; // r=45
    const cumprPct = (cumprido / total);
    const pendPct = (pendente / total);
    const vencPct = (vencido / total);

    return `
        <div class="stat-card">
            <div class="stat-card-title">⚡ Status dos Prazos</div>
            <div class="ring-chart">
                <div class="ring-container">
                    <svg class="ring-svg" viewBox="0 0 100 100">
                        <circle class="ring-bg" cx="50" cy="50" r="45"/>
                        <circle class="ring-fill ring-success" cx="50" cy="50" r="45"
                            stroke-dasharray="${cumprPct * circumference} ${circumference}"
                            stroke-dashoffset="0"/>
                        <circle class="ring-fill ring-primary" cx="50" cy="50" r="45"
                            stroke-dasharray="${pendPct * circumference} ${circumference}"
                            stroke-dashoffset="${-cumprPct * circumference}"/>
                        <circle class="ring-fill ring-danger" cx="50" cy="50" r="45"
                            stroke-dasharray="${vencPct * circumference} ${circumference}"
                            stroke-dashoffset="${-(cumprPct + pendPct) * circumference}"/>
                    </svg>
                    <div class="ring-center">
                        <div class="ring-percentage">${total}</div>
                        <div class="ring-label">prazos</div>
                    </div>
                </div>
                <div class="ring-legend">
                    <div class="ring-legend-item">
                        <span class="ring-legend-dot" style="background: var(--color-success);"></span>
                        <span>Cumpridos: ${cumprido} (${Math.round(cumprPct * 100)}%)</span>
                    </div>
                    <div class="ring-legend-item">
                        <span class="ring-legend-dot" style="background: var(--color-primary);"></span>
                        <span>Pendentes: ${pendente} (${Math.round(pendPct * 100)}%)</span>
                    </div>
                    <div class="ring-legend-item">
                        <span class="ring-legend-dot" style="background: var(--color-danger);"></span>
                        <span>Vencidos: ${vencido} (${Math.round(vencPct * 100)}%)</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderBarChart(title, data, colorClass) {
    const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (entries.length === 0) return '';

    const maxVal = Math.max(...entries.map(e => e[1]));

    return `
        <div class="stat-card">
            <div class="stat-card-title">${title}</div>
            <div class="bar-chart">
                ${entries.map(([label, value]) => `
                    <div class="bar-row">
                        <div class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label.length > 22 ? label.substring(0, 20) + '…' : label)}</div>
                        <div class="bar-track">
                            <div class="bar-fill ${colorClass}" style="width: ${Math.max((value / maxVal) * 100, 2)}%;"></div>
                        </div>
                        <div class="bar-value">${value}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderSparkline(stats) {
    const meses = Object.entries(stats.prazosPorMes);
    if (meses.length === 0) return '';

    const maxVal = Math.max(...meses.map(([, v]) => v), 1);
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return `
        <div class="stat-card">
            <div class="stat-card-title">📅 Prazos por Mês (últimos 6 meses)</div>
            <div class="sparkline">
                ${meses.map(([key, value]) => {
                    const height = Math.max((value / maxVal) * 100, 5);
                    return `<div class="sparkline-bar" style="height: ${height}%;" title="${value} prazo(s)"></div>`;
                }).join('')}
            </div>
            <div class="sparkline-labels">
                ${meses.map(([key]) => {
                    const month = parseInt(key.split('-')[1]) - 1;
                    return `<div class="sparkline-label">${nomesMeses[month]}</div>`;
                }).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// PUBLICAÇÕES DJEN — Diário de Justiça Eletrônico Nacional
// ============================================================

let djenState = {
    searchMode: 'oab', // 'oab', 'processo', 'parte', 'advogado'
    loading: false,
    results: null,
    currentPage: 1,
    lastParams: null
};

function renderPublicacoes() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div class="page-header">
            <h1>📰 Publicações DJEN</h1>
            <p class="text-muted">Diário de Justiça Eletrônico Nacional — Consulta pública de intimações, citações e editais</p>
        </div>

        <div class="search-mode-cards">
            <div class="search-mode-card ${djenState.searchMode === 'oab' ? 'active' : ''}" onclick="setDjenMode('oab')">
                <div class="search-mode-icon">🪪</div>
                <div class="search-mode-title">Por OAB</div>
                <div class="search-mode-desc">Número OAB + UF</div>
            </div>
            <div class="search-mode-card ${djenState.searchMode === 'processo' ? 'active' : ''}" onclick="setDjenMode('processo')">
                <div class="search-mode-icon">📋</div>
                <div class="search-mode-title">Por Processo</div>
                <div class="search-mode-desc">Número CNJ do processo</div>
            </div>
            <div class="search-mode-card ${djenState.searchMode === 'parte' ? 'active' : ''}" onclick="setDjenMode('parte')">
                <div class="search-mode-icon">👤</div>
                <div class="search-mode-title">Por Parte</div>
                <div class="search-mode-desc">Nome da parte</div>
            </div>
            <div class="search-mode-card ${djenState.searchMode === 'advogado' ? 'active' : ''}" onclick="setDjenMode('advogado')">
                <div class="search-mode-icon">👨‍⚖️</div>
                <div class="search-mode-title">Por Advogado</div>
                <div class="search-mode-desc">Nome do advogado</div>
            </div>
        </div>

        <div id="djen-form"></div>
        <div id="djen-results"></div>
    `;

    renderDjenForm();
}

function setDjenMode(mode) {
    djenState.searchMode = mode;
    djenState.results = null;
    djenState.currentPage = 1;
    document.querySelectorAll('.search-mode-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll('.search-mode-card');
    const idx = mode === 'oab' ? 0 : mode === 'processo' ? 1 : mode === 'parte' ? 2 : 3;
    if (cards[idx]) cards[idx].classList.add('active');
    renderDjenForm();
    document.getElementById('djen-results').innerHTML = '';
}

function renderDjenForm() {
    const form = document.getElementById('djen-form');
    const mode = djenState.searchMode;

    const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

    let formHTML = '';

    switch (mode) {
        case 'oab':
            formHTML = `
                <div class="search-section">
                    <div class="oab-filter-row">
                        <div class="form-group">
                            <label class="form-label">Número OAB</label>
                            <input type="text" id="djen-oab-numero" class="form-input" placeholder="Ex: 12345">
                        </div>
                        <div class="form-group oab-uf">
                            <label class="form-label">UF</label>
                            <select id="djen-oab-uf" class="form-select">
                                ${UFS.map(uf => `<option value="${uf}">${uf}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <button class="btn btn-primary" id="btn-djen-buscar" onclick="handleDjenSearch()" style="height: 48px;">🔍 Buscar Publicações</button>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'processo':
            formHTML = `
                <div class="search-section">
                    <div class="search-input-group">
                        <div class="form-group" style="flex: 1;">
                            <label class="form-label">Número do Processo (CNJ)</label>
                            <input type="text" id="djen-processo" class="form-input search-input" placeholder="0000000-00.0000.0.00.0000">
                        </div>
                        <div class="form-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-primary" id="btn-djen-buscar" onclick="handleDjenSearch()" style="height: 48px;">🔍 Buscar</button>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'parte':
            formHTML = `
                <div class="search-section">
                    <div class="search-input-group">
                        <div class="form-group" style="flex: 1;">
                            <label class="form-label">Nome da Parte</label>
                            <input type="text" id="djen-parte" class="form-input search-input" placeholder="Ex: João da Silva">
                        </div>
                        <div class="form-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-primary" id="btn-djen-buscar" onclick="handleDjenSearch()" style="height: 48px;">🔍 Buscar</button>
                        </div>
                    </div>
                </div>
            `;
            break;
        case 'advogado':
            formHTML = `
                <div class="search-section">
                    <div class="search-input-group">
                        <div class="form-group" style="flex: 1;">
                            <label class="form-label">Nome do Advogado</label>
                            <input type="text" id="djen-advogado" class="form-input search-input" placeholder="Ex: Dr. Maria Oliveira">
                        </div>
                        <div class="form-group" style="display: flex; align-items: flex-end;">
                            <button class="btn btn-primary" id="btn-djen-buscar" onclick="handleDjenSearch()" style="height: 48px;">🔍 Buscar</button>
                        </div>
                    </div>
                </div>
            `;
            break;
    }

    form.innerHTML = formHTML;
}

async function handleDjenSearch(page = 1) {
    const btn = document.getElementById('btn-djen-buscar');
    const resultsDiv = document.getElementById('djen-results');
    const mode = djenState.searchMode;

    let searchFn;
    let params;

    switch (mode) {
        case 'oab': {
            const numero = document.getElementById('djen-oab-numero').value.trim();
            const uf = document.getElementById('djen-oab-uf').value;
            if (!numero) { showToast('Informe o número da OAB.', 'warning'); return; }
            searchFn = () => buscarPublicacoesPorOAB(numero, uf, page);
            params = { numero, uf };
            break;
        }
        case 'processo': {
            const processo = document.getElementById('djen-processo').value.trim();
            if (!processo) { showToast('Informe o número do processo.', 'warning'); return; }
            searchFn = () => buscarPublicacoesPorProcesso(processo, page);
            params = { processo };
            break;
        }
        case 'parte': {
            const nome = document.getElementById('djen-parte').value.trim();
            if (!nome || nome.length < 3) { showToast('Digite pelo menos 3 caracteres.', 'warning'); return; }
            searchFn = () => buscarPublicacoesPorParte(nome, '', page);
            params = { nome };
            break;
        }
        case 'advogado': {
            const nome = document.getElementById('djen-advogado').value.trim();
            if (!nome || nome.length < 3) { showToast('Digite pelo menos 3 caracteres.', 'warning'); return; }
            searchFn = () => buscarPublicacoesPorAdvogadoDJEN(nome, '', page);
            params = { nome };
            break;
        }
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Buscando...';
    if (page === 1) resultsDiv.innerHTML = renderSkeletonCard();

    try {
        const resultado = await searchFn();
        djenState.results = resultado;
        djenState.currentPage = page;
        djenState.lastParams = params;

        renderDjenResults(resultado, page);
    } catch (error) {
        resultsDiv.innerHTML = renderEmptyState('Erro na consulta DJEN', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Buscar' + (mode === 'oab' ? ' Publicações' : '');
    }
}

function renderDjenResults(resultado, page) {
    const resultsDiv = document.getElementById('djen-results');
    const items = resultado.items || [];
    const total = resultado.count || items.length;
    const itensPorPagina = 100;
    const totalPages = Math.ceil(total / itensPorPagina);

    if (items.length === 0) {
        resultsDiv.innerHTML = renderEmptyState('Nenhuma publicação encontrada', 'Tente outros parâmetros de busca.');
        return;
    }

    const tipoMap = {
        'C': 'Citação', 'I': 'Intimação', 'E': 'Edital',
        'P': 'Pauta de Julgamento', 'L': 'Lista de Distribuição', 'A': 'Ata de Sessão'
    };

    resultsDiv.innerHTML = `
        <div class="section-header mt-4">
            <h3>📰 ${total} publicação(ões) encontrada(s)</h3>
            ${totalPages > 1 ? `<p class="text-muted">Página ${page} de ${totalPages}</p>` : ''}
        </div>

        ${items.map(item => {
            const tipo = item.tipoComunicacao || '';
            const tipoNome = tipoMap[tipo] || tipo || 'Publicação';
            const tipoClasse = tipo ? `tipo-${tipo}` : '';
            const data = item.data_disponibilizacao || item.datadisponibilizacao || '';
            const dataFormatada = data ? formatDate(new Date(data + 'T12:00:00')) : 'Data não informada';
            const tribunal = item.siglaTribunal || '';
            const orgao = item.nomeOrgao || '';
            const processo = item.numeroprocessocommascara || item.numero_processo || '';
            const texto = item.texto || '';
            const classe = item.nomeClasse || '';
            const link = item.link || '';
            const destinatarios = item.destinatarios || [];
            const advogados = item.destinatarioadvogados || [];
            const itemId = item.id || Math.random().toString(36).slice(2);

            return `
                <div class="publicacao-card ${tipo === 'I' ? 'tipo-intimacao' : tipo === 'C' ? 'tipo-citacao' : tipo === 'E' ? 'tipo-edital' : tipo === 'P' ? 'tipo-pauta' : ''}">
                    <div class="publicacao-header">
                        <div style="flex: 1;">
                            <strong>${escapeHtml(processo)}</strong>
                            ${classe ? `<span class="text-muted" style="font-size: 0.8rem; margin-left: 0.5rem;">${escapeHtml(classe)}</span>` : ''}
                        </div>
                        <span class="publicacao-tipo-badge ${tipoClasse}">${escapeHtml(tipoNome)}</span>
                    </div>

                    <div class="publicacao-texto" id="pub-texto-${itemId}">
                        ${escapeHtml(texto)}
                    </div>
                    ${texto.length > 200 ? `
                        <button class="publicacao-expand-btn" onclick="togglePublicacaoTexto('${itemId}')">
                            Ver texto completo ▾
                        </button>
                    ` : ''}

                    <div class="publicacao-meta">
                        <span class="publicacao-meta-item">📅 ${dataFormatada}</span>
                        ${tribunal ? `<span class="publicacao-meta-item"><span class="badge badge-tribunal">${escapeHtml(tribunal)}</span></span>` : ''}
                        ${orgao ? `<span class="publicacao-meta-item">🏛️ ${escapeHtml(orgao)}</span>` : ''}
                        ${link ? `<a href="${escapeHtml(link)}" target="_blank" class="publicacao-link">🔗 Inteiro teor</a>` : ''}
                    </div>

                    ${destinatarios.length > 0 ? `
                        <div class="publicacao-destinatarios">
                            ${destinatarios.map(d => `
                                <span class="publicacao-destinatario polo-${d.polo || 'D'}">
                                    ${escapeHtml(d.nome)} (${d.polo === 'A' ? 'Ativo' : d.polo === 'P' ? 'Passivo' : d.polo === 'T' ? 'Terceiro' : 'Outro'})
                                </span>
                            `).join('')}
                        </div>
                    ` : ''}

                    ${advogados.length > 0 ? `
                        <div class="publicacao-destinatarios" style="margin-top: 0.25rem;">
                            ${advogados.map(da => {
                                const adv = da.advogado || {};
                                return `<span class="publicacao-destinatario">⚖️ ${escapeHtml(adv.nome || '')} (OAB ${escapeHtml(adv.numero_oab || '')}/${escapeHtml(adv.uf_oab || '')})</span>`;
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('')}

        ${totalPages > 1 ? `
            <div class="pagination">
                <button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} onclick="handleDjenSearch(${page - 1})">← Anterior</button>
                <span class="pagination-info">Página ${page} de ${totalPages}</span>
                <button class="pagination-btn" ${page >= totalPages ? 'disabled' : ''} onclick="handleDjenSearch(${page + 1})">Próxima →</button>
            </div>
        ` : ''}
    `;
}

function togglePublicacaoTexto(itemId) {
    const el = document.getElementById(`pub-texto-${itemId}`);
    const btn = el.nextElementSibling;
    if (el.classList.contains('expanded')) {
        el.classList.remove('expanded');
        btn.textContent = 'Ver texto completo ▾';
    } else {
        el.classList.add('expanded');
        btn.textContent = 'Recolher ▴';
    }
}

// ============================================================
// CALCULADORA DE PRAZOS (avulsa, sem precisar de processo cadastrado)
// ============================================================

let calculadoraState = { lastResult: null };

function renderCalculadora() {
    const main = document.getElementById('main-content');

    const tipoOptions = typeof PRAZOS_PROCESSUAIS !== 'undefined'
        ? Object.entries(PRAZOS_PROCESSUAIS).map(([key, val]) =>
            `<option value="${key}">${val.descricao} (${val.dias} dias ${val.tipo})</option>`
        ).join('')
        : '';

    main.innerHTML = `
        <div class="page-header">
            <h1>Calculadora de Prazos</h1>
            <p class="text-muted">Calcule um vencimento processual sem precisar cadastrar um processo</p>
        </div>

        <div class="search-section">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Data de Início (intimação/publicação)</label>
                    <input type="date" id="calc-data-inicio" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group">
                    <label class="form-label">Tipo de Prazo</label>
                    <select id="calc-tipo" class="form-select" onchange="onCalcTipoChange()">
                        <option value="">Personalizado</option>
                        ${tipoOptions}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Dias do Prazo</label>
                    <input type="number" id="calc-dias" class="form-input" value="15" min="0">
                </div>
                <div class="form-group">
                    <label class="form-label">Contagem</label>
                    <select id="calc-contagem" class="form-select">
                        <option value="uteis" selected>Dias Úteis</option>
                        <option value="corridos">Dias Corridos</option>
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" onclick="handleCalcularPrazo()">
                🧮 Calcular Vencimento
            </button>
        </div>

        <div id="calc-resultado"></div>
    `;
}

function onCalcTipoChange() {
    const tipo = document.getElementById('calc-tipo').value;
    if (typeof PRAZOS_PROCESSUAIS !== 'undefined' && PRAZOS_PROCESSUAIS[tipo]) {
        document.getElementById('calc-dias').value = PRAZOS_PROCESSUAIS[tipo].dias;
        document.getElementById('calc-contagem').value = PRAZOS_PROCESSUAIS[tipo].tipo;
    }
}

function handleCalcularPrazo() {
    const dataInicioStr = document.getElementById('calc-data-inicio').value;
    const dias = parseInt(document.getElementById('calc-dias').value) || 0;
    const contagem = document.getElementById('calc-contagem').value;
    const resultadoDiv = document.getElementById('calc-resultado');

    if (!dataInicioStr) {
        showToast('Informe a data de início.', 'warning');
        return;
    }

    const startDate = new Date(dataInicioStr + 'T12:00:00');
    const resultado = calculateDeadline(startDate, dias, contagem, getCustomHolidays());

    if (!resultado.dataFim) {
        resultadoDiv.innerHTML = renderEmptyState('Não foi possível calcular', 'Verifique a data informada.');
        return;
    }

    const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    calculadoraState.lastResult = {
        dataInicio: startDate.toISOString(),
        dataFim: resultado.dataFim.toISOString(),
        dias,
        contagem
    };

    resultadoDiv.innerHTML = `
        <div class="process-card mt-4" style="animation: fadeIn 0.4s ease;">
            <div class="section-header">
                <h3>📅 Resultado</h3>
            </div>
            <div class="summary-cards">
                <div class="summary-card card-success">
                    <div class="card-value" style="font-size: 1.3rem;">${formatDate(resultado.dataFim)}</div>
                    <div class="card-label">${diasSemana[resultado.dataFim.getDay()]}</div>
                </div>
                <div class="summary-card card-info">
                    <div class="card-value">${resultado.diasUteis}</div>
                    <div class="card-label">Dias Úteis Contados</div>
                </div>
                <div class="summary-card card-warning">
                    <div class="card-value">${resultado.diasCorridos}</div>
                    <div class="card-label">Dias Corridos</div>
                </div>
            </div>
            <div class="flex gap-2 mt-4">
                <button class="btn btn-primary" onclick="openSalvarCalculoModal()">
                    + Vincular a um Processo e Salvar
                </button>
            </div>
        </div>
    `;
}

function openSalvarCalculoModal() {
    if (!calculadoraState.lastResult) return;
    const processos = getProcessos();
    if (processos.length === 0) {
        showToast('Cadastre um processo primeiro para vincular este prazo.', 'warning');
        return;
    }

    const html = `
        <div class="modal-header">
            <h3>Vincular Prazo a um Processo</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Processo</label>
                <select id="calc-modal-processo" class="form-select">
                    ${processos.map(p => `<option value="${p.id}">${escapeHtml(p.numero)} - ${escapeHtml(p.tribunal)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Descrição do Prazo</label>
                <input type="text" id="calc-modal-descricao" class="form-input" value="Prazo calculado" placeholder="Ex: Contestação">
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="handleSalvarCalculoComoPrazo()">Salvar Prazo</button>
        </div>
    `;
    openModal(html);
}

async function handleSalvarCalculoComoPrazo() {
    const processoId = document.getElementById('calc-modal-processo').value;
    const descricao = document.getElementById('calc-modal-descricao').value.trim() || 'Prazo calculado';
    const calc = calculadoraState.lastResult;

    await savePrazo({
        processoId,
        tipo: 'outro',
        tipoDescricao: descricao,
        dataInicio: calc.dataInicio,
        dataFim: calc.dataFim,
        diasPrazo: calc.dias,
        contagem: calc.contagem
    });

    closeModal();
    showToast('Prazo salvo com sucesso!', 'success');
    navigateTo('processos');
}

// ============================================================
// DIÁRIO OFICIAL — Caderno DJEN
// ============================================================

function renderDiarioOficial() {
    const main = document.getElementById('main-content');

    main.innerHTML = `
        <div class="page-header">
            <h1>📖 Diário Oficial</h1>
            <p class="text-muted">Baixe o caderno de publicações (Diário ou Edital) de um tribunal em uma data específica</p>
        </div>

        <div class="search-section">
            <div class="search-input-group">
                <div class="form-group" style="min-width: 220px;">
                    <label class="form-label">Tribunal</label>
                    <select id="caderno-tribunal" class="form-select">
                        <option value="">Selecione...</option>
                        ${renderTribunalOptions()}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Data</label>
                    <input type="date" id="caderno-data" class="form-input" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group" style="min-width: 160px;">
                    <label class="form-label">Meio</label>
                    <select id="caderno-meio" class="form-select">
                        <option value="D">Diário</option>
                        <option value="E">Edital</option>
                    </select>
                </div>
                <div class="form-group" style="display: flex; align-items: flex-end;">
                    <button id="btn-caderno" class="btn btn-primary" onclick="handleBuscarCaderno()" style="height: 48px;">
                        🔍 Buscar Caderno
                    </button>
                </div>
            </div>
        </div>

        <div id="caderno-resultado"></div>
    `;
}

async function handleBuscarCaderno() {
    const tribunal = document.getElementById('caderno-tribunal').value;
    const data = document.getElementById('caderno-data').value;
    const meio = document.getElementById('caderno-meio').value;
    const btn = document.getElementById('btn-caderno');
    const resultadoDiv = document.getElementById('caderno-resultado');

    if (!tribunal) {
        showToast('Selecione um tribunal.', 'warning');
        return;
    }
    if (!data) {
        showToast('Selecione uma data.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-loading"></span> Buscando...';
    resultadoDiv.innerHTML = renderSkeletonCard();

    try {
        const dados = await buscarCadernoDJEN(tribunal, data, meio);
        renderCadernoResultado(dados, tribunal, data, meio);
    } catch (error) {
        resultadoDiv.innerHTML = renderEmptyState('Erro ao buscar o caderno', error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '🔍 Buscar Caderno';
    }
}

function renderCadernoResultado(dados, tribunal, data, meio) {
    const resultadoDiv = document.getElementById('caderno-resultado');

    // A API externa pode devolver um array ou um objeto único; normaliza
    const item = Array.isArray(dados) ? dados[0] : dados;

    if (!item) {
        resultadoDiv.innerHTML = renderEmptyState('Nenhum caderno encontrado', 'Não há caderno disponível para esse tribunal, data e meio.');
        return;
    }

    const url = item.url || item.link || item.arquivo || item.download_url || null;

    resultadoDiv.innerHTML = `
        <div class="process-card mt-4" style="animation: fadeIn 0.4s ease;">
            <div class="process-card-header">
                <div>
                    <h3 style="margin: 0;">${escapeHtml(getTribunalName(tribunal))}</h3>
                    <span class="badge badge-tribunal">${meio === 'D' ? 'Diário' : 'Edital'}</span>
                    <span class="text-muted"> · ${formatDate(new Date(data + 'T12:00:00'))}</span>
                </div>
                ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn btn-primary">⬇ Baixar Caderno</a>` : ''}
            </div>
            <div class="process-details mt-2">
                ${Object.entries(item).filter(([k]) => !['url', 'link', 'arquivo', 'download_url'].includes(k)).map(([k, v]) => `
                    <div class="detail-row">
                        <span class="detail-label">${escapeHtml(k)}:</span>
                        <span>${escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================
// CLIENTES — CRM básico vinculado a processos e prazos
// ============================================================

function renderClientes() {
    const main = document.getElementById('main-content');
    const clientes = getClientes();

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>Clientes</h1>
                <p class="text-muted">${clientes.length} cliente(s) cadastrado(s)</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openAddClienteModal()">+ Novo Cliente</button>
        </div>

        <div class="search-section" style="margin-bottom: 1.5rem;">
            <input type="text" class="form-input" placeholder="Filtrar por nome, CPF/CNPJ ou e-mail..."
                   id="filtro-clientes" oninput="filtrarClientes()">
        </div>

        <div id="clientes-list">
            ${clientes.length > 0 ? renderClientesList(clientes) : renderEmptyState('Nenhum cliente cadastrado', 'Cadastre um cliente para vincular processos e ser lembrado dos prazos dele.')}
        </div>
    `;
}

function renderClientesList(clientes) {
    return clientes.map(cliente => {
        const processos = getProcessosByCliente(cliente.id);
        const prazos = getPrazosByCliente(cliente.id);
        const proximoPrazo = prazos[0];

        let urgencyBadge = '';
        if (proximoPrazo) {
            const urgency = getUrgencyStatus(new Date(proximoPrazo.dataFim));
            urgencyBadge = `<span class="badge ${urgency.className}">${urgency.label} · ${formatRelativeDate(new Date(proximoPrazo.dataFim))}</span>`;
        }

        return `
            <div class="deadline-item" style="animation: fadeIn 0.3s ease forwards; cursor: pointer;" onclick="toggleClienteDetails('${cliente.id}')">
                <div class="deadline-info" style="flex: 1;">
                    <div class="flex-between">
                        <strong>${escapeHtml(cliente.nome)}</strong>
                        ${urgencyBadge}
                    </div>
                    <div class="deadline-meta" style="margin-top: 4px;">
                        ${cliente.cpfCnpj ? `<span class="text-muted">${escapeHtml(cliente.cpfCnpj)}</span>` : ''}
                        <span class="text-muted"> · ${processos.length} processo(s) · ${prazos.length} prazo(s) pendente(s)</span>
                    </div>
                    ${cliente.telefone || cliente.email ? `
                        <div class="text-muted" style="font-size: 0.8rem; margin-top: 2px;">
                            ${escapeHtml(cliente.telefone || '')} ${cliente.telefone && cliente.email ? '·' : ''} ${escapeHtml(cliente.email || '')}
                        </div>
                    ` : ''}
                </div>
                <div class="deadline-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-secondary" onclick="openEditClienteModal('${cliente.id}')" title="Editar">✎</button>
                    <button class="btn btn-sm btn-danger" onclick="handleDeleteCliente('${cliente.id}')" title="Excluir">✕</button>
                </div>
            </div>
            <div id="cliente-details-${cliente.id}" class="process-details-expanded hidden">
                ${renderClienteDetails(cliente, processos, prazos)}
            </div>
        `;
    }).join('');
}

function toggleClienteDetails(clienteId) {
    const details = document.getElementById(`cliente-details-${clienteId}`);
    if (details) details.classList.toggle('hidden');
}

function renderClienteDetails(cliente, processos, prazos) {
    const processosDisponiveis = getProcessos().filter(p => !p.clienteId);

    return `
        <div style="padding: 1rem 1.5rem; border-top: 1px solid rgba(255,255,255,0.05);" onclick="event.stopPropagation()">
            ${cliente.observacoes ? `<p class="text-muted mb-2">${escapeHtml(cliente.observacoes)}</p>` : ''}
            ${cliente.linkDrive ? `
                <a href="${escapeHtml(cliente.linkDrive)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary mb-2">
                    📁 Abrir Pasta no Drive
                </a>
            ` : ''}

            <div class="section-header">
                <h4 style="margin: 0;">Processos Vinculados</h4>
            </div>
            ${processos.length > 0 ? processos.map(p => `
                <div class="flex-between" style="padding: 0.4rem 0; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span><span class="badge badge-tribunal">${escapeHtml(p.tribunal)}</span> ${escapeHtml(p.numero)}</span>
                    <button class="btn btn-sm btn-secondary" onclick="handleDesvincularProcesso('${p.id}')">Desvincular</button>
                </div>
            `).join('') : '<p class="text-muted" style="font-size: 0.85rem;">Nenhum processo vinculado ainda.</p>'}

            ${processosDisponiveis.length > 0 ? `
                <div class="flex gap-2 mt-2 mb-2">
                    <select id="vincular-processo-${cliente.id}" class="form-select" style="flex: 1;">
                        <option value="">Vincular processo existente...</option>
                        ${processosDisponiveis.map(p => `<option value="${p.id}">${escapeHtml(p.numero)} - ${escapeHtml(p.tribunal)}</option>`).join('')}
                    </select>
                    <button class="btn btn-sm btn-primary" onclick="handleVincularProcesso('${cliente.id}')">Vincular</button>
                </div>
            ` : ''}

            <div class="section-header mt-2">
                <h4 style="margin: 0;">Próximos Prazos</h4>
            </div>
            ${prazos.length > 0 ? prazos.slice(0, 5).map(prazo => {
                const urgency = getUrgencyStatus(new Date(prazo.dataFim));
                return `
                    <div class="deadline-item compact ${urgency.className}" style="margin: 0.25rem 0;">
                        <div class="deadline-status-bar"></div>
                        <div class="deadline-info" style="flex: 1;">
                            <strong>${escapeHtml(prazo.tipoDescricao || prazo.tipo)}</strong>
                            <span class="text-muted" style="font-size: 0.8rem;">${formatDate(new Date(prazo.dataFim))}</span>
                        </div>
                        <span class="badge ${urgency.className}">${urgency.label}</span>
                    </div>
                `;
            }).join('') : '<p class="text-muted" style="font-size: 0.85rem;">Nenhum prazo pendente.</p>'}
        </div>
    `;
}

async function handleVincularProcesso(clienteId) {
    const select = document.getElementById(`vincular-processo-${clienteId}`);
    const processoId = select.value;
    if (!processoId) {
        showToast('Selecione um processo.', 'warning');
        return;
    }
    await updateProcesso(processoId, { clienteId });
    showToast('Processo vinculado ao cliente!', 'success');
    renderClientes();
}

async function handleDesvincularProcesso(processoId) {
    await updateProcesso(processoId, { clienteId: '' });
    showToast('Processo desvinculado.', 'info');
    renderClientes();
}

function filtrarClientes() {
    const filtro = document.getElementById('filtro-clientes').value.toLowerCase();
    const clientes = getClientes().filter(c => {
        const search = `${c.nome} ${c.cpfCnpj} ${c.email} ${c.telefone}`.toLowerCase();
        return search.includes(filtro);
    });
    const list = document.getElementById('clientes-list');
    list.innerHTML = clientes.length > 0
        ? renderClientesList(clientes)
        : renderEmptyState('Nenhum cliente encontrado', 'Tente outro termo de busca.');
}

function openAddClienteModal() {
    const html = `
        <div class="modal-header">
            <h3>Novo Cliente</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Nome Completo *</label>
                <input type="text" id="cliente-nome" class="form-input" placeholder="Nome do cliente">
            </div>
            <div class="form-group">
                <label class="form-label">CPF/CNPJ</label>
                <input type="text" id="cliente-cpfcnpj" class="form-input" placeholder="000.000.000-00">
            </div>
            <div class="form-group">
                <label class="form-label">Telefone</label>
                <input type="text" id="cliente-telefone" class="form-input" placeholder="(00) 00000-0000">
            </div>
            <div class="form-group">
                <label class="form-label">E-mail</label>
                <input type="email" id="cliente-email" class="form-input" placeholder="cliente@email.com">
            </div>
            <div class="form-group">
                <label class="form-label">Link da Pasta no Drive</label>
                <input type="url" id="cliente-drive" class="form-input" placeholder="https://drive.google.com/drive/folders/...">
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea id="cliente-obs" class="form-textarea" rows="2"></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="handleSalvarCliente()">Salvar Cliente</button>
        </div>
    `;
    openModal(html);
}

function openEditClienteModal(id) {
    const cliente = getClienteById(id);
    if (!cliente) return;

    const html = `
        <div class="modal-header">
            <h3>Editar Cliente</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Nome Completo *</label>
                <input type="text" id="cliente-nome" class="form-input" value="${escapeHtml(cliente.nome)}">
            </div>
            <div class="form-group">
                <label class="form-label">CPF/CNPJ</label>
                <input type="text" id="cliente-cpfcnpj" class="form-input" value="${escapeHtml(cliente.cpfCnpj)}">
            </div>
            <div class="form-group">
                <label class="form-label">Telefone</label>
                <input type="text" id="cliente-telefone" class="form-input" value="${escapeHtml(cliente.telefone)}">
            </div>
            <div class="form-group">
                <label class="form-label">E-mail</label>
                <input type="email" id="cliente-email" class="form-input" value="${escapeHtml(cliente.email)}">
            </div>
            <div class="form-group">
                <label class="form-label">Link da Pasta no Drive</label>
                <input type="url" id="cliente-drive" class="form-input" value="${escapeHtml(cliente.linkDrive || '')}" placeholder="https://drive.google.com/drive/folders/...">
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea id="cliente-obs" class="form-textarea" rows="2">${escapeHtml(cliente.observacoes)}</textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="handleSalvarCliente('${id}')">Salvar Alterações</button>
        </div>
    `;
    openModal(html);
}

async function handleSalvarCliente(id) {
    const nome = document.getElementById('cliente-nome').value.trim();
    const cpfCnpj = document.getElementById('cliente-cpfcnpj').value.trim();
    const telefone = document.getElementById('cliente-telefone').value.trim();
    const email = document.getElementById('cliente-email').value.trim();
    const linkDrive = document.getElementById('cliente-drive').value.trim();
    const observacoes = document.getElementById('cliente-obs').value.trim();

    if (!nome) {
        showToast('Informe o nome do cliente.', 'warning');
        return;
    }

    const dados = { nome, cpfCnpj, telefone, email, linkDrive, observacoes };

    if (id) {
        await updateCliente(id, dados);
        showToast('Cliente atualizado!', 'success');
    } else {
        await saveCliente(dados);
        showToast('Cliente cadastrado!', 'success');
    }

    closeModal();
    renderClientes();
}

async function handleDeleteCliente(id) {
    if (confirm('Excluir este cliente? Os processos vinculados não serão excluídos, apenas desvinculados.')) {
        await deleteCliente(id);
        renderClientes();
        showToast('Cliente excluído.', 'info');
    }
}

// ============================================================
// CENTRAL DE NOTIFICAÇÕES — agrega prazos vencidos e próximos
// ============================================================

function getNotificacoesUrgentes() {
    const config = getConfig();
    const diasAtencao = config.diasAlertaAtencao || 7;
    return getPrazosOrdenados(false).filter(p => getDaysRemaining(new Date(p.dataFim)) <= diasAtencao);
}

/** Atualiza o contador de notificações exibido no item da sidebar */
function updateNotificationBadge() {
    const nav = document.querySelector('.nav-item[data-page="notificacoes"]');
    if (!nav) return;

    let badge = nav.querySelector('.nav-item-badge');
    const count = getNotificacoesUrgentes().length;

    if (count > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'nav-item-badge';
            nav.appendChild(badge);
        }
        badge.textContent = count;
    } else if (badge) {
        badge.remove();
    }
}

function renderNotificacoes() {
    const main = document.getElementById('main-content');
    const urgentes = getNotificacoesUrgentes();

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>🔔 Central de Notificações</h1>
                <p class="text-muted">Prazos vencidos e próximos do vencimento, de todos os clientes e processos</p>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-secondary btn-sm" onclick="navigateTo('monitoramento')">Verificar Movimentações</button>
                <button class="btn btn-secondary btn-sm" onclick="navigateTo('publicacoes')">Verificar Publicações</button>
            </div>
        </div>

        <div id="notificacoes-list">
            ${urgentes.length > 0 ? renderNotificacoesList(urgentes) : `
                <div class="empty-state" style="padding: 3rem;">
                    <div class="empty-state-icon" style="font-size: 3rem;">✅</div>
                    <h3 class="empty-state-text">Nenhuma notificação no momento</h3>
                    <p class="text-muted">Você será avisado aqui quando um prazo estiver próximo do vencimento.</p>
                </div>
            `}
        </div>
    `;
}

function renderNotificacoesList(prazos) {
    return prazos.map(prazo => {
        const processo = getProcessoById(prazo.processoId);
        const cliente = processo && processo.clienteId ? getClienteById(processo.clienteId) : null;
        const urgency = getUrgencyStatus(new Date(prazo.dataFim));
        const relativeDate = formatRelativeDate(new Date(prazo.dataFim));

        return `
            <div class="deadline-item ${urgency.className}" style="animation: fadeIn 0.4s ease forwards;">
                <div class="deadline-status-bar"></div>
                <div class="deadline-info">
                    <div class="deadline-title">
                        <strong>${escapeHtml(prazo.tipoDescricao || prazo.tipo)}</strong>
                        ${cliente ? `<span class="badge badge-info">👤 ${escapeHtml(cliente.nome)}</span>` : ''}
                    </div>
                    <div class="deadline-meta">
                        ${processo ? `
                            <span class="badge badge-tribunal">${escapeHtml(processo.tribunal)}</span>
                            <span class="text-muted">${escapeHtml(processo.numero)}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="deadline-countdown">
                    <div class="countdown-value ${urgency.className}">${relativeDate}</div>
                    <div class="countdown-date">${formatDate(new Date(prazo.dataFim))}</div>
                </div>
                <div class="deadline-actions">
                    <button class="btn btn-sm btn-success" onclick="handleDashboardCumprido('${prazo.id}')" title="Marcar cumprido">✓</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================================
// FINANCEIRO — Controle de Honorários
// ============================================================

function formatMoeda(valor) {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderFinanceiro() {
    const main = document.getElementById('main-content');
    const stats = getFinanceiroStats();
    const honorarios = getHonorarios();

    main.innerHTML = `
        <div class="page-header flex-between">
            <div>
                <h1>Financeiro</h1>
                <p class="text-muted">Controle de honorários por cliente e processo</p>
            </div>
            <button class="btn btn-primary btn-sm" onclick="openAddHonorarioModal()">+ Novo Honorário</button>
        </div>

        <div class="summary-cards">
            <div class="summary-card card-success">
                <div class="card-value" style="font-size: 1.4rem;">${formatMoeda(stats.recebido)}</div>
                <div class="card-label">Recebido</div>
            </div>
            <div class="summary-card card-info">
                <div class="card-value" style="font-size: 1.4rem;">${formatMoeda(stats.pendente)}</div>
                <div class="card-label">A Receber</div>
            </div>
            <div class="summary-card card-danger">
                <div class="card-value" style="font-size: 1.4rem;">${formatMoeda(stats.atrasado)}</div>
                <div class="card-label">Atrasado (${stats.qtdAtrasados})</div>
            </div>
        </div>

        <div id="honorarios-list" class="mt-4">
            ${honorarios.length > 0 ? renderHonorariosTable(honorarios) : renderEmptyState('Nenhum honorário cadastrado', 'Cadastre um honorário para começar a controlar seus recebíveis.')}
        </div>
    `;
}

function renderHonorariosTable(honorarios) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const tipoLabel = { contratual: 'Contratual', exito: 'Êxito', hora: 'Por Hora' };
    const ordenados = [...honorarios].sort((a, b) => new Date(a.vencimento || 0) - new Date(b.vencimento || 0));

    return `
        <div class="data-table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Descrição</th>
                        <th>Cliente</th>
                        <th>Tipo</th>
                        <th>Vencimento</th>
                        <th>Valor</th>
                        <th class="col-status">Status</th>
                        <th class="col-actions">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${ordenados.map(h => {
                        const cliente = h.clienteId ? getClienteById(h.clienteId) : null;
                        const processo = h.processoId ? getProcessoById(h.processoId) : null;
                        const vencido = h.status === 'pendente' && h.vencimento && new Date(h.vencimento + 'T12:00:00') < hoje;
                        const statusLabel = h.status === 'pago' ? 'Pago' : vencido ? 'Atrasado' : 'Pendente';
                        const statusClass = h.status === 'pago' ? 'badge-success' : vencido ? 'badge-danger' : 'badge-warning';

                        return `
                            <tr>
                                <td>
                                    <strong>${escapeHtml(h.descricao)}</strong>
                                    ${processo ? `<div class="text-muted" style="font-size: 0.75rem;">${escapeHtml(processo.numero)}</div>` : ''}
                                </td>
                                <td>${cliente ? escapeHtml(cliente.nome) : '<span class="text-muted">—</span>'}</td>
                                <td>${tipoLabel[h.tipo] || h.tipo}</td>
                                <td>${h.vencimento ? formatDate(new Date(h.vencimento + 'T12:00:00')) : '<span class="text-muted">—</span>'}</td>
                                <td>${formatMoeda(h.valor)}</td>
                                <td class="col-status"><span class="badge ${statusClass}">${statusLabel}</span></td>
                                <td class="col-actions">
                                    <div class="flex gap-2" style="justify-content: flex-end;">
                                        ${h.status !== 'pago'
                                            ? `<button class="btn btn-sm btn-success" onclick="handleMarcarHonorarioPago('${h.id}')" title="Marcar pago">✓</button>`
                                            : `<button class="btn btn-sm btn-secondary" onclick="handleMarcarHonorarioPendente('${h.id}')" title="Marcar pendente">↩</button>`
                                        }
                                        <button class="btn btn-sm btn-danger" onclick="handleDeleteHonorario('${h.id}')" title="Excluir">✕</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function handleMarcarHonorarioPago(id) {
    await marcarHonorarioPago(id);
    renderFinanceiro();
    showToast('Honorário marcado como pago!', 'success');
}

async function handleMarcarHonorarioPendente(id) {
    await marcarHonorarioPendente(id);
    renderFinanceiro();
}

async function handleDeleteHonorario(id) {
    if (confirm('Excluir este honorário?')) {
        await deleteHonorario(id);
        renderFinanceiro();
        showToast('Honorário excluído.', 'info');
    }
}

function openAddHonorarioModal() {
    const clientes = getClientes();
    const processos = getProcessos();

    const html = `
        <div class="modal-header">
            <h3>Novo Honorário</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            <div class="form-group">
                <label class="form-label">Descrição *</label>
                <input type="text" id="hon-descricao" class="form-input" placeholder="Ex: Honorários contratuais - 1ª parcela">
            </div>
            <div class="form-group">
                <label class="form-label">Cliente</label>
                <select id="hon-cliente" class="form-select">
                    <option value="">Nenhum</option>
                    ${clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Processo</label>
                <select id="hon-processo" class="form-select">
                    <option value="">Nenhum</option>
                    ${processos.map(p => `<option value="${p.id}">${escapeHtml(p.numero)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Tipo</label>
                <select id="hon-tipo" class="form-select">
                    <option value="contratual">Contratual</option>
                    <option value="exito">Êxito</option>
                    <option value="hora">Por Hora</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Valor (R$) *</label>
                <input type="number" id="hon-valor" class="form-input" step="0.01" min="0" placeholder="0,00">
            </div>
            <div class="form-group">
                <label class="form-label">Vencimento</label>
                <input type="date" id="hon-vencimento" class="form-input">
            </div>
            <div class="form-group">
                <label class="form-label">Observações</label>
                <textarea id="hon-obs" class="form-textarea" rows="2"></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="handleSalvarHonorario()">Salvar</button>
        </div>
    `;
    openModal(html);
}

async function handleSalvarHonorario() {
    const descricao = document.getElementById('hon-descricao').value.trim();
    const clienteId = document.getElementById('hon-cliente').value;
    const processoId = document.getElementById('hon-processo').value;
    const tipo = document.getElementById('hon-tipo').value;
    const valor = parseFloat(document.getElementById('hon-valor').value);
    const vencimento = document.getElementById('hon-vencimento').value;
    const observacoes = document.getElementById('hon-obs').value.trim();

    if (!descricao || !valor || valor <= 0) {
        showToast('Preencha a descrição e um valor válido.', 'warning');
        return;
    }

    await saveHonorario({ descricao, clienteId, processoId, tipo, valor, vencimento, observacoes });

    closeModal();
    renderFinanceiro();
    showToast('Honorário cadastrado!', 'success');
}

// ============================================================
// RELATÓRIOS — Exportação de prazos por período (CSV / PDF)
// ============================================================

let relatorioState = { prazos: [] };

function renderRelatorios() {
    const main = document.getElementById('main-content');
    const clientes = getClientes();
    const hoje = new Date().toISOString().split('T')[0];
    const em30Dias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    main.innerHTML = `
        <div class="page-header">
            <h1>Relatórios</h1>
            <p class="text-muted">Exporte seus prazos por período em CSV ou PDF</p>
        </div>

        <div class="search-section no-print">
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">De</label>
                    <input type="date" id="rel-data-inicio" class="form-input" value="${hoje}">
                </div>
                <div class="form-group">
                    <label class="form-label">Até</label>
                    <input type="date" id="rel-data-fim" class="form-input" value="${em30Dias}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select id="rel-status" class="form-select">
                        <option value="">Todos</option>
                        <option value="pendente">Pendentes</option>
                        <option value="cumprido">Cumpridos</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Cliente</label>
                    <select id="rel-cliente" class="form-select">
                        <option value="">Todos</option>
                        ${clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <button class="btn btn-primary" onclick="handleGerarRelatorio()">Gerar Relatório</button>
        </div>

        <div id="relatorio-acoes" class="hidden flex gap-2 mt-4 no-print">
            <button class="btn btn-secondary" onclick="exportarRelatorioCSV()">⬇ Exportar CSV</button>
            <button class="btn btn-secondary" onclick="window.print()">🖨 Imprimir / Salvar PDF</button>
        </div>

        <div id="relatorio-resultado" class="mt-4"></div>
    `;
}

function handleGerarRelatorio() {
    const dataInicio = document.getElementById('rel-data-inicio').value;
    const dataFim = document.getElementById('rel-data-fim').value;
    const status = document.getElementById('rel-status').value;
    const clienteId = document.getElementById('rel-cliente').value;
    const resultadoDiv = document.getElementById('relatorio-resultado');
    const acoesDiv = document.getElementById('relatorio-acoes');

    let prazos = getPrazos();

    if (dataInicio) prazos = prazos.filter(p => new Date(p.dataFim) >= new Date(dataInicio + 'T00:00:00'));
    if (dataFim) prazos = prazos.filter(p => new Date(p.dataFim) <= new Date(dataFim + 'T23:59:59'));
    if (status) prazos = prazos.filter(p => p.status === status);
    if (clienteId) {
        const processoIds = getProcessosByCliente(clienteId).map(p => p.id);
        prazos = prazos.filter(p => processoIds.includes(p.processoId));
    }

    prazos = prazos.sort((a, b) => new Date(a.dataFim) - new Date(b.dataFim));
    relatorioState.prazos = prazos;

    if (prazos.length === 0) {
        resultadoDiv.innerHTML = renderEmptyState('Nenhum prazo encontrado', 'Ajuste os filtros e tente novamente.');
        acoesDiv.classList.add('hidden');
        return;
    }

    acoesDiv.classList.remove('hidden');
    resultadoDiv.innerHTML = `
        <div class="data-table-wrapper">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Prazo</th>
                        <th>Cliente</th>
                        <th>Processo</th>
                        <th>Tribunal</th>
                        <th>Vencimento</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${prazos.map(p => {
                        const processo = getProcessoById(p.processoId);
                        const cliente = processo && processo.clienteId ? getClienteById(processo.clienteId) : null;
                        return `
                            <tr>
                                <td>${escapeHtml(p.tipoDescricao || p.tipo)}</td>
                                <td>${cliente ? escapeHtml(cliente.nome) : '—'}</td>
                                <td>${processo ? escapeHtml(processo.numero) : '—'}</td>
                                <td>${processo ? escapeHtml(processo.tribunal) : '—'}</td>
                                <td>${formatDate(new Date(p.dataFim))}</td>
                                <td>${p.status === 'cumprido' ? 'Cumprido' : 'Pendente'}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function exportarRelatorioCSV() {
    const prazos = relatorioState.prazos;
    if (!prazos || prazos.length === 0) return;

    const header = ['Prazo', 'Cliente', 'Processo', 'Tribunal', 'Vencimento', 'Status'];
    const linhas = prazos.map(p => {
        const processo = getProcessoById(p.processoId);
        const cliente = processo && processo.clienteId ? getClienteById(processo.clienteId) : null;
        return [
            p.tipoDescricao || p.tipo,
            cliente ? cliente.nome : '',
            processo ? processo.numero : '',
            processo ? processo.tribunal : '',
            formatDate(new Date(p.dataFim)),
            p.status === 'cumprido' ? 'Cumprido' : 'Pendente'
        ];
    });

    const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [header, ...linhas].map(row => row.map(csvEscape).join(';')).join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_prazos_${formatDate(new Date()).replace(/\//g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Relatório CSV exportado!', 'success');
}
