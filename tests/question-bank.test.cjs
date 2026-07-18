const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = [];
const responses = [];

function queueResponse(data, status = 200) {
  responses.push({ data, status });
}

const window = {
  SUPABASE_CONFIG: {
    url: "https://example-project.supabase.co",
    publishableKey: "sb_publishable_example_key_long_enough_for_testing"
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    if (!response) {
      throw new Error("No mock response queued");
    }
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => JSON.stringify(response.data)
    };
  }
};

vm.runInNewContext(
  fs.readFileSync(require.resolve("../question-bank.js"), "utf8"),
  { window, Date, JSON, Number, Object, Array, Error, RegExp, String, Boolean, Math, encodeURIComponent }
);

const bank = window.QuestionBank;

async function run() {
  assert.equal(bank.isConfigured(), true);

  const invalidChoice = bank.validate({
    label: "Prueba",
    round: "Ronda 1",
    question: "¿Cuál?",
    mode: "choice",
    answers: [{ text: "A", points: 0 }]
  });
  assert.equal(invalidChoice.errors.length, 1);

  queueResponse([{
    id: "q1",
    label: "Prueba",
    round: "Ronda 1",
    question: "¿Cuál?",
    mode: "survey",
    answers: [{ text: "A", points: 10 }],
    archived: false,
    revision: 1
  }]);
  const listed = await bank.list({ archived: false });
  assert.equal(listed.length, 1);
  assert.match(calls.at(-1).url, /archived=eq\.false/);
  assert.equal(calls.at(-1).options.headers.apikey, window.SUPABASE_CONFIG.publishableKey);
  assert.equal(calls.at(-1).options.headers.Authorization, undefined);

  queueResponse([{ ...listed[0] }], 201);
  const created = await bank.create({
    label: " Prueba ",
    round: " Ronda 1 ",
    question: " ¿Cuál? ",
    mode: "survey",
    answers: [{ text: " A ", points: 10 }]
  });
  assert.equal(created.id, "q1");
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(JSON.parse(calls.at(-1).options.body).answers[0].text, "A");

  queueResponse([{ ...listed[0], revision: 2 }]);
  const updated = await bank.update("q1", created, 1);
  assert.equal(updated.revision, 2);
  assert.match(calls.at(-1).url, /revision=eq\.1/);

  queueResponse([]);
  await assert.rejects(
    () => bank.update("q1", created, 1),
    (error) => error.code === "QUESTION_CONFLICT"
  );

  queueResponse([{ ...listed[0], archived: true, revision: 2 }]);
  const archived = await bank.setArchived("q1", true, 1);
  assert.equal(archived.archived, true);

  console.log("question-bank tests: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
