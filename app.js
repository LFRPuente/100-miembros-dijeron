(function () {
  "use strict";

  var STORAGE_KEY = "cien_mex_game_state_v1";
  var CHANNEL_NAME = "cien_mex_live_board";
  var PRESET_VERSION = 3;
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
      label: "Aniversario correcto",
      round: "Pregunta 4",
      question: "¿Qué aniversario se celebra?",
      answers: [
        { text: "36", points: 0 },
        { text: "41", points: 0 },
        { text: "52", points: 100 }
      ]
    },
    {
      label: "Materiales del comité central",
      round: "Pregunta 5",
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
      round: preset.round,
      question: preset.question,
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
      round: typeof next.round === "string" && next.round.trim() ? next.round : base.round,
      question: question,
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
    var presetSelect = document.getElementById("presetSelect");
    var strikeCount = document.getElementById("strikeCount");
    var editor = document.getElementById("answerEditor");
    var selectedPresetIndex = findPresetIndexByQuestion(state.question);

    renderPresetOptions(presetSelect);

    if (document.activeElement !== roundInput) {
      roundInput.value = state.round;
    }
    if (document.activeElement !== questionInput) {
      questionInput.value = state.question;
    }
    if (presetSelect && document.activeElement !== presetSelect) {
      presetSelect.value = selectedPresetIndex >= 0 ? String(selectedPresetIndex) : "";
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
    if (!select || select.options.length === PRESET_ROUNDS.length + 1) {
      return;
    }

    select.replaceChildren();

    var emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "Personalizada";
    select.appendChild(emptyOption);

    PRESET_ROUNDS.forEach(function (preset, index) {
      var option = document.createElement("option");
      option.value = String(index);
      option.textContent = preset.label;
      select.appendChild(option);
    });
  }

  function findPresetIndexByQuestion(question) {
    return PRESET_ROUNDS.findIndex(function (preset) {
      return preset.question === question;
    });
  }

  function isAnniversaryQuestion(question) {
    return typeof question === "string" && question.trim() === ANNIVERSARY_QUESTION;
  }

  function isChoiceRound() {
    return isAnniversaryQuestion(state.question);
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
      draft.round = preset.round;
      draft.question = preset.question;
      draft.strikes = 0;
      draft.answers = createAnswers(preset.answers);
    });
  }

  function bindControlEvents() {
    var roundInput = document.getElementById("roundInput");
    var questionInput = document.getElementById("questionInput");
    var presetSelect = document.getElementById("presetSelect");
    var loadPresetButton = document.getElementById("loadPreset");
    var strikeDown = document.getElementById("strikeDown");
    var strikeUp = document.getElementById("strikeUp");
    var addAnswerButton = document.getElementById("addAnswer");
    var hideAllButton = document.getElementById("hideAll");
    var resetRoundButton = document.getElementById("resetRound");

    roundInput.addEventListener("input", function () {
      setState(function (draft) {
        draft.round = roundInput.value;
      }, { render: false });
    });

    questionInput.addEventListener("input", function () {
      setState(function (draft) {
        draft.question = questionInput.value;
      }, { render: false });
    });

    loadPresetButton.addEventListener("click", function () {
      if (presetSelect.value !== "") {
        loadPreset(Number(presetSelect.value));
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
    hideAllButton.addEventListener("click", hideAll);
    resetRoundButton.addEventListener("click", resetRound);
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
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
})();
