"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("..");
function sequence(values) { let index = 0; return () => values[index++] ?? 0; }
test("base stats, Training Sword, and the 8% miniboss boundary preserve Hunt parity", () => {
  assert.deepEqual(core.calculateBaseStats(1), { hp: 100, power: 10, defense: 8, crit_chance: 5, crit_damage: 150, accuracy: 0, dodge: 5, lifesteal: 0, resistance: 0, potency: 0, luck: 0 });
  assert.equal(core.buildPlayerCombatSnapshot({ realm_level: 1 }).weapon.displayName, "Training Sword");
  assert.equal(core.selectVeyraEncounter(1, sequence([.0799, 0])).encounterType, "miniboss");
  assert.equal(core.selectVeyraEncounter(1, sequence([.08, 0])).key, "mossback_grazer");
});
test("Basic Attack orders player then enemy and never counterattacks after victory", () => {
  const state = core.createSoloHuntState({ combatId: "c", guildId: "g", playerId: "u", player: { level: 100 }, weapon: core.TRAINING_SWORD, encounterKey: "mossback_grazer", createdAt: 0 });
  const result = core.resolveCombatAction({ state, action: { type: "basic_attack" }, nowMs: 0, expectedVersion: 1, rng: sequence([0, .999, 0]) });
  assert.equal(result.state.status, "victory"); assert.equal(result.enemyAttack, null); assert.equal(result.events[0].type, "player_attack");
});
test("recovery and version failures consume no RNG", () => {
  const state = core.createSoloHuntState({ combatId: "c", guildId: "g", playerId: "u", player: { level: 1 }, weapon: core.TRAINING_SWORD, encounterKey: "mossback_grazer", createdAt: 10 }); let calls = 0;
  assert.throws(() => core.resolveCombatAction({ state, action: { type: "basic_attack" }, nowMs: 9, expectedVersion: 1, rng: () => { calls++; return 0; } }), (e) => e.code === "WEAPON_RECOVERING"); assert.equal(calls, 0);
  assert.throws(() => core.resolveCombatAction({ state, action: { type: "basic_attack" }, nowMs: 10, expectedVersion: 2, rng: () => { calls++; return 0; } }), (e) => e.code === "COMBAT_VERSION_MISMATCH"); assert.equal(calls, 0);
});
test("rewards preserve range, drop, quality, durability, and wear intent contracts", () => {
  const encounter = require("@cella/realms-content").getVeyraEncounter("mossback_grazer");
  const reward = core.createHuntReward({ encounter, rng: sequence([0, 0, 0, 0, 0, 0, 0]) });
  assert.equal(reward.xp, 40); assert.equal(reward.credits, 20); assert.equal(reward.scrap, 2); assert.equal(reward.loot.item_key, "veyra_verdant_edge"); assert.equal(reward.loot.durability_current, 70);
  assert.deepEqual(core.deriveDurabilityWearIntent({ action: { type: "basic_attack" }, result: { state: {}, enemyAttack: { hit: true } } }), { weapon: 1, armor: true });
});
