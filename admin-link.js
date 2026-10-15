// The server checks the service-level allowlist; point owners have no implicit access.
(()=>{if(typeof sb==='undefined'||!sb)return;let revision=0;async function check(){const current=++revision;const button=document.getElementById('serviceAdminLink');if(!button)return;button.classList.add('hide');try{const {data:{session}}=await sb.auth.getSession();if(!session)return;const {data,error}=await sb.rpc('pvz2_service_admin_access');if(current===revision&&!error&&data===true)button.classList.remove('hide')}catch{}}
sb.auth.onAuthStateChange(()=>setTimeout(check,0));check()})();
