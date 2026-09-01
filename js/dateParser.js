/**
 * dateParser.js
 * Interpretação de datas, horários e prioridades em português brasileiro
 * utilizando exclusivamente regras determinísticas e expressões regulares.
 * Nenhuma IA ou serviço externo é utilizado.
 */

const DateParser = (() => {

  const WEEKDAYS = [
    "domingo", "segunda-feira", "terça-feira", "quarta-feira",
    "quinta-feira", "sexta-feira", "sábado",
  ];
  // aliases sem "-feira" e variações comuns
  const WEEKDAY_ALIASES = {
    "domingo": 0,
    "segunda": 1, "segunda-feira": 1, "segunda feira": 1,
    "terca": 2, "terça": 2, "terca-feira": 2, "terça-feira": 2, "terca feira": 2, "terça feira": 2,
    "quarta": 3, "quarta-feira": 3, "quarta feira": 3,
    "quinta": 4, "quinta-feira": 4, "quinta feira": 4,
    "sexta": 5, "sexta-feira": 5, "sexta feira": 5,
    "sabado": 6, "sábado": 6,
  };

  const NUMBER_WORDS = {
    "zero": 0, "uma": 1, "um": 1, "duas": 2, "dois": 2, "tres": 3, "três": 3,
    "quatro": 4, "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9,
    "dez": 10, "onze": 11, "doze": 12,
  };

  /**
   * normalizeText
   * Converte para minúsculas, remove espaços duplicados e espaços nas bordas.
   * Mantém acentuação (necessária para diferenciar palavras em PT-BR),
   * mas oferece uma versão sem acentos para comparações tolerantes.
   */
  function normalizeText(text) {
    if (!text) return "";
    let t = text.toLowerCase().trim();
    t = t.replace(/\s+/g, " ");
    return t;
  }

  function stripAccents(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // O \b nativo do JavaScript trata apenas [A-Za-z0-9_] como "caractere de
  // palavra", então falha em fronteiras logo após letras acentuadas (ã, á,
  // ç, é...) comuns no português. LB/RB usam \p{L} (qualquer letra Unicode)
  // para funcionar corretamente com acentuação; todas as regex abaixo usam
  // essas fronteiras em vez de \b, sempre com a flag 'u'.
  const LB = "(?<![\\p{L}\\p{N}_])";
  const RB = "(?![\\p{L}\\p{N}_])";

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * nextWeekday: retorna a próxima ocorrência do dia da semana (0=domingo..6=sábado)
   * a partir de hoje. Se hoje for o próprio dia, retorna hoje (comportamento comum
   * em comandos de voz — "sexta-feira" dito numa sexta significa hoje).
   */
  function nextWeekday(targetDow, base) {
    const today = startOfDay(base || new Date());
    const todayDow = today.getDay();
    let diff = targetDow - todayDow;
    if (diff < 0) diff += 7;
    return addDays(today, diff);
  }

  /**
   * parseDate(text) -> { date: Date|null, matchedText: string|null, remainingText: string }
   * Reconhece expressões de data em português e as converte usando Date nativo.
   */
  function parseDate(text, base) {
    const norm = normalizeText(text);
    const today = startOfDay(base || new Date());

    // "depois de amanhã"
    let m = norm.match(new RegExp(LB + "depois de amanh[ãa]" + RB, "u"));
    if (m) {
      return { date: addDays(today, 2), matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // "amanhã"
    m = norm.match(new RegExp(LB + "amanh[ãa]" + RB, "u"));
    if (m) {
      return { date: addDays(today, 1), matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // "hoje"
    m = norm.match(new RegExp(LB + "hoje" + RB, "u"));
    if (m) {
      return { date: today, matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // "dia 5", "dia 10", "dia 05"
    m = norm.match(new RegExp(LB + "dia\\s+(\\d{1,2})(?:\\s+de\\s+([a-zçã]+))?" + RB, "u"));
    if (m) {
      const day = parseInt(m[1], 10);
      let month = today.getMonth();
      let year = today.getFullYear();
      if (m[2]) {
        const monthIdx = monthNameToIndex(m[2]);
        if (monthIdx !== -1) month = monthIdx;
      }
      let candidate = new Date(year, month, day);
      // se a data já passou neste mês (e nenhum mês foi explicitado), assume o próximo mês
      if (!m[2] && candidate < today) {
        candidate = new Date(year, month + 1, day);
      }
      return { date: startOfDay(candidate), matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // dias da semana (com ou sem "-feira", com ou sem acento)
    const dowPattern = new RegExp(LB + "(domingo|segunda(?:-feira| feira)?|ter[cç]a(?:-feira| feira)?|quarta(?:-feira| feira)?|quinta(?:-feira| feira)?|sexta(?:-feira| feira)?|s[aá]bado)" + RB, "u");
    m = norm.match(dowPattern);
    if (m) {
      const key = m[1].replace(/\s+/g, "-").replace(/-feira$/, "").concat("");
      // tenta achar diretamente no dicionário de aliases
      const raw = m[1];
      const dow = WEEKDAY_ALIASES[raw] !== undefined
        ? WEEKDAY_ALIASES[raw]
        : WEEKDAY_ALIASES[raw.replace(/ feira/, "")];
      if (dow !== undefined) {
        return { date: nextWeekday(dow, today), matchedText: m[0], remainingText: removeMatch(norm, m) };
      }
    }

    // formato dd/mm ou dd/mm/yyyy
    m = norm.match(new RegExp(LB + "(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?" + RB, "u"));
    if (m) {
      const day = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      let year = m[3] ? parseInt(m[3], 10) : today.getFullYear();
      if (year < 100) year += 2000;
      const candidate = new Date(year, month, day);
      return { date: startOfDay(candidate), matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    return { date: null, matchedText: null, remainingText: norm };
  }

  function monthNameToIndex(name) {
    const months = ["janeiro", "fevereiro", "março", "marco", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
    const clean = stripAccents(name.toLowerCase());
    const idx = months.findIndex((mo) => stripAccents(mo) === clean);
    if (idx === -1) return -1;
    return idx >= 4 ? idx - 1 >= 0 && months[idx] === "marco" ? 2 : idx : idx; // simple safeguard
  }

  /**
   * parseTime(text) -> { time: "HH:mm"|null, matchedText, remainingText }
   * Reconhece formatos: "14 horas", "14:00", "14h", "14h30", "às 14:30",
   * expressões por extenso ("duas da tarde", "meio-dia", "meia-noite").
   */
  function parseTime(text) {
    const norm = normalizeText(text);

    // meio-dia / meia-noite
    let m = norm.match(new RegExp(LB + "meio[\\s-]?dia" + RB, "u"));
    if (m) return { time: "12:00", matchedText: m[0], remainingText: removeMatch(norm, m) };
    m = norm.match(new RegExp(LB + "meia[\\s-]?noite" + RB, "u"));
    if (m) return { time: "00:00", matchedText: m[0], remainingText: removeMatch(norm, m) };

    // HH:mm ou HHhmm
    m = norm.match(new RegExp(LB + "([01]?\\d|2[0-3])[:h]([0-5]\\d)" + RB, "u"));
    if (m) {
      return { time: `${pad2(parseInt(m[1], 10))}:${m[2]}`, matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // "14h" ou "14 horas" ou "às 14"
    m = norm.match(new RegExp(LB + "(?:as\\s+|às\\s+)?([01]?\\d|2[0-3])\\s*(?:h|horas)" + RB, "u"));
    if (m) {
      return { time: `${pad2(parseInt(m[1], 10))}:00`, matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    // por extenso: "uma da manhã", "duas da tarde", "oito da noite", "três da tarde"
    const extensoPattern = new RegExp(LB + "(uma|duas|dois|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\\s+(?:horas\\s+)?d?a\\s+(manh[ãa]|tarde|noite)" + RB, "u");
    m = norm.match(extensoPattern);
    if (m) {
      let hour = NUMBER_WORDS[m[1]];
      const period = m[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (period === "tarde" && hour < 12) hour += 12;
      if (period === "noite" && hour < 12) hour += 12;
      // manhã mantém a hora como está (1..11)
      return { time: `${pad2(hour)}:00`, matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    return { time: null, matchedText: null, remainingText: norm };
  }

  /**
   * parsePriority(text) -> { priority: "high"|"medium"|"low"|null, matchedText, remainingText }
   */
  function parsePriority(text) {
    const norm = normalizeText(text);

    let m = norm.match(new RegExp(LB + "prioridade\\s+(alta|media|média|baixa)" + RB, "u"));
    if (m) {
      const p = mapPriorityWord(m[1]);
      return { priority: p, matchedText: m[0], remainingText: removeMatch(norm, m) };
    }

    m = norm.match(new RegExp(LB + "(urgente|importante|alta prioridade)" + RB, "u"));
    if (m) return { priority: "high", matchedText: m[0], remainingText: removeMatch(norm, m) };

    m = norm.match(new RegExp(LB + "(?:media prioridade|média prioridade)" + RB, "u"));
    if (m) return { priority: "medium", matchedText: m[0], remainingText: removeMatch(norm, m) };

    m = norm.match(new RegExp(LB + "baixa prioridade" + RB, "u"));
    if (m) return { priority: "low", matchedText: m[0], remainingText: removeMatch(norm, m) };

    return { priority: null, matchedText: null, remainingText: norm };
  }

  function mapPriorityWord(word) {
    const clean = stripAccents(word.toLowerCase());
    if (clean === "alta") return "high";
    if (clean === "media") return "medium";
    if (clean === "baixa") return "low";
    return null;
  }

  function removeMatch(text, matchArray) {
    return normalizeText(text.replace(matchArray[0], " "));
  }

  return {
    normalizeText,
    stripAccents,
    parseDate,
    parseTime,
    parsePriority,
    toISODate,
    startOfDay,
    addDays,
    LB,
    RB,
  };
})();
