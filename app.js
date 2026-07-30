/* =====================================================================
   JNFAM GR — Goods Receiving
   PO 대조 입고 검수 웹앱 (Firebase Spark 무료 플랜 전용, 빌드 툴 없음)
   ===================================================================== */

import { firebaseConfig, APP } from './firebase-config.js';
import { parsePoPdf } from './po-parser.js';
import { computeLines, computeReceipts, judge, num, norm } from './gr-logic.js';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore, collection, doc, setDoc, addDoc, deleteDoc, getDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

/* ------------------------------ 상수 ------------------------------ */
const UNITS = ['EA','KG','LB','GAL','L','IBC','Tote','Drum','Pallet','Box','Truckload'];
const PHOTO_TYPES = ['Product Label','Pallet / Package Overall','BOL / Packing List',
                     'Damage / Leak','Seal / Container','Qty Count','Other'];
const UPLOAD_STATUS = ['Uploaded','Pending','Not Needed'];

/* ------------------------------ 유틸 ------------------------------ */
const $  = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtN = (v) => Number.isFinite(+v) ? (+v).toLocaleString('en-US',{maximumFractionDigits:4}) : '';
const todayISO = () => new Date().toISOString().slice(0,10);

function toast(msg, bad){
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : '');
  clearTimeout(toast._t); toast._t = setTimeout(()=>t.classList.add('hidden'), 3200);
}
const scrollToEl = (el) => { if(el && typeof el.scrollIntoView === 'function') el.scrollIntoView({behavior:'smooth', block:'start'}); };
function showMsg(id, text, kind){
  const p = $(id);
  if(!text){ p.classList.add('hidden'); return; }
  p.className = 'msg ' + (kind || 'info'); p.textContent = text;
}
/* =====================================================================
   2. Firebase 초기화 / 인증
   ===================================================================== */
let app, auth, db, user = null;
const CFG_OK = firebaseConfig && firebaseConfig.apiKey &&
               !/YOUR_|PASTE|xxxx/i.test(firebaseConfig.apiKey) && firebaseConfig.projectId;

function boot(){
  if(!CFG_OK){ $('configView').classList.remove('hidden'); return; }
  app  = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db   = getFirestore(app);

  onAuthStateChanged(auth, (u) => {
    const allow = (APP && APP.allowedDomains) || [];
    if(u && allow.length && !allow.some(d => (u.email||'').toLowerCase().endsWith('@'+d.toLowerCase()))){
      signOut(auth);
      $('loginErr').classList.remove('hidden');
      $('loginErr').textContent = `허용된 도메인(${allow.join(', ')}) 계정만 사용할 수 있습니다.`;
      return;
    }
    user = u;
    if(u){
      $('loginView').classList.add('hidden');
      $('appView').classList.remove('hidden');
      $('userName').textContent = u.displayName || u.email;
      if(u.photoURL) $('userPhoto').src = u.photoURL; else $('userPhoto').classList.add('hidden');
      subscribe();
    } else {
      $('appView').classList.add('hidden');
      $('loginView').classList.remove('hidden');
    }
  });

  $('btnGoogleLogin').onclick = async () => {
    $('loginErr').classList.add('hidden');
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch(e){ $('loginErr').classList.remove('hidden'); $('loginErr').textContent = e.message; }
  };
  $('btnLogout').onclick = () => signOut(auth);
}

/* =====================================================================
   3. 데이터 구독 + 계산 로직  (엑셀 수식과 1:1 대응)
   ===================================================================== */
const state = { pos: [], receipts: [], ready: { pos:false, rc:false } };

function subscribe(){
  if(subscribe._on) return; subscribe._on = true;
  onSnapshot(query(collection(db,'pos'), orderBy('poNo')), snap => {
    state.pos = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    state.ready.pos = true; renderAll();
  }, err => toast('PO 읽기 실패: '+err.message, true));

  onSnapshot(query(collection(db,'receipts'), orderBy('receiptDate')), snap => {
    state.receipts = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    state.ready.rc = true; renderAll();
  }, err => toast('입고 읽기 실패: '+err.message, true));
}

const buildLines    = () => computeLines(state.pos, state.receipts);
const buildReceipts = () => computeReceipts(state.pos, state.receipts);

const pillFor = (s) => {
  if(['OK','Closed','Photo OK'].includes(s)) return 'ok';
  if(['Partial'].includes(s)) return 'warn';
  if(['Issue','Over Received','Item Mismatch','Unit Mismatch','PO Not Found','Photo Missing'].includes(s)) return 'bad';
  return 'grey';
};
const pill = (s) => s ? `<span class="pill ${pillFor(s)}">${esc(s)}</span>` : '';

/* =====================================================================
   4. 렌더링
   ===================================================================== */
function renderAll(){
  if(state.ready.pos && state.ready.rc) $('syncBar').classList.add('hidden');
  const lines = buildLines(), rcs = buildReceipts();
  renderDash(lines, rcs); renderPoList(); renderRecvPicker(lines);
  renderHist(rcs); renderStats(lines, rcs);
  refreshVerdict();
}

/* ---------- 대시보드 ---------- */
function renderDash(lines, rcs){
  const c = (s) => lines.filter(l => l.status === s).length;
  const openQty = lines.reduce((s,l)=> s + Math.max(0, l.remaining), 0);
  const issues = rcs.filter(r => r.overall === 'Issue');
  const photoMissing = rcs.filter(r => r.photoStatus === 'Photo Missing');

  $('kpis').innerHTML = [
    ['Total PO Lines', lines.length, 'accent'],
    ['Not Received', c('Not Received'), ''],
    ['Partial', c('Partial'), 'warn'],
    ['Closed', c('Closed'), 'ok'],
    ['Over Received', c('Over Received'), 'bad'],
    ['Receiving Issues', issues.length, 'bad'],
    ['Photo Missing', photoMissing.length, 'warn'],
    ['Open Balance Qty', fmtN(openQty), '']
  ].map(([l,v,k]) => `<div class="kpi ${k}"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');

  const term = norm($('dashSearch').value);
  const f = $('dashStatus').value;
  let rows = lines.filter(l => {
    if(f === 'open' && !['Not Received','Partial'].includes(l.status)) return false;
    if(f !== 'open' && f !== 'all' && l.status !== f) return false;
    if(term && !norm(l.poNo+' '+l.itemCode+' '+l.itemDesc+' '+l.supplier).includes(term)) return false;
    return true;
  });
  $('openCount').textContent = rows.length;
  $('openTbl').innerHTML =
    `<thead><tr><th>PO No.</th><th>Line</th><th>Supplier</th><th>Item Code</th><th>Description</th>
     <th>Unit</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Remaining</th>
     <th>Status</th><th>최근 입고</th></tr></thead><tbody>` +
    (rows.length ? rows.map(l => `<tr>
      <td><b>${esc(l.poNo)}</b></td><td class="num">${l.line}</td><td>${esc(l.supplier)}</td>
      <td>${esc(l.itemCode)}</td><td>${esc(l.itemDesc)}</td><td>${esc(l.unit)}</td>
      <td class="num">${fmtN(l.orderedQty)}</td><td class="num">${fmtN(l.totalReceived)}</td>
      <td class="num"><b>${fmtN(l.remaining)}</b></td><td>${pill(l.status)}</td>
      <td>${esc(l.lastReceived)}</td></tr>`).join('')
     : `<tr><td class="empty" colspan="11">표시할 PO 라인이 없습니다.</td></tr>`) + '</tbody>';

  const bad = [...issues, ...photoMissing.filter(p => p.overall !== 'Issue')];
  $('issueCount').textContent = bad.length;
  $('issueTbl').innerHTML =
    `<thead><tr><th>입고일</th><th>PO</th><th>Line</th><th>라벨 코드</th><th>PO 코드</th>
     <th>Item</th><th>Unit</th><th>Qty</th><th>Overall</th><th>Photo</th><th>검수자</th></tr></thead><tbody>` +
    (bad.length ? bad.map(r => `<tr>
      <td>${esc(r.receiptDate)}</td><td><b>${esc(r.poNo)}</b></td><td class="num">${esc(r.poLine)}</td>
      <td>${esc(r.rcvItemCode)}</td><td>${esc(r.poItemCode)}</td>
      <td>${pill(r.itemCheck)}</td><td>${pill(r.unitCheck)}</td><td>${pill(r.qtyStatus)}</td>
      <td>${pill(r.overall)}</td><td>${pill(r.photoStatus)}</td><td>${esc(r.receiver||'')}</td></tr>`).join('')
     : `<tr><td class="empty" colspan="11">확인이 필요한 항목이 없습니다. 👍</td></tr>`) + '</tbody>';
}

/* ---------- PO 목록 ---------- */
function renderPoList(){
  const lines = buildLines();
  $('poCount').textContent = state.pos.length;
  $('poTbl').innerHTML =
    `<thead><tr><th>PO No.</th><th>PO Date</th><th>Supplier</th><th>라인</th>
     <th class="num">Ordered</th><th class="num">Received</th><th>진행</th><th>문서</th><th></th></tr></thead><tbody>` +
    (state.pos.length ? state.pos.map(po => {
      const ls = lines.filter(l => l.poId === po.id);
      const ord = ls.reduce((s,l)=>s+l.orderedQty,0), rec = ls.reduce((s,l)=>s+l.totalReceived,0);
      const st = ls.length===0 ? 'Not Received'
        : ls.every(l=>l.status==='Closed') ? 'Closed'
        : ls.some(l=>l.status==='Over Received') ? 'Over Received'
        : ls.some(l=>l.status!=='Not Received') ? 'Partial' : 'Not Received';
      return `<tr>
        <td><b>${esc(po.poNo)}</b></td><td>${esc(po.poDate||'')}</td><td>${esc(po.supplier||'')}</td>
        <td class="num">${ls.length}</td><td class="num">${fmtN(ord)}</td><td class="num">${fmtN(rec)}</td>
        <td>${pill(st)}</td>
        <td>${po.docLink ? `<a class="link" href="${esc(po.docLink)}" target="_blank" rel="noopener">열기</a>` : ''}</td>
        <td><button class="btn danger tiny" data-delpo="${esc(po.id)}">삭제</button></td></tr>`;
    }).join('') : `<tr><td class="empty" colspan="9">등록된 PO가 없습니다. 위에서 PDF를 업로드하세요.</td></tr>`) + '</tbody>';

  $('poTbl').querySelectorAll('[data-delpo]').forEach(b => b.onclick = async () => {
    const id = b.dataset.delpo;
    const used = state.receipts.some(r => norm(r.poNo) === norm((state.pos.find(p=>p.id===id)||{}).poNo));
    if(used && !confirm('이 PO에 연결된 입고 기록이 있습니다. 그래도 삭제할까요?')) return;
    if(!used && !confirm('이 PO를 삭제할까요?')) return;
    await deleteDoc(doc(db,'pos',id)); toast('PO를 삭제했습니다.');
  });
}

/* ---------- 입고 라인 선택 ---------- */
function renderRecvPicker(lines){
  const term = norm($('recvSearch').value);
  const openOnly = $('recvOpenOnly').checked;
  const rows = lines.filter(l => {
    if(openOnly && ['Closed'].includes(l.status)) return false;
    if(term && !norm(l.poNo+' '+l.itemCode+' '+l.itemDesc+' '+l.supplier).includes(term)) return false;
    return true;
  }).slice(0, 200);

  $('recvLines').innerHTML = rows.length ? rows.map(l => `
    <button class="lp" data-po="${esc(l.poNo)}" data-line="${l.line}">
      <div class="po">${esc(l.poNo)} <span class="tiny muted">· Line ${l.line}</span></div>
      <div class="it">${esc(l.itemCode)} — ${esc(l.itemDesc)}</div>
      <div class="qt">
        <span>주문 <b>${fmtN(l.orderedQty)}</b> ${esc(l.unit)}</span>
        <span>입고 <b>${fmtN(l.totalReceived)}</b></span>
        <span>잔량 <b>${fmtN(l.remaining)}</b></span>
        ${pill(l.status)}
      </div>
    </button>`).join('')
    : `<div class="lp empty-note">조건에 맞는 PO 라인이 없습니다.</div>`;

  $('recvLines').querySelectorAll('[data-po]').forEach(b =>
    b.onclick = () => openRecvForm(b.dataset.po, +b.dataset.line));
}

/* ---------- 입고 이력 ---------- */
function renderHist(rcs){
  const term = norm($('histSearch').value);
  const rows = rcs.filter(r => !term ||
    norm([r.poNo,r.poLine,r.rcvItemCode,r.rcvItemDesc,r.receiver,r.bol,r.lot].join(' ')).includes(term));
  $('histCount').textContent = rows.length;
  $('histTbl').innerHTML =
    `<thead><tr><th>입고일</th><th>입고번호</th><th>PO</th><th>Line</th><th>라벨 코드</th><th>단위</th>
     <th class="num">금회</th><th class="num">누적</th><th class="num">잔량</th>
     <th>Overall</th><th>Photo</th><th>검수자</th><th></th></tr></thead><tbody>` +
    (rows.length ? rows.map(r => `<tr>
      <td>${esc(r.receiptDate)}</td><td>${esc(r.receivingNo||'')}</td><td><b>${esc(r.poNo)}</b></td>
      <td class="num">${esc(r.poLine)}</td><td>${esc(r.rcvItemCode)}</td><td>${esc(r.rcvUnit)}</td>
      <td class="num">${fmtN(r.receivedQty)}</td><td class="num">${fmtN(r.cumReceived)}</td>
      <td class="num">${r.remainingAfter==null?'':fmtN(r.remainingAfter)}</td>
      <td>${pill(r.overall)}</td><td>${pill(r.photoStatus)}</td><td>${esc(r.receiver||'')}</td>
      <td><button class="btn danger tiny" data-delrc="${esc(r.id)}">삭제</button></td></tr>`).join('')
     : `<tr><td class="empty" colspan="13">입고 기록이 없습니다.</td></tr>`) + '</tbody>';

  $('histTbl').querySelectorAll('[data-delrc]').forEach(b => b.onclick = async () => {
    if(!confirm('이 입고 기록을 삭제할까요?')) return;
    await deleteDoc(doc(db,'receipts', b.dataset.delrc)); toast('입고 기록을 삭제했습니다.');
  });
}

function renderStats(lines, rcs){
  const rows = [
    ['등록 PO 건수', state.pos.length],
    ['PO 라인 수', lines.length],
    ['입고 기록 수', rcs.length],
    ['사진 기록 수', rcs.reduce((s,r)=>s+(r.photos||[]).length,0)],
    ['미결 잔량 합계', fmtN(lines.reduce((s,l)=>s+Math.max(0,l.remaining),0))]
  ];
  $('statTbl').innerHTML = '<tbody>' + rows.map(([k,v]) =>
    `<tr><td>${k}</td><td class="num"><b>${v}</b></td></tr>`).join('') + '</tbody>';
}

/* =====================================================================
   5. PO 등록 화면
   ===================================================================== */
let draft = null;

function newDraft(){
  return { poNo:'', poDate: todayISO(), supplier:'', project:'', buyer:'',
           discharge:'', quote:'', payTerm:'', docLink:'', remarks:'',
           lines:[{ line:1, itemCode:'', itemDesc:'', unit:'EA', orderedQty:0, unitPrice:0, qtyHint:null }] };
}
function fillPoForm(){
  $('poForm').classList.remove('hidden');
  $('f_poNo').value = draft.poNo; $('f_poDate').value = draft.poDate || '';
  $('f_supplier').value = draft.supplier || ''; $('f_project').value = draft.project || '';
  $('f_buyer').value = draft.buyer || ''; $('f_discharge').value = draft.discharge || '';
  $('f_quote').value = draft.quote || ''; $('f_payterm').value = draft.payTerm || '';
  $('f_docLink').value = draft.docLink || ''; $('f_remarks').value = draft.remarks || '';
  renderLineEditor();
}
function renderLineEditor(){
  const unitOpts = (u) => UNITS.map(x => `<option ${norm(x)===norm(u)?'selected':''}>${x}</option>`).join('');
  $('lineTbl').innerHTML =
    `<thead><tr><th style="width:56px">Line</th><th>Item Code</th><th>Item Description</th>
     <th style="width:110px">Unit</th><th style="width:120px">Ordered Qty</th>
     <th style="width:110px">Unit Price</th><th style="width:44px"></th></tr></thead><tbody>` +
    draft.lines.map((l,i) => `<tr>
      <td class="num">${l.line}</td>
      <td><input class="inp" data-i="${i}" data-f="itemCode" value="${esc(l.itemCode)}" /></td>
      <td><input class="inp wide" data-i="${i}" data-f="itemDesc" value="${esc(l.itemDesc)}" /></td>
      <td><select class="inp" data-i="${i}" data-f="unit">${unitOpts(l.unit)}</select></td>
      <td><input class="inp" type="number" step="any" data-i="${i}" data-f="orderedQty" value="${l.orderedQty}" />
        ${l.qtyHint && l.qtyHint !== l.orderedQty
          ? `<button class="btn ghost tiny" data-hint="${i}" title="PDF 설명란에서 찾은 수량">→ ${fmtN(l.qtyHint)}</button>` : ''}</td>
      <td><input class="inp" type="number" step="any" data-i="${i}" data-f="unitPrice" value="${l.unitPrice}" /></td>
      <td><button class="btn danger tiny" data-rm="${i}">×</button></td></tr>`).join('') + '</tbody>';

  $('lineTbl').querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => {
    const l = draft.lines[+inp.dataset.i], f = inp.dataset.f;
    l[f] = (f === 'orderedQty' || f === 'unitPrice') ? num(inp.value) : inp.value;
    updateTotalsHint();
  });
  $('lineTbl').querySelectorAll('[data-hint]').forEach(b => b.onclick = () => {
    const l = draft.lines[+b.dataset.hint]; l.orderedQty = l.qtyHint; renderLineEditor();
  });
  $('lineTbl').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => {
    draft.lines.splice(+b.dataset.rm,1);
    draft.lines.forEach((l,i)=> l.line = i+1); renderLineEditor();
  });
  updateTotalsHint();
}
function updateTotalsHint(){
  const amt = draft.lines.reduce((s,l)=> s + num(l.orderedQty)*num(l.unitPrice), 0);
  $('totalsHint').textContent = `라인 ${draft.lines.length}건 · 금액 합계 $${amt.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

async function handleFiles(files){
  const list = [...files].filter(f => /pdf$/i.test(f.name) || f.type === 'application/pdf');
  if(!list.length){ showMsg('parseMsg','PDF 파일만 업로드할 수 있습니다.','bad'); return; }
  showMsg('parseMsg', `${list.length}개 파일 분석 중…`, 'info');
  try{
    let saved = 0, first = null;
    for(const f of list){
      const r = await parsePoPdf(f);
      if(list.length === 1){ first = r; break; }
      if(r.poNo && r.lines.length){ await savePo(toDraft(r)); saved++; }
      else first = first || r;
    }
    if(list.length === 1 && first){
      draft = toDraft(first); fillPoForm();
      $('parseBadge').textContent = `${first.sourceFile} · 라인 ${first.lines.length}건 인식`;
      showMsg('parseMsg', first.lines.length
        ? '자동 인식이 끝났습니다. 값을 확인·수정한 뒤 저장하세요.'
        : '표를 인식하지 못했습니다. 아래에서 직접 입력해 주세요.',
        first.lines.length ? 'ok' : 'bad');
      scrollToEl($('poForm'));
    } else {
      showMsg('parseMsg', `${saved}건 저장 완료.${first ? ' 일부 파일은 인식에 실패해 수동 확인이 필요합니다.' : ''}`, saved ? 'ok':'bad');
      if(first){ draft = toDraft(first); fillPoForm(); }
    }
  } catch(e){
    console.error(e); showMsg('parseMsg', 'PDF 분석 실패: ' + e.message, 'bad');
  }
}
function toDraft(r){
  const d = newDraft();
  Object.assign(d, {
    poNo: r.poNo || '', poDate: r.poDate || todayISO(), supplier: r.supplier || '',
    discharge: r.discharge || '', quote: r.quote || '', payTerm: r.payTerm || '',
    remarks: r.consignee ? `Consignee: ${r.consignee}` : ''
  });
  if(r.lines && r.lines.length) d.lines = r.lines;
  return d;
}
async function savePo(d){
  const poNo = (d.poNo||'').trim();
  if(!poNo) throw new Error('PO No.가 비어 있습니다.');
  const id = poNo.replace(/[\/\\.#$\[\]]/g,'_');
  await setDoc(doc(db,'pos',id), {
    poNo, poDate: d.poDate||'', supplier: d.supplier||'', project: d.project||'',
    buyer: d.buyer||'', discharge: d.discharge||'', quote: d.quote||'',
    payTerm: d.payTerm||'', docLink: d.docLink||'', remarks: d.remarks||'',
    lines: d.lines.map((l,i)=>({
      line: i+1, itemCode: (l.itemCode||'').trim(), itemDesc: (l.itemDesc||'').trim(),
      unit: l.unit||'EA', orderedQty: num(l.orderedQty), unitPrice: num(l.unitPrice)
    })),
    updatedAt: serverTimestamp(), updatedBy: user?.email || '', updatedByName: user?.displayName || ''
  }, { merge: true });
  return id;
}

/* =====================================================================
   6. 입고 검수 화면
   ===================================================================== */
let curLine = null, photoDraft = [];

function openRecvForm(poNo, line){
  const l = buildLines().find(x => norm(x.poNo)===norm(poNo) && x.line === line);
  if(!l) return;
  curLine = l;
  $('recvForm').classList.remove('hidden');
  $('recvLineBadge').textContent = `${l.poNo} · Line ${l.line}`;
  $('poRef').innerHTML = `
    <div><span>PO Item Code</span><b>${esc(l.itemCode)||'-'}</b></div>
    <div><span>PO Description</span><b>${esc(l.itemDesc)||'-'}</b></div>
    <div><span>PO Unit</span><b>${esc(l.unit)||'-'}</b></div>
    <div><span>Ordered Qty</span><b>${fmtN(l.orderedQty)}</b></div>
    <div><span>Total Received</span><b>${fmtN(l.totalReceived)}</b></div>
    <div><span>Remaining</span><b>${fmtN(l.remaining)}</b></div>`;

  $('r_date').value = todayISO();
  $('r_no').value = nextReceivingNo(todayISO());
  $('r_receiver').value = user?.displayName || user?.email || '';
  $('r_carrier').value = l.supplier || '';
  $('r_itemCode').value = ''; $('r_itemDesc').value = '';
  $('r_unit').innerHTML = ['', ...UNITS].map(u => `<option>${u}</option>`).join('');
  $('r_unit').value = '';
  $('r_qty').value = l.remaining > 0 ? l.remaining : '';
  $('r_lot').value = ''; $('r_bol').value = ''; $('r_action').value = ''; $('r_remarks').value = '';
  photoDraft = [{ type:'Product Label', fileName:'', link:'', status:'Uploaded', notes:'' }];
  renderPhotoRows(); refreshVerdict(); showMsg('recvSaveMsg','');
  scrollToEl($('recvForm'));
}
function nextReceivingNo(dateISO){
  const base = dateISO.replace(/-/g,'');
  const same = state.receipts.filter(r => (r.receivingNo||'').startsWith(base)).length;
  return base + String.fromCharCode(65 + Math.min(same, 25));
}
function renderPhotoRows(){
  $('photoRows').innerHTML = photoDraft.map((p,i) => `
    <div class="photo-row">
      <select class="inp" data-pi="${i}" data-pf="type">${PHOTO_TYPES.map(t=>`<option ${t===p.type?'selected':''}>${t}</option>`).join('')}</select>
      <input class="inp" data-pi="${i}" data-pf="fileName" placeholder="파일명" value="${esc(p.fileName)}" />
      <input class="inp" data-pi="${i}" data-pf="link" placeholder="공유 링크 (https://…)" value="${esc(p.link)}" />
      <button class="btn danger tiny" data-prm="${i}">×</button>
    </div>`).join('');
  $('photoRows').querySelectorAll('[data-pf]').forEach(inp => inp.oninput = () => {
    photoDraft[+inp.dataset.pi][inp.dataset.pf] = inp.value; refreshVerdict();
  });
  $('photoRows').querySelectorAll('[data-prm]').forEach(b => b.onclick = () => {
    photoDraft.splice(+b.dataset.prm,1); renderPhotoRows(); refreshVerdict();
  });
}
function currentVerdict(){
  if(!curLine) return null;
  const l = curLine;
  const code = $('r_itemCode').value, unit = $('r_unit').value, qty = num($('r_qty').value);
  const cum = l.totalReceived + qty;
  const v = judge({ poItemCode: l.itemCode, poUnit: l.unit, orderedQty: l.orderedQty,
                    rcvItemCode: code, rcvUnit: unit, cumReceived: cum, photos: photoDraft });
  // 아직 입력하지 않은 항목은 '-' 로 표시 (판정 자체는 judge 와 동일)
  if(!code) v.itemCheck = '-';
  if(!unit) v.unitCheck = '-';
  if(qty <= 0){ v.qtyStatus = '-'; v.overall = '-'; }
  return { ...v, cum, remainingAfter: l.orderedQty - cum };
}
function refreshVerdict(){
  if(!curLine || $('recvForm').classList.contains('hidden')) return;
  const v = currentVerdict();
  const bg = v.overall === 'OK' ? 'var(--ok-bg);color:var(--ok)'
           : v.overall === 'Partial' ? 'var(--warn-bg);color:var(--warn)'
           : v.overall === 'Issue' ? 'var(--bad-bg);color:var(--bad)' : '#eef1f5;color:var(--muted)';
  $('verdict').innerHTML = `
    <div class="vgrid">
      <div class="vi"><span>Item Check</span>${pill(v.itemCheck)}</div>
      <div class="vi"><span>Unit Check</span>${pill(v.unitCheck)}</div>
      <div class="vi"><span>Qty Status</span>${pill(v.qtyStatus)}</div>
      <div class="vi"><span>Photo</span>${pill(v.photoStatus)}</div>
      <div class="vi"><span>누적 입고</span><b>${fmtN(v.cum)}</b> / ${fmtN(curLine.orderedQty)}</div>
      <div class="vi"><span>입고 후 잔량</span><b>${fmtN(v.remainingAfter)}</b></div>
    </div>
    <div class="overall" style="background:${bg}">Overall Status : ${esc(v.overall)}</div>`;
}
async function saveReceipt(){
  if(!curLine) return;
  const v = currentVerdict();
  if(!$('r_date').value) return showMsg('recvSaveMsg','입고일을 입력하세요.','bad');
  if(!$('r_itemCode').value.trim()) return showMsg('recvSaveMsg','라벨의 품목코드를 입력하세요.','bad');
  if(!$('r_unit').value) return showMsg('recvSaveMsg','라벨 단위를 선택하세요.','bad');
  if(num($('r_qty').value) <= 0) return showMsg('recvSaveMsg','실입고 수량을 입력하세요.','bad');
  if(v.overall === 'Issue' && !confirm('불일치(Issue)가 있습니다. 그래도 저장할까요?')) return;

  $('btnSaveRecv').disabled = true;
  try{
    await addDoc(collection(db,'receipts'), {
      receiptDate: $('r_date').value, receivingNo: $('r_no').value.trim(),
      receiver: $('r_receiver').value.trim(), receiverEmail: user?.email || '',
      carrier: $('r_carrier').value.trim(),
      poNo: curLine.poNo, poLine: curLine.line,
      rcvItemCode: $('r_itemCode').value.trim(), rcvItemDesc: $('r_itemDesc').value.trim(),
      rcvUnit: $('r_unit').value, receivedQty: num($('r_qty').value),
      lot: $('r_lot').value.trim(), bol: $('r_bol').value.trim(),
      remarks: $('r_remarks').value.trim(), action: $('r_action').value.trim(),
      photos: photoDraft.filter(p => p.link || p.fileName)
                        .map(p => ({ ...p, status: p.status || 'Uploaded' })),
      createdAt: serverTimestamp(), createdAtISO: new Date().toISOString()
    });
    toast('입고를 저장했습니다.');
    $('recvForm').classList.add('hidden'); curLine = null;
  } catch(e){ showMsg('recvSaveMsg','저장 실패: '+e.message,'bad'); }
  finally{ $('btnSaveRecv').disabled = false; }
}

/* =====================================================================
   7. 엑셀 내보내기 (원본 Checksheet와 동일한 시트 구성)
   ===================================================================== */
function exportXlsx(){
  const lines = buildLines();
  const rcs = buildReceipts().slice().reverse();   // 시간순
  const wb = XLSX.utils.book_new();

  /* Dashboard */
  const c = (s)=>lines.filter(l=>l.status===s).length;
  const dash = [
    ['Receiving / PO Matching Dashboard'],[],
    ['KPI','Value'],
    ['Total PO Lines', lines.length],
    ['Closed PO Lines', c('Closed')],
    ['Partial PO Lines', c('Partial')],
    ['Not Received PO Lines', c('Not Received')],
    ['Over Received PO Lines', c('Over Received')],
    ['Receiving Issues', rcs.filter(r=>r.overall==='Issue').length],
    ['Photo Missing', rcs.filter(r=>r.photoStatus==='Photo Missing').length],
    ['Open Balance Qty Total', lines.reduce((s,l)=>s+Math.max(0,l.remaining),0)],
    [],['Exported', new Date().toISOString().replace('T',' ').slice(0,19)],
    ['Exported by', user?.email || '']
  ];
  const wsD = XLSX.utils.aoa_to_sheet(dash); wsD['!cols']=[{wch:28},{wch:22}];
  XLSX.utils.book_append_sheet(wb, wsD, 'Dashboard');

  /* PO_Master */
  const poHdr = ['PO Key\n(Auto)','PO No.','PO Line','Supplier','Item Code','Item Description','Unit',
    'Ordered Qty','PO Date','Recieved Date','Project / Customer','Buyer','PO Document Link',
    'Total Received\n(Auto)','Remaining Qty\n(Auto)','PO Line Status\n(Auto)'];
  const poRows = lines.map(l => [ `${l.poNo}|${l.line}`, l.poNo, l.line, l.supplier, l.itemCode,
    l.itemDesc, l.unit, l.orderedQty, l.poDate, l.lastReceived, l.project, l.buyer, l.docLink,
    l.totalReceived, l.remaining, l.status ]);
  const wsP = XLSX.utils.aoa_to_sheet([poHdr, ...poRows]);
  wsP['!cols'] = [{wch:18},{wch:16},{wch:8},{wch:20},{wch:16},{wch:30},{wch:8},{wch:12},{wch:12},
                  {wch:14},{wch:18},{wch:14},{wch:26},{wch:14},{wch:14},{wch:16}];
  XLSX.utils.book_append_sheet(wb, wsP, 'PO_Master');

  /* Receiving_Check */
  const rcHdr = ['Receipt Date','Receiving No.','Receiver','Supplier / Carrier','PO No.','PO Line',
    'Received Item Code\n(from label)','Received Item Description','Unit on Label','PO Item Code\n(Auto)',
    'PO Description\n(Auto)','PO Unit\n(Auto)','Ordered Qty\n(Auto)','Received Qty\nThis Delivery',
    'Total Received\nfor PO Line','Remaining Qty\nAfter Receipt','Item Check','Unit Check','Qty Status',
    'Overall Status','Lot / Batch No.','BOL / Delivery Note No.','Photo Link','Photo File Name',
    'Photo Status','Remarks','Action / Owner'];
  const rcRows = rcs.map(r => [ r.receiptDate, r.receivingNo, r.receiver, r.carrier, r.poNo, r.poLine,
    r.rcvItemCode, r.rcvItemDesc, r.rcvUnit, r.poItemCode, r.poItemDesc, r.poUnit, r.orderedQty,
    r.receivedQty, r.cumReceived, r.remainingAfter, r.itemCheck, r.unitCheck, r.qtyStatus, r.overall,
    r.lot, r.bol, (r.photos[0]||{}).link || '', (r.photos[0]||{}).fileName || '', r.photoStatus,
    r.remarks, r.action ]);
  const wsR = XLSX.utils.aoa_to_sheet([rcHdr, ...rcRows]);
  wsR['!cols'] = rcHdr.map((h,i)=>({wch: [12,14,12,18,16,8,20,26,12,18,26,10,12,14,14,16,14,14,14,14,16,20,30,18,14,24,18][i] || 14}));
  XLSX.utils.book_append_sheet(wb, wsR, 'Receiving_Check');

  /* Photo_Log */
  const phHdr = ['Photo Date','PO No.','PO Line','Receiving No.','Photo Type','File Name',
                 'Photo / Folder Link','Uploaded By','Upload Status','Notes'];
  const phRows = [];
  rcs.forEach(r => (r.photos||[]).forEach(p => phRows.push(
    [ r.receiptDate, r.poNo, r.poLine, r.receivingNo, p.type, p.fileName, p.link,
      r.receiver, p.status || 'Uploaded', p.notes || '' ])));
  const wsPh = XLSX.utils.aoa_to_sheet([phHdr, ...phRows]);
  wsPh['!cols'] = [{wch:12},{wch:16},{wch:8},{wch:14},{wch:22},{wch:20},{wch:44},{wch:14},{wch:14},{wch:22}];
  XLSX.utils.book_append_sheet(wb, wsPh, 'Photo_Log');

  /* Lists */
  const maxL = Math.max(UNITS.length, PHOTO_TYPES.length, UPLOAD_STATUS.length, 4);
  const listRows = [['Unit List','Photo Type','Upload Status','Overall Status']];
  const overall = ['OK','Partial','Issue','Over Received'];
  for(let i=0;i<maxL;i++) listRows.push([UNITS[i]||'', PHOTO_TYPES[i]||'', UPLOAD_STATUS[i]||'', overall[i]||'']);
  const wsL = XLSX.utils.aoa_to_sheet(listRows);
  wsL['!cols'] = [{wch:14},{wch:24},{wch:14},{wch:16}];
  XLSX.utils.book_append_sheet(wb, wsL, 'Lists');

  XLSX.writeFile(wb, `JNFAM_PO_Receiving_Checksheet_${todayISO()}.xlsx`);
  showMsg('expMsg', `PO 라인 ${lines.length}건 · 입고 ${rcs.length}건을 내보냈습니다.`, 'ok');
}
function exportJson(){
  const blob = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(),
    pos: state.pos, receipts: state.receipts }, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `jnfam_gr_backup_${todayISO()}.json`; a.click();
  URL.revokeObjectURL(a.href);
  showMsg('expMsg','JSON 백업을 내려받았습니다.','ok');
}

/* =====================================================================
   8. 이벤트 연결
   ===================================================================== */
document.querySelectorAll('#tabs .tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('#tabs .tab').forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  t.classList.add('active'); $('view-' + t.dataset.view).classList.add('active');
  window.scrollTo({top:0});
});

const drop = $('drop');
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('over'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
$('fileInput').addEventListener('change', e => { handleFiles(e.target.files); e.target.value=''; });

$('btnNewPo').onclick = () => { draft = newDraft(); fillPoForm(); $('parseBadge').textContent='수기 등록'; showMsg('parseMsg',''); };
$('btnCancelPo').onclick = () => { $('poForm').classList.add('hidden'); draft = null; };
$('btnAddLine').onclick = () => { draft.lines.push({ line: draft.lines.length+1, itemCode:'', itemDesc:'', unit:'EA', orderedQty:0, unitPrice:0 }); renderLineEditor(); };
['poNo','poDate','supplier','project','buyer','discharge','quote','payterm','docLink','remarks'].forEach(k => {
  const map = { payterm:'payTerm' };
  const elx = $('f_'+k); if(!elx) return;
  elx.oninput = () => { if(draft) draft[map[k]||k] = elx.value; };
});
$('btnSavePo').onclick = async () => {
  if(!draft) return;
  $('btnSavePo').disabled = true;
  try{
    draft.poNo = $('f_poNo').value.trim();
    if(!draft.poNo) throw new Error('PO No.를 입력하세요.');
    const id = draft.poNo.replace(/[\/\\.#$\[\]]/g,'_');
    const exist = await getDoc(doc(db,'pos',id));
    if(exist.exists() && !confirm(`이미 등록된 PO(${draft.poNo})입니다. 덮어쓸까요?`)){ return; }
    await savePo(draft);
    showMsg('poSaveMsg', `${draft.poNo} 저장 완료 (라인 ${draft.lines.length}건).`, 'ok');
    toast('PO를 저장했습니다.');
    $('poForm').classList.add('hidden'); draft = null; showMsg('parseMsg','');
  } catch(e){ showMsg('poSaveMsg','저장 실패: '+e.message,'bad'); }
  finally{ $('btnSavePo').disabled = false; }
};

$('dashSearch').oninput = () => renderDash(buildLines(), buildReceipts());
$('dashStatus').onchange = () => renderDash(buildLines(), buildReceipts());
$('recvSearch').oninput = () => renderRecvPicker(buildLines());
$('recvOpenOnly').onchange = () => renderRecvPicker(buildLines());
$('histSearch').oninput = () => renderHist(buildReceipts());

$('btnSameItem').onclick = () => {
  if(!curLine) return;
  $('r_itemCode').value = curLine.itemCode;
  $('r_itemDesc').value = curLine.itemDesc;
  $('r_unit').value = curLine.unit;
  refreshVerdict();
};
['r_itemCode','r_unit','r_qty'].forEach(id => {
  $(id).addEventListener('input', refreshVerdict);
  $(id).addEventListener('change', refreshVerdict);
});
$('r_date').onchange = () => { $('r_no').value = nextReceivingNo($('r_date').value || todayISO()); };
$('btnAddPhoto').onclick = () => { photoDraft.push({type:'Product Label',fileName:'',link:'',status:'Uploaded',notes:''}); renderPhotoRows(); refreshVerdict(); };
$('btnCancelRecv').onclick = () => { $('recvForm').classList.add('hidden'); curLine = null; };
$('btnSaveRecv').onclick = saveReceipt;
$('btnExportXlsx').onclick = exportXlsx;
$('btnExportJson').onclick = exportJson;

boot();

