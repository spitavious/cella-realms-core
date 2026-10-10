"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("..");
function sequence(values) { let index = 0; return () => values[index++] ?? 0; }
function countingSequence(values) { let index = 0; return { rng: () => { const value = values[index]; index++; return value; }, calls: () => index }; }
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
test("threshold table decisions consume one RNG value each", () => {
  const cases = [[0, 2], [.1799, 2], [.18, 3], [.3899, 3], [.39, 4], [.6099, 4], [.61, 5], [.7899, 5], [.79, 6], [.9199, 6], [.92, 7], [.9999, 7]];
  for (const [value, expected] of cases) { const source = countingSequence([value]); assert.equal(core.scrapFor("normal", source.rng), expected); assert.equal(source.calls(), 1); }
  for (const [value, expected] of [[0, "common"], [.7, "uncommon"], [.95, "rare"]]) { const source = countingSequence([value]); assert.equal(core.rarityFor("normal", source.rng), expected); assert.equal(source.calls(), 1); }
  for (const [value, expected] of [[0, "poor"], [.07, "standard"], [.6, "fine"], [.85, "pristine"], [.97, "perfect"]]) { const source = countingSequence([value]); assert.equal(core.rollEquipmentInstance({ definition: { itemType: "equipment", subtype: "weapon", durabilityEnabled: false }, rarity: "common", rng: source.rng }).quality, expected); assert.equal(source.calls(), 1); }
});
test("equipment outcomes use the approved one-roll drop-rate boundaries", () => {
  assert.equal(core.HUNT_LOOT_CONFIG.normalDropUpperExclusive, .12);
  assert.deepEqual(core.HUNT_LOOT_CONFIG.minibossOutcomes, { armorUpperExclusive: .25, weaponUpperExclusive: .35 });
  for (const [value, expected] of [[0, "any"], [.119999, "any"], [.12, null]]) { const source = countingSequence([value]); assert.equal(core.equipmentOutcome("normal", source.rng), expected); assert.equal(source.calls(), 1); }
  for (const [value, expected] of [[0, "armor"], [.249999, "armor"], [.25, "weapon"], [.349999, "weapon"], [.35, null]]) { const source = countingSequence([value]); assert.equal(core.equipmentOutcome("miniboss", source.rng), expected); assert.equal(source.calls(), 1); }
  assert.deepEqual(core.HUNT_LOOT_CONFIG.normalRarity, [{ rarity: "common", upperExclusive: .70 }, { rarity: "uncommon", upperExclusive: .95 }, { rarity: "rare", upperExclusive: 1 }]);
  assert.deepEqual(core.HUNT_LOOT_CONFIG.minibossRarity, [{ rarity: "common", upperExclusive: .35 }, { rarity: "uncommon", upperExclusive: .80 }, { rarity: "rare", upperExclusive: .98 }, { rarity: "epic", upperExclusive: 1 }]);
});
test("reward RNG order is stable for no-drop and durable-equipment outcomes", () => {
  const encounter = require("@cella/realms-content").getVeyraEncounter("mossback_grazer");
  const noDrop = countingSequence([0, 0, .18, .12]);
  assert.equal(core.createHuntReward({ encounter, rng: noDrop.rng }).loot, null); assert.equal(noDrop.calls(), 4);
  const dropped = countingSequence([0, 0, 0, 0, 0, 0, 0, 0]);
  const reward = core.createHuntReward({ encounter, rng: dropped.rng }); assert.equal(reward.loot.item_key, "veyra_verdant_edge"); assert.equal(reward.loot.quality, "poor"); assert.equal(reward.loot.durability_current, 70); assert.equal(dropped.calls(), 8);
});
test("the raw combat-start model derives V2 data without pre-derived fields", () => {
  const raw = { profile: { realm_level: 1, build_revision: 0 }, runtimeContent: { equipmentCombatEnabled: true, contentVersion: 2, contentKey: "phase4b_veyra_balance_v1", contentHash: "b28ec2891e3a045225f7ef5a580bf3c067516458973724ce7aee9850cc3efaf8" }, equipment: [], templates: [{ item_key: "veyra_verdant_edge" }] };
  assert.deepEqual(Object.keys(raw).sort(), ["equipment", "profile", "runtimeContent", "templates"]);
  const build = core.resolveEquipmentCombatBuild(raw);
  assert.equal(build.enabled, true); assert.equal(build.model.profile.build_revision, 0); assert.equal(build.snapshot.sourceBuildRevision, "0"); assert.equal(build.player.weapon.weaponKey, "training_sword"); assert.equal(build.model.fingerprint.canonical, "[]"); assert.equal(build.model.stateFingerprint.canonical, "[]");
  assert.throws(() => core.resolveEquipmentCombatBuild({ ...raw, profile: { realm_level: 1, build_revision: -1 } }), (error) => error.code === "COMBAT_EQUIPMENT_CONTENT_INVALID");
});
