/* =============================================================================
   ics-export.js — Luvli ♡ Export to your calendar
   -----------------------------------------------------------------------------
   Turns your Luvli activities into a real .ics file — the standard calendar
   format every real calendar app reads (Google, Apple, Outlook, and anything
   else). No account, no server, no third party ever sees your day: this file
   is built entirely on your device from the same tasks already in Storage.

   Repeating activities need no special handling here: Luvli already expands
   them into individual dated tasks with a shared seriesId (see
   Scheduler.materialiseRecurring in scheduler.js), so exporting is just "one
   VEVENT per task in range" — no RRULE to get right.

   IcsExport.build(tasks) -> the whole .ics document, as text
   ========================================================================== */
'use strict';

const IcsExport = (() => {

  const pad = (n) => String(n).padStart(2, '0');

  /** Escape a text field per RFC 5545: backslash, comma, semicolon, newlines. */
  function escapeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /** RFC 5545 line folding: no line may exceed 75 octets; continuations start with a space. */
  function foldLine(line) {
    if (line.length <= 75) return line;
    let out = line.slice(0, 75);
    let rest = line.slice(75);
    while (rest.length) {
      out += '\r\n ' + rest.slice(0, 74);
      rest = rest.slice(74);
    }
    return out;
  }

  /** "2026-09-10" + "14:30" -> "20260910T143000" — a floating local time (no Z/TZID),
      so every calendar app shows it at the same wall-clock time Luvli planned it for. */
  function localStamp(dateKey, time) {
    const ymd = String(dateKey).replace(/-/g, '');
    const [hh, mm] = String(time || '00:00').split(':');
    return ymd + 'T' + pad(hh) + pad(mm) + '00';
  }

  /** The UTC "created at" stamp every VEVENT needs, in DTSTAMP's required Zulu form. */
  function nowStamp() {
    const d = new Date();
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
      pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  /** One VEVENT block for one Luvli task. */
  function taskEvent(task, stamp) {
    const lines = [
      'BEGIN:VEVENT',
      'UID:' + (task.id || (task.date + '-' + task.start)) + '@luvli.app',
      'DTSTAMP:' + stamp,
      'DTSTART:' + localStamp(task.date, task.start),
      'DTEND:' + localStamp(task.date, task.end),
      'SUMMARY:' + escapeText(task.name || 'Untitled')
    ];
    if (task.category) lines.push('CATEGORIES:' + escapeText(task.category));
    if (task.notes) lines.push('DESCRIPTION:' + escapeText(task.notes));
    if (task.completed) lines.push('STATUS:CONFIRMED');
    lines.push('END:VEVENT');
    return lines.map(foldLine).join('\r\n');
  }

  /**
   * Build a complete .ics document from a list of Luvli tasks.
   * Tasks missing a date/start/end (shouldn't happen, but data can be old) are skipped
   * quietly rather than producing a broken file.
   */
  function build(tasks) {
    const stamp = nowStamp();
    const events = (tasks || [])
      .filter((t) => t && t.date && t.start && t.end)
      .map((t) => taskEvent(t, stamp));

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Luvli//Day Planner//EN',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR'
    ].join('\r\n') + '\r\n';
  }

  return { build };
})();

if (typeof window !== 'undefined') window.IcsExport = IcsExport;
if (typeof module !== 'undefined' && module.exports) module.exports = IcsExport;
