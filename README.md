# PREDATOR EYES

해가 완전히 지기 전에 협곡 끝 대피소까지 도망치는 1인칭 추격 생존 웹 게임.
뒤에서는 검은 몸과 붉은 눈을 가진 포식자가 따라온다.

**플레이 → https://predator-eyes.yoojrdr3.workers.dev/**

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
public/                             Worker가 그대로 서빙하는 정적 자산
  index.html                        화면 구조 (HUD · 타이틀 · 결과 · 랭킹 패널)
  assets/style.css                  전체 스타일
  src/config.js                     스테이지 테이블 · 밸런스 상수 · 업적 목록   ← 밸런스는 여기만 고치면 된다
  src/game.js                       상태 머신 + 메인 루프 (전진/탐색/사격/일몰)
  src/scene.js                      캔버스 렌더링 + 뒤돌아보기 장면 생성 + 명중 판정
  src/audio.js                      WebAudio로 만든 발소리 · 총성 · 점프스케어 (오디오 파일 없음)
  src/records.js                    플레이 기록 집계 + 업적 판정
  src/main.js                       화면 전환 · 기록 저장 · 랭킹/업적 UI
  src/backend.js                    ★ 백엔드 어댑터 (CloudflareBackend, localStorage는 오프라인 폴백)
worker/index.js                     ★ Cloudflare Worker — /api/* 를 처리하는 D1 API
migrations/0001_init.sql            D1 스키마 (runs · profiles · stage_repels)
wrangler.jsonc                      Worker 설정 (정적 자산 + D1 바인딩)
.github/workflows/cf-deploy.yml     push 하면 Cloudflare Workers로 자동 배포
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

## 아키텍처 — Cloudflare Workers + D1

프론트와 백엔드를 하나의 Worker가 함께 서빙한다.

- **정적 자산** — `public/` 디렉터리를 Workers Static Assets가 그대로 서빙한다.
- **API** — `/api/*` 요청만 `worker/index.js`로 들어온다. (`/api/`로 시작하지 않는 경로는
  정적 파일이 먼저 매칭되므로 별도 라우팅 설정이 필요 없다.)
- **DB** — Cloudflare D1(SQLite). 테이블 3개: `runs`(한 판 기록), `profiles`(닉네임별 누적),
  `stage_repels`(닉네임×스테이지별 최고 격퇴). 스키마는 `migrations/0001_init.sql`.

게임 코드는 여전히 `src/backend.js`가 내보내는 `Backend` 객체 하나만 사용한다. 인터페이스는 4개뿐이다.

```js
Backend.saveRun(run)                   // 한 판 기록 저장 → POST /api/runs
Backend.topClears(limit)               // 전체 클리어 랭킹 → GET /api/rankings/clears
Backend.topStageRepels(stageId, limit) // 스테이지별 격퇴 랭킹 → GET /api/rankings/stage/:id
Backend.profile(nickname)              // 닉네임 누적 기록 → GET /api/profile/:nickname
```

`CloudflareBackend`가 이 4개를 상대경로 `fetch('/api/...')`로 구현한다. 네트워크 오류가 나면
`LocalBackend`(브라우저 `localStorage`)로 조용히 폴백하므로, API가 잠깐 죽어도 게임 자체는 끊기지 않는다.

### API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/runs` | 한 판 기록 저장 (JSON body = run 객체) |
| GET | `/api/rankings/clears?limit=20` | 전체 클리어 랭킹 |
| GET | `/api/rankings/stage/:id?limit=10` | 스테이지별 PREDATOR RECORD |
| GET | `/api/profile/:nickname` | 닉네임 누적 기록 |

---

## 로컬에서 실행

Worker + D1 + 정적 자산을 한 번에 띄운다 (Cloudflare 계정 로그인 불필요 — 완전히 로컬로 동작).

```bash
npx wrangler d1 migrations apply predator-eyes-db --local   # 로컬 D1에 스키마 적용 (최초 1회)
npx wrangler dev                                            # http://localhost:8787
```

## 배포

`claude/repo-permissions-check-q4jwd1` 브랜치에 push하면 `.github/workflows/cf-deploy.yml`이
GitHub Actions에서 `wrangler deploy`로 Worker + 정적 자산을 올리고, 이어서
`wrangler d1 migrations apply --remote`로 D1 스키마를 적용한다.

인증은 저장소 Settings → Secrets and variables → Actions에 등록된
`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 시크릿으로 이루어진다.

D1 데이터베이스는 `wrangler.jsonc`에 `database_id`를 적어두지 않았다. wrangler 4.45+의
**자동 리소스 프로비저닝** 덕분에, 배포 시 데이터베이스가 없으면 자동으로 만들어서 연결하고,
있으면 이름으로 찾아 계속 재사용한다.

수동으로 배포하고 싶을 때 (Cloudflare API 토큰이 로컬 셸에 있다면):

```bash
npx wrangler deploy
npx wrangler d1 migrations apply predator-eyes-db --remote
```
