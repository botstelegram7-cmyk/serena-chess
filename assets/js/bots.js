/* =========================================================================
   bots.js — the bot roster (32 opponents, 250 → 3200)
   Characters are affectionate nods to popular series; the artwork is
   original stylised illustration, not a likeness of any actor.
   ------------------------------------------------------------------------
   depth   : nominal search depth (ply)      blunder : chance of a bad move
   timeMs  : hard thinking budget            spread  : cp window for randomness
   contempt: >0 = happier to trade down      book    : opening repertoire keys
   tactic  : human-readable description of how this bot plays

   style   : weights fed straight into the evaluation function, so each bot
             genuinely wants different things on the board.
               material   how much raw piece value is worth (<1 = will sacrifice)
               kingAttack value of piling pieces around the enemy king
               centre     value of occupying the centre
               pawns      weight of doubled / isolated pawn penalties
               passers    value of passed pawns
               rooks      value of rooks on open and half-open files
               bishops    value of the bishop pair
               safety     value of its own king's pawn shield
               aggression root bonus for checks and moves toward your king
               trade      >0 seeks exchanges, <0 keeps the pieces on
   ========================================================================= */
(function (root) {
  'use strict';

  var BOTS = [
    { id: 'denver', name: 'Denver', elo: 250, avatar: 'avatars/denver.jpg',
      title: 'The Wild Card', country: 'ES', series: 'Money Heist',
      blurb: 'Laughs first, thinks later. Denver throws pieces at you and hopes something sticks.',
      tactic: 'Swings first, counts the pieces later',
      book: ['gambit', 'attack'],
      style: { material:0.95, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.50, aggression:0.90, trade:0.30 },
      depth: 1, timeMs: 180, blunder: 0.58, spread: 480, contempt: 0 },

    { id: 'jesse', name: 'Jesse', elo: 400, avatar: 'avatars/jesse.jpg',
      title: 'The Apprentice', country: 'US', series: 'Breaking Bad',
      blurb: 'Knows the rules, forgets the plan. Jesse means well and hangs his queen anyway.',
      tactic: 'Chases cheap tricks and hopes they land',
      book: ['attack'],
      style: { material:1.00, kingAttack:1.20, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.60, aggression:0.60, trade:0.00 },
      depth: 1, timeMs: 220, blunder: 0.45, spread: 380, contempt: 0 },

    { id: 'gihun', name: 'Gi-hun', elo: 550, avatar: 'avatars/gihun.jpg',
      title: 'Player 456', country: 'KR', series: 'Squid Game',
      blurb: 'Desperate, lucky and strangely hard to finish off. He survives more than he wins.',
      tactic: 'Hangs on, trades down, survives',
      book: ['solid'],
      style: { material:1.05, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.40, aggression:0.10, trade:0.50 },
      depth: 1, timeMs: 280, blunder: 0.36, spread: 300, contempt: 0 },

    { id: 'rio', name: 'Rio', elo: 700, avatar: 'avatars/rio.jpg',
      title: 'The Hacker', country: 'ES', series: 'Money Heist',
      blurb: 'Clever with patterns but rattles under pressure. Push him and he cracks.',
      tactic: 'Neat setups, shaky once you push',
      book: ['positional'],
      style: { material:1.00, kingAttack:1.00, centre:1.20, pawns:1.10, passers:1.00, rooks:1.00, bishops:1.00, safety:0.90, aggression:0.25, trade:0.00 },
      depth: 2, timeMs: 320, blunder: 0.3, spread: 250, contempt: 0 },

    { id: 'helsinki', name: 'Helsinki', elo: 850, avatar: 'avatars/helsinki.jpg',
      title: 'The Muscle', country: 'RS', series: 'Money Heist',
      blurb: 'Immovable. Helsinki will not do anything clever, but he will not fall over either.',
      tactic: 'Builds a wall of pawns and dares you',
      book: ['solid'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.00, rooks:1.00, bishops:1.00, safety:1.60, aggression:0.00, trade:0.50 },
      depth: 2, timeMs: 400, blunder: 0.24, spread: 200, contempt: 6 },

    { id: 'eleven', name: 'Eleven', elo: 1000, avatar: 'avatars/eleven.jpg',
      title: 'The Prodigy', country: 'US', series: 'Stranger Things',
      blurb: 'Sees things other people don\'t. Flashes of brilliance between quiet moves.',
      tactic: 'Quiet, quiet, then a sudden strike',
      book: ['attack', 'tricky'],
      style: { material:1.00, kingAttack:1.40, centre:1.00, pawns:0.80, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.70, trade:0.00 },
      depth: 2, timeMs: 500, blunder: 0.19, spread: 165, contempt: 0 },

    { id: 'lucifer', name: 'Lucifer', elo: 1150, avatar: 'avatars/lucifer.jpg',
      title: 'The Charmer', country: 'GB', series: 'Lucifer',
      blurb: 'Enjoys this far too much. Offers you gifts you will very much regret taking.',
      tactic: 'Offers you pawns you really should not take',
      book: ['gambit'],
      style: { material:0.90, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.60, aggression:1.10, trade:-0.30 },
      depth: 3, timeMs: 600, blunder: 0.15, spread: 135, contempt: -8 },

    { id: 'nairobi', name: 'Nairobi', elo: 1300, avatar: 'avatars/nairobi.jpg',
      title: 'The Forger', country: 'ES', series: 'Money Heist',
      blurb: 'Takes charge the moment things go wrong. Sharp, fast and fearless.',
      tactic: 'Grabs the initiative and never gives it back',
      book: ['gambit', 'attack'],
      style: { material:1.00, kingAttack:1.35, centre:1.20, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.90, trade:-0.20 },
      depth: 3, timeMs: 700, blunder: 0.12, spread: 110, contempt: -4 },

    { id: 'geralt', name: 'Geralt', elo: 1450, avatar: 'avatars/geralt.jpg',
      title: 'The Witcher', country: 'PL', series: 'The Witcher',
      blurb: 'Patient, scarred and efficient. He waits for the mistake, then ends it.',
      tactic: 'Absorbs the attack, then counters hard',
      book: ['solid', 'positional'],
      style: { material:1.05, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.20, rooks:1.00, bishops:1.00, safety:1.30, aggression:0.15, trade:0.40 },
      depth: 3, timeMs: 850, blunder: 0.095, spread: 90, contempt: 6 },

    { id: 'ortega', name: 'Ortega', elo: 1600, avatar: 'avatars/ortega.jpg',
      title: 'The Detective', country: 'US', series: 'Altered Carbon',
      blurb: 'Reads the board like a crime scene. Nothing loose escapes her notice.',
      tactic: 'Stacks relentless pressure down open files',
      book: ['attack'],
      style: { material:1.00, kingAttack:1.40, centre:1.00, pawns:1.00, passers:1.00, rooks:1.40, bishops:1.00, safety:1.00, aggression:0.70, trade:0.00 },
      depth: 4, timeMs: 1000, blunder: 0.075, spread: 72, contempt: 4 },

    { id: 'tokyo', name: 'Tokyo', elo: 1700, avatar: 'avatars/tokyo.jpg',
      title: 'The Narrator', country: 'ES', series: 'Money Heist',
      blurb: 'All instinct and fire. Tokyo would rather lose spectacularly than draw quietly.',
      tactic: 'All-out assault on your king, cost ignored',
      book: ['gambit', 'attack'],
      style: { material:0.92, kingAttack:1.80, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.50, aggression:1.30, trade:-0.40 },
      depth: 4, timeMs: 1150, blunder: 0.06, spread: 58, contempt: -12 },

    { id: 'villanelle', name: 'Villanelle', elo: 1800, avatar: 'avatars/villanelle.jpg',
      title: 'The Assassin', country: 'RU', series: 'Killing Eve',
      blurb: 'Playful right up until the knife. She finds tactics you didn\'t know existed.',
      tactic: 'Elegant, sudden and completely lethal',
      book: ['tricky', 'attack'],
      style: { material:1.00, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.30, safety:0.70, aggression:1.00, trade:-0.20 },
      depth: 4, timeMs: 1300, blunder: 0.05, spread: 46, contempt: -6 },

    { id: 'harvey', name: 'Harvey', elo: 1900, avatar: 'avatars/harvey.jpg',
      title: 'The Closer', country: 'US', series: 'Suits',
      blurb: 'Never loses, allegedly. Harvey converts a half-pawn edge into a signed confession.',
      tactic: 'Wins a small edge, then grinds you flat',
      book: ['positional'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.00, rooks:1.40, bishops:1.00, safety:1.00, aggression:0.10, trade:0.60 },
      depth: 4, timeMs: 1500, blunder: 0.04, spread: 38, contempt: 10 },

    { id: 'berlin', name: 'Berlin', elo: 2000, avatar: 'avatars/berlin.jpg',
      title: 'The Aristocrat', country: 'ES', series: 'Money Heist',
      blurb: 'Elegant, cruel and completely unbothered. He has already decided how this ends.',
      tactic: 'Cold central control, surgical execution',
      book: ['positional', 'solid'],
      style: { material:1.00, kingAttack:1.00, centre:1.25, pawns:1.20, passers:1.00, rooks:1.00, bishops:1.25, safety:1.20, aggression:0.00, trade:0.30 },
      depth: 5, timeMs: 1700, blunder: 0.03, spread: 30, contempt: 8 },

    { id: 'poe', name: 'Poe', elo: 2100, avatar: 'avatars/poe.jpg',
      title: 'The AI Host', country: '🏨', series: 'Altered Carbon',
      blurb: 'Impeccably polite while calculating your demise. Apologises for every capture.',
      tactic: 'Pure calculation, zero stylistic bias',
      book: ['positional', 'solid'],
      style: { material:1.00, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.20, trade:0.20 },
      depth: 5, timeMs: 1900, blunder: 0.024, spread: 24, contempt: 10 },

    { id: 'mikasa', name: 'Mikasa', elo: 2150, avatar: 'avatars/mikasa.jpg',
      title: 'The Blade', country: 'JP', series: 'Attack on Titan',
      blurb: 'Silent, fast and utterly committed. Mikasa finds the shortest line to your king and takes it.',
      tactic: 'Direct strikes, no hesitation, no wasted move',
      book: ['attack'],
      style: { material:1.00, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.10, aggression:1.00, trade:0.00 },
      depth: 5, timeMs: 1950, blunder: 0.02, spread: 20, contempt: 2 },

    { id: 'scofield', name: 'Scofield', elo: 2200, avatar: 'avatars/scofield.jpg',
      title: 'The Architect', country: 'US', series: 'Prison Break',
      blurb: 'Every move is step nine of a plan he drew months ago. Good luck improvising.',
      tactic: 'Plans the pawn structure ten moves out',
      book: ['positional'],
      style: { material:1.00, kingAttack:1.00, centre:1.15, pawns:1.40, passers:1.40, rooks:1.30, bishops:1.00, safety:1.00, aggression:0.00, trade:0.40 },
      depth: 5, timeMs: 2100, blunder: 0.018, spread: 18, contempt: 8 },

    { id: 'tommy', name: 'Tommy', elo: 2250, avatar: 'avatars/tommy.jpg',
      title: 'The Boss', country: 'GB', series: 'Peaky Blinders',
      blurb: 'Everything is business. Tommy has already decided how this game ends and is just walking you there.',
      tactic: 'Always three moves ahead of your plan',
      book: ['positional', 'tricky'],
      style: { material:1.00, kingAttack:1.00, centre:1.20, pawns:1.20, passers:1.00, rooks:1.30, bishops:1.00, safety:1.00, aggression:0.40, trade:0.40 },
      depth: 5, timeMs: 2200, blunder: 0.016, spread: 16, contempt: 10 },

    { id: 'kovacs', name: 'Kovacs', elo: 2350, avatar: 'avatars/kovacs.jpg',
      title: 'The Envoy', country: '🌐', series: 'Altered Carbon',
      blurb: 'Trained to win in any body, on any board. Adapts faster than you can plan.',
      tactic: 'Reads your setup, adapts, then breaks it',
      book: ['attack', 'hyper'],
      style: { material:1.02, kingAttack:1.45, centre:1.00, pawns:1.00, passers:1.00, rooks:1.20, bishops:1.00, safety:1.00, aggression:0.80, trade:0.00 },
      depth: 5, timeMs: 2400, blunder: 0.012, spread: 12, contempt: 10 },

    { id: 'gus', name: 'Gus', elo: 2400, avatar: 'avatars/gus.jpg',
      title: 'The Proprietor', country: 'CL', series: 'Breaking Bad',
      blurb: 'Impeccably polite, impossibly patient. Gus will wait twenty moves for the cut he planned on move four.',
      tactic: 'Immaculate patience, then one clean cut',
      book: ['solid', 'positional'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.35, passers:1.00, rooks:1.25, bishops:1.00, safety:1.40, aggression:0.05, trade:0.60 },
      depth: 5, timeMs: 2500, blunder: 0.01, spread: 10, contempt: 12 },

    { id: 'heisenberg', name: 'Heisenberg', elo: 2500, avatar: 'avatars/heisenberg.jpg',
      title: 'The Chemist', country: 'US', series: 'Breaking Bad',
      blurb: 'Pure, methodical and 99.1% lethal. He is not in danger. He is the danger.',
      tactic: 'Trade, convert, destroy. Methodically.',
      book: ['positional', 'solid'],
      style: { material:1.10, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.50, rooks:1.30, bishops:1.00, safety:1.00, aggression:0.15, trade:0.70 },
      depth: 6, timeMs: 2800, blunder: 0.006, spread: 7, contempt: 12 },

    { id: 'levi', name: 'Levi', elo: 2550, avatar: 'avatars/levi.jpg',
      title: 'Humanity’s Strongest', country: 'JP', series: 'Attack on Titan',
      blurb: 'Short, blunt and devastatingly quick. Give Levi one tactical shot and the game is already over.',
      tactic: 'Blinding tactical speed in sharp positions',
      book: ['attack', 'hyper'],
      style: { material:0.98, kingAttack:1.60, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.90, aggression:1.20, trade:-0.20 },
      depth: 6, timeMs: 2700, blunder: 0.007, spread: 8, contempt: 0 },

    { id: 'elliot', name: 'Elliot', elo: 2600, avatar: 'avatars/elliot.jpg',
      title: 'The Hacker', country: 'US', series: 'Mr. Robot',
      blurb: 'He does not play your position, he audits it. Elliot goes straight for the weakness you did not know you had.',
      tactic: 'Finds the one exploit in your position',
      book: ['tricky', 'hyper'],
      style: { material:1.00, kingAttack:1.30, centre:1.00, pawns:1.00, passers:1.00, rooks:1.35, bishops:1.20, safety:1.00, aggression:0.60, trade:0.00 },
      depth: 6, timeMs: 2900, blunder: 0.005, spread: 6, contempt: 4 },

    { id: 'frontman', name: 'Front Man', elo: 2650, avatar: 'avatars/frontman.jpg',
      title: 'The Overseer', country: 'KR', series: 'Squid Game',
      blurb: 'Silent, masked, absolute. He has watched a thousand players fail exactly like this.',
      tactic: 'Gives you nothing, takes everything slowly',
      book: ['solid', 'positional'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.30, rooks:1.30, bishops:1.00, safety:1.35, aggression:0.00, trade:0.60 },
      depth: 6, timeMs: 3200, blunder: 0.002, spread: 3, contempt: 14 },

    { id: 'dolores', name: 'Dolores', elo: 2700, avatar: 'avatars/dolores.jpg',
      title: 'The Awakened', country: 'US', series: 'Westworld',
      blurb: 'She has played this game ten thousand times. This is the iteration where she stops losing it.',
      tactic: 'Learns your loop, then breaks out of it',
      book: ['attack', 'positional'],
      style: { material:1.04, kingAttack:1.40, centre:1.00, pawns:1.00, passers:1.40, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.70, trade:0.00 },
      depth: 6, timeMs: 3100, blunder: 0.003, spread: 4, contempt: 8 },

    { id: 'professor', name: 'The Professor', elo: 2800, avatar: 'avatars/professor.jpg',
      title: 'The Mastermind', country: 'ES', series: 'Money Heist',
      blurb: 'He planned for this position. He planned for every position. The strongest bot here.',
      tactic: 'Every line already prepared in advance',
      book: ['gambit', 'attack', 'positional', 'solid', 'hyper', 'tricky'],
      style: { material:1.00, kingAttack:1.15, centre:1.20, pawns:1.20, passers:1.30, rooks:1.25, bishops:1.00, safety:1.00, aggression:0.00, trade:0.30 },
      depth: 7, timeMs: 3800, blunder: 0, spread: 0, contempt: 14 },

    { id: 'tywin', name: 'Tywin', elo: 2850, avatar: 'avatars/tywin.jpg',
      title: 'The Lion', country: 'GB', series: 'Game of Thrones',
      blurb: 'Never gambles, never bluffs, never forgives a weak square. Tywin simply brings more force than you can answer.',
      tactic: 'Overwhelming force applied without risk',
      book: ['positional', 'solid'],
      style: { material:1.12, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.00, rooks:1.45, bishops:1.00, safety:1.20, aggression:0.20, trade:0.70 },
      depth: 7, timeMs: 3600, blunder: 0.0015, spread: 2, contempt: 16 },

    { id: 'pablo', name: 'Pablo', elo: 2900, avatar: 'avatars/pablo.jpg',
      title: 'El Patrón', country: 'CO', series: 'Narcos',
      blurb: 'Offers you a deal you cannot accept, then takes the board by force. Pablo does not negotiate twice.',
      tactic: 'Pay the material or get crushed outright',
      book: ['attack', 'gambit'],
      style: { material:1.06, kingAttack:1.55, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:1.10, trade:0.30 },
      depth: 7, timeMs: 3800, blunder: 0.001, spread: 2, contempt: 10 },

    { id: 'sherlock', name: 'Sherlock', elo: 2950, avatar: 'avatars/sherlock.jpg',
      title: 'The Detective', country: 'GB', series: 'Sherlock',
      blurb: 'Reads your opening, your plan and your mood in four moves. The rest is simply tidying up.',
      tactic: 'Deduces your plan, then dismantles it',
      book: ['positional', 'tricky', 'attack', 'solid'],
      style: { material:1.00, kingAttack:1.20, centre:1.00, pawns:1.20, passers:1.25, rooks:1.25, bishops:1.00, safety:1.00, aggression:0.45, trade:0.25 },
      depth: 7, timeMs: 4000, blunder: 0, spread: 1, contempt: 12 },

    { id: 'lawliet', name: 'L', elo: 3000, avatar: 'avatars/lawliet.jpg',
      title: 'The Investigator', country: 'JP', series: 'Death Note',
      blurb: 'Crouched over the board eating sweets, L lets you believe you are winning until the exact moment you are not.',
      tactic: 'Baits you into a line you cannot survive',
      book: ['solid', 'tricky'],
      style: { material:1.05, kingAttack:1.25, centre:1.00, pawns:1.00, passers:1.30, rooks:1.00, bishops:1.00, safety:1.25, aggression:0.30, trade:0.50 },
      depth: 7, timeMs: 4300, blunder: 0, spread: 0, contempt: 14 },

    { id: 'light', name: 'Light', elo: 3100, avatar: 'avatars/light.jpg',
      title: 'Kira', country: 'JP', series: 'Death Note',
      blurb: 'Brilliant, vain and merciless. Light calculates the whole game and then writes your name on the result.',
      tactic: 'Perfect execution with a killer attack',
      book: ['attack', 'positional', 'gambit', 'hyper'],
      style: { material:1.04, kingAttack:1.50, centre:1.25, pawns:1.00, passers:1.35, rooks:1.30, bishops:1.00, safety:1.00, aggression:0.80, trade:0.00 },
      depth: 8, timeMs: 4600, blunder: 0, spread: 0, contempt: 14 },

    { id: 'jonas', name: 'Jonas', elo: 3200, avatar: 'avatars/jonas.jpg',
      title: 'The Traveller', country: 'DE', series: 'Dark',
      blurb: 'He has seen how this ends, several times, from both sides. Jonas is only here to make sure it happens again.',
      tactic: 'Plays the endgame before it even starts',
      book: ['positional', 'solid', 'hyper', 'tricky', 'attack', 'gambit'],
      style: { material:1.00, kingAttack:1.30, centre:1.25, pawns:1.35, passers:1.50, rooks:1.40, bishops:1.00, safety:1.00, aggression:0.00, trade:0.40 },
      depth: 8, timeMs: 5000, blunder: 0, spread: 0, contempt: 16 }
  ];

  function byId(id) {
    for (var i = 0; i < BOTS.length; i++) if (BOTS[i].id === id) return BOTS[i];
    return BOTS[0];
  }

  function tier(elo) {
    if (elo < 600)  return { label: 'Beginner',     color: '#7fa650' };
    if (elo < 1100) return { label: 'Casual',       color: '#5c9ecf' };
    if (elo < 1600) return { label: 'Intermediate', color: '#c28b3a' };
    if (elo < 2100) return { label: 'Advanced',     color: '#c15b4a' };
    if (elo < 2500) return { label: 'Master',       color: '#8b5cf6' };
    if (elo < 2900) return { label: 'Grandmaster',  color: '#e0b341' };
    return { label: 'Superhuman', color: '#e8604c' };
  }

  var API = { BOTS: BOTS, byId: byId, tier: tier };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessBots = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
