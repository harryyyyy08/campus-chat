(function(){"use strict";
// Pure-JS SHA-256 — fallback for HTTP (non-secure) contexts where crypto.subtle is unavailable
function sha256pure(message){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rr=(n,d)=>(n>>>d)|(n<<(32-d));
  const enc=new TextEncoder(),msg=enc.encode(message),mlen=msg.length;
  const padLen=mlen%64<56?56-mlen%64:120-mlen%64;
  const buf=new Uint8Array(mlen+padLen+8);
  buf.set(msg);buf[mlen]=0x80;
  const dv=new DataView(buf.buffer);
  dv.setUint32(buf.length-4,mlen*8,false);
  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const W=new Uint32Array(64);
  for(let i=0;i<buf.length;i+=64){
    for(let j=0;j<16;j++)W[j]=dv.getUint32(i+j*4,false);
    for(let j=16;j<64;j++){const s0=rr(W[j-15],7)^rr(W[j-15],18)^(W[j-15]>>>3);const s1=rr(W[j-2],17)^rr(W[j-2],19)^(W[j-2]>>>10);W[j]=(W[j-16]+s0+W[j-7]+s1)|0;}
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for(let j=0;j<64;j++){const S1=rr(e,6)^rr(e,11)^rr(e,25);const ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[j]+W[j])|0;const S0=rr(a,2)^rr(a,13)^rr(a,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;
  }
  return[h0,h1,h2,h3,h4,h5,h6,h7].map(n=>(n>>>0).toString(16).padStart(8,"0")).join("");
}

const d=new TextEncoder;
function p(e){return[...new Uint8Array(e)].map(t=>t.toString(16).padStart(2,"0")).join("")}

// Hash function: uses crypto.subtle when available (HTTPS/localhost), else pure-JS fallback
async function b(e,t,r){
  const input=e+t;
  if(typeof crypto!=="undefined"&&crypto.subtle&&typeof crypto.subtle.digest==="function"){
    return p(await crypto.subtle.digest(r.toUpperCase(),d.encode(input)));
  }
  // HTTP over LAN: crypto.subtle is blocked, use pure-JS SHA-256
  return sha256pure(input);
}

function w(e,t,r="SHA-256",n=1e6,l=0){const o=new AbortController,a=Date.now();return{promise:(async()=>{for(let c=l;c<=n;c+=1){if(o.signal.aborted)return null;if(await b(t,c,r)===e)return{number:c,took:Date.now()-a}}return null})(),controller:o}}

function h(e){const t=atob(e),r=new Uint8Array(t.length);for(let n=0;n<t.length;n++)r[n]=t.charCodeAt(n);return r}
function g(e,t=12){const r=new Uint8Array(t);for(let n=0;n<t;n++)r[n]=e%256,e=Math.floor(e/256);return r}

async function m(e,t="",r=1e6,n=0){
  if(typeof crypto==="undefined"||!crypto.subtle)return{promise:Promise.reject(new Error("AES-GCM requires secure context")),controller:new AbortController};
  const l="AES-GCM",o=new AbortController,a=Date.now(),s=async()=>{for(let i=n;i<=r;i+=1){if(o.signal.aborted||!c||!u)return null;try{const f=await crypto.subtle.decrypt({name:l,iv:g(i)},c,u);if(f)return{clearText:new TextDecoder().decode(f),took:Date.now()-a}}catch{}}return null};
  let c=null,u=null;
  try{u=h(e);const i=await crypto.subtle.digest("SHA-256",d.encode(t));c=await crypto.subtle.importKey("raw",i,l,!1,["decrypt"])}catch{return{promise:Promise.reject(),controller:o}}
  return{promise:s(),controller:o};
}

let y;
onmessage=async e=>{
  const{type:t,payload:r,start:n,max:l}=e.data;let o=null;
  if(t==="abort")y?.abort(),y=void 0;
  else if(t==="work"){
    if("obfuscated"in r){const{key:a,obfuscated:s}=r||{};o=await m(s,a,l,n)}
    else{const{algorithm:a,challenge:s,salt:c}=r||{};o=w(s,c,a,l,n)}
    y=o.controller;o.promise.then(a=>{self.postMessage(a&&{...a,worker:!0})});
  }
};
})();
