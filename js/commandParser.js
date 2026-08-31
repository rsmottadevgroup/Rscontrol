/**
 * commandParser.js
 * Interpretador de comandos de voz baseado 100% em regras e expressões
 * regulares. Não utiliza inteligência artificial nem serviços externos.
 *
 * Fluxo: texto reconhecido pelo navegador -> normalizeText -> identifica
 * o tipo de comando -> extrai entidades (data, horário, prioridade) via
 * dateParser.js -> devolve um objeto estruturado { type, ... }.
 */

const CommandParser = (() => {

  const { normalizeText, stripAccents, parseDate, parseTime, parsePriority } = DateParser;

  // -------- palavras-chave por tipo de comando --------
  const CREATE_TASK_TRIGGERS = [
    /^criar tarefa\s+/, /^adicionar tarefa\s+/, /^nova tarefa\s+/,
    /^crie uma tarefa\s+/, /^cria tarefa\s+/, /^cria uma tarefa\s+/,
  ];
  const CREATE_NOTE_TRIGGERS = [
    /^criar nota\s+/, /^nova anotação\s+/, /^nova anotacao\s+/,
    /^adicionar nota\s+/, /^nova nota\s+/, /^crie uma nota\s+/,
  ];
  const COMPLETE_TRIGGERS = [
    /^concluir\s+(?:tarefa\s+)?/, /^finalizar\s+(?:tarefa\s+)?/,
    /^marcar\s+(.+?)\s+como conclu[ií]da$/,
  ];
  const REOPEN_TRIGGERS = [
    /^reabrir\s+(?:tarefa\s+)?/, /^marcar\s+(.+?)\s+como pendente$/,
  ];
  const DELETE_TRIGGERS = [
    /^excluir\s+(?:tarefa\s+)?/, /^apagar\s+(?:tarefa\s+)?/, /^remover\s+(?:tarefa\s+)?/,
  ];
  const SEARCH_TRIGGERS = [
    /^pesquisar\s+(?:tarefa\s+)?/, /^buscar\s+(?:tarefa\s+)?/, /^procurar\s+(?:tarefa\s+)?/,
  ];
  const SHOW_TRIGGERS = [
    /^mostrar\s+/, /^exibir\s+/, /^ver\s+/,
  ];

  function matchFirst(norm, patterns) {
    for (const p of patterns) {
      const m = norm.match(p);
      if (m) return m;
    }
    return null;
  }

  /**
   * parseTaskCommand(rest)
   * Recebe o texto já sem o gatilho ("estudar javascript amanhã às 14 horas
   * prioridade alta") e extrai título, data, horário e prioridade.
   */
  function parseTaskCommand(restText) {
    let working = normalizeText(restText);

    const priorityResult = parsePriority(working);
    if (priorityResult.priority) working = priorityResult.remainingText;

    const timeResult = parseTime(working);
    if (timeResult.time) working = timeResult.remainingText;

    const dateResult = parseDate(working);
    if (dateResult.date) working = dateResult.remainingText;

    // remove conectores remanescentes ("às", "para", "em")
    const { LB, RB } = DateParser;
    let title = working
      .replace(new RegExp(LB + "às" + RB, "gu"), " ")
      .replace(new RegExp(LB + "as" + RB, "gu"), " ")
      .replace(/\s+/g, " ")
      .trim();

    title = capitalizeFirst(title);

    return {
      type: "create_task",
      title: title || null,
      date: dateResult.date ? DateParser.toISODate(dateResult.date) : null,
      time: timeResult.time,
      priority: priorityResult.priority,
    };
  }

  /**
   * parseNoteCommand(rest)
   * Notas não possuem data/horário/prioridade — o texto inteiro (após o
   * gatilho) vira o conteúdo/título da nota.
   */
  function parseNoteCommand(restText) {
    const content = capitalizeFirst(normalizeText(restText).trim());
    return {
      type: "create_note",
      title: content || null,
    };
  }

  function capitalizeFirst(text) {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * parseCommand(rawText)
   * Ponto de entrada principal do interpretador. Recebe o texto bruto
   * retornado pela Web Speech API e devolve um objeto de comando
   * estruturado, ou { type: "unknown", raw } se nada for reconhecido.
   */
  function parseCommand(rawText) {
    const norm = normalizeText(rawText);
    if (!norm) return { type: "empty", raw: rawText };

    // ---- criar tarefa ----
    let m = matchFirst(norm, CREATE_TASK_TRIGGERS);
    if (m) {
      const rest = norm.slice(m[0].length);
      return { ...parseTaskCommand(rest), raw: rawText };
    }

    // ---- criar nota ----
    m = matchFirst(norm, CREATE_NOTE_TRIGGERS);
    if (m) {
      const rest = norm.slice(m[0].length);
      return { ...parseNoteCommand(rest), raw: rawText };
    }

    // ---- concluir tarefa ----
    m = norm.match(/^marcar\s+(.+?)\s+como conclu[ií]da$/);
    if (m) return { type: "complete_task", query: m[1].trim(), raw: rawText };
    m = matchFirst(norm, [/^concluir\s+(?:tarefa\s+)?/, /^finalizar\s+(?:tarefa\s+)?/]);
    if (m) return { type: "complete_task", query: norm.slice(m[0].length).trim(), raw: rawText };

    // ---- reabrir tarefa ----
    m = norm.match(/^marcar\s+(.+?)\s+como pendente$/);
    if (m) return { type: "reopen_task", query: m[1].trim(), raw: rawText };
    m = matchFirst(norm, [/^reabrir\s+(?:tarefa\s+)?/]);
    if (m) return { type: "reopen_task", query: norm.slice(m[0].length).trim(), raw: rawText };

    // ---- excluir tarefa ----
    m = matchFirst(norm, DELETE_TRIGGERS);
    if (m) return { type: "delete_task", query: norm.slice(m[0].length).trim(), raw: rawText };

    // ---- pesquisar ----
    m = matchFirst(norm, SEARCH_TRIGGERS);
    if (m) return { type: "search", query: norm.slice(m[0].length).trim(), raw: rawText };

    // ---- mostrar tarefas ----
    m = norm.match(/^mostrar\s+(?:minhas\s+)?tarefas(?:\s+de\s+(hoje|amanh[ãa]))?(\s+atrasadas)?$/);
    if (m) {
      let filter = "all";
      if (m[2]) filter = "overdue";
      else if (m[1]) filter = stripAccents(m[1]) === "hoje" ? "today" : "upcoming";
      return { type: "show_tasks", filter, raw: rawText };
    }
    m = norm.match(/^mostrar\s+tarefas\s+atrasadas$/);
    if (m) return { type: "show_tasks", filter: "overdue", raw: rawText };

    return { type: "unknown", raw: rawText };
  }

  return {
    parseCommand,
    parseTaskCommand,
    parseNoteCommand,
    normalizeText,
  };
})();
