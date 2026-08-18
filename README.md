# Living Paper

**연구자의 "가짜 이해(Fake Ah-Moment)"를 해결하는 미팅 어시스턴트.**
회의 중 이해한 척 넘긴 순간을 버튼 하나로 표시해 두면, 회의가 끝난 뒤
**우리 랩의 문서와 규약을 근거로** 설명해 줍니다. AI 연산은 원내(on-prem)에서,
클라우드는 열 수 없는 암호문의 전달만 담당합니다.

**Live demo:** https://euichanlee0608-svg.github.io/living-paper/
— 계정·설치 없이 열립니다. 데모의 릴레이와 원내 노드는 브라우저 탭 안에서 시뮬레이션됩니다.

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

## 저장소 구조

```
index.html            랜딩 페이지
app.html              웹앱 셸
src/
  crypto/             WebCrypto 봉인 계층 — 의존성 0, 전 라인 감사 가능
    base.js           인코딩 · 정준 JSON(RFC 8785풍) · 유틸
    keys.js           P-256 기기 신원(ECDH+ECDSA), non-extractable 생성
    envelope.js       봉인 봉투: ECDH-ES+A256GCMKW · A256GCM · ECDSA 서명
    labkey.js         랩 마스터 키 · 멤버 초대 래핑 · 복구 코드(Crockford base32)
    fingerprint.js    지문 · 안전 번호(대면 검증용)
  data/               IndexedDB 래퍼 · 데모 랩 시드(용어집·SOP·실험노트)
  net/
    relay.js          릴레이 클라이언트 (MockRelay = 데모 / HttpRelay = 실서버)
    nodesim.js        브라우저 내 원내 노드 시뮬레이터 (암호화는 실제, LLM만 모의)
  ui/                 프레임워크 없는 뷰 계층 (태그드 템플릿 + 이벤트 위임)
relay/worker.js       Cloudflare Workers 릴레이 레퍼런스 (KV 큐)
node/server.py        원내 노드 레퍼런스 (Python · cryptography · Ollama)
tests/crypto.test.html  암호화 계층 테스트 22건 (브라우저에서 실행)
docs/                 아키텍처 · 위협 모델
```

## 로컬 실행

정적 파일뿐이므로 아무 정적 서버면 됩니다. WebCrypto 때문에 `localhost` 또는 HTTPS 필수.

```bash
python -m http.server 4173
# → http://localhost:4173/            랜딩
# → http://localhost:4173/app.html    앱
# → http://localhost:4173/tests/crypto.test.html   테스트 22건
```

## 데모 모드 vs 실배포

| | 데모 (기본) | 실배포 |
|---|---|---|
| 릴레이 | 탭 안 `MockRelay` (감사 로그 UI 노출) | `relay/worker.js` → Cloudflare Workers + KV |
| 원내 노드 | 탭 안 `NodeSimulator` — **암호화·서명·검증은 전부 실제**, 검색·생성만 모의 | `node/server.py` — Ollama 로컬 LLM + 암호화 KB |
| 프런트 | 동일 코드 | 동일 코드 (`보안 탭`에서 릴레이 URL 설정) |

시뮬레이터의 모든 응답에는 `simulated: true` 표식이 붙어 UI에 "데모 · 모의 응답"
칩으로 표시됩니다. 실제 모델 출력인 척하지 않습니다.

### 실배포 절차 (요약)

```bash
# 1. 릴레이
wrangler kv namespace create LP_KV
wrangler deploy relay/worker.js        # RELAY_TOKEN 환경변수로 정적 토큰 설정 가능

# 2. 원내 노드 (연구실 서버, 예: RTX 4090 워크스테이션)
pip install cryptography requests
ollama pull qwen2.5:14b-instruct-q4_K_M
LP_RELAY_URL=https://<worker>.workers.dev LP_RELAY_TOKEN=... python node/server.py

# 3. 프런트는 GitHub Pages 그대로 — 앱 내 설정에서 릴레이 URL만 지정
```

## 검증

- `tests/crypto.test.html` — 22개 테스트: 라운드트립, 다중 수신자, 비수신자 거부,
  변조(GCM 태그)·재라우팅(AAD)·수신자 삭제(서명)·발신자 위장 거부, IV/임시키 신선도,
  복구 코드 오탈자 정정, 지문 대칭성.
- 브라우저 자동화로 전체 플로우 검증 완료: 1클릭 → 요청 3건 봉인·전송 →
  노드 처리 → 응답 3건 복호화, 중복 0.

## 현재 한계 (MVP)

- 데모 노드의 검색·생성은 시드 데이터 룩업 + 템플릿입니다 (교체 지점은 `nodesim.js` 상단 주석).
- 릴레이는 메타데이터(누가·언제·몇 바이트)를 봅니다 — 숨기려면 다른 종류의 시스템이 필요합니다.
- 기기 분실 = 그 기기 키 손실. 복구는 랩 복구 코드로만 가능하며, 클라우드는 도울 수 없습니다(의도된 대가).
- 문서 수집(PDF→KB), 멤버 초대 UI, 후속 질문은 다음 단계입니다.
