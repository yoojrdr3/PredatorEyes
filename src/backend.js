// ============================================================
//  백엔드 어댑터
// ------------------------------------------------------------
//  게임 코드는 이 파일이 내보내는 Backend 객체만 사용한다.
//  지금은 브라우저 localStorage에 저장하는 로컬 구현이 들어있고,
//  내일 Firebase를 붙일 때는 아래 5개 함수의 "속만" 바꾸면 된다.
//  (src/backend.firebase.template.js 에 채워 넣을 뼈대를 준비해 두었다)
//
//  인터페이스
//    Backend.id            : 'local' | 'firebase'
//    Backend.online        : 온라인 여부 (UI 표시에 사용)
//    Backend.label         : 화면에 보여줄 이름
//    Backend.saveRun(run)                    -> Promise<void>
//    Backend.topClears(limit)                -> Promise<Row[]>
//    Backend.topStageRepels(stageId, limit)  -> Promise<Row[]>
//    Backend.profile(nickname)               -> Promise<Profile>
// ============================================================

const KEY_RUNS = 'predator-eyes/runs/v1';
const KEY_PROFILE = 'predator-eyes/profile/v1';
const MAX_RUNS = 300;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* 저장 공간이 없으면 조용히 무시 */
  }
}

export const LocalBackend = {
  id: 'local',
  online: false,
  label: 'LOCAL STORAGE (오프라인)',

  async saveRun(run) {
    const runs = readJson(KEY_RUNS, []);
    runs.push(run);
    while (runs.length > MAX_RUNS) runs.shift();
    writeJson(KEY_RUNS, runs);

    // 닉네임별 누적 프로필 갱신
    const profiles = readJson(KEY_PROFILE, {});
    const key = run.nickname.toLowerCase();
    const p = profiles[key] || {
      nickname: run.nickname,
      bestStage: 0,
      cleared: false,
      bestClearMs: null,
      achievements: [],
      stageBestRepels: {},
      totalShots: 0,
      totalHits: 0,
      runs: 0,
    };
    p.nickname = run.nickname;
    p.bestStage = Math.max(p.bestStage, run.reachedStage);
    p.totalShots += run.shots;
    p.totalHits += run.hits;
    p.runs += 1;
    if (run.cleared) {
      p.cleared = true;
      if (p.bestClearMs == null || run.totalTimeMs < p.bestClearMs) p.bestClearMs = run.totalTimeMs;
    }
    for (const id of run.achievements) {
      if (!p.achievements.includes(id)) p.achievements.push(id);
    }
    for (const s of run.stages) {
      const prev = p.stageBestRepels[s.stage] || 0;
      if (s.repels > prev) p.stageBestRepels[s.stage] = s.repels;
    }
    profiles[key] = p;
    writeJson(KEY_PROFILE, profiles);
  },

  async topClears(limit = 20) {
    const runs = readJson(KEY_RUNS, []);
    const best = new Map();
    for (const r of runs) {
      const key = r.nickname.toLowerCase();
      const cur = best.get(key);
      const score = { nickname: r.nickname, cleared: r.cleared, reachedStage: r.reachedStage, timeMs: r.totalTimeMs };
      if (!cur) { best.set(key, score); continue; }
      if (score.cleared && !cur.cleared) { best.set(key, score); continue; }
      if (score.cleared && cur.cleared && score.timeMs < cur.timeMs) { best.set(key, score); continue; }
      if (!score.cleared && !cur.cleared && score.reachedStage > cur.reachedStage) best.set(key, score);
    }
    return [...best.values()]
      .sort((a, b) => {
        if (a.cleared !== b.cleared) return a.cleared ? -1 : 1;
        if (a.cleared) return a.timeMs - b.timeMs;
        return b.reachedStage - a.reachedStage;
      })
      .slice(0, limit);
  },

  async topStageRepels(stageId, limit = 10) {
    const runs = readJson(KEY_RUNS, []);
    const best = new Map();
    for (const r of runs) {
      const rec = r.stages.find((s) => s.stage === stageId);
      if (!rec) continue;
      const key = r.nickname.toLowerCase();
      const cur = best.get(key);
      if (!cur || rec.repels > cur.repels) {
        best.set(key, { nickname: r.nickname, repels: rec.repels, hits: rec.hits, shots: rec.shots });
      }
    }
    return [...best.values()].sort((a, b) => b.repels - a.repels).slice(0, limit);
  },

  async profile(nickname) {
    const profiles = readJson(KEY_PROFILE, {});
    return profiles[String(nickname || '').toLowerCase()] || null;
  },
};

// 지금은 로컬 구현을 그대로 내보낸다.
// 내일 Firebase 연결 시: FirebaseBackend를 import 해서 이 한 줄만 바꾸면 된다.
export const Backend = LocalBackend;
