const ROWS = 10;
const WORD_LENGTH = 5;
const TOP_N = 10;
const SCORE_EPSILON = 1e-12;
const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

const state = {
  allowed: [],
  allowedMeta: [],
  metaByWord: new Map(),
  allowedSet: new Set(),
  rows: [],
  activeRow: 0,
  activeCol: 0,
  presetAnswer: "",
  solved: false,
  initialRecommendation: null,
};

const boardEl = document.querySelector("#board");
const keyboardEl = document.querySelector("#keyboard");
const rankListEl = document.querySelector("#rank-list");
const statusEl = document.querySelector("#status");
const candidateCountEl = document.querySelector("#candidate-count");
const candidateListEl = document.querySelector("#candidate-list");
const presetAnswerEl = document.querySelector("#preset-answer");
const answerStatusEl = document.querySelector("#answer-status");
const clearAnswerEl = document.querySelector("#clear-answer");

function emptyRow() {
  return { word: "?????", locked: false, green: 0, yellow: 0, marks: Array(WORD_LENGTH).fill("") };
}

function initRows() {
  state.rows = Array.from({ length: ROWS }, emptyRow);
  state.activeRow = 0;
  state.activeCol = 0;
}

function countLetters(word) {
  const counts = Array(26).fill(0);
  for (const char of word) counts[char.charCodeAt(0) - 97] += 1;
  return counts;
}

function wordMeta(word) {
  return { word, chars: [...word], counts: countLetters(word) };
}

function feedbackMeta(guess, answer) {
  let green = 0;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess.chars[i] === answer.chars[i]) green += 1;
  }

  let common = 0;
  for (let i = 0; i < 26; i += 1) {
    common += Math.min(guess.counts[i], answer.counts[i]);
  }
  return `${green},${common - green}`;
}

function feedbackCounts(guess, answer) {
  const [green, yellow] = feedbackMeta(guess, answer).split(",").map(Number);
  return { green, yellow };
}

function observations() {
  return state.rows
    .filter((row) => row.locked)
    .map((row) => ({ guessMeta: state.metaByWord.get(row.word), key: `${row.green},${row.yellow}` }));
}

function hasObservations() {
  return state.rows.some((row) => row.locked);
}

function refreshSolvedState() {
  const solvedRow = state.rows.find((row) => row.locked && row.green === WORD_LENGTH && row.yellow === 0);
  state.solved = Boolean(solvedRow);
  if (solvedRow) {
    statusEl.textContent = `答案正确：${solvedRow.word.toUpperCase()}`;
  }
}

function candidateWeights() {
  const obs = observations();
  const weights = new Map();

  for (const meta of state.allowedMeta) {
    let ok = true;
    for (const item of obs) {
      if (feedbackMeta(item.guessMeta, meta) !== item.key) {
        ok = false;
        break;
      }
    }
    if (ok) weights.set(meta.word, { meta, weight: 1 });
  }
  return weights;
}

function entropyScore(guess, candidates) {
  let total = 0;
  const buckets = new Map();
  for (const { meta: answer, weight } of candidates.values()) {
    total += weight;
    const key = feedbackMeta(guess, answer);
    buckets.set(key, (buckets.get(key) || 0) + weight);
  }

  let info = 0;
  let expectedWeight = 0;
  for (const weight of buckets.values()) {
    const p = weight / total;
    info -= p * Math.log2(p);
    expectedWeight += p * weight;
  }
  return { info, expectedWeight, buckets: buckets.size };
}

function rankGuesses(candidates) {
  const candidateSet = new Set(candidates.keys());
  if (candidates.size === 1) {
    const [guess] = candidates.keys();
    return [{ guess, info: 0, expectedWeight: candidates.get(guess).weight, buckets: 1, isCandidate: true }];
  }

  const scored = state.allowedMeta
    .map((guess) => {
      const score = entropyScore(guess, candidates);
      return {
        guess: guess.word,
        info: score.info,
        expectedWeight: score.expectedWeight,
        buckets: score.buckets,
        isCandidate: candidateSet.has(guess.word),
      };
    })
    .sort(compareRankRows);

  const maxInfo = scored[0].info;
  const candidateRows = scored.filter((row) => row.isCandidate);
  const allCandidatesAreGloballyBest =
    candidateRows.length > 0 && candidateRows.every((row) => Math.abs(row.info - maxInfo) <= SCORE_EPSILON);
  return (allCandidatesAreGloballyBest ? candidateRows : scored).slice(0, TOP_N);
}

function compareRankRows(a, b) {
  if (Math.abs(b.info - a.info) > SCORE_EPSILON) return b.info - a.info;
  if (a.isCandidate !== b.isCandidate) return Number(b.isCandidate) - Number(a.isCandidate);
  if (Math.abs(a.expectedWeight - b.expectedWeight) > SCORE_EPSILON) return a.expectedWeight - b.expectedWeight;
  if (b.buckets !== a.buckets) return b.buckets - a.buckets;
  return a.guess.localeCompare(b.guess);
}

function updateRecommendations() {
  if (!state.allowed.length) return;

  if (!hasObservations()) {
    renderRecommendationResult(getInitialRecommendation());
    return;
  }

  renderRecommendationResult(computeRecommendation());
}

function computeRecommendation() {
  const candidates = candidateWeights();
  if (!candidates.size) return { candidates, ranked: [] };
  return { candidates, ranked: rankGuesses(candidates) };
}

function getInitialRecommendation() {
  if (!state.initialRecommendation) {
    state.initialRecommendation = computeRecommendation();
  }
  return state.initialRecommendation;
}

function renderRecommendationResult(result) {
  const { candidates, ranked } = result;
  const candidateCount = result.candidateCount ?? candidates.size;
  candidateCountEl.textContent = String(candidateCount);

  if (!candidateCount) {
    rankListEl.innerHTML = '<li class="empty">没有候选答案。检查绿色/黄色数字是否录错。</li>';
    candidateListEl.innerHTML = "";
    statusEl.textContent = "No candidates remain";
    return;
  }

  rankListEl.innerHTML = ranked
    .map(
      (item, index) => `
        <li class="rank-item">
          <span class="rank-index">${index + 1}</span>
          <span class="rank-word${item.isCandidate ? " candidate" : ""}">${item.guess}</span>
          <span class="rank-meta">
            info ${item.info.toFixed(3)} bits<br>
            buckets ${item.buckets}, expected ${item.expectedWeight.toFixed(1)}
          </span>
        </li>
      `,
    )
    .join("");

  const chipWords =
    result.chips ??
    [...candidates.keys()]
      .sort((a, b) => candidates.get(b).weight - candidates.get(a).weight || a.localeCompare(b))
      .slice(0, 36);
  const chips = chipWords.map((word) => `<span class="candidate-chip">${word}</span>`).join("");
  candidateListEl.innerHTML = chips;
  statusEl.textContent = `${state.allowed.length} legal guesses, uniform broad prior`;
}

function renderBoard() {
  boardEl.innerHTML = state.rows
    .map((row, rowIndex) => {
      const chars = [...row.word].map((char) => (char === "?" ? "" : char));
      const tiles = chars
        .map((char, colIndex) => {
          const mark = row.marks[colIndex];
          const markClass = mark ? ` mark-${mark}` : "";
          return `<button class="tile${markClass}" type="button" data-tile="${rowIndex}:${colIndex}" title="点击记录推理颜色">${char}</button>`;
        })
        .join("");
      return `
        <div class="row${row.locked ? " locked" : ""}${rowIndex === state.activeRow ? " active" : ""}" data-row="${rowIndex}">
          <div class="row-tools">
            <button class="delete-row" type="button" data-delete="${rowIndex}" ${row.locked ? "" : "disabled"}>×</button>
          </div>
          ${tiles}
          <div class="score-controls">
            ${scoreControl(rowIndex, "green", row.green)}
            ${scoreControl(rowIndex, "yellow", row.yellow)}
          </div>
        </div>
      `;
    })
    .join("");
}

function scoreControl(rowIndex, kind, value) {
  return `
    <div class="score ${kind}">
      <button type="button" data-score="${rowIndex}:${kind}:up">+</button>
      <span class="score-value">${value}</span>
      <button type="button" data-score="${rowIndex}:${kind}:down">-</button>
    </div>
  `;
}

function renderKeyboard() {
  keyboardEl.innerHTML = KEY_ROWS.map((letters, index) => {
    const keys = [...letters].map((letter) => {
      const mark = keyboardMark(letter);
      const markClass = mark ? ` mark-${mark}` : "";
      return `<button class="key${markClass}" type="button" data-key="${letter}">${letter}</button>`;
    });
    if (index === 2) {
      keys.unshift('<button class="key wide" type="button" data-key="Enter">✓</button>');
      keys.push('<button class="key wide" type="button" data-key="Backspace">⌫</button>');
    }
    return `<div class="key-row">${keys.join("")}</div>`;
  }).join("");
}

function keyboardMark(letter) {
  let result = "";
  for (const row of state.rows) {
    if (!row.locked) continue;
    for (let i = 0; i < WORD_LENGTH; i += 1) {
      if (row.word[i] !== letter || !row.marks[i]) continue;
      if (row.marks[i] === "green") return "green";
      if (row.marks[i] === "yellow" && result !== "green") result = "yellow";
      if (row.marks[i] === "gray" && !result) result = "gray";
    }
  }
  return result;
}

function cycleTileMark(rowIndex, colIndex) {
  const row = state.rows[rowIndex];
  if (!row || !row.locked) return;
  const current = row.marks[colIndex];
  row.marks[colIndex] = current === "" ? "yellow" : current === "yellow" ? "green" : current === "green" ? "gray" : "";
  renderBoard();
  renderKeyboard();
}

function setActiveToNextOpen() {
  const next = state.rows.findIndex((row) => !row.locked);
  state.activeRow = next === -1 ? ROWS - 1 : next;
  state.activeCol = Math.max(0, state.rows[state.activeRow].word.indexOf("?"));
  if (state.activeCol === -1) state.activeCol = WORD_LENGTH;
}

function typeLetter(letter) {
  const row = state.rows[state.activeRow];
  if (state.solved || !row || row.locked || state.activeCol >= WORD_LENGTH) return;

  row.word = row.word.slice(0, state.activeCol) + letter + row.word.slice(state.activeCol + 1);
  state.activeCol += 1;
  renderBoard();
}

function backspace() {
  const row = state.rows[state.activeRow];
  if (state.solved || !row || row.locked) return;
  const col = state.activeCol > 0 ? state.activeCol - 1 : 0;
  row.word = row.word.slice(0, col) + "?" + row.word.slice(col + 1);
  state.activeCol = col;
  renderBoard();
}

function submitRow() {
  const row = state.rows[state.activeRow];
  if (state.solved || !row || row.locked || row.word.includes("?")) return;
  if (!state.allowedSet.has(row.word)) {
    statusEl.textContent = `${row.word.toUpperCase()} not in word list`;
    return;
  }

  if (state.presetAnswer) {
    const result = feedbackCounts(state.metaByWord.get(row.word), state.metaByWord.get(state.presetAnswer));
    row.green = result.green;
    row.yellow = result.yellow;
  }

  row.locked = true;
  refreshSolvedState();
  setActiveToNextOpen();
  renderBoard();
  renderKeyboard();
  updateRecommendations();
}

function deleteRow(rowIndex) {
  state.rows[rowIndex] = emptyRow();
  refreshSolvedState();
  setActiveToNextOpen();
  renderBoard();
  renderKeyboard();
  updateRecommendations();
}

function adjustScore(rowIndex, kind, direction) {
  const row = state.rows[rowIndex];
  if (!row.locked) return;
  const delta = direction === "up" ? 1 : -1;
  const next = Math.max(0, Math.min(WORD_LENGTH, row[kind] + delta));
  const otherKind = kind === "green" ? "yellow" : "green";
  if (next + row[otherKind] > WORD_LENGTH) return;
  row[kind] = next;
  refreshSolvedState();
  renderBoard();
  updateRecommendations();
}

function reset() {
  initRows();
  state.solved = false;
  renderBoard();
  renderKeyboard();
  updateRecommendations();
}

function updatePresetAnswer(value) {
  const answer = value.toLowerCase().replace(/[^a-z]/g, "").slice(0, WORD_LENGTH);
  presetAnswerEl.value = answer.toUpperCase();

  if (!answer) {
    state.presetAnswer = "";
    answerStatusEl.textContent = "留空则手动调整每行绿色/黄色数字。";
    answerStatusEl.classList.remove("invalid");
    return;
  }

  if (answer.length < WORD_LENGTH) {
    state.presetAnswer = "";
    answerStatusEl.textContent = "答案需要 5 个字母。";
    answerStatusEl.classList.add("invalid");
    return;
  }

  if (!state.allowedSet.has(answer)) {
    state.presetAnswer = "";
    answerStatusEl.textContent = `${answer.toUpperCase()} 不在词表里。`;
    answerStatusEl.classList.add("invalid");
    return;
  }

  state.presetAnswer = answer;
  answerStatusEl.textContent = `已预设答案：${answer.toUpperCase()}。提交猜词会自动填反馈。`;
  answerStatusEl.classList.remove("invalid");
}

function handleKey(value) {
  if (value === "Enter") {
    submitRow();
  } else if (value === "Backspace") {
    backspace();
  } else if (/^[a-z]$/.test(value)) {
    typeLetter(value);
  }
}

function isTextInputTarget(target) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(element.closest("input, textarea, select, [contenteditable='true']"));
}

function bindEvents() {
  document.addEventListener("keydown", (event) => {
    if (isTextInputTarget(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" || event.key === "Backspace" || /^[a-zA-Z]$/.test(event.key)) {
      event.preventDefault();
      handleKey(event.key === "Backspace" ? "Backspace" : event.key === "Enter" ? "Enter" : event.key.toLowerCase());
    }
  });

  keyboardEl.addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]");
    if (key) handleKey(key.dataset.key);
  });

  boardEl.addEventListener("click", (event) => {
    const tileButton = event.target.closest("[data-tile]");
    if (tileButton) {
      const [rowIndex, colIndex] = tileButton.dataset.tile.split(":").map(Number);
      cycleTileMark(rowIndex, colIndex);
      return;
    }

    const scoreButton = event.target.closest("[data-score]");
    if (scoreButton) {
      const [rowIndex, kind, direction] = scoreButton.dataset.score.split(":");
      adjustScore(Number(rowIndex), kind, direction);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) deleteRow(Number(deleteButton.dataset.delete));
  });

  document.querySelector("#undo-button").addEventListener("click", () => {
    const lastLocked = state.rows.map((row, index) => (row.locked ? index : -1)).filter((index) => index >= 0).pop();
    if (lastLocked !== undefined) deleteRow(lastLocked);
  });

  document.querySelector("#reset-button").addEventListener("click", reset);

  presetAnswerEl.addEventListener("input", () => {
    updatePresetAnswer(presetAnswerEl.value);
  });

  clearAnswerEl.addEventListener("click", () => {
    updatePresetAnswer("");
  });
}

async function loadWords() {
  const response = await fetch("hardle_allowed_words.json");
  if (!response.ok) throw new Error(`Could not load word cache: ${response.status}`);
  const data = await response.json();
  state.allowed = data.allowed;
  state.allowedMeta = state.allowed.map(wordMeta);
  state.metaByWord = new Map(state.allowedMeta.map((meta) => [meta.word, meta]));
  state.allowedSet = new Set(state.allowed);
}

async function loadInitialRecommendation() {
  const response = await fetch("hardle_initial_uniform.json");
  if (!response.ok) return;
  const data = await response.json();
  state.initialRecommendation = {
    candidateCount: data.candidateCount,
    ranked: data.ranked,
    chips: data.chips,
  };
}

async function start() {
  initRows();
  renderBoard();
  renderKeyboard();
  bindEvents();

  try {
    await Promise.all([loadWords(), loadInitialRecommendation()]);
    updateRecommendations();
  } catch (error) {
    statusEl.textContent = error.message;
    rankListEl.innerHTML = '<li class="empty">启动本地服务器后再打开页面，例如 python -m http.server 8000。</li>';
  }
}

start();
