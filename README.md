# Living Paper

**연구자의 "가짜 이해(Fake Ah-Moment)"를 해결하는 미팅 어시스턴트.**
회의 중 이해한 척 넘긴 순간을 버튼 하나로 표시해 두면, 회의가 끝난 뒤
**우리 랩의 문서와 규약을 근거로** 설명해 줍니다. AI 연산은 원내(on-prem)에서,
클라우드는 열 수 없는 암호문의 전달만 담당합니다.

**Live demo:** https://euichanlee0608-svg.github.io/living-paper/
— 계정·설치 없이 열립니다. 데모의 릴레이와 원내 노드는 브라우저 탭 안에서 시뮬레이션되며,
**앱(`app.html`)을 여는 순간부터 외부로 나가는 요청은 0건**입니다(자기 오리진의 정적 파일 제외).
랜딩 페이지에만 방문 집계 핑이 하나 있고, 앱 화면에는 붙이지 않았습니다 — 그 주장을
흐리지 않기 위해서입니다.

> 레포가 둘입니다. 개발·히스토리는 비공개 `Living_paper`, 배포는 공개 미러
> [`living-paper`](https://github.com/euichanlee0608-svg/living-paper)에서 서빙됩니다
> (무료 플랜은 비공개 레포 Pages를 지원하지 않음). 두 레포는 같은 내용을 유지하며,
> **양쪽 모두에 푸시해야 라이브가 바뀝니다.**

> 50회 심층 인터뷰에서 확인한 두 가지 요구가 설계를 결정했습니다:
> **95%가 온프레미스 보안**을, **88%가 도메인 특화 정확도**를 요구했고,
> 실시간 요약 선호는 30%에 그쳤습니다(회의 집중 방해). 그래서 이 제품은
> *사후(post-hoc)* 정리이고, *원내 처리*이며, *랩 맥락 기반*입니다.

## 흐름

```
회의 중          회의 후               전송                     원내
┌─────────┐    ┌────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ 놓쳤어요 │ →  │ 키워드 태깅 │ →  │ 기기에서 봉인     │ →  │ 복호화 · RAG ·   │
│ 버튼 1탭 │    │ (용어집 추천)│    │ E2E 암호문 릴레이 │    │ 로컬 LLM · 재봉인 │
└─────────┘    └────────────┘    └──────────────────┘    └─────────────────┘
```

## 아키텍처 한 줄 요약

**Zero-Knowledge Relay / Hybrid Edge-Local.** 평문과 복호화 키는 신뢰 경계
(기기·원내 노드) 안에만 존재합니다. 클라우드 릴레이는 인증·디렉터리·큐잉만
수행하며, 유출·압수되어도 라우팅 메타데이터 외에는 아무것도 나오지 않습니다.
자세한 내용: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
한계와 공격 시나리오: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)

앱의 **보안 탭**은 이 주장을 검증 가능하게 만듭니다: 릴레이가 저장한 실제
바이트를 열어, 방금 입력한 단어를 그 안에서 직접 검색해 볼 수 있습니다(0건이 정상).

## 화면

| 탭 | 하는 일 |
|---|---|
| **미팅** | 회의 중 유일한 화면. 큰 버튼 1탭으로 순간만 기록 — 녹음도 타이핑도 없음 |
| **정리** | 회의 후 키워드 태깅. 랩 용어집이 추천을 띄우고, 봉인·전송 파이프라인을 단계별로 표시 |
| **설명** | 한 줄 정의 → **우리 랩에서는** → 근거 문서 인용 → 후속 질문. 근거 없으면 “근거 없음”으로 답함 |
| **지식** | 랩 용어·문서 열람 + **문서 수집**(끌어다 놓기, 기기에서 파싱·청킹 후 봉인 전송) |
| **보안** | 기기 키 지문, 노드 대면 확인, 릴레이 감사 로그, 복구 키트, 전체 삭제 |
| **설정** | **데모 ↔ 실서버 전환**, **QR 멤버 초대**, 화면 테마 |

## 저장소 구조

```
index.html            랜딩 페이지
app.html              웹앱 셸
src/
  crypto/             WebCrypto 봉인 계층 — 의존성 0, 전 라인 감사 가능
    base.js           인코딩 · 정준 JSON(RFC 8785풍) · 유틸
    keys.js           P-256 기기 신원(ECDH+ECDSA), non-extractable 생성
    envelope.js       봉인 봉투: ECDH-ES+A256GCMKW · A256GCM(헤더 AAD) · ECDSA 서명
    labkey.js         랩 마스터 키 · 멤버 초대 래핑 · 복구 코드(Crockford base32)
    fingerprint.js    지문 · 안전 번호(대면 검증용)
  data/
    db.js             IndexedDB 래퍼
    seed.js           데모 랩 시드(용어집·SOP·실험노트)
    ingest.js         파일 → 텍스트 → 청크 (PDF는 DecompressionStream으로 자체 추출)
  net/
    relay.js          릴레이 클라이언트 (MockRelay = 데모 / HttpRelay = 실서버)
    nodesim.js        브라우저 내 원내 노드 시뮬레이터 (암호화는 실제, LLM만 모의)
  ui/
    components/qr.js  QR 인코더 (외부 의존성 0, 레퍼런스 대조 검증됨)
    views/            미팅·정리·설명·지식·보안·설정
assets/
  css/                화면 토큰 · 앱 스타일
  beacon.js           랜딩 페이지 방문 알림 (앱 화면에는 붙이지 않음)
relay/worker.js       Cloudflare Workers 릴레이 레퍼런스 (KV 큐)
wrangler.toml         릴레이 배포·로컬 실행 설정
node/server.py        원내 노드 레퍼런스 (Python · cryptography · Ollama)
tests/
  crypto.test.html    암호화 계층 테스트 22건
  qr.verify.html      QR 인코더 대조 검증 45건
  gen-qr-reference.py 레퍼런스 매트릭스 생성 (Python `qrcode`)
docs/                 아키텍처 · 위협 모델
```

## 디자인

[Linear의 디자인 시스템](https://styles.refero.design/)("midnight precision instrument")을
차용했습니다 — 그림자 대신 헤어라인 보더, 6/12px 정밀 라운딩, 8–12px 조밀한 패딩,
크기에 따라 조여지는 letter-spacing, 700 이상 굵기 금지, **강조색은 화면당 하나의
주요 동작에만**. 한 가지만 바꿨습니다: Linear의 acid lime 대신 이 제품의 sky(#38BDF8)를
씁니다 — 만듦새는 빌리되 정체성은 피치덱의 것을 유지합니다.

**웹폰트를 쓰지 않습니다.** 이 제품은 폐쇄망 병원에 설치되므로, CDN 폰트는
깨진 설치이자 나쁜 첫인상입니다. 시스템 폰트 스택을 Linear의 메트릭에 맞춰 조정했습니다.

기본은 **어두운 화면**입니다(미팅은 대개 조명을 낮춘 방에서 열립니다). 밝은 화면도
같은 규칙으로 만들어 두었고 설정에서 전환합니다.

## 로컬 실행

정적 파일뿐이므로 아무 정적 서버면 됩니다. WebCrypto 때문에 `localhost` 또는 HTTPS 필수.

```bash
python -m http.server 4173
# → http://localhost:4173/                        랜딩
# → http://localhost:4173/app.html                앱
# → http://localhost:4173/tests/crypto.test.html  암호화 테스트 22건
# → http://localhost:4173/tests/qr.verify.html    QR 대조 검증 45건
```

### 전체 스택을 한 대에서 돌리기 (실제 노드로 확인할 때)

시뮬레이터가 아니라 진짜 릴레이·진짜 로컬 모델로 왕복시켜 보는 방법입니다.
세 개를 각각 띄운 뒤, 앱 **설정 탭**에 릴레이 주소를 넣고 전환하면 됩니다.

```bash
npx wrangler dev                       # 1. 릴레이 → http://127.0.0.1:8787 (로컬 KV, 계정 불필요)

python3 -m venv .venv && .venv/bin/pip install cryptography requests
ollama pull exaone3.5:7.8b             # 2. 원내 노드 (어떤 로컬 모델이든 됨)
LP_RELAY_URL=http://127.0.0.1:8787 LP_MODEL=exaone3.5:7.8b .venv/bin/python node/server.py

python3 -m http.server 4173            # 3. 프런트 → http://localhost:4173/app.html
```

⚠️ **앱은 반드시 로컬에서 연 페이지여야 합니다.** 공개 https 페이지(GitHub Pages)에서
`http://127.0.0.1`의 릴레이를 부르는 것은 브라우저가 막습니다. 실배포에서는 릴레이가
공개 https(Workers)에 있으므로 이 제약이 사라집니다.

## 데모 모드 vs 실배포

| | 데모 (기본) | 실배포 |
|---|---|---|
| 릴레이 | 탭 안 `MockRelay` (감사 로그 UI 노출) | `relay/worker.js` → Cloudflare Workers + KV |
| 원내 노드 | 탭 안 `NodeSimulator` — **암호화·서명·검증은 전부 실제**, 검색·생성만 모의 | `node/server.py` — Ollama 로컬 LLM + 암호화 KB |
| 전환 | — | 앱 **설정 탭**에서 릴레이 주소 입력 → 연결 확인 → 전환 |

시뮬레이터의 모든 응답에는 `simulated: true` 표식이 붙어 UI에 "데모 · 모의 응답"
칩으로 표시됩니다. 실제 모델 출력인 척하지 않습니다.

### 실배포 절차

```bash
# 1. 릴레이 (설정은 wrangler.toml)
npx wrangler kv namespace create LP_KV   # 출력된 id를 wrangler.toml에 붙여넣기
npx wrangler secret put RELAY_TOKEN      # 선택 — 접근 토큰
npx wrangler deploy

# 2. 원내 노드 (연구실 서버)
pip install cryptography requests
ollama pull qwen2.5:14b-instruct-q4_K_M
LP_RELAY_URL=https://<worker>.workers.dev LP_RELAY_TOKEN=... python node/server.py

# 3. 프런트는 GitHub Pages 그대로 — 앱 설정 탭에서 릴레이 주소만 지정
```

## 검증

- **암호화 22건** (`tests/crypto.test.html`): 라운드트립, 다중 수신자, 비수신자 거부,
  변조(GCM 태그)·재라우팅(AAD)·수신자 삭제(서명)·발신자 위장 거부, IV/임시키 신선도,
  복구 코드 오탈자 정정, 지문 대칭성.
- **QR 45건** (`tests/qr.verify.html`): Python `qrcode` 라이브러리와 5개 케이스 ×
  8개 마스크를 **모듈 단위로 전량 대조**. 앱이 실제로 만든 초대 QR(v10, 57×57)이
  OpenCV 디코더로 정상 판독되는 것까지 확인.
- 브라우저 자동화로 전체 플로우 검증: 문서 수집 → 색인 → 그 문서를 근거로 한 답변,
  초대 QR → 랩 키 래핑 전달, 6개 화면 렌더링, 다크/라이트, 데스크톱/모바일.
- **실제 스택 왕복 1건**(시뮬레이터 아님): 맥미니에서 `wrangler dev` 릴레이 +
  `node/server.py`(Ollama `exaone3.5:7.8b`)를 띄우고, 브라우저 → 릴레이 → 노드로
  문서를 색인한 뒤 그 문서를 근거로 답을 받았습니다. 생성 11.5초, `simulated: false`,
  인용 1건, **릴레이가 저장한 바이트에서 평문 검색 0건**.

## 현재 한계 (MVP)

- **공개 데모의** 생성은 템플릿입니다. 수집한 문서에 대해서는 실제로 검색해 발췌를 인용하지만,
  문장을 새로 쓰지는 않습니다 — 계정도 GPU도 없이 열려야 하는 페이지이기 때문입니다.
  실서버 모드로 전환하면 `node/server.py`의 로컬 모델이 실제로 답을 씁니다(위 검증 참고).
- 원내 노드의 검색은 토큰 겹침 스코어입니다(`kb_search()`). 임베딩 검색으로 바꿔도
  와이어 포맷·암호 계층은 그대로입니다.
- 랩 키는 아직 설치 시 노드에 파일로 넣습니다(`node-state/lab.key`). 노드는 자기 키로
  KB를 암호화해 자급하지만, 멤버 초대와 같은 봉투 기반 프로비저닝이 다음 단계입니다.
- PDF 텍스트 추출은 디지털 생성 PDF만 지원합니다. 스캔본·특수 폰트 인코딩은
  **조용히 깨진 텍스트를 넣지 않고 명시적으로 실패**합니다.
- 릴레이는 메타데이터(누가·언제·몇 바이트)를 봅니다 — 숨기려면 다른 종류의 시스템이 필요합니다.
- QR 인코더는 바이트 모드 · ECC M · 버전 1–20만 지원합니다(초대 코드에 충분).
- 기기 분실 = 그 기기 키 손실. 복구는 랩 복구 코드로만 가능하며 클라우드는 도울 수 없습니다(의도된 대가).
