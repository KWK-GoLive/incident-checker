# Incident Classification: answer checker

Students classify 300 fictional lab / pilot-plant incident reports by **type** and **severity** and upload their answer file (.csv or .xlsx) here:
https://kwk-golive.github.io/incident-checker/

- `index.html`, `app.js`, `checker-core.js`, `style.css`: the page (no build step).
- `config.js`: the URL of the scoring service (Google Apps Script web app).
- Problem statement (`Incident_Classification_problem.docx`, `Incident_Classification_slides.pptx`), reports (`incident_reports.txt/.xlsx`) and blank answer templates (`answer_template.csv/.xlsx`).
- `xlsx.full.min.js`: SheetJS Community Edition 0.18.5 (Apache-2.0, see `xlsx-LICENSE.txt`), used to read .xlsx files in the browser.

The answer key is **not** in this repository. Answers are scored by the teacher's Apps Script; the page only receives the score and the ids that are wrong.

All reports are fictional, written for the course AI for Data Work.
