/* ---------------------------------------------------------------
   Firebase 프로젝트 설정
   Firebase 콘솔 → 프로젝트 설정 → 내 앱 → 웹 앱 → SDK 설정 및 구성
   에서 복사한 값을 아래에 붙여넣으세요.
   (이 값들은 공개되어도 되는 값입니다. 보안은 firestore.rules 로 처리합니다.)
--------------------------------------------------------------- */
export const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:0000000000000000000000"
};

export const APP = {
  // 특정 도메인 계정만 허용하려면 아래에 도메인을 넣으세요. 예: ['jnfam.net']
  // 비워두면 Google 계정 누구나 로그인할 수 있습니다(= firestore.rules 로만 통제).
  allowedDomains: []
};
