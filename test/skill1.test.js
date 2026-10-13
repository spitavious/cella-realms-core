"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("..");
const keys = { breach: "vanguard", guarded_strike: "guardian", precise_shot: "ranger", arc_bolt: "arcanist", corrosive_flask: "alchemist", rend: "reaver" };
const seq = (values) => { let i = 0; return () => values[i++] ?? .99; };
function state(key, extra = {}) { const level = extra.level ?? 5; const player = { level, classKey: extra.classKey ?? keys[key], specializationKey: null, skills: extra.skills ?? [{ key, class_key: extra.classKey ?? keys[key], specialization_key: null, unlock_level: 5 }], stats: { ...core.calculateBaseStats(level), ...(extra.stats || {}) }, weapon: core.TRAINING_SWORD }; const value = core.createSoloHuntState({ combatId: "skill1", guildId: "g", playerId: "u", player, weapon: core.TRAINING_SWORD, buildSnapshot: { buildSnapshotVersion: 3 }, encounterKey: "mossback_grazer", createdAt: 0 }); value.enemy.currentHp = value.enemy.maxHp = extra.enemyHp ?? 100; value.enemy.stats = { ...value.enemy.stats, defense: extra.enemyDefense ?? 0, dodge: 0 }; return value; }
function skill(value, key, rng = seq([0, 0, .99, 0, 0, .99])) { return core.resolveCombatAction({ state: value, action: { type: "skill", skillKey: key }, nowMs: value.nextActionAt, expectedVersion: value.version, rng }); }

test("every approved Skill 1 resolves only from its frozen V3 class snapshot", () => {
  for (const [key, classKey] of Object.entries(keys)) { const result = skill(state(key), key); assert.equal(result.events[0].metadata.skillKey, key); assert.equal(result.state.player.skillCooldowns[key], 2); const wrongClass = classKey === "reaver" ? "vanguard" : "reaver"; assert.throws(() => skill(state(key, { classKey: wrongClass, skills: [{ key, class_key: classKey, specialization_key: null, unlock_level: 5 }] }), key), { code: "COMBAT_SKILL_UNAVAILABLE" }); }
  assert.throws(() => skill(state("breach"), "not_real"), { code: "COMBAT_INVALID_ACTION" });
  const v2 = state("breach"); v2.schemaVersion = 2; assert.throws(() => skill(v2, "breach"), { code: "COMBAT_SKILL_UNAVAILABLE" });
});
test("Breach and Precise Shot use temporary capped modifiers without mutating snapshots", () => {
  const breach = state("breach", { stats: { armor_penetration: 50 }, enemyDefense: 100 }); const b = skill(breach, "breach"); assert.equal(b.events[0].metadata.multiplier, 1.3); assert.equal(b.events[0].metadata.bonusArmorPenetration, 25); assert.equal(breach.player.stats.armor_penetration, 50); assert.equal(b.playerAttack.effectiveDefense, 40);
  const precise = state("precise_shot", { stats: { crit_chance: 55, accuracy: 1 } }); const p = skill(precise, "precise_shot"); assert.equal(p.playerAttack.critChance, 60); assert.equal(precise.player.stats.crit_chance, 55); assert.equal(p.events[0].metadata.bonusAccuracy, 20);
});
test("Arc Bolt potency and Guarded Strike counter contracts are deterministic", () => {
  for (const [potency, multiplier] of [[0,1.2],[4,1.28],[10,1.4],[15,1.5],[99,1.5]]) assert.equal(skill(state("arc_bolt", { stats: { potency } }), "arc_bolt").events[0].metadata.multiplier, multiplier);
  const normal = skill(state("guarded_strike"), "guarded_strike", seq([0,0,.99,0,0,.99])); assert.equal(normal.events[0].metadata.multiplier, 1.1); assert.equal(normal.enemyAttack.finalDamage >= 1, true); assert.equal(normal.events.some(e => e.type === "guarded_strike_guard"), true);
});
test("Corrosive Flask persists, consumes exactly two later accepted actions, and refreshes instead of stacking", () => {
  const first = skill(state("corrosive_flask"), "corrosive_flask"); assert.equal(first.state.enemy.statuses[0].remainingPlayerActions, 2); const one = core.resolveCombatAction({ state:first.state, action:{type:"basic_attack"}, nowMs:first.state.nextActionAt, expectedVersion:first.state.version, rng:seq([0,0,.99,0,0,.99]) }); assert.equal(one.state.enemy.statuses[0].remainingPlayerActions, 1); const two = core.resolveCombatAction({ state:one.state, action:{type:"basic_attack"}, nowMs:one.state.nextActionAt, expectedVersion:one.state.version, rng:seq([0,0,.99,0,0,.99]) }); assert.equal(two.state.enemy.statuses.length, 0); const reloaded = JSON.parse(JSON.stringify(first.state)); assert.doesNotThrow(() => core.validateCombatState(reloaded));
});
