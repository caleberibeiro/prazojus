/**
 * PrazoJus - Motor de Cálculo de Prazos Processuais
 * 
 * Motor de cálculo de prazos jurídicos conforme as regras do CPC/2015.
 * Inclui: calendário de feriados nacionais (2024-2027), cálculo de Páscoa
 * (algoritmo Computus), verificação de dias úteis, recesso forense,
 * e sugestão automática de prazos a partir de movimentações DataJud.
 * 
 * @author PrazoJus
 * @version 1.0.0
 */

// ============================================================================
// ALGORITMO COMPUTUS (CÁLCULO DA PÁSCOA)
// ============================================================================

/**
 * Calcula a data da Páscoa para um dado ano usando o algoritmo Computus
 * (método anônimo gregoriano / algoritmo de Meeus).
 * 
 * Referência: Jean Meeus, "Astronomical Algorithms", Cap. 8
 * 
 * @param {number} year - Ano para o qual calcular a Páscoa
 * @returns {Date} Data da Páscoa (Domingo de Páscoa)
 */
function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
    const dia = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, mes - 1, dia);
}

/**
 * Gera os feriados móveis (baseados na Páscoa) para um ano específico.
 * 
 * Feriados móveis no Brasil:
 * - Carnaval (segunda): Páscoa - 48 dias
 * - Carnaval (terça):   Páscoa - 47 dias
 * - Sexta-feira Santa:  Páscoa - 2 dias
 * - Corpus Christi:     Páscoa + 60 dias
 * 
 * @param {number} year - Ano para gerar os feriados
 * @returns {Array<{date: string, name: string}>} Lista de feriados móveis
 */
function gerarFeriadosMoveis(year) {
    const pascoa = calculateEaster(year);
    const feriadosMoveis = [];

    /**
     * Função auxiliar para adicionar/subtrair dias de uma data.
     * @param {Date} data - Data base
     * @param {number} dias - Dias a adicionar (negativo para subtrair)
     * @returns {Date} Nova data
     */
    function adicionarDias(data, dias) {
        const novaData = new Date(data);
        novaData.setDate(novaData.getDate() + dias);
        return novaData;
    }

    /**
     * Formata Date para string YYYY-MM-DD (padrão ISO).
     * @param {Date} data - Data a formatar
     * @returns {string} Data no formato YYYY-MM-DD
     */
    function formatISO(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }

    // Segunda-feira de Carnaval (48 dias antes da Páscoa)
    const carnavalSeg = adicionarDias(pascoa, -48);
    feriadosMoveis.push({ date: formatISO(carnavalSeg), name: 'Carnaval (Segunda-feira)' });

    // Terça-feira de Carnaval (47 dias antes da Páscoa)
    const carnavalTer = adicionarDias(pascoa, -47);
    feriadosMoveis.push({ date: formatISO(carnavalTer), name: 'Carnaval (Terça-feira)' });

    // Sexta-feira Santa (2 dias antes da Páscoa)
    const sextaSanta = adicionarDias(pascoa, -2);
    feriadosMoveis.push({ date: formatISO(sextaSanta), name: 'Sexta-feira Santa' });

    // Corpus Christi (60 dias após a Páscoa)
    const corpusChristi = adicionarDias(pascoa, 60);
    feriadosMoveis.push({ date: formatISO(corpusChristi), name: 'Corpus Christi' });

    return feriadosMoveis;
}

// ============================================================================
// FERIADOS NACIONAIS (2024 - 2027)
// ============================================================================

/**
 * Lista completa de feriados nacionais brasileiros de 2024 a 2027.
 * Inclui feriados fixos e móveis (calculados automaticamente via Computus).
 * 
 * Feriados fixos contemplados:
 * - Confraternização Universal (01/01)
 * - Tiradentes (21/04)
 * - Dia do Trabalho (01/05)
 * - Independência do Brasil (07/09)
 * - Nossa Senhora Aparecida (12/10)
 * - Finados (02/11)
 * - Proclamação da República (15/11)
 * - Dia da Consciência Negra (20/11)
 * - Natal (25/12)
 * 
 * @type {Array<{date: string, name: string}>}
 */
const FERIADOS_NACIONAIS = (function () {
    const feriados = [];

    // Feriados fixos para cada ano
    const feriadosFixos = [
        { mes: '01', dia: '01', name: 'Confraternização Universal' },
        { mes: '04', dia: '21', name: 'Tiradentes' },
        { mes: '05', dia: '01', name: 'Dia do Trabalho' },
        { mes: '09', dia: '07', name: 'Independência do Brasil' },
        { mes: '10', dia: '12', name: 'Nossa Senhora Aparecida' },
        { mes: '11', dia: '02', name: 'Finados' },
        { mes: '11', dia: '15', name: 'Proclamação da República' },
        { mes: '11', dia: '20', name: 'Dia da Consciência Negra' },
        { mes: '12', dia: '25', name: 'Natal' }
    ];

    // Gera feriados para os anos 2024 a 2027
    for (let ano = 2024; ano <= 2027; ano++) {
        // Adiciona feriados fixos
        for (const feriado of feriadosFixos) {
            feriados.push({
                date: `${ano}-${feriado.mes}-${feriado.dia}`,
                name: feriado.name
            });
        }

        // Adiciona feriados móveis (calculados a partir da Páscoa)
        const moveis = gerarFeriadosMoveis(ano);
        feriados.push(...moveis);
    }

    // Ordena por data para facilitar buscas
    feriados.sort((a, b) => a.date.localeCompare(b.date));

    return feriados;
})();

// ============================================================================
// PRAZOS PROCESSUAIS (CPC/2015)
// ============================================================================

/**
 * Tabela de prazos processuais comuns conforme o CPC/2015.
 * 
 * Cada prazo contém:
 * - dias:      Quantidade de dias do prazo
 * - tipo:      'uteis' (dias úteis) | 'corridos' (dias corridos) | 'data_fixa'
 * - descricao: Descrição breve do prazo
 * - base:      Fundamentação legal (artigo do CPC)
 * 
 * @type {Object<string, {dias: number, tipo: string, descricao: string, base: string}>}
 */
const PRAZOS_PROCESSUAIS = {
    contestacao: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Contestação',
        base: 'Art. 335, CPC'
    },
    replica: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Réplica',
        base: 'Art. 351, CPC'
    },
    apelacao: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Apelação',
        base: 'Art. 1.003, CPC'
    },
    agravo_instrumento: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Agravo de Instrumento',
        base: 'Art. 1.016, CPC'
    },
    embargos_declaracao: {
        dias: 5,
        tipo: 'uteis',
        descricao: 'Embargos de Declaração',
        base: 'Art. 1.023, CPC'
    },
    recurso_especial: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Recurso Especial',
        base: 'Art. 1.029, CPC'
    },
    recurso_extraordinario: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Recurso Extraordinário',
        base: 'Art. 1.029, CPC'
    },
    contrarrazoes: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Contrarrazões',
        base: 'Art. 1.003, §5º, CPC'
    },
    manifestacao: {
        dias: 5,
        tipo: 'uteis',
        descricao: 'Manifestação',
        base: 'Art. 218, CPC'
    },
    cumprimento_sentenca: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Cumprimento de Sentença',
        base: 'Art. 523, CPC'
    },
    impugnacao: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Impugnação ao Cumprimento de Sentença',
        base: 'Art. 525, CPC'
    },
    audiencia: {
        dias: 0,
        tipo: 'data_fixa',
        descricao: 'Audiência',
        base: 'Data designada pelo juízo'
    },
    pericia: {
        dias: 0,
        tipo: 'data_fixa',
        descricao: 'Perícia',
        base: 'Data designada pelo juízo'
    },
    outro: {
        dias: 15,
        tipo: 'uteis',
        descricao: 'Outro prazo',
        base: 'Art. 218, CPC (prazo genérico)'
    }
};

// ============================================================================
// VERIFICAÇÃO DE DIAS ÚTEIS
// ============================================================================

/**
 * Verifica se uma data é feriado nacional ou feriado personalizado.
 * 
 * @param {Date} date - Data a verificar
 * @param {Array<{date: string}>} [customHolidays=[]] - Feriados adicionais (estaduais, municipais)
 * @returns {boolean} true se a data é feriado
 */
function isHoliday(date, customHolidays = []) {
    if (!date) return false;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;

    // Formata a data para comparação no formato YYYY-MM-DD
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    const dataISO = `${ano}-${mes}-${dia}`;

    // Verifica nos feriados nacionais
    const ehFeriadoNacional = FERIADOS_NACIONAIS.some(f => f.date === dataISO);
    if (ehFeriadoNacional) return true;

    // Verifica nos feriados personalizados (estaduais, municipais, etc.)
    if (customHolidays && customHolidays.length > 0) {
        return customHolidays.some(f => f.date === dataISO);
    }

    return false;
}

/**
 * Verifica se uma data cai em final de semana (sábado ou domingo).
 * 
 * @param {Date} date - Data a verificar
 * @returns {boolean} true se a data é sábado (6) ou domingo (0)
 */
function isWeekend(date) {
    if (!date) return false;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;

    const diaSemana = d.getDay();
    return diaSemana === 0 || diaSemana === 6;
}

/**
 * Verifica se uma data está dentro do período de recesso forense.
 * O recesso forense ocorre de 20 de dezembro a 20 de janeiro,
 * período em que não há expediente forense e os prazos ficam suspensos.
 * 
 * Referência: Art. 220, CPC/2015
 * 
 * @param {Date} date - Data a verificar
 * @returns {boolean} true se a data está no recesso forense
 */
function isRecessoForense(date) {
    if (!date) return false;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;

    const mes = d.getMonth() + 1; // 1-12
    const dia = d.getDate();

    // Dezembro: a partir do dia 20 (inclusive)
    if (mes === 12 && dia >= 20) return true;

    // Janeiro: até o dia 20 (inclusive)
    if (mes === 1 && dia <= 20) return true;

    return false;
}

/**
 * Verifica se uma data é dia útil forense.
 * Um dia útil forense é aquele que não é:
 * - Final de semana (sábado ou domingo)
 * - Feriado (nacional ou personalizado)
 * - Recesso forense (20/dez a 20/jan)
 * 
 * @param {Date} date - Data a verificar
 * @param {Array<{date: string}>} [customHolidays=[]] - Feriados adicionais
 * @returns {boolean} true se a data é dia útil forense
 */
function isBusinessDay(date, customHolidays = []) {
    if (!date) return false;

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return false;

    // Verifica as três condições que tornam um dia não-útil
    if (isWeekend(d)) return false;
    if (isHoliday(d, customHolidays)) return false;
    if (isRecessoForense(d)) return false;

    return true;
}

// ============================================================================
// CÁLCULO DE PRAZOS
// ============================================================================

/**
 * Calcula a data final de um prazo processual conforme as regras do CPC/2015.
 * 
 * Regras implementadas:
 * 
 * 1. Prazo em dias úteis (Art. 219, CPC):
 *    - Conta-se apenas dias úteis forenses
 *    - Exclui o dia do início (Art. 224, §1º, CPC)
 *    - Se o início cair em dia não-útil, inicia no próximo dia útil
 *    - A contagem começa do PRÓXIMO dia útil após a data de início
 * 
 * 2. Prazo em dias corridos:
 *    - Conta todos os dias do calendário
 *    - Se o vencimento cair em dia não-útil, prorroga para o próximo dia útil
 * 
 * 3. Data fixa:
 *    - Simplesmente retorna startDate + days (usado para audiências, perícias)
 * 
 * @param {Date} startDate - Data de início do prazo (publicação/intimação)
 * @param {number} days - Quantidade de dias do prazo
 * @param {string} type - Tipo do prazo: 'uteis' | 'corridos' | 'data_fixa'
 * @param {Array<{date: string}>} [customHolidays=[]] - Feriados adicionais
 * @returns {{dataFim: Date, diasUteis: number, diasCorridos: number}} Resultado do cálculo
 */
function calculateDeadline(startDate, days, type, customHolidays = []) {
    if (!startDate) {
        return { dataFim: null, diasUteis: 0, diasCorridos: 0 };
    }

    const inicio = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
    if (isNaN(inicio.getTime())) {
        return { dataFim: null, diasUteis: 0, diasCorridos: 0 };
    }

    // Normaliza para meia-noite
    inicio.setHours(0, 0, 0, 0);

    // ---- Data fixa: simplesmente soma os dias ----
    if (type === 'data_fixa') {
        const dataFim = new Date(inicio);
        dataFim.setDate(dataFim.getDate() + days);

        return {
            dataFim,
            diasUteis: contarDiasUteis(inicio, dataFim, customHolidays),
            diasCorridos: days
        };
    }

    // ---- Prazo em dias úteis (Art. 219 + Art. 224 §1º, CPC) ----
    if (type === 'uteis') {
        let dataAtual = new Date(inicio);

        // Art. 224, §1º: O dia do começo é excluído, e a contagem
        // se inicia no primeiro dia útil seguinte
        dataAtual.setDate(dataAtual.getDate() + 1);

        // Avança para o próximo dia útil se necessário
        while (!isBusinessDay(dataAtual, customHolidays)) {
            dataAtual.setDate(dataAtual.getDate() + 1);
        }

        // Conta os dias úteis (o primeiro dia útil já conta como dia 1)
        let diasContados = 1;

        while (diasContados < days) {
            dataAtual.setDate(dataAtual.getDate() + 1);

            if (isBusinessDay(dataAtual, customHolidays)) {
                diasContados++;
            }
        }

        // Calcula dias corridos totais
        const diasCorridos = Math.round(
            (dataAtual.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
            dataFim: dataAtual,
            diasUteis: days,
            diasCorridos
        };
    }

    // ---- Prazo em dias corridos ----
    if (type === 'corridos') {
        const dataFim = new Date(inicio);
        dataFim.setDate(dataFim.getDate() + days);

        // Se o vencimento cair em dia não-útil, prorroga para o próximo dia útil
        while (!isBusinessDay(dataFim, customHolidays)) {
            dataFim.setDate(dataFim.getDate() + 1);
        }

        const diasCorridos = Math.round(
            (dataFim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
            dataFim,
            diasUteis: contarDiasUteis(inicio, dataFim, customHolidays),
            diasCorridos
        };
    }

    // Tipo desconhecido: trata como dias úteis por segurança
    return calculateDeadline(startDate, days, 'uteis', customHolidays);
}

/**
 * Conta o número de dias úteis entre duas datas (exclusivo na data inicial).
 * 
 * @param {Date} dataInicio - Data inicial
 * @param {Date} dataFim - Data final
 * @param {Array<{date: string}>} [customHolidays=[]] - Feriados adicionais
 * @returns {number} Quantidade de dias úteis no intervalo
 */
function contarDiasUteis(dataInicio, dataFim, customHolidays = []) {
    if (!dataInicio || !dataFim) return 0;

    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);

    inicio.setHours(0, 0, 0, 0);
    fim.setHours(0, 0, 0, 0);

    // Se as datas são iguais, retorna 0
    if (inicio.getTime() === fim.getTime()) return 0;

    // Garante que início < fim
    const [menor, maior] = inicio < fim ? [inicio, fim] : [fim, inicio];

    let count = 0;
    const atual = new Date(menor);
    atual.setDate(atual.getDate() + 1); // Exclui o primeiro dia

    while (atual <= maior) {
        if (isBusinessDay(atual, customHolidays)) {
            count++;
        }
        atual.setDate(atual.getDate() + 1);
    }

    return count;
}

// ============================================================================
// PROGRESSO E ANÁLISE DE PRAZOS
// ============================================================================

/**
 * Calcula o percentual de progresso temporal de um prazo.
 * Retorna 0 se o prazo ainda não começou e 100 se já venceu.
 * 
 * @param {Date|string} startDate - Data de início do prazo
 * @param {Date|string} endDate - Data de vencimento do prazo
 * @returns {number} Percentual de 0 a 100 representando o tempo decorrido
 */
function getDeadlineProgress(startDate, endDate) {
    if (!startDate || !endDate) return 0;

    const inicio = startDate instanceof Date ? startDate : new Date(startDate);
    const fim = endDate instanceof Date ? endDate : new Date(endDate);

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return 0;

    const agora = new Date();

    // Normaliza todas as datas para meia-noite
    const inicioNorm = new Date(inicio);
    inicioNorm.setHours(0, 0, 0, 0);

    const fimNorm = new Date(fim);
    fimNorm.setHours(0, 0, 0, 0);

    const agoraNorm = new Date(agora);
    agoraNorm.setHours(0, 0, 0, 0);

    // Duração total do prazo em milissegundos
    const duracaoTotal = fimNorm.getTime() - inicioNorm.getTime();

    // Se a duração é zero ou negativa, retorna 100
    if (duracaoTotal <= 0) return 100;

    // Tempo decorrido desde o início
    const tempoDecorrido = agoraNorm.getTime() - inicioNorm.getTime();

    // Antes do início
    if (tempoDecorrido <= 0) return 0;

    // Após o vencimento
    if (tempoDecorrido >= duracaoTotal) return 100;

    // Calcula o percentual
    const percentual = (tempoDecorrido / duracaoTotal) * 100;

    return Math.round(percentual);
}

// ============================================================================
// ANÁLISE DE MOVIMENTAÇÕES DATAJUD
// ============================================================================

/**
 * Analisa movimentações processuais do DataJud e sugere prazos aplicáveis.
 * 
 * Busca por palavras-chave nas descrições das movimentações para identificar
 * eventos que geram prazos processuais (intimação, citação, sentença, etc.)
 * e retorna sugestões de prazos com as datas calculadas.
 * 
 * @param {Array<{nome: string, dataHora: string, complemento?: string}>} movimentos 
 *   Lista de movimentações do DataJud
 * @returns {Array<{tipo: string, prazo: object, dataInicio: Date, dataFim: Date, 
 *   motivo: string, movimento: object}>} Lista de prazos sugeridos
 */
function suggestDeadlinesFromMovements(movimentos) {
    if (!movimentos || !Array.isArray(movimentos) || movimentos.length === 0) {
        return [];
    }

    const sugestoes = [];

    /**
     * Mapeamento de palavras-chave para tipos de prazo.
     * Cada entrada associa um padrão de busca a um ou mais prazos possíveis.
     */
    const REGRAS_SUGESTAO = [
        {
            // Citação → prazo de contestação
            palavras: ['citação', 'citacao', 'citado', 'cite-se'],
            prazos: ['contestacao'],
            motivo: 'Citação identificada — prazo para contestação'
        },
        {
            // Intimação para réplica
            palavras: ['intimação para réplica', 'intimacao para replica', 'réplica', 'replica'],
            prazos: ['replica'],
            motivo: 'Intimação para réplica identificada'
        },
        {
            // Sentença → prazos de embargos e apelação
            palavras: ['sentença', 'sentenca', 'julgamento procedente', 'julgamento improcedente', 'julgo procedente', 'julgo improcedente'],
            prazos: ['embargos_declaracao', 'apelacao'],
            motivo: 'Sentença proferida — prazo para embargos e/ou apelação'
        },
        {
            // Acórdão → embargos, recurso especial, recurso extraordinário
            palavras: ['acórdão', 'acordao', 'v. acórdão', 'v. acordao'],
            prazos: ['embargos_declaracao', 'recurso_especial', 'recurso_extraordinario'],
            motivo: 'Acórdão publicado — prazos recursais'
        },
        {
            // Decisão interlocutória → agravo de instrumento
            palavras: ['decisão interlocutória', 'decisao interlocutoria', 'despacho', 'decisão'],
            prazos: ['agravo_instrumento', 'embargos_declaracao'],
            motivo: 'Decisão identificada — prazo para agravo/embargos'
        },
        {
            // Intimação genérica → manifestação
            palavras: ['intimação', 'intimacao', 'intimado', 'intime-se', 'manifeste-se'],
            prazos: ['manifestacao'],
            motivo: 'Intimação identificada — prazo para manifestação'
        },
        {
            // Audiência designada
            palavras: ['audiência designada', 'audiencia designada', 'designação de audiência', 'designada audiência'],
            prazos: ['audiencia'],
            motivo: 'Audiência designada'
        },
        {
            // Cumprimento de sentença
            palavras: ['cumprimento de sentença', 'cumprimento de sentenca', 'cumpra-se'],
            prazos: ['cumprimento_sentenca'],
            motivo: 'Cumprimento de sentença — prazo para pagamento'
        },
        {
            // Impugnação
            palavras: ['impugnação', 'impugnacao'],
            prazos: ['impugnacao'],
            motivo: 'Prazo para impugnação ao cumprimento de sentença'
        },
        {
            // Contrarrazões
            palavras: ['contrarrazões', 'contrarrazoes', 'contra-razões', 'contrarrazão'],
            prazos: ['contrarrazoes'],
            motivo: 'Prazo para contrarrazões'
        }
    ];

    // Analisa cada movimentação
    for (const movimento of movimentos) {
        if (!movimento || !movimento.nome) continue;

        // Normaliza o texto da movimentação para busca (lowercase, sem acentos extras)
        const textoMovimento = (movimento.nome || '').toLowerCase();
        const complemento = (movimento.complemento || '').toLowerCase();
        const textoBusca = `${textoMovimento} ${complemento}`;

        // Verifica cada regra de sugestão
        for (const regra of REGRAS_SUGESTAO) {
            const encontrou = regra.palavras.some(palavra =>
                textoBusca.includes(palavra.toLowerCase())
            );

            if (encontrou) {
                // Determina a data de início do prazo
                let dataInicio = null;
                if (movimento.dataHora) {
                    dataInicio = new Date(movimento.dataHora);
                    if (isNaN(dataInicio.getTime())) dataInicio = null;
                }

                // Cria uma sugestão para cada prazo aplicável
                for (const tipoPrazo of regra.prazos) {
                    const prazoInfo = PRAZOS_PROCESSUAIS[tipoPrazo];
                    if (!prazoInfo) continue;

                    let dataFim = null;

                    // Calcula a data fim apenas se temos data de início e dias > 0
                    if (dataInicio && prazoInfo.dias > 0) {
                        const resultado = calculateDeadline(
                            dataInicio,
                            prazoInfo.dias,
                            prazoInfo.tipo
                        );
                        dataFim = resultado.dataFim;
                    }

                    sugestoes.push({
                        tipo: tipoPrazo,
                        prazo: prazoInfo,
                        dataInicio,
                        dataFim,
                        motivo: regra.motivo,
                        movimento: {
                            nome: movimento.nome,
                            dataHora: movimento.dataHora,
                            complemento: movimento.complemento || ''
                        }
                    });
                }

                // Para na primeira regra que combinar (evita duplicatas por regras genéricas)
                break;
            }
        }
    }

    // Ordena sugestões por data de vencimento (mais urgentes primeiro)
    sugestoes.sort((a, b) => {
        if (!a.dataFim && !b.dataFim) return 0;
        if (!a.dataFim) return 1;
        if (!b.dataFim) return -1;
        return a.dataFim.getTime() - b.dataFim.getTime();
    });

    return sugestoes;
}
