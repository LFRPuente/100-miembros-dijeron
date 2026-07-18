(function () {
  "use strict";

  var STORAGE_KEY = "cien_mex_game_state_v1";
  var CHANNEL_NAME = "cien_mex_live_board";
  var items = [];
  var answerDrafts = [];
  var busy = false;

  var connectionBadge = document.getElementById("connectionBadge");
  var statusElement = document.getElementById("bankStatus");
  var searchInput = document.getElementById("bankSearch");
  var showArchivedInput = document.getElementById("showArchived");
  var listElement = document.getElementById("bankList");
  var countElement = document.getElementById("bankCount");
  var form = document.getElementById("questionForm");
  var formTitle = document.getElementById("bankFormTitle");
  var idInput = document.getElementById("questionId");
  var revisionInput = document.getElementById("questionRevision");
  var labelInput = document.getElementById("bankLabel");
  var roundInput = document.getElementById("bankRound");
  var modeInput = document.getElementById("bankMode");
  var questionInput = document.getElementById("bankQuestion");
  var answerHelp = document.getElementById("answerHelp");
  var answerList = document.getElementById("bankAnswerList");
  var addAnswerButton = document.getElementById("addBankAnswer");
  var cancelButton = document.getElementById("cancelQuestion");
  var saveButton = document.getElementById("saveQuestion");
  var newButton = document.getElementById("newQuestion");

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function setStatus(message, tone) {
    statusElement.textContent = message || "";
    statusElement.dataset.tone = tone || "";
  }

  function setBusy(nextBusy) {
    busy = nextBusy;
    saveButton.disabled = busy || !window.QuestionBank.isConfigured();
    newButton.disabled = busy;
    addAnswerButton.disabled = busy;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function normalizeDraftAnswer(answer) {
    return {
      id: answer && answer.id ? String(answer.id) : uid(),
      text: answer && typeof answer.text === "string" ? answer.text : "",
      points: Math.min(999, Math.max(0, Math.round(Number(answer && answer.points) || 0)))
    };
  }

  function resetForm() {
    idInput.value = "";
    revisionInput.value = "";
    labelInput.value = "";
    roundInput.value = "";
    modeInput.value = "survey";
    questionInput.value = "";
    answerDrafts = [normalizeDraftAnswer({ text: "", points: 0 })];
    formTitle.textContent = "Nueva pregunta";
    saveButton.textContent = "Guardar permanentemente";
    updateModeHelp();
    renderAnswers();
  }

  function editQuestion(item) {
    idInput.value = item.id;
    revisionInput.value = String(item.revision || 1);
    labelInput.value = item.label || "";
    roundInput.value = item.round || "";
    modeInput.value = item.mode === "choice" ? "choice" : "survey";
    questionInput.value = item.question || "";
    answerDrafts = Array.isArray(item.answers) ? item.answers.map(normalizeDraftAnswer) : [];
    if (answerDrafts.length === 0) {
      answerDrafts.push(normalizeDraftAnswer({ text: "", points: 0 }));
    }
    formTitle.textContent = "Editar pregunta";
    saveButton.textContent = "Guardar cambios";
    updateModeHelp();
    renderAnswers();
    form.scrollIntoView({ behavior: "smooth", block: "start" });
    labelInput.focus();
  }

  function updateModeHelp() {
    answerHelp.textContent = modeInput.value === "choice"
      ? "Las opciones incorrectas llevan 0 puntos; asigna puntos a la correcta."
      : "Para respuesta directa agrega una sola; para encuesta agrega varias con sus puntos.";
  }

  function moveAnswer(from, to) {
    if (to < 0 || to >= answerDrafts.length) {
      return;
    }
    var moved = answerDrafts.splice(from, 1)[0];
    answerDrafts.splice(to, 0, moved);
    renderAnswers();
  }

  function removeAnswer(id) {
    answerDrafts = answerDrafts.filter(function (answer) {
      return answer.id !== id;
    });
    if (answerDrafts.length === 0) {
      answerDrafts.push(normalizeDraftAnswer({ text: "", points: 0 }));
    }
    renderAnswers();
  }

  function renderAnswers() {
    answerList.replaceChildren();

    answerDrafts.forEach(function (answer, index) {
      var row = document.createElement("div");
      row.className = "bank-answer-row";

      var order = document.createElement("div");
      order.className = "order-tools";

      var number = document.createElement("span");
      number.className = "bank-answer-number";
      number.textContent = String(index + 1);

      var up = document.createElement("button");
      up.type = "button";
      up.className = "icon-button";
      up.innerHTML = "&uarr;";
      up.disabled = busy || index === 0;
      up.setAttribute("aria-label", "Subir respuesta");
      up.addEventListener("click", function () {
        moveAnswer(index, index - 1);
      });

      var down = document.createElement("button");
      down.type = "button";
      down.className = "icon-button";
      down.innerHTML = "&darr;";
      down.disabled = busy || index === answerDrafts.length - 1;
      down.setAttribute("aria-label", "Bajar respuesta");
      down.addEventListener("click", function () {
        moveAnswer(index, index + 1);
      });

      order.append(number, up, down);

      var textInput = document.createElement("input");
      textInput.type = "text";
      textInput.maxLength = 200;
      textInput.placeholder = "Respuesta";
      textInput.value = answer.text;
      textInput.required = true;
      textInput.addEventListener("input", function () {
        answer.text = textInput.value;
      });

      var pointsInput = document.createElement("input");
      pointsInput.type = "number";
      pointsInput.min = "0";
      pointsInput.max = "999";
      pointsInput.value = String(answer.points);
      pointsInput.setAttribute("aria-label", "Puntos de la respuesta " + (index + 1));
      pointsInput.addEventListener("input", function () {
        answer.points = Math.min(999, Math.max(0, Math.round(Number(pointsInput.value) || 0)));
      });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button remove-button";
      remove.innerHTML = "&times;";
      remove.disabled = busy;
      remove.setAttribute("aria-label", "Eliminar respuesta");
      remove.addEventListener("click", function () {
        removeAnswer(answer.id);
      });

      row.append(order, textInput, pointsInput, remove);
      answerList.appendChild(row);
    });
  }

  function buildQuestionPayload() {
    return {
      label: labelInput.value,
      round: roundInput.value,
      question: questionInput.value,
      mode: modeInput.value,
      answers: answerDrafts.map(function (answer) {
        return {
          text: answer.text,
          points: answer.points
        };
      })
    };
  }

  function visibleItems() {
    var search = searchInput.value.trim().toLocaleLowerCase("es");
    var includeArchived = showArchivedInput.checked;

    return items.filter(function (item) {
      if (item.archived && !includeArchived) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [item.label, item.round, item.question].some(function (value) {
        return typeof value === "string" && value.toLocaleLowerCase("es").includes(search);
      });
    });
  }

  function makeButton(label, className, handler) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.disabled = busy;
    button.addEventListener("click", handler);
    return button;
  }

  function renderList() {
    var visible = visibleItems();
    listElement.replaceChildren();
    countElement.textContent = String(visible.length);

    if (!window.QuestionBank.isConfigured()) {
      var configEmpty = document.createElement("div");
      configEmpty.className = "bank-empty";
      configEmpty.innerHTML = "<strong>Falta conectar Supabase</strong><span>Agrega la URL y la clave publicable para activar el banco compartido.</span>";
      listElement.appendChild(configEmpty);
      return;
    }

    if (visible.length === 0) {
      var empty = document.createElement("div");
      empty.className = "bank-empty";
      var emptyTitle = document.createElement("strong");
      emptyTitle.textContent = items.length ? "No hay coincidencias" : "Aún no hay preguntas guardadas";
      var emptyText = document.createElement("span");
      emptyText.textContent = items.length ? "Prueba otra búsqueda o muestra las archivadas." : "Crea la primera con el formulario.";
      empty.append(emptyTitle, emptyText);
      listElement.appendChild(empty);
      return;
    }

    visible.forEach(function (item) {
      var card = document.createElement("article");
      card.className = "bank-question-card" + (item.archived ? " is-archived" : "");

      var heading = document.createElement("div");
      heading.className = "bank-question-heading";

      var titleWrap = document.createElement("div");
      var label = document.createElement("p");
      label.className = "eyebrow";
      label.textContent = item.label;
      var title = document.createElement("h3");
      title.textContent = item.question;
      titleWrap.append(label, title);

      var mode = document.createElement("span");
      mode.className = "bank-mode";
      mode.textContent = item.mode === "choice" ? "Opción múltiple" : "Respuestas con puntos";
      heading.append(titleWrap, mode);

      var meta = document.createElement("p");
      meta.className = "bank-question-meta";
      meta.textContent = item.round + " · " + (Array.isArray(item.answers) ? item.answers.length : 0) +
        " respuestas · v" + (item.revision || 1) + " · " + formatDate(item.updated_at);

      var actions = document.createElement("div");
      actions.className = "bank-question-actions";

      if (!item.archived) {
        actions.appendChild(makeButton("Usar", "primary-button", function () {
          useQuestion(item);
        }));
        actions.appendChild(makeButton("Editar", "plain-button", function () {
          editQuestion(item);
        }));
        actions.appendChild(makeButton("Archivar", "plain-button danger", function () {
          changeArchived(item, true);
        }));
      } else {
        actions.appendChild(makeButton("Restaurar", "plain-button", function () {
          changeArchived(item, false);
        }));
      }

      card.append(heading, meta, actions);
      listElement.appendChild(card);
    });
  }

  async function refresh(options) {
    if (!window.QuestionBank.isConfigured()) {
      connectionBadge.textContent = "Sin configurar";
      connectionBadge.dataset.tone = "warning";
      setStatus("El módulo está listo, pero todavía falta conectar el proyecto gratuito.", "warning");
      setBusy(false);
      renderList();
      return;
    }

    var settings = options || {};
    setBusy(true);
    connectionBadge.textContent = "Conectando";
    connectionBadge.dataset.tone = "";
    if (!settings.quiet) {
      setStatus("Cargando preguntas…");
    }

    try {
      items = await window.QuestionBank.list({ archived: "all" });
      connectionBadge.textContent = "Conectado";
      connectionBadge.dataset.tone = "success";
      setStatus(items.length + (items.length === 1 ? " pregunta guardada." : " preguntas guardadas."), "success");
    } catch (error) {
      connectionBadge.textContent = "Sin conexión";
      connectionBadge.dataset.tone = "error";
      setStatus(error.message, "error");
    } finally {
      setBusy(false);
      renderList();
    }
  }

  async function submitQuestion(event) {
    event.preventDefault();
    if (busy) {
      return;
    }

    var validation = window.QuestionBank.validate(buildQuestionPayload());
    if (validation.errors.length) {
      setStatus(validation.errors.join(" "), "error");
      return;
    }

    setBusy(true);
    setStatus(idInput.value ? "Guardando cambios…" : "Guardando pregunta…");

    try {
      if (idInput.value) {
        await window.QuestionBank.update(idInput.value, validation.value, Number(revisionInput.value));
        setStatus("Pregunta actualizada y versión anterior conservada.", "success");
      } else {
        await window.QuestionBank.create(validation.value);
        setStatus("Pregunta guardada permanentemente.", "success");
      }
      resetForm();
      await refresh({ quiet: true });
    } catch (error) {
      setStatus(error.message, "error");
      if (error.code === "QUESTION_CONFLICT") {
        await refresh({ quiet: true });
      }
    } finally {
      setBusy(false);
      renderAnswers();
    }
  }

  async function changeArchived(item, archived) {
    if (busy) {
      return;
    }

    var verb = archived ? "archivar" : "restaurar";
    if (archived && !window.confirm("La pregunta dejará de aparecer en el juego, pero su historial no se borrará. ¿Deseas archivarla?")) {
      return;
    }

    setBusy(true);
    setStatus("Intentando " + verb + " la pregunta…");
    try {
      await window.QuestionBank.setArchived(item.id, archived, item.revision);
      setStatus(archived ? "Pregunta archivada; el historial se conservó." : "Pregunta restaurada.", "success");
      await refresh({ quiet: true });
    } catch (error) {
      setStatus(error.message, "error");
      await refresh({ quiet: true });
    } finally {
      setBusy(false);
    }
  }

  function useQuestion(item) {
    var gameState = {
      presetVersion: 5,
      bankQuestionId: item.id,
      round: item.round,
      question: item.question,
      mode: item.mode === "choice" ? "choice" : "survey",
      strikes: 0,
      answers: (item.answers || []).map(function (answer) {
        return {
          id: uid(),
          text: answer.text,
          points: Math.min(999, Math.max(0, Math.round(Number(answer.points) || 0))),
          revealed: false
        };
      }),
      updatedAt: Date.now()
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
    if ("BroadcastChannel" in window) {
      var channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(gameState);
      channel.close();
    }
    window.location.href = "./control.html";
  }

  searchInput.addEventListener("input", renderList);
  showArchivedInput.addEventListener("change", renderList);
  modeInput.addEventListener("change", updateModeHelp);
  form.addEventListener("submit", submitQuestion);
  addAnswerButton.addEventListener("click", function () {
    answerDrafts.push(normalizeDraftAnswer({ text: "", points: 0 }));
    renderAnswers();
  });
  cancelButton.addEventListener("click", resetForm);
  newButton.addEventListener("click", function () {
    resetForm();
    labelInput.focus();
  });

  resetForm();
  refresh();
})();
