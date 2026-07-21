// ============================================================
// PrazoJus - Componente de Calendário Visual
// Calendário mensal interativo com marcadores de prazos
// ============================================================

// Estado do calendário
let calendarState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
};

// ============================================================
// Nomes dos meses e dias da semana em pt-BR
// ============================================================
const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ============================================================
// Renderização do calendário
// ============================================================

/**
 * Renderiza o calendário completo no container especificado
 * @param {string} containerId - ID do elemento container
 */
function renderCalendar(containerId = 'calendar-content') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { year, month } = calendarState;
    const prazosDoMes = getPrazosByMonth(year, month);

    // Agrupa prazos por dia
    const prazosPorDia = {};
    prazosDoMes.forEach(prazo => {
        const date = new Date(prazo.dataFim);
        const day = date.getDate();
        if (!prazosPorDia[day]) prazosPorDia[day] = [];
        prazosPorDia[day].push(prazo);
    });

    const html = `
        <div class="calendar-container">
            <div class="calendar-header">
                <button class="btn btn-icon" onclick="navigateCalendar(-1)" title="Mês anterior">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M15 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h2 class="calendar-title">${MESES[month]} ${year}</h2>
                <button class="btn btn-icon" onclick="navigateCalendar(1)" title="Próximo mês">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
            <div class="calendar-weekdays">
                ${DIAS_SEMANA.map(d => `<div class="calendar-weekday">${d}</div>`).join('')}
            </div>
            <div class="calendar-grid">
                ${generateCalendarDays(year, month, prazosPorDia)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Gera os dias do calendário como HTML
 */
function generateCalendarDays(year, month, prazosPorDia) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '';

    // Dias vazios antes do primeiro dia do mês
    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day calendar-day-empty"></div>';
    }

    // Dias do mês
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        currentDate.setHours(0, 0, 0, 0);

        const isToday = currentDate.getTime() === today.getTime();
        const prazos = prazosPorDia[day] || [];
        const hasDeadlines = prazos.length > 0;

        // Determina a classe de urgência mais alta do dia
        let urgencyClass = '';
        if (hasDeadlines) {
            const urgencies = prazos
                .filter(p => p.status !== 'cumprido')
                .map(p => {
                    const dataFim = new Date(p.dataFim);
                    return getUrgencyStatus(dataFim);
                });

            // Prioridade: overdue > critical > warning > normal > safe
            const priority = ['overdue', 'critical', 'warning', 'normal', 'safe'];
            for (const status of priority) {
                if (urgencies.some(u => u.status === status)) {
                    urgencyClass = `has-deadline-${status}`;
                    break;
                }
            }
        }

        // Verifica se é fim de semana
        const isWeekendDay = currentDate.getDay() === 0 || currentDate.getDay() === 6;

        const classes = [
            'calendar-day',
            isToday ? 'today' : '',
            hasDeadlines ? 'has-deadline' : '',
            urgencyClass,
            isWeekendDay ? 'weekend' : ''
        ].filter(Boolean).join(' ');

        html += `
            <div class="${classes}" 
                 onclick="onCalendarDayClick(${year}, ${month}, ${day})"
                 title="${hasDeadlines ? prazos.length + ' prazo(s)' : ''}">
                <span class="calendar-day-number">${day}</span>
                ${hasDeadlines ? generateDayMarkers(prazos) : ''}
            </div>
        `;
    }

    return html;
}

/**
 * Gera marcadores visuais para os prazos de um dia
 */
function generateDayMarkers(prazos) {
    const markers = prazos
        .slice(0, 3) // Máximo de 3 marcadores visíveis
        .map(prazo => {
            const urgency = prazo.status === 'cumprido'
                ? { className: 'status-done' }
                : getUrgencyStatus(new Date(prazo.dataFim));
            return `<span class="calendar-marker ${urgency.className}"></span>`;
        })
        .join('');

    const extra = prazos.length > 3 ? `<span class="calendar-marker-extra">+${prazos.length - 3}</span>` : '';

    return `<div class="calendar-markers">${markers}${extra}</div>`;
}

// ============================================================
// Navegação do calendário
// ============================================================

/**
 * Navega para o mês anterior ou próximo
 * @param {number} direction - -1 para anterior, 1 para próximo
 */
function navigateCalendar(direction) {
    calendarState.month += direction;

    if (calendarState.month < 0) {
        calendarState.month = 11;
        calendarState.year--;
    } else if (calendarState.month > 11) {
        calendarState.month = 0;
        calendarState.year++;
    }

    renderCalendar();
}

/**
 * Vai para o mês/ano atual
 */
function goToToday() {
    calendarState.year = new Date().getFullYear();
    calendarState.month = new Date().getMonth();
    renderCalendar();
}

/**
 * Vai para um mês específico
 */
function goToMonth(year, month) {
    calendarState.year = year;
    calendarState.month = month;
    renderCalendar();
}

// ============================================================
// Interação com dias do calendário
// ============================================================

/**
 * Handler de clique em um dia do calendário
 * Mostra popup com os prazos do dia
 */
function onCalendarDayClick(year, month, day) {
    const date = new Date(year, month, day);
    const prazos = getPrazosByDate(date.toISOString());

    if (prazos.length === 0) {
        // Se não tem prazos, oferece criar um novo
        showDayPopup(date, []);
        return;
    }

    showDayPopup(date, prazos);
}

/**
 * Mostra popup com prazos do dia selecionado
 */
function showDayPopup(date, prazos) {
    const dateStr = formatDate(date);
    const dayOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
                       'Quinta-feira', 'Sexta-feira', 'Sábado'][date.getDay()];

    let prazosHtml = '';

    if (prazos.length === 0) {
        prazosHtml = `
            <div class="empty-state" style="padding: 1rem;">
                <p class="empty-state-text">Nenhum prazo nesta data</p>
            </div>
        `;
    } else {
        prazosHtml = prazos.map(prazo => {
            const processo = getProcessoById(prazo.processoId);
            const urgency = prazo.status === 'cumprido'
                ? { status: 'done', label: 'Cumprido', className: 'status-done' }
                : getUrgencyStatus(new Date(prazo.dataFim));

            return `
                <div class="deadline-item compact ${urgency.className}" style="margin-bottom: 0.5rem;">
                    <div class="deadline-status-bar"></div>
                    <div class="deadline-info" style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <strong>${prazo.tipoDescricao || prazo.tipo}</strong>
                            <span class="badge ${urgency.className}">${urgency.label}</span>
                        </div>
                        ${processo ? `<small class="text-muted">${processo.numero}</small>` : ''}
                        ${prazo.baseLegal ? `<small class="text-muted">${prazo.baseLegal}</small>` : ''}
                    </div>
                    <div style="display: flex; gap: 0.25rem; margin-left: 0.5rem;">
                        ${prazo.status !== 'cumprido' ? `
                            <button class="btn btn-sm btn-success" onclick="handleMarcarCumprido('${prazo.id}')" title="Marcar como cumprido">
                                ✓
                            </button>
                        ` : `
                            <button class="btn btn-sm btn-secondary" onclick="handleMarcarPendente('${prazo.id}')" title="Reabrir prazo">
                                ↩
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }

    const modalHtml = `
        <div class="modal-header">
            <h3>${dayOfWeek}, ${dateStr}</h3>
            <button class="btn btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
            ${prazosHtml}
        </div>
        <div class="modal-footer">
            <button class="btn btn-secondary" onclick="closeModal()">Fechar</button>
        </div>
    `;

    openModal(modalHtml);
}

// ============================================================
// Helpers para ações do calendário
// ============================================================

function handleMarcarCumprido(prazoId) {
    marcarPrazoCumprido(prazoId);
    closeModal();
    renderCalendar();
    // Atualiza o dashboard se estiver visível
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
    showToast('Prazo marcado como cumprido!', 'success');
}

function handleMarcarPendente(prazoId) {
    marcarPrazoPendente(prazoId);
    closeModal();
    renderCalendar();
    if (typeof renderDashboard === 'function') {
        renderDashboard();
    }
    showToast('Prazo reaberto.', 'info');
}
