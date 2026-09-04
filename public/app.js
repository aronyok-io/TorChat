const $ = (s) => document.querySelector(s);
const enc = new TextEncoder(), dec = new TextDecoder();
let key, socket, name;
async function makeKey(password) {
  // A fixed app salt is safe here: the unique, high-entropy room passphrase is the secret.
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('onion-whisper-v1'), iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
async function seal(payload) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload))); return JSON.stringify({iv:b64(iv),ct:b64(new Uint8Array(ct))}); }
async function open(packet) { const p=JSON.parse(packet); const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.iv)},key,unb64(p.ct)); return JSON.parse(dec.decode(clear)); }
function add(msg, mine=false) { const box=document.createElement('article');box.className='message'+(mine?' mine':''); const who=document.createElement('div');who.className='who';who.textContent=mine?'You':msg.name;const text=document.createElement('div');text.textContent=msg.text;box.append(who,text);$('#messages').append(box);box.scrollIntoView({block:'end'}); }
function connect() { const protocol=location.protocol==='https:'?'wss':'ws'; socket=new WebSocket(`${protocol}://${location.host}`); socket.onopen=()=>{$('#chat').classList.add('online');$('#status').textContent='Connected securely';}; socket.onclose=()=>{$('#chat').classList.remove('online');$('#status').textContent='Connection lost — retrying…';setTimeout(connect,2000);}; socket.onmessage=async e=>{try{const msg=await open(e.data);if(msg.type==='chat'&&typeof msg.name==='string'&&typeof msg.text==='string')add(msg)}catch{ /* Wrong passwords and malformed relay traffic are intentionally ignored. */ }}; }
$('#join').onsubmit=async e=>{e.preventDefault();name=$('#name').value.trim();key=await makeKey($('#password').value);$('#password').value='';$('#welcome').hidden=true;$('#chat').hidden=false;connect();};
$('#compose').onsubmit=async e=>{e.preventDefault();const input=$('#text'),text=input.value.trim();if(!text||socket.readyState!==WebSocket.OPEN)return;const message={type:'chat',name,text,at:Date.now()};socket.send(await seal(message));add(message,true);input.value='';};
$('#leave').onclick=()=>{socket?.close();location.reload();};
