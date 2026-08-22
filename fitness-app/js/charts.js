/* FitTrack — kleine SVG-Diagramme ohne Bibliothek. */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function svgOpen(w, h, label) {
    return '<svg class="chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label) + '">';
  }

  /**
   * Balkendiagramm. points: [{label, value, highlight}]
   */
  function chartWidth() {
    try { return global.matchMedia('(min-width: 860px)').matches ? 660 : 320; }
    catch (err) { return 320; }
  }

  function bars(points, opts) {
    opts = opts || {};
    var w = chartWidth(), h = opts.height || 130;
    var padL = 6, padR = 6, padB = 18, padT = 6;
    var max = points.length ? Math.max.apply(null, points.map(function (p) { return p.value; })) : 0;
    // Ohne Werte lieber einen ehrlichen Hinweis als ein leeres Diagrammfeld.
    if (!points.length || max <= 0) {
      return '<p class="muted small">' + esc(opts.emptyText || 'Noch keine Daten — nach der ersten Einheit erscheint hier dein Verlauf.') + '</p>';
    }
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var slot = innerW / points.length;
    var barW = Math.max(4, Math.min(slot * 0.62, 34));
    var out = svgOpen(w, h, opts.label || 'Balkendiagramm');
    points.forEach(function (p, i) {
      var barH = Math.max(p.value > 0 ? 2 : 0, (p.value / max) * innerH);
      var x = padL + slot * i + (slot - barW) / 2;
      var y = padT + innerH - barH;
      out += '<rect class="' + (p.highlight ? 'chart-bar' : 'chart-bar-dim') + '" x="' + x.toFixed(1) +
        '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" rx="3"><title>' +
        esc(p.title || (p.label + ': ' + p.value)) + '</title></rect>';
      if (p.label) {
        out += '<text class="chart-label" x="' + (padL + slot * i + slot / 2).toFixed(1) + '" y="' + (h - 5) +
          '" text-anchor="middle">' + esc(p.label) + '</text>';
      }
    });
    return out + '</svg>';
  }

  /**
   * Liniendiagramm mit Fläche. points: [{label, value}]
   */
  function line(points, opts) {
    opts = opts || {};
    var w = chartWidth(), h = opts.height || 140;
    var padL = 6, padR = 6, padB = 18, padT = 10;
    if (points.length === 0) return '<p class="muted small">Noch keine Daten.</p>';
    if (points.length === 1) {
      points = [{ label: points[0].label, value: points[0].value }, points[0]];
    }
    var values = points.map(function (p) { return p.value; });
    var max = Math.max.apply(null, values);
    var min = Math.min.apply(null, values);
    if (max === min) { max = max + 1; min = min - 1; }
    var innerW = w - padL - padR;
    var innerH = h - padT - padB;
    var coords = points.map(function (p, i) {
      var x = padL + (points.length === 1 ? innerW / 2 : (innerW * i) / (points.length - 1));
      var y = padT + innerH - ((p.value - min) / (max - min)) * innerH;
      return [x, y];
    });
    var d = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
    var area = d + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (padT + innerH) +
      ' L' + coords[0][0].toFixed(1) + ' ' + (padT + innerH) + ' Z';
    var out = svgOpen(w, h, opts.label || 'Liniendiagramm');
    out += '<path class="chart-area" d="' + area + '"/>';
    out += '<path class="chart-line" d="' + d + '"/>';
    coords.forEach(function (c, i) {
      if (points.length > 24 && i % 2) return;
      out += '<circle class="chart-dot" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="2.6"><title>' +
        esc(points[i].label + ': ' + points[i].value) + '</title></circle>';
    });
    var first = points[0], last = points[points.length - 1];
    out += '<text class="chart-label" x="' + padL + '" y="' + (h - 4) + '">' + esc(first.label) + '</text>';
    out += '<text class="chart-label" x="' + (w - padR) + '" y="' + (h - 4) + '" text-anchor="end">' + esc(last.label) + '</text>';
    return out + '</svg>';
  }

  global.Charts = { bars: bars, line: line, esc: esc };
})(window);
