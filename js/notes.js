/**
 * notes.js
 * Gerencia o ciclo de vida das anotações: criar, editar, excluir,
 * pesquisar e fixar/desafixar. Persistência via storage.js.
 */

const Notes = (() => {
  let cache = Storage.getNotes();

  function _persist() {
    Storage.saveNotes(cache);
  }

  function getAll() {
    // fixadas primeiro, depois por última alteração
    return [...cache].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
  }

  function getById(id) {
    return cache.find((n) => n.id === id) || null;
  }

  function create(data) {
    const now = new Date().toISOString();
    const note = {
      id: Storage.uuid(),
      title: (data.title || "").trim() || "Sem título",
      content: data.content || "",
      pinned: !!data.pinned,
      createdAt: now,
      updatedAt: now,
    };
    cache.unshift(note);
    _persist();
    return note;
  }

  function update(id, patch) {
    const idx = cache.findIndex((n) => n.id === id);
    if (idx === -1) return null;
    cache[idx] = { ...cache[idx], ...patch, updatedAt: new Date().toISOString() };
    _persist();
    return cache[idx];
  }

  function remove(id) {
    const idx = cache.findIndex((n) => n.id === id);
    if (idx === -1) return false;
    cache.splice(idx, 1);
    _persist();
    return true;
  }

  function togglePin(id) {
    const note = getById(id);
    if (!note) return null;
    return update(id, { pinned: !note.pinned });
  }

  function search(query) {
    const norm = DateParser.stripAccents(DateParser.normalizeText(query));
    if (!norm) return getAll();
    return getAll().filter((n) =>
      DateParser.stripAccents(DateParser.normalizeText(n.title)).includes(norm) ||
      DateParser.stripAccents(DateParser.normalizeText(n.content)).includes(norm)
    );
  }

  function pinned() {
    return getAll().filter((n) => n.pinned);
  }

  return { getAll, getById, create, update, remove, togglePin, search, pinned };
})();
