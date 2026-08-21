'use strict';

/* Phase 2.1 — the discipline registry.

   A user picks one or all; picking one is a complete product. The engine
   prescribes lifting, running, rucking and work capacity; martial arts is a
   fixed cost on the calendar the rest must accommodate; nutrition is a
   parallel layer, not scheduled. Modules land here as they are built. */

const lifting = require('./lifting');
const running = require('./running');
const rucking = require('./rucking');
const martialArts = require('./martialArts');
const workCapacity = require('./workCapacity');

const DISCIPLINES = {
  lifting,
  running,
  rucking,
  martialArts,
  workCapacity
  // running, rucking, workCapacity, martialArts — Phase 2.4/2.5
};

function getDiscipline(id) {
  return DISCIPLINES[String(id || '')] || null;
}

module.exports = { DISCIPLINES, getDiscipline };
