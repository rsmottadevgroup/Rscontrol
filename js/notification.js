/**
 * notification.js
 * Gerencia lembretes de tarefas usando a Notifications API do navegador.
 * Nenhum serviço externo é utilizado — os lembretes são agendados apenas
 * enquanto o aplicativo estiver aberto na aba (limitação de apps 100% locais
 * sem backend/push server).
 */

const NotificationManager = (() => {
  const timers = new Map();

  function isSupported() {
    return "Notification" in window;
  }

  function getPermission() {
    if (!isSupported()) return "unsupported";
    return Notification.permission;
  }

  async function requestPermission() {
    if (!isSupported()) return "unsupported";
    try {
      const result = await Notification.requestPermission();
      return result;
    } catch (err) {
      console.error("Erro ao solicitar permissão de notificação:", err);
      return "denied";
    }
  }

  function notify(title, body) {
    if (!isSupported() || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "icons/icon-192.svg" });
    } catch (err) {
      console.error("Erro ao exibir notificação:", err);
    }
  }

  /**
   * scheduleReminder(task)
   * Agenda um lembrete para o momento definido (data + horário) da tarefa,
   * caso ainda esteja no futuro e a aba permaneça aberta.
   */
  function scheduleReminder(task) {
    cancelReminder(task.id);
    if (!task.reminder || !task.dueDate) return;

    const timeStr = task.dueTime || "09:00";
    const target = new Date(`${task.dueDate}T${timeStr}:00`);
    const delay = target.getTime() - Date.now();

    if (delay <= 0 || delay > 24 * 60 * 60 * 1000 * 30) return; // ignora passados ou muito distantes

    const timerId = setTimeout(() => {
      notify("Lembrete de tarefa", task.title);
      timers.delete(task.id);
    }, delay);

    timers.set(task.id, timerId);
  }

  function cancelReminder(taskId) {
    if (timers.has(taskId)) {
      clearTimeout(timers.get(taskId));
      timers.delete(taskId);
    }
  }

  function rescheduleAll(tasks) {
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
    tasks.filter((t) => t.status === "pending" && t.reminder).forEach(scheduleReminder);
  }

  return {
    isSupported,
    getPermission,
    requestPermission,
    notify,
    scheduleReminder,
    cancelReminder,
    rescheduleAll,
  };
})();
