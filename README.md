# JNFAM GR — Goods Receiving

`JNFAM PO_Receiving_Checksheet.xlsx` 를 그대로 웹앱으로 옮긴 **PO 대조 입고 검수 시스템**입니다.
PO PDF(`JAPO-260515.pdf` 형식)를 올리면 PO 정보가 자동으로 입력되고, 창고에서 휴대폰으로 입고 검수를
하면 품목·단위·수량 불일치가 즉시 표시됩니다. 언제든 원본과 동일한 형식의 엑셀로 내려받을 수 있습니다.

**GitHub + Firebase(무료 Spark 플랜) 조합이며 빌드 도구가 전혀 필요 없습니다.**
npm, webpack, React 없이 순수 HTML/CSS/JS 파일만 Firebase Hosting에 올라갑니다.

---

## 1. 무엇을 할 수 있나

| 화면 | 하는 일 |
|---|---|
| **대시보드** | Total / Not Received / Partial / Closed / Over Received / Issue / Photo Missing 집계, 미결 PO 라인 목록, 확인 필요 항목 |
| **PO 등록** | PO PDF를 끌어다 놓으면 PO No., 날짜, 공급사, 품목, 수량, 단가를 자동 인식 → 확인·수정 후 저장 |
| **입고 검수** | PO 라인을 고르고 실입고 수량·라벨 정보를 입력. 저장 전에 Item / Unit / Qty / Overall 판정이 실시간 표시 |
| **입고 이력** | 전체 입고 기록, 누적·잔량, 판정 결과 조회 및 삭제 |
| **내보내기** | 원본과 동일한 5개 시트(Dashboard / PO_Master / Receiving_Check / Photo_Log / Lists) xlsx 다운로드, JSON 백업 |

### 엑셀 수식과의 대응

| 엑셀 | 웹앱 (`public/gr-logic.js`) |
|---|---|
| `PO_Master!N` `SUMIFS(...)` | `computeLines()` → `totalReceived` |
| `PO_Master!O` 잔량 | `remaining` |
| `PO_Master!P` 라인 상태 | `status` (Not Received / Partial / Closed / Over Received) |
| `Receiving_Check!Q~T` | `judge()` → `itemCheck` / `unitCheck` / `qtyStatus` / `overall` |
| `Receiving_Check!Y` | `photoStatus` |

> 엑셀의 `Total Received for PO Line` 은 전체 합계라 같은 라인의 모든 행이 같은 값을 갖지만,
> 웹앱은 **입고일 순 누적값**을 씁니다. 마지막 입고 행에서는 두 값이 같고, 중간 행은 웹앱 쪽이 더 정확합니다.

---

## 2. Firebase 프로젝트 만들기 (약 10분)

1. <https://console.firebase.google.com> → **프로젝트 추가** → 이름 `jnfam-gr` (Google 애널리틱스는 꺼도 됨)
2. 왼쪽 **빌드 → Authentication** → **시작하기** → **Sign-in method** 탭 → **Google** 사용 설정 → 저장
3. 왼쪽 **빌드 → Firestore Database** → **데이터베이스 만들기** → **프로덕션 모드** →
   위치는 `nam5 (us-central)` 권장 → 사용 설정
4. 왼쪽 위 **⚙️ 프로젝트 설정** → 아래 **내 앱** → **웹 아이콘 `</>`** 클릭 →
   앱 닉네임 `jnfam-gr-web` 등록 → 나오는 `firebaseConfig` 값을 복사
5. 복사한 값을 **`public/firebase-config.js`** 에 붙여넣기

```js
export const firebaseConfig = {
  apiKey:            "AIza…",
  authDomain:        "jnfam-gr.firebaseapp.com",
  projectId:         "jnfam-gr",
  storageBucket:     "jnfam-gr.appspot.com",
  messagingSenderId: "1234567890",
  appId:             "1:1234567890:web:abcdef"
};

export const APP = {
  allowedDomains: ['jnfam.net']   // 회사 계정만 허용하려면. 비워두면 전체 허용
};
```

> 이 값들은 공개되어도 되는 값입니다. 실제 보안은 `firestore.rules` 가 담당합니다.

---

## 3. GitHub 저장소 만들기

```bash
cd jnfam-gr
git init
git add .
git commit -m "JNFAM GR: 최초 커밋"
git branch -M main
```

GitHub에서 새 저장소(`jnfam-gr`, **Private 권장**)를 만든 뒤:

```bash
git remote add origin https://github.com/<사용자명>/jnfam-gr.git
git push -u origin main
```

---

## 4. Firebase에 배포하기

### 4-1. 처음 한 번 (로컬)

```bash
npm install -g firebase-tools     # Node.js 18 이상 필요
firebase login                    # 브라우저에서 Google 로그인
firebase use --add                # 위에서 만든 프로젝트 선택, alias 는 default
firebase deploy --only hosting,firestore:rules
```

끝나면 `https://<프로젝트ID>.web.app` 주소가 출력됩니다. 이 주소가 실제 서비스 주소입니다.

> `firebase use --add` 를 실행하면 `.firebaserc` 파일이 생성됩니다.
> 예시는 `.firebaserc.example` 에 있습니다.

### 4-2. 이후 자동 배포 (GitHub Actions)

`main` 에 push 할 때마다 자동 배포되도록 설정합니다.

```bash
firebase init hosting:github
```

이 명령이 GitHub 저장소를 물어보고 서비스 계정 시크릿을 자동 등록해 줍니다.
수동으로 하려면 GitHub 저장소 → **Settings → Secrets and variables → Actions** 에서:

| Secret 이름 | 값 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase 콘솔 → 프로젝트 설정 → **서비스 계정** → 새 비공개 키 생성 → JSON 파일 **전체 내용** |
| `FIREBASE_PROJECT_ID` | 프로젝트 ID (예: `jnfam-gr`) |

워크플로우 파일은 이미 들어 있습니다:

- `.github/workflows/firebase-hosting.yml` — `main` push 시 라이브 배포
- `.github/workflows/firebase-hosting-pr-preview.yml` — PR마다 7일짜리 미리보기 URL 생성

### 4-3. 승인된 도메인 등록

Firebase 콘솔 → **Authentication → Settings → 승인된 도메인** 에
`<프로젝트ID>.web.app` 이 있는지 확인하세요(보통 자동 등록됨).
커스텀 도메인을 쓴다면 그 도메인도 추가해야 Google 로그인이 동작합니다.

---

## 5. 로컬에서 테스트하기

ES 모듈을 쓰기 때문에 파일을 더블클릭해서 열면 안 되고 로컬 서버가 필요합니다.

```bash
npm run dev            # http://localhost:5173
# 또는
firebase serve --only hosting
```

로직/파서 테스트:

```bash
npm install            # pdfjs-dist 설치 (테스트 전용)
npm test
```

- `test/logic.test.mjs` — 엑셀 수식과 동일한 판정이 나오는지 20개 케이스 검증
- `test/parser.test.mjs` — `samples/JAPO-260515.pdf` 를 실제로 파싱해 16개 항목 검증
  (다른 PDF로 확인하려면 `node test/parser.test.mjs 경로/파일.pdf`)
- `test/ui.test.mjs` — jsdom으로 실제 화면을 렌더링해 대시보드 집계·입고 폼 판정·
  엑셀 5개 시트 출력까지 34개 항목 검증 (Firebase는 `test/fb-stub.js` 로 대체)

세 가지 모두 통과하는 상태로 전달됩니다. PO 양식이 바뀌거나 판정 규칙을 손볼 때
먼저 테스트를 돌려 보면 회귀를 바로 잡을 수 있습니다.

---

## 6. PDF 자동 인식은 어떻게 동작하나

`public/po-parser.js` 가 pdf.js로 **텍스트의 좌표**를 읽어 표를 복원합니다. 서버로 파일을 보내지 않습니다.

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

---

## 8. 사진에 대해

무료 Spark 플랜에서는 Cloud Storage를 쓸 수 없어, 엑셀과 동일하게
**SharePoint / Google Drive에 올린 뒤 공유 링크를 붙여넣는 방식**입니다.
링크와 파일명이 모두 있어야 `Photo OK` 가 되고, 하나라도 비면 `Photo Missing` 으로 대시보드에 잡힙니다.

앱에서 사진을 직접 찍어 업로드하려면 Blaze(종량제) 플랜으로 올리고 Cloud Storage를 붙이면 됩니다.
소량 사용 시 무료 한도 안에서 처리되지만 카드 등록이 필요합니다.

---

## 9. 파일 구성

```
jnfam-gr/
├── public/                  ← Firebase Hosting 이 배포하는 폴더
│   ├── index.html           화면 구조
│   ├── styles.css           스타일 (모바일 대응 포함)
│   ├── app.js               화면 동작 · Firebase 연동 · 엑셀 내보내기
│   ├── gr-logic.js          입고 판정 로직 (엑셀 수식 대응) — 테스트 대상
│   ├── po-parser.js         PO PDF 파서 — 테스트 대상
│   └── firebase-config.js   ★ 여기에 Firebase 설정값을 넣으세요
├── test/                    Node 테스트
├── samples/                 샘플 PO PDF · 원본 체크시트
├── .github/workflows/       GitHub Actions 자동 배포
├── firebase.json            Hosting / Firestore 설정
├── firestore.rules          보안 규칙 (로그인 사용자만 접근)
└── package.json             개발·테스트용 스크립트
```

## 10. 자주 겪는 문제

| 증상 | 원인과 해결 |
|---|---|
| "Firebase 설정 필요" 화면이 뜸 | `public/firebase-config.js` 에 실제 값을 넣지 않음 |
| 로그인 팝업이 바로 닫힘 | Authentication → 승인된 도메인에 접속 중인 도메인이 없음 |
| `Missing or insufficient permissions` | `firebase deploy --only firestore:rules` 를 실행하지 않음 |
| 화면이 비어 있고 콘솔에 CORS 오류 | `file://` 로 열었음. `npm run dev` 로 로컬 서버를 띄우세요 |
| PDF에서 라인이 안 잡힘 | 레이아웃이 다른 양식. 폼에서 직접 입력하거나 해당 PDF를 `test/parser.test.mjs` 로 확인 |
