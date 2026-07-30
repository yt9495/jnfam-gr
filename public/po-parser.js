/* =====================================================================
   PO PDF 파서 — pdf.js 텍스트 좌표 기반
   서버 없이 브라우저에서만 동작합니다. (Node 테스트에서도 재사용)
   ===================================================================== */

/** 다양한 날짜 표기를 YYYY-MM-DD 로 정규화 */
export function normDate(s){
  if(!s) return '';
  s = String(s).trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})$/);            // M/D/YYYY (미국식)
  if(m){
    const y = m[3].length === 2 ? '20'+m[3] : m[3];
    return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  const d = new Date(s);
  return isNaN(d) ? '' : d.toISOString().slice(0,10);
}

/** 같은 y 좌표의 텍스트 조각들을 한 줄로 묶는다 */
export function groupRows(items, tol = 3.5){
  const sorted = [...items].sort((a,b)=> a.top - b.top || a.x - b.x);
  const rows = []; let cur = null;
  for(const it of sorted){
    if(!cur || Math.abs(it.top - cur.top) > tol){ cur = { top: it.top, items: [it] }; rows.push(cur); }
    else cur.items.push(it);
  }
  for(const r of rows){
    r.items.sort((a,b)=> a.x - b.x);
    r.text = r.items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
  }
  return rows;
}

/** "$ 2 6.00" 처럼 흩어진 숫자 조각을 합쳐 숫자로 변환 */
export function cellNum(str){
  const cleaned = String(str||'').replace(/[^0-9.,\-]/g,'').replace(/,/g,'');
  if(!cleaned || !/\d/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
export function joinCell(items){
  return items.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
}

/** 표 머리글(11~15번 칼럼)의 x 좌표로 칼럼 경계를 잡고 품목 라인을 뽑는다 */
export function extractLines(rows){
  const hdr = rows.find(r => /Product\s*Name/i.test(r.text) && /Amount/i.test(r.text));
  if(!hdr) return { lines: [], hdrTop: null };

  // pdf.js 는 "13. Quantity" 를 한 조각으로, 다른 PDF 는 "13." 과 "Quantity" 로 나눠 준다.
  // 두 경우를 모두 받아들이도록 여러 패턴을 순서대로 시도한다.
  const findX = (...res) => {
    for(const re of res){
      const it = hdr.items.find(i => re.test(i.text));
      if(it) return it.x;
    }
    return null;
  };
  const qtyX   = findX(/^13\.?$/, /^13\.\s|Quantity/i);
  const priceX = findX(/^14\.?$/, /^14\.\s|Unit\s*Price/i);
  const amtX   = findX(/^15\.?$/, /^15\.\s|Amount/i);
  if(qtyX == null || priceX == null || amtX == null) return { lines: [], hdrTop: hdr.top };

  const bDesc  = qtyX - 5;                 // 품명·설명 | 수량
  const bQty   = (qtyX + priceX) / 2;      // 수량 | 단가
  const bPrice = (priceX + amtX) / 2;      // 단가 | 금액

  const lines = [];
  for(const r of rows){
    if(r.top <= hdr.top + 4) continue;
    if(/^\s*TAX\b/i.test(r.text) || /Payment\s+term/i.test(r.text) || /Signed\s+By/i.test(r.text)) break;
    if(/^\s*(SUB\s*TOTAL|GRAND\s*TOTAL|Information\s+of\s+Bank)\b/i.test(r.text)) continue;

    const desc  = joinCell(r.items.filter(i => i.x <  bDesc));
    const qty   = cellNum(joinCell(r.items.filter(i => i.x >= bDesc && i.x < bQty)));
    const price = cellNum(joinCell(r.items.filter(i => i.x >= bQty  && i.x < bPrice)));
    const amt   = cellNum(joinCell(r.items.filter(i => i.x >= bPrice)));
    if(!desc || qty == null || amt == null) continue;
    if(/^[\d.,\s$]+$/.test(desc)) continue;                 // 숫자만 있는 합계 줄 제외

    // "Cups Total 160" → 품목명 Cups, 수량 힌트 160
    const hint = desc.match(/\bTotal\s+([\d,]+(?:\.\d+)?)\b/i);
    const name = desc.replace(/\bTotal\s+[\d,]+(?:\.\d+)?\b/ig,'').trim() || desc;

    lines.push({
      itemCode: name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24),
      itemDesc: desc,
      unit: 'EA',
      orderedQty: qty,
      qtyHint: hint ? cellNum(hint[1]) : null,
      unitPrice: price ?? 0,
      amount: amt
    });
  }
  return { lines, hdrTop: hdr.top };
}

/** PO 번호·날짜·공급사 등 헤더 정보 추출 */
export function extractHeader(rows, fileName){
  const all = rows.map(r=>r.text).join('\n');
  const out = { poNo:'', poDate:'', supplier:'', consignee:'', discharge:'',
                quote:'', payTerm:'', tax:null };

  const iInv = rows.findIndex(r => /NO\s*&?\s*Date\s+of\s+Invoice/i.test(r.text));
  if(iInv >= 0){
    for(let i = iInv+1; i < Math.min(iInv+5, rows.length); i++){
      const right = rows[i].items.filter(it => it.x >= 290);
      if(!right.length) continue;
      const txt = joinCell(right);
      const d = txt.match(/\d{1,2}[-./]\d{1,2}[-./]\d{2,4}|\d{4}[-./]\d{1,2}[-./]\d{1,2}/);
      if(d && !out.poDate) out.poDate = normDate(d[0]);
      const rest = d ? txt.replace(d[0],'') : txt;
      const p = rest.match(/([A-Za-z][A-Za-z0-9]*[-_][A-Za-z0-9-]+)/);
      if(p && !out.poNo) out.poNo = p[1];
      if(out.poNo) break;
    }
  }
  if(!out.poNo){
    const m = all.match(/\b([A-Z]{2,}[A-Z0-9]*-[A-Z0-9]{3,})\b/);
    if(m) out.poNo = m[1];
  }
  if(!out.poNo && fileName) out.poNo = String(fileName).replace(/\.pdf$/i,'').trim();

  const firstLeftAfter = (re, span = 4) => {
    const i = rows.findIndex(r => re.test(r.text));
    if(i < 0) return '';
    for(let k = i+1; k < Math.min(i+span, rows.length); k++){
      const t = joinCell(rows[k].items.filter(it => it.x < 290));
      if(t && !/^\d+\./.test(t)) return t;
    }
    return '';
  };
  out.supplier  = firstLeftAfter(/Shipper\s*\/?\s*Exporter/i);
  out.consignee = firstLeftAfter(/Consignee\s*\/?\s*Importer/i);

  const iDis = rows.findIndex(r => /Discharge\s*site/i.test(r.text));
  if(iDis >= 0 && rows[iDis+1]) out.discharge = rows[iDis+1].text.replace(/^6\.\s*Carrier\s*/i,'').trim();

  const q = all.match(/Quote\s*#?\s*([A-Za-z0-9\-_/]+)/i);  if(q) out.quote   = q[1];
  const p = all.match(/Payment\s+term\s+([^\n]+)/i);        if(p) out.payTerm = p[1].trim();

  const taxRow = rows.find(r => /^\s*TAX\b/i.test(r.text));
  if(taxRow) out.tax = cellNum(taxRow.text.replace(/TAX/i,''));
  return out;
}

/** pdf.js 문서 객체 → PO 데이터 (브라우저·Node 공통) */
export async function parsePdfDocument(pdf, fileName){
  let allRows = [], lines = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ text: i.str.trim(), x: i.transform[4], top: vp.height - i.transform[5] }));
    const rows = groupRows(items);
    allRows = allRows.concat(rows.map(r => ({ ...r, top: r.top + (p-1)*10000 })));
    lines = lines.concat(extractLines(rows).lines);
  }
  const head = extractHeader(allRows, fileName);
  lines.forEach((l, i) => l.line = i + 1);
  return { ...head, lines, sourceFile: fileName };
}

/* ---- 브라우저 전용: CDN 에서 pdf.js 로드 후 파일 파싱 ---- */
let pdfjsLib = null;
export async function loadPdfJs(){
  if(pdfjsLib) return pdfjsLib;
  const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/';
  pdfjsLib = await import(/* @vite-ignore */ base + 'pdf.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs';
  return pdfjsLib;
}
export async function parsePoPdf(file){
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  return parsePdfDocument(pdf, file.name);
}
