/* Incident Classification checker: file reading, format checks and scoring.
 * Works in the browser (window.IncCore) and in Node (module.exports) so the tests run the same code. */
(function (root) {
  "use strict";
  var N = 300;
  var TYPES = ["Injury", "Fire", "Release", "Equipment", "Near miss"];
  var SEVS = ["High", "Medium", "Low"];
  var TCODE = { "injury": "I", "fire": "F", "release": "R", "equipment": "E", "near miss": "N" };
  var SCODE = { "high": "H", "medium": "M", "low": "L" };

  function norm(s) { return String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase(); }

  /* CSV text -> array of rows. Handles quotes, CRLF, a BOM, and comma / semicolon / tab separators. */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var first = text.split(/\r?\n/)[0] || "";
    var cand = [",", ";", "\t"], sep = ",", best = -1;
    cand.forEach(function (c) { var k = first.split(c).length; if (k > best) { best = k; sep = c; } });
    var rows = [], row = [], f = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"' && f === "") q = true;
      else if (ch === sep) { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += ch;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  /* rows (array of arrays, first row = header) -> { ok, codes, errors, warnings }.
   * codes is a 600-character string: for id 1..300 a type letter (I F R E N) then a severity letter (H M L). */
  function validate(rows) {
    var errors = [], warnings = [];
    rows = (rows || []).filter(function (r) { return r && r.some(function (c) { return norm(c) !== ""; }); });
    if (!rows.length) return { ok: false, errors: ["The file is empty."], warnings: warnings };
    var hdr = rows[0].map(norm), col = {};
    if (/^\d+(\.0+)?$/.test(hdr[0] || "") && hdr.indexOf("id") < 0)
      return { ok: false, errors: ["The first row must be the header row: id, type, severity (your first row starts with a number)."], warnings: warnings };
    ["id", "type", "severity"].forEach(function (h) {
      var k = hdr.indexOf(h);
      if (k < 0) errors.push('Column "' + h + '" is missing. The first row must be the header: id, type, severity.');
      else if (hdr.indexOf(h, k + 1) >= 0) errors.push('Column "' + h + '" appears twice in the header.');
      col[h] = k;
    });
    var extra = hdr.filter(function (h) { return h !== "" && ["id", "type", "severity"].indexOf(h) < 0; });
    if (extra.length) warnings.push("Extra column(s) ignored: " + extra.join(", ") + ".");
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };
    var seen = {}, codes = new Array(N + 1), bad = { id: [], type: [], sev: [], dup: [], tblank: [], sblank: [] };
    for (var r = 1; r < rows.length; r++) {
      var line = r + 1, row = rows[r];
      var idS = norm(row[col.id]), t = norm(row[col.type]), s = norm(row[col.severity]);
      var id = /^\d+(\.0+)?$/.test(idS) ? parseInt(idS, 10) : NaN;
      if (!(id >= 1 && id <= N)) { bad.id.push("row " + line + ' ("' + (row[col.id] == null ? "" : row[col.id]) + '")'); continue; }
      if (seen[id]) { bad.dup.push(id); continue; }
      seen[id] = 1;
      var tc = TCODE[t], sc = SCODE[s];
      if (!tc) { if (t === "") bad.tblank.push(id); else bad.type.push("id " + id + ' ("' + row[col.type] + '")'); }
      if (!sc) { if (s === "") bad.sblank.push(id); else bad.sev.push("id " + id + ' ("' + row[col.severity] + '")'); }
      codes[id] = (tc || "?") + (sc || "?");
    }
    var missing = [];
    for (var j = 1; j <= N; j++) if (!seen[j]) missing.push(j);
    function lst(a) { return a.slice(0, 10).join(", ") + (a.length > 10 ? " … (" + a.length + " in all)" : ""); }
    if (bad.id.length) errors.push("id must be a whole number from 1 to " + N + ": " + lst(bad.id) + ".");
    if (bad.dup.length) errors.push("These ids appear more than once: " + lst(bad.dup) + ".");
    if (missing.length) errors.push("These ids are missing: " + lst(missing) + ".");
    if (bad.tblank.length) errors.push("type is blank for ids: " + lst(bad.tblank) + ".");
    if (bad.sblank.length) errors.push("severity is blank for ids: " + lst(bad.sblank) + ".");
    if (bad.type.length) errors.push("Unknown type (allowed: " + TYPES.join(", ") + "): " + lst(bad.type) + "." +
      (bad.type.some(function (x) { return /near.?miss|nearmiss/i.test(x); }) ? ' Write "Near miss" with a space.' : ""));
    if (bad.sev.length) errors.push("Unknown severity (allowed: " + SEVS.join(", ") + "): " + lst(bad.sev) + ".");
    if (errors.length) return { ok: false, errors: errors, warnings: warnings };
    return { ok: true, codes: codes.slice(1).join(""), errors: [], warnings: warnings };
  }

  /* codes vs key (both 600-character strings) -> result. Same logic as score_() in Code.gs. */
  function score(codes, key) {
    var t = 0, s = 0, b = 0, wrong = [];
    for (var i = 0; i < N; i++) {
      var ot = codes[2 * i] === key[2 * i], os = codes[2 * i + 1] === key[2 * i + 1];
      if (ot) t++; if (os) s++; if (ot && os) b++; else wrong.push(i + 1);
    }
    function pct(x) { return Math.round(1000 * x / N) / 10; }
    var pass = t >= 0.95 * N && s >= 0.95 * N, exc = t >= 0.99 * N && s >= 0.99 * N;
    return { typeCorrect: t, sevCorrect: s, bothCorrect: b, typePct: pct(t), sevPct: pct(s), bothPct: pct(b),
             wrongIds: wrong, pass: pass, excellent: exc, n: N };
  }

  var api = { N: N, TYPES: TYPES, SEVS: SEVS, parseCSV: parseCSV, validate: validate, score: score, norm: norm };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.IncCore = api;
})(this);
