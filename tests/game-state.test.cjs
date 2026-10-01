const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const { test } = require("node:test");

// Expose the real closure to test game transitions without a browser or writes.
const source = fs.readFileSync(require.resolve("../app.js"), "utf8").replace(
  /\}\)\(\);\s*$/,
  "window.game = { loadPreset, revealAnswer, getState: () => state, presets: ALL_PRESET_ROUNDS }; })();"
);

function boot(stored) {
  let saved = stored === undefined ? null : JSON.stringify(stored);
  const sounds = [];
  const window = {
    localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; } },
    addEventListener() {},
    crypto: { randomUUID }
  };
  const document = { body: { dataset: { page: "test" } } };
  class Audio {
    constructor(src) { this.src = src; }
    play() { sounds.push(this.src); return Promise.resolve(); }
  }
  vm.runInNewContext(source, { window, document, Audio });
  return { game: window.game, sounds };
}

test("updates preserve a custom active round and its revealed answers", () => {
  const stored = {
    presetVersion: 4, question: "Mi pregunta", round: "Final", mode: "choice",
    strikes: 2, bankQuestionId: "saved-question", updatedAt: 123,
    answers: [{ id: "correct", text: "Respuesta", points: 75, revealed: true }]
  };
  const { game } = boot(stored);
  const state = game.getState();
  assert.equal(state.question, stored.question);
  assert.equal(state.round, "Final");
  assert.equal(state.strikes, 2);
  assert.equal(state.bankQuestionId, "saved-question");
  assert.equal(state.answers[0].points, 75);
  assert.equal(state.answers[0].revealed, true);
  assert.equal(state.presetVersion, 5);
});

test("old anniversary rounds recover choice mode without resetting the round", () => {
  const { game } = boot({
    presetVersion: 2, question: "¿Qué aniversario se celebra?", round: "Final", strikes: 1,
    answers: [{ id: "c", text: "52", points: 100, revealed: true }]
  });
  assert.equal(game.getState().mode, "choice");
  assert.equal(game.getState().round, "Final");
  assert.equal(game.getState().answers[0].revealed, true);
});

test("every included and original question opens and scores its answers", () => {
  const { game, sounds } = boot();
  assert.equal(game.presets.length, 12);
  for (const [index, preset] of game.presets.entries()) {
    for (const [answerIndex, answer] of preset.answers.entries()) {
      game.loadPreset(index);
      const id = game.getState().answers[answerIndex].id;
      game.revealAnswer(id, true);
      const state = game.getState();
      const wrong = preset.mode === "choice" && answer.points === 0;
      assert.equal(state.answers[answerIndex].revealed, true, preset.label);
      assert.equal(state.strikes, wrong ? 1 : 0, preset.label);
      assert.equal(sounds.at(-1), wrong ? "./assets/audio/sonido-incorrecto.wav" : "./assets/audio/respuesta-correcta.wav");
      game.revealAnswer(id, true);
      assert.equal(game.getState().strikes, wrong ? 1 : 0);
    }
  }
  const anniversary = game.presets.find((preset) => preset.label === "Aniversario correcto");
  assert.equal(anniversary.answers[2].text, "52");
  assert.equal(anniversary.answers[2].points, 100);
  assert.equal(anniversary.answers[0].points, 0);
});
