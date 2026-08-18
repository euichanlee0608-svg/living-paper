/* Demo lab corpus.
 *
 * The product's whole claim is that a lab-specific knowledge base beats a
 * general model, so the demo has to show a *specific* lab. This is a
 * plausible hospital-collaborating microfluidics lab — the exact segment
 * the interviews pointed at.
 *
 * In a real deployment this content lives encrypted on the on-prem node
 * and never appears in the front-end bundle. It is inlined here only so
 * the public demo can run with no infrastructure.
 */

export const DEMO_LAB = {
  labId: 'lab_kumc_mfx',
  name: '의생명 미세유체 연구실',
  org: '고려대학교 · 협력병원 IRB 과제',
  members: 7,
};

export const DEMO_MEETING = {
  id: 'mtg_demo_0412',
  title: '4월 정기 랩미팅 — Organ-on-a-Chip 3차 배치',
  attendees: ['PI 서교수', '박사과정 김', '석사과정 이', '병원 협력 임상의 정'],
  durationMin: 52,
  agenda: [
    '3차 배치 채널 막힘 원인 리뷰',
    'HUVEC 파종 밀도 재조정',
    'IRB 개정안에 따른 검체 반출 절차',
    '다음 배치 일정',
  ],
};

/** Glossary — the lab's own vocabulary, which is the part a general model
 *  cannot know. `lab` is what makes each entry lab-specific. */
export const GLOSSARY = [
  {
    id: 'kb_pdms',
    term: 'PDMS 사전경화',
    aliases: ['PDMS', '사전경화', 'pre-cure', '피디엠에스'],
    general: 'PDMS(폴리디메틸실록산)를 베이스와 경화제를 섞은 뒤 완전히 굳히기 전 단계까지만 열을 가하는 공정. 이후 층을 올려 접합할 때 계면이 섞이며 결합력이 올라갑니다.',
    lab: '우리 랩은 65 °C 20분을 사전경화 기준으로 씁니다. 80 °C로 올리면 접합은 빨라지지만 3차 배치에서 채널 벽이 말려 들어가 막힘이 재현됐기 때문에, 2024-11 랩 규약 개정 이후 65 °C로 고정했습니다.',
    docs: ['doc_sop_bonding', 'doc_batch3'],
    tags: ['공정', '소프트리소그래피'],
  },
  {
    id: 'kb_huvec',
    term: 'HUVEC 파종 밀도',
    aliases: ['HUVEC', '파종', 'seeding density', '휴벡'],
    general: '인간 제대정맥 내피세포를 배양 표면에 심는 단위 면적당 세포 수. 너무 낮으면 단층이 안 만들어지고, 너무 높으면 중심부가 괴사합니다.',
    lab: '우리 칩 기준 2.0×10⁵ cells/cm²가 표준입니다. 임상의 정 선생님 검체는 계대수(passage)가 높게 들어와서 같은 밀도로도 컨플루언시가 안 나오는 경우가 있어, P6 이상이면 1.3배 증량하는 예외를 둡니다.',
    docs: ['doc_sop_seeding'],
    tags: ['세포', '프로토콜'],
  },
  {
    id: 'kb_passage',
    term: '계대수 (Passage)',
    aliases: ['passage', 'P6', '계대', '패시지'],
    general: '세포를 옮겨 심은 횟수. 숫자가 올라갈수록 증식력과 표현형이 원래 세포에서 멀어집니다.',
    lab: '병원에서 넘어오는 1차 세포는 P4~P7이 섞여 옵니다. 우리는 P8부터는 데이터에서 제외하고, P6 이상은 파종 밀도를 올려 보정합니다. 반출 기록지에 계대수가 비어 있으면 IRB 절차상 되돌려 보내야 합니다.',
    docs: ['doc_sop_seeding', 'doc_irb'],
    tags: ['세포', 'IRB'],
  },
  {
    id: 'kb_irb',
    term: 'IRB 개정안 검체 반출',
    aliases: ['IRB', '검체 반출', '반출 절차', '아이알비'],
    general: '기관생명윤리위원회 승인 범위 안에서만 인체 유래물을 기관 밖으로 옮길 수 있도록 하는 절차.',
    lab: '2026-03 개정으로 검체 반출 시 비식별화 코드가 이중(병원 코드 + 랩 내부 코드)으로 필요해졌습니다. 실무상 달라진 점은 하나입니다 — 반출 당일에 랩 코드를 발급받아야 하고, 소급 발급이 막혔습니다. 배치 일정이 검체 도착일에 묶이는 이유가 이것입니다.',
    docs: ['doc_irb'],
    tags: ['규정', 'IRB'],
  },
  {
    id: 'kb_clog',
    term: '채널 막힘 (Clogging)',
    aliases: ['막힘', 'clogging', '채널막힘', '클로깅'],
    general: '미세유체 채널이 기포, 세포 응집체, 또는 구조 변형으로 막히는 현상.',
    lab: '3차 배치 막힘은 세포 응집이 아니라 접합 공정 문제였습니다. 80 °C 사전경화에서 채널 상단 모서리가 처져 단면적이 줄었고, 이게 하류에서 응집을 유발했습니다. 원인과 증상이 다른 지점에서 나타난 사례라 랩 규약에 별도로 기록해 뒀습니다.',
    docs: ['doc_batch3', 'doc_sop_bonding'],
    tags: ['트러블슈팅', '공정'],
  },
  {
    id: 'kb_confluency',
    term: '컨플루언시 (Confluency)',
    aliases: ['confluency', '컨플루언시', '단층', '컨플'],
    general: '배양 표면이 세포로 덮인 비율. 100%면 빈틈 없는 단층입니다.',
    lab: '우리는 관류 시작 판정 기준으로 90%를 씁니다. 눈대중 대신 4구역 이미지 평균을 쓰기로 한 것이 2차 배치 이후 바뀐 부분입니다.',
    docs: ['doc_sop_seeding'],
    tags: ['세포', '판정기준'],
  },
  {
    id: 'kb_perfusion',
    term: '관류 (Perfusion)',
    aliases: ['perfusion', '관류', '유동'],
    general: '칩 채널에 배지를 지속적으로 흘려 생체 내 혈류와 비슷한 전단응력을 주는 것.',
    lab: '시린지 펌프 기준 0.5 dyne/cm²에서 시작해 24시간에 걸쳐 1.2까지 올립니다. 급하게 올리면 내피세포가 떨어져 나가서, 3차 배치부터 램프업을 자동화했습니다.',
    docs: ['doc_sop_seeding', 'doc_batch3'],
    tags: ['공정', '장비'],
  },
  {
    id: 'kb_softlitho',
    term: '소프트리소그래피',
    aliases: ['soft lithography', '소프트 리소', 'SU-8', '몰드'],
    general: 'SU-8 등으로 만든 마스터 몰드에 탄성 고분자를 부어 미세 구조를 복제하는 방식.',
    lab: 'SU-8 마스터는 공용 클린룸에서 3개월 주기로 재제작합니다. 마스터 수명이 다 되면 채널 높이가 5 µm 정도 낮아지는데, 배치 간 편차의 상당 부분이 여기서 옵니다.',
    docs: ['doc_sop_bonding'],
    tags: ['공정', '장비'],
  },
];

export const DOCS = [
  {
    id: 'doc_sop_bonding',
    title: 'SOP-02 칩 접합 공정 (rev.4)',
    kind: 'SOP',
    updated: '2026-01-18',
    excerpt: '사전경화는 65 °C / 20분을 표준으로 한다. 80 °C 조건은 2024-11 개정으로 폐기되었으며, 채널 단면 변형이 확인된 조건이므로 사용하지 않는다.',
  },
  {
    id: 'doc_sop_seeding',
    title: 'SOP-05 세포 파종 및 관류 개시',
    kind: 'SOP',
    updated: '2026-02-02',
    excerpt: '표준 파종 밀도 2.0×10⁵ cells/cm². P6 이상 검체는 1.3배 증량. 관류는 4구역 이미지 평균 컨플루언시 90% 이상에서 개시한다.',
  },
  {
    id: 'doc_batch3',
    title: '3차 배치 트러블슈팅 노트',
    kind: '실험노트',
    updated: '2026-04-09',
    excerpt: '막힘 8/12 칩. 응집 형태가 하류 편중. 상류 단면 SEM에서 상단 모서리 처짐 확인 → 접합 온도 원인으로 결론.',
  },
  {
    id: 'doc_irb',
    title: 'IRB 개정안 대응 실무 메모 (2026-03)',
    kind: '규정',
    updated: '2026-03-21',
    excerpt: '검체 반출 시 병원 코드와 랩 내부 코드 이중 비식별화 필요. 랩 코드는 반출 당일 발급, 소급 발급 불가.',
  },
];

/** Moments a first-time visitor lands on, so the demo has something to
 *  show before they have captured anything themselves. */
export const DEMO_MOMENTS = [
  { atSec: 412, note: '왜 65도인지 이유를 놓침', keyword: 'PDMS 사전경화' },
  { atSec: 1685, note: 'P6 얘기 나올 때 무슨 뜻인지 몰랐음', keyword: '계대수' },
  { atSec: 2530, note: '반출 절차가 왜 바뀌었다는 거지?', keyword: 'IRB 검체 반출' },
];

export function findGlossary(keyword) {
  const q = (keyword || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const g of GLOSSARY) {
    const candidates = [g.term, ...g.aliases];
    for (const c of candidates) {
      const t = c.toLowerCase().replace(/\s+/g, '');
      let score = 0;
      if (t === q) score = 1;
      else if (t.includes(q) || q.includes(t)) score = 0.72;
      if (score > bestScore) { bestScore = score; best = g; }
    }
  }
  return best ? { entry: best, score: bestScore } : null;
}

export const docById = (id) => DOCS.find((d) => d.id === id);
