/* =========================================================================
   openings.js — a small opening book, tagged by playing style.
   Each line is a list of SAN moves. A bot follows a line while the game so
   far matches its prefix, which stops every game starting identically and
   makes each personality open the way its character would.
   ========================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------------------------------- the lines --- */
  var LINES = {
    /* ---- sharp, sacrificial, attacking ---- */
    gambit: [
      ['e4','e5','f4','exf4','Nf3','g5','h4'],                  // King's Gambit
      ['e4','e5','Nf3','Nc6','Bc4','Bc5','b4'],                 // Evans Gambit
      ['e4','c5','d4','cxd4','c3','dxc3','Nxc3'],               // Smith-Morra
      ['d4','d5','e4','dxe4','Nc3'],                            // Blackmar-Diemer
      ['e4','e5','Nf3','Nc6','Bc4','Nf6','Ng5','d5','exd5','Na5'],
      ['e4','d5','exd5','Qxd5','Nc3','Qa5','d4','Nf6','Nf3']
    ],
    /* ---- classical attacking but sound ---- */
    attack: [
      ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O'],     // Ruy Lopez
      ['e4','c5','Nf3','d6','d4','cxd4','Nxd4','Nf6','Nc3'],    // Open Sicilian
      ['e4','e6','d4','d5','Nc3','Bb4','e5'],                   // French Winawer
      ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6','f3'],        // Sämisch KID
      ['e4','c5','Nc3','Nc6','f4','g6','Nf3','Bg7']             // Grand Prix
    ],
    /* ---- positional, slow squeeze ---- */
    positional: [
      ['d4','d5','c4','e6','Nc3','Nf6','Bg5','Be7','e3'],       // QGD
      ['d4','Nf6','c4','e6','g3','d5','Bg2','Be7','Nf3'],       // Catalan
      ['c4','e5','Nc3','Nf6','Nf3','Nc6','g3','d5'],            // English
      ['Nf3','d5','g3','Nf6','Bg2','e6','O-O','Be7','d3'],      // Réti
      ['d4','d5','c4','c6','Nf3','Nf6','Nc3','dxc4','a4'],      // Slav
      ['e4','e5','Nf3','Nc6','Bb5','a6','Bxc6','dxc6','O-O']    // Exchange Ruy
    ],
    /* ---- solid, defensive, hard to crack ---- */
    solid: [
      ['e4','c6','d4','d5','Nc3','dxe4','Nxe4','Bf5'],          // Caro-Kann
      ['e4','e6','d4','d5','Nd2','Nf6','e5','Nfd7'],            // French Tarrasch
      ['d4','d5','c4','e6','Nc3','c6','Nf3','Nf6','e3'],        // Semi-Slav
      ['e4','e5','Nf3','Nc6','Bc4','Bc5','c3','Nf6','d3'],      // Giuoco Pianissimo
      ['d4','Nf6','c4','e6','Nf3','b6','g3','Ba6'],             // Queen's Indian
      ['e4','e5','Nf3','d6','d4','exd4','Nxd4','Nf6','Nc3']     // Philidor
    ],
    /* ---- hypermodern, unbalancing ---- */
    hyper: [
      ['d4','Nf6','c4','e6','Nc3','Bb4','e3','O-O','Bd3'],      // Nimzo-Indian
      ['d4','Nf6','c4','g6','Nc3','Bg7','e4','d6','Nf3','O-O'], // King's Indian
      ['d4','Nf6','c4','c5','d5','b5'],                         // Benko
      ['e4','g6','d4','Bg7','Nc3','d6','f4'],                   // Modern
      ['e4','Nf6','e5','Nd5','d4','d6','Nf3'],                  // Alekhine
      ['c4','g6','Nc3','Bg7','g3','c5','Bg2','Nc6']             // Symmetrical English
    ],
    /* ---- tricky and offbeat ---- */
    tricky: [
      ['e4','e5','Nf3','Nc6','Bc4','Nd4'],                      // Blackburne Shilling
      ['e4','c5','b4'],                                         // Wing Gambit
      ['d4','e6','c4','b6'],                                    // English Defence
      ['e4','b6','d4','Bb7','Bd3','e6'],                        // Owen
      ['Nf3','Nf6','c4','b6','g3','Bb7','Bg2','e6'],
      ['e4','e5','Nc3','Nf6','f4']                              // Vienna Gambit
    ]
  };

  /* every line flattened, so a bot can fall back to anything reasonable */
  var ALL = [];
  for (var k in LINES) ALL = ALL.concat(LINES[k]);

  /**
   * Next book move for a bot.
   * @param history array of SAN strings played so far
   * @param styles  array of style keys this bot likes, best first
   * @returns SAN string or null
   */
  function next(history, styles) {
    var pools = [];
    for (var i = 0; i < (styles || []).length; i++) {
      if (LINES[styles[i]]) pools.push(LINES[styles[i]]);
    }
    if (!pools.length) pools.push(ALL);

    for (var p = 0; p < pools.length; p++) {
      var candidates = [];
      var pool = pools[p];
      for (var l = 0; l < pool.length; l++) {
        var line = pool[l];
        if (line.length <= history.length) continue;
        var match = true;
        for (var m = 0; m < history.length; m++) {
          if (line[m] !== history[m]) { match = false; break; }
        }
        if (match) candidates.push(line[history.length]);
      }
      if (candidates.length) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return null;
  }

  function lineName(styleKey) {
    return { gambit:'Gambiteer', attack:'Attacking', positional:'Positional',
             solid:'Solid', hyper:'Hypermodern', tricky:'Offbeat' }[styleKey] || 'Mixed';
  }

  var API = { LINES: LINES, next: next, lineName: lineName };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessOpenings = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
