"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const core = require("..");

const rend = Object.freeze({ key: "rend", display_name: "Rend", class_key: "reaver", specialization_key: null, unlock_level: 5 });
const sequence = (values) => { let index = 0; return () => values[index++] ?? 0; };
const clone = (value) => JSON.parse(JSON.stringify(value));
function reaverState({ level = 5, classKey = "reaver", skills = [rend], executeThreshold = 1, enemyHp = 100, enemyDefense = 0, armorPenetration = 0 } = {}) {
  const stats = { ...core.calculateBaseStats(level), execute_threshold: executeThreshold, armor_penetration: armorPenetration };
  const state = core.createSoloHuntState({ combatId: "00000000-0000-4000-8000-000000000501", guildId: "guild", playerId: "user", player: { level, stats, weapon: core.TRAINING_SWORD, classKey, specializationKey: null, skills }, weapon: core.TRAINING_SWORD, buildSnapshot: { buildSnapshotVersion: 3 }, encounterKey: "mossback_grazer", createdAt: 0 });
  state.enemy.maxHp = 100; state.enemy.currentHp = enemyHp; state.enemy.stats = { ...state.enemy.stats, defense: enemyDefense, dodge: 0 }; state.enemy.weapon = core.TRAINING_SWORD;
  return state;
}
function action(state, nowMs = state.nextActionAt, rng = sequence([0, 0, .99, 0, 0, .99])) { return core.resolveCombatAction({ state, action: { type: "skill", skillKey: "rend" }, nowMs, expectedVersion: state.version, rng }); }

test("Rend eligibility comes only from the frozen V3 Reaver skill snapshot", () => {
  assert.throws(() => action(reaverState({ level: 4 })), (error) => error.code === "COMBAT_SKILL_UNAVAILABLE");
  assert.throws(() => action(reaverState({ classKey: "ranger" })), (error) => error.code === "COMBAT_SKILL_UNAVAILABLE");
  assert.throws(() => action(reaverState({ skills: [] })), (error) => error.code === "COMBAT_SKILL_UNAVAILABLE");
  const valid = action(reaverState());
  assert.equal(valid.events[0].type, "skill_used");
  assert.equal(valid.events[0].metadata.skillKey, "rend");
  const v2 = core.createSoloHuntState({ combatId: "v2", guildId: "guild", playerId: "user", player: { level: 5 }, weapon: core.TRAINING_SWORD, buildSnapshot: { buildSnapshotVersion: 2 }, encounterKey: "mossback_grazer", createdAt: 0 });
  assert.throws(() => core.resolveCombatAction({ state: v2, action: { type: "skill", skillKey: "rend" }, nowMs: 0, expectedVersion: 1, rng: () => 0 }), (error) => error.code === "COMBAT_SKILL_UNAVAILABLE");
  assert.throws(() => core.resolveCombatAction({ state: reaverState(), action: { type: "skill", skillKey: "breach" }, nowMs: 0, expectedVersion: 1, rng: () => 0 }), (error) => error.code === "COMBAT_INVALID_ACTION");
});

test("Rend uses the shared direct-damage pipeline at its exact base and finishing multipliers", () => {
  const normal = action(reaverState({ enemyHp: 32 }), 0, sequence([0, 0, .99, 0, 0, .99]));
  assert.equal(normal.playerAttack.rawDamage, 6 * 1.35 + normal.state.player.stats.power * .5);
  assert.equal(normal.events[0].metadata.multiplier, 1.35);
  assert.equal(normal.events.some((entry) => entry.type === "rend_finishing_pressure"), false);
  const boundary = action(reaverState({ enemyHp: 31 }), 0, sequence([0, 0, .99, 0, 0, .99]));
  assert.equal(boundary.playerAttack.rawDamage, 6 * 1.65 + boundary.state.player.stats.power * .5);
  assert.equal(boundary.events[0].metadata.finishingThreshold, 31);
  assert.equal(boundary.events.some((entry) => entry.type === "rend_finishing_pressure"), true);
  const above = action(reaverState({ enemyHp: 31.001 }), 0, sequence([0, 0, .99, 0, 0, .99]));
  assert.equal(above.events[0].metadata.multiplier, 1.35);
  const defended = action(reaverState({ enemyDefense: 100 }), 0, sequence([0, 0, .99, 0, 0, .99]));
  const pierced = action(reaverState({ enemyDefense: 100, armorPenetration: 50 }), 0, sequence([0, 0, .99, 0, 0, .99]));
  assert.ok(defended.playerAttack.finalDamage < pierced.playerAttack.finalDamage);
});

test("Rend misses, crits, counters, and kills through the ordinary exchange rules", () => {
  const missed = action(reaverState(), 0, sequence([.999, 0, 0, 0]));
  assert.equal(missed.playerAttack.hit, false); assert.equal(missed.state.player.skillCooldowns.rend, 2);
  assert.ok(missed.enemyAttack, "a surviving enemy counterattacks after a Rend miss");
  const critical = action(reaverState(), 0, sequence([0, 0, 0, 0, 0, 0]));
  assert.equal(critical.playerAttack.critical, true);
  const killingState = reaverState({ enemyHp: 1 });
  const kill = action(killingState, 0, sequence([0, 0, .99]));
  assert.equal(kill.state.status, "victory"); assert.equal(kill.enemyAttack, null);
});

test("Rend cooldown is persisted as two accepted subsequent player actions", () => {
  const first = action(reaverState());
  assert.deepEqual(first.state.player.skillCooldowns, { rend: 2 });
  assert.throws(() => action(first.state, first.state.nextActionAt), (error) => error.code === "COMBAT_SKILL_COOLDOWN");
  assert.equal(first.state.player.skillCooldowns.rend, 2, "rejected actions never mutate the frozen state");
  const basicOne = core.resolveCombatAction({ state: first.state, action: { type: "basic_attack" }, nowMs: first.state.nextActionAt, expectedVersion: first.state.version, rng: sequence([0, 0, .99, 0, 0, .99]) });
  assert.equal(basicOne.state.player.skillCooldowns.rend, 1);
  const basicTwo = core.resolveCombatAction({ state: basicOne.state, action: { type: "basic_attack" }, nowMs: basicOne.state.nextActionAt, expectedVersion: basicOne.state.version, rng: sequence([0, 0, .99, 0, 0, .99]) });
  assert.equal(basicTwo.state.player.skillCooldowns.rend, 0);
  const reenabled = action(basicTwo.state, basicTwo.state.nextActionAt);
  assert.equal(reenabled.state.player.skillCooldowns.rend, 2);
  const reloaded = clone(first.state);
  assert.equal(core.validateCombatState(reloaded).player.skillCooldowns.rend, 2, "reload/resume retains the persisted cooldown");
});

test("Rend is deterministic and does not introduce Lifesteal execution", () => {
  const source = reaverState(); source.player.currentHp = source.player.maxHp - 10; source.player.stats.lifesteal = 2;
  const one = action(source, 0, sequence([0, .5, .99, 0, .5, .99]));
  const two = action(clone(source), 0, sequence([0, .5, .99, 0, .5, .99]));
  assert.deepEqual(one, two);
  assert.equal(one.state.player.currentHp, source.player.currentHp - one.enemyAttack.finalDamage, "Rend does not add a new Lifesteal mechanic");
});
