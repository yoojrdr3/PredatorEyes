// 화면 전환 · 기록 저장 · 랭킹/업적 UI 연결

import { Game } from './game.js';
import { Sfx } from './audio.js';
import { Backend } from './backend.js';
import { STAGES, ACHIEVEMENTS, CONFIG } from './config.js';
import * as R from './records.js';

const $ = (id) => document.getElementById(id);
const NICK_KEY = 'predator-eyes/nick';

const hud = {
  root: $('hud'),
  stage: $('hud-stage'),
  stageName: $('hud-stage-name'),
  distanceVal: $('hud-distance-val'),
  distanceBar: $('bar-distance'),
  sunBar: $('bar-sun'),
  sunVal: $('hud-sun-val'),
  dangerBar: $('bar-danger'),
  lookBar: $('bar-look'),
  repels: $('hud-repels'),
  hint: $('hud-hint'),
};

const SCREENS = ['screen-title', 'screen-brief', 'screen-clear', 'screen-over', 'screen-panel'];
let panelReturn = 'screen-title';

function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  hud.root.style.opacity = id ? '0' : '1';
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = text;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

const list = (rows) =>
  rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');

const pct = (v) => `${Math.round(v * 100)}%`;

/* ---------------------------------------------------------- 게임 */

const game = new Game($('game'), hud, onGameEvent);
window.__game = game; // 디버깅 / 밸런스 확인용

function currentNick() {
  const v = $('nickname').value.trim().toUpperCase();
  return v || localStorage.getItem(NICK_KEY) || 'PLAYER';
}

function startRun() {
  const nick = currentNick();
  localStorage.setItem(NICK_KEY, nick);
  $('nickname').value = nick;
  game.newRun(nick);
  showBrief();
}

function showBrief() {
  const s = game.currentStage();
  $('brief-stage').textContent = String(s.id);
  $('brief-name').textContent = s.name;
  $('brief-stats').innerHTML = list([
    ['대피소까지', `${s.distance} m`],
    ['일몰까지', `${s.sunset}초`],
    ['공룡 접근 속도', `${s.dinoSpeed} m/s`],
    ['시작 거리', `${s.gap} m`],
    ['엄폐물', `${s.covers}개`],
    ['탐색 게이지', `${s.search.toFixed(1)}초`],
  ]);
  show('screen-brief');
}

function beginStage() {
  show(null);
  Sfx.unlock();
  game.beginStage();
}

function onGameEvent(type, data) {
  if (type === 'stageClear') onStageClear(data);
  else if (type === 'gameOver') onGameOver(data);
}

async function onStageClear({ stage, rec, run }) {
  const isFinal = stage.id === CONFIG.finalStageId;
  if (isFinal) {
    await finishRun(run);
    showResult(true, run, '모든 스테이지를 클리어했다');
    return;
  }
  $('clear-name').textContent = stage.name;
  $('clear-stats').innerHTML = list([
    ['스테이지 시간', R.formatTime(rec.timeMs)],
    ['공룡 격퇴', `${rec.repels}회`],
    ['명중 / 발사', `${rec.hits} / ${rec.shots}`],
    ['명중률', rec.shots ? pct(rec.hits / rec.shots) : '-'],
    ['남은 일몰', pct(rec.sunLeft)],
    ['뒤돌아보기', `${rec.lookbacks}회`],
  ]);
  show('screen-clear');
}

async function onGameOver({ reason, run }) {
  await finishRun(run);
  const text = reason === 'caught' ? '포식자에게 따라잡혔다' : '해가 완전히 저물었다';
  showResult(false, run, text);
}

function showResult(cleared, run, reasonText) {
  $('over-eyebrow').textContent = cleared ? 'ALL CLEAR' : 'GAME OVER';
  $('over-eyebrow').className = `eyebrow ${cleared ? 'good' : 'bad'}`;
  $('over-reason').textContent = reasonText;
  $('over-stats').innerHTML = list([
    ['도달 스테이지', `${run.reachedStage} / ${STAGES.length}`],
    ['클리어한 스테이지', `${run.stagesCleared}개`],
    ['총 플레이 시간', R.formatTime(run.totalTimeMs)],
    ['공룡 격퇴', `${run.repels}회`],
    ['명중 / 발사', `${run.hits} / ${run.shots}`],
    ['명중률', run.shots ? pct(run.accuracy) : '-'],
    ['최고 연속 명중', `${run.bestStreak}회`],
    ['뒤돌아보기', `${run.lookbacks}회`],
  ]);
  $('btn-retry').textContent = 'RETRY (STAGE 1)';
  show('screen-over');
}

async function finishRun(run) {
  const before = await Backend.profile(run.nickname);
  const had = new Set(before ? before.achievements : []);
  R.finalize(run);
  await Backend.saveRun(run);
  const fresh = run.achievements.filter((a) => !had.has(a));
  $('over-achv').innerHTML = run.achievements
    .map((id) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      return `<span class="badge">${a ? a.name : id}</span>`;
    })
    .join('');
  fresh.forEach((id, i) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    setTimeout(() => toast(`ACHIEVEMENT · ${a ? a.name : id}`), i * 450);
  });
}

/* ---------------------------------------------------------- 패널 */

function openPanel(title, html, from) {
  panelReturn = from;
  $('panel-title').textContent = title;
  $('panel-body').innerHTML = html;
  show('screen-panel');
}

async function showRanking(from) {
  openPanel('RANKING', '<p class="empty">불러오는 중…</p>', from);
  const render = async (tab) => {
    const tabs = ['ALL', ...STAGES.map((s) => `S${s.id}`)]
      .map((t) => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t}</button>`)
      .join('');
    let body = '';
    if (tab === 'ALL') {
      const rows = await Backend.topClears(20);
      body = rows.length
        ? `<table><thead><tr><th class="num">#</th><th>PLAYER</th><th>FINAL CLEAR</th><th class="num">TIME / STAGE</th></tr></thead><tbody>${rows
            .map(
              (r, i) =>
                `<tr><td class="num">${i + 1}</td><td>${esc(r.nickname)}</td><td>${
                  r.cleared ? 'CLEAR' : '-'
                }</td><td class="num">${
                  r.cleared ? R.formatTime(r.timeMs) : `STAGE ${r.reachedStage}`
                }</td></tr>`
            )
            .join('')}</tbody></table>`
        : '<p class="empty">아직 기록이 없다. 먼저 한 판 달려보자.</p>';
    } else {
      const id = Number(tab.slice(1));
      const rows = await Backend.topStageRepels(id, 10);
      body = rows.length
        ? `<p class="section-title">STAGE ${id} PREDATOR RECORD</p><table><thead><tr><th class="num">#</th><th>PLAYER</th><th class="num">REPELS</th><th class="num">HIT/SHOT</th></tr></thead><tbody>${rows
            .map(
              (r, i) =>
                `<tr><td class="num">${i + 1}</td><td>${esc(r.nickname)}</td><td class="num">${
                  r.repels
                }</td><td class="num">${r.hits}/${r.shots}</td></tr>`
            )
            .join('')}</tbody></table>`
        : `<p class="empty">STAGE ${id} 기록이 아직 없다.</p>`;
    }
    $('panel-body').innerHTML = `<div class="tabs">${tabs}</div>${body}
      <p class="section-title">저장 위치 · ${Backend.label}</p>`;
    $('panel-body').querySelectorAll('[data-tab]').forEach((b) => {
      b.onclick = () => render(b.dataset.tab);
    });
  };
  await render('ALL');
}

async function showAchievements(from) {
  const p = await Backend.profile(currentNick());
  const owned = new Set(p ? p.achievements : []);
  const html = `<div class="achv-list">${ACHIEVEMENTS.map(
    (a) => `<div class="achv ${owned.has(a.id) ? 'on' : ''}">
        <span class="n">${owned.has(a.id) ? '◆' : '◇'} ${a.name}</span>
        <span class="d">${a.desc}</span>
      </div>`
  ).join('')}</div>
  <p class="section-title">${esc(currentNick())} · ${owned.size} / ${ACHIEVEMENTS.length}</p>`;
  openPanel('ACHIEVEMENTS', html, from);
}

function showHow(from) {
  openPanel(
    'HOW TO PLAY',
    `<div class="how">
      <p><b>목표</b> — 해가 완전히 지기 전에 협곡 끝의 대피소에 도착한다.</p>
      <p><b><kbd>W</kbd> / <kbd>↑</kbd></b> 를 누르고 있으면 앞으로 달린다. 달리는 동안 대피소는 가까워지지만, 뒤의 포식자도 함께 가까워진다.</p>
      <p><b><kbd>SPACE</kbd></b> 를 <b>누르고 있는 동안</b> 뒤를 돌아본다. 뒤를 보는 순간 공룡은 멈춰서 바위·고목 뒤에 숨는다.</p>
      <p><b>마우스 이동</b>으로 조준하고 <b>클릭</b>으로 사격한다. 엄폐물 밖으로 드러난 몸을 맞히면 공룡이 뒤로 밀려난다. 가장 확실한 단서는 <b style="color:#ff3a20">붉은 눈</b>이다.</p>
      <p>뒤를 보는 동안 <b>탐색 게이지</b>가 줄어든다. 다 쓰면 강제로 앞을 보게 되고 공룡이 크게 좁혀온다. 게이지는 앞을 보고 있을 때 서서히 회복된다.</p>
      <p>빗맞히면 탐색 시간이 조금 깎이고, 사격 후에는 짧은 재장전 시간이 있다.</p>
      <p><b>발소리와 화면 진동</b>이 거리 신호다. 숫자보다 소리를 먼저 믿어라.</p>
      <p>공룡은 죽지 않는다. 사격은 죽이기 위한 것이 아니라 <b>시간을 버는 수단</b>이다.</p>
    </div>`,
    from
  );
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------- 버튼 연결 */

$('btn-start').onclick = () => { Sfx.unlock(); startRun(); };
$('nickname').addEventListener('keydown', (e) => { if (e.key === 'Enter') { Sfx.unlock(); startRun(); } });
$('btn-brief-go').onclick = (e) => { e.currentTarget.blur(); beginStage(); };
$('btn-next').onclick = (e) => { e.currentTarget.blur(); game.nextStage(); showBrief(); };
$('btn-retry').onclick = (e) => { e.currentTarget.blur(); startRun(); };
$('btn-title').onclick = () => show('screen-title');
$('btn-how').onclick = () => showHow('screen-title');
$('btn-ranking').onclick = () => showRanking('screen-title');
$('btn-over-ranking').onclick = () => showRanking('screen-over');
$('btn-achv').onclick = () => showAchievements('screen-title');
$('btn-panel-close').onclick = () => show(panelReturn);

let muted = false;
$('btn-mute').onclick = () => {
  muted = !muted;
  Sfx.unlock();
  Sfx.setMuted(muted);
  $('btn-mute').textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`;
};

window.addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
window.addEventListener('keydown', () => Sfx.unlock(), { once: true });

/* ---------------------------------------------------------- 초기화 */

$('nickname').value = localStorage.getItem(NICK_KEY) || '';
$('backend-label').textContent = `RECORDS · ${Backend.label}`;
show('screen-title');
