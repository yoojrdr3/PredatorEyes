// ============================================================
//  백엔드 어댑터
// ------------------------------------------------------------
//  게임 코드는 이 파일이 내보내는 Backend 객체만 사용한다.
//  배포 대상은 Cloudflare Workers + D1 이며, 같은 Worker가 정적 파일과
//  /api/* 요청을 함께 처리하므로 프론트는 상대 경로로 fetch 하면 된다.
//  (Worker 쪽 구현은 worker/index.js, 스키마는 migrations/0001_init.sql)
//
//  인터페이스
//    Backend.id            : 'cloudflare' | 'local'
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

// 오프라인 폴백. Worker API를 못 붙이는 로컬 개발(정적 서버로 index.html만 열 때)에서
// 게임이 죽지 않도록 남겨둔다. 배포된 사이트에서는 CloudflareBackend가 쓰인다.
export const LocalBackend = {
  id: 'local',
  online: false,
  label: 'LOCAL STORAGE (오프라인)',

  async saveRun(run) {
    const runs = readJson(KEY_RUNS, []);
    runs.push(run);
    while (runs.length > MAX_RUNS) runs.shift();
    writeJson(KEY_RUNS, runs);

    const profiles = readJson(KEY_PROFILE, {});
    const key = run.nickname.toLowerCase();
    const p = profiles[key] || {
      nickname: run.nickname, bestStage: 0, cleared: false, bestClearMs: null,
      achievements: [], stageBestRepels: {}, totalShots: 0, totalHits: 0, runs: 0,
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
    for (const id of run.achievements) if (!p.achievements.includes(id)) p.achievements.push(id);
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

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

export const CloudflareBackend = {
  id: 'cloudflare',
  online: true,
  label: 'CLOUDFLARE D1 (온라인)',

  async saveRun(run) {
    try {
      await api('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(run),
      });
    } catch (e) {
      // 네트워크 문제로 기록 저장이 실패해도 게임 결과 화면은 그대로 보여준다.
      console.warn('saveRun failed, falling back to local storage', e);
      await LocalBackend.saveRun(run);
    }
  },

  async topClears(limit = 20) {
    try {
      return await api(`/api/rankings/clears?limit=${limit}`);
    } catch (e) {
      console.warn('topClears failed', e);
      return [];
    }
  },

  async topStageRepels(stageId, limit = 10) {
    try {
      return await api(`/api/rankings/stage/${stageId}?limit=${limit}`);
    } catch (e) {
      console.warn('topStageRepels failed', e);
      return [];
    }
  },

  async profile(nickname) {
    try {
      return await api(`/api/profile/${encodeURIComponent(String(nickname || '').toLowerCase())}`);
    } catch (e) {
      console.warn('profile failed', e);
      return null;
    }
  },
};

export const Backend = CloudflareBackend;
