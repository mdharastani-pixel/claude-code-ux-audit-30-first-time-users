/* FitTrack — Stammdaten: Übungskatalog und Trainingsplan-Vorlagen. */
(function (global) {
  'use strict';

  // type: 'kraft' braucht Gewicht x Wiederholungen, 'cardio' braucht Minuten x Kilometer.
  var CATALOG = [
    // Brust
    ['bankdruecken', 'Bankdrücken', 'Brust', 'Langhantel'],
    ['schraegbank-kh', 'Schrägbankdrücken', 'Brust', 'Kurzhantel'],
    ['bankdruecken-kh', 'Bankdrücken', 'Brust', 'Kurzhantel'],
    ['butterfly', 'Butterfly', 'Brust', 'Maschine'],
    ['kabel-fliegende', 'Kabelzug-Fliegende', 'Brust', 'Kabel'],
    ['liegestuetze', 'Liegestütze', 'Brust', 'Körpergewicht'],
    ['dips-brust', 'Dips', 'Brust', 'Körpergewicht'],
    // Rücken
    ['klimmzuege', 'Klimmzüge', 'Rücken', 'Körpergewicht'],
    ['latzug', 'Latzug', 'Rücken', 'Kabel'],
    ['langhantelrudern', 'Langhantelrudern', 'Rücken', 'Langhantel'],
    ['kh-rudern', 'Kurzhantelrudern', 'Rücken', 'Kurzhantel'],
    ['kabelrudern', 'Kabelrudern sitzend', 'Rücken', 'Kabel'],
    ['t-bar', 'T-Bar-Rudern', 'Rücken', 'Langhantel'],
    ['kreuzheben', 'Kreuzheben', 'Rücken', 'Langhantel'],
    ['ueberzuege', 'Überzüge', 'Rücken', 'Kabel'],
    ['hyperextension', 'Rückenstrecker', 'Rücken', 'Körpergewicht'],
    // Beine
    ['kniebeuge', 'Kniebeuge', 'Beine', 'Langhantel'],
    ['frontkniebeuge', 'Frontkniebeuge', 'Beine', 'Langhantel'],
    ['beinpresse', 'Beinpresse', 'Beine', 'Maschine'],
    ['ausfallschritte', 'Ausfallschritte', 'Beine', 'Kurzhantel'],
    ['bulgarian', 'Bulgarian Split Squat', 'Beine', 'Kurzhantel'],
    ['rdl', 'Rumänisches Kreuzheben', 'Beine', 'Langhantel'],
    ['beinstrecker', 'Beinstrecker', 'Beine', 'Maschine'],
    ['beinbeuger', 'Beinbeuger', 'Beine', 'Maschine'],
    ['wadenheben', 'Wadenheben', 'Beine', 'Maschine'],
    ['hipthrust', 'Hip Thrust', 'Beine', 'Langhantel'],
    // Schultern
    ['schulterdruecken-lh', 'Schulterdrücken', 'Schultern', 'Langhantel'],
    ['schulterdruecken-kh', 'Schulterdrücken', 'Schultern', 'Kurzhantel'],
    ['seitheben', 'Seitheben', 'Schultern', 'Kurzhantel'],
    ['frontheben', 'Frontheben', 'Schultern', 'Kurzhantel'],
    ['reverse-butterfly', 'Reverse Butterfly', 'Schultern', 'Maschine'],
    ['face-pulls', 'Face Pulls', 'Schultern', 'Kabel'],
    ['upright-row', 'Aufrechtes Rudern', 'Schultern', 'Langhantel'],
    // Arme
    ['curls-lh', 'Bizepscurls', 'Arme', 'Langhantel'],
    ['curls-kh', 'Bizepscurls', 'Arme', 'Kurzhantel'],
    ['hammercurls', 'Hammercurls', 'Arme', 'Kurzhantel'],
    ['scottcurls', 'Scottcurls', 'Arme', 'Maschine'],
    ['trizepsdruecken', 'Trizepsdrücken am Kabel', 'Arme', 'Kabel'],
    ['french-press', 'French Press', 'Arme', 'Langhantel'],
    ['dips-trizeps', 'Dips eng', 'Arme', 'Körpergewicht'],
    ['unterarmcurls', 'Unterarmcurls', 'Arme', 'Kurzhantel'],
    // Rumpf
    ['crunches', 'Crunches', 'Rumpf', 'Körpergewicht'],
    ['beinheben', 'Hängendes Beinheben', 'Rumpf', 'Körpergewicht'],
    ['plank', 'Unterarmstütz', 'Rumpf', 'Körpergewicht'],
    ['seitstuetz', 'Seitstütz', 'Rumpf', 'Körpergewicht'],
    ['russian-twist', 'Russian Twist', 'Rumpf', 'Kurzhantel'],
    ['ab-wheel', 'Ab Wheel', 'Rumpf', 'Körpergewicht'],
    ['kabel-crunch', 'Kabel-Crunch', 'Rumpf', 'Kabel']
  ];

  var CARDIO = [
    ['laufen', 'Laufen', 'Ausdauer', 'Draußen'],
    ['radfahren', 'Radfahren', 'Ausdauer', 'Draußen'],
    ['laufband', 'Laufband', 'Ausdauer', 'Maschine'],
    ['rudergeraet', 'Rudergerät', 'Ausdauer', 'Maschine'],
    ['crosstrainer', 'Crosstrainer', 'Ausdauer', 'Maschine'],
    ['seilspringen', 'Seilspringen', 'Ausdauer', 'Körpergewicht'],
    ['intervalle', 'Intervalltraining', 'Ausdauer', 'Draußen']
  ];

  function toExercise(row, type) {
    return { id: row[0], name: row[1], muscle: row[2], equipment: row[3], type: type, custom: false };
  }

  var EXERCISES = CATALOG.map(function (r) { return toExercise(r, 'kraft'); })
    .concat(CARDIO.map(function (r) { return toExercise(r, 'cardio'); }));

  var MUSCLES = ['Brust', 'Rücken', 'Beine', 'Schultern', 'Arme', 'Rumpf', 'Ausdauer'];
  var EQUIPMENT = ['Langhantel', 'Kurzhantel', 'Maschine', 'Kabel', 'Körpergewicht', 'Draußen'];

  var PLANS = [
    {
      id: 'plan-ganzkoerper',
      name: 'Ganzkörper (Einstieg)',
      description: '2–3× pro Woche, ideal für die ersten Monate.',
      exerciseIds: ['kniebeuge', 'bankdruecken', 'langhantelrudern', 'schulterdruecken-kh', 'plank'],
      custom: false
    },
    {
      id: 'plan-push',
      name: 'Push — Brust, Schultern, Trizeps',
      description: 'Tag 1 des klassischen Push/Pull/Legs-Splits.',
      exerciseIds: ['bankdruecken', 'schraegbank-kh', 'schulterdruecken-kh', 'seitheben', 'trizepsdruecken'],
      custom: false
    },
    {
      id: 'plan-pull',
      name: 'Pull — Rücken und Bizeps',
      description: 'Tag 2 des Push/Pull/Legs-Splits.',
      exerciseIds: ['klimmzuege', 'langhantelrudern', 'latzug', 'face-pulls', 'curls-kh'],
      custom: false
    },
    {
      id: 'plan-legs',
      name: 'Legs — Beine und Gesäß',
      description: 'Tag 3 des Push/Pull/Legs-Splits.',
      exerciseIds: ['kniebeuge', 'rdl', 'beinpresse', 'beinbeuger', 'wadenheben'],
      custom: false
    },
    {
      id: 'plan-oberkoerper',
      name: 'Oberkörper',
      description: 'Für den 4-Tage-Split Oberkörper/Unterkörper.',
      exerciseIds: ['bankdruecken', 'kh-rudern', 'schulterdruecken-lh', 'latzug', 'curls-lh', 'trizepsdruecken'],
      custom: false
    },
    {
      id: 'plan-unterkoerper',
      name: 'Unterkörper',
      description: 'Für den 4-Tage-Split Oberkörper/Unterkörper.',
      exerciseIds: ['kniebeuge', 'hipthrust', 'ausfallschritte', 'beinstrecker', 'wadenheben', 'beinheben'],
      custom: false
    },
    {
      id: 'plan-cardio',
      name: 'Ausdauer und Rumpf',
      description: 'Lockere Einheit zwischen den Krafttagen.',
      exerciseIds: ['laufen', 'seilspringen', 'plank', 'crunches', 'seitstuetz'],
      custom: false
    }
  ];

  global.FitData = {
    exercises: EXERCISES,
    plans: PLANS,
    muscles: MUSCLES,
    equipment: EQUIPMENT
  };
})(window);
