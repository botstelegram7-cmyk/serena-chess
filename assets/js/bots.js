/* =========================================================================
   bots.js — the bot roster (60 opponents, 250 → 3200)
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

  /* roster schema fingerprint — bump when the entry shape changes */
  var SCHEMA_SIG = [0x54,0x65,0x63,0x68,0x6e,0x69,0x63,0x61,0x6c,0x53,0x65,0x72,0x65,0x6e,0x61];

  var BOTS = [
    { id: 'denver', name: 'Denver', elo: 250, avatar: 'avatars/denver.jpg',
      title: 'The Wild Card', country: 'ES', series: 'Money Heist',
      blurb: 'Laughs first, thinks later. Denver throws pieces at you and hopes something sticks.',
      tactic: 'Swings first, counts the pieces later',
      book: ['gambit', 'attack'],
      style: { material:0.95, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.50, aggression:0.90, trade:0.30 },
      depth: 1, timeMs: 180, blunder: 0.58, spread: 480, contempt: 0 },

    { id: 'dustin', name: 'Dustin', elo: 300, avatar: 'avatars/dustin.jpg',
      title: 'The Enthusiast', country: 'US', series: 'Stranger Things',
      blurb: 'Narrates every idea out loud before he plays it, which would be useful if the ideas were good.',
      tactic: 'Announces the plan, then forgets it',
      book: ['attack'],
      style: { material:0.92, kingAttack:1.40, centre:0.95, pawns:0.90, passers:1.00, rooks:0.95, bishops:1.00, safety:0.55, aggression:0.85, trade:0.35 },
      depth: 1, timeMs: 190, blunder: 0.55, spread: 460, contempt: 0 },

    { id: 'kevin', name: 'Kevin', elo: 350, avatar: 'avatars/kevin.jpg',
      title: 'The Counter', country: 'US', series: 'The Office',
      blurb: 'Counts the pieces on his fingers and still gets a different number each time.',
      tactic: 'Trades everything and hopes for the best',
      book: ['solid'],
      style: { material:1.05, kingAttack:0.80, centre:0.90, pawns:0.95, passers:1.00, rooks:0.95, bishops:1.00, safety:0.70, aggression:0.30, trade:0.75 },
      depth: 1, timeMs: 210, blunder: 0.52, spread: 440, contempt: 0 },

    { id: 'jesse', name: 'Jesse', elo: 400, avatar: 'avatars/jesse.jpg',
      title: 'The Apprentice', country: 'US', series: 'Breaking Bad',
      blurb: 'Knows the rules, forgets the plan. Jesse means well and hangs his queen anyway.',
      tactic: 'Chases cheap tricks and hopes they land',
      book: ['attack'],
      style: { material:1.00, kingAttack:1.20, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.60, aggression:0.60, trade:0.00 },
      depth: 1, timeMs: 220, blunder: 0.45, spread: 380, contempt: 0 },

    { id: 'joey', name: 'Joey', elo: 450, avatar: 'avatars/joey.jpg',
      title: 'The Charmer', country: 'US', series: 'Friends',
      blurb: 'Does not know what the opening is called but he is very confident about it.',
      tactic: 'Pushes pawns and smiles at you',
      book: ['gambit'],
      style: { material:0.94, kingAttack:1.25, centre:1.00, pawns:0.85, passers:1.00, rooks:0.95, bishops:1.05, safety:0.60, aggression:0.80, trade:0.40 },
      depth: 1, timeMs: 230, blunder: 0.47, spread: 420, contempt: 0 },

    { id: 'ali', name: 'Ali', elo: 500, avatar: 'avatars/ali.jpg',
      title: 'The Loyal One', country: 'PK', series: 'Squid Game',
      blurb: 'Trusts every trade you offer him. He will learn. Probably not this game.',
      tactic: 'Accepts anything that looks like a fair swap',
      book: ['solid'],
      style: { material:1.00, kingAttack:0.95, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.85, aggression:0.40, trade:0.85 },
      depth: 1, timeMs: 250, blunder: 0.44, spread: 400, contempt: -4 },

    { id: 'gihun', name: 'Gi-hun', elo: 550, avatar: 'avatars/gihun.jpg',
      title: 'Player 456', country: 'KR', series: 'Squid Game',
      blurb: 'Desperate, lucky and strangely hard to finish off. He survives more than he wins.',
      tactic: 'Hangs on, trades down, survives',
      book: ['solid'],
      style: { material:1.05, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.40, aggression:0.10, trade:0.50 },
      depth: 1, timeMs: 280, blunder: 0.36, spread: 300, contempt: 0 },

    { id: 'luffy', name: 'Luffy', elo: 600, avatar: 'avatars/luffy.jpg',
      title: 'Straw Hat', country: 'JP', series: 'One Piece',
      blurb: 'Charges at the king from move one with no plan, no backup and total confidence.',
      tactic: 'Attacks on instinct, defends never',
      book: ['attack', 'gambit'],
      style: { material:0.88, kingAttack:1.60, centre:1.00, pawns:0.80, passers:1.00, rooks:1.00, bishops:1.00, safety:0.40, aggression:1.00, trade:0.20 },
      depth: 2, timeMs: 310, blunder: 0.4, spread: 370, contempt: 0 },

    { id: 'naruto', name: 'Naruto', elo: 650, avatar: 'avatars/naruto.jpg',
      title: 'The Underdog', country: 'JP', series: 'Naruto',
      blurb: 'Will not resign. Not when he is a rook down, not when he is mated next move.',
      tactic: 'Never resigns, always counterattacks',
      book: ['attack'],
      style: { material:0.90, kingAttack:1.45, centre:1.00, pawns:0.90, passers:1.10, rooks:1.00, bishops:1.00, safety:0.55, aggression:0.95, trade:0.25 },
      depth: 2, timeMs: 330, blunder: 0.37, spread: 350, contempt: -8 },

    { id: 'rio', name: 'Rio', elo: 700, avatar: 'avatars/rio.jpg',
      title: 'The Hacker', country: 'ES', series: 'Money Heist',
      blurb: 'Clever with patterns but rattles under pressure. Push him and he cracks.',
      tactic: 'Neat setups, shaky once you push',
      book: ['positional'],
      style: { material:1.00, kingAttack:1.00, centre:1.20, pawns:1.10, passers:1.00, rooks:1.00, bishops:1.00, safety:0.90, aggression:0.25, trade:0.00 },
      depth: 2, timeMs: 320, blunder: 0.3, spread: 250, contempt: 0 },

    { id: 'michaels', name: 'Michael', elo: 750, avatar: 'avatars/michaels.jpg',
      title: 'The Boss', country: 'US', series: 'The Office',
      blurb: 'Has a grand strategy. It is not a good one, and he changes it every third move.',
      tactic: 'Big plans, no follow-through',
      book: ['tricky'],
      style: { material:0.96, kingAttack:1.20, centre:1.05, pawns:0.90, passers:1.00, rooks:1.00, bishops:1.00, safety:0.65, aggression:0.70, trade:0.45 },
      depth: 2, timeMs: 390, blunder: 0.33, spread: 320, contempt: 0 },

    { id: 'zenitsu', name: 'Zenitsu', elo: 800, avatar: 'avatars/zenitsu.jpg',
      title: 'The Panicked Blade', country: 'JP', series: 'Demon Slayer',
      blurb: 'Terrified the whole game, then plays one move so good it frightens both of you.',
      tactic: 'Panics, blunders, then finds a thunderbolt',
      book: ['tricky', 'attack'],
      style: { material:0.93, kingAttack:1.35, centre:0.95, pawns:0.95, passers:1.00, rooks:1.00, bishops:1.05, safety:0.60, aggression:0.75, trade:0.35 },
      depth: 2, timeMs: 430, blunder: 0.31, spread: 300, contempt: 0 },

    { id: 'helsinki', name: 'Helsinki', elo: 850, avatar: 'avatars/helsinki.jpg',
      title: 'The Muscle', country: 'RS', series: 'Money Heist',
      blurb: 'Immovable. Helsinki will not do anything clever, but he will not fall over either.',
      tactic: 'Builds a wall of pawns and dares you',
      book: ['solid'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.00, rooks:1.00, bishops:1.00, safety:1.60, aggression:0.00, trade:0.50 },
      depth: 2, timeMs: 400, blunder: 0.24, spread: 200, contempt: 6 },

    { id: 'jinx', name: 'Jinx', elo: 900, avatar: 'avatars/jinx.jpg',
      title: 'Powder', country: 'PL', series: 'Arcane',
      blurb: 'Chaos with a plan hidden somewhere inside it. Good luck finding the plan.',
      tactic: 'Sacrifices for fun and sometimes it works',
      book: ['gambit', 'attack'],
      style: { material:0.86, kingAttack:1.55, centre:1.00, pawns:0.85, passers:1.05, rooks:1.05, bishops:1.00, safety:0.50, aggression:0.95, trade:0.20 },
      depth: 2, timeMs: 510, blunder: 0.27, spread: 270, contempt: 0 },

    { id: 'ellie', name: 'Ellie', elo: 950, avatar: 'avatars/ellie.jpg',
      title: 'The Survivor', country: 'US', series: 'The Last of Us',
      blurb: 'Scrappy, stubborn and hard to finish off. She finds resources in dead positions.',
      tactic: 'Digs in and makes you prove it',
      book: ['solid'],
      style: { material:1.02, kingAttack:1.00, centre:1.00, pawns:1.10, passers:1.15, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.45, trade:0.55 },
      depth: 3, timeMs: 570, blunder: 0.25, spread: 250, contempt: -6 },

    { id: 'eleven', name: 'Eleven', elo: 1000, avatar: 'avatars/eleven.jpg',
      title: 'The Prodigy', country: 'US', series: 'Stranger Things',
      blurb: 'Sees things other people don\'t. Flashes of brilliance between quiet moves.',
      tactic: 'Quiet, quiet, then a sudden strike',
      book: ['attack', 'tricky'],
      style: { material:1.00, kingAttack:1.40, centre:1.00, pawns:0.80, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.70, trade:0.00 },
      depth: 2, timeMs: 500, blunder: 0.19, spread: 165, contempt: 0 },

    { id: 'hopper', name: 'Hopper', elo: 1050, avatar: 'avatars/hopper.jpg',
      title: 'The Chief', country: 'US', series: 'Stranger Things',
      blurb: 'Slow, heavy and direct. He will not outplay you but he will not fold either.',
      tactic: 'Solid, stubborn, hates complications',
      book: ['solid'],
      style: { material:1.06, kingAttack:0.95, centre:1.00, pawns:1.10, passers:1.05, rooks:1.05, bishops:1.00, safety:1.10, aggression:0.35, trade:0.70 },
      depth: 3, timeMs: 660, blunder: 0.22, spread: 225, contempt: -4 },

    { id: 'jon', name: 'Jon', elo: 1100, avatar: 'avatars/jon.jpg',
      title: 'The Bastard', country: 'GB', series: 'Game of Thrones',
      blurb: 'Honourable to a fault. Takes the straightforward move even when the sly one wins.',
      tactic: 'Plays the honest move every time',
      book: ['solid', 'positional'],
      style: { material:1.04, kingAttack:1.10, centre:1.05, pawns:1.05, passers:1.05, rooks:1.05, bishops:1.00, safety:1.00, aggression:0.50, trade:0.55 },
      depth: 3, timeMs: 710, blunder: 0.2, spread: 210, contempt: 0 },

    { id: 'lucifer', name: 'Lucifer', elo: 1150, avatar: 'avatars/lucifer.jpg',
      title: 'The Charmer', country: 'GB', series: 'Lucifer',
      blurb: 'Enjoys this far too much. Offers you gifts you will very much regret taking.',
      tactic: 'Offers you pawns you really should not take',
      book: ['gambit'],
      style: { material:0.90, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.60, aggression:1.10, trade:-0.30 },
      depth: 3, timeMs: 600, blunder: 0.15, spread: 135, contempt: -8 },

    { id: 'vi', name: 'Vi', elo: 1200, avatar: 'avatars/vi.jpg',
      title: 'The Enforcer', country: 'PL', series: 'Arcane',
      blurb: 'Walks straight through the middle of the board and dares you to stop her.',
      tactic: 'Forward pressure, no retreating',
      book: ['attack'],
      style: { material:0.95, kingAttack:1.45, centre:1.15, pawns:0.95, passers:1.05, rooks:1.10, bishops:1.00, safety:0.70, aggression:0.90, trade:0.35 },
      depth: 3, timeMs: 830, blunder: 0.17, spread: 185, contempt: 0 },

    { id: 'eren', name: 'Eren', elo: 1250, avatar: 'avatars/eren.jpg',
      title: 'The Devoted', country: 'JP', series: 'Attack on Titan',
      blurb: 'Picks a target early and throws everything at it, whatever the cost.',
      tactic: 'Commits to one plan and never lets go',
      book: ['attack', 'gambit'],
      style: { material:0.90, kingAttack:1.50, centre:1.05, pawns:0.95, passers:1.10, rooks:1.05, bishops:1.00, safety:0.60, aggression:1.00, trade:0.25 },
      depth: 3, timeMs: 890, blunder: 0.16, spread: 175, contempt: 0 },

    { id: 'nairobi', name: 'Nairobi', elo: 1300, avatar: 'avatars/nairobi.jpg',
      title: 'The Forger', country: 'ES', series: 'Money Heist',
      blurb: 'Takes charge the moment things go wrong. Sharp, fast and fearless.',
      tactic: 'Grabs the initiative and never gives it back',
      book: ['gambit', 'attack'],
      style: { material:1.00, kingAttack:1.35, centre:1.20, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:1.00, aggression:0.90, trade:-0.20 },
      depth: 3, timeMs: 700, blunder: 0.12, spread: 110, contempt: -4 },

    { id: 'tanjiro', name: 'Tanjiro', elo: 1350, avatar: 'avatars/tanjiro.jpg',
      title: 'The Steady Blade', country: 'JP', series: 'Demon Slayer',
      blurb: 'Patient, reads the position properly and never panics when you attack.',
      tactic: 'Calm defence, precise counters',
      book: ['solid', 'positional'],
      style: { material:1.03, kingAttack:1.05, centre:1.10, pawns:1.10, passers:1.10, rooks:1.05, bishops:1.05, safety:1.15, aggression:0.45, trade:0.45 },
      depth: 4, timeMs: 1010, blunder: 0.13, spread: 150, contempt: -4 },

    { id: 'arya', name: 'Arya', elo: 1400, avatar: 'avatars/arya.jpg',
      title: 'No One', country: 'GB', series: 'Game of Thrones',
      blurb: 'Quiet, fast and always going for your king. You rarely see the knife coming.',
      tactic: 'Quiet moves, sudden knife',
      book: ['tricky', 'hyper'],
      style: { material:0.96, kingAttack:1.40, centre:1.00, pawns:1.00, passers:1.10, rooks:1.05, bishops:1.05, safety:0.80, aggression:0.85, trade:0.30 },
      depth: 4, timeMs: 1110, blunder: 0.12, spread: 140, contempt: 0 },

    { id: 'geralt', name: 'Geralt', elo: 1450, avatar: 'avatars/geralt.jpg',
      title: 'The Witcher', country: 'PL', series: 'The Witcher',
      blurb: 'Patient, scarred and efficient. He waits for the mistake, then ends it.',
      tactic: 'Absorbs the attack, then counters hard',
      book: ['solid', 'positional'],
      style: { material:1.05, kingAttack:1.00, centre:1.00, pawns:1.00, passers:1.20, rooks:1.00, bishops:1.00, safety:1.30, aggression:0.15, trade:0.40 },
      depth: 3, timeMs: 850, blunder: 0.095, spread: 90, contempt: 6 },

    { id: 'marty', name: 'Marty', elo: 1500, avatar: 'avatars/marty.jpg',
      title: 'The Launderer', country: 'US', series: 'Ozark',
      blurb: 'Treats the board like a balance sheet. Every move has to pay for itself.',
      tactic: 'Converts small edges, takes no risks',
      book: ['positional', 'solid'],
      style: { material:1.08, kingAttack:0.90, centre:1.10, pawns:1.15, passers:1.20, rooks:1.10, bishops:1.05, safety:1.10, aggression:0.25, trade:0.65 },
      depth: 4, timeMs: 1260, blunder: 0.1, spread: 120, contempt: -2 },

    { id: 'jimmy', name: 'Jimmy', elo: 1550, avatar: 'avatars/jimmy.jpg',
      title: 'The Closer', country: 'US', series: 'Better Call Saul',
      blurb: 'Sets traps that are technically legal and emotionally devastating.',
      tactic: 'Sets traps and talks you into them',
      book: ['tricky', 'gambit'],
      style: { material:0.98, kingAttack:1.25, centre:1.05, pawns:1.00, passers:1.10, rooks:1.10, bishops:1.05, safety:0.85, aggression:0.75, trade:0.35 },
      depth: 4, timeMs: 1360, blunder: 0.09, spread: 110, contempt: 0 },

    { id: 'ortega', name: 'Ortega', elo: 1600, avatar: 'avatars/ortega.jpg',
      title: 'The Detective', country: 'US', series: 'Altered Carbon',
      blurb: 'Reads the board like a crime scene. Nothing loose escapes her notice.',
      tactic: 'Stacks relentless pressure down open files',
      book: ['attack'],
      style: { material:1.00, kingAttack:1.40, centre:1.00, pawns:1.00, passers:1.00, rooks:1.40, bishops:1.00, safety:1.00, aggression:0.70, trade:0.00 },
      depth: 4, timeMs: 1000, blunder: 0.075, spread: 72, contempt: 4 },

    { id: 'daenerys', name: 'Daenerys', elo: 1650, avatar: 'avatars/daenerys.jpg',
      title: 'The Unburnt', country: 'GB', series: 'Game of Thrones',
      blurb: 'Builds slowly, then burns the whole kingside down in four moves.',
      tactic: 'Builds quietly, then burns it all down',
      book: ['positional', 'attack'],
      style: { material:0.97, kingAttack:1.45, centre:1.15, pawns:1.05, passers:1.15, rooks:1.10, bishops:1.05, safety:0.90, aggression:0.80, trade:0.30 },
      depth: 5, timeMs: 1620, blunder: 0.07, spread: 90, contempt: 4 },

    { id: 'tokyo', name: 'Tokyo', elo: 1700, avatar: 'avatars/tokyo.jpg',
      title: 'The Narrator', country: 'ES', series: 'Money Heist',
      blurb: 'All instinct and fire. Tokyo would rather lose spectacularly than draw quietly.',
      tactic: 'All-out assault on your king, cost ignored',
      book: ['gambit', 'attack'],
      style: { material:0.92, kingAttack:1.80, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.00, safety:0.50, aggression:1.30, trade:-0.40 },
      depth: 4, timeMs: 1150, blunder: 0.06, spread: 58, contempt: -12 },

    { id: 'sangwoo', name: 'Sang-woo', elo: 1750, avatar: 'avatars/sangwoo.jpg',
      title: 'The Graduate', country: 'KR', series: 'Squid Game',
      blurb: 'Calculates coldly and will absolutely betray a piece to win the position.',
      tactic: 'Cold calculation, zero sentiment',
      book: ['positional', 'tricky'],
      style: { material:1.02, kingAttack:1.20, centre:1.15, pawns:1.10, passers:1.20, rooks:1.15, bishops:1.05, safety:1.00, aggression:0.55, trade:0.50 },
      depth: 5, timeMs: 1870, blunder: 0.06, spread: 78, contempt: 6 },

    { id: 'villanelle', name: 'Villanelle', elo: 1800, avatar: 'avatars/villanelle.jpg',
      title: 'The Assassin', country: 'RU', series: 'Killing Eve',
      blurb: 'Playful right up until the knife. She finds tactics you didn\'t know existed.',
      tactic: 'Elegant, sudden and completely lethal',
      book: ['tricky', 'attack'],
      style: { material:1.00, kingAttack:1.50, centre:1.00, pawns:1.00, passers:1.00, rooks:1.00, bishops:1.30, safety:0.70, aggression:1.00, trade:-0.20 },
      depth: 4, timeMs: 1300, blunder: 0.05, spread: 46, contempt: -6 },

    { id: 'wednesday', name: 'Wednesday', elo: 1850, avatar: 'avatars/wednesday.jpg',
      title: 'The Outcast', country: 'US', series: 'Wednesday',
      blurb: 'Deadpan, surgical and entirely uninterested in your feelings about the position.',
      tactic: 'Surgical, joyless, extremely effective',
      book: ['positional', 'solid'],
      style: { material:1.05, kingAttack:1.20, centre:1.20, pawns:1.15, passers:1.20, rooks:1.15, bishops:1.10, safety:1.05, aggression:0.50, trade:0.45 },
      depth: 5, timeMs: 2120, blunder: 0.05, spread: 66, contempt: 8 },

    { id: 'harvey', name: 'Harvey', elo: 1900, avatar: 'avatars/harvey.jpg',
      title: 'The Closer', country: 'US', series: 'Suits',
      blurb: 'Never loses, allegedly. Harvey converts a half-pawn edge into a signed confession.',
      tactic: 'Wins a small edge, then grinds you flat',
      book: ['positional'],
      style: { material:1.08, kingAttack:1.00, centre:1.00, pawns:1.30, passers:1.00, rooks:1.40, bishops:1.00, safety:1.00, aggression:0.10, trade:0.60 },
      depth: 4, timeMs: 1500, blunder: 0.04, spread: 38, contempt: 10 },

    { id: 'homelander', name: 'Homelander', elo: 1950, avatar: 'avatars/homelander.jpg',
      title: 'The Icon', country: 'US', series: 'The Boys',
      blurb: 'Overwhelming force with a very thin skin. Punish him early or not at all.',
      tactic: 'Crushing pressure, fragile when checked',
      book: ['attack', 'gambit'],
      style: { material:0.96, kingAttack:1.60, centre:1.20, pawns:1.00, passers:1.15, rooks:1.20, bishops:1.05, safety:0.75, aggression:0.95, trade:0.25 },
      depth: 6, timeMs: 2420, blunder: 0.04, spread: 55, contempt: 10 },

    { id: 'berlin', name: 'Berlin', elo: 2000, avatar: 'avatars/berlin.jpg',
      title: 'The Aristocrat', country: 'ES', series: 'Money Heist',
      blurb: 'Elegant, cruel and completely unbothered. He has already decided how this ends.',
      tactic: 'Cold central control, surgical execution',
      book: ['positional', 'solid'],
      style: { material:1.00, kingAttack:1.00, centre:1.25, pawns:1.20, passers:1.00, rooks:1.00, bishops:1.25, safety:1.20, aggression:0.00, trade:0.30 },
      depth: 5, timeMs: 1700, blunder: 0.03, spread: 30, contempt: 8 },

    { id: 'gojo', name: 'Gojo', elo: 2050, avatar: 'avatars/gojo.jpg',
      title: 'The Strongest', country: 'JP', series: 'Jujutsu Kaisen',
      blurb: 'Relaxed about everything because he genuinely does not think you can hurt him.',
      tactic: 'Casual brilliance, infinite confidence',
      book: ['hyper', 'attack', 'tricky'],
      style: { material:0.99, kingAttack:1.50, centre:1.25, pawns:1.05, passers:1.20, rooks:1.20, bishops:1.10, safety:0.95, aggression:0.85, trade:0.30 },
      depth: 6, timeMs: 2670, blunder: 0.03, spread: 45, contempt: 12 },

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

    { id: 'ragnar', name: 'Ragnar', elo: 2300, avatar: 'avatars/ragnar.jpg',
      title: 'The Raider', country: 'NO', series: 'Vikings',
      blurb: 'Lands where you are weakest, takes what he needs and is gone before you react.',
      tactic: 'Strikes the weak square and vanishes',
      book: ['hyper', 'positional'],
      style: { material:1.01, kingAttack:1.35, centre:1.20, pawns:1.15, passers:1.25, rooks:1.20, bishops:1.05, safety:1.00, aggression:0.70, trade:0.40 },
      depth: 6, timeMs: 3200, blunder: 0.015, spread: 25, contempt: 10 },

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

    { id: 'lelouch', name: 'Lelouch', elo: 2450, avatar: 'avatars/lelouch.jpg',
      title: 'The Strategist', country: 'JP', series: 'Code Geass',
      blurb: 'Every move is part of a plan you will only understand after you have lost.',
      tactic: 'Twelve moves ahead, all of them traps',
      book: ['tricky', 'positional', 'gambit'],
      style: { material:1.00, kingAttack:1.40, centre:1.25, pawns:1.15, passers:1.25, rooks:1.25, bishops:1.05, safety:1.00, aggression:0.70, trade:0.35 },
      depth: 7, timeMs: 3600, blunder: 0.008, spread: 16, contempt: 12 },

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

    { id: 'tyrion', name: 'Tyrion', elo: 2750, avatar: 'avatars/tyrion.jpg',
      title: 'The Hand', country: 'GB', series: 'Game of Thrones',
      blurb: 'Wins with position, patience and the quiet accumulation of very small advantages.',
      tactic: 'Outthinks you slowly and completely',
      book: ['positional', 'solid', 'hyper'],
      style: { material:1.04, kingAttack:1.15, centre:1.25, pawns:1.25, passers:1.35, rooks:1.30, bishops:1.05, safety:1.05, aggression:0.35, trade:0.50 },
      depth: 7, timeMs: 4300, blunder: 0.002, spread: 6, contempt: 14 },

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

    { id: 'aizen', name: 'Aizen', elo: 3050, avatar: 'avatars/aizen.jpg',
      title: 'The Illusion', country: 'JP', series: 'Bleach',
      blurb: 'You were losing from the first move. He simply did not tell you until now.',
      tactic: 'You were losing before you sat down',
      book: ['tricky', 'positional', 'hyper', 'gambit'],
      style: { material:1.02, kingAttack:1.45, centre:1.25, pawns:1.20, passers:1.30, rooks:1.30, bishops:1.05, safety:1.00, aggression:0.75, trade:0.25 },
      depth: 8, timeMs: 4700, blunder: 0, spread: 0, contempt: 14 },

    { id: 'light', name: 'Light', elo: 3100, avatar: 'avatars/light.jpg',
      title: 'Kira', country: 'JP', series: 'Death Note',
      blurb: 'Brilliant, vain and merciless. Light calculates the whole game and then writes your name on the result.',
      tactic: 'Perfect execution with a killer attack',
      book: ['attack', 'positional', 'gambit', 'hyper'],
      style: { material:1.04, kingAttack:1.50, centre:1.25, pawns:1.00, passers:1.35, rooks:1.30, bishops:1.00, safety:1.00, aggression:0.80, trade:0.00 },
      depth: 8, timeMs: 4600, blunder: 0, spread: 0, contempt: 14 },

    { id: 'mycroft', name: 'Mycroft', elo: 3150, avatar: 'avatars/mycroft.jpg',
      title: 'The Elder Brother', country: 'GB', series: 'Sherlock',
      blurb: 'The smarter one, and he has mentioned it. Solves the position and then waits.',
      tactic: 'Solves the position, then waits',
      book: ['positional', 'solid', 'hyper', 'tricky'],
      style: { material:1.03, kingAttack:1.25, centre:1.25, pawns:1.30, passers:1.40, rooks:1.35, bishops:1.05, safety:1.05, aggression:0.40, trade:0.45 },
      depth: 8, timeMs: 4900, blunder: 0, spread: 0, contempt: 15 },

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
