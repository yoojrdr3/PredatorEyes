# PREDATOR EYES

해가 완전히 지기 전에 협곡 끝 대피소까지 도망치는 1인칭 추격 생존 웹 게임.
뒤에서는 검은 몸과 붉은 눈을 가진 포식자가 따라온다.

**플레이 → https://yoojrdr3.github.io/PredatorEyes/**

---

## 핵심 루프

앞으로 달린다 → 대피소가 가까워지지만 공룡도 가까워진다 → 발소리와 화면 진동이 강해진다
→ 뒤를 돌아본다 (공룡이 멈추고 엄폐물 뒤에 숨는다) → 붉은 눈을 찾아 사격한다
→ 명중하면 공룡이 밀려난다 → 다시 앞을 보고 달린다 → 대피소 도착 시 STAGE CLEAR

공룡은 죽지 않는다. 사격은 **시간을 버는 수단**이다.

## 조작

| 입력 | 동작 |
|---|---|
| `W` / `↑` (누르고 있기) | 앞으로 달리기 |
| `SPACE` / `S` / `↓` (누르고 있기) | 뒤돌아보기 — 떼면 다시 앞을 본다 |
| 마우스 이동 | 조준 |
| 마우스 클릭 | 사격 |

뒤를 보는 동안 **탐색 게이지**가 줄어든다. 다 쓰면 강제로 앞을 보게 되고 공룡이 크게 좁혀온다.
게이지는 앞을 보고 달리는 동안 서서히 회복된다.

## 실패 / 성공

- **STAGE CLEAR** — 일몰 전에 대피소 도착
- **GAME OVER 1** — 공룡이 12m 안까지 접근 (점프스케어)
- **GAME OVER 2** — 완전 일몰 (점프스케어)

## 스테이지

5개 스테이지. 뒤로 갈수록 거리가 멀어지고, 공룡이 빨라지고, 엄폐물이 늘고,
공룡의 노출 면적이 줄고, 탐색 시간이 짧아진다.

---

## 파일 구조

```
index.html                        화면 구조 (HUD · 타이틀 · 결과 · 랭킹 패널)
assets/style.css                  전체 스타일
src/config.js                     스테이지 테이블 · 밸런스 상수 · 업적 목록   ← 밸런스는 여기만 고치면 된다
src/game.js                       상태 머신 + 메인 루프 (전진/탐색/사격/일몰)
src/scene.js                      캔버스 렌더링 + 뒤돌아보기 장면 생성 + 명중 판정
src/audio.js                      WebAudio로 만든 발소리 · 총성 · 점프스케어 (오디오 파일 없음)
src/records.js                    플레이 기록 집계 + 업적 판정
src/main.js                       화면 전환 · 기록 저장 · 랭킹/업적 UI
src/backend.js                    ★ 백엔드 어댑터 (지금은 localStorage)
src/backend.firebase.template.js  ★ Firebase 구현 뼈대 (아직 import 하지 않음)
.github/workflows/deploy-pages.yml  push 하면 GitHub Pages로 자동 배포
```

이미지·오디오 에셋이 하나도 없다. 모든 그래픽은 Canvas 2D로, 모든 소리는 WebAudio로 생성한다.

### 명중 판정 방식

공룡이 엄폐물 뒤에 숨으면 "어디까지가 노출된 부위인가"를 계산해야 한다.
이 게임은 화면 밖 마스크 캔버스에 **공룡을 그린 뒤 앞쪽 엄폐물들을 `destination-out`으로 지워서**
실제로 보이는 픽셀만 남긴다. 클릭 지점의 알파값을 읽으면 그게 곧 명중 판정이다.

같은 마스크로 노출 픽셀 수도 센다. 스테이지별 목표 노출 비율
(`minRatio` ~ `maxRatio`)에 들어올 때까지 공룡 위치를 조정하므로
**절대 찾을 수 없는 장면이나 너무 훤히 보이는 장면이 나오지 않는다.**

---

## 기록 / 랭킹 / 업적

저장하는 값: 닉네임, 최고 도달 스테이지, 최종 클리어 여부, 전체 클리어 시간,
스테이지별 기록(시간·격퇴·발사·명중·뒤돌아보기·남은 일몰), 총 발사/명중/명중률, 최고 연속 명중.

랭킹은 두 종류다.

1. **전체 클리어 랭킹** — 최종 스테이지 클리어 순 → 클리어 타임 오름차순
2. **스테이지별 PREDATOR RECORD** — 해당 스테이지에서의 공룡 격퇴 횟수 순

업적: `FIRST ESCAPE` · `PREDATOR HUNTER` · `RED EYE` · `SUNSET SURVIVOR` · `DON'T LOOK BACK` · `LAST SHELTER`

---

## 백엔드 (Firebase 연결 예정)

지금은 **오프라인**이다. 기록이 브라우저 `localStorage`에만 쌓인다.
게임 코드는 `src/backend.js`가 내보내는 `Backend` 객체 하나만 사용하므로,
Firebase를 붙일 때 **게임 로직은 전혀 건드리지 않는다.**

인터페이스는 4개뿐이다.

```js
Backend.saveRun(run)                   // 한 판 기록 저장
Backend.topClears(limit)               // 전체 클리어 랭킹
Backend.topStageRepels(stageId, limit) // 스테이지별 격퇴 랭킹
Backend.profile(nickname)              // 닉네임 누적 기록 (업적 표시에 사용)
```

### 연결 순서

1. Firebase 콘솔에서 프로젝트 생성 → 웹 앱 등록 → `firebaseConfig` 복사
2. Firestore Database 생성
3. `src/backend.firebase.template.js`의 `firebaseConfig`를 채운다
4. `src/backend.js` 마지막 줄을 교체한다

```js
import { FirebaseBackend } from './backend.firebase.template.js';
export const Backend = FirebaseBackend;
```

Firestore 문서 구조와 보안 규칙 예시는 `src/backend.firebase.template.js` 주석에 정리해 두었다.

---

## 로컬에서 실행

ES 모듈을 쓰기 때문에 파일을 직접 열지 말고 정적 서버로 띄운다.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## 배포

`claude/repo-permissions-check-q4jwd1` 브랜치에 push 하면
GitHub Actions가 저장소 루트를 그대로 GitHub Pages에 배포한다.
