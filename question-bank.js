(function (global) {
  "use strict";

  function getConfig() {
    var input = global.SUPABASE_CONFIG || {};
    return {
      url: typeof input.url === "string" ? input.url.trim().replace(/\/+$/, "") : "",
      publishableKey: typeof input.publishableKey === "string" ? input.publishableKey.trim() : ""
    };
  }

  function isConfigured() {
    var config = getConfig();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url) && config.publishableKey.length > 20;
  }

  function clampPoints(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.min(999, Math.max(0, Math.round(number)));
  }

  function normalizeAnswers(answers) {
    if (!Array.isArray(answers)) {
      return [];
    }

    return answers.map(function (answer) {
      return {
        text: answer && typeof answer.text === "string" ? answer.text.trim() : "",
        points: clampPoints(answer && answer.points)
      };
    }).filter(function (answer) {
      return answer.text;
    });
  }

  function normalizeQuestion(input) {
    var question = input && typeof input === "object" ? input : {};
    return {
      label: typeof question.label === "string" ? question.label.trim() : "",
      round: typeof question.round === "string" ? question.round.trim() : "",
      question: typeof question.question === "string" ? question.question.trim() : "",
      mode: question.mode === "choice" ? "choice" : "survey",
      answers: normalizeAnswers(question.answers)
    };
  }

  function validateQuestion(input) {
    var question = normalizeQuestion(input);
    var errors = [];

    if (!question.label) {
      errors.push("Escribe un nombre corto para identificar la pregunta.");
    }
    if (!question.round) {
      errors.push("Escribe el nombre o número de la ronda.");
    }
    if (!question.question) {
      errors.push("Escribe la pregunta.");
    }
    if (question.answers.length === 0) {
      errors.push("Agrega al menos una respuesta.");
    }
    if (question.mode === "choice" && !question.answers.some(function (answer) {
      return answer.points > 0;
    })) {
      errors.push("En opción múltiple debe existir al menos una respuesta correcta con puntos.");
    }

    return {
      value: question,
      errors: errors
    };
  }

  async function request(path, options) {
    if (!isConfigured()) {
      throw new Error("Supabase todavía no está configurado.");
    }

    var config = getConfig();
    var settings = options || {};
    var headers = Object.assign({
      apikey: config.publishableKey,
      Accept: "application/json"
    }, settings.headers || {});

    if (!config.publishableKey.startsWith("sb_publishable_")) {
      headers.Authorization = "Bearer " + config.publishableKey;
    }

    var response = await global.fetch(config.url + "/rest/v1/" + path, {
      method: settings.method || "GET",
      headers: headers,
      body: settings.body === undefined ? undefined : JSON.stringify(settings.body)
    });

    var text = await response.text();
    var data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        data = text;
      }
    }

    if (!response.ok) {
      var message = data && typeof data === "object" && data.message ? data.message : "No se pudo completar la operación.";
      var requestError = new Error(message);
      requestError.status = response.status;
      requestError.details = data;
      throw requestError;
    }

    return data;
  }

  async function list(options) {
    var settings = options || {};
    var archivedFilter = settings.archived === "all" ? "" : "&archived=eq." + (settings.archived ? "true" : "false");
    var path = "questions?select=id,label,round,question,mode,answers,archived,revision,created_at,updated_at" +
      archivedFilter + "&order=updated_at.desc";
    var data = await request(path);
    return Array.isArray(data) ? data : [];
  }

  async function create(input) {
    var validation = validateQuestion(input);
    if (validation.errors.length) {
      throw new Error(validation.errors.join(" "));
    }

    var data = await request("questions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: validation.value
    });
    return Array.isArray(data) ? data[0] : data;
  }

  async function update(id, input, expectedRevision) {
    var validation = validateQuestion(input);
    if (validation.errors.length) {
      throw new Error(validation.errors.join(" "));
    }

    var path = "questions?id=eq." + encodeURIComponent(id);
    if (Number(expectedRevision) > 0) {
      path += "&revision=eq." + encodeURIComponent(String(expectedRevision));
    }

    var data = await request(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: validation.value
    });

    if (!Array.isArray(data) || data.length === 0) {
      var conflict = new Error("La pregunta cambió en otro dispositivo. Recarga el banco antes de volver a guardar.");
      conflict.code = "QUESTION_CONFLICT";
      throw conflict;
    }
    return data[0];
  }

  async function setArchived(id, archived, expectedRevision) {
    var path = "questions?id=eq." + encodeURIComponent(id);
    if (Number(expectedRevision) > 0) {
      path += "&revision=eq." + encodeURIComponent(String(expectedRevision));
    }

    var data = await request(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: { archived: Boolean(archived) }
    });

    if (!Array.isArray(data) || data.length === 0) {
      var conflict = new Error("La pregunta cambió en otro dispositivo. Recarga el banco e inténtalo otra vez.");
      conflict.code = "QUESTION_CONFLICT";
      throw conflict;
    }
    return data[0];
  }

  global.QuestionBank = Object.freeze({
    isConfigured: isConfigured,
    validate: validateQuestion,
    list: list,
    create: create,
    update: update,
    setArchived: setArchived
  });
})(window);
