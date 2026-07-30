/* app.js 의 Firebase CDN import 를 로컬 스텁으로 바꾼 사본을 만든다 (테스트 전용) */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
let s = fs.readFileSync(path.join(here, '..', 'app.js'), 'utf8');

s = s.replace(/from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^']+'/g, "from './fb-stub.js'");
s = s.replace(/from '\.\/(po-parser|gr-logic|firebase-config)\.js'/g, "from '../$1.js'");
s = s.replace("from '../firebase-config.js'", "from './config-stub.js'");

fs.writeFileSync(path.join(here, 'app.under-test.mjs'), s);
console.log('test/app.under-test.mjs 생성 완료');
