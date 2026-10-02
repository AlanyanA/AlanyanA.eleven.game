/* ===== ENGINE (no UI deps) ===== */
const SU = ["♠", "♥", "♦", "♣"];
const RK = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const val = (r) => (r === "A" ? 1 : isNaN(+r) ? 0 : +r);
const team = (p) => p % 2;

const mkDeck = () => SU.flatMap((s) => RK.map((r) => ({ r, s, id: r + s })));

const shuffle = (a) => {
  a = a.slice();

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.some((y) => y.id === x.id));

function captureOptions(c, table) {
  if (c.r === "J") {
    const o = table.filter((x) => x.r !== "Q" && x.r !== "K");
    return o.length ? [o] : [];
  }

  if (c.r === "Q" || c.r === "K") {
    const o = table.find((x) => x.r === c.r);
    return o ? [[o]] : [];
  }

  const nums = table.filter((x) => val(x.r) > 0);
  const t = 11 - val(c.r);
  const res = [];

  (function go(i, sum, cur) {
    if (sum === t && cur.length) {
      res.push(cur.slice());
      return;
    }

    if (sum >= t) {
      return;
    }

    for (let k = i; k < nums.length; k++) {
      cur.push(nums[k]);
      go(k + 1, sum + val(nums[k].r), cur);
      cur.pop();
    }
  })(0, 0, []);

  return res;
}

function getLegalMoves(hand, table) {
  return hand.flatMap((card) => {
    const o = captureOptions(card, table);
    return o.length ? o.map((cap) => ({ card, cap })) : [{ card, cap: null }];
  });
}

const clubsIn = (cs) => cs.filter((c) => c.s === "♣").length;

/* Какие варианты взятия остались при выбранных картах sel (id).
   done — вариант, который нужно взять сразу (выбран полностью
   или однозначно лучший по трефам; при равенстве — по 10♦). */
function resolveCapture(opts, sel) {
  const cands = opts.filter((o) => sel.every((id) => o.some((c) => c.id === id)));

  if (!cands.length) {
    return { cands: [], done: null };
  }

  const exact = cands.find((o) => o.length === sel.length);

  if (exact) {
    return { cands, done: exact };
  }

  const key = (o) => clubsIn(o) * 10 + (o.some((c) => c.id === "10♦") ? 1 : 0);
  const mx = Math.max(...cands.map(key));
  const best = cands.filter((o) => key(o) === mx);

  return { cands, done: best.length === 1 ? best[0] : null };
}

function calculateRoundScore(a, b) {
  const cl = (t) => t.filter((c) => c.s === "♣").length;
  const f = (x, y) => {
    const r = {
      cardMajority: x.length > y.length ? 2 : x.length === y.length ? 1 : 0,
      clubMajority: cl(x) > cl(y) ? 1 : 0,
      twoOfClubs: x.some((c) => c.id === "2♣") ? 1 : 0,
      tenOfDiamonds: x.some((c) => c.id === "10♦") ? 1 : 0,
    };

    r.total = r.cardMajority + r.clubMajority + r.twoOfClubs + r.tenOfDiamonds;
    return r;
  };

  return { teamA: f(a, b), teamB: f(b, a) };
}

function newGame(dealer = Math.random() * 4 | 0) {
  const g = { score: [0, 0], dealer, round: 1, over: null };
  startRound(g);
  return g;
}

function startRound(g) {
  g.deck = shuffle(mkDeck());
  g.hands = [[], [], [], []];
  g.table = [];
  g.banks = [[], []];
  g.lastCap = null;
  g.dealNo = 0;
  g.phase = "play";
  g.result = null;
  deal(g);
}

function deal(g) {
  for (let p = 0; p < 4; p++) {
    g.hands[p] = g.deck.splice(0, 4);
  }

  if (g.dealNo === 0) {
    g.table = g.deck.splice(0, 4);
  }

  g.cur = (g.dealer + 1) % 4;
}

function play(g, p, card, cap) {
  if (g.phase !== "play" || p !== g.cur) {
    throw Error("not your turn");
  }

  const ok = getLegalMoves(g.hands[p], g.table).some(
    (m) => m.card.id === card.id && (cap ? m.cap && sameSet(m.cap, cap) : !m.cap)
  );

  if (!ok) {
    throw Error("illegal move");
  }

  g.hands[p] = g.hands[p].filter((c) => c.id !== card.id);

  if (cap) {
    const ids = new Set(cap.map((c) => c.id));
    g.table = g.table.filter((c) => !ids.has(c.id));
    g.banks[team(p)].push(...cap, card);
    g.lastCap = team(p);
  } else {
    g.table.push(card);
  }

  if (g.hands.every((h) => !h.length)) {
    if (g.deck.length) {
      g.dealNo++;
      deal(g);
    } else {
      finishRound(g);
    }
  } else {
    g.cur = (p + 1) % 4;
  }
}

function finishRound(g) {
  g.leftover = g.table.length;

  if (g.lastCap !== null) {
    g.banks[g.lastCap].push(...g.table);
  }

  g.table = [];
  g.result = calculateRoundScore(g.banks[0], g.banks[1]);
  g.score[0] += g.result.teamA.total;
  g.score[1] += g.result.teamB.total;

  const [a, b] = g.score;
  g.over = Math.max(a, b) >= 11 && a !== b ? (a > b ? 0 : 1) : null;
  g.phase = "end";
}

function nextRound(g) {
  g.dealer = (g.dealer + 1) % 4;
  g.round++;
  startRound(g);
}

/* ===== AI: sees only its own view; hidden cards are sampled ===== */
const cv = (c) => 1 + (c.id === "2♣" ? 5 : 0) + (c.id === "10♦" ? 5 : 0) + (c.s === "♣" ? 1.2 : 0);
const gain = (cs) => cs.reduce((s, c) => s + cv(c), 0);

const bestGain = (h, t) =>
  getLegalMoves(h, t).reduce((b, m) => (m.cap ? Math.max(b, gain(m.cap) + cv(m.card)) : b), 0);

const viewFor = (g, p) => ({
  me: p,
  hand: g.hands[p].slice(),
  table: g.table.slice(),
  banks: g.banks.map((b) => b.slice()),
  sizes: g.hands.map((h) => h.length),
  score: g.score.slice(),
});

function chooseMove(v, N = 40) {
  const moves = getLegalMoves(v.hand, v.table);

  if (moves.length === 1) {
    return moves[0];
  }

  const known = new Set([...v.hand, ...v.table, ...v.banks[0], ...v.banks[1]].map((c) => c.id));
  const unseen = mkDeck().filter((c) => !known.has(c.id));

  /* Валет — «джокер»: цена его использования сейчас = ожидаемая выгода,
     которую он принёс бы позже. Считаем по оставшимся валетам и колоде. */
  const oppCards = [1, 2, 3].reduce((a, o) => a + v.sizes[(v.me + o) % 4], 0);
  const deckLeft = Math.max(0, unseen.length - oppCards);
  const unseenJacks = unseen.filter((c) => c.r === "J").length;
  const myJacks = v.hand.filter((c) => c.r === "J").length;
  const turnsLeft = v.hand.length - 1 + Math.floor(deckLeft / 4);
  const contest = Math.min(unseenJacks, 3) / 3; // чем больше чужих валетов, тем скорее надо брать
  const jackReserve =
    turnsLeft <= 0 || !myJacks
      ? 0
      : (0.85 * (3.2 + 0.7 * Math.min(turnsLeft, 4)) * (1 - 0.45 * contest)) / myJacks;
  const W = [0, -1, 0.6, -0.7];
  const tot = moves.map(() => Math.random() * 0.01);

  for (let n = 0; n < N; n++) {
    const u = shuffle(unseen);
    const hs = [];
    let k = 0;

    for (let o = 1; o < 4; o++) {
      const sz = v.sizes[(v.me + o) % 4];
      hs[o] = u.slice(k, k + sz);
      k += sz;
    }

    moves.forEach((m, i) => {
      let t = v.table;
      let g0 = 0;

      if (m.cap) {
        const ids = new Set(m.cap.map((c) => c.id));
        t = t.filter((c) => !ids.has(c.id));
        g0 = gain(m.cap) + cv(m.card);
      } else {
        t = t.concat(m.card);
      }

      if (m.card.r === "J") {
        g0 -= m.cap ? jackReserve : jackReserve + 1;
      }

      let s = g0;

      for (let o = 1; o < 4; o++) {
        s += W[o] * bestGain(hs[o], t);
      }

      tot[i] += s;
    });
  }

  return moves[tot.indexOf(Math.max(...tot))];
}

/* ===== TESTS ===== */
const C = (id) => ({ r: id.slice(0, -1), s: id.slice(-1), id });

function runTests() {
  const out = [];
  let bad = 0;

  const T = (n, c) => {
    out.push((c ? "✓ " : "✗ ") + n);
    if (!c) {
      bad++;
    }
  };

  const d = mkDeck();
  T("колода 52 без дубликатов", d.length === 52 && new Set(d.map((c) => c.id)).size === 52);

  const g = newGame();
  T("4 по 4 + 4 на стол, 32 в колоде", g.hands.every((h) => h.length === 4) && g.table.length === 4 && g.deck.length === 32);

  T("5+6 берёт 6", captureOptions(C("5♠"), [C("6♦")]).length === 1);

  const o5 = captureOptions(C("5♠"), [C("2♦"), C("4♦"), C("5♦")]);
  T("5+2+4=11: берёт 2 и 4 (в банк 3 карты с сыгранной)", o5.length === 1 && o5[0].length === 2);

  T(
    "10♦ берётся тузом, и 10♦ берёт туза",
    captureOptions(C("A♠"), [C("10♦")]).length === 1 && captureOptions(C("10♦"), [C("A♣"), C("3♦")]).length === 1
  );

  T("J берёт лежащую J", captureOptions(C("J♠"), [C("J♦")])[0].length === 1);
  T("Q→Q, K→K", captureOptions(C("Q♠"), [C("Q♦"), C("4♦")]).length === 1 && captureOptions(C("K♠"), [C("K♦")]).length === 1);
  T("Q/K не участвуют в сумме", captureOptions(C("4♠"), [C("7♦"), C("Q♦")]).length === 1 && !captureOptions(C("4♠"), [C("Q♦"), C("K♦")]).length);
  T("J берёт всё кроме Q/K", captureOptions(C("J♠"), ["2♦", "5♦", "7♦", "J♦", "Q♦", "K♦"].map(C))[0].length === 4);

  const s = calculateRoundScore([C("2♣"), C("10♦"), C("3♣"), C("4♣")], [C("5♠")]);
  T("5 категорий = 5 очков", s.teamA.total === 5 && s.teamB.total === 0);

  const e = calculateRoundScore([C("3♣")], [C("3♠")]);
  T("равенство карт: по 1 очку", e.teamA.cardMajority === 1 && e.teamB.cardMajority === 1 && e.teamA.clubMajority === 1 && e.teamB.clubMajority === 0);

  const t10 = calculateRoundScore([C("10♦"), C("3♠")], [C("4♠"), C("5♠"), C("6♠")]);
  T("10♦ даёт +1", t10.teamA.tenOfDiamonds === 1 && t10.teamB.tenOfDiamonds === 0 && t10.teamA.total === 1);

  const h = newGame(0);
  h.table = [];

  try {
    play(h, 3, h.hands[3][0], null);
    T("нелегальный ход запрещён", false);
  } catch (x) {
    T("нелегальный ход запрещён", true);
  }

  const v = viewFor(h, 1);
  T("AI view без чужих рук", !("hands" in v) && !("deck" in v));

  const vw = (hand, table) => ({
    me: 0,
    hand,
    table,
    banks: [[], []],
    sizes: [2, 2, 2, 2],
    score: [0, 0],
  });

  const m = chooseMove(vw([C("3♠"), C("9♥")], [C("2♣"), C("Q♦")]), 60);
  T("AI берёт 2♣ (9+2)", m.card.id === "9♥" && m.cap && m.cap[0].id === "2♣");

  const m2 = chooseMove(vw([C("7♣"), C("A♠")], [C("10♦"), C("K♦")]), 60);
  T("AI берёт 10♦ (A+10)", m2.card.id === "A♠" && m2.cap && m2.cap[0].id === "10♦");

  const tie = [[C("3♠"), C("8♦")], [C("3♠"), C("8♣")]];
  const r1 = resolveCapture(tie, ["3♠"]);
  const r2 = resolveCapture(tie, ["8♦"]);
  T("при выборе общей карты берутся карты с большим числом треф", r1.done && r1.done[1].id === "8♣");
  T("карта только из худшего варианта выбирает именно его", r2.done && r2.done[1].id === "8♦");

  const jv = {
    me: 0,
    hand: [C("J♠"), C("4♠")],
    table: [C("3♦")],
    banks: [[C("J♥"), C("J♦"), C("J♣")], []],
    sizes: [2, 2, 2, 2],
    score: [0, 0],
  };
  let keep = 0;

  for (let i = 0; i < 20; i++) {
    if (chooseMove(jv, 30).card.r !== "J") {
      keep++;
    }
  }

  T("AI бережёт валета ради мелкой добычи, если других валетов нет", keep >= 15);

  const k = newGame();
  let w = 0;

  for (let mt = 0; mt < 6; mt++) {
    const q = newGame();
    let ok = true;

    while (q.over === null) {
      let plays = 0;

      while (q.phase === "play") {
        const mv = chooseMove(viewFor(q, q.cur), 10);
        play(q, q.cur, mv.card, mv.cap);
        plays++;
      }

      if (plays !== 48 || q.banks[0].length + q.banks[1].length !== 52) {
        ok = false;
      }

      if (q.over === null) {
        nextRound(q);
      }
    }

    T(`симуляция матча ${mt + 1}: ${q.score.join(":")}, раздач ${q.round}`, ok && Math.max(...q.score) >= 11);
  }

  return out.join("\n") + `\n\n${bad ? "ОШИБОК: " + bad : "Все тесты пройдены"}`;
}

/* ===== UI ===== */
const S = { speed: "normal", hints: true, sound: true, theme: "auto" };
const ui = {
  screen: "menu",
  busy: false,
  pend: null,
  hint: null,
  pre: null,
  log: "",
  modal: null,
  tests: "",
};

let g = null;
let gid = 0;
const NAMES = ["Вы", "Бот 2", "Партнёр (Бот 3)", "Бот 4"];
const AV = ["🙂", "🤖", "🤝", "👾"];

const K = () => ({ slow: 1.6, normal: 1, fast: 0.3 })[S.speed];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lab = (c) => c.r + c.s;
const app = document.getElementById("app");

function beep(f) {
  if (!S.sound) {
    return;
  }

  try {
    const a = beep.a || (beep.a = new AudioContext());
    const o = a.createOscillator();
    const n = a.createGain();

    o.frequency.value = f;
    n.gain.value = 0.05;
    o.connect(n);
    n.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.08);
  } catch (e) {
    // no-op
  }
}

const cardH = (c, cl = "") =>
  `<div class="card ${c.s === "♥" || c.s === "♦" ? "red" : ""} ${cl}" data-id="${c.id}" ${cl.includes("playable") ? 'data-a="card"' : cl.includes("cap") || cl.includes("sel") ? 'data-a="tcard"' : ""}><b>${c.r}<small>${c.s}</small></b><i>${c.s}</i></div>`;

function render() {
  document.documentElement.dataset.theme = S.theme === "auto" ? "" : S.theme;
  app.innerHTML = ui.screen === "menu" ? menuH() : ui.screen === "rules" ? rulesH() : ui.screen === "set" ? setH() : gameH();
}

const menuH = () =>
  `<div class="center"><h1 style="font-size:64px;margin:0">11</h1><p>Карточная игра для 4 игроков: вы и партнёр против двух ботов. Играем до 11 очков.</p><button data-a="play">ИГРАТЬ</button><button class="alt" data-a="rules">ПРАВИЛА</button><button class="alt" data-a="set">НАСТРОЙКИ</button></div>`;

const rulesH = () =>
  `<div class="panel" style="text-align:left;line-height:1.5"><h2>Правила</h2><p>4 игрока, команды 1+3 и 2+4. Раздача: по 4 карты каждому и 4 открытые на стол; затем ещё два раза по 4 карты (на стол ничего не кладётся). Ходите по часовой стрелке.</p><p><b>A–10</b> (A=1): сыгранная карта вместе с любыми картами стола должна давать 11 — их вы забираете (вместе с сыгранной). Вы вольны сыграть любую карту, но если с сыгранной картой взятие возможно, его нужно сделать. Нет взятия — карта остаётся на столе.<br><b>Q</b> забирает только Q, <b>K</b> только K. <b>J</b> забирает со стола всё, кроме Q и K.</p><p>После последней карты остаток стола получает команда, сделавшая последнее взятие.</p><p><b>Очки раздачи (макс. 5):</b> большинство карт +2 (при равенстве 26:26 — по +1 каждой команде), большинство треф +1 (при равенстве никому), 2♣ +1, 10♦ +1. Матч — до 11 очков.</p><button data-a="back">Назад</button></div>`;

const setH = () =>
  `<div class="panel center"><h2>Настройки</h2><label>Скорость анимаций <select data-a="speed"><option value="slow" ${S.speed === "slow" ? "selected" : ""}>медленно</option><option value="normal" ${S.speed === "normal" ? "selected" : ""}>обычно</option><option value="fast" ${S.speed === "fast" ? "selected" : ""}>быстро</option></select></label>
<label><input type="checkbox" data-a="tg" data-k="sound" ${S.sound ? "checked" : ""}> Звук</label><label><input type="checkbox" data-a="tg" data-k="hints" ${S.hints ? "checked" : ""}> Подсказки</label>
<label>Тема <select data-a="theme"><option value="auto">авто</option><option value="light" ${S.theme === "light" ? "selected" : ""}>светлая</option><option value="dark" ${S.theme === "dark" ? "selected" : ""}>тёмная</option></select></label>
<button class="alt" data-a="test">Тесты и симуляция AI</button><pre>${ui.tests}</pre><button data-a="back">Назад</button></div>`;

function seatH(p) {
  const n = g.hands[p].length - (ui.pre && ui.pre.p === p ? 1 : 0);
  const act = g.cur === p && g.phase === "play";
  const t = team(p);

  return `<div class="seat s${t} ${act ? "act" : ""}" data-seat="${p}"><div class="av t${t}">${AV[p]}</div><b>${NAMES[p]}</b><span class="t${t}">${t ? "Соперники" : "Ваша команда"}</span><div class="row">${"<div class=\"card back mini\"></div>".repeat(n)}</div><span class="dots t${t}" style="visibility:${act && ui.busy && p ? "visible" : "hidden"}"><u></u><u></u><u></u></span></div>`;
}

function gameH() {
  const pe = ui.pend;
  const pre = ui.pre;
  const cands = pe ? resolveCapture(pe.opts, pe.sel).cands : [];
  const union = cands.flat();
  const tc = g.table
    .concat(pre ? [pre.card] : [])
    .map((c) => {
      let cl = "";

      if (pe && !pre) {
        if (pe.sel.includes(c.id)) {
          cl += " sel";
        } else if (union.some((x) => x.id === c.id)) {
          cl += " cap";
        }
      }

      return cardH(c, cl + (c.id === "2♣" || c.id === "10♦" ? " sp" : ""));
    })
    .join("");

  const hand = g.hands[0]
    .filter((c) => !(pre && pre.p === 0 && pre.card.id === c.id))
    .map((c) =>
      cardH(
        c,
        (g.cur === 0 && !ui.busy && g.phase === "play" ? "playable" : "") +
          (ui.hint === c.id ? " hint" : "") +
          (pe && pe.card.id === c.id ? " sel" : "")
      )
    )
    .join("");

  const ctl = "";
  const st =
    g.phase === "end"
      ? ""
      : g.cur === 0
        ? ui.busy
          ? "…"
          : pe
            ? "Нажмите на подсвеченную карту на столе, чтобы взять (клик по своей карте — отмена)"
            : "Ваш ход — выберите карту"
        : `${NAMES[g.cur]} думает…`;

  const b0 = g.banks[0];
  const b1 = g.banks[1];
  const cl = (b) => b.filter((c) => c.s === "♣").length;

  return `<div class="hud panel"><div class="meta">Раздача ${g.round}<br>Колода: ${g.deck.length}</div><div class="score"><span class="t0">Вы <b>${g.score[0]}</b></span>:<span class="t1"><b>${g.score[1]}</b> Соперники</span></div>
  <div class="banks"><a href="#" class="bank b0 ${ui.bump === 0 ? "bump" : ""}" data-a="bank0" data-bank="0">Ваш банк<b>${b0.length}</b>♣ ${cl(b0)}</a><a href="#" class="bank b1 ${ui.bump === 1 ? "bump" : ""}" data-a="bank1" data-bank="1">Банк соперников<b>${b1.length}</b>♣ ${cl(b1)}</a></div></div>
  <div class="row">${seatH(2)}</div><div class="mid">${seatH(1)}<div class="table">${tc || '<i style="color:#fff9">стол пуст</i>'}</div>${seatH(3)}</div>
  <div class="msg"><div>${ui.log}</div><b>${st}</b></div>${ctl}
  <div class="row me">${hand}</div>
  <div class="bar">${S.hints ? `<button class="alt" data-a="hint" ${g.cur === 0 && !ui.busy && g.phase === "play" ? "" : "disabled"}>Подсказка</button>` : ""}<button class="alt" data-a="skip">Ускорить</button><button class="alt" data-a="menu">Меню</button></div>${g.phase === "end" ? endH() : ""}${ui.modal !== null ? bankH() : ""}`;
}

function bankH() {
  const b = g.banks[ui.modal];

  return `<div class="ov" data-a="close"><div class="panel"><h3>${ui.modal ? "Банк соперников" : "Ваш банк"}: ${b.length} карт, треф: ${b.filter((c) => c.s === "♣").length}</h3><div class="row">${b.map((c) => cardH(c, c.id === "2♣" || c.id === "10♦" ? "sp" : "")).join("") || "пусто"}</div></div></div>`;
}

function endH() {
  const r = g.result;
  const Y = (x) => (x ? "Да" : "Нет");
  const blk = (t, n, x) =>
    `<div><h4 class="t${t}">${n}</h4>Карт: ${g.banks[t].length}<br>Треф: ${g.banks[t].filter((c) => c.s === "♣").length}<br>2♣: ${Y(x.twoOfClubs)}<br>10♦: ${Y(x.tenOfDiamonds)}<br><b>Очки: +${x.total}</b></div>`;

  return `<div class="ov"><div class="panel center"><h2>РАЗДАЧА ЗАВЕРШЕНА</h2><div class="cols">${blk(0, "Ваша команда", r.teamA)}${blk(1, "Соперники", r.teamB)}</div><p>Остаток стола (${g.leftover}) — команде последнего взятия.<br><b>Общий счёт: ${g.score[0]} : ${g.score[1]}</b></p>
  ${g.over !== null ? `<h2>${g.over === 0 ? "ПОБЕДА!" : "ПОРАЖЕНИЕ"}</h2><p>${g.over === 0 ? "Команда игрока" : "Команда ботов"} набрала 11 очков.</p><button data-a="play">Новый матч</button>` : `<button data-a="next">Следующая раздача</button>`}</div></div>`;
}

async function doMove(p, card, cap) {
  const id = gid;
  const k = K();
  ui.bump = null;

  const src = p === 0 ? document.querySelector('.row.me [data-id="' + card.id + '"]') : document.querySelector('[data-seat="' + p + '"]');
  const r0 = src && src.getBoundingClientRect();

  ui.log = `<span class="chip t${team(p)}">${NAMES[p]}: ${lab(card)}${cap ? " → берёт " + cap.map(lab).join(" ") : " — кладёт на стол"}</span>`;
  ui.pre = { p, card, cap };
  beep(330);
  render();

  const el = document.querySelector('.table [data-id="' + card.id + '"]');

  if (el && r0) {
    const r1 = el.getBoundingClientRect();
    el.animate(
      [
        {
          transform: `translate(${r0.left + r0.width / 2 - r1.left - r1.width / 2}px,${r0.top + r0.height / 2 - r1.top - r1.height / 2}px) scale(${p ? 0.45 : 1}) rotate(${p === 0 ? 0 : p === 3 ? -25 : 25}deg)`,
          opacity: p ? 0.3 : 1,
        },
        { transform: "none", opacity: 1 },
      ],
      { duration: 900 * k, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }

  await wait(1200 * k);

  if (id !== gid) {
    return false;
  }

  if (cap) {
    const ids = [card.id, ...cap.map((c) => c.id)];
    const els = ids.map((i) => document.querySelector('.table [data-id="' + i + '"]'));

    els.forEach((e) => e && e.classList.add("mark", "m" + team(p)));
    beep(660);
    await wait(1300 * k);

    if (id !== gid) {
      return false;
    }

    const tb = document.querySelector('[data-bank="' + team(p) + '"]').getBoundingClientRect();
    await Promise.all(
      els.map((e, i) => {
        if (!e) {
          return;
        }

        const r = e.getBoundingClientRect();
        return e
          .animate(
            [
              { transform: "none", opacity: 1 },
              {
                transform: `translate(${tb.left + tb.width / 2 - r.left - r.width / 2}px,${tb.top + tb.height / 2 - r.top - r.height / 2}px) scale(.3) rotate(${i % 2 ? 14 : -14}deg)`,
                opacity: 0.15,
              },
            ],
            { duration: 950 * k, delay: i * 130 * k, easing: "cubic-bezier(.55,0,.25,1)", fill: "forwards" }
          )
          .finished;
      })
    );
  } else {
    await wait(700 * k);
  }

  if (id !== gid) {
    return false;
  }

  ui.pre = null;
  const d = g.dealNo;
  play(g, p, card, cap);
  ui.bump = cap ? team(p) : null;

  if (g.phase === "play" && g.dealNo !== d) {
    ui.log = ui.log.replace("</span>", " · новая раздача карт</span>");
  }

  return true;
}

async function step() {
  const id = gid;

  while (g.phase === "play" && id === gid) {
    if (g.cur === 0) {
      ui.busy = false;
      render();
      return;
    }

    ui.busy = true;
    render();
    await wait(1000 * K());

    if (id !== gid) {
      return;
    }

    const m = chooseMove(viewFor(g, g.cur));

    if (!(await doMove(g.cur, m.card, m.cap))) {
      return;
    }
  }

  if (id === gid) {
    ui.busy = false;
    render();
  }
}

async function userMove(card, cap) {
  const id = gid;
  ui.busy = true;
  ui.pend = null;
  ui.hint = null;

  if (await doMove(0, card, cap)) {
    step();
  }
}

function startGame() {
  gid++;
  g = newGame();
  ui.screen = "game";
  ui.busy = false;
  ui.pend = null;
  ui.hint = null;
  ui.log = "Новая игра";
  ui.modal = null;
  step();
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-a]");

  if (!t) {
    return;
  }

  const a = t.dataset.a;

  if (t.tagName === "A") {
    e.preventDefault();
  }

  if (a === "play") {
    startGame();
  } else if (a === "rules" || a === "set") {
    ui.screen = a;
    render();
  } else if (a === "back" || a === "menu") {
    ui.screen = "menu";
    gid++;
    render();
  } else if (a === "card" && g.cur === 0 && !ui.busy) {
    const c = g.hands[0].find((x) => x.id === t.dataset.id);
    ui.hint = null;

    if (ui.pend && ui.pend.card.id === c.id) {
      ui.pend = null;
      render();
      return;
    }

    const o = captureOptions(c, g.table);

    if (!o.length) {
      ui.pend = null;
      userMove(c, null);
    } else {
      ui.pend = { card: c, opts: o, sel: [] };
      render();
    }
  } else if (a === "tcard" && ui.pend) {
    const p = ui.pend;
    const id = t.dataset.id;
    const i = p.sel.indexOf(id);

    if (i < 0) {
      p.sel.push(id);
    } else {
      p.sel.splice(i, 1);
    }

    const r = resolveCapture(p.opts, p.sel);

    if (r.done) {
      userMove(p.card, r.done);
    } else {
      render();
    }
  } else if (a === "cancel") {
    ui.pend = null;
    render();
  } else if (a === "hint") {
    ui.hint = chooseMove(viewFor(g, 0), 30).card.id;
    render();
  } else if (a === "skip") {
    S.speed = "fast";
    render();
  } else if (a === "bank0" || a === "bank1") {
    ui.modal = +a[4];
    render();
  } else if (a === "close") {
    ui.modal = null;
    render();
  } else if (a === "next") {
    nextRound(g);
    ui.log = "Новая раздача";
    step();
  } else if (a === "test") {
    ui.tests = "Выполняется…";
    render();

    setTimeout(() => {
      try {
        ui.tests = runTests();
      } catch (x) {
        ui.tests = "Ошибка: " + x.message;
      }

      render();
    }, 30);
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  const a = t.dataset.a;

  if (a === "speed") {
    S.speed = t.value;
  } else if (a === "theme") {
    S.theme = t.value;
  } else if (a === "tg") {
    S[t.dataset.k] = t.checked;
  }

  render();
});

render();