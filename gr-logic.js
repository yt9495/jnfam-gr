/* =====================================================================
   GR 계산 로직 — 원본 엑셀(JNFAM PO_Receiving_Checksheet.xlsx) 수식과 1:1 대응
   -----------------------------------------------------------------
   PO_Master        N열 Total Received   = SUMIFS(Receiving_Check!N, PO No., PO Line)
                    O열 Remaining        = Ordered - Total Received
                    P열 PO Line Status   = 0→Not Received / <→Partial / =→Closed / >→Over Received
   Receiving_Check  Q열 Item Check       = 라벨 코드 = PO 코드 ? OK : Item Mismatch
                    R열 Unit Check       = 라벨 단위 = PO 단위 ? OK : Unit Mismatch
                    S열 Qty Status       = 누적 < 주문 → Partial / = → OK / > → Over Received
                    T열 Overall Status   = Q·R 불일치 또는 S=Over Received → Issue
                                           그 외 S=Partial → Partial, 아니면 OK
                    Y열 Photo Status     = 링크·파일명 모두 있으면 Photo OK
   ===================================================================== */

export const num  = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
export const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g,' ');

/** PO 라인을 평탄화하고 입고 실적을 합산 */
export function computeLines(pos, receipts){
  const out = [];
  for(const po of pos){
    (po.lines || []).forEach(l => {
      const rcs = receipts.filter(r => norm(r.poNo) === norm(po.poNo) && +r.poLine === +l.line);
      const totalReceived = rcs.reduce((s,r) => s + num(r.receivedQty), 0);
      const ordered = num(l.orderedQty);
      let status;
      if(totalReceived === 0)            status = 'Not Received';
      else if(totalReceived < ordered)   status = 'Partial';
      else if(totalReceived === ordered) status = 'Closed';
      else                               status = 'Over Received';
      const dates = rcs.map(r => r.receiptDate).filter(Boolean).sort();
      out.push({
        poId: po.id, poNo: po.poNo, poDate: po.poDate || '', supplier: po.supplier || '',
        project: po.project || '', buyer: po.buyer || '', docLink: po.docLink || '',
        line: +l.line, itemCode: l.itemCode || '', itemDesc: l.itemDesc || '',
        unit: l.unit || '', orderedQty: ordered, unitPrice: num(l.unitPrice),
        totalReceived, remaining: ordered - totalReceived, status,
        lastReceived: dates.length ? dates[dates.length - 1] : '',
        receiptCount: rcs.length
      });
    });
  }
  return out.sort((a,b) => String(a.poNo).localeCompare(String(b.poNo)) || a.line - b.line);
}

/** 한 건의 입고에 대한 검증 결과 (화면 미리보기와 저장 결과가 같은 함수를 사용) */
export function judge({ poItemCode, poUnit, orderedQty, rcvItemCode, rcvUnit, cumReceived, photos }){
  const notFound = orderedQty == null;
  const itemCheck = notFound ? 'PO Not Found'
    : (norm(rcvItemCode) === norm(poItemCode) ? 'OK' : 'Item Mismatch');
  const unitCheck = notFound ? 'PO Not Found'
    : (norm(rcvUnit) === norm(poUnit) ? 'OK' : 'Unit Mismatch');
  const qtyStatus = notFound ? 'PO Not Found'
    : (cumReceived < orderedQty ? 'Partial' : cumReceived === orderedQty ? 'OK' : 'Over Received');
  const overall = notFound ? 'Issue'
    : ((itemCheck !== 'OK' || unitCheck !== 'OK' || qtyStatus === 'Over Received') ? 'Issue'
       : qtyStatus === 'Partial' ? 'Partial' : 'OK');
  const list = photos || [];
  const photoStatus = (list.length && list.every(p => p.link && p.fileName)) ? 'Photo OK' : 'Photo Missing';
  return { itemCheck, unitCheck, qtyStatus, overall, photoStatus };
}

/** 입고 이력을 시간순 누적으로 판정. 반환값은 최신순 정렬 */
export function computeReceipts(pos, receipts){
  const lines = computeLines(pos, receipts);
  const key = (p,l) => norm(p) + '|' + l;
  const map = new Map(lines.map(l => [key(l.poNo, l.line), l]));
  const running = new Map();

  return [...receipts]
    .sort((a,b) => String(a.receiptDate||'').localeCompare(String(b.receiptDate||''))
                || String(a.createdAtISO||'').localeCompare(String(b.createdAtISO||'')))
    .map(r => {
      const k = key(r.poNo, +r.poLine);
      const po = map.get(k);
      const cum = (running.get(k) || 0) + num(r.receivedQty);
      running.set(k, cum);
      const photos = r.photos || [];
      const v = judge({
        poItemCode: po ? po.itemCode : null, poUnit: po ? po.unit : null,
        orderedQty: po ? po.orderedQty : null,
        rcvItemCode: r.rcvItemCode, rcvUnit: r.rcvUnit, cumReceived: cum, photos
      });
      return {
        ...r, po,
        poItemCode: po ? po.itemCode : 'PO Not Found',
        poItemDesc: po ? po.itemDesc : '',
        poUnit: po ? po.unit : '',
        orderedQty: po ? po.orderedQty : null,
        cumReceived: cum,
        remainingAfter: po ? po.orderedQty - cum : null,
        photos, ...v
      };
    })
    .reverse();
}
