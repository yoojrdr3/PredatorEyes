// 게임 전역 설정값. 밸런스 조정은 대부분 이 파일만 고치면 된다.

export const VIEW = { W: 1280, H: 720, HORIZON: 296 };

export const CONFIG = {
  player: {
    speed: 24,           // 앞으로 달리는 속도 (m/s)
    caughtDistance: 12,  // 이 거리 안으로 들어오면 잡힌 것으로 처리
  },
  shot: {
    reloadMs: 300,       // 사격 후 재장전 딜레이
    missPenalty: 0.6,    // 빗맞혔을 때 깎이는 탐색 시간(초)
    tolerance: 7,        // 명중 판정 여유 반경(px)
  },
  look: {
    turnMs: 190,         // 뒤돌아보기 전환 연출 시간
    refillRatio: 0.22,   // 앞을 볼 때 탐색 게이지 회복 속도 (search 대비 비율/초)
    forcedPenalty: 14,   // 탐색 시간을 다 쓰면 공룡이 좁히는 거리(m)
    lockoutMs: 1100,     // 강제 복귀 후 다시 돌아볼 수 없는 시간
  },
  finalStageId: 5,
};

// 스테이지가 올라갈수록: 거리가 길어지고, 공룡이 빨라지고,
// 엄폐물이 많아지고, 공룡이 덜 노출되고, 탐색 시간이 짧아진다.
//
// minRatio / maxRatio = 공룡 전체 실루엣 중 화면에 드러나는 면적의 비율.
// 장면을 만들 때 실제 픽셀을 세어 이 범위에 들어올 때까지 위치를 조정하므로,
// "절대 못 찾는 장면"이나 "너무 훤히 보이는 장면"이 나오지 않는다.
export const STAGES = [
  { id: 1, name: 'CANYON MOUTH', distance: 420, sunset: 72, dinoSpeed: 7.0,  gap: 135, covers: 5,  exposure: 0.72, search: 7.0, repel: 58, minRatio: 0.45, maxRatio: 0.95 },
  { id: 2, name: 'BROKEN RIDGE', distance: 520, sunset: 74, dinoSpeed: 8.5,  gap: 128, covers: 7,  exposure: 0.56, search: 6.4, repel: 54, minRatio: 0.30, maxRatio: 0.62 },
  { id: 3, name: 'ASH HOLLOW',   distance: 620, sunset: 76, dinoSpeed: 10.0, gap: 122, covers: 9,  exposure: 0.42, search: 5.8, repel: 50, minRatio: 0.18, maxRatio: 0.40 },
  { id: 4, name: 'DEAD GROVE',   distance: 730, sunset: 78, dinoSpeed: 11.5, gap: 116, covers: 11, exposure: 0.30, search: 5.2, repel: 46, minRatio: 0.10, maxRatio: 0.25 },
  { id: 5, name: 'LAST SHELTER', distance: 850, sunset: 80, dinoSpeed: 13.0, gap: 110, covers: 13, exposure: 0.20, search: 4.6, repel: 42, minRatio: 0.05, maxRatio: 0.15 },
];

export const ACHIEVEMENTS = [
  { id: 'FIRST_ESCAPE',    name: 'FIRST ESCAPE',    desc: '첫 스테이지를 클리어한다' },
  { id: 'PREDATOR_HUNTER', name: 'PREDATOR HUNTER', desc: '한 스테이지에서 공룡을 5회 이상 격퇴한다' },
  { id: 'RED_EYE',         name: 'RED EYE',         desc: '오발 없이 6회 연속 명중시킨다' },
  { id: 'SUNSET_SURVIVOR', name: 'SUNSET SURVIVOR', desc: '일몰 8% 이하를 남기고 대피소에 도착한다' },
  { id: 'DONT_LOOK_BACK',  name: "DON'T LOOK BACK", desc: '뒤돌아보기 3회 이하로 스테이지를 클리어한다' },
  { id: 'LAST_SHELTER',    name: 'LAST SHELTER',    desc: '최종 스테이지를 클리어한다' },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || STAGES[0];
