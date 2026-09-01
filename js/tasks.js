/**
 * tasks.js
 * Gerencia o ciclo de vida das tarefas: criar, editar, excluir, concluir,
 * reabrir e consultar. Toda a persistência passa por storage.js.
 */

const Tasks = (() => {
  let cache = Storage.getTasks();

  function _persist() {
    Storage.saveTasks(cache);
    NotificationManager.rescheduleAll(cache);
  }

  function getAll() {
    return [...cache];
  }

  function getById(id) {
    return cache.find((t) => t.id === id) || null;
  }

  /**
   * create(data) -> tarefa criada
   * data: { title, description, priority, dueDate, dueTime, reminder, category }
   */
  function create(data) {
    const now = new Date().toISOString();
    const task = {
      id: Storage.uuid(),
      title: (data.title || "").trim() || "Sem título",
      description: data.description || "",
      priority: data.priority || "medium",
      status: "pending",
      dueDate: data.dueDate || null,
      dueTime: data.dueTime || null,
      reminder: !!data.reminder,
      category: data.category || "",
      createdAt: now,
      updatedAt: now,
    };
    cache.unshift(task);
    _persist();
    return task;
  }

  function update(id, patch) {
    const idx = cache.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    cache[idx] = { ...cache[idx], ...patch, updatedAt: new Date().toISOString() };
    _persist();
    return cache[idx];
  }

  function remove(id) {
    const idx = cache.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    NotificationManager.cancelReminder(id);
    cache.splice(idx, 1);
    _persist();
    return true;
  }

  function complete(id) {
    return update(id, { status: "done" });
  }

  function reopen(id) {
    return update(id, { status: "pending" });
  }

  /**
   * findByTitle(query) — busca aproximada por título, usada pelos comandos
   * de voz de concluir/reabrir/excluir, que se referem à tarefa pelo nome.
   */
  function findByTitle(query) {
    const norm = DateParser.stripAccents(DateParser.normalizeText(query));
    if (!norm) return [];
    const matches = cache.filter((t) =>
      DateParser.stripAccents(DateParser.normalizeText(t.title)).includes(norm)
    );
    // prioriza correspondência exata
    matches.sort((a, b) => {
      const an = DateParser.stripAccents(DateParser.normalizeText(a.title));
      const bn = DateParser.stripAccents(DateParser.normalizeText(b.title));
      if (an === norm) return -1;
      if (bn === norm) return 1;
      return 0;
    });
    return matches;
  }

  function search(query) {
    const norm = DateParser.stripAccents(DateParser.normalizeText(query));
    if (!norm) return [];
    return cache.filter((t) =>
      DateParser.stripAccents(DateParser.normalizeText(t.title)).includes(norm) ||
      DateParser.stripAccents(DateParser.normalizeText(t.description || "")).includes(norm)
    );
  }

  function isOverdue(task) {
    if (task.status !== "pending" || !task.dueDate) return false;
    const today = DateParser.toISODate(DateParser.startOfDay(new Date()));
    if (task.dueDate < today) return true;
    if (task.dueDate === today && task.dueTime) {
      const now = new Date();
      const [h, m] = task.dueTime.split(":").map(Number);
      const due = new Date();
      due.setHours(h, m, 0, 0);
      return now > due;
    }
    return false;
  }

  function isToday(task) {
    const today = DateParser.toISODate(DateParser.startOfDay(new Date()));
    return task.dueDate === today;
  }

  function isUpcoming(task) {
    const today = DateParser.toISODate(DateParser.startOfDay(new Date()));
    return task.status === "pending" && task.dueDate && task.dueDate > today;
  }

  function filterBy(filter) {
    switch (filter) {
      case "today":
        return cache.filter((t) => isToday(t) && t.status === "pending");
      case "upcoming":
        return cache.filter((t) => isUpcoming(t));
      case "overdue":
        return cache.filter((t) => isOverdue(t));
      case "done":
        return cache.filter((t) => t.status === "done");
      case "all":
      default:
        return cache.filter((t) => t.status === "pending");
    }
  }

  function stats() {
    return {
      pending: cache.filter((t) => t.status === "pending").length,
      today: cache.filter((t) => isToday(t) && t.status === "pending").length,
      overdue: cache.filter((t) => isOverdue(t)).length,
      done: cache.filter((t) => t.status === "done").length,
    };
  }

  function tasksForDate(isoDate) {
    return cache.filter((t) => t.dueDate === isoDate);
  }

  function datesWithTasks() {
    return new Set(cache.filter((t) => t.dueDate).map((t) => t.dueDate));
  }

  // agenda lembretes já existentes ao iniciar o app
  NotificationManager.rescheduleAll(cache);

  return {
    getAll, getById, create, update, remove, complete, reopen,
    findByTitle, search, isOverdue, isToday, isUpcoming,
    filterBy, stats, tasksForDate, datesWithTasks,
  };
})();
