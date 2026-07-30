import { computeLines, computeReceipts } from '../gr-logic.js';

const pos = [
  { id:'PO-1001', poNo:'PO-1001', poDate:'2026-05-01', supplier:'Hanmi', lines:[
      { line:1, itemCode:'HCL-35-IBC', itemDesc:'HCl 35% / IBC', unit:'EA', orderedQty:1100 },
      { line:2, itemCode:'CAUSTIC-50', itemDesc:'Caustic 50%',   unit:'KG', orderedQty:100  },
      { line:3, itemCode:'DRUM-A',     itemDesc:'Drum A',        unit:'Drum', orderedQty:100 },
      { line:4, itemCode:'SPLIT-1',    itemDesc:'Split item',    unit:'EA', orderedQty:100  },
      { line:5, itemCode:'MISMATCH-1', itemDesc:'Mismatch item', unit:'EA', orderedQty:50   },
      { line:6, itemCode:'NOPHOTO-1',  itemDesc:'No photo item', unit:'EA', orderedQty:10   } ]}
];
const P = [{ type:'Product Label', fileName:'20260501A', link:'https://x/y' }];
const receipts = [
  { id:'r1', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:1, rcvItemCode:'HCL-35-IBC', rcvUnit:'EA', receivedQty:1100, photos:P, createdAtISO:'1' },
  { id:'r2', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:2, rcvItemCode:'CAUSTIC-50', rcvUnit:'KG', receivedQty:40,   photos:P, createdAtISO:'2' },
  { id:'r3', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:3, rcvItemCode:'DRUM-A',     rcvUnit:'Drum', receivedQty:120, photos:P, createdAtISO:'3' },
  { id:'r4', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:4, rcvItemCode:'SPLIT-1',    rcvUnit:'EA', receivedQty:60,   photos:P, createdAtISO:'4' },
  { id:'r5', receiptDate:'2026-05-12', poNo:'PO-1001', poLine:4, rcvItemCode:'SPLIT-1',    rcvUnit:'EA', receivedQty:40,   photos:P, createdAtISO:'5' },
  { id:'r6', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:5, rcvItemCode:'WRONG-CODE', rcvUnit:'KG', receivedQty:50,   photos:P, createdAtISO:'6' },
  { id:'r7', receiptDate:'2026-05-10', poNo:'PO-1001', poLine:6, rcvItemCode:'NOPHOTO-1',  rcvUnit:'EA', receivedQty:10,   photos:[],createdAtISO:'7' },
  { id:'r8', receiptDate:'2026-05-10', poNo:'PO-9999', poLine:1, rcvItemCode:'GHOST',      rcvUnit:'EA', receivedQty:5,    photos:P, createdAtISO:'8' }
];

const L = computeLines(pos, receipts), R = computeReceipts(pos, receipts);
const byLine = (n) => L.find(l => l.line === n);
const byId   = (id) => R.find(r => r.id === id);

let fails = [];
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(!ok) fails.push(`${name}\n   기대: ${JSON.stringify(expected)}\n   실제: ${JSON.stringify(actual)}`);
  console.log(`${ok?'  ok':'FAIL'}  ${name}`);
};

console.log('\n— PO_Master P열 (PO Line Status) —');
t('전량 입고 → Closed',        byLine(1).status, 'Closed');
t('부분 입고 → Partial',       byLine(2).status, 'Partial');
t('초과 입고 → Over Received', byLine(3).status, 'Over Received');
t('분할 입고 합산 → Closed',   byLine(4).status, 'Closed');
t('미입고 라인 없음(전 라인 입고)', L.filter(l=>l.status==='Not Received').length, 0);

console.log('\n— PO_Master N·O열 (Total Received / Remaining) —');
t('L1 누계 1100',   byLine(1).totalReceived, 1100);
t('L2 잔량 60',     byLine(2).remaining, 60);
t('L3 잔량 -20',    byLine(3).remaining, -20);
t('L4 분할 합계 100', byLine(4).totalReceived, 100);

console.log('\n— Receiving_Check Q~T열 (Item / Unit / Qty / Overall) —');
t('r1 완전일치 → OK',   [byId('r1').itemCheck, byId('r1').unitCheck, byId('r1').qtyStatus, byId('r1').overall], ['OK','OK','OK','OK']);
t('r2 부분 → Partial',  [byId('r2').qtyStatus, byId('r2').overall], ['Partial','Partial']);
t('r3 초과 → Issue',    [byId('r3').qtyStatus, byId('r3').overall], ['Over Received','Issue']);
t('r4 1차 누적 60 → Partial', [byId('r4').cumReceived, byId('r4').qtyStatus], [60,'Partial']);
t('r5 2차 누적 100 → OK',     [byId('r5').cumReceived, byId('r5').qtyStatus, byId('r5').overall], [100,'OK','OK']);
t('r5 입고 후 잔량 0',        byId('r5').remainingAfter, 0);
t('r6 코드·단위 불일치 → Issue', [byId('r6').itemCheck, byId('r6').unitCheck, byId('r6').overall], ['Item Mismatch','Unit Mismatch','Issue']);
t('r8 PO 없음 → PO Not Found / Issue', [byId('r8').itemCheck, byId('r8').qtyStatus, byId('r8').overall], ['PO Not Found','PO Not Found','Issue']);

console.log('\n— Receiving_Check Y열 (Photo Status) —');
t('사진 링크+파일명 → Photo OK', byId('r1').photoStatus, 'Photo OK');
t('사진 없음 → Photo Missing',   byId('r7').photoStatus, 'Photo Missing');

console.log('\n— 대소문자·공백 무시 매칭 —');
const R2 = computeReceipts(pos, [{ id:'x', receiptDate:'2026-05-10', poNo:' po-1001 ', poLine:1,
  rcvItemCode:'hcl-35-ibc', rcvUnit:'ea', receivedQty:1100, photos:P }]);
t('소문자/공백 PO·코드·단위도 OK', [R2[0].itemCheck, R2[0].unitCheck, R2[0].overall], ['OK','OK','OK']);

console.log('\n— 대시보드 집계 —');
t('Open Balance Qty (음수 제외)', L.reduce((s,l)=>s+Math.max(0,l.remaining),0), 60);
t('Issue 건수', R.filter(r=>r.overall==='Issue').length, 3);

console.log(fails.length ? `\n❌ ${fails.length}건 실패\n` + fails.join('\n') : '\n✅ 로직 테스트 전부 통과 (' + (R.length+L.length) + ' assertions across 20 cases)');
process.exit(fails.length ? 1 : 0);
