/* PO PDF 파서 회귀 테스트
   실행: npm install && node test/parser.test.mjs [PDF경로]
   기본값은 samples/JAPO-260515.pdf 입니다. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parsePdfDocument } from '../po-parser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] || path.join(here, '..', 'samples', 'JAPO-260515.pdf');
if(!fs.existsSync(file)){
  console.log(`샘플 PDF가 없습니다: ${file}\n  → samples/ 폴더에 PO PDF를 넣거나 경로를 인자로 주세요.`);
  process.exit(0);
}

const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)) }).promise;
const res = await parsePdfDocument(pdf, path.basename(file));
console.log(JSON.stringify(res, null, 2));

const fails = [];
const t = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if(!ok) fails.push(`${name}\n   기대: ${JSON.stringify(expected)}\n   실제: ${JSON.stringify(actual)}`);
  console.log(`${ok ? '  ok' : 'FAIL'}  ${name}`);
};

if(path.basename(file) === 'JAPO-260515.pdf'){
  console.log('\n— JAPO-260515 기준 검증 —');
  t('PO No.',        res.poNo, 'JAPO-260515');
  t('PO Date',       res.poDate, '2026-05-15');
  t('Supplier',      res.supplier, 'HANMI MRO LLC');
  t('Discharge',     res.discharge, 'ATLANTA, GA USA');
  t('Quote #',       res.quote, '051426-JNFAM04');
  t('Payment Term',  res.payTerm, 'ACH');
  t('TAX',           res.tax, 8.10);
  t('라인 수',        res.lines.length, 2);
  t('1행 설명',       res.lines[0].itemDesc, 'Cups Total 160');
  t('1행 수량',       res.lines[0].orderedQty, 1);
  t('1행 수량 힌트',   res.lines[0].qtyHint, 160);
  t('1행 단가',       res.lines[0].unitPrice, 26);
  t('1행 금액',       res.lines[0].amount, 26);
  t('2행 품목코드',    res.lines[1].itemCode, 'COFFEE');
  t('2행 단가',       res.lines[1].unitPrice, 65);
  t('2행 수량 힌트',   res.lines[1].qtyHint, 120);
}
console.log(fails.length ? `\n❌ ${fails.length}건 실패\n` + fails.join('\n') : '\n✅ 파서 테스트 통과');
process.exit(fails.length ? 1 : 0);
