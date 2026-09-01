/**
 * ui.js
 * Camada de interface: renderização das views, modais, filtros,
 * pesquisa, calendário e integração visual do comando de voz.
 */

const UI = (() => {
  const el = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let currentView = "dashboard";
  let taskFilter = "all";
  let noteFilter = "all";
  let calState = { year: new Date().getFullYear(), month: new Date().getMonth(), selectedIso: null };
  let pendingConfirmAction = null;

  const PRIORITY_LABEL = { high: "Alta prioridade", medium: "Média prioridade", low: "Baixa prioridade" };
  const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  // ---------------------------------------------------------------------
  // Utilidades de data para exibição
  // ---------------------------------------------------------------------
  function formatDueLabel(task) {
    if (!task.dueDate) return task.dueTime ? task.dueTime : "";
    const todayIso = DateParser.toISODate(DateParser.startOfDay(new Date()));
    const tomorrowIso = DateParser.toISODate(DateParser.addDays(new Date(), 1));
    let label;
    if (task.dueDate === todayIso) label = "Hoje";
    else if (task.dueDate === tomorrowIso) label = "Amanhã";
    else {
      const [y, m, d] = task.dueDate.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      label = `${d} de ${CalendarUtil.MONTH_NAMES[m - 1]}`;
    }
    if (task.dueTime) label += ` · ${task.dueTime}`;
    return label;
  }

  function toast(message) {
    const t = el("toast");
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------------------
  // Navegação entre views
  // ---------------------------------------------------------------------
  const VIEW_TITLES = {
    dashboard: "Painel", tasks: "Tarefas", notes: "Anotações",
    calendar: "Calendário", settings: "Configurações",
  };

  function switchView(view) {
    currentView = view;
    qsa(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
    qsa(".nav-item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
    qsa(".bn-item").forEach((n) => n.classList.toggle("is-active", n.dataset.view === view));
    el("viewTitle").textContent = VIEW_TITLES[view] || "";
    closeSearch();
    renderAll();
  }

  // ---------------------------------------------------------------------
  // Render: Dashboard
  // ---------------------------------------------------------------------
  function renderDashboard() {
    const stats = Tasks.stats();
    el("statPending").textContent = stats.pending;
    el("statToday").textContent = stats.today;
    el("statOverdue").textContent = stats.overdue;
    el("statDone").textContent = stats.done;

    const todayList = Tasks.filterBy("today").concat(Tasks.filterBy("overdue"))
      .filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i)
      .sort(sortTasks);
    renderTaskListInto(el("dashTodayList"), todayList, { empty: "Nada por aqui hoje. Aproveite!" });

    const pinned = Notes.pinned();
    renderNoteMiniListInto(el("dashPinnedNotes"), pinned);
  }

  function renderNoteMiniListInto(container, notes) {
    container.innerHTML = "";
    if (notes.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:24px 8px"><p>Nenhuma nota fixada</p><span>Fixe notas importantes para vê-las aqui.</span></div>`;
      return;
    }
    notes.forEach((n) => {
      const row = document.createElement("div");
      row.className = "task-item";
      row.innerHTML = `
        <div class="task-body" data-note-id="${n.id}">
          <div class="task-title">📌 ${escapeHtml(n.title)}</div>
          <div class="task-meta">${escapeHtml((n.content || "").slice(0, 60))}</div>
        </div>`;
      row.querySelector(".task-body").addEventListener("click", () => openNoteModal(n.id));
      container.appendChild(row);
    });
  }

  // ---------------------------------------------------------------------
  // Render: Tasks
  // ---------------------------------------------------------------------
  function sortTasks(a, b) {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    const da = a.dueDate + (a.dueTime || "00:00");
    const db = b.dueDate + (b.dueTime || "00:00");
    return da.localeCompare(db);
  }

  function renderTasks() {
    const list = Tasks.filterBy(taskFilter).sort(sortTasks);
    renderTaskListInto(el("taskList"), list, {});
    el("taskEmpty").hidden = list.length !== 0;
  }

  function renderTaskListInto(container, list, opts) {
    container.innerHTML = "";
    if (list.length === 0 && opts.empty) {
      container.innerHTML = `<div class="empty-state" style="padding:24px 8px"><p>${opts.empty}</p></div>`;
      return;
    }
    list.forEach((task) => container.appendChild(buildTaskItem(task)));
  }

  function buildTaskItem(task) {
    const row = document.createElement("div");
    row.className = "task-item" + (task.status === "done" ? " is-done" : "");
    const overdue = Tasks.isOverdue(task);
    const dueLabel = formatDueLabel(task);

    row.innerHTML = `
      <button class="task-check" aria-label="Concluir tarefa">
        <svg viewBox="0 0 12 12" fill="none"><path d="M2 6.2 4.6 9 10 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta ${overdue ? "is-overdue" : ""}">
          ${dueLabel ? `<span>${dueLabel}</span>` : ""}
          ${dueLabel ? `<span class="dot">·</span>` : ""}
          <span class="priority-tag priority-${task.priority}"><span class="priority-dot priority-${task.priority}"></span>${PRIORITY_LABEL[task.priority]}</span>
          ${task.category ? `<span class="dot">·</span><span class="task-category">${escapeHtml(task.category)}</span>` : ""}
        </div>
      </div>
    `;

    row.querySelector(".task-check").addEventListener("click", (e) => {
      e.stopPropagation();
      if (task.status === "done") { Tasks.reopen(task.id); toast("Tarefa reaberta"); }
      else { Tasks.complete(task.id); toast("Tarefa concluída"); }
      renderAll();
    });
    row.querySelector(".task-body").addEventListener("click", () => openTaskModal(task.id));
    return row;
  }

  // ---------------------------------------------------------------------
  // Render: Notes
  // ---------------------------------------------------------------------
  function renderNotes() {
    let list = Notes.getAll();
    if (noteFilter === "pinned") list = list.filter((n) => n.pinned);
    const container = el("noteList");
    container.innerHTML = "";
    list.forEach((note) => container.appendChild(buildNoteCard(note)));
    el("noteEmpty").hidden = list.length !== 0;
  }

  function buildNoteCard(note) {
    const card = document.createElement("div");
    card.className = "note-card";
    const updated = new Date(note.updatedAt);
    card.innerHTML = `
      <div class="note-card-title">${note.pinned ? '<span class="pin">📌</span>' : ""}${escapeHtml(note.title)}</div>
      <div class="note-card-body">${escapeHtml(note.content || "")}</div>
      <div class="note-card-date">Atualizado em ${updated.toLocaleDateString("pt-BR")}</div>
    `;
    card.addEventListener("click", () => openNoteModal(note.id));
    return card;
  }

  // ---------------------------------------------------------------------
  // Render: Calendar
  // ---------------------------------------------------------------------
  function renderCalendar() {
    el("calMonthLabel").textContent = CalendarUtil.monthLabel(calState.year, calState.month);
    const grid = el("calGrid");
    grid.innerHTML = "";
    CalendarUtil.DOW_LABELS.forEach((l) => {
      const d = document.createElement("div");
      d.className = "cal-dow";
      d.textContent = l;
      grid.appendChild(d);
    });

    const cells = CalendarUtil.buildMonthGrid(calState.year, calState.month);
    const todayIso = DateParser.toISODate(DateParser.startOfDay(new Date()));
    const datesWithTasks = Tasks.datesWithTasks();

    cells.forEach((cell) => {
      const cellEl = document.createElement("button");
      if (cell.isEmpty) {
        cellEl.className = "cal-cell is-empty";
        grid.appendChild(cellEl);
        return;
      }
      cellEl.className = "cal-cell";
      if (cell.iso === todayIso) cellEl.classList.add("is-today");
      if (cell.iso === calState.selectedIso) cellEl.classList.add("is-selected");
      const hasTasks = datesWithTasks.has(cell.iso);
      cellEl.innerHTML = `<span>${cell.date.getDate()}</span><span class="cal-dot-row">${hasTasks ? '<span class="cal-dot"></span>' : ""}</span>`;
      cellEl.addEventListener("click", () => {
        calState.selectedIso = cell.iso;
        renderCalendar();
        renderCalDay();
      });
      grid.appendChild(cellEl);
    });

    if (!calState.selectedIso) {
      renderCalDay();
    }
  }

  function renderCalDay() {
    const label = el("calDayLabel");
    const listEl = el("calDayList");
    if (!calState.selectedIso) {
      label.textContent = "Selecione um dia";
      listEl.innerHTML = "";
      return;
    }
    const [y, m, d] = calState.selectedIso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    label.textContent = `${d} de ${CalendarUtil.MONTH_NAMES[m - 1]} · ${WEEKDAY_SHORT[dt.getDay()]}`;
    const tasks = Tasks.tasksForDate(calState.selectedIso).sort(sortTasks);
    renderTaskListInto(listEl, tasks, { empty: "Nenhuma tarefa nesta data." });
  }

  function calPrevMonth() {
    calState.month--;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    renderCalendar();
  }
  function calNextMonth() {
    calState.month++;
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalendar();
  }

  // ---------------------------------------------------------------------
  // Render: Settings
  // ---------------------------------------------------------------------
  function renderSettings() {
    const badge = el("voiceSupportBadge");
    if (Voice.isSupported()) {
      badge.textContent = "Compatível";
      badge.className = "badge ok";
    } else {
      badge.textContent = "Não compatível";
      badge.className = "badge no";
    }

    const notifBtn = el("notifPermBtn");
    const perm = NotificationManager.getPermission();
    if (perm === "granted") { notifBtn.textContent = "Ativado"; notifBtn.disabled = true; }
    else if (perm === "unsupported") { notifBtn.textContent = "Indisponível"; notifBtn.disabled = true; }
    else { notifBtn.textContent = "Ativar"; notifBtn.disabled = false; }

    el("dataCountBadge").textContent = `${Tasks.getAll().length} tarefas · ${Notes.getAll().length} notas`;
  }

  // ---------------------------------------------------------------------
  // Render tudo
  // ---------------------------------------------------------------------
  function renderAll() {
    if (currentView === "dashboard") renderDashboard();
    else if (currentView === "tasks") renderTasks();
    else if (currentView === "notes") renderNotes();
    else if (currentView === "calendar") renderCalendar();
    else if (currentView === "settings") renderSettings();
  }

  // ---------------------------------------------------------------------
  // Modal: Tarefa
  // ---------------------------------------------------------------------
  function openTaskModal(taskId) {
    const overlay = el("taskModalOverlay");
    const isEdit = !!taskId;
    el("taskModalTitle").textContent = isEdit ? "Editar tarefa" : "Nova tarefa";
    el("taskDeleteBtn").hidden = !isEdit;
    el("taskId").value = taskId || "";

    if (isEdit) {
      const t = Tasks.getById(taskId);
      el("taskTitle").value = t.title;
      el("taskDescription").value = t.description || "";
      el("taskDate").value = t.dueDate || "";
      el("taskTime").value = t.dueTime || "";
      el("taskPriority").value = t.priority;
      el("taskCategory").value = t.category || "";
      el("taskReminder").checked = !!t.reminder;
    } else {
      el("taskForm").reset();
      el("taskPriority").value = "medium";
    }
    overlay.hidden = false;
    setTimeout(() => el("taskTitle").focus(), 50);
  }

  function openTaskModalPrefilled(prefill) {
    openTaskModal(null);
    if (prefill.title) el("taskTitle").value = prefill.title;
    if (prefill.date) el("taskDate").value = prefill.date;
    if (prefill.time) el("taskTime").value = prefill.time;
    if (prefill.priority) el("taskPriority").value = prefill.priority;
  }

  function closeTaskModal() {
    el("taskModalOverlay").hidden = true;
  }

  function handleTaskFormSubmit(e) {
    e.preventDefault();
    const id = el("taskId").value;
    const data = {
      title: el("taskTitle").value,
      description: el("taskDescription").value,
      dueDate: el("taskDate").value || null,
      dueTime: el("taskTime").value || null,
      priority: el("taskPriority").value,
      category: el("taskCategory").value,
      reminder: el("taskReminder").checked,
    };
    if (id) { Tasks.update(id, data); toast("Tarefa atualizada"); }
    else { Tasks.create(data); toast("Tarefa criada"); }
    closeTaskModal();
    renderAll();
  }

  function handleTaskDelete() {
    const id = el("taskId").value;
    if (!id) return;
    closeTaskModal();
    confirmAction({
      title: "Excluir tarefa",
      body: "Tem certeza de que deseja excluir esta tarefa? Essa ação não pode ser desfeita.",
      onConfirm: () => {
        Tasks.remove(id);
        toast("Tarefa excluída");
        renderAll();
      },
    });
  }

  // ---------------------------------------------------------------------
  // Modal: Nota
  // ---------------------------------------------------------------------
  function openNoteModal(noteId) {
    const overlay = el("noteModalOverlay");
    const isEdit = !!noteId;
    el("noteModalTitle").textContent = isEdit ? "Editar nota" : "Nova nota";
    el("noteDeleteBtn").hidden = !isEdit;
    el("noteId").value = noteId || "";

    if (isEdit) {
      const n = Notes.getById(noteId);
      el("noteTitle").value = n.title;
      el("noteContent").value = n.content || "";
      el("notePinBtn").textContent = n.pinned ? "Desafixar" : "Fixar";
      el("noteMeta").textContent = `Criada em ${new Date(n.createdAt).toLocaleDateString("pt-BR")} · Alterada em ${new Date(n.updatedAt).toLocaleDateString("pt-BR")}`;
    } else {
      el("noteTitle").value = "";
      el("noteContent").value = "";
      el("notePinBtn").textContent = "Fixar";
      el("noteMeta").textContent = "";
    }
    overlay.hidden = false;
    setTimeout(() => el("noteTitle").focus(), 50);
  }

  function openNoteModalPrefilled(prefill) {
    openNoteModal(null);
    if (prefill.title) el("noteContent").value = prefill.title;
  }

  function closeNoteModal() {
    el("noteModalOverlay").hidden = true;
  }

  function handleNoteSave() {
    const id = el("noteId").value;
    const title = el("noteTitle").value.trim() || "Sem título";
    const content = el("noteContent").value;
    if (id) { Notes.update(id, { title, content }); toast("Nota atualizada"); }
    else { Notes.create({ title, content }); toast("Nota criada"); }
    closeNoteModal();
    renderAll();
  }

  function handleNoteDelete() {
    const id = el("noteId").value;
    if (!id) return;
    closeNoteModal();
    confirmAction({
      title: "Excluir nota",
      body: "Tem certeza de que deseja excluir esta nota? Essa ação não pode ser desfeita.",
      onConfirm: () => {
        Notes.remove(id);
        toast("Nota excluída");
        renderAll();
      },
    });
  }

  function handleNoteTogglePin() {
    const id = el("noteId").value;
    if (!id) return;
    const updated = Notes.togglePin(id);
    el("notePinBtn").textContent = updated.pinned ? "Desafixar" : "Fixar";
    toast(updated.pinned ? "Nota fixada" : "Nota desafixada");
    renderAll();
  }

  // ---------------------------------------------------------------------
  // Confirmação genérica (usada por exclusões e comandos de voz destrutivos)
  // ---------------------------------------------------------------------
  function confirmAction({ title, body, confirmLabel, onConfirm }) {
    el("confirmTitle").textContent = title;
    el("confirmBody").textContent = body;
    el("confirmOk").textContent = confirmLabel || "Confirmar";
    pendingConfirmAction = onConfirm;
    el("confirmOverlay").hidden = false;
  }

  function closeConfirm() {
    el("confirmOverlay").hidden = true;
    pendingConfirmAction = null;
  }

  function runConfirmedAction() {
    const action = pendingConfirmAction;
    closeConfirm();
    if (action) action();
  }

  // ---------------------------------------------------------------------
  // Pesquisa
  // ---------------------------------------------------------------------
  function openSearch(prefillQuery) {
    el("searchBar").hidden = false;
    const input = el("searchInput");
    input.value = prefillQuery || "";
    input.focus();
    runSearch(input.value);
  }

  function closeSearch() {
    el("searchBar").hidden = true;
    el("searchInput").value = "";
  }

  function runSearch(query) {
    if (!query) { renderAll(); return; }
    switchToSearchResults(query);
  }

  function switchToSearchResults(query) {
    // Mostra resultados dentro da view atualmente ativa (tarefas ou notas);
    // se estiver em outra view, exibe resultados de tarefas por padrão.
    const taskResults = Tasks.search(query);
    const noteResults = Notes.search(query);

    if (currentView === "notes") {
      const container = el("noteList");
      container.innerHTML = "";
      noteResults.forEach((n) => container.appendChild(buildNoteCard(n)));
      el("noteEmpty").hidden = noteResults.length !== 0;
    } else {
      if (currentView !== "tasks") switchView("tasks");
      const container = el("taskList");
      container.innerHTML = "";
      taskResults.sort(sortTasks).forEach((t) => container.appendChild(buildTaskItem(t)));
      el("taskEmpty").hidden = taskResults.length !== 0;
    }
  }

  // ---------------------------------------------------------------------
  // Voice overlay (visual)
  // ---------------------------------------------------------------------
  function openVoiceOverlay() {
    el("voiceOverlay").hidden = false;
    el("voiceStatus").textContent = "Toque para falar";
    el("voiceTranscript").textContent = "";
    el("voiceOrb").classList.remove("is-listening");
  }

  function closeVoiceOverlay() {
    el("voiceOverlay").hidden = true;
  }

  function setVoiceListening(listening) {
    const orb = el("voiceOrb");
    orb.classList.toggle("is-listening", listening);
    el("voiceStatus").textContent = listening ? "🔴 Ouvindo…" : "Processando…";
  }

  function setVoiceTranscript(text) {
    el("voiceTranscript").textContent = text;
  }

  function setVoiceStatus(text) {
    el("voiceStatus").textContent = text;
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  return {
    el, qs, qsa,
    switchView, renderAll,
    renderDashboard, renderTasks, renderNotes, renderCalendar, renderSettings,
    openTaskModal, openTaskModalPrefilled, closeTaskModal, handleTaskFormSubmit, handleTaskDelete,
    openNoteModal, openNoteModalPrefilled, closeNoteModal, handleNoteSave, handleNoteDelete, handleNoteTogglePin,
    confirmAction, closeConfirm, runConfirmedAction,
    openSearch, closeSearch, runSearch,
    openVoiceOverlay, closeVoiceOverlay, setVoiceListening, setVoiceTranscript, setVoiceStatus,
    calPrevMonth, calNextMonth,
    toast,
    get taskFilter() { return taskFilter; }, set taskFilter(v) { taskFilter = v; },
    get noteFilter() { return noteFilter; }, set noteFilter(v) { noteFilter = v; },
    get currentView() { return currentView; },
  };
})();
