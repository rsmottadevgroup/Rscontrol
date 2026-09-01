/**
 * calendar.js
 * Funções auxiliares para montar a grade do calendário mensal,
 * usando apenas o objeto Date nativo (sem bibliotecas externas).
 */

const CalendarUtil = (() => {
  const MONTH_NAMES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const DOW_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

  /**
   * buildMonthGrid(year, monthIndex) -> array de células
   * Cada célula: { date: Date|null, iso: string|null, isEmpty }
   * Semanas começam no domingo.
   */
  function buildMonthGrid(year, monthIndex) {
    const firstDay = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startOffset = firstDay.getDay(); // 0 = domingo

    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ date: null, iso: null, isEmpty: true });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, monthIndex, day);
      cells.push({ date, iso: DateParser.toISODate(date), isEmpty: false });
    }
    return cells;
  }

  function monthLabel(year, monthIndex) {
    return `${MONTH_NAMES[monthIndex]} de ${year}`;
  }

  return { buildMonthGrid, monthLabel, MONTH_NAMES, DOW_LABELS };
})();
