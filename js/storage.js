/**
 * storage.js
 * Camada de persistência local (localStorage).
 * Nenhum dado é enviado para qualquer servidor.
 */

const Storage = (() => {
  const KEYS = {
    tasks: "foco.tasks",
    notes: "foco.notes",
    settings: "foco.settings",
  };

  function _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.error("Erro ao ler do localStorage:", key, err);
      return fallback;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error("Erro ao gravar no localStorage:", key, err);
      return false;
    }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return {
    getTasks: () => _read(KEYS.tasks, []),
    saveTasks: (tasks) => _write(KEYS.tasks, tasks),

    getNotes: () => _read(KEYS.notes, []),
    saveNotes: (notes) => _write(KEYS.notes, notes),

    getSettings: () => _read(KEYS.settings, { notificationsEnabled: false }),
    saveSettings: (settings) => _write(KEYS.settings, settings),

    clearAll: () => {
      localStorage.removeItem(KEYS.tasks);
      localStorage.removeItem(KEYS.notes);
      localStorage.removeItem(KEYS.settings);
    },

    uuid,
  };
})();
