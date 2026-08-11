// ============================================================
//  Firebase 백엔드 (내일 채워 넣을 뼈대)
// ------------------------------------------------------------
//  이 파일은 아직 어디에서도 import 하지 않는다. 즉, 지금 게임은
//  Firebase SDK 없이 완전히 동작한다.
//
//  붙이는 순서
//   1. Firebase 콘솔에서 프로젝트 생성 → 웹 앱 등록 → firebaseConfig 복사
//   2. Firestore Database 생성 (테스트 모드로 시작해도 된다)
//   3. 아래 firebaseConfig 를 채운다
//   4. src/backend.js 마지막 줄을 다음과 같이 바꾼다
//        import { FirebaseBackend } from './backend.firebase.template.js';
//        export const Backend = FirebaseBackend;
//      (파일명을 backend.firebase.js 로 바꿔도 좋다)
//   5. 끝. 게임 코드는 한 줄도 고칠 필요가 없다.
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, limit as qLimit, where,
  doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// TODO: 콘솔에서 복사한 설정으로 교체
const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ------------------------------------------------------------
//  Firestore 문서 구조
//
//  runs/{autoId}                     ... 한 판의 플레이 기록
//    nickname        string
//    reachedStage    number
//    stagesCleared   number
//    cleared         boolean         (최종 스테이지 클리어 여부)
//    totalTimeMs     number
//    shots, hits, repels, lookbacks, bestStreak   number
//    accuracy        number
//    achievements    string[]
//    stages          [{ stage, name, cleared, timeMs, shots, hits, repels, lookbacks, sunLeft }]
//    createdAt       timestamp
//
//  profiles/{nicknameLower}          ... 닉네임별 누적 기록
//    nickname        string
//    bestStage       number
//    cleared         boolean
//    bestClearMs     number | null
//    achievements    string[]
//    stageBestRepels { "1": number, "2": number, ... }
//    totalShots, totalHits, runs   number
//
//  권장 인덱스
//    runs: cleared(desc) + totalTimeMs(asc)
//    runs: reachedStage(desc)
// ------------------------------------------------------------

export const FirebaseBackend = {
  id: 'firebase',
  online: true,
  label: 'FIREBASE (온라인)',

  async saveRun(run) {
    await addDoc(collection(db, 'runs'), { ...run, createdAt: serverTimestamp() });

    // 누적 프로필 갱신 (간단하게 읽고-합치고-쓰기)
    const key = run.nickname.toLowerCase();
    const ref = doc(db, 'profiles', key);
    const snap = await getDoc(ref);
    const p = snap.exists()
      ? snap.data()
      : { nickname: run.nickname, bestStage: 0, cleared: false, bestClearMs: null,
          achievements: [], stageBestRepels: {}, totalShots: 0, totalHits: 0, runs: 0 };

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
      if (s.repels > (p.stageBestRepels[s.stage] || 0)) p.stageBestRepels[s.stage] = s.repels;
    }
    await setDoc(ref, p);
  },

  async topClears(limit = 20) {
    // 최종 클리어한 기록을 시간순으로
    const q1 = query(
      collection(db, 'runs'),
      where('cleared', '==', true),
      orderBy('totalTimeMs', 'asc'),
      qLimit(limit)
    );
    const rows = (await getDocs(q1)).docs.map((d) => {
      const r = d.data();
      return { nickname: r.nickname, cleared: true, reachedStage: r.reachedStage, timeMs: r.totalTimeMs };
    });
    if (rows.length >= limit) return dedupeByNickname(rows).slice(0, limit);

    // 모자라면 도달 스테이지 순으로 채운다
    const q2 = query(collection(db, 'runs'), orderBy('reachedStage', 'desc'), qLimit(limit * 2));
    const rest = (await getDocs(q2)).docs
      .map((d) => d.data())
      .filter((r) => !r.cleared)
      .map((r) => ({ nickname: r.nickname, cleared: false, reachedStage: r.reachedStage, timeMs: r.totalTimeMs }));
    return dedupeByNickname([...rows, ...rest]).slice(0, limit);
  },

  async topStageRepels(stageId, limit = 10) {
    // 스테이지별 격퇴 랭킹.
    // stages 가 배열이라 Firestore 정렬이 어렵다 → profiles.stageBestRepels 를 쓰거나,
    // 저장 시 stageRepels: { "3": 12 } 형태의 맵 필드를 함께 넣어 orderBy 하는 방법을 권장한다.
    const snap = await getDocs(query(collection(db, 'profiles'), qLimit(200)));
    return snap.docs
      .map((d) => d.data())
      .map((p) => ({ nickname: p.nickname, repels: (p.stageBestRepels || {})[stageId] || 0, hits: p.totalHits, shots: p.totalShots }))
      .filter((r) => r.repels > 0)
      .sort((a, b) => b.repels - a.repels)
      .slice(0, limit);
  },

  async profile(nickname) {
    const snap = await getDoc(doc(db, 'profiles', String(nickname || '').toLowerCase()));
    return snap.exists() ? snap.data() : null;
  },
};

function dedupeByNickname(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const k = r.nickname.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/*  Firestore 보안 규칙 예시 (수업용: 읽기 자유 / 쓰기는 형식 검사)

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /runs/{id} {
          allow read: if true;
          allow create: if request.resource.data.nickname is string
                        && request.resource.data.nickname.size() <= 12
                        && request.resource.data.totalTimeMs is number;
          allow update, delete: if false;
        }
        match /profiles/{id} {
          allow read: if true;
          allow write: if request.resource.data.nickname is string;
        }
      }
    }
*/
