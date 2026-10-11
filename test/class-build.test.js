"use strict";
const assert = require("node:assert/strict"); const test = require("node:test"); const core = require("..");
test("C4A resolves class contributions and immutable level-five skills without executable mechanics", () => { const neutral = core.resolveClassBuild({ profile: { realm_level: 1, build_revision: 0, class_key: null, specialization_key: null } }); assert.equal(neutral.skills.length, 0); assert.equal(neutral.resolvedStats.power, core.calculateBaseStats(1).power); const expectations = { vanguard: ["breach", "hp", 12], guardian: ["guarded_strike", "hp", 18], ranger: ["precise_shot", "accuracy", 3], arcanist: ["arc_bolt", "potency", 4], alchemist: ["corrosive_flask", "luck", 1], reaver: ["rend", "power", 2] }; for (const [classKey, [skill, stat, amount]] of Object.entries(expectations)) { const build = core.resolveClassBuild({ profile: { realm_level: 5, build_revision: 0, class_key: classKey, specialization_key: null } }); assert.equal(build.skills[0].key, skill); assert.equal(build.classContributions[stat], amount); } assert.throws(() => core.resolveClassBuild({ profile: { realm_level: 5, build_revision: 0, class_key: "invalid", specialization_key: null } })); });

test("C4A V3 preserves canonical equipment precision while adding every class contribution", () => {
  const equipment = { hp: 34.185, defense: 21.3325, accuracy: 1.59, dodge: .53 };
  const neutral = core.resolveClassBuild({ profile: { realm_level: 8, build_revision: "8", class_key: null, specialization_key: null }, equipmentContributions: equipment });
  const reaver = core.resolveClassBuild({ profile: { realm_level: 8, build_revision: "8", class_key: "reaver", specialization_key: null }, equipmentContributions: equipment });
  assert.deepEqual(reaver.equipmentContributions, equipment);
  assert.deepEqual(reaver.resolvedStats, { hp: 218.185, power: 20, defense: 35.3325, crit_chance: 5, crit_damage: 155, accuracy: 1.59, dodge: 5.53, lifesteal: 2, resistance: 0, potency: 0, luck: 0, armor_penetration: 0, damage_reduction: 0, status_chance: 0, cooldown_reduction: 0, execute_threshold: 1, block: 0 });
  assert.equal(reaver.resolvedStats.defense - neutral.resolvedStats.defense, 0);
  const expected = { vanguard: { hp: 12, power: 2, armor_penetration: 1 }, guardian: { hp: 18, defense: 2, block: 2, damage_reduction: 1 }, ranger: { power: 1, accuracy: 3, crit_chance: 2, dodge: 1 }, arcanist: { power: 1, potency: 4, status_chance: 1 }, alchemist: { hp: 6, resistance: 2, potency: 3, luck: 1, status_chance: 1 }, reaver: { power: 2, crit_damage: 5, lifesteal: 2, execute_threshold: 1 } };
  for (const [classKey, contribution] of Object.entries(expected)) {
    const build = core.resolveClassBuild({ profile: { realm_level: 8, build_revision: "8", class_key: classKey, specialization_key: null }, equipmentContributions: equipment });
    for (const key of Object.keys(build.classContributions)) assert.equal(build.classContributions[key], contribution[key] ?? 0, `${classKey}.${key}`);
  }
});
