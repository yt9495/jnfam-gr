# JNFAM GR — Goods Receiving

`JNFAM PO_Receiving_Checksheet.xlsx` 를 그대로 웹앱으로 옮긴 **PO 대조 입고 검수 시스템**입니다.
PO PDF(`JAPO-260515.pdf` 형식)를 올리면 PO 정보가 자동으로 입력되고, 창고에서 휴대폰으로 입고 검수를
하면 품목·단위·수량 불일치가 즉시 표시됩니다. 언제든 원본과 동일한 형식의 엑셀로 내려받을 수 있습니다.

**앱 주소 → https://yt9495.github.io/jnfam-gr/**

`jnfam-ledger`, `HWQ-Demand` 와 동일한 구조입니다: GitHub Pages 가 화면을 서비스하고,
Firebase 가 데이터(Firestore)와 로그인(Google)을 담당합니다. 빌드 도구가 전혀 필요 없습니다.

---

## 1. 팀원과 공유하는 방법

1. 위 앱 주소를 알려줍니다.
2. 각자 **Google 계정으로 로그인** 하면 바로 사용할 수 있습니다. 따로 계정을 만들어 줄 필요가 없습니다.
3. 모두 같은 데이터를 실시간으로 봅니다. 한 사람이 입고를 저장하면 다른 사람 화면에 즉시 반영됩니다.

### 접근 범위를 좁히고 싶을 때

기본값은 **Google 계정으로 로그인한 사람은 누구나** 사용할 수 있는 상태입니다.
회사 계정만 허용하려면 `firebase-config.js` 한 줄만 고치면 됩니다.

```js
export const APP = {
  allowedDomains: ['jnfam.net']   // 이 도메인 메일만 로그인 허용
};
```

여기에 더해 서버 쪽에서도 막으려면 `firestore.rules` 의 `signedIn()` 을 `isMember()` 로 바꾸고
(파일 안에 예시가 주석으로 들어 있습니다) Firebase 콘솔 → Firestore → 규칙에 붙여넣고 게시하면 됩니다.

---

## 2. 무엇을 할 수 있나

| 화면 | 하는 일 |
|---|---|
| **대시보드** | Total / Not Received / Partial / Closed / Over Received / Issue / Photo Missing 집계, 미결 PO 라인 목록, 확인 필요 항목 |
| **PO 등록** | PO PDF를 끌어다 놓으면 PO No., 날짜, 공급사, 품목, 수량, 단가를 자동 인식 → 확인·수정 후 저장 |
| **입고 검수** | PO 라인을 고르고 실입고 수량·라벨 정보를 입력. 저장 전에 Item / Unit / Qty / Overall 판정이 실시간 표시 |
| **입고 이력** | 전체 입고 기록, 누적·잔량, 판정 결과 조회 및 삭제 |
| **내보내기** | 원본과 동일한 5개 시트(Dashboard / PO_Master / Receiving_Check / Photo_Log / Lists) xlsx 다운로드, JSON 백업 |

### 엑셀 수식과의 대응

| 엑셀 | 웹앱 (`gr-logic.js`) |
|---|---|
| `PO_Master!N` `SUMIFS(...)` | `computeLines()` → `totalReceived` |
| `PO_Master!O` 잔량 | `remaining` |
| `PO_Master!P` 라인 상태 | `status` (Not Received / Partial / Closed / Over Received) |
| `Receiving_Check!Q~T` | `judge()` → `itemCheck` / `unitCheck` / `qtyStatus` / `overall` |
| `Receiving_Check!Y` | `photoStatus` |

> 엑셀의 `Total Received for PO Line` 은 전체 합계라 같은 라인의 모든 행이 같은 값을 갖지만,
> 웹앱은 **입고일 순 누적값**을 씁니다. 마지막 입고 행에서는 두 값이 같고, 중간 행은 웹앱 쪽이 더 정확합니다.

---

## 3. 설치 구성 (이미 완료된 상태)

### GitHub Pages
- 저장소: `yt9495/jnfam-gr` (Public)
- Settings → Pages → Source: `main` 브랜치 `/ (root)`
- `main` 에 커밋하면 1~2분 뒤 자동으로 반영됩니다.

### Firebase (프로젝트 `jnfam-gr`)
- **Authentication** → Sign-in method → Google 사용 설정
- **Authentication** → Settings → 승인된 도메인에 **`yt9495.github.io`** 추가
  (이걸 빼먹으면 로그인 팝업이 그냥 닫힙니다)
- **Firestore Database** 생성 후 `firestore.rules` 내용을 규칙에 붙여넣고 게시
- 프로젝트 설정 → 내 앱 → 웹 앱의 설정값을 `firebase-config.js` 에 기록

> `firebase-config.js` 의 값은 공개되어도 되는 값입니다. 실제 보안은 `firestore.rules` 가 담당합니다.

---

## 4. 수정하고 다시 배포하기

파일을 고쳐 `main` 브랜치에 커밋하면 끝입니다. GitHub Pages 가 자동으로 다시 배포합니다.
GitHub 웹에서 파일을 직접 편집해도 되고, 로컬에서 고친 뒤 업로드해도 됩니다.

로컬에서 확인하려면 (ES 모듈이라 파일 더블클릭으로는 안 열립니다):

```bash
npm run dev            # http://localhost:5173
```

---

## 5. 테스트

```bash
npm install            # pdfjs-dist, jsdom, xlsx (테스트 전용)
npm test
```

- `test/logic.test.mjs` — 엑셀 수식과 동일한 판정이 나오는지 20개 케이스 검증
- `test/parser.test.mjs` — `samples/JAPO-260515.pdf` 를 실제로 파싱해 16개 항목 검증
  (다른 PDF로 확인하려면 `node test/parser.test.mjs 경로/파일.pdf`)
- `test/ui.test.mjs` — jsdom으로 실제 화면을 렌더링해 대시보드 집계·입고 폼 판정·
  엑셀 5개 시트 출력까지 34개 항목 검증 (Firebase는 `test/fb-stub.js` 로 대체)

세 가지 모두 통과하는 상태입니다. PO 양식이 바뀌거나 판정 규칙을 손볼 때
먼저 테스트를 돌려 보면 회귀를 바로 잡을 수 있습니다.

---

## 6. PDF 자동 인식은 어떻게 동작하나

`po-parser.js` 가 pdf.js로 **텍스트의 좌표**를 읽어 표를 복원합니다. 서버로 파일을 보내지 않습니다.

1. 같은 y좌표의 조각을 한 줄로 묶습니다.
2. `11. Product Name … 15. Amount` 머리글 줄을 찾아 각 칼럼의 x 경계를 계산합니다.
3. 그 아래 줄들을 경계로 잘라 품명 / 수량 / 단가 / 금액을 뽑고, `TAX` 줄에서 멈춥니다.
4. `7. NO & Date of Invoice` 아래 오른쪽 칸에서 PO 번호와 날짜를, 좌측에서 공급사·수하인을 읽습니다.

**`Cups Total 160` 처리**: 이 PDF는 Quantity 칸에 `1`, 설명 칸에 `Total 160` 이 들어 있습니다.
앱은 Quantity 값을 기본으로 넣고, 설명에서 찾은 `160` 을 **`→ 160` 버튼**으로 제안합니다.
실제 주문 수량이 160이면 버튼 한 번으로 바꿀 수 있습니다.

레이아웃이 다른 PDF는 자동 인식이 실패할 수 있는데, 이때도 **입력 폼은 그대로 열리므로**
수기로 채워 저장하면 됩니다. 인식 결과는 저장 전에 항상 사람이 확인하는 구조입니다.

---

## 7. 데이터 구조 (Firestore)

```
pos/{PO번호}
  poNo, poDate, supplier, project, buyer, discharge, quote, payTerm,
  docLink, remarks, updatedAt, updatedBy
  lines: [{ line, itemCode, itemDesc, unit, orderedQty, unitPrice }]

receipts/{자동ID}
  receiptDate, receivingNo, receiver, receiverEmail, carrier,
  poNo, poLine, rcvItemCode, rcvItemDesc, rcvUnit, receivedQty,
  lot, bol, remarks, action, createdAt, createdAtISO
  photos: [{ type, fileName, link, status, notes }]
```

판정값(Item Check, Overall Status 등)은 **저장하지 않고 매번 계산**합니다.
PO를 수정하면 과거 입고의 판정도 자동으로 다시 계산되므로 데이터가 어긋나지 않습니다.
누가 저장했는지는 `receiverEmail` / `updatedBy` 에 로그인 계정이 남습니다.

---

## 8. 사진에 대해

무료 Spark 플랜에서는 Cloud Storage를 쓸 수 없어, 엑셀과 동일하게
**SharePoint / Google Drive에 올린 뒤 공유 링크를 붙여넣는 방식**입니다.
링크와 파일명이 모두 있어야 `Photo OK` 가 되고, 하나라도 비면 `Photo Missing` 으로 대시보드에 잡힙니다.

---

## 9. 파일 구성

```
jnfam-gr/
├── index.html           화면 구조          ← GitHub Pages 가 이 파일을 서비스
├── styles.css           스타일 (모바일 대응 포함)
├── app.js               화면 동작 · Firebase 연동 · 엑셀 내보내기
├── gr-logic.js          입고 판정 로직 (엑셀 수식 대응) — 테스트 대상
├── po-parser.js         PO PDF 파서 — 테스트 대상
├── firebase-config.js   Firebase 설정값 · 로그인 허용 도메인
├── firestore.rules      Firestore 보안 규칙
├── firebase.json        Firebase Hosting 으로 옮길 경우를 위한 설정 (지금은 미사용)
├── test/                Node 테스트
├── samples/             샘플 PO PDF · 원본 체크시트
└── package.json         개발·테스트용 스크립트
```

## 10. 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| "Firebase 설정 필요" 화면이 뜸 | `firebase-config.js` 에 실제 값이 없음 |
| 로그인 팝업이 바로 닫힘 | Firebase → Authentication → Settings → 승인된 도메인에 `yt9495.github.io` 가 없음 |
| `Missing or insufficient permissions` | Firestore 규칙을 게시하지 않았음 |
| 화면이 비어 있고 콘솔에 CORS 오류 | `file://` 로 열었음. `npm run dev` 로 로컬 서버를 띄우세요 |
| 수정했는데 앱에 반영이 안 됨 | GitHub Pages 배포에 1~2분 걸립니다. 이후 강력 새로고침(Ctrl+Shift+R) |
| PDF에서 라인이 안 잡힘 | 레이아웃이 다른 양식. 폼에서 직접 입력하거나 `node test/parser.test.mjs 파일.pdf` 로 확인 |
