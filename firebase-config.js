/* ---------------------------------------------------------------
   Firebase 프로젝트 설정 — jnfam-gr
   Firebase 콘솔 → 프로젝트 설정 → 내 앱 → jnfam-gr-web → 구성
   (이 값들은 공개되어도 되는 값입니다. 보안은 firestore.rules 가 담당합니다.)
--------------------------------------------------------------- */
export const firebaseConfig = {
  apiKey:            "AIzaSyA_ezfSv_QYOY_-STkqaczTewOz1DpjxKM",
  authDomain:        "jnfam-gr.firebaseapp.com",
  projectId:         "jnfam-gr",
  storageBucket:     "jnfam-gr.firebasestorage.app",
  messagingSenderId: "409125214621",
  appId:             "1:409125214621:web:4137023a70dacaa79f3774"
};

export const APP = {
  // 특정 도메인 계정만 허용하려면 아래에 도메인을 넣으세요. 예: ['jnfam.net']
  // 비워두면 Google 계정으로 로그인한 사람은 누구나 사용할 수 있습니다.
  allowedDomains: []
};
