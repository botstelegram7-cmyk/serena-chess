/*!
 * charts.js — small dependency-free SVG charts for Serena Chess.
 *
 * These render to SVG strings rather than canvas so they stay crisp on every
 * screen density, cost nothing to redraw, and can be asserted against in the
 * test suite without a renderer. No DOM is touched here.
 *
 * Part of Serena Chess by @TechnicalSerena with @XioquiXin — Apache-2.0.
 */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ───────────────────────────────────────────── rating over time ─── */

  /* The archive stores each game's rating delta but not the rating itself, so
     the curve is reconstructed by walking backwards from the current rating.
     archive[0] is the newest game, so the oldest point comes last and the
     series is reversed at the end. */
  function ratingSeries(archive, currentRating) {
    var pts = [];
    var r = typeof currentRating === 'number' ? currentRating : 1200;
    var list = (archive || []).filter(function (a) { return typeof a.delta === 'number'; });
    pts.push({ at: list.length ? list[0].at : Date.now(), r: r });
    for (var i = 0; i < list.length; i++) {
      r = r - (list[i].delta || 0);
      pts.push({ at: list[i].at, r: r });
    }
    return pts.reverse();
  }

  /* An area + line sparkline. Returns '' for fewer than two points so callers
     can fall back to an empty-state message instead of drawing a flat line
     that looks like data. */
  function ratingChart(series, opts) {
    opts = opts || {};
    var w = opts.w || 320, h = opts.h || 110, pad = 8;
    if (!series || series.length < 2) return '';
    var vals = series.map(function (p) { return p.r; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 40) { var mid = (hi + lo) / 2; lo = mid - 20; hi = mid + 20; }
    var sx = (w - pad * 2) / (series.length - 1);
    var sy = (h - pad * 2) / (hi - lo);
    var pt = series.map(function (p, i) {
      return (pad + i * sx).toFixed(1) + ',' + (h - pad - (p.r - lo) * sy).toFixed(1);
    });
    var up = vals[vals.length - 1] >= vals[0];
    var col = up ? '#7bb661' : '#c9544a';
    var id = 'g' + Math.floor(Math.random() * 1e6);
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h +
      '" preserveAspectRatio="none" role="img" aria-label="Rating over time">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + col + '" stop-opacity=".34"/>' +
      '<stop offset="1" stop-color="' + col + '" stop-opacity="0"/></linearGradient></defs>' +
      '<polygon fill="url(#' + id + ')" points="' + pad + ',' + (h - pad) + ' ' +
        pt.join(' ') + ' ' + (w - pad) + ',' + (h - pad) + '"/>' +
      '<polyline fill="none" stroke="' + col + '" stroke-width="2.2" ' +
        'stroke-linejoin="round" stroke-linecap="round" points="' + pt.join(' ') + '"/>' +
      '<circle cx="' + (pad + (series.length - 1) * sx).toFixed(1) + '" cy="' +
        (h - pad - (vals[vals.length - 1] - lo) * sy).toFixed(1) +
        '" r="3.4" fill="' + col + '"/>' +
      '</svg>';
  }

  /* ──────────────────────────────────────────────── opening stats ─── */

  /* Group archived games by the opening actually played. Openings are named
     from the move list by the caller-supplied namer so this module stays
     independent of the opening book. */
  function openingStats(archive, namer, minGames) {
    var by = {};
    (archive || []).forEach(function (a) {
      if (!a.sans || !a.sans.length) return;
      var name = (namer && namer(a.sans, a.myColor)) || 'Other';
      var o = by[name] || (by[name] = { name: name, w: 0, l: 0, d: 0, n: 0 });
      o.n++;
      if (a.score === 1) o.w++; else if (a.score === 0) o.l++; else o.d++;
    });
    var out = [];
    for (var k in by) if (Object.prototype.hasOwnProperty.call(by, k)) {
      var o = by[k];
      o.pct = o.n ? Math.round((o.w + o.d * 0.5) / o.n * 100) : 0;
      out.push(o);
    }
    out = out.filter(function (o) { return o.n >= (minGames || 1); });
    return out.sort(function (a, b) { return b.n - a.n || b.pct - a.pct; });
  }

  /* A win/draw/loss ribbon. Widths are percentages so it scales with the row. */
  function wdlBar(o) {
    var n = o.n || 1;
    var w = o.w / n * 100, d = o.d / n * 100, l = o.l / n * 100;
    return '<span class="wdl" role="img" aria-label="' +
      esc(o.w + ' won, ' + o.d + ' drawn, ' + o.l + ' lost') + '">' +
      '<i style="width:' + w.toFixed(1) + '%" class="wdl-w"></i>' +
      '<i style="width:' + d.toFixed(1) + '%" class="wdl-d"></i>' +
      '<i style="width:' + l.toFixed(1) + '%" class="wdl-l"></i></span>';
  }

  /* A horizontal bar used for puzzle themes. value is 0..100. */
  function meter(value, label) {
    var v = Math.max(0, Math.min(100, value || 0));
    return '<span class="meter" role="img" aria-label="' + esc(label || (v + '%')) +
      '"><i style="width:' + v.toFixed(0) + '%"></i></span>';
  }

  root.ChessCharts = { ratingSeries: ratingSeries, ratingChart: ratingChart,
                       openingStats: openingStats, wdlBar: wdlBar, meter: meter, esc: esc };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessCharts;
})(typeof window !== 'undefined' ? window : globalThis);
