/* Incident Classification checker - page logic. */
(function () {
  "use strict";
  var C = window.IncCore, URL_ = ((window.INC_CONFIG || {}).CHECKER_URL || "").trim();
  var $ = function (id) { return document.getElementById(id); };
  var lastSub = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  try { var p = JSON.parse(localStorage.getItem("inc-student") || "{}"); if (p.sid) $("sid").value = p.sid; if (p.nm) $("nm").value = p.nm; } catch (e) {}

  function readFile(file) {
    return new Promise(function (res, rej) {
      var name = file.name.toLowerCase(), fr = new FileReader();
      fr.onerror = function () { rej(new Error("The file could not be read.")); };
      if (/\.csv$/.test(name) || file.type === "text/csv") {
        fr.onload = function () { res(C.parseCSV(fr.result)); };
        fr.readAsText(file);
      } else if (/\.xlsx$/.test(name)) {
        fr.onload = function () {
          try {
            var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
            var ws = wb.Sheets[wb.SheetNames[0]];
            res(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false }).map(function (r) { return r.map(function (c) { return c == null ? "" : String(c); }); }));
          } catch (e) { rej(new Error("This does not look like a valid .xlsx file.")); }
        };
        fr.readAsArrayBuffer(file);
      } else rej(new Error("Please upload a .csv or .xlsx file (this one is \"" + file.name + "\")."));
    });
  }
  function call(payload) {
    var q = "action=check&payload=" + encodeURIComponent(JSON.stringify(payload)) + "&t=" + Date.now();
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 90000);
    return fetch(URL_ + (URL_.indexOf("?") >= 0 ? "&" : "?") + q, { cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .finally(function () { clearTimeout(timer); });
  }
  function box(cls, title, items) {
    return '<div class="msg ' + cls + '"><b>' + esc(title) + "</b>" + (items && items.length ? "<ul>" + items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") + "</div>";
  }
  function show(r, warnings) {
    var v = r.excellent ? ["pass", "Excellent! Pass"] : r.pass ? ["pass", "Pass"] : ["fail", "Not yet: you need 95% or more in both Type and Severity"];
    var h = (warnings.length ? box("warn", "Note", warnings) : "") +
      '<div class="verdict ' + v[0] + '">' + esc(v[1]) + "</div>" +
      '<div class="scores">' +
      '<div class="score">Type<b>' + r.typePct.toFixed(1) + '%</b><span class="muted">' + r.typeCorrect + " / " + r.n + "</span></div>" +
      '<div class="score">Severity<b>' + r.sevPct.toFixed(1) + '%</b><span class="muted">' + r.sevCorrect + " / " + r.n + "</span></div>" +
      '<div class="score">Both right<b>' + r.bothPct.toFixed(1) + '%</b><span class="muted">' + r.bothCorrect + " / " + r.n + "</span></div></div>" +
      '<p class="muted">Attempt ' + esc(r.attempt) + " for this student ID.</p>";
    if (r.wrongIds.length) {
      h += "<p><b>" + r.wrongIds.length + " report(s) with at least one wrong label</b> (ids):</p>" +
        '<div class="ids" id="ids">' + r.wrongIds.join(", ") + "</div>" +
        '<div class="row"><button type="button" class="ghost" id="cp">Copy the ids</button></div>';
    } else h += "<p><b>Every label is right.</b></p>";
    $("out").innerHTML = h;
    var cp = $("cp");
    if (cp) cp.onclick = function () {
      try { navigator.clipboard.writeText(r.wrongIds.join(", ")).then(function () { cp.textContent = "Copied"; }); } catch (e) {}
    };
  }
  $("f").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var sid = $("sid").value.trim(), nm = $("nm").value.trim(), file = $("file").files[0], out = $("out");
    var miss = [];
    if (!sid) miss.push("Type your student ID.");
    if (!nm) miss.push("Type your name.");
    if (!file) miss.push("Choose your answer file.");
    if (miss.length) { out.innerHTML = box("err", "Please fill in everything first", miss); return; }
    if (!URL_) { out.innerHTML = box("err", "The checker is not connected yet. Please tell your teacher.", []); return; }
    try { localStorage.setItem("inc-student", JSON.stringify({ sid: sid, nm: nm })); } catch (e) {}
    $("go").disabled = true; $("busy").textContent = "Checking…"; out.innerHTML = "";
    readFile(file).then(function (rows) {
      var v = C.validate(rows);
      if (!v.ok) { out.innerHTML = box("err", "Your file has format problems (nothing was scored or recorded):", v.errors) + (v.warnings.length ? box("warn", "Note", v.warnings) : ""); return; }
      // Same student + same answers as the last upload (e.g. a retry after a slow reply): reuse its submission id,
      // so the server returns the first result instead of logging a second attempt.
      if (!(lastSub && lastSub.codes === v.codes && lastSub.sid === sid))
        lastSub = { codes: v.codes, sid: sid, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 10) };
      return call({ studentId: sid, name: nm, codes: v.codes, submissionId: lastSub.id }).then(function (r) {
        if (!r || !r.ok) { out.innerHTML = box("err", (r && r.error) || "The checker gave no answer. Try again in a minute.", []); return; }
        show(r, v.warnings);
      });
    }).catch(function (e) {
      out.innerHTML = box("err", e && e.name === "AbortError" ? "The checker took too long to answer. Wait a minute and press the button again (the same file will not be counted twice)." : (e && e.message && !/fetch/i.test(e.message) ? e.message : "Could not reach the checker. Check your internet connection and try again."), []);
    }).finally(function () { $("go").disabled = false; $("busy").textContent = ""; });
  });
})();
