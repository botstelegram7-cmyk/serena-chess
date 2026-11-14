/* =========================================================================
   economy.js — Elo rating, gold currency and cosmetic shop
   -------------------------------------------------------------------------
   Persists to localStorage (via Store in app.js). Items bought on the Voroa
   backend are synced up; purchases made offline are applied locally and
   synced when the device returns online.

   Shop categories:
     board   — board themes  (cost 50 gold each)
     piece   — piece skins   (cost 100 gold each)
     avatar  — avatars       (cost 200 gold each)

   Usage:
     Economy.init(store, profile);        // call once at boot
     Economy.award(gameResult);           // call when a game ends
     Economy.canBuy(type, id);            // true if owned/affordable
     Economy.buy(type, id);               // purchase
     Economy.equip(type, id);             // equip an owned item
   ========================================================================= */
(function (root) {
  'use strict';

  var Store = null;
  var profile = null;

  var COST = { board: 50, piece: 100, avatar: 200 };
  var WIN_GOLD = 40, LOSS_GOLD = 10, DRAW_GOLD = 20;

  /* Default shop catalogue (also served by the backend at /shop). */
  var CATALOGUE = {
    board: [
      { id: 'classic',   name: 'Classic',   type: 'board',  cost: 50,  owned: true },
      { id: 'green',     name: 'Green',     type: 'board',  cost: 50,  owned: false },
      { id: 'wood',      name: 'Wood',      type: 'board',  cost: 50,  owned: false },
      { id: 'marble',    name: 'Marble',    type: 'board',  cost: 50,  owned: false },
      { id: 'neon',      name: 'Neon',      type: 'board',  cost: 50,  owned: false },
      { id: 'dark',      name: 'Dark',      type: 'board',  cost: 50,  owned: false },
    ],
    piece: [
      { id: 'classic',   name: 'Classic',   type: 'piece',  cost: 100, owned: true },
      { id: 'bases',     name: 'Bases',     type: 'piece',  cost: 100, owned: false },
      { id: 'bandclass', name: 'Bandclass', type: 'piece',  cost: 100, owned: false },
      { id: 'sky',       name: 'Sky',       type: 'piece',  cost: 100, owned: false },
      { id: 'staunton3d',name: 'Staunton 3D',type: 'piece',  cost: 100, owned: false },
      { id: 'tigers',    name: 'Tigers',    type: 'piece',  cost: 100, owned: false },
    ],
    avatar: [
      { id: 'default',   name: 'Default',   type: 'avatar', cost: 200, owned: true },
      { id: 'serena',    name: 'Serena',    type: 'avatar', cost: 200, owned: false },
      { id: 'master',    name: 'Master',    type: 'avatar', cost: 200, owned: false },
      { id: 'grandmaster',name:'Grandmaster',type: 'avatar', cost: 200, owned: false },
    ],
  };

  function init(s, p) {
    Store = s;
    profile = p;
    /* ensure economy fields exist on existing profiles */
    if (typeof profile.gold !== 'number') profile.gold = 200;
    if (!profile.items) profile.items = { board: ['classic'], piece: ['classic'], avatar: ['default'] };
    if (!profile.equipped) profile.equipped = { board: 'classic', piece: 'classic', avatar: 'default' };
    if (typeof profile.played !== 'number') profile.played = 0;
    if (typeof profile.wins !== 'number') profile.wins = 0;
    if (typeof profile.losses !== 'number') profile.losses = 0;
    if (typeof profile.draws !== 'number') profile.draws = 0;
    save();
  }

  function save() {
    if (Store && Store.set) Store.set('chess.profile', profile);
  }

  /* Elo calculation (standard, K=24, provisional K=40 for first 15 games) */
  function expected(mine, theirs) {
    return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  }

  function ratingChange(mine, theirs, score) {
    var played = profile.played || 0;
    var K = played < 15 ? 40 : (mine > 2200 ? 16 : 24);
    return Math.round(K * (score - expected(mine, theirs)));
  }

  /** Call when a rated game ends. score: 1 = win, 0.5 = draw, 0 = loss.
   * Returns { delta, gold, newRating } */
  function award(theirRating, score) {
    if (!profile) return { delta: 0, gold: 0, newRating: profile ? profile.rating : 1200 };
    var before = profile.rating || 1200;
    var delta = ratingChange(before, theirRating, score);
    var newRating = Math.max(100, before + delta);
    var gold = score === 1 ? WIN_GOLD : (score === 0.5 ? DRAW_GOLD : LOSS_GOLD);

    profile.rating = newRating;
    profile.gold = (profile.gold || 0) + gold;
    profile.played = (profile.played || 0) + 1;
    if (score === 1) profile.wins = (profile.wins || 0) + 1;
    else if (score === 0) profile.losses = (profile.losses || 0) + 1;
    else profile.draws = (profile.draws || 0) + 1;

    if (newRating > (profile.bestRating || 0)) profile.bestRating = newRating;
    save();
    return { delta: delta, gold: gold, newRating: newRating };
  }

  /** Catalogue with owned flags applied from the profile. */
  function catalogue() {
    var out = {};
    for (var cat in CATALOGUE) {
      out[cat] = CATALOGUE[cat].map(function (item) {
        return {
          id: item.id, name: item.name, type: item.type, cost: item.cost,
          owned: (profile.items[item.type] || []).indexOf(item.id) >= 0,
          equipped: (profile.equipped && profile.equipped[item.type]) === item.id,
        };
      });
    }
    return out;
  }

  function canBuy(type, id) {
    var item = find(type, id);
    if (!item) return false;
    if (item.owned) return true;
    return (profile.gold || 0) >= item.cost;
  }

  function find(type, id) {
    for (var i = 0; i < (CATALOGUE[type] || []).length; i++) {
      if (CATALOGUE[type][i].id === id) return CATALOGUE[type][i];
    }
    return null;
  }

  /** Buy an item. Returns { ok, gold } or { ok: false, error }. */
  function buy(type, id) {
    var item = find(type, id);
    if (!item) return { ok: false, error: 'unknown_item' };
    if (!item.owned) {
      if ((profile.gold || 0) < item.cost) return { ok: false, error: 'not_enough_gold' };
      profile.gold -= item.cost;
      if (!profile.items[type]) profile.items[type] = [];
      profile.items[type].push(id);
      item.owned = true;
    }
    save();
    return { ok: true, gold: profile.gold };
  }

  /** Equip an owned item. */
  function equip(type, id) {
    var item = find(type, id);
    if (!item || !item.owned) return { ok: false, error: 'not_owned' };
    if (!profile.equipped) profile.equipped = {};
    profile.equipped[type] = id;
    save();
    return { ok: true, equipped: profile.equipped };
  }

  function syncFromServer(serverProfile) {
    if (!serverProfile) return;
    if (typeof serverProfile.gold === 'number') profile.gold = serverProfile.gold;
    if (typeof serverProfile.rating === 'number') profile.rating = serverProfile.rating;
    if (serverProfile.items) profile.items = serverProfile.items;
    if (serverProfile.equipped) profile.equipped = serverProfile.equipped;
    if (typeof serverProfile.played === 'number') profile.played = serverProfile.played;
    if (typeof serverProfile.wins === 'number') profile.wins = serverProfile.wins;
    if (typeof serverProfile.losses === 'number') profile.losses = serverProfile.losses;
    if (typeof serverProfile.draws === 'number') profile.draws = serverProfile.draws;
    save();
  }

  var API = {
    init: init, catalogue: catalogue, canBuy: canBuy, buy: buy, equip: equip,
    award: award, ratingChange: ratingChange, expected: expected,
    syncFromServer: syncFromServer, COST: COST,
    get gold() { return profile ? profile.gold : 0; },
    get rating() { return profile ? profile.rating : 1200; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Economy = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
