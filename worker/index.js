// Cloudflare Worker API. 정적 자산(index.html 등)은 wrangler의 assets 바인딩이
// 자동으로 서빙하고, /api/ 로 시작하는 요청만 이 스크립트로 들어온다.

const MAX_NICK = 12;
const MAX_JSON_LEN = 8000; // achievements/stages JSON 문자열 상한 (비정상 입력 방어)
const FINAL_STAGE_ID = 5;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

const badRequest = (msg) => json({ error: msg }, 400);

function sanitizeNick(v) {
  const s = String(v ?? '').trim().slice(0, MAX_NICK);
  return s || 'PLAYER';
}

function validateRun(body) {
  if (!body || typeof body !== 'object') return 'run이 없다';
  const nums = ['reachedStage', 'stagesCleared', 'totalTimeMs', 'shots', 'hits', 'repels', 'lookbacks', 'bestStreak'];
  for (const k of nums) {
    if (typeof body[k] !== 'number' || !Number.isFinite(body[k])) return `${k}가 숫자가 아니다`;
  }
  if (!Array.isArray(body.stages)) return 'stages가 배열이 아니다';
  if (!Array.isArray(body.achievements)) return 'achievements가 배열이 아니다';
  const stagesJson = JSON.stringify(body.stages);
  const achvJson = JSON.stringify(body.achievements);
  if (stagesJson.length > MAX_JSON_LEN || achvJson.length > MAX_JSON_LEN) return '기록 데이터가 너무 크다';
  return null;
}

async function saveRun(env, body) {
  const err = validateRun(body);
  if (err) throw new HttpError(400, err);

  const nickname = sanitizeNick(body.nickname);
  const nicknameLower = nickname.toLowerCase();
  const cleared = body.stages.some((s) => s && s.stage === FINAL_STAGE_ID && s.cleared) ? 1 : 0;
  const accuracy = body.shots > 0 ? body.hits / body.shots : 0;
  const achievements = JSON.stringify(body.achievements);
  const stagesJson = JSON.stringify(body.stages);

  await env.DB.prepare(
    `INSERT INTO runs
      (nickname, reached_stage, stages_cleared, cleared, total_time_ms, shots, hits, repels, lookbacks, best_streak, accuracy, achievements, stages)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      nickname, body.reachedStage, body.stagesCleared, cleared, body.totalTimeMs,
      body.shots, body.hits, body.repels, body.lookbacks, body.bestStreak, accuracy,
      achievements, stagesJson
    )
    .run();

  await upsertProfile(env, nicknameLower, nickname, body, cleared);
  for (const s of body.stages) {
    if (s && typeof s.stage === 'number') await upsertStageRepels(env, nicknameLower, nickname, s);
  }
}

async function upsertProfile(env, nicknameLower, nickname, run, cleared) {
  const row = await env.DB.prepare('SELECT * FROM profiles WHERE nickname_lower = ?').bind(nicknameLower).first();
  const prevAchv = row ? JSON.parse(row.achievements || '[]') : [];
  const merged = Array.from(new Set([...prevAchv, ...run.achievements]));
  const bestStage = Math.max(row ? row.best_stage : 0, run.reachedStage);
  const bestClearMs = cleared
    ? row && row.best_clear_ms != null ? Math.min(row.best_clear_ms, run.totalTimeMs) : run.totalTimeMs
    : row ? row.best_clear_ms : null;

  await env.DB.prepare(
    `INSERT INTO profiles (nickname_lower, nickname, best_stage, cleared, best_clear_ms, achievements, total_shots, total_hits, runs)
     VALUES (?,?,?,?,?,?,?,?,1)
     ON CONFLICT(nickname_lower) DO UPDATE SET
       nickname = excluded.nickname,
       best_stage = excluded.best_stage,
       cleared = cleared OR excluded.cleared,
       best_clear_ms = excluded.best_clear_ms,
       achievements = excluded.achievements,
       total_shots = total_shots + ?,
       total_hits = total_hits + ?,
       runs = runs + 1`
  )
    .bind(
      nicknameLower, nickname, bestStage, cleared, bestClearMs, JSON.stringify(merged),
      run.shots, run.hits,
      run.shots, run.hits
    )
    .run();
}

async function upsertStageRepels(env, nicknameLower, nickname, stageRec) {
  await env.DB.prepare(
    `INSERT INTO stage_repels (nickname_lower, stage, nickname, best_repels, best_hits, best_shots)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(nickname_lower, stage) DO UPDATE SET
       nickname = excluded.nickname,
       best_repels = MAX(best_repels, excluded.best_repels),
       best_hits = CASE WHEN excluded.best_repels > best_repels THEN excluded.best_hits ELSE best_hits END,
       best_shots = CASE WHEN excluded.best_repels > best_repels THEN excluded.best_shots ELSE best_shots END`
  )
    .bind(nicknameLower, stageRec.stage, nickname, stageRec.repels || 0, stageRec.hits || 0, stageRec.shots || 0)
    .run();
}

async function topClears(env, limit) {
  const { results } = await env.DB.prepare(
    `SELECT nickname, cleared, best_stage AS reachedStage, best_clear_ms AS timeMs
     FROM profiles
     ORDER BY cleared DESC, (CASE WHEN cleared = 1 THEN best_clear_ms ELSE 999999999 END) ASC, best_stage DESC
     LIMIT ?`
  )
    .bind(limit)
    .all();
  return results.map((r) => ({ nickname: r.nickname, cleared: !!r.cleared, reachedStage: r.reachedStage, timeMs: r.timeMs }));
}

async function topStageRepels(env, stage, limit) {
  const { results } = await env.DB.prepare(
    `SELECT nickname, best_repels AS repels, best_hits AS hits, best_shots AS shots
     FROM stage_repels WHERE stage = ? ORDER BY best_repels DESC LIMIT ?`
  )
    .bind(stage, limit)
    .all();
  return results;
}

async function getProfile(env, nicknameLower) {
  const row = await env.DB.prepare('SELECT * FROM profiles WHERE nickname_lower = ?').bind(nicknameLower).first();
  if (!row) return null;
  const stageRows = await env.DB.prepare('SELECT stage, best_repels FROM stage_repels WHERE nickname_lower = ?')
    .bind(nicknameLower)
    .all();
  const stageBestRepels = {};
  for (const r of stageRows.results) stageBestRepels[r.stage] = r.best_repels;
  return {
    nickname: row.nickname,
    bestStage: row.best_stage,
    cleared: !!row.cleared,
    bestClearMs: row.best_clear_ms,
    achievements: JSON.parse(row.achievements || '[]'),
    stageBestRepels,
    totalShots: row.total_shots,
    totalHits: row.total_hits,
    runs: row.runs,
  };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const clampLimit = (v, def, max) => Math.max(1, Math.min(max, parseInt(v, 10) || def));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/runs' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        await saveRun(env, body);
        return json({ ok: true });
      }

      if (path === '/api/rankings/clears' && request.method === 'GET') {
        const limit = clampLimit(url.searchParams.get('limit'), 20, 50);
        return json(await topClears(env, limit));
      }

      const stageMatch = path.match(/^\/api\/rankings\/stage\/(\d+)$/);
      if (stageMatch && request.method === 'GET') {
        const limit = clampLimit(url.searchParams.get('limit'), 10, 50);
        return json(await topStageRepels(env, Number(stageMatch[1]), limit));
      }

      const profileMatch = path.match(/^\/api\/profile\/([^/]+)$/);
      if (profileMatch && request.method === 'GET') {
        const nick = decodeURIComponent(profileMatch[1]).toLowerCase().slice(0, MAX_NICK);
        return json(await getProfile(env, nick));
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'internal error' }, 500);
    }
  },
};
