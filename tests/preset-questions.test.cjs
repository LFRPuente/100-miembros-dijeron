const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
const marker = "var PRESET_ROUNDS = ";
const start = source.indexOf(marker);
const end = source.indexOf("];", start) + 1;

assert.notEqual(start, -1, "No se encontró PRESET_ROUNDS");
assert.notEqual(end, 0, "No se encontró el final de PRESET_ROUNDS");

const rounds = vm.runInNewContext(source.slice(start + marker.length, end));

assert.equal(rounds.length, 6);
assert.equal(rounds[0].question, "¿En qué fecha se estableció la OSG?");
assert.equal(rounds[0].mode, "choice");
assert.equal(
  JSON.stringify(rounds[0].answers.map(({ text, points }) => [text, points])),
  JSON.stringify([
    ["10 de enero de 1965", 0],
    ["27 de septiembre de 1973", 100],
    ["3 de octubre de 1986", 0]
  ])
);
assert.equal(rounds[1].answers[0].text, "Oficina de Servicios Generales");
assert.equal(rounds[2].mode, "choice");
assert.equal(rounds[2].answers[1].text, "Envió una carta para leer en todo el país");
assert.equal(rounds[2].answers[1].points, 100);
assert.equal(rounds[3].answers[0].text, "Para ayudar a familiares y amigos de alcohólicos");
assert.equal(rounds[4].answers[0].text, "Octubre");
assert.equal(rounds[5].answers[0].text, "Unidos en pensamiento y acción");

console.log("preset question tests: ok");
