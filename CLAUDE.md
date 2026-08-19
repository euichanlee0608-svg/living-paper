# Living Paper — 작업 지침

전역 `~/.claude/CLAUDE.md`에 더해 이 레포에만 적용되는 규칙.

## 레포가 둘이다 — 양쪽에 푸시해야 라이브가 바뀐다

| | 레포 | 역할 |
|---|---|---|
| `origin` | `euichanlee0608-svg/Living_paper` (private) | 개발·히스토리 |
| `mirror` | `euichanlee0608-svg/living-paper` (public) | GitHub Pages 배포 (무료 플랜은 private Pages 미지원) |

히스토리가 갈라져 있어 미러엔 fast-forward가 안 된다. **force 쓰지 말 것** — 공개 히스토리를 날리고
옛 프로토타입 커밋까지 공개된다. 내용만 얹는다:

```bash
git push origin main
git checkout -B mirror-sync mirror/main && git checkout main -- . \
  && git commit && git push mirror mirror-sync:main && git checkout main && git branch -D mirror-sync
```

## 검증 게이트 (푸시 전 전부)

```bash
python3 -m http.server 4173
# 브라우저에서:
#   /tests/crypto.test.html   → 22 passed, 0 failed   (window.__TESTS__)
#   /tests/qr.verify.html     → 45 matched, 0 differed (window.__QRTEST__)
```
+ 앱 화면 데스크톱·모바일(390px) 렌더와 가로 스크롤 0 확인. 푸시 후 Pages 반영 확인.

암호 계층을 건드렸으면 **파이썬 노드와의 상호운용까지** 확인한다 — 정준 JSON이 AES-GCM의 AAD라
`src/crypto/base.js`의 `canonicalJSON()`과 `node/server.py`의 `canonical()`이 한 바이트라도
어긋나면 복호화가 실패한다. 둘은 항상 같이 고친다.

## 실제 노드로 왕복시키기

```bash
npx wrangler dev                       # 릴레이 127.0.0.1:8787 (로컬 KV, CF 계정 불필요)
LP_RELAY_URL=http://127.0.0.1:8787 LP_MODEL=exaone3.5:7.8b .venv/bin/python node/server.py
python3 -m http.server 4173            # 앱 설정 탭 → 릴레이 주소 입력 → 전환
```
venv는 `~/living_paper/.venv`(cryptography·requests, 규칙 #10.5).
⚠️ 앱은 **로컬에서 연 페이지**여야 한다. 공개 https 페이지에서 `http://127.0.0.1`을 부르는 건 크롬이 막는다.

## 이 제품에서 깨면 안 되는 것

- **앱(`app.html`)은 외부로 요청을 보내지 않는다.** 방문 비콘·폰트·CDN·분석 스크립트 전부 금지.
  집계가 필요하면 랜딩(`index.html`)에만 붙인다. 이 성질이 곧 제품의 주장이다.
- **모의 응답은 모의라고 말한다.** 시뮬레이터 응답의 `simulated: true`와 UI 칩을 없애지 말 것.
- **발견된 노드는 항상 `verified: false`로 시작한다.** 릴레이가 알려준 역할은 힌트일 뿐,
  신원을 묶는 건 보안 탭의 안전 번호 대면 확인이다. 이걸 건너뛰면 키 바꿔치기를 막을 수단이 없다.
- **근거 없으면 "근거 없음"이라고 답한다.** 노드 프롬프트(`node/server.py`)의 이 규칙을 완화하지 말 것.
- 의존성 0(WebCrypto·자체 QR 인코더). npm 패키지를 프런트에 들이지 않는다 — 폐쇄망 설치가 전제다.
