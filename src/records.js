// 플레이 기록 집계 + 업적 판정

import { ACHIEVEMENTS, CONFIG } from './config.js';

export function createRun(nickname) {
  return {
    nickname: nickname || 'PLAYER',
    startedAt: Date.now(),
    reachedStage: 1,
    stagesCleared: 0,
    cleared: false,
    totalTimeMs: 0,
    shots: 0,
    hits: 0,
    repels: 0,
    lookbacks: 0,
    bestStreak: 0,
    streak: 0,
    stages: [],
    achievements: [],
  };
}

export function beginStage(run, stage) {
  const rec = {
    stage: stage.id,
    name: stage.name,
    cleared: false,
    timeMs: 0,
    shots: 0,
    hits: 0,
    repels: 0,
    lookbacks: 0,
    sunLeft: 1,
  };
  run.stages.push(rec);
  run.reachedStage = Math.max(run.reachedStage, stage.id);
  return rec;
}

export function recordShot(run, rec, isHit) {
  run.shots += 1; rec.shots += 1;
  if (isHit) {
    run.hits += 1; rec.hits += 1;
    run.streak += 1;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
  } else {
    run.streak = 0;
  }
}

export function recordRepel(run, rec) {
  run.repels += 1; rec.repels += 1;
}

export function recordLookback(run, rec) {
  run.lookbacks += 1; rec.lookbacks += 1;
}

export function endStage(run, rec, cleared, timeMs, sunLeft) {
  rec.cleared = cleared;
  rec.timeMs = Math.round(timeMs);
  rec.sunLeft = sunLeft;
  run.totalTimeMs += Math.round(timeMs);
  if (cleared) run.stagesCleared += 1;
}

export function finalize(run) {
  run.cleared = run.stages.some((s) => s.stage === CONFIG.finalStageId && s.cleared);
  run.accuracy = run.shots > 0 ? run.hits / run.shots : 0;
  run.achievements = evaluateAchievements(run);
  run.endedAt = Date.now();
  return run;
}

export function evaluateAchievements(run) {
  const got = new Set();
  for (const s of run.stages) {
    if (!s.cleared) continue;
    if (s.stage === 1) got.add('FIRST_ESCAPE');
    if (s.stage === CONFIG.finalStageId) got.add('LAST_SHELTER');
    if (s.repels >= 5) got.add('PREDATOR_HUNTER');
    if (s.sunLeft <= 0.08) got.add('SUNSET_SURVIVOR');
    if (s.lookbacks <= 3) got.add('DONT_LOOK_BACK');
  }
  if (run.bestStreak >= 6) got.add('RED_EYE');
  return ACHIEVEMENTS.filter((a) => got.has(a.id)).map((a) => a.id);
}

export const formatTime = (ms) => {
  const total = Math.max(0, Math.round(ms / 100) / 10);
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
};
