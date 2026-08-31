/**
 * app.js
 * Inicialização do aplicativo: liga eventos de UI, navegação,
 * formulários, calendário, pesquisa e o fluxo de comando de voz.
 */

(function App() {
  const el = (id) => document.getElementById(id);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  // -----------------------------------------------------------------
  // Navegação
  // -----------------------------------------------------------------
  function bindNavigation() {
    qsa(".nav-item, .bn-item").forEach((btn) => {
      btn.addEventListener("click", () => UI.switchView(btn.dataset.view));
    });
  }

  // -----------------------------------------------------------------
  // Tarefas
  // -----------------------------------------------------------------
  function bindTasks() {
    el("newTaskBtn").addEventListener("click", () => UI.openTaskModal(null));
    el("fabBtn").addEventListener("click", () => {
      if (UI.currentView === "notes") UI.openNoteModal(null);
      else UI.openTaskModal(null);
    });
    el("taskModalClose").addEventListener("click", UI.closeTaskModal);
    el("taskCancelBtn").addEventListener("click", UI.closeTaskModal);
    el("taskForm").addEventListener("submit", UI.handleTaskFormSubmit);
    el("taskDeleteBtn").addEventListener("click", UI.handleTaskDelete);
    el("taskModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "taskModalOverlay") UI.closeTaskModal();
    });

    qsa("#taskFilters .pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        qsa("#taskFilters .pill").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        UI.taskFilter = btn.dataset.filter;
        UI.renderTasks();
      });
    });
  }

  // -----------------------------------------------------------------
  // Notas
  // -----------------------------------------------------------------
  function bindNotes() {
    el("newNoteBtn").addEventListener("click", () => UI.openNoteModal(null));
    el("noteModalClose").addEventListener("click", UI.closeNoteModal);
    el("noteSaveBtn").addEventListener("click", UI.handleNoteSave);
    el("noteDeleteBtn").addEventListener("click", UI.handleNoteDelete);
    el("notePinBtn").addEventListener("click", UI.handleNoteTogglePin);
    el("noteModalOverlay").addEventListener("click", (e) => {
      if (e.target.id === "noteModalOverlay") UI.closeNoteModal();
    });

    qsa("#noteFilters .pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        qsa("#noteFilters .pill").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        UI.noteFilter = btn.dataset.filter;
        UI.renderNotes();
      });
    });
  }

  // -----------------------------------------------------------------
  // Confirmação genérica
  // -----------------------------------------------------------------
  function bindConfirm() {
    el("confirmCancel").addEventListener("click", UI.closeConfirm);
    el("confirmOk").addEventListener("click", UI.runConfirmedAction);
    el("confirmOverlay").addEventListener("click", (e) => {
      if (e.target.id === "confirmOverlay") UI.closeConfirm();
    });
  }

  // -----------------------------------------------------------------
  // Calendário
  // -----------------------------------------------------------------
  function bindCalendar() {
    el("calPrev").addEventListener("click", UI.calPrevMonth);
    el("calNext").addEventListener("click", UI.calNextMonth);
  }

  // -----------------------------------------------------------------
  // Pesquisa
  // -----------------------------------------------------------------
  function bindSearch() {
    el("topSearchBtn").addEventListener("click", () => UI.openSearch());
    el("searchClose").addEventListener("click", UI.closeSearch);
    let debounceTimer;
    el("searchInput").addEventListener("input", (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => UI.runSearch(e.target.value.trim()), 150);
    });
  }

  // -----------------------------------------------------------------
  // Configurações
  // -----------------------------------------------------------------
  function bindSettings() {
    el("notifPermBtn").addEventListener("click", async () => {
      const result = await NotificationManager.requestPermission();
      if (result === "granted") UI.toast("Notificações ativadas");
      else if (result === "denied") UI.toast("Permissão negada pelo navegador");
      UI.renderSettings();
    });

    el("clearDataBtn").addEventListener("click", () => {
      UI.confirmAction({
        title: "Apagar todos os dados",
        body: "Isso removerá permanentemente todas as tarefas e anotações armazenadas neste dispositivo.",
        confirmLabel: "Apagar tudo",
        onConfirm: () => {
          Storage.clearAll();
          window.location.reload();
        },
      });
    });
  }

  // -----------------------------------------------------------------
  // Comando de voz — captura + interpretação + execução
  // -----------------------------------------------------------------
  function bindVoice() {
    const micButtons = [el("sidebarMic"), el("topMic"), el("bottomMic")].filter(Boolean);

    micButtons.forEach((btn) => btn.addEventListener("click", startVoiceFlow));
    el("voiceClose").addEventListener("click", () => {
      Voice.abort();
      UI.closeVoiceOverlay();
    });
    el("voiceOrb").addEventListener("click", () => {
      if (Voice.isListening) Voice.stop();
      else Voice.start();
    });

    Voice.on("start", () => UI.setVoiceListening(true));

    Voice.on("result", ({ finalText, interimText }) => {
      UI.setVoiceTranscript(finalText || interimText);
      if (finalText) {
        UI.setVoiceListening(false);
        UI.setVoiceStatus("✓ Comando reconhecido");
        setTimeout(() => executeVoiceCommand(finalText), 350);
      }
    });

    Voice.on("error", ({ reason }) => {
      UI.setVoiceListening(false);
      const messages = {
        "unsupported": "O reconhecimento de voz não é compatível com este navegador.",
        "permission-denied": "Permissão de microfone negada. Habilite o microfone nas configurações do navegador.",
        "no-speech": "Nenhuma fala detectada. Tente novamente.",
        "no-microphone": "Microfone indisponível.",
        "unknown": "Não consegui entender o comando. Tente novamente.",
      };
      UI.setVoiceStatus(messages[reason] || messages.unknown);
    });

    Voice.on("end", () => {
      UI.setVoiceListening(false);
    });
  }

  function startVoiceFlow() {
    if (!Voice.isSupported()) {
      UI.openVoiceOverlay();
      UI.setVoiceStatus("O reconhecimento de voz não é compatível com este navegador.");
      return;
    }
    UI.openVoiceOverlay();
    Voice.start();
  }

  /**
   * executeVoiceCommand
   * Recebe o texto final reconhecido, delega ao CommandParser e executa
   * a ação correspondente. Ações seguras (pesquisar, mostrar) executam
   * imediatamente; ações destrutivas (excluir) sempre pedem confirmação;
   * criação de tarefas/notas exibe uma confirmação visual antes de salvar.
   */
  function executeVoiceCommand(rawText) {
    const command = CommandParser.parseCommand(rawText);

    switch (command.type) {
      case "create_task": {
        UI.closeVoiceOverlay();
        if (!command.title) {
          UI.toast("Não entendi o título da tarefa. Tente novamente.");
          return;
        }
        UI.confirmAction({
          title: "Nova tarefa",
          body: buildTaskConfirmSummary(command),
          confirmLabel: "Criar",
          onConfirm: () => {
            Tasks.create({
              title: command.title,
              dueDate: command.date,
              dueTime: command.time,
              priority: command.priority || "medium",
              reminder: !!(command.date && command.time),
            });
            UI.toast("Tarefa criada por voz");
            UI.renderAll();
          },
        });
        break;
      }

      case "create_note": {
        UI.closeVoiceOverlay();
        if (!command.title) {
          UI.toast("Não entendi o conteúdo da nota. Tente novamente.");
          return;
        }
        Notes.create({ title: command.title, content: "" });
        UI.toast("Nota criada por voz");
        UI.renderAll();
        break;
      }

      case "complete_task": {
        UI.closeVoiceOverlay();
        const matches = Tasks.findByTitle(command.query);
        if (matches.length === 0) {
          UI.toast(`Nenhuma tarefa encontrada com "${command.query}".`);
          return;
        }
        Tasks.complete(matches[0].id);
        UI.toast(`Tarefa "${matches[0].title}" concluída`);
        UI.renderAll();
        break;
      }

      case "reopen_task": {
        UI.closeVoiceOverlay();
        const matches = Tasks.findByTitle(command.query);
        if (matches.length === 0) {
          UI.toast(`Nenhuma tarefa encontrada com "${command.query}".`);
          return;
        }
        Tasks.reopen(matches[0].id);
        UI.toast(`Tarefa "${matches[0].title}" reaberta`);
        UI.renderAll();
        break;
      }

      case "delete_task": {
        UI.closeVoiceOverlay();
        const matches = Tasks.findByTitle(command.query);
        if (matches.length === 0) {
          UI.toast(`Nenhuma tarefa encontrada com "${command.query}".`);
          return;
        }
        const target = matches[0];
        UI.confirmAction({
          title: "Excluir tarefa",
          body: `Tem certeza de que deseja excluir "${target.title}"? Essa ação não pode ser desfeita.`,
          confirmLabel: "Excluir",
          onConfirm: () => {
            Tasks.remove(target.id);
            UI.toast("Tarefa excluída");
            UI.renderAll();
          },
        });
        break;
      }

      case "search": {
        UI.closeVoiceOverlay();
        if (!command.query) { UI.toast("O que você deseja pesquisar?"); return; }
        UI.switchView("tasks");
        UI.openSearch(command.query);
        break;
      }

      case "show_tasks": {
        UI.closeVoiceOverlay();
        UI.switchView("tasks");
        const filterMap = { all: "all", today: "today", upcoming: "upcoming", overdue: "overdue" };
        const filter = filterMap[command.filter] || "all";
        qsaSetActiveFilter(filter);
        UI.taskFilter = filter;
        UI.renderTasks();
        break;
      }

      case "empty": {
        UI.setVoiceStatus("Nenhuma fala detectada. Tente novamente.");
        break;
      }

      default: {
        UI.setVoiceStatus("Não consegui entender o comando. Tente novamente.");
      }
    }
  }

  function qsaSetActiveFilter(filter) {
    qsa("#taskFilters .pill").forEach((b) => b.classList.toggle("is-active", b.dataset.filter === filter));
  }

  function buildTaskConfirmSummary(command) {
    const parts = [command.title];
    const dateTimeParts = [];
    if (command.date) {
      const todayIso = DateParser.toISODate(DateParser.startOfDay(new Date()));
      const tomorrowIso = DateParser.toISODate(DateParser.addDays(new Date(), 1));
      if (command.date === todayIso) dateTimeParts.push("Hoje");
      else if (command.date === tomorrowIso) dateTimeParts.push("Amanhã");
      else dateTimeParts.push(command.date.split("-").reverse().join("/"));
    }
    if (command.time) dateTimeParts.push(command.time);
    let summary = command.title;
    if (dateTimeParts.length) summary += ` — ${dateTimeParts.join(" · ")}`;
    if (command.priority) {
      const labels = { high: "prioridade alta", medium: "prioridade média", low: "prioridade baixa" };
      summary += ` (${labels[command.priority]})`;
    }
    return summary;
  }

  // -----------------------------------------------------------------
  // PWA: manifest já vinculado no HTML; registra o service worker
  // -----------------------------------------------------------------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((err) => {
          console.warn("Falha ao registrar service worker:", err);
        });
      });
    }
  }

  // -----------------------------------------------------------------
  // Atalhos de teclado (desktop): Esc fecha modais/overlays
  // -----------------------------------------------------------------
  function bindKeyboard() {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!el("voiceOverlay").hidden) { Voice.abort(); UI.closeVoiceOverlay(); return; }
      if (!el("confirmOverlay").hidden) { UI.closeConfirm(); return; }
      if (!el("taskModalOverlay").hidden) { UI.closeTaskModal(); return; }
      if (!el("noteModalOverlay").hidden) { UI.closeNoteModal(); return; }
      if (!el("searchBar").hidden) { UI.closeSearch(); return; }
    });
  }

  // -----------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------
  function init() {
    bindNavigation();
    bindTasks();
    bindNotes();
    bindConfirm();
    bindCalendar();
    bindSearch();
    bindSettings();
    bindVoice();
    bindKeyboard();
    registerServiceWorker();
    UI.switchView("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
