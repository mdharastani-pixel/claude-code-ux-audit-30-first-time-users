/* FitTrack — Views, Routing und Interaktion. */
(function (global) {
  'use strict';

  var Store = global.Store;
  var Charts = global.Charts;
  var FitData = global.FitData;
  var h = Charts.esc;

  var view = document.getElementById('view');
  var modalRoot = document.getElementById('modal-root');
  var toastRoot = document.getElementById('toast-root');
  var sessionPill = document.getElementById('session-pill');
  var sessionPillTime = document.getElementById('session-pill-time');

  var restEndsAt = null;   // Zeitstempel des Pausen-Endes
  var uiFilter = { muscle: 'Alle', search: '' };

  /* ---------- Formatierung ---------- */

  function nf(n, digits) {
    var d = digits || 0;
    return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function unit() { return Store.state.settings.unit; }

  function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
  }

  function fmtDateLong(iso) {
    return new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtClock(totalSec) {
    var s = Math.max(0, Math.round(totalSec));
    var m = Math.floor(s / 60);
    var sec = s % 60;
    var hh = Math.floor(m / 60);
    var mm = m % 60;
    if (hh > 0) return hh + ':' + String(mm).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    return String(mm).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  function fmtDuration(sec) {
    var m = Math.round((sec || 0) / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
  }

  function toast(message) {
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    toastRoot.appendChild(node);
    global.setTimeout(function () { node.remove(); }, 2600);
  }

  function beep() {
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.52);
      osc.onended = function () { try { ctx.close(); } catch (e) {} };
    } catch (err) { /* Ton ist optional */ }
  }

  /* ---------- Modal ---------- */

  function closeModal() {
    modalRoot.innerHTML = '';
    document.removeEventListener('keydown', onModalKey);
  }

  function onModalKey(ev) {
    if (ev.key === 'Escape') closeModal();
  }

  function openModal(title, bodyHTML, onMount) {
    modalRoot.innerHTML =
      '<div class="modal-backdrop" data-backdrop>' +
        '<div class="modal" role="dialog" aria-modal="true" aria-label="' + h(title) + '">' +
          '<div class="modal-head"><h2>' + h(title) + '</h2>' +
            '<button class="icon-btn" type="button" data-close aria-label="Schließen">✕</button></div>' +
          bodyHTML +
        '</div>' +
      '</div>';
    document.addEventListener('keydown', onModalKey);
    modalRoot.querySelector('[data-backdrop]').addEventListener('mousedown', function (ev) {
      if (ev.target === ev.currentTarget) closeModal();
    });
    modalRoot.querySelector('[data-close]').addEventListener('click', closeModal);
    if (onMount) onMount(modalRoot.querySelector('.modal'));
  }

  function confirmModal(title, text, confirmLabel, onYes) {
    openModal(title,
      '<p class="muted">' + h(text) + '</p>' +
      '<div class="modal-actions">' +
        '<button class="btn" type="button" data-no>Abbrechen</button>' +
        '<button class="btn btn-danger" type="button" data-yes>' + h(confirmLabel) + '</button>' +
      '</div>',
      function (modal) {
        modal.querySelector('[data-no]').addEventListener('click', closeModal);
        modal.querySelector('[data-yes]').addEventListener('click', function () {
          closeModal();
          onYes();
        });
      });
  }

  function exercisePicker(title, onPick, excludeIds) {
    var exclude = excludeIds || [];
    openModal(title,
      '<label class="field"><span>Suchen</span>' +
        '<input type="search" data-picker-search placeholder="z. B. Bankdrücken" autocomplete="off"></label>' +
      '<div class="tag-row" data-picker-tags style="margin-top:12px"></div>' +
      '<ul class="list" data-picker-list style="margin-top:12px"></ul>',
      function (modal) {
        var search = modal.querySelector('[data-picker-search]');
        var tags = modal.querySelector('[data-picker-tags]');
        var list = modal.querySelector('[data-picker-list]');
        var muscle = 'Alle';

        function renderTags() {
          tags.innerHTML = ['Alle'].concat(FitData.muscles).map(function (m) {
            return '<button class="chip" type="button" data-m="' + h(m) + '" aria-pressed="' + (m === muscle) + '">' + h(m) + '</button>';
          }).join('');
        }

        function renderList() {
          var q = search.value.trim().toLowerCase();
          var items = Store.state.exercises.filter(function (ex) {
            if (exclude.indexOf(ex.id) !== -1) return false;
            if (muscle !== 'Alle' && ex.muscle !== muscle) return false;
            if (q && (ex.name + ' ' + ex.equipment + ' ' + ex.muscle).toLowerCase().indexOf(q) === -1) return false;
            return true;
          });
          if (!items.length) {
            list.innerHTML = '<li class="empty small">Keine Übung gefunden. Du kannst eigene unter „Übungen" anlegen.</li>';
            return;
          }
          list.innerHTML = items.map(function (ex) {
            return '<li><button class="item" type="button" data-pick="' + h(ex.id) + '">' +
              '<span class="grow"><span class="item-title">' + h(ex.name) + '</span>' +
              '<span class="item-sub"> · ' + h(ex.muscle) + ' · ' + h(ex.equipment) + '</span></span>' +
              '<span aria-hidden="true">＋</span></button></li>';
          }).join('');
        }

        renderTags();
        renderList();
        search.addEventListener('input', renderList);
        tags.addEventListener('click', function (ev) {
          var btn = ev.target.closest('[data-m]');
          if (!btn) return;
          muscle = btn.getAttribute('data-m');
          renderTags();
          renderList();
        });
        list.addEventListener('click', function (ev) {
          var btn = ev.target.closest('[data-pick]');
          if (!btn) return;
          onPick(btn.getAttribute('data-pick'));
        });
        if (global.matchMedia('(min-width: 860px)').matches) search.focus();
      });
  }

  /* ---------- Views ---------- */

  function emptyState(icon, title, text, actionHTML) {
    return '<div class="card empty"><span class="empty-icon" aria-hidden="true">' + icon + '</span>' +
      '<h3>' + h(title) + '</h3><p class="small" style="margin:6px 0 14px">' + h(text) + '</p>' +
      (actionHTML || '') + '</div>';
  }

  function viewDashboard() {
    var s = Store.state;
    var week = Store.weekStats(0);
    var goal = s.settings.weeklyGoal;
    var recent = Store.workoutsSorted().slice(0, 3);
    var hour = new Date().getHours();
    var greeting = hour < 11 ? 'Guten Morgen' : (hour < 18 ? 'Guten Tag' : 'Guten Abend');

    var weeks = [];
    for (var i = 7; i >= 0; i--) {
      var st = Store.weekStats(i);
      weeks.push({
        label: i === 0 ? 'jetzt' : 'KW-' + i,
        value: st.volume,
        highlight: i <= 3,
        title: nf(st.volume) + ' ' + unit() + ' Volumen · ' + st.count + ' Einheiten'
      });
    }

    var dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    var trainedDays = {};
    week.workouts.forEach(function (w) {
      var d = (new Date(w.date).getDay() + 6) % 7;
      trainedDays[d] = true;
    });

    var html = '<div class="page-head"><div>' +
      '<h1>' + greeting + '</h1>' +
      '<p>' + h(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })) + '</p>' +
      '</div></div>';

    if (s.session) {
      var done = s.session.entries.reduce(function (n, e) {
        return n + e.sets.filter(function (x) { return x.done; }).length;
      }, 0);
      html += '<div class="card" style="border-color:var(--accent)">' +
        '<div class="row-between wrap">' +
          '<div><span class="pill pill-live"><span class="dot"></span>läuft</span>' +
            '<h2 style="margin-top:8px">' + h(s.session.name) + '</h2>' +
            '<p class="small muted">' + done + ' Sätze erledigt · Start ' + h(fmtTime(s.session.startedAt)) + '</p></div>' +
          '<a class="btn btn-primary" href="#/training">Weitertrainieren</a>' +
        '</div></div>';
    } else {
      html += '<div class="card"><div class="row-between wrap">' +
        '<div><h2>Bereit für die nächste Einheit?</h2>' +
        '<p class="small muted">Plan wählen oder frei loslegen — Sätze trägst du unterwegs ein.</p></div>' +
        '<a class="btn btn-primary" href="#/training">Training starten</a>' +
        '</div></div>';
    }

    html += '<div class="section-title"><h2>Diese Woche</h2><span class="pill">' +
      week.count + ' / ' + goal + ' Ziel</span></div>';

    html += '<div class="stat-grid">' +
      stat(week.count, 'Einheiten') +
      stat(nf(week.volume) + ' <span class="small muted">' + unit() + '</span>', 'Volumen') +
      stat(week.sets, 'Sätze') +
      stat(Store.streak() + ' <span class="small muted">Tage</span>', 'Serie') +
      '</div>';

    html += '<div class="card" style="margin-top:14px"><div class="week-dots">' +
      dayNames.map(function (d, i) {
        return '<div class="week-dot' + (trainedDays[i] ? ' on' : '') + '">' + d + '</div>';
      }).join('') + '</div></div>';

    html += '<div class="section-title"><h2>Volumen der letzten 8 Wochen</h2></div>' +
      '<div class="card">' + Charts.bars(weeks, { label: 'Trainingsvolumen je Woche', height: 140 }) +
      '<p class="small muted" style="margin-top:8px">Volumen = Gewicht × Wiederholungen aller abgehakten Sätze.</p></div>';

    html += '<div class="section-title"><h2>Letzte Einheiten</h2>' +
      (recent.length ? '<a class="small" href="#/verlauf">Alle ansehen</a>' : '') + '</div>';

    if (!recent.length) {
      html += emptyState('📋', 'Noch kein Training aufgezeichnet',
        'Sobald du eine Einheit abschließt, erscheint sie hier — mit Volumen, Dauer und Sätzen.',
        '<a class="btn btn-primary" href="#/training">Erste Einheit starten</a>');
    } else {
      html += '<ul class="list">' + recent.map(workoutRow).join('') + '</ul>';
    }

    return html;
  }

  function stat(value, label) {
    return '<div class="stat"><div class="stat-value">' + value + '</div><div class="stat-label">' + h(label) + '</div></div>';
  }

  function workoutRow(w) {
    var vol = Store.workoutVolume(w);
    var km = Store.workoutDistance(w);
    var meta = [fmtDate(w.date), fmtDuration(w.durationSec), Store.workoutSets(w) + ' Sätze'];
    if (vol > 0) meta.push(nf(vol) + ' ' + unit());
    if (km > 0) meta.push(nf(km, 1) + ' km');
    return '<li><a class="item" href="#/verlauf/' + h(w.id) + '">' +
      '<span class="grow"><span class="item-title">' + h(w.name) + '</span><br>' +
      '<span class="item-sub">' + h(meta.join(' · ')) + '</span></span>' +
      '<span aria-hidden="true" class="muted">›</span></a></li>';
  }

  function viewTraining() {
    var s = Store.state;
    if (!s.session) {
      var html = '<div class="page-head"><div><h1>Training</h1>' +
        '<p>Wähle einen Plan oder starte frei — Übungen kannst du jederzeit ergänzen.</p></div></div>';
      html += '<button class="btn btn-primary btn-block" type="button" data-action="start-free">Freies Training starten</button>';
      html += '<div class="section-title"><h2>Aus einem Plan starten</h2><a class="small" href="#/plaene">Pläne verwalten</a></div>';
      html += '<ul class="list">' + s.plans.map(function (p) {
        return '<li><button class="item" type="button" data-action="start-plan" data-id="' + h(p.id) + '">' +
          '<span class="grow"><span class="item-title">' + h(p.name) + '</span><br>' +
          '<span class="item-sub">' + p.exerciseIds.length + ' Übungen · ' +
          h(p.exerciseIds.slice(0, 3).map(function (id) { return Store.exerciseName(id).split(' (')[0]; }).join(', ')) +
          (p.exerciseIds.length > 3 ? ' …' : '') + '</span></span>' +
          '<span class="pill pill-accent">Start</span></button></li>';
      }).join('') + '</ul>';
      return html;
    }

    var session = s.session;
    var elapsed = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
    var totalDone = session.entries.reduce(function (n, e) {
      return n + e.sets.filter(function (x) { return x.done; }).length;
    }, 0);
    var volume = Store.workoutVolume({ entries: session.entries });

    var out = '<div class="timer-bar">' +
      '<div><div class="timer-time" data-elapsed>' + fmtClock(elapsed) + '</div>' +
      '<div class="small muted">' + h(session.name) + ' · ' + totalDone + ' Sätze · ' + nf(volume) + ' ' + unit() + '</div></div>' +
      '<div class="row">' +
        '<button class="btn btn-sm" type="button" data-action="discard-session">Verwerfen</button>' +
        '<button class="btn btn-primary btn-sm" type="button" data-action="finish-session">Beenden</button>' +
      '</div></div>';

    if (restEndsAt) {
      out += '<div class="rest-timer" data-rest-box>' +
        '<span aria-hidden="true">⏱</span>' +
        '<span class="grow">Pause · <span data-rest>' + fmtClock((restEndsAt - Date.now()) / 1000) + '</span></span>' +
        '<button class="btn btn-sm" type="button" data-action="rest-add">+30 s</button>' +
        '<button class="btn btn-sm" type="button" data-action="rest-stop">Überspringen</button>' +
        '</div>';
    }

    if (!session.entries.length) {
      out += emptyState('🏋️', 'Noch keine Übung in dieser Einheit',
        'Füge die erste Übung hinzu und trage Gewicht und Wiederholungen ein.',
        '<button class="btn btn-primary" type="button" data-action="add-exercise">Übung hinzufügen</button>');
      return out;
    }

    out += session.entries.map(function (entry) {
      var ex = Store.exerciseById(entry.exerciseId);
      var cardio = ex && ex.type === 'cardio';
      var last = Store.lastSetsFor(entry.exerciseId);
      var block = '<section class="exercise-block">' +
        '<div class="row-between">' +
          '<div class="grow"><h3 class="truncate">' + h(ex ? ex.name : 'Übung') + '</h3>' +
          '<span class="item-sub">' + h(ex ? ex.muscle + ' · ' + ex.equipment : '') +
          (last ? ' · zuletzt ' + h(fmtDate(last.date)) : ' · neu') + '</span></div>' +
          '<button class="del-btn" type="button" data-action="remove-session-exercise" data-id="' + h(entry.exerciseId) + '" ' +
          'aria-label="Übung entfernen" title="Übung entfernen">🗑</button>' +
        '</div>';

      block += '<table class="set-table"><thead><tr><th>Satz</th>' +
        (cardio ? '<th>Minuten</th><th>km</th>' : '<th>' + unit() + '</th><th>Wdh.</th>') +
        '<th></th><th></th></tr></thead><tbody>';

      block += entry.sets.map(function (set, i) {
        var f1 = cardio ? 'minutes' : 'weight';
        var f2 = cardio ? 'km' : 'reps';
        var ph = last && last.sets[i] ? String(last.sets[i][f1] || '') : '';
        var ph2 = last && last.sets[i] ? String(last.sets[i][f2] || '') : '';
        return '<tr class="' + (set.done ? 'set-done' : '') + '">' +
          '<td class="set-num">' + (i + 1) + '</td>' +
          '<td><input type="number" inputmode="decimal" step="0.5" min="0" value="' + h(set[f1] === undefined || set[f1] === null ? '' : set[f1]) +
            '" placeholder="' + h(ph) + '" aria-label="Satz ' + (i + 1) + ' ' + (cardio ? 'Minuten' : 'Gewicht') + '" ' +
            'data-set-input data-ex="' + h(entry.exerciseId) + '" data-idx="' + i + '" data-field="' + f1 + '"></td>' +
          '<td><input type="number" inputmode="decimal" step="' + (cardio ? '0.1' : '1') + '" min="0" value="' + h(set[f2] === undefined || set[f2] === null ? '' : set[f2]) +
            '" placeholder="' + h(ph2) + '" aria-label="Satz ' + (i + 1) + ' ' + (cardio ? 'Kilometer' : 'Wiederholungen') + '" ' +
            'data-set-input data-ex="' + h(entry.exerciseId) + '" data-idx="' + i + '" data-field="' + f2 + '"></td>' +
          '<td><button class="check-btn" type="button" aria-pressed="' + (set.done ? 'true' : 'false') + '" ' +
            'aria-label="Satz ' + (i + 1) + ' abhaken" data-action="toggle-set" data-ex="' + h(entry.exerciseId) + '" data-idx="' + i + '">✓</button></td>' +
          '<td><button class="del-btn" type="button" aria-label="Satz ' + (i + 1) + ' löschen" ' +
            'data-action="remove-set" data-ex="' + h(entry.exerciseId) + '" data-idx="' + i + '">−</button></td>' +
          '</tr>';
      }).join('');

      block += '</tbody></table>' +
        '<button class="btn btn-sm btn-ghost" type="button" style="margin-top:8px" data-action="add-set" data-id="' +
        h(entry.exerciseId) + '">＋ Satz</button>' +
        '</section>';
      return block;
    }).join('');

    out += '<div style="margin-top:14px" class="row wrap">' +
      '<button class="btn grow" type="button" data-action="add-exercise">＋ Übung hinzufügen</button></div>';

    out += '<label class="field" style="margin-top:14px"><span>Notiz zur Einheit</span>' +
      '<textarea rows="3" data-session-note placeholder="Wie lief es? Schmerzen, Energie, Ideen fürs nächste Mal …">' +
      h(session.note || '') + '</textarea></label>';

    return out;
  }

  function viewPlaene() {
    var plans = Store.state.plans;
    var html = '<div class="page-head"><div><h1>Pläne</h1>' +
      '<p>Vorlagen für wiederkehrende Einheiten. Eigene Pläne kannst du frei zusammenstellen.</p></div>' +
      '<button class="btn btn-primary" type="button" data-action="new-plan">Neuer Plan</button></div>';

    html += '<ul class="list">' + plans.map(function (p) {
      return '<li><div class="item"><span class="grow">' +
        '<span class="item-title">' + h(p.name) + '</span>' +
        (p.custom ? ' <span class="pill">eigener</span>' : '') + '<br>' +
        '<span class="item-sub">' + h(p.description || (p.exerciseIds.length + ' Übungen')) + '</span><br>' +
        '<span class="item-sub">' + h(p.exerciseIds.map(function (id) { return Store.exerciseName(id).split(' (')[0]; }).join(' · ')) + '</span>' +
        '</span></div>' +
        '<div class="row" style="margin-top:8px;gap:8px">' +
          '<button class="btn btn-sm btn-primary" type="button" data-action="start-plan" data-id="' + h(p.id) + '">Starten</button>' +
          '<button class="btn btn-sm" type="button" data-action="edit-plan" data-id="' + h(p.id) + '">' + (p.custom ? 'Bearbeiten' : 'Kopieren') + '</button>' +
          (p.custom ? '<button class="btn btn-sm btn-danger" type="button" data-action="delete-plan" data-id="' + h(p.id) + '">Löschen</button>' : '') +
        '</div></li>';
    }).join('') + '</ul>';
    return html;
  }

  function planEditor(plan) {
    var isCopy = plan && !plan.custom;
    var draft = {
      id: plan && plan.custom ? plan.id : null,
      name: plan ? (isCopy ? plan.name + ' (Kopie)' : plan.name) : '',
      description: plan ? plan.description : '',
      exerciseIds: plan ? plan.exerciseIds.slice() : []
    };

    openModal(draft.id ? 'Plan bearbeiten' : 'Neuer Plan',
      '<label class="field"><span>Name</span><input data-name value="' + h(draft.name) + '" placeholder="z. B. Oberkörper Dienstag"></label>' +
      '<label class="field" style="margin-top:12px"><span>Beschreibung (optional)</span>' +
        '<input data-desc value="' + h(draft.description) + '" placeholder="Kurz notiert, wofür der Plan gedacht ist"></label>' +
      '<div class="section-title" style="margin-bottom:8px"><h3>Übungen</h3>' +
        '<button class="btn btn-sm" type="button" data-add>＋ Hinzufügen</button></div>' +
      '<ul class="list" data-plan-list></ul>' +
      '<div class="modal-actions"><button class="btn" type="button" data-cancel>Abbrechen</button>' +
        '<button class="btn btn-primary" type="button" data-save>Speichern</button></div>',
      function (modal) {
        var list = modal.querySelector('[data-plan-list]');

        function renderList() {
          if (!draft.exerciseIds.length) {
            list.innerHTML = '<li class="muted small">Noch keine Übung ausgewählt.</li>';
            return;
          }
          list.innerHTML = draft.exerciseIds.map(function (id, i) {
            return '<li><div class="item">' +
              '<span class="grow truncate">' + h(Store.exerciseName(id)) + '</span>' +
              '<button class="del-btn" type="button" data-up="' + i + '" aria-label="Nach oben" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
              '<button class="del-btn" type="button" data-down="' + i + '" aria-label="Nach unten" ' + (i === draft.exerciseIds.length - 1 ? 'disabled' : '') + '>↓</button>' +
              '<button class="del-btn" type="button" data-rm="' + i + '" aria-label="Entfernen">✕</button>' +
              '</div></li>';
          }).join('');
        }

        renderList();

        list.addEventListener('click', function (ev) {
          var btn = ev.target.closest('button[data-rm], button[data-up], button[data-down]');
          if (!btn) return;
          var i;
          if (btn.hasAttribute('data-rm')) {
            draft.exerciseIds.splice(Number(btn.getAttribute('data-rm')), 1);
          } else if (btn.hasAttribute('data-up')) {
            i = Number(btn.getAttribute('data-up'));
            var tmp = draft.exerciseIds[i - 1];
            draft.exerciseIds[i - 1] = draft.exerciseIds[i];
            draft.exerciseIds[i] = tmp;
          } else {
            i = Number(btn.getAttribute('data-down'));
            var tmp2 = draft.exerciseIds[i + 1];
            draft.exerciseIds[i + 1] = draft.exerciseIds[i];
            draft.exerciseIds[i] = tmp2;
          }
          renderList();
        });

        modal.querySelector('[data-add]').addEventListener('click', function () {
          draft.name = modal.querySelector('[data-name]').value;
          draft.description = modal.querySelector('[data-desc]').value;
          exercisePicker('Übung zum Plan hinzufügen', function (id) {
            draft.exerciseIds.push(id);
            closeModal();
            planEditorReopen(draft);
          }, draft.exerciseIds);
        });

        modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
        modal.querySelector('[data-save]').addEventListener('click', function () {
          var name = modal.querySelector('[data-name]').value.trim();
          if (!name) { toast('Bitte gib dem Plan einen Namen.'); return; }
          if (!draft.exerciseIds.length) { toast('Mindestens eine Übung auswählen.'); return; }
          Store.savePlan({
            id: draft.id,
            name: name,
            description: modal.querySelector('[data-desc]').value.trim(),
            exerciseIds: draft.exerciseIds
          });
          closeModal();
          toast('Plan gespeichert.');
        });
      });
  }

  // Öffnet den Editor mit einem bereits bearbeiteten Entwurf erneut.
  function planEditorReopen(draft) {
    planEditor({ id: draft.id, name: draft.name, description: draft.description, exerciseIds: draft.exerciseIds, custom: true });
  }

  function viewUebungen() {
    var q = uiFilter.search.trim().toLowerCase();
    var items = Store.state.exercises.filter(function (ex) {
      if (uiFilter.muscle !== 'Alle' && ex.muscle !== uiFilter.muscle) return false;
      if (q && (ex.name + ' ' + ex.equipment + ' ' + ex.muscle).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });

    var html = '<div class="page-head"><div><h1>Übungen</h1>' +
      '<p>' + Store.state.exercises.length + ' Übungen im Katalog. Eigene lassen sich ergänzen.</p></div>' +
      '<button class="btn btn-primary" type="button" data-action="new-exercise">Eigene Übung</button></div>';

    html += '<label class="field"><span class="sr-only" style="position:absolute;left:-9999px">Suchen</span>' +
      '<input type="search" data-exercise-search value="' + h(uiFilter.search) + '" placeholder="Übung suchen …" autocomplete="off"></label>';

    html += '<div class="tag-row" style="margin-top:12px" data-muscle-tags>' +
      ['Alle'].concat(FitData.muscles).map(function (m) {
        return '<button class="chip" type="button" data-muscle="' + h(m) + '" aria-pressed="' + (m === uiFilter.muscle) + '">' + h(m) + '</button>';
      }).join('') + '</div>';

    if (!items.length) {
      html += '<div style="margin-top:14px">' + emptyState('🔍', 'Keine Treffer',
        'Andere Suchbegriffe probieren oder eine eigene Übung anlegen.',
        '<button class="btn btn-primary" type="button" data-action="new-exercise">Eigene Übung anlegen</button>') + '</div>';
      return html;
    }

    var records = {};
    Store.personalRecords().forEach(function (pr) { records[pr.exerciseId] = pr; });

    html += '<ul class="list" style="margin-top:14px">' + items.map(function (ex) {
      var pr = records[ex.id];
      return '<li class="row" style="gap:8px">' +
        '<a class="item grow" href="#/fortschritt/' + h(ex.id) + '">' +
        '<span class="grow"><span class="item-title">' + h(ex.name) + '</span>' +
        (ex.custom ? ' <span class="pill">eigene</span>' : '') + '<br>' +
        '<span class="item-sub">' + h(ex.muscle + ' · ' + ex.equipment) +
        (pr ? ' · Bestwert ' + nf(pr.weight, pr.weight % 1 ? 1 : 0) + ' ' + unit() + ' × ' + pr.reps : '') +
        '</span></span><span class="muted" aria-hidden="true">›</span></a>' +
        (ex.custom ? '<button class="del-btn" type="button" data-action="delete-exercise" data-id="' + h(ex.id) +
          '" aria-label="Übung löschen" title="Übung löschen">🗑</button>' : '') +
        '</li>';
    }).join('') + '</ul>';
    return html;
  }

  function viewVerlauf() {
    var list = Store.workoutsSorted();
    var html = '<div class="page-head"><div><h1>Verlauf</h1>' +
      '<p>' + list.length + ' abgeschlossene Einheiten.</p></div></div>';
    if (!list.length) {
      return html + emptyState('🗓', 'Noch nichts aufgezeichnet',
        'Nach der ersten abgeschlossenen Einheit findest du hier jede Übung und jeden Satz wieder.',
        '<a class="btn btn-primary" href="#/training">Training starten</a>');
    }

    var groups = {};
    list.forEach(function (w) {
      var key = new Date(w.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
      (groups[key] = groups[key] || []).push(w);
    });

    Object.keys(groups).forEach(function (key) {
      html += '<div class="section-title"><h2>' + h(key) + '</h2>' +
        '<span class="small muted">' + groups[key].length + ' Einheiten</span></div>' +
        '<ul class="list">' + groups[key].map(workoutRow).join('') + '</ul>';
    });
    return html;
  }

  function viewWorkoutDetail(id) {
    var w = Store.workoutById(id);
    if (!w) return emptyState('❓', 'Einheit nicht gefunden', 'Sie wurde vermutlich gelöscht.',
      '<a class="btn" href="#/verlauf">Zurück zum Verlauf</a>');

    var vol = Store.workoutVolume(w);
    var km = Store.workoutDistance(w);
    var html = '<div class="page-head"><div>' +
      '<a class="small" href="#/verlauf">‹ Verlauf</a>' +
      '<h1 style="margin-top:6px">' + h(w.name) + '</h1>' +
      '<p>' + h(fmtDateLong(w.date)) + ' · ' + h(fmtTime(w.date)) + ' Uhr</p></div>' +
      '<button class="btn btn-danger" type="button" data-action="delete-workout" data-id="' + h(w.id) + '">Löschen</button></div>';

    html += '<div class="stat-grid">' +
      stat(fmtDuration(w.durationSec), 'Dauer') +
      stat(Store.workoutSets(w), 'Sätze') +
      stat(nf(vol) + ' <span class="small muted">' + unit() + '</span>', 'Volumen') +
      stat(km > 0 ? nf(km, 1) + ' <span class="small muted">km</span>' : w.entries.length, km > 0 ? 'Distanz' : 'Übungen') +
      '</div>';

    html += '<div style="margin-top:16px">' + w.entries.map(function (entry) {
      var ex = Store.exerciseById(entry.exerciseId);
      var cardio = ex && ex.type === 'cardio';
      return '<section class="exercise-block">' +
        '<h3>' + h(ex ? ex.name : 'Übung') + '</h3>' +
        '<span class="item-sub">' + h(ex ? ex.muscle + ' · ' + ex.equipment : '') + '</span>' +
        '<div class="table-scroll"><table class="data-table"><thead><tr><th>Satz</th>' +
        (cardio ? '<th>Minuten</th><th>km</th>' : '<th>' + unit() + '</th><th>Wdh.</th><th>Volumen</th>') +
        '</tr></thead><tbody>' +
        entry.sets.map(function (set, i) {
          if (cardio) {
            return '<tr><td>' + (i + 1) + '</td><td class="num">' + nf(set.minutes, 0) + '</td><td class="num">' + nf(set.km, 1) + '</td></tr>';
          }
          var v = (Number(set.weight) || 0) * (Number(set.reps) || 0);
          return '<tr><td>' + (i + 1) + '</td><td class="num">' + nf(set.weight, Number(set.weight) % 1 ? 1 : 0) +
            '</td><td class="num">' + nf(set.reps) + '</td><td class="num">' + nf(v) + '</td></tr>';
        }).join('') +
        '</tbody></table></div></section>';
    }).join('') + '</div>';

    if (w.note) {
      html += '<div class="card" style="margin-top:14px"><h3>Notiz</h3><p class="small" style="margin-top:6px">' + h(w.note) + '</p></div>';
    }
    return html;
  }

  function viewFortschritt(exerciseId) {
    if (exerciseId) return viewExerciseProgress(exerciseId);

    var weeks = [];
    for (var i = 11; i >= 0; i--) {
      var st = Store.weekStats(i);
      weeks.push({
        label: i % 2 === 0 ? (i === 0 ? 'jetzt' : '-' + i) : '',
        value: st.volume,
        highlight: true,
        title: st.count + ' Einheiten · ' + nf(st.volume) + ' ' + unit()
      });
    }

    var bw = Store.state.bodyweights;
    var prs = Store.personalRecords().slice(0, 12);
    var total = Store.state.workouts.reduce(function (acc, w) {
      acc.vol += Store.workoutVolume(w);
      acc.sets += Store.workoutSets(w);
      acc.sec += Number(w.durationSec) || 0;
      return acc;
    }, { vol: 0, sets: 0, sec: 0 });

    var html = '<div class="page-head"><div><h1>Fortschritt</h1>' +
      '<p>Volumen, Körpergewicht und Bestwerte über die Zeit.</p></div></div>';

    html += '<div class="stat-grid">' +
      stat(Store.state.workouts.length, 'Einheiten gesamt') +
      stat(nf(total.vol) + ' <span class="small muted">' + unit() + '</span>', 'Volumen gesamt') +
      stat(total.sets, 'Sätze gesamt') +
      stat(fmtDuration(total.sec), 'Zeit im Training') +
      '</div>';

    html += '<div class="section-title"><h2>Volumen je Woche</h2><span class="small muted">12 Wochen</span></div>' +
      '<div class="card">' + Charts.bars(weeks, { label: 'Volumen je Woche', height: 150 }) + '</div>';

    html += '<div class="section-title"><h2>Körpergewicht</h2>' +
      '<button class="btn btn-sm" type="button" data-action="add-bodyweight">Eintragen</button></div>';
    if (!bw.length) {
      html += emptyState('⚖️', 'Noch kein Körpergewicht erfasst',
        'Ein Wert pro Woche reicht, um den Trend zu sehen.',
        '<button class="btn btn-primary" type="button" data-action="add-bodyweight">Gewicht eintragen</button>');
    } else {
      var points = bw.map(function (b) {
        return { label: new Date(b.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), value: b.kg };
      });
      var diff = bw.length > 1 ? Math.round((bw[bw.length - 1].kg - bw[0].kg) * 10) / 10 : 0;
      html += '<div class="card">' + Charts.line(points, { label: 'Körpergewicht', height: 150 }) +
        '<div class="row-between" style="margin-top:10px">' +
        '<span class="small muted">Aktuell <strong>' + nf(bw[bw.length - 1].kg, 1) + ' kg</strong></span>' +
        '<span class="small muted">Seit Start ' + (diff > 0 ? '+' : '') + nf(diff, 1) + ' kg</span></div></div>';
    }

    html += '<div class="section-title"><h2>Bestwerte</h2><span class="small muted">geschätztes 1RM</span></div>';
    if (!prs.length) {
      html += emptyState('🏅', 'Noch keine Bestwerte',
        'Sobald du Sätze mit Gewicht und Wiederholungen abhakst, entsteht hier deine Bestenliste.', '');
    } else {
      html += '<div class="card table-scroll"><table class="data-table"><thead><tr>' +
        '<th>Übung</th><th>Bester Satz</th><th>1RM</th><th>Datum</th></tr></thead><tbody>' +
        prs.map(function (pr) {
          return '<tr><td><a href="#/fortschritt/' + h(pr.exerciseId) + '">' + h(Store.exerciseName(pr.exerciseId)) + '</a></td>' +
            '<td class="num">' + nf(pr.weight, pr.weight % 1 ? 1 : 0) + ' × ' + nf(pr.reps) + '</td>' +
            '<td class="num">' + nf(pr.oneRm, 1) + ' ' + unit() + '</td>' +
            '<td class="num">' + h(fmtDate(pr.date)) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="small muted" style="margin-top:10px">Schätzung nach Epley: Gewicht × (1 + Wdh. ÷ 30).</p></div>';
    }
    return html;
  }

  function viewExerciseProgress(exerciseId) {
    var ex = Store.exerciseById(exerciseId);
    if (!ex) return emptyState('❓', 'Übung nicht gefunden', 'Sie wurde vermutlich gelöscht.',
      '<a class="btn" href="#/uebungen">Zurück zu den Übungen</a>');

    var points = Store.exerciseProgress(exerciseId);
    var html = '<div class="page-head"><div>' +
      '<a class="small" href="#/uebungen">‹ Übungen</a>' +
      '<h1 style="margin-top:6px">' + h(ex.name) + '</h1>' +
      '<p>' + h(ex.muscle + ' · ' + ex.equipment) + '</p></div></div>';

    if (!points.length) {
      return html + emptyState('📈', 'Noch keine Daten für diese Übung',
        'Nimm sie in dein nächstes Training auf — danach siehst du hier die Entwicklung.',
        '<a class="btn btn-primary" href="#/training">Training starten</a>');
    }

    var best = points.reduce(function (m, p) { return p.oneRm > m.oneRm ? p : m; }, points[0]);
    var first = points[0];
    var last = points[points.length - 1];
    var delta = Math.round((last.oneRm - first.oneRm) * 10) / 10;

    html += '<div class="stat-grid">' +
      stat(nf(last.oneRm, 1) + ' <span class="small muted">' + unit() + '</span>', 'Aktuelles 1RM') +
      stat(nf(best.oneRm, 1) + ' <span class="small muted">' + unit() + '</span>', 'Bestwert') +
      stat((delta >= 0 ? '+' : '') + nf(delta, 1), 'Veränderung') +
      stat(points.length, 'Einheiten') +
      '</div>';

    html += '<div class="section-title"><h2>Entwicklung 1RM</h2></div><div class="card">' +
      Charts.line(points.map(function (p) {
        return { label: new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }), value: p.oneRm };
      }), { label: 'Entwicklung des geschätzten 1RM', height: 150 }) + '</div>';

    html += '<div class="section-title"><h2>Volumen je Einheit</h2></div><div class="card">' +
      Charts.bars(points.slice(-12).map(function (p) {
        return {
          label: new Date(p.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
          value: p.volume, highlight: true, title: nf(p.volume) + ' ' + unit()
        };
      }), { label: 'Volumen je Einheit', height: 140 }) + '</div>';

    return html;
  }

  function viewEinstellungen() {
    var s = Store.state.settings;
    var html = '<div class="page-head"><div><h1>Einstellungen</h1>' +
      '<p>Einheiten, Ziele und deine Daten.</p></div></div>';

    html += '<div class="card"><h2>Training</h2>' +
      '<div class="field-row" style="margin-top:12px">' +
        '<label class="field"><span>Gewichtseinheit</span><select data-setting="unit">' +
          '<option value="kg"' + (s.unit === 'kg' ? ' selected' : '') + '>Kilogramm (kg)</option>' +
          '<option value="lb"' + (s.unit === 'lb' ? ' selected' : '') + '>Pfund (lb)</option>' +
        '</select></label>' +
        '<label class="field"><span>Pausenlänge (Sekunden)</span>' +
          '<input type="number" min="0" max="600" step="15" value="' + h(s.restSeconds) + '" data-setting="restSeconds"></label>' +
        '<label class="field"><span>Wochenziel (Einheiten)</span>' +
          '<input type="number" min="1" max="14" value="' + h(s.weeklyGoal) + '" data-setting="weeklyGoal"></label>' +
      '</div>' +
      '<p class="small muted" style="margin-top:10px">Die Pause startet automatisch, sobald du einen Satz abhakst. 0 schaltet sie ab.</p></div>';

    html += '<div class="card"><h2>Daten</h2>' +
      '<p class="small muted" style="margin-top:6px">Alles liegt nur in diesem Browser (localStorage) — nichts wird hochgeladen. Exportiere regelmäßig, wenn dir die Daten wichtig sind.</p>' +
      '<div class="row wrap" style="margin-top:12px;gap:10px">' +
        '<button class="btn" type="button" data-action="export">Export (JSON)</button>' +
        '<button class="btn" type="button" data-action="import">Import</button>' +
        '<button class="btn" type="button" data-action="demo">Beispieldaten laden</button>' +
        '<button class="btn btn-danger" type="button" data-action="reset">Alles löschen</button>' +
      '</div></div>';

    html += '<div class="card"><h2>Darstellung</h2>' +
      '<div class="tag-row" style="margin-top:12px">' +
        ['auto', 'light', 'dark'].map(function (t) {
          var label = t === 'auto' ? 'System' : (t === 'light' ? 'Hell' : 'Dunkel');
          return '<button class="chip" type="button" data-theme-set="' + t + '" aria-pressed="' + (s.theme === t) + '">' + label + '</button>';
        }).join('') +
      '</div></div>';

    html += '<div class="card"><h2>Über FitTrack</h2>' +
      '<p class="small muted" style="margin-top:6px">Trainingstagebuch ohne Konto, ohne Server, ohne Abhängigkeiten. ' +
      Store.state.exercises.length + ' Übungen, ' + Store.state.plans.length + ' Pläne, ' +
      Store.state.workouts.length + ' aufgezeichnete Einheiten.</p></div>';

    return html;
  }

  /* ---------- Router ---------- */

  var ROUTES = {
    dashboard: viewDashboard,
    training: viewTraining,
    plaene: viewPlaene,
    uebungen: viewUebungen,
    verlauf: viewVerlauf,
    fortschritt: viewFortschritt,
    einstellungen: viewEinstellungen
  };

  function currentRoute() {
    var hash = (global.location.hash || '#/dashboard').replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean);
    var name = parts[0] || 'dashboard';
    if (!ROUTES[name]) name = 'dashboard';
    return { name: name, param: parts[1] || null };
  }

  function render() {
    var route = currentRoute();
    var html;
    if (route.name === 'verlauf' && route.param) html = viewWorkoutDetail(route.param);
    else html = ROUTES[route.name](route.param);
    view.innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('.nav a'), function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === route.name);
    });

    sessionPill.hidden = !Store.state.session;
    applyTheme();
  }

  function navigate(hash) {
    if (global.location.hash === hash) render();
    else global.location.hash = hash;
  }

  /* ---------- Theme ---------- */

  function applyTheme() {
    var t = Store.state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ---------- Timer ---------- */

  function startRest() {
    var sec = Number(Store.state.settings.restSeconds) || 0;
    if (sec <= 0) return;
    restEndsAt = Date.now() + sec * 1000;
  }

  function tick() {
    var session = Store.state.session;
    if (session) {
      var elapsed = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);
      var text = fmtClock(elapsed);
      if (sessionPillTime) sessionPillTime.textContent = text;
      var big = view.querySelector('[data-elapsed]');
      if (big) big.textContent = text;
    }
    if (restEndsAt) {
      var left = (restEndsAt - Date.now()) / 1000;
      var node = view.querySelector('[data-rest]');
      if (left <= 0) {
        restEndsAt = null;
        beep();
        if (currentRoute().name === 'training') render();
        toast('Pause vorbei — nächster Satz.');
      } else if (node) {
        node.textContent = fmtClock(left);
      } else if (currentRoute().name === 'training') {
        render();
      }
    }
  }

  /* ---------- Aktionen ---------- */

  var actions = {
    'start-free': function () {
      if (Store.state.session) {
        confirmModal('Laufendes Training verwerfen?',
          'Es läuft bereits eine Einheit. Ein neues freies Training überschreibt sie.',
          'Verwerfen und starten', function () {
            Store.startSession(null, 'Freies Training');
            navigate('#/training');
          });
        return;
      }
      Store.startSession(null, 'Freies Training');
      navigate('#/training');
    },
    'start-plan': function (el) {
      var id = el.getAttribute('data-id');
      if (Store.state.session) {
        confirmModal('Laufendes Training verwerfen?',
          'Es läuft bereits eine Einheit. Beim Start eines neuen Plans geht sie verloren.',
          'Verwerfen und starten', function () {
            Store.startSession(id);
            navigate('#/training');
          });
        return;
      }
      Store.startSession(id);
      navigate('#/training');
    },
    'discard-session': function () {
      confirmModal('Training verwerfen?', 'Die aufgezeichneten Sätze dieser Einheit werden gelöscht.',
        'Verwerfen', function () {
          Store.discardSession();
          restEndsAt = null;
          navigate('#/training');
        });
    },
    'finish-session': function () {
      var session = Store.state.session;
      if (!session) return;
      var done = session.entries.reduce(function (n, e) {
        return n + e.sets.filter(function (x) { return x.done; }).length;
      }, 0);
      if (!done) {
        toast('Hake mindestens einen Satz ab, um die Einheit zu speichern.');
        return;
      }
      var workout = Store.finishSession();
      restEndsAt = null;
      toast('Einheit gespeichert: ' + Store.workoutSets(workout) + ' Sätze, ' + nf(Store.workoutVolume(workout)) + ' ' + unit() + '.');
      navigate('#/verlauf/' + workout.id);
    },
    'add-exercise': function () {
      var used = Store.state.session ? Store.state.session.entries.map(function (e) { return e.exerciseId; }) : [];
      exercisePicker('Übung hinzufügen', function (id) {
        Store.addSessionExercise(id);
        closeModal();
      }, used);
    },
    'remove-session-exercise': function (el) {
      Store.removeSessionExercise(el.getAttribute('data-id'));
    },
    'add-set': function (el) {
      Store.addSet(el.getAttribute('data-id'));
    },
    'remove-set': function (el) {
      Store.removeSet(el.getAttribute('data-ex'), Number(el.getAttribute('data-idx')));
    },
    'toggle-set': function (el) {
      var nowDone = Store.toggleSet(el.getAttribute('data-ex'), Number(el.getAttribute('data-idx')));
      if (nowDone) startRest();
      if (restEndsAt) render();
    },
    'rest-add': function () {
      if (restEndsAt) restEndsAt += 30000;
      render();
    },
    'rest-stop': function () {
      restEndsAt = null;
      render();
    },
    'new-plan': function () { planEditor(null); },
    'edit-plan': function (el) { planEditor(Store.planById(el.getAttribute('data-id'))); },
    'delete-plan': function (el) {
      var plan = Store.planById(el.getAttribute('data-id'));
      confirmModal('Plan löschen?', '„' + plan.name + '" wird entfernt. Aufgezeichnete Einheiten bleiben erhalten.',
        'Löschen', function () {
          Store.removePlan(plan.id);
          toast('Plan gelöscht.');
        });
    },
    'new-exercise': function () {
      openModal('Eigene Übung',
        '<label class="field"><span>Name</span><input data-ex-name placeholder="z. B. Landmine Press"></label>' +
        '<div class="field-row" style="margin-top:12px">' +
          '<label class="field"><span>Muskelgruppe</span><select data-ex-muscle>' +
            FitData.muscles.map(function (m) { return '<option>' + h(m) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span>Gerät</span><select data-ex-equip>' +
            FitData.equipment.map(function (m) { return '<option>' + h(m) + '</option>'; }).join('') + '</select></label>' +
        '</div>' +
        '<label class="field" style="margin-top:12px"><span>Art</span><select data-ex-type>' +
          '<option value="kraft">Kraft (Gewicht × Wiederholungen)</option>' +
          '<option value="cardio">Ausdauer (Minuten × Kilometer)</option></select></label>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>Abbrechen</button>' +
          '<button class="btn btn-primary" type="button" data-save>Anlegen</button></div>',
        function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
          modal.querySelector('[data-save]').addEventListener('click', function () {
            var name = modal.querySelector('[data-ex-name]').value.trim();
            if (!name) { toast('Bitte einen Namen eingeben.'); return; }
            Store.addExercise({
              name: name,
              muscle: modal.querySelector('[data-ex-muscle]').value,
              equipment: modal.querySelector('[data-ex-equip]').value,
              type: modal.querySelector('[data-ex-type]').value
            });
            closeModal();
            toast('Übung angelegt.');
          });
        });
    },
    'delete-exercise': function (el) {
      var ex = Store.exerciseById(el.getAttribute('data-id'));
      confirmModal('Übung löschen?', '„' + ex.name + '" wird aus dem Katalog und aus allen Plänen entfernt.',
        'Löschen', function () {
          Store.removeExercise(ex.id);
          toast('Übung gelöscht.');
        });
    },
    'delete-workout': function (el) {
      var id = el.getAttribute('data-id');
      confirmModal('Einheit löschen?', 'Diese Aufzeichnung wird endgültig entfernt.', 'Löschen', function () {
        Store.removeWorkout(id);
        navigate('#/verlauf');
        toast('Einheit gelöscht.');
      });
    },
    'add-bodyweight': function () {
      var last = Store.state.bodyweights[Store.state.bodyweights.length - 1];
      openModal('Körpergewicht eintragen',
        '<div class="field-row">' +
          '<label class="field"><span>Gewicht (kg)</span>' +
            '<input type="number" step="0.1" min="20" max="400" data-bw value="' + (last ? h(last.kg) : '') + '"></label>' +
          '<label class="field"><span>Datum</span><input type="date" data-bw-date value="' + Store.todayKey() + '"></label>' +
        '</div>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>Abbrechen</button>' +
          '<button class="btn btn-primary" type="button" data-save>Speichern</button></div>',
        function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
          modal.querySelector('[data-save]').addEventListener('click', function () {
            var kg = Number(modal.querySelector('[data-bw]').value);
            if (!isFinite(kg) || kg <= 0) { toast('Bitte ein gültiges Gewicht eingeben.'); return; }
            Store.addBodyweight(kg, modal.querySelector('[data-bw-date]').value || Store.todayKey());
            closeModal();
            toast('Gewicht gespeichert.');
          });
          modal.querySelector('[data-bw]').focus();
        });
    },
    'export': function () {
      var text = Store.exportJSON();
      openModal('Daten exportieren',
        '<p class="small muted">Kopiere den Text oder lade die Datei herunter — daraus lässt sich alles wiederherstellen.</p>' +
        '<textarea rows="10" data-export style="margin-top:12px;font-family:ui-monospace,monospace;font-size:.8rem">' + h(text) + '</textarea>' +
        '<div class="modal-actions"><button class="btn" type="button" data-copy>Kopieren</button>' +
          '<button class="btn btn-primary" type="button" data-download>Datei speichern</button></div>',
        function (modal) {
          modal.querySelector('[data-copy]').addEventListener('click', function () {
            var ta = modal.querySelector('[data-export]');
            ta.select();
            try { document.execCommand('copy'); toast('In die Zwischenablage kopiert.'); }
            catch (err) { toast('Kopieren nicht möglich — bitte manuell markieren.'); }
          });
          modal.querySelector('[data-download]').addEventListener('click', function () {
            var blob = new Blob([text], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'fittrack-' + Store.todayKey() + '.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          });
        });
    },
    'import': function () {
      openModal('Daten importieren',
        '<p class="small muted">Füge einen früheren Export ein. Achtung: die aktuellen Daten werden ersetzt.</p>' +
        '<textarea rows="8" data-import placeholder="{ &quot;version&quot;: 1, &quot;workouts&quot;: [ … ] }" style="margin-top:12px;font-family:ui-monospace,monospace;font-size:.8rem"></textarea>' +
        '<div class="modal-actions"><button class="btn" type="button" data-cancel>Abbrechen</button>' +
          '<button class="btn btn-primary" type="button" data-save>Importieren</button></div>',
        function (modal) {
          modal.querySelector('[data-cancel]').addEventListener('click', closeModal);
          modal.querySelector('[data-save]').addEventListener('click', function () {
            try {
              Store.importJSON(modal.querySelector('[data-import]').value);
              closeModal();
              navigate('#/dashboard');
              toast('Import erfolgreich.');
            } catch (err) {
              toast('Das war kein gültiger FitTrack-Export.');
            }
          });
        });
    },
    'demo': function () {
      confirmModal('Beispieldaten laden?',
        'Zwölf Wochen Trainingsverlauf werden erzeugt, damit du Auswertungen und Diagramme sehen kannst. Vorhandene Einheiten werden ersetzt.',
        'Laden', function () {
          Store.loadDemoData();
          navigate('#/dashboard');
          toast('Beispieldaten geladen.');
        });
    },
    'reset': function () {
      confirmModal('Wirklich alles löschen?',
        'Einheiten, eigene Übungen, Pläne und Körpergewichte werden entfernt. Das lässt sich nicht rückgängig machen.',
        'Alles löschen', function () {
          Store.resetAll();
          restEndsAt = null;
          navigate('#/dashboard');
          toast('Alle Daten gelöscht.');
        });
    }
  };

  /* ---------- Event-Bindings ---------- */

  document.addEventListener('click', function (ev) {
    var themeBtn = ev.target.closest('#theme-toggle');
    if (themeBtn) {
      var order = ['auto', 'light', 'dark'];
      var next = order[(order.indexOf(Store.state.settings.theme) + 1) % order.length];
      Store.setSetting('theme', next);
      applyTheme();
      toast('Design: ' + (next === 'auto' ? 'System' : next === 'light' ? 'Hell' : 'Dunkel'));
      return;
    }

    var themeSet = ev.target.closest('[data-theme-set]');
    if (themeSet) {
      Store.setSetting('theme', themeSet.getAttribute('data-theme-set'));
      render();
      return;
    }

    var muscleTag = ev.target.closest('[data-muscle]');
    if (muscleTag) {
      uiFilter.muscle = muscleTag.getAttribute('data-muscle');
      render();
      return;
    }

    var actionEl = ev.target.closest('[data-action]');
    if (!actionEl) return;
    var fn = actions[actionEl.getAttribute('data-action')];
    if (!fn) return;
    ev.preventDefault();
    fn(actionEl);
  });

  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.hasAttribute && t.hasAttribute('data-set-input')) {
      Store.updateSet(t.getAttribute('data-ex'), Number(t.getAttribute('data-idx')), t.getAttribute('data-field'), t.value);
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-session-note')) {
      Store.setSessionNote(t.value);
      return;
    }
    if (t.hasAttribute && t.hasAttribute('data-exercise-search')) {
      uiFilter.search = t.value;
      var pos = t.selectionStart;
      render();
      var again = view.querySelector('[data-exercise-search]');
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (err) {} }
      return;
    }
    var setting = t.getAttribute && t.getAttribute('data-setting');
    if (setting) {
      var value = t.type === 'number' ? Number(t.value) : t.value;
      if (t.type === 'number' && !isFinite(value)) return;
      Store.setSetting(setting, value, true);
    }
  });

  global.addEventListener('hashchange', render);
  global.addEventListener('beforeunload', function () {
    if (Store.state.session) Store.save();
  });

  // Jede Zustandsänderung, die emit() auslöst, zeichnet die Ansicht neu.
  Store.subscribe(function () { render(); });

  Store.init();
  applyTheme();
  if (!global.location.hash) global.location.hash = '#/dashboard';
  render();
  global.setInterval(tick, 500);
})(window);
