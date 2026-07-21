/**
 * PrazoJus - Funções Utilitárias
 * 
 * Funções auxiliares globais para o aplicativo de gestão de prazos jurídicos.
 * Inclui: geração de IDs, formatação de datas, validação CNJ, 
 * mapeamento de tribunais, debounce, escape HTML e notificações toast.
 * 
 * @author PrazoJus
 * @version 1.0.0
 */

// ============================================================================
// GERAÇÃO DE IDS
// ============================================================================

/**
 * Gera um identificador único universal (UUID v4).
 * Utiliza crypto.randomUUID() quando disponível, com fallback
 * baseado em Math.random() para navegadores mais antigos.
 * 
 * @returns {string} UUID no formato xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateId() {
    // Tenta usar a API nativa do navegador (mais segura e performática)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    // Fallback: geração manual baseada em Math.random
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ============================================================================
// FORMATAÇÃO E PARSING DE DATAS
// ============================================================================

/**
 * Formata um objeto Date para o padrão brasileiro dd/mm/aaaa.
 * 
 * @param {Date|string} date - Data a ser formatada (Date ou string ISO)
 * @returns {string} Data formatada no padrão dd/mm/aaaa
 */
function formatDate(date) {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);

    // Verifica se a data é válida
    if (isNaN(d.getTime())) return '';

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();

    return `${dia}/${mes}/${ano}`;
}

/**
 * Formata um objeto Date para o padrão brasileiro dd/mm/aaaa HH:mm.
 * 
 * @param {Date|string} date - Data a ser formatada (Date ou string ISO)
 * @returns {string} Data e hora formatadas no padrão dd/mm/aaaa HH:mm
 */
function formatDateTime(date) {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);

    if (isNaN(d.getTime())) return '';

    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const minuto = String(d.getMinutes()).padStart(2, '0');

    return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

/**
 * Faz o parse de uma string no formato dd/mm/aaaa para um objeto Date.
 * A data é criada com horário zerado (meia-noite local).
 * 
 * @param {string} str - String de data no formato dd/mm/aaaa
 * @returns {Date|null} Objeto Date correspondente ou null se inválido
 */
function parseDate(str) {
    if (!str || typeof str !== 'string') return null;

    // Aceita separadores / ou -
    const partes = str.split(/[\/\-]/);
    if (partes.length !== 3) return null;

    const dia = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1; // Meses em JS são 0-indexed
    const ano = parseInt(partes[2], 10);

    // Valida intervalos básicos
    if (isNaN(dia) || isNaN(mes) || isNaN(ano)) return null;
    if (dia < 1 || dia > 31 || mes < 0 || mes > 11 || ano < 1900) return null;

    const date = new Date(ano, mes, dia);

    // Verifica se a data é válida (ex: 31/02 seria convertido para março)
    if (date.getDate() !== dia || date.getMonth() !== mes || date.getFullYear() !== ano) {
        return null;
    }

    return date;
}

/**
 * Retorna uma representação textual relativa da data em relação a hoje.
 * Exemplos: 'Vencido há 3 dias', 'Hoje', 'Amanhã', 'Em 5 dias', 'Em 2 semanas'.
 * 
 * @param {Date|string} date - Data alvo
 * @returns {string} Texto relativo em português
 */
function formatRelativeDate(date) {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const dias = getDaysRemaining(d);

    // Data já vencida
    if (dias < 0) {
        const diasPassados = Math.abs(dias);
        if (diasPassados === 1) return 'Vencido há 1 dia';
        return `Vencido há ${diasPassados} dias`;
    }

    // Hoje
    if (dias === 0) return 'Hoje';

    // Amanhã
    if (dias === 1) return 'Amanhã';

    // Próximos dias (até 14)
    if (dias <= 14) return `Em ${dias} dias`;

    // Semanas
    const semanas = Math.floor(dias / 7);
    if (semanas === 1) return 'Em 1 semana';
    if (semanas <= 8) return `Em ${semanas} semanas`;

    // Meses
    const meses = Math.floor(dias / 30);
    if (meses === 1) return 'Em 1 mês';
    return `Em ${meses} meses`;
}

/**
 * Calcula o número de dias entre hoje e a data informada.
 * Retorna valor negativo se a data já passou, positivo se é futura, 0 se é hoje.
 * 
 * @param {Date|string} date - Data alvo para o cálculo
 * @returns {number} Número de dias restantes (negativo = passado)
 */
function getDaysRemaining(date) {
    if (!date) return 0;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return 0;

    // Normaliza ambas as datas para meia-noite para comparação justa
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const alvo = new Date(d);
    alvo.setHours(0, 0, 0, 0);

    const diffMs = alvo.getTime() - hoje.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Determina o status de urgência com base nos dias restantes até o vencimento.
 * Retorna um objeto com status semântico, label em português e classe CSS.
 * 
 * Níveis de urgência:
 * - overdue:  < 0 dias  → Vencido
 * - critical: 0-3 dias  → Crítico
 * - warning:  4-7 dias  → Atenção
 * - normal:   8-15 dias → Normal
 * - safe:     > 15 dias → Tranquilo
 * 
 * @param {Date|string} date - Data de vencimento do prazo
 * @returns {{status: string, label: string, className: string}} Objeto de urgência
 */
function getUrgencyStatus(date) {
    const dias = getDaysRemaining(date);

    if (dias < 0) {
        return { status: 'overdue', label: 'Vencido', className: 'status-overdue' };
    }

    if (dias <= 3) {
        return { status: 'critical', label: 'Crítico', className: 'status-critical' };
    }

    if (dias <= 7) {
        return { status: 'warning', label: 'Atenção', className: 'status-warning' };
    }

    if (dias <= 15) {
        return { status: 'normal', label: 'Normal', className: 'status-normal' };
    }

    return { status: 'safe', label: 'Tranquilo', className: 'status-safe' };
}

// ============================================================================
// VALIDAÇÃO E FORMATAÇÃO CNJ
// ============================================================================

/**
 * Valida um número de processo no padrão CNJ (Res. 65/2008).
 * Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
 * 
 * Onde:
 * - NNNNNNN = número sequencial (7 dígitos)
 * - DD      = dígito verificador (2 dígitos)
 * - AAAA    = ano de ajuizamento (4 dígitos)
 * - J       = justiça (1 dígito)
 * - TR      = tribunal/região (2 dígitos)
 * - OOOO    = origem/vara (4 dígitos)
 * 
 * @param {string} numero - Número do processo (com ou sem formatação)
 * @returns {{valid: boolean, parts: object|null}} Resultado da validação
 */
function validateCNJ(numero) {
    if (!numero || typeof numero !== 'string') {
        return { valid: false, parts: null };
    }

    // Remove tudo que não é dígito
    const digitos = numero.replace(/\D/g, '');

    // Deve ter exatamente 20 dígitos
    if (digitos.length !== 20) {
        return { valid: false, parts: null };
    }

    // Extrai as partes do número
    const parts = {
        sequencial: digitos.substring(0, 7),    // NNNNNNN
        digito: digitos.substring(7, 9),         // DD
        ano: digitos.substring(9, 13),           // AAAA
        justica: digitos.substring(13, 14),      // J
        tribunal: digitos.substring(14, 16),     // TR
        origem: digitos.substring(16, 20)        // OOOO
    };

    // Valida o ano (deve ser razoável)
    const ano = parseInt(parts.ano, 10);
    if (ano < 1900 || ano > 2100) {
        return { valid: false, parts };
    }

    // Valida o segmento de justiça (1-9)
    const justica = parseInt(parts.justica, 10);
    if (justica < 1 || justica > 9) {
        return { valid: false, parts };
    }

    // Validação do dígito verificador (módulo 97, conforme Res. 65/2008)
    // Resto = NNNNNNN || AAAA || J || TR || OOOO || DD (mod 97) deve ser 1
    const numVerificacao = BigInt(
        parts.sequencial +
        parts.ano +
        parts.justica +
        parts.tribunal +
        parts.origem +
        parts.digito
    );
    const resto = numVerificacao % 97n;

    if (resto !== 1n) {
        return { valid: false, parts };
    }

    return { valid: true, parts };
}

/**
 * Aplica a máscara de formatação CNJ a uma string de dígitos.
 * Transforma "12345678920201800001" em "1234567-89.2020.1.80.0001"
 * Formata progressivamente conforme o usuário digita.
 * 
 * @param {string} numero - String de dígitos (com ou sem formatação prévia)
 * @returns {string} Número formatado no padrão CNJ
 */
function formatCNJ(numero) {
    if (!numero) return '';

    // Remove tudo que não é dígito
    const digitos = numero.replace(/\D/g, '');

    // Aplica a máscara progressivamente
    let formatado = '';

    for (let i = 0; i < digitos.length && i < 20; i++) {
        // Posição 7: insere hífen antes do dígito verificador
        if (i === 7) formatado += '-';
        // Posição 9: insere ponto antes do ano
        if (i === 9) formatado += '.';
        // Posição 13: insere ponto antes da justiça
        if (i === 13) formatado += '.';
        // Posição 14: insere ponto antes do tribunal
        if (i === 14) formatado += '.';
        // Posição 16: insere ponto antes da origem
        if (i === 16) formatado += '.';

        formatado += digitos[i];
    }

    return formatado;
}

// ============================================================================
// MAPEAMENTO DE TRIBUNAIS
// ============================================================================

/**
 * Mapeamento de tribunais estaduais (Justiça 8) por código TR.
 * Usado para deduzir o alias do tribunal para consultas na API DataJud.
 */
const TRIBUNAIS_ESTADUAIS = {
    '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba',
    '06': 'tjce', '07': 'tjdft', '08': 'tjes', '09': 'tjgo', '10': 'tjma',
    '11': 'tjmt', '12': 'tjms', '13': 'tjmg', '14': 'tjpa', '15': 'tjpb',
    '16': 'tjpe', '17': 'tjpi', '18': 'tjpr', '19': 'tjrj', '20': 'tjrn',
    '21': 'tjro', '22': 'tjrr', '23': 'tjrs', '24': 'tjsc', '25': 'tjse',
    '26': 'tjsp', '27': 'tjto'
};

/**
 * Mapeamento de TRFs (Justiça Federal, J=4) por código TR/região.
 * Organizado conforme a estrutura dos Tribunais Regionais Federais.
 */
const TRIBUNAIS_FEDERAIS = {
    '01': 'trf1', '02': 'trf2', '03': 'trf3', '04': 'trf4', '05': 'trf5',
    '06': 'trf6'
};

/**
 * Mapeamento de nomes legíveis para todos os tribunais.
 * Inclui tribunais superiores, estaduais, federais e trabalhistas.
 */
const NOMES_TRIBUNAIS = {
    // Tribunais superiores
    'stf': 'STF - Supremo Tribunal Federal',
    'stj': 'STJ - Superior Tribunal de Justiça',
    'tst': 'TST - Tribunal Superior do Trabalho',
    'stm': 'STM - Superior Tribunal Militar',

    // Tribunais Regionais Federais
    'trf1': 'TRF1 - 1ª Região',
    'trf2': 'TRF2 - 2ª Região',
    'trf3': 'TRF3 - 3ª Região',
    'trf4': 'TRF4 - 4ª Região',
    'trf5': 'TRF5 - 5ª Região',
    'trf6': 'TRF6 - 6ª Região',

    // Tribunais Regionais do Trabalho
    'trt1': 'TRT1 - Rio de Janeiro',
    'trt2': 'TRT2 - São Paulo (Capital)',
    'trt3': 'TRT3 - Minas Gerais',
    'trt4': 'TRT4 - Rio Grande do Sul',
    'trt5': 'TRT5 - Bahia',
    'trt6': 'TRT6 - Pernambuco',
    'trt7': 'TRT7 - Ceará',
    'trt8': 'TRT8 - Pará e Amapá',
    'trt9': 'TRT9 - Paraná',
    'trt10': 'TRT10 - Distrito Federal e Tocantins',
    'trt11': 'TRT11 - Amazonas e Roraima',
    'trt12': 'TRT12 - Santa Catarina',
    'trt13': 'TRT13 - Paraíba',
    'trt14': 'TRT14 - Rondônia e Acre',
    'trt15': 'TRT15 - Campinas',
    'trt16': 'TRT16 - Maranhão',
    'trt17': 'TRT17 - Espírito Santo',
    'trt18': 'TRT18 - Goiás',
    'trt19': 'TRT19 - Alagoas',
    'trt20': 'TRT20 - Sergipe',
    'trt21': 'TRT21 - Rio Grande do Norte',
    'trt22': 'TRT22 - Piauí',
    'trt23': 'TRT23 - Mato Grosso',
    'trt24': 'TRT24 - Mato Grosso do Sul',

    // Tribunais de Justiça Estaduais
    'tjac': 'TJAC - Acre',
    'tjal': 'TJAL - Alagoas',
    'tjap': 'TJAP - Amapá',
    'tjam': 'TJAM - Amazonas',
    'tjba': 'TJBA - Bahia',
    'tjce': 'TJCE - Ceará',
    'tjdft': 'TJDFT - Distrito Federal e Territórios',
    'tjes': 'TJES - Espírito Santo',
    'tjgo': 'TJGO - Goiás',
    'tjma': 'TJMA - Maranhão',
    'tjmt': 'TJMT - Mato Grosso',
    'tjms': 'TJMS - Mato Grosso do Sul',
    'tjmg': 'TJMG - Minas Gerais',
    'tjpa': 'TJPA - Pará',
    'tjpb': 'TJPB - Paraíba',
    'tjpe': 'TJPE - Pernambuco',
    'tjpi': 'TJPI - Piauí',
    'tjpr': 'TJPR - Paraná',
    'tjrj': 'TJRJ - Rio de Janeiro',
    'tjrn': 'TJRN - Rio Grande do Norte',
    'tjro': 'TJRO - Rondônia',
    'tjrr': 'TJRR - Roraima',
    'tjrs': 'TJRS - Rio Grande do Sul',
    'tjsc': 'TJSC - Santa Catarina',
    'tjse': 'TJSE - Sergipe',
    'tjsp': 'TJSP - São Paulo',
    'tjto': 'TJTO - Tocantins'
};

/**
 * Deduz o alias do tribunal para a API DataJud a partir do número CNJ.
 * Analisa o segmento de Justiça (J) e Tribunal/Região (TR) para
 * determinar qual tribunal deve ser consultado.
 * 
 * @param {string} numero - Número do processo CNJ (com ou sem formatação)
 * @returns {string|null} Alias do tribunal (ex: 'tjsp', 'trt2') ou null se não encontrado
 */
function getTribunalFromCNJ(numero) {
    if (!numero) return null;

    const digitos = numero.replace(/\D/g, '');
    if (digitos.length < 16) return null;

    // Extrai segmento de justiça e tribunal
    const justica = digitos.substring(13, 14);
    const tribunal = digitos.substring(14, 16);

    switch (justica) {
        // Justiça Estadual
        case '8':
            return TRIBUNAIS_ESTADUAIS[tribunal] || null;

        // Justiça do Trabalho
        case '5':
            if (tribunal === '00') return 'tst';
            return `trt${parseInt(tribunal, 10)}`;

        // Justiça Federal
        case '4':
            return TRIBUNAIS_FEDERAIS[tribunal] || null;

        // Superior Tribunal de Justiça
        case '2':
            return 'stj';

        // Justiça Militar da União
        case '6':
            return 'stm';

        // Supremo Tribunal Federal
        case '1':
            return 'stf';

        default:
            return null;
    }
}

/**
 * Retorna o nome legível de um tribunal a partir do seu alias.
 * 
 * @param {string} alias - Alias do tribunal (ex: 'tjsp', 'trt2', 'stj')
 * @returns {string} Nome completo do tribunal ou o alias em maiúsculas se não encontrado
 */
function getTribunalName(alias) {
    if (!alias) return '';

    const key = alias.toLowerCase();
    return NOMES_TRIBUNAIS[key] || alias.toUpperCase();
}

// ============================================================================
// UTILITÁRIOS GERAIS
// ============================================================================

/**
 * Implementa o padrão debounce para limitar a frequência de execução de uma função.
 * Útil para eventos de input, scroll, resize, etc.
 * 
 * @param {Function} fn - Função a ser executada após o atraso
 * @param {number} delay - Tempo de espera em milissegundos (padrão: 300ms)
 * @returns {Function} Função com debounce aplicado
 */
function debounce(fn, delay = 300) {
    let timeoutId = null;

    return function (...args) {
        // Cancela a execução anterior pendente
        if (timeoutId) clearTimeout(timeoutId);

        // Agenda nova execução
        timeoutId = setTimeout(() => {
            fn.apply(this, args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Escapa caracteres especiais de HTML para prevenir XSS.
 * Converte &, <, >, ", ' para suas entidades HTML correspondentes.
 * 
 * @param {string} str - String a ser escapada
 * @returns {string} String com caracteres HTML escapados
 */
function escapeHtml(str) {
    if (!str || typeof str !== 'string') return '';

    const mapa = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };

    return str.replace(/[&<>"']/g, (char) => mapa[char]);
}

/**
 * Exibe uma notificação toast na interface.
 * O toast é criado dinamicamente e removido após a duração especificada.
 * 
 * Tipos disponíveis: 'success', 'error', 'warning', 'info'
 * 
 * @param {string} message - Mensagem a ser exibida
 * @param {string} [type='info'] - Tipo do toast (success|error|warning|info)
 * @param {number} [duration=4000] - Duração em milissegundos antes de desaparecer
 */
function showToast(message, type = 'info', duration = 4000) {
    // Busca ou cria o container de toasts
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Ícones por tipo de notificação
    const icones = {
        success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        error: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`,
        warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`,
        info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`
    };

    // Cria o elemento do toast
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icones[type] || icones.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Fechar notificação">&times;</button>
    `;

    // Botão de fechar
    const btnFechar = toast.querySelector('.toast-close');
    btnFechar.addEventListener('click', () => removerToast(toast));

    // Adiciona ao container
    container.appendChild(toast);

    // Força reflow para animação de entrada funcionar
    toast.offsetHeight;
    toast.classList.add('toast-visible');

    // Auto-remove após a duração
    const timerId = setTimeout(() => removerToast(toast), duration);

    // Pausa auto-remove ao passar o mouse
    toast.addEventListener('mouseenter', () => clearTimeout(timerId));
    toast.addEventListener('mouseleave', () => {
        setTimeout(() => removerToast(toast), 2000);
    });
}

/**
 * Remove um toast da interface com animação de saída.
 * 
 * @param {HTMLElement} toast - Elemento do toast a ser removido
 */
function removerToast(toast) {
    if (!toast || toast.classList.contains('toast-removing')) return;

    toast.classList.add('toast-removing');
    toast.classList.remove('toast-visible');

    // Aguarda a animação de saída antes de remover do DOM
    toast.addEventListener('transitionend', () => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, { once: true });

    // Fallback: remove após 500ms caso a transição não dispare
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 500);
}
