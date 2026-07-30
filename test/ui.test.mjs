/* UI 스모크 테스트 — jsdom 으로 실제 화면을 렌더링하고 엑셀 출력까지 검증
   실행: npm install && node test/ui.test.mjs */
import { JSDOM } from 'jsdom';
import fs from 'fs';
import XLSX from 'xlsx';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace(/<script[^>]*cdnjs[^>]*><\/script>/,'').replace(/<script type="module"[^>]*><\/script>/,'');
const dom = new JSDOM(html, { url: 'https://t.web.app/', pretendToBeVisual: true });
global.window = dom.window; global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement; global.Blob = dom.window.Blob;
global.XLSX = XLSX;
dom.window.confirm = () => true; dom.window.alert = () => {};
global.confirm = () => true;

// 스텁 데이터 주입
const stub = await import('./fb-stub.js');
stub.DATA.pos = [{ id:'JAPO-260515', poNo:'JAPO-260515', poDate:'2026-05-15', supplier:'HANMI MRO LLC',
  project:'', buyer:'', docLink:'', lines:[
    { line:1, itemCode:'CUPS',   itemDesc:'Cups Total 160',   unit:'EA', orderedQty:160, unitPrice:26 },
    { line:2, itemCode:'COFFEE', itemDesc:'Coffee Total 120', unit:'EA', orderedQty:120, unitPrice:65 } ]}];
stub.DATA.receipts = [
  { id:'a', receiptDate:'2026-05-20', receivingNo:'20260520A', receiver:'MW', carrier:'Hanmi',
    poNo:'JAPO-260515', poLine:1, rcvItemCode:'CUPS', rcvItemDesc:'Cups', rcvUnit:'EA',
    receivedQty:100, lot:'L1', bol:'B1', remarks:'', action:'',
    photos:[{type:'Product Label', fileName:'IMG_01', link:'https://x/1', status:'Uploaded'}], createdAtISO:'1' },
  { id:'b', receiptDate:'2026-05-21', receivingNo:'20260521A', receiver:'MW', carrier:'Hanmi',
    poNo:'JAPO-260515', poLine:2, rcvItemCode:'COFFE', rcvItemDesc:'Coffee', rcvUnit:'Box',
    receivedQty:130, lot:'', bol:'', remarks:'', action:'', photos:[], createdAtISO:'2' }
];

// 엑셀 저장 가로채기
let captured = null;
const realWrite = XLSX.writeFile;
XLSX.writeFile = (wb, name) => { captured = { wb, name }; };

await import('./app.under-test.mjs');
await new Promise(r => setTimeout(r, 60));

const $ = (id) => document.getElementById(id);
const fails = [];
const t = (n, a, e) => { const ok = JSON.stringify(a)===JSON.stringify(e);
  if(!ok) fails.push(`${n}\n   기대: ${JSON.stringify(e)}\n   실제: ${JSON.stringify(a)}`);
  console.log(`${ok?'  ok':'FAIL'}  ${n}`); };

console.log('\n— 로그인/부팅 —');
t('앱 화면 표시', $('appView').classList.contains('hidden'), false);
t('로그인 화면 숨김', $('loginView').classList.contains('hidden'), true);
t('사용자 이름 표시', $('userName').textContent, '김용태');
t('동기화 배너 사라짐', $('syncBar').classList.contains('hidden'), true);

console.log('\n— 대시보드 —');
const kpi = [...$('kpis').querySelectorAll('.kpi')].map(k => [k.querySelector('.l').textContent, k.querySelector('.v').textContent]);
t('KPI 8종', kpi.length, 8);
t('Total PO Lines = 2', kpi.find(k=>k[0]==='Total PO Lines')[1], '2');
t('Partial = 1',        kpi.find(k=>k[0]==='Partial')[1], '1');
t('Over Received = 1',  kpi.find(k=>k[0]==='Over Received')[1], '1');
t('Issues = 1',         kpi.find(k=>k[0]==='Receiving Issues')[1], '1');
t('Photo Missing = 1',  kpi.find(k=>k[0]==='Photo Missing')[1], '1');
t('Open Balance = 60',  kpi.find(k=>k[0]==='Open Balance Qty')[1], '60');
t('미결 라인 테이블 1행', $('openTbl').querySelectorAll('tbody tr').length, 1);
t('확인 필요 1건',        $('issueTbl').querySelectorAll('tbody tr').length, 1);

console.log('\n— PO / 이력 목록 —');
t('PO 목록 1건', $('poTbl').querySelectorAll('tbody tr').length, 1);
t('입고 이력 2건', $('histTbl').querySelectorAll('tbody tr').length, 2);
t('입고 라인 카드 2개', $('recvLines').querySelectorAll('.lp').length, 2);

console.log('\n— 입고 검수 폼 (라인1 클릭) —');
$('recvLines').querySelector('.lp').dispatchEvent(new dom.window.Event('click'));
t('폼 열림', $('recvForm').classList.contains('hidden'), false);
t('배지', $('recvLineBadge').textContent, 'JAPO-260515 · Line 1');
t('잔량 기본값 60', $('r_qty').value, '60');
t('입고번호 자동생성', /^\d{8}[A-Z]$/.test($('r_no').value), true);
$('btnSameItem').dispatchEvent(new dom.window.Event('click'));
t('PO와 동일 버튼 → 코드 복사', $('r_itemCode').value, 'CUPS');
t('판정: Overall OK', /Overall Status : OK/.test($('verdict').textContent), true);
$('r_qty').value = '999'; $('r_qty').dispatchEvent(new dom.window.Event('input'));
t('초과 입력 → Issue', /Overall Status : Issue/.test($('verdict').textContent), true);
$('r_qty').value = '10'; $('r_qty').dispatchEvent(new dom.window.Event('input'));
t('부족 입력 → Partial', /Overall Status : Partial/.test($('verdict').textContent), true);

console.log('\n— 탭 전환 —');
[...document.querySelectorAll('#tabs .tab')].find(t=>t.dataset.view==='exp').dispatchEvent(new dom.window.Event('click'));
t('내보내기 탭 활성', $('view-exp').classList.contains('active'), true);

console.log('\n— 엑셀 내보내기 —');
$('btnExportXlsx').dispatchEvent(new dom.window.Event('click'));
t('파일 생성됨', !!captured, true);
t('시트 구성', captured.wb.SheetNames, ['Dashboard','PO_Master','Receiving_Check','Photo_Log','Lists']);
const pm = XLSX.utils.sheet_to_json(captured.wb.Sheets['PO_Master'], {header:1});
t('PO_Master 헤더 16열', pm[0].length, 16);
t('PO_Master 2행 (라인1)', [pm[1][0], pm[1][1], pm[1][2], pm[1][7], pm[1][13], pm[1][14], pm[1][15]],
   ['JAPO-260515|1','JAPO-260515',1,160,100,60,'Partial']);
t('PO_Master 3행 상태', pm[2][15], 'Over Received');
const rc = XLSX.utils.sheet_to_json(captured.wb.Sheets['Receiving_Check'], {header:1});
t('Receiving_Check 27열', rc[0].length, 27);
t('1행 판정 OK', [rc[1][16], rc[1][17], rc[1][18], rc[1][19], rc[1][24]], ['OK','OK','Partial','Partial','Photo OK']);
t('2행 불일치', [rc[2][16], rc[2][17], rc[2][18], rc[2][19], rc[2][24]],
   ['Item Mismatch','Unit Mismatch','Over Received','Issue','Photo Missing']);
const ph = XLSX.utils.sheet_to_json(captured.wb.Sheets['Photo_Log'], {header:1});
t('Photo_Log 사진 1건', ph.length, 2);
t('Photo_Log 내용', [ph[1][1], ph[1][4], ph[1][6]], ['JAPO-260515','Product Label','https://x/1']);
const ls = XLSX.utils.sheet_to_json(captured.wb.Sheets['Lists'], {header:1});
t('Lists 헤더', ls[0], ['Unit List','Photo Type','Upload Status','Overall Status']);
t('파일명 형식', /^JNFAM_PO_Receiving_Checksheet_\d{4}-\d{2}-\d{2}\.xlsx$/.test(captured.name), true);

console.log(fails.length ? `\n❌ ${fails.length}건 실패\n`+fails.join('\n') : '\n✅ 브라우저 스모크 테스트 전부 통과');
process.exit(fails.length?1:0);
