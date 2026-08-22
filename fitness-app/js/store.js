/* FitTrack — Zustand, Persistenz (localStorage) und Auswertungen. */
(function (global) {
  'use strict';

  var KEY = 'fittrack.v1';
  var listeners = [];

  function defaultState() {
    return {
      version: 1,
      settings: { unit: 'kg', theme: 'auto', restSeconds: 90, weeklyGoal: 3 },
      exercises: global.FitData.exercises.map(function (e) { return Object.assign({}, e); }),
      plans: global.FitData.plans.map(function (p) {
        return Object.assign({}, p, { exerciseIds: p.exerciseIds.slice() });
      }),
      workouts: [],
      bodyweights: [],
      session: null
    };
  }

  var state = defaultState();

  /* ---------- Persistenz ---------- */

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (err) { raw = null; }
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (err) { return; }
    if (!parsed || typeof parsed !== 'object') return;
    var base = defaultState();
    state = {
      version: 1,
      settings: Object.assign(base.settings, parsed.settings || {}),
      // Katalog-Übungen kommen aus dem Code, eigene Übungen aus dem Speicher.
      exercises: base.exercises.concat((parsed.exercises || []).filter(function (e) { return e && e.custom; })),
      plans: base.plans.concat((parsed.plans || []).filter(function (p) { return p && p.custom; })),
      workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
      bodyweights: Array.isArray(parsed.bodyweights) ? parsed.bodyweights : [],
      session: parsed.session || null
    };
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify({
        version: 1,
        settings: state.settings,
        exercises: state.exercises.filter(function (e) { return e.custom; }),
        plans: state.plans.filter(function (p) { return p.custom; }),
        workouts: state.workouts,
        bodyweights: state.bodyweights,
        session: state.session
      }));
    } catch (err) {
      /* Privater Modus oder voller Speicher: die App läuft weiter, nur ohne Sicherung. */
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  function commit() { save(); emit(); }

  /* ---------- Hilfsfunktionen ---------- */

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function todayKey(d) {
    var date = d ? new Date(d) : new Date();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + day;
  }

  function startOfWeek(d) {
    var date = new Date(d);
    date.setHours(0, 0, 0, 0);
    var wd = (date.getDay() + 6) % 7; // Montag = 0
    date.setDate(date.getDate() - wd);
    return date;
  }

  function exerciseById(id) {
    for (var i = 0; i < state.exercises.length; i++) {
      if (state.exercises[i].id === id) return state.exercises[i];
    }
    return null;
  }

  function exerciseName(id) {
    var ex = exerciseById(id);
    if (!ex) return 'Unbekannte Übung';
    return ex.name + (ex.equipment && ex.type === 'kraft' ? ' (' + ex.equipment + ')' : '');
  }

  function planById(id) {
    for (var i = 0; i < state.plans.length; i++) {
      if (state.plans[i].id === id) return state.plans[i];
    }
    return null;
  }

  function workoutById(id) {
    for (var i = 0; i < state.workouts.length; i++) {
      if (state.workouts[i].id === id) return state.workouts[i];
    }
    return null;
  }

  /* ---------- Kennzahlen ---------- */

  // Volumen = Summe aus Gewicht x Wiederholungen über alle abgehakten Kraftsätze.
  function workoutVolume(workout) {
    var total = 0;
    (workout.entries || []).forEach(function (entry) {
      (entry.sets || []).forEach(function (set) {
        if (!set.done) return;
        var w = Number(set.weight) || 0;
        var r = Number(set.reps) || 0;
        total += w * r;
      });
    });
    return Math.round(total);
  }

  function workoutSets(workout) {
    var n = 0;
    (workout.entries || []).forEach(function (entry) {
      (entry.sets || []).forEach(function (set) { if (set.done) n++; });
    });
    return n;
  }

  function workoutDistance(workout) {
    var km = 0;
    (workout.entries || []).forEach(function (entry) {
      (entry.sets || []).forEach(function (set) {
        if (set.done) km += Number(set.km) || 0;
      });
    });
    return Math.round(km * 100) / 100;
  }

  function workoutsSorted() {
    return state.workouts.slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  function workoutsInRange(from, to) {
    return state.workouts.filter(function (w) {
      var t = new Date(w.date).getTime();
      return t >= from.getTime() && t < to.getTime();
    });
  }

  function weekStats(offset) {
    var from = startOfWeek(new Date());
    from.setDate(from.getDate() - 7 * (offset || 0));
    var to = new Date(from);
    to.setDate(to.getDate() + 7);
    var list = workoutsInRange(from, to);
    return {
      from: from,
      to: to,
      count: list.length,
      volume: list.reduce(function (s, w) { return s + workoutVolume(w); }, 0),
      sets: list.reduce(function (s, w) { return s + workoutSets(w); }, 0),
      seconds: list.reduce(function (s, w) { return s + (Number(w.durationSec) || 0); }, 0),
      workouts: list
    };
  }

  // Serie = Anzahl aufeinanderfolgender Tage mit Training, rückwärts ab heute
  // (gestern zählt als Start, damit ein noch offener Tag die Serie nicht killt).
  function streak() {
    var days = {};
    state.workouts.forEach(function (w) { days[todayKey(w.date)] = true; });
    var cursor = new Date();
    if (!days[todayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    var n = 0;
    while (days[todayKey(cursor)]) {
      n++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }

  // Epley-Formel: geschätztes Einwiederholungsmaximum.
  function estimate1RM(weight, reps) {
    var w = Number(weight) || 0;
    var r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    return Math.round(w * (1 + r / 30) * 10) / 10;
  }

  function personalRecords() {
    var best = {};
    state.workouts.forEach(function (w) {
      (w.entries || []).forEach(function (entry) {
        (entry.sets || []).forEach(function (set) {
          if (!set.done) return;
          var weight = Number(set.weight) || 0;
          var reps = Number(set.reps) || 0;
          if (weight <= 0 || reps <= 0) return;
          var rm = estimate1RM(weight, reps);
          var current = best[entry.exerciseId];
          if (!current || rm > current.oneRm) {
            best[entry.exerciseId] = {
              exerciseId: entry.exerciseId,
              weight: weight,
              reps: reps,
              oneRm: rm,
              date: w.date
            };
          }
        });
      });
    });
    return Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return b.oneRm - a.oneRm; });
  }

  // Verlauf des geschätzten 1RM für eine Übung, ein Punkt je Trainingstag.
  function exerciseProgress(exerciseId) {
    var points = [];
    workoutsSorted().slice().reverse().forEach(function (w) {
      var best = 0;
      var volume = 0;
      (w.entries || []).forEach(function (entry) {
        if (entry.exerciseId !== exerciseId) return;
        (entry.sets || []).forEach(function (set) {
          if (!set.done) return;
          var rm = estimate1RM(set.weight, set.reps);
          if (rm > best) best = rm;
          volume += (Number(set.weight) || 0) * (Number(set.reps) || 0);
        });
      });
      if (best > 0) points.push({ date: w.date, oneRm: best, volume: Math.round(volume) });
    });
    return points;
  }

  function lastSetsFor(exerciseId) {
    var list = workoutsSorted();
    for (var i = 0; i < list.length; i++) {
      var entries = list[i].entries || [];
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].exerciseId === exerciseId && (entries[j].sets || []).length) {
          return { date: list[i].date, sets: entries[j].sets };
        }
      }
    }
    return null;
  }

  /* ---------- Aktionen ---------- */

  var api = {
    get state() { return state; },
    subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (l) { return l !== fn; }); }; },
    init: function () { load(); emit(); },
    save: commit,
    uid: uid,
    todayKey: todayKey,
    startOfWeek: startOfWeek,

    exerciseById: exerciseById,
    exerciseName: exerciseName,
    planById: planById,
    workoutById: workoutById,
    workoutVolume: workoutVolume,
    workoutSets: workoutSets,
    workoutDistance: workoutDistance,
    workoutsSorted: workoutsSorted,
    weekStats: weekStats,
    streak: streak,
    estimate1RM: estimate1RM,
    personalRecords: personalRecords,
    exerciseProgress: exerciseProgress,
    lastSetsFor: lastSetsFor,

    // quiet = speichern ohne Neu-Rendern, damit der Cursor im Eingabefeld bleibt.
    setSetting: function (key, value, quiet) {
      state.settings[key] = value;
      if (quiet) save(); else commit();
    },

    addExercise: function (data) {
      var ex = {
        id: uid('ex'),
        name: data.name,
        muscle: data.muscle,
        equipment: data.equipment,
        type: data.type === 'cardio' ? 'cardio' : 'kraft',
        custom: true
      };
      state.exercises.push(ex);
      commit();
      return ex;
    },

    removeExercise: function (id) {
      state.exercises = state.exercises.filter(function (e) { return !(e.id === id && e.custom); });
      state.plans.forEach(function (p) {
        p.exerciseIds = p.exerciseIds.filter(function (x) { return x !== id; });
      });
      commit();
    },

    savePlan: function (data) {
      if (data.id) {
        var plan = planById(data.id);
        if (plan) {
          plan.name = data.name;
          plan.description = data.description;
          plan.exerciseIds = data.exerciseIds.slice();
          commit();
          return plan;
        }
      }
      var created = {
        id: uid('plan'),
        name: data.name,
        description: data.description || '',
        exerciseIds: data.exerciseIds.slice(),
        custom: true
      };
      state.plans.push(created);
      commit();
      return created;
    },

    removePlan: function (id) {
      state.plans = state.plans.filter(function (p) { return !(p.id === id && p.custom); });
      commit();
    },

    /* --- laufende Einheit --- */

    startSession: function (planId, name) {
      var plan = planId ? planById(planId) : null;
      var entries = plan ? plan.exerciseIds.map(function (exId) {
        return { exerciseId: exId, sets: [] };
      }) : [];
      state.session = {
        id: uid('w'),
        startedAt: new Date().toISOString(),
        planId: planId || null,
        name: name || (plan ? plan.name : 'Freies Training'),
        entries: entries,
        note: '',
        restUntil: null
      };
      // Vorschlagswerte aus der letzten Einheit übernehmen.
      state.session.entries.forEach(function (entry) {
        var last = lastSetsFor(entry.exerciseId);
        var ex = exerciseById(entry.exerciseId);
        var count = last ? Math.min(last.sets.length, 5) : 3;
        for (var i = 0; i < count; i++) {
          var prev = last ? last.sets[i] : null;
          entry.sets.push(ex && ex.type === 'cardio'
            ? { minutes: prev ? prev.minutes : '', km: prev ? prev.km : '', done: false }
            : { weight: prev ? prev.weight : '', reps: prev ? prev.reps : '', done: false });
        }
      });
      commit();
      return state.session;
    },

    addSessionExercise: function (exerciseId) {
      if (!state.session) return;
      var exists = state.session.entries.some(function (e) { return e.exerciseId === exerciseId; });
      if (exists) return;
      var entry = { exerciseId: exerciseId, sets: [] };
      var last = lastSetsFor(exerciseId);
      var ex = exerciseById(exerciseId);
      var count = last ? Math.min(last.sets.length, 5) : 3;
      for (var i = 0; i < count; i++) {
        var prev = last ? last.sets[i] : null;
        entry.sets.push(ex && ex.type === 'cardio'
          ? { minutes: prev ? prev.minutes : '', km: prev ? prev.km : '', done: false }
          : { weight: prev ? prev.weight : '', reps: prev ? prev.reps : '', done: false });
      }
      state.session.entries.push(entry);
      commit();
    },

    removeSessionExercise: function (exerciseId) {
      if (!state.session) return;
      state.session.entries = state.session.entries.filter(function (e) { return e.exerciseId !== exerciseId; });
      commit();
    },

    addSet: function (exerciseId) {
      if (!state.session) return;
      state.session.entries.forEach(function (entry) {
        if (entry.exerciseId !== exerciseId) return;
        var ex = exerciseById(exerciseId);
        var prev = entry.sets[entry.sets.length - 1];
        entry.sets.push(ex && ex.type === 'cardio'
          ? { minutes: prev ? prev.minutes : '', km: prev ? prev.km : '', done: false }
          : { weight: prev ? prev.weight : '', reps: prev ? prev.reps : '', done: false });
      });
      commit();
    },

    removeSet: function (exerciseId, index) {
      if (!state.session) return;
      state.session.entries.forEach(function (entry) {
        if (entry.exerciseId === exerciseId) entry.sets.splice(index, 1);
      });
      commit();
    },

    updateSet: function (exerciseId, index, field, value) {
      if (!state.session) return;
      state.session.entries.forEach(function (entry) {
        if (entry.exerciseId !== exerciseId) return;
        if (!entry.sets[index]) return;
        entry.sets[index][field] = value;
      });
      save(); // ohne Neu-Rendern, sonst springt der Cursor aus dem Eingabefeld
    },

    toggleSet: function (exerciseId, index) {
      if (!state.session) return false;
      var nowDone = false;
      state.session.entries.forEach(function (entry) {
        if (entry.exerciseId !== exerciseId) return;
        var set = entry.sets[index];
        if (!set) return;
        set.done = !set.done;
        nowDone = set.done;
      });
      commit();
      return nowDone;
    },

    setSessionNote: function (text) {
      if (!state.session) return;
      state.session.note = text;
      save();
    },

    discardSession: function () {
      state.session = null;
      commit();
    },

    finishSession: function () {
      if (!state.session) return null;
      var s = state.session;
      var entries = s.entries
        .map(function (entry) {
          return { exerciseId: entry.exerciseId, sets: entry.sets.filter(function (set) { return set.done; }) };
        })
        .filter(function (entry) { return entry.sets.length > 0; });
      var workout = {
        id: s.id,
        date: new Date().toISOString(),
        startedAt: s.startedAt,
        durationSec: Math.max(0, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000)),
        planId: s.planId,
        name: s.name,
        note: s.note,
        entries: entries
      };
      state.workouts.push(workout);
      state.session = null;
      commit();
      return workout;
    },

    removeWorkout: function (id) {
      state.workouts = state.workouts.filter(function (w) { return w.id !== id; });
      commit();
    },

    addBodyweight: function (kg, dateKey) {
      var key = dateKey || todayKey();
      var value = Math.round(Number(kg) * 10) / 10;
      if (!isFinite(value) || value <= 0) return;
      var existing = state.bodyweights.filter(function (b) { return b.date !== key; });
      existing.push({ date: key, kg: value });
      existing.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      state.bodyweights = existing;
      commit();
    },

    removeBodyweight: function (dateKey) {
      state.bodyweights = state.bodyweights.filter(function (b) { return b.date !== dateKey; });
      commit();
    },

    exportJSON: function () {
      return JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        exercises: state.exercises.filter(function (e) { return e.custom; }),
        plans: state.plans.filter(function (p) { return p.custom; }),
        workouts: state.workouts,
        bodyweights: state.bodyweights
      }, null, 2);
    },

    importJSON: function (text) {
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Ungültiges Format');
      var base = defaultState();
      state.settings = Object.assign(base.settings, parsed.settings || {});
      state.exercises = base.exercises.concat((parsed.exercises || []).filter(function (e) { return e && e.custom; }));
      state.plans = base.plans.concat((parsed.plans || []).filter(function (p) { return p && p.custom; }));
      state.workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
      state.bodyweights = Array.isArray(parsed.bodyweights) ? parsed.bodyweights : [];
      state.session = null;
      commit();
    },

    resetAll: function () {
      state = defaultState();
      commit();
    },

    loadDemoData: function () {
      var demoPlans = ['plan-push', 'plan-pull', 'plan-legs'];
      var basis = { bankdruecken: 60, schraegbank_kh: 22, schulterdruecken_kh: 18, seitheben: 10,
        trizepsdruecken: 25, klimmzuege: 8, langhantelrudern: 55, latzug: 50, 'face-pulls': 20,
        'curls-kh': 14, kniebeuge: 80, rdl: 70, beinpresse: 120, beinbeuger: 40, wadenheben: 60 };
      var workouts = [];
      for (var w = 11; w >= 0; w--) {
        for (var d = 0; d < 3; d++) {
          var date = new Date();
          date.setDate(date.getDate() - (w * 7) - (6 - d * 2));
          date.setHours(18, 15, 0, 0);
          if (date.getTime() > Date.now()) continue;
          var plan = planById(demoPlans[d]);
          if (!plan) continue;
          var progress = 1 + (11 - w) * 0.018; // ~2 % Steigerung pro Woche
          var entries = plan.exerciseIds.map(function (exId) {
            var start = basis[exId] || basis[exId.replace('-', '_')] || 30;
            var weight = Math.round(start * progress / 2.5) * 2.5;
            var sets = [];
            for (var s = 0; s < 3; s++) {
              sets.push({ weight: weight, reps: 10 - s, done: true });
            }
            return { exerciseId: exId, sets: sets };
          });
          workouts.push({
            id: uid('w'),
            date: date.toISOString(),
            startedAt: date.toISOString(),
            durationSec: 3600 + (d * 240),
            planId: plan.id,
            name: plan.name,
            note: '',
            entries: entries
          });
        }
      }
      state.workouts = workouts;
      var bws = [];
      for (var i = 84; i >= 0; i -= 7) {
        var bd = new Date();
        bd.setDate(bd.getDate() - i);
        bws.push({ date: todayKey(bd), kg: Math.round((82 - (84 - i) * 0.045) * 10) / 10 });
      }
      state.bodyweights = bws;
      commit();
    }
  };

  global.Store = api;
})(window);
