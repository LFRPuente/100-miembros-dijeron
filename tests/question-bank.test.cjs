const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = [];
const responses = [];
const storage = new Map();

function queueResponse(data, status = 200) {
  responses.push({ data, status });
}

const window = {
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  AbortController,
  setTimeout,
  clearTimeout,
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
    if (response.error) {
      throw response.error;
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

  const activeItem = { ...listed[0], archived: false };
  const archivedItem = { ...listed[0], id: "q2", archived: true };
  queueResponse([activeItem, archivedItem]);
  await bank.list({ archived: "all" });
  assert.equal(bank.getStatus().source, "remote");

  responses.push({ error: new TypeError("fetch failed") });
  const offline = await bank.list({ archived: false });
  assert.equal(offline.length, 1);
  assert.equal(offline[0].id, "q1");
  assert.equal(bank.getStatus().source, "cache");

  responses.push({ error: new TypeError("fetch failed") });
  await assert.rejects(() => bank.create(activeItem), (error) => error.code === "BANK_UNAVAILABLE");

  queueResponse({ message: "Invalid API key" }, 401);
  await assert.rejects(() => bank.list(), (error) => error.status === 401);

  // A restored question must replace its archived copy, not duplicate it.
  queueResponse([activeItem, { ...archivedItem, archived: false }]);
  await bank.list({ archived: false });
  responses.push({ error: new TypeError("fetch failed") });
  assert.equal((await bank.list({ archived: "all" })).length, 2);

  window.SUPABASE_CONFIG.url = "https://another-project.supabase.co";
  responses.push({ error: new TypeError("fetch failed") });
  await assert.rejects(() => bank.list(), (error) => error.code === "BANK_UNAVAILABLE");

  const multipleCorrect = bank.validate({
    ...activeItem, mode: "choice", answers: [{ text: "A", points: 100 }, { text: "B", points: 100 }]
  });
  assert.equal(multipleCorrect.errors.length, 1);

  let timeoutDelay;
  window.setTimeout = (callback, delay) => { timeoutDelay = delay; return setTimeout(callback, 1); };
  window.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  await assert.rejects(() => bank.list(), (error) => error.code === "BANK_UNAVAILABLE");
  assert.equal(timeoutDelay, 8000);

  console.log("question-bank tests: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
