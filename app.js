(function () {
  "use strict";

  var STORAGE_KEY = "cien_mex_game_state_v1";
  var CHANNEL_NAME = "cien_mex_live_board";
  var PRESET_VERSION = 4;
  var LEGACY_DEFAULT_QUESTION = "Nombra algo que encuentras en una fiesta mexicana";
  var ANNIVERSARY_QUESTION = "¿Qué aniversario se celebra?";
  var CHOICE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var PRESET_ROUNDS = [
    {
      label: "Acontecimiento del CNS",
      round: "Pregunta 1",
      question: "¿Qué acontecimiento se celebra mediante el Congreso Nacional Simultáneo?",
      answers: [
        { text: "El aniversario de la OSG", points: 100 }
      ]
    },
    {
      label: "Unidos en...",
      round: "Pregunta 2",
      question: "Completa la oración: \"Unidos en...\"",
      answers: [
        { text: "Pensamiento y acción", points: 100 }
      ]
    },
    {
      label: "Al llegar a un congreso",
      round: "Pregunta 3",
      question: "Menciona algo que una persona hace al llegar a un congreso o seminario",
      answers: [
        { text: "Registrarse", points: 50 },
        { text: "Saludar", points: 30 },
        { text: "Buscar su lugar", points: 20 }
      ]
    },
    {
      label: "Aprovechar una reunión",
      round: "Pregunta 4",
      question: "Menciona algo que necesitas para aprovechar mejor una reunión o Congreso",
      answers: [
        { text: "Escuchar", points: 30 },
        { text: "Tener la mente abierta", points: 25 },
        { text: "Poner atención", points: 20 },
        { text: "Participar", points: 15 },
        { text: "Tener disposición", points: 6 },
        { text: "Llegar a tiempo", points: 4 }
      ]
    },
    {
      label: "Aniversario correcto",
      round: "Pregunta 5",
      question: "¿Qué aniversario se celebra?",
      mode: "choice",
      answers: [
        { text: "36", points: 0 },
        { text: "41", points: 0 },
        { text: "52", points: 100 }
      ]
    },
    {
      label: "Materiales del comité central",
      round: "Pregunta 6",
      question: "Menciona algo que el comité central proporciona o envía a las áreas para realizar el congreso",
      answers: [
        { text: "Programa", points: 50 },
        { text: "Gafetes", points: 30 },
        { text: "Información", points: 20 }
      ]
    }
  ];
  var channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  var state = normalizeState(loadState());
  var page = document.body.dataset.page;
  var boardHasRendered = false;
  var boardRevealedIds = new Set();
  var boardStrikeCount = state.strikes;
  var suppressNextStrikeOverlaySound = false;
  var savedQuestions = [];
  var questionOptionsSignature = null;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function defaultState() {
    return stateFromPreset(0);
  }

  function stateFromPreset(index) {
    var preset = PRESET_ROUNDS[index] || PRESET_ROUNDS[0];
    return {
      presetVersion: PRESET_VERSION,
      bankQuestionId: "",
      round: preset.round,
      question: preset.question,
      mode: preset.mode === "choice" ? "choice" : "survey",
      strikes: 0,
      answers: createAnswers(preset.answers),
      updatedAt: Date.now()
    };
  }

  function createAnswers(answers) {
    return answers.map(function (answer) {
      return {
        id: uid(),
        text: answer.text,
        points: answer.points,
        revealed: false
      };
    });
  }

  function normalizeState(input) {
    var base = defaultState();
    var next = input && typeof input === "object" ? input : base;
    var answers = Array.isArray(next.answers) ? next.answers : base.answers;
    var question = typeof next.question === "string" && next.question.trim() ? next.question : base.question;
    var anniversaryQuestion = isAnniversaryQuestion(question);
    var migratedAnswers = answers.map(function (answer) {
      if (answer && answer.text === "El aniversario de la organización") {
        answer.text = "El aniversario de la OSG";
      }
      return answer;
    });

    return {
      presetVersion: Number(next.presetVersion) || 0,
      bankQuestionId: next.bankQuestionId ? String(next.bankQuestionId) : "",
      round: typeof next.round === "string" && next.round.trim() ? next.round : base.round,
      question: question,
      mode: next.mode === "choice" || anniversaryQuestion ? "choice" : "survey",
      strikes: clampNumber(next.strikes, 0, 3),
      answers: migratedAnswers.map(function (answer) {
        var text = answer && typeof answer.text === "string" ? answer.text : "";
        return {
          id: answer && answer.id ? String(answer.id) : uid(),
          text: text,
          points: anniversaryQuestion ? anniversaryChoicePoints(text, answer && answer.points) : clampNumber(answer && answer.points, 0, 999),
          revealed: Boolean(answer && answer.revealed)
        };
      }),
      updatedAt: Number(next.updatedAt) || Date.now()
    };
  }

  function clampNumber(value, min, max) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function loadState() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return defaultState();
      }

      var parsed = JSON.parse(stored);
      if (!parsed.presetVersion && parsed.question === LEGACY_DEFAULT_QUESTION) {
        return defaultState();
      }

      return parsed;
    } catch (error) {
      return defaultState();
    }
  }

  function saveState(options) {
    var shouldRender = !options || options.render !== false;
    state.updatedAt = Date.now();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    if (channel) {
      channel.postMessage(state);
    }

    if (shouldRender) {
      render();
    }
  }

  function setState(mutator, options) {
    var draft = JSON.parse(JSON.stringify(state));
    mutator(draft);
    state = normalizeState(draft);
    saveState(options);
  }

  function applyIncoming(nextState) {
    var incoming = normalizeState(nextState);
    if (incoming.updatedAt <= state.updatedAt) {
      return;
    }
    state = incoming;
    render();
  }

  if (channel) {
    channel.addEventListener("message", function (event) {
      applyIncoming(event.data);
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        applyIncoming(JSON.parse(event.newValue));
      } catch (error) {
        return;
      }
    }
  });

  window.addEventListener("resize", function () {
    if (page === "board") {
      fitQuestionText(document.getElementById("questionText"));
    }
  });

  function render() {
    if (page === "board") {
      renderBoard();
    }

    if (page === "control") {
      renderControl();
    }
  }

  function renderBoard() {
    var roundLabel = document.getElementById("roundLabel");
    var questionText = document.getElementById("questionText");
    var scoreTotal = document.getElementById("scoreTotal");
    var strikeRow = document.getElementById("strikeRow");
    var answerBoard = document.getElementById("answerBoard");
    var previousRevealedIds = boardHasRendered ? boardRevealedIds : getRevealedIds();
    var previousStrikeCount = boardHasRendered ? boardStrikeCount : state.strikes;
    var currentRevealedIds = new Set();
    var scoreOpeningCount = 0;
    var strikeIncreased = state.strikes > previousStrikeCount;
    var choiceRound = isChoiceRound();

    roundLabel.textContent = state.round;
    questionText.textContent = state.question;
    fitQuestionText(questionText);
    scoreTotal.textContent = String(totalScore());

    strikeRow.replaceChildren();
    for (var i = 0; i < 3; i += 1) {
      var strike = document.createElement("div");
      strike.className = "strike-mark" + (i < state.strikes ? " is-on" : "") + (strikeIncreased && i === state.strikes - 1 ? " is-new" : "");
      strike.textContent = "X";
      strikeRow.appendChild(strike);
    }

    answerBoard.replaceChildren();
    answerBoard.classList.toggle("is-choice-board", choiceRound);
    answerBoard.setAttribute("aria-label", choiceRound ? "Incisos" : "Respuestas");

    state.answers.forEach(function (answer, index) {
      var isOpening = answer.revealed && !previousRevealedIds.has(answer.id);
      if (answer.revealed) {
        currentRevealedIds.add(answer.id);
      }
      if (isOpening && answer.points > 0) {
        scoreOpeningCount += 1;
      }

      if (choiceRound) {
        var isCorrectChoice = answer.points > 0;
        var letter = CHOICE_LETTERS.charAt(index) || String(index + 1);
        var choice = document.createElement("button");
        choice.type = "button";
        choice.className = "choice-option" + (answer.revealed ? " is-revealed" : "") + (answer.revealed && isCorrectChoice ? " is-correct" : "") + (answer.revealed && !isCorrectChoice ? " is-wrong" : "") + (isOpening ? " is-opening" : "") + (answer.text.trim() ? "" : " answer-empty");
        choice.disabled = !answer.text.trim() || answer.revealed;
        choice.setAttribute("aria-label", "Inciso " + letter + ": " + (answer.text || ""));
        choice.addEventListener("click", function () {
          chooseChoiceAnswer(answer.id);
        });

        var choiceLetter = document.createElement("span");
        choiceLetter.className = "choice-letter";
        choiceLetter.textContent = letter;

        var choiceText = document.createElement("span");
        choiceText.className = "choice-text";
        choiceText.textContent = answer.text || " ";

        var choiceBadge = document.createElement("span");
        choiceBadge.className = "choice-badge";
        choiceBadge.textContent = answer.revealed ? (isCorrectChoice ? "+" + answer.points : "X") : "";

        choice.append(choiceLetter, choiceText, choiceBadge);
        answerBoard.appendChild(choice);
        return;
      }

      var tile = document.createElement("button");
      tile.type = "button";
      tile.className = "answer-tile" + (answer.revealed ? " is-revealed" : "") + (isOpening ? " is-opening" : "") + (answer.text.trim() ? "" : " answer-empty");
      tile.disabled = !answer.text.trim();
      tile.setAttribute("aria-label", answer.revealed ? answer.text : "Respuesta " + (index + 1));
      tile.addEventListener("click", function () {
        if (!answer.text.trim()) {
          return;
        }
        revealAnswer(answer.id, !answer.revealed);
      });

      var inner = document.createElement("span");
      inner.className = "tile-inner";

      var front = document.createElement("span");
      front.className = "tile-face tile-front";
      front.textContent = String(index + 1);

      var back = document.createElement("span");
      back.className = "tile-face tile-back";

      var answerText = document.createElement("span");
      answerText.className = "answer-text";
      answerText.textContent = answer.text || " ";

      var points = document.createElement("span");
      points.className = "answer-points";
      points.textContent = String(answer.points);

      back.append(answerText, points);
      inner.append(front, back);
      tile.appendChild(inner);

      if (isOpening) {
        tile.addEventListener("animationend", function (event) {
          if (event.animationName === "revealSweep") {
            tile.classList.remove("is-opening");
          }
        });
      }

      answerBoard.appendChild(tile);
    });

    if (scoreOpeningCount > 0) {
      scoreTotal.classList.remove("score-pop");
      void scoreTotal.offsetWidth;
      scoreTotal.classList.add("score-pop");
    }

    if (strikeIncreased) {
      showStrikeOverlay();
    }

    boardRevealedIds = currentRevealedIds;
    boardStrikeCount = state.strikes;
    boardHasRendered = true;
  }

  function getRevealedIds() {
    return new Set(state.answers.filter(function (answer) {
      return answer.revealed;
    }).map(function (answer) {
      return answer.id;
    }));
  }

  function fitQuestionText(element) {
    if (!element) {
      return;
    }

    element.style.fontSize = "";
    element.style.transform = "";
    element.style.maxWidth = "";
    element.style.whiteSpace = "nowrap";

    var parent = element.parentElement;
    var maxWidth = parent ? Math.max(180, parent.clientWidth - 88) : element.clientWidth;
    var baseSize = parseFloat(window.getComputedStyle(element).fontSize) || 36;
    var minSize = parent && parent.clientWidth < 520 ? 15 : 20;
    var singleLineMin = parent && parent.clientWidth >= 900 ? 28 : minSize;
    var fittedSize = baseSize;
    var maxTextHeight = Math.max(72, fittedSize * 2.25);

    if (element.scrollWidth <= maxWidth) {
      return;
    }

    element.style.fontSize = fittedSize + "px";
    while (fittedSize > singleLineMin && element.scrollWidth > maxWidth) {
      fittedSize -= 1;
      element.style.fontSize = fittedSize + "px";
    }

    if (element.scrollWidth <= maxWidth) {
      return;
    }

    element.style.maxWidth = maxWidth + "px";
    element.style.whiteSpace = "normal";

    while (fittedSize > minSize && element.scrollHeight > maxTextHeight) {
      fittedSize -= 1;
      element.style.fontSize = fittedSize + "px";
    }
  }

  function showStrikeOverlay() {
    var overlay = document.getElementById("strikeOverlay");
    var overlayXs = overlay ? overlay.querySelector("strong") : null;
    if (!overlay) {
      return;
    }

    overlay.style.setProperty("--strike-count", String(Math.max(1, state.strikes)));
    if (overlayXs) {
      overlayXs.textContent = Array(Math.max(1, state.strikes) + 1).join("X ").trim();
    }

    overlay.classList.remove("is-active");
    document.body.classList.remove("is-striking");
    void overlay.offsetWidth;
    overlay.classList.add("is-active");
    document.body.classList.add("is-striking");
    if (suppressNextStrikeOverlaySound) {
      suppressNextStrikeOverlaySound = false;
    } else {
      playStrikeBuzz();
    }

    overlay.addEventListener("animationend", function (event) {
      if (event.animationName === "strikeOverlayFade") {
        overlay.classList.remove("is-active");
        document.body.classList.remove("is-striking");
      }
    }, { once: true });
  }

  function renderControl() {
    var roundInput = document.getElementById("roundInput");
    var questionInput = document.getElementById("questionInput");
    var modeInput = document.getElementById("modeInput");
    var presetSelect = document.getElementById("presetSelect");
    var strikeCount = document.getElementById("strikeCount");
    var editor = document.getElementById("answerEditor");
    var selectedQuestionOption = findQuestionOption();

    renderPresetOptions(presetSelect);

    if (document.activeElement !== roundInput) {
      roundInput.value = state.round;
    }
    if (document.activeElement !== questionInput) {
      questionInput.value = state.question;
    }
    if (modeInput && document.activeElement !== modeInput) {
      modeInput.value = state.mode;
    }
    if (presetSelect && document.activeElement !== presetSelect) {
      presetSelect.value = selectedQuestionOption;
    }
    strikeCount.textContent = String(state.strikes);

    editor.replaceChildren();
    state.answers.forEach(function (answer, index) {
      var row = document.createElement("div");
      row.className = "answer-row";

      var orderTools = document.createElement("div");
      orderTools.className = "order-tools";

      var number = document.createElement("button");
      number.type = "button";
      number.className = "icon-button";
      number.textContent = String(index + 1);
      number.disabled = true;

      var up = document.createElement("button");
      up.type = "button";
      up.className = "icon-button";
      up.innerHTML = "&uarr;";
      up.disabled = index === 0;
      up.setAttribute("aria-label", "Subir respuesta");
      up.addEventListener("click", function () {
        moveAnswer(index, index - 1);
      });

      var down = document.createElement("button");
      down.type = "button";
      down.className = "icon-button";
      down.innerHTML = "&darr;";
      down.disabled = index === state.answers.length - 1;
      down.setAttribute("aria-label", "Bajar respuesta");
      down.addEventListener("click", function () {
        moveAnswer(index, index + 1);
      });

      orderTools.append(number, up, down);

      var answerInput = document.createElement("input");
      answerInput.type = "text";
      answerInput.value = answer.text;
      answerInput.placeholder = "Respuesta";
      answerInput.autocomplete = "off";
      answerInput.addEventListener("input", function () {
        updateAnswer(answer.id, { text: answerInput.value }, { render: false });
      });

      var pointsInput = document.createElement("input");
      pointsInput.type = "number";
      pointsInput.min = "0";
      pointsInput.max = "999";
      pointsInput.value = String(answer.points);
      pointsInput.addEventListener("input", function () {
        updateAnswer(answer.id, { points: clampNumber(pointsInput.value, 0, 999) }, { render: false });
      });

      var rowActions = document.createElement("div");
      rowActions.className = "row-actions";

      var reveal = document.createElement("button");
      reveal.type = "button";
      reveal.className = "tile-button" + (answer.revealed ? " is-open" : "");
      reveal.textContent = answer.revealed ? "Abierta" : "Abrir";
      reveal.addEventListener("click", function () {
        revealAnswer(answer.id, !answer.revealed);
      });

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button remove-button";
      remove.innerHTML = "&times;";
      remove.setAttribute("aria-label", "Eliminar respuesta");
      remove.addEventListener("click", function () {
        removeAnswer(answer.id);
      });

      rowActions.append(reveal, remove);
      row.append(orderTools, answerInput, pointsInput, rowActions);
      editor.appendChild(row);
    });
  }

  function renderPresetOptions(select) {
    var signature = savedQuestions.map(function (question) {
      return question.id + ":" + question.revision;
    }).join("|");

    if (!select || questionOptionsSignature === signature) {
      return;
    }

    questionOptionsSignature = signature;
    select.replaceChildren();

    var emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Personalizada";
    select.appendChild(emptyOption);

    var presetGroup = document.createElement("optgroup");
    presetGroup.label = "Incluidas";
    PRESET_ROUNDS.forEach(function (preset, index) {
      var option = document.createElement("option");
      option.value = "preset:" + index;
      option.textContent = preset.label;
      presetGroup.appendChild(option);
    });
    select.appendChild(presetGroup);

    if (savedQuestions.length) {
      var savedGroup = document.createElement("optgroup");
      savedGroup.label = "Guardadas en el banco";
      savedQuestions.forEach(function (question) {
        var option = document.createElement("option");
        option.value = "saved:" + question.id;
        option.textContent = question.label;
        savedGroup.appendChild(option);
      });
      select.appendChild(savedGroup);
    }
  }

  function findQuestionOption() {
    var savedQuestion = savedQuestions.find(function (question) {
      return state.bankQuestionId && question.id === state.bankQuestionId;
    });
    if (savedQuestion) {
      return "saved:" + savedQuestion.id;
    }

    var presetIndex = PRESET_ROUNDS.findIndex(function (preset) {
      return preset.question === state.question;
    });
    return presetIndex >= 0 ? "preset:" + presetIndex : "";
  }

  function isAnniversaryQuestion(question) {
    return typeof question === "string" && question.trim() === ANNIVERSARY_QUESTION;
  }

  function isChoiceRound() {
    return state.mode === "choice" || isAnniversaryQuestion(state.question);
  }

  function anniversaryChoicePoints(text, fallback) {
    if (text.trim() === "52") {
      return 100;
    }
    if (text.trim() === "36" || text.trim() === "41") {
      return 0;
    }
    return clampNumber(fallback, 0, 999);
  }

  function totalScore() {
    return state.answers.reduce(function (sum, answer) {
      return sum + (answer.revealed ? clampNumber(answer.points, 0, 999) : 0);
    }, 0);
  }

  function chooseChoiceAnswer(id) {
    var answer = state.answers.find(function (item) {
      return item.id === id;
    });
    if (!answer || answer.revealed || !answer.text.trim()) {
      return;
    }

    revealAnswer(id, true);
  }

  function revealAnswer(id, isOpen) {
    var changedToOpen = false;
    var changedToWrongChoice = false;
    var currentAnswer = state.answers.find(function (answer) {
      return answer.id === id;
    });
    var wrongChoiceWillOpen = Boolean(currentAnswer && isOpen && !currentAnswer.revealed && isChoiceRound() && currentAnswer.points === 0);

    if (wrongChoiceWillOpen) {
      suppressNextStrikeOverlaySound = page === "board" && state.strikes < 3;
      playStrikeBuzz();
    }

    setState(function (draft) {
      draft.answers = draft.answers.map(function (answer) {
        if (answer.id === id) {
          changedToOpen = isOpen && !answer.revealed;
          changedToWrongChoice = changedToOpen && isChoiceRound() && answer.points === 0;
          answer.revealed = isOpen;
          if (changedToWrongChoice) {
            draft.strikes = clampNumber(draft.strikes + 1, 0, 3);
          }
        }
        return answer;
      });
    });
    if (changedToWrongChoice) {
      if (!wrongChoiceWillOpen && page !== "board") {
        playStrikeBuzz();
      }
    } else if (changedToOpen) {
      playDing();
    }
  }

  function updateAnswer(id, patch, options) {
    setState(function (draft) {
      draft.answers = draft.answers.map(function (answer) {
        if (answer.id === id) {
          Object.assign(answer, patch);
        }
        return answer;
      });
    }, options);
  }

  function moveAnswer(from, to) {
    setState(function (draft) {
      if (to < 0 || to >= draft.answers.length) {
        return;
      }
      var moved = draft.answers.splice(from, 1)[0];
      draft.answers.splice(to, 0, moved);
    });
  }

  function removeAnswer(id) {
    setState(function (draft) {
      draft.answers = draft.answers.filter(function (answer) {
        return answer.id !== id;
      });
      if (draft.answers.length === 0) {
        draft.answers.push({ id: uid(), text: "", points: 0, revealed: false });
      }
    });
  }

  function addAnswer() {
    setState(function (draft) {
      draft.answers.push({ id: uid(), text: "", points: 0, revealed: false });
    });
  }

  function hideAll() {
    setState(function (draft) {
      draft.answers.forEach(function (answer) {
        answer.revealed = false;
      });
    });
  }

  function resetRound() {
    setState(function (draft) {
      draft.strikes = 0;
      draft.answers.forEach(function (answer) {
        answer.revealed = false;
      });
    });
  }

  function loadPreset(index) {
    var preset = PRESET_ROUNDS[index];
    if (!preset) {
      return;
    }

    setState(function (draft) {
      draft.presetVersion = PRESET_VERSION;
      draft.bankQuestionId = "";
      draft.round = preset.round;
      draft.question = preset.question;
      draft.mode = preset.mode === "choice" ? "choice" : "survey";
      draft.strikes = 0;
      draft.answers = createAnswers(preset.answers);
    });
  }

  function loadSavedQuestion(id) {
    var question = savedQuestions.find(function (item) {
      return item.id === id;
    });
    if (!question) {
      return;
    }

    setState(function (draft) {
      draft.presetVersion = PRESET_VERSION;
      draft.bankQuestionId = question.id;
      draft.round = question.round;
      draft.question = question.question;
      draft.mode = question.mode === "choice" ? "choice" : "survey";
      draft.strikes = 0;
      draft.answers = createAnswers(question.answers);
    });
  }

  function loadQuestionOption(value) {
    if (value.indexOf("preset:") === 0) {
      loadPreset(Number(value.slice(7)));
    } else if (value.indexOf("saved:") === 0) {
      loadSavedQuestion(value.slice(6));
    }
  }

  function setControlBankStatus(message, tone) {
    var status = document.getElementById("controlBankStatus");
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.dataset.tone = tone || "";
  }

  async function loadSavedQuestions() {
    if (!window.QuestionBank || !window.QuestionBank.isConfigured()) {
      setControlBankStatus("Conecta Supabase para guardar preguntas compartidas.");
      renderControl();
      return;
    }

    setControlBankStatus("Cargando banco de preguntas…");
    try {
      savedQuestions = await window.QuestionBank.list({ archived: false });
      questionOptionsSignature = "";
      setControlBankStatus(savedQuestions.length + (savedQuestions.length === 1
        ? " pregunta compartida disponible."
        : " preguntas compartidas disponibles."), "success");
      renderControl();
    } catch (error) {
      setControlBankStatus(error.message, "error");
    }
  }

  async function saveCurrentQuestionToBank() {
    var button = document.getElementById("saveToBank");
    if (!window.QuestionBank || !window.QuestionBank.isConfigured()) {
      setControlBankStatus("Primero conecta el proyecto gratuito de Supabase.", "error");
      return;
    }

    var payload = {
      label: state.question.length > 56 ? state.question.slice(0, 53) + "…" : state.question,
      round: state.round,
      question: state.question,
      mode: state.mode,
      answers: state.answers
    };
    var validation = window.QuestionBank.validate(payload);
    if (validation.errors.length) {
      setControlBankStatus(validation.errors.join(" "), "error");
      return;
    }

    button.disabled = true;
    setControlBankStatus("Guardando en el banco…");
    try {
      var created = await window.QuestionBank.create(validation.value);
      state.bankQuestionId = created.id;
      saveState();
      await loadSavedQuestions();
      setControlBankStatus("Pregunta guardada permanentemente.", "success");
    } catch (error) {
      setControlBankStatus(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  function bindControlEvents() {
    var roundInput = document.getElementById("roundInput");
    var questionInput = document.getElementById("questionInput");
    var modeInput = document.getElementById("modeInput");
    var presetSelect = document.getElementById("presetSelect");
    var loadPresetButton = document.getElementById("loadPreset");
    var strikeDown = document.getElementById("strikeDown");
    var strikeUp = document.getElementById("strikeUp");
    var addAnswerButton = document.getElementById("addAnswer");
    var saveToBankButton = document.getElementById("saveToBank");
    var hideAllButton = document.getElementById("hideAll");
    var resetRoundButton = document.getElementById("resetRound");

    saveToBankButton.disabled = !window.QuestionBank || !window.QuestionBank.isConfigured();

    roundInput.addEventListener("input", function () {
      setState(function (draft) {
        draft.round = roundInput.value;
      }, { render: false });
    });

    questionInput.addEventListener("input", function () {
      setState(function (draft) {
        draft.bankQuestionId = "";
        draft.question = questionInput.value;
      }, { render: false });
    });

    modeInput.addEventListener("change", function () {
      setState(function (draft) {
        draft.mode = modeInput.value;
      });
    });

    loadPresetButton.addEventListener("click", function () {
      if (presetSelect.value !== "") {
        loadQuestionOption(presetSelect.value);
      }
    });

    strikeDown.addEventListener("click", function () {
      setState(function (draft) {
        draft.strikes = clampNumber(draft.strikes - 1, 0, 3);
      });
    });

    strikeUp.addEventListener("click", function () {
      var shouldPlayStrikeSound = state.strikes < 3;
      setState(function (draft) {
        draft.strikes = clampNumber(draft.strikes + 1, 0, 3);
      });
      if (shouldPlayStrikeSound) {
        playStrikeBuzz();
      }
    });

    addAnswerButton.addEventListener("click", addAnswer);
    saveToBankButton.addEventListener("click", saveCurrentQuestionToBank);
    hideAllButton.addEventListener("click", hideAll);
    resetRoundButton.addEventListener("click", resetRound);
  }

  function bindSurpriseEvents() {
    var trigger = document.getElementById("surpriseButton");
    var overlay = document.getElementById("surpriseOverlay");
    var closeButton = document.getElementById("surpriseClose");
    var dismissButton = document.getElementById("surpriseDismiss");
    var previousActiveElement = null;
    var closeTimer = null;

    if (!trigger || !overlay || !closeButton || !dismissButton) {
      return;
    }

    function openSurprise() {
      window.clearTimeout(closeTimer);
      previousActiveElement = document.activeElement;
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-surprise-open");
      window.requestAnimationFrame(function () {
        overlay.classList.add("is-open");
        closeButton.focus();
      });
    }

    function closeSurprise() {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-surprise-open");
      closeTimer = window.setTimeout(function () {
        overlay.hidden = true;
        if (previousActiveElement && typeof previousActiveElement.focus === "function") {
          previousActiveElement.focus();
        }
      }, 260);
    }

    trigger.addEventListener("click", openSurprise);
    closeButton.addEventListener("click", closeSurprise);
    dismissButton.addEventListener("click", closeSurprise);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeSurprise();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay.classList.contains("is-open")) {
        closeSurprise();
      }
    });
  }

  function playAudioAsset(src, volume, fallback) {
    try {
      var audio = new Audio(src);
      audio.volume = volume;
      var playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () {
          fallback();
        });
      }
    } catch (error) {
      fallback();
    }
  }

  function playDing() {
    playAudioAsset("./assets/audio/respuesta-correcta.wav", 0.88, playGeneratedDing);
  }

  function playGeneratedDing() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return;
      }
      var context = new AudioContext();
      var gain = context.createGain();
      var oscillator = context.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(740, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1040, context.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    } catch (error) {
      return;
    }
  }

  function playStrikeBuzz() {
    playAudioAsset("./assets/audio/sonido-incorrecto.wav", 0.9, playGeneratedStrikeBuzz);
  }

  function playGeneratedStrikeBuzz() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return;
      }
      var context = new AudioContext();
      var gain = context.createGain();
      var lowOscillator = context.createOscillator();
      var harshOscillator = context.createOscillator();
      var filter = context.createBiquadFilter();
      lowOscillator.type = "square";
      harshOscillator.type = "sawtooth";
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(240, context.currentTime + 1.05);
      lowOscillator.frequency.setValueAtTime(170, context.currentTime);
      lowOscillator.frequency.setValueAtTime(132, context.currentTime + 0.22);
      lowOscillator.frequency.setValueAtTime(170, context.currentTime + 0.44);
      lowOscillator.frequency.exponentialRampToValueAtTime(78, context.currentTime + 1.08);
      harshOscillator.frequency.setValueAtTime(92, context.currentTime);
      harshOscillator.frequency.setValueAtTime(116, context.currentTime + 0.22);
      harshOscillator.frequency.setValueAtTime(92, context.currentTime + 0.44);
      harshOscillator.frequency.exponentialRampToValueAtTime(55, context.currentTime + 1.08);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
      gain.gain.setValueAtTime(0.18, context.currentTime + 0.68);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.16);
      lowOscillator.connect(filter);
      harshOscillator.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      lowOscillator.start();
      harshOscillator.start();
      lowOscillator.stop(context.currentTime + 1.18);
      harshOscillator.stop(context.currentTime + 1.18);
    } catch (error) {
      return;
    }
  }

  if (page === "control") {
    bindControlEvents();
    loadSavedQuestions();
  }

  if (page === "board") {
    bindSurpriseEvents();
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
})();
