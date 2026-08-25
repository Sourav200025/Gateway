import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, getDocs, runTransaction, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFHsakGIFj7WTIYpoeE8AWDQIhRKDveUE",
  authDomain: "infinity-gateway-solution.firebaseapp.com",
  projectId: "infinity-gateway-solution",
  storageBucket: "infinity-gateway-solution.firebasestorage.app",
  messagingSenderId: "313941749656",
  appId: "1:313941749656:web:ac411e81606868f0fec5ed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const dummyDomain = "@infinitygateway.com";
const BOT_TOKEN = "8280911898:AAFDTVyHxSbzP_fUGicuAyP-Kmpi07yLaEc";

// Global DOM manipulation helpers
const setTxt = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
const setHtml = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html; }
const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val; }
const setSrc = (id, src) => { const el = document.getElementById(id); if(el) el.src = src; }

// Routing Variables
const BASE_URL = window.location.hostname.includes("github.io") ? "/Gateway/" : "/";
window.navigateTo = (page) => { window.location.href = BASE_URL + page; };

// Headless API Mode Check
const urlParams = new URLSearchParams(window.location.search);
const apiToken = urlParams.get('token');
const apiPayTo = urlParams.get('paytoNumber');
const apiAmt = parseFloat(urlParams.get('amount'));
const apiComment = urlParams.get('comment') || "";

if (apiToken) {
   document.body.style.cssText = "background: #f8fafc !important; color: #0f172a !important; font-family: monospace; padding: 20px; margin: 0;";
   document.body.innerHTML = '<pre id="api-response" style="font-size: 14px; white-space: pre-wrap; word-wrap: break-word;">{\n  "status": "processing..."\n}</pre>';
   const executeAPI = async () => {
      try {
         if(!apiPayTo || isNaN(apiAmt) || apiAmt <= 0) throw new Error("Invalid parameters");
         const senderQ = await getDocs(query(collection(db, "users"), where("apiToken", "==", apiToken)));
         if (senderQ.empty) throw new Error("Invalid API Token");
         const senderDoc = senderQ.docs[0]; const senderData = senderDoc.data();
         const receiverQ = await getDocs(query(collection(db, "users"), where("phone", "==", apiPayTo)));
         if (receiverQ.empty) throw new Error("Receiver wallet not found");
         const receiverDoc = receiverQ.docs[0]; const receiverData = receiverDoc.data();
         if (senderData.phone === receiverData.phone) throw new Error("Cannot transfer to self");

         let txnId = ""; let nSBal = 0; let nRBal = 0;
         await runTransaction(db, async (t) => {
             const sRef = doc(db, "users", senderDoc.id); const rRef = doc(db, "users", receiverDoc.id);
             const sFresh = await t.get(sRef);
             if (sFresh.data().balance < apiAmt) throw new Error("Insufficient balance");
             nSBal = sFresh.data().balance - apiAmt; nRBal = receiverData.balance + apiAmt;
             t.update(sRef, { balance: nSBal }); t.update(rRef, { balance: nRBal, totalCredits: receiverData.totalCredits + apiAmt });
             const txnRef = doc(collection(db, "transactions")); txnId = txnRef.id;
             t.set(txnRef, { type: "api_transfer", from: senderDoc.id, to: receiverDoc.id, senderName: senderData.name, senderPhone: senderData.phone, receiverName: receiverData.name, receiverPhone: receiverData.phone, amount: apiAmt, balanceAfter: nSBal, status: "success", comment: apiComment, timestamp: Date.now(), usersInvolved: [senderDoc.id, receiverDoc.id] });
         });
         const dObj = new Date(); const tStamp = `${('0'+dObj.getDate()).slice(-2)}-${('0'+(dObj.getMonth()+1)).slice(-2)}-${dObj.getFullYear()} ${('0'+dObj.getHours()).slice(-2)}:${('0'+dObj.getMinutes()).slice(-2)}:${('0'+dObj.getSeconds()).slice(-2)}`;
         document.getElementById('api-response').innerText = JSON.stringify({ status: "success", message: "Payment successful", data: { transaction_id: txnId.toUpperCase(), amount: apiAmt, receiver: { name: receiverData.name, number: receiverData.phone }, comment: apiComment, timestamp: tStamp } }, null, 2);
      } catch(e) { document.body.style.color = '#ef4444'; document.getElementById('api-response').innerText = JSON.stringify({ status: "failure", message: e.message || "Transaction failed" }, null, 2); }
   };
   executeAPI();
} else {

   let addFundSettings = { upiId: null, status: 'off' };
   let withdrawSettings = { min: 50, max: 500, flatTax: 2, percTax: 4 };
   let currentUserData = null; let generatedOTP = null; let pendingTgId = null; let globalTransactions = [];

   window.togglePwd = (id, el) => { const input = document.getElementById(id); if(input) { if (input.type === 'password') { input.type = 'text'; el.innerText = 'visibility_off'; } else { input.type = 'password'; el.innerText = 'visibility'; } } };
   window.copyApiUrl = () => { const el = document.getElementById('api-url-display'); if (el && !el.innerText.includes('Loading')) { copyText(el.innerText, "API URL Copied!"); } };

   window.showToast = (msg, type = 'info') => {
     const c = document.getElementById('toast-container'); if(!c) return;
     const t = document.createElement('div'); t.className = `toast`;
     let i = type==='success'?'check_circle':type==='error'?'error':'info';
     let cHex = type==='success'?'#059669':type==='error'?'#e11d48':'#0f172a';
     t.innerHTML = `<span class="material-symbols-rounded" style="color:${cHex}; font-size: 20px;">${i}</span> ${msg}`;
     c.appendChild(t); 
     setTimeout(() => { if(document.body.contains(t)) { t.classList.add('out'); setTimeout(() => { if(document.body.contains(t)) t.remove(); }, 300); } }, 3000);
   };

   window.copyText = (text, msg) => { if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(() => showToast(msg, 'success')).catch(() => fallbackCopyTextToClipboard(text, msg)); } else { fallbackCopyTextToClipboard(text, msg); } };
   function fallbackCopyTextToClipboard(text, msg) { var textArea = document.createElement("textarea"); textArea.value = text; textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed"; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { var successful = document.execCommand('copy'); if(successful) showToast(msg, 'success'); else showToast('Failed to copy', 'error'); } catch (err) { showToast('Failed to copy', 'error'); } document.body.removeChild(textArea); }

   window.openSidebar = () => { const s = document.getElementById('sidebar'); const b = document.getElementById('sidebar-backdrop'); if(s) s.classList.add('active'); if(b) b.classList.add('active'); };
   window.closeSidebar = () => { const s = document.getElementById('sidebar'); const b = document.getElementById('sidebar-backdrop'); if(s) s.classList.remove('active'); if(b) b.classList.remove('active'); };
   window.openModal = (id) => { const m = document.getElementById(id); if(m) m.classList.add('active'); };
   window.closeModal = (id) => { const m = document.getElementById(id); if(m) m.classList.remove('active'); };

   window.setAmount = (val) => { setVal('payAmount', val); updateSummary(); };
   window.updateSummary = () => { const pEl = document.getElementById('payPhone'); const aEl = document.getElementById('payAmount'); if(pEl && aEl) { let p = pEl.value; let a = aEl.value; setTxt('sum-phone', p || '-'); setTxt('sum-amt', a ? `₹ ${a}` : '₹ 0'); setTxt('sum-total', a ? `₹ ${a}` : '₹ 0'); } };

   window.calcWithdrawTax = () => {
       const aEl = document.getElementById('withdrawAmount'); if(!aEl) return; const amt = parseFloat(aEl.value) || 0;
       if(amt > 0) { const tax = withdrawSettings.flatTax + (amt * (withdrawSettings.percTax / 100)); const recv = amt - tax; setHtml('withdraw-tax-info', `Settlement: <b style="color:var(--obsidian)">₹${recv > 0 ? recv.toFixed(2) : '0.00'}</b> (Fee: ₹${tax.toFixed(2)})`); } 
       else { setHtml('withdraw-tax-info', 'Settlement: <b style="color:var(--obsidian)">₹0.00</b> (Fee: ₹0.00)'); }
   };

   const maskPhone = (p) => p && p.length >= 10 ? `${p.substring(0,3)}••••${p.substring(p.length-3)}` : p;
   const generateToken = () => Array.from({length:8}, ()=>String.fromCharCode(97+Math.floor(Math.random()*26)+(Math.random()>0.5?-32:0))).join('');

   // Authentication
   const sForm = document.getElementById('signup-form');
   if(sForm) {
     sForm.addEventListener('submit', async (e) => {
       e.preventDefault(); const email = document.getElementById('reg-email').value.trim();
       if(!email.endsWith('@gmail.com')) return showToast("Only @gmail.com emails allowed", "error");
       const btn = document.getElementById('btn-register'); btn.innerHTML = "Processing..."; btn.disabled = true;
       const p = document.getElementById('reg-phone').value.trim(); const pass = document.getElementById('reg-pass').value;
       try { const cred = await createUserWithEmailAndPassword(auth, p+dummyDomain, pass); await setDoc(doc(db, "users", cred.user.uid), { name: document.getElementById('reg-name').value.trim(), email: email, phone: p, password: pass, balance: 0, totalCredits: 0, telegramUid: null, apiToken: generateToken(), createdAt: Date.now(), isBanned: false, photoURL: null }); showToast("Account Initialized", "success"); navigateTo('dashboard.html'); } 
       catch (err) { showToast(err.message.replace('Firebase: ',''), "error"); btn.disabled = false; btn.innerHTML = "Create Account"; }
     });
   }

   const lForm = document.getElementById('login-form');
   if(lForm) {
     lForm.addEventListener('submit', async (e) => {
       e.preventDefault(); const btn = document.getElementById('btn-login'); btn.innerHTML = "Verifying..."; btn.disabled = true;
       try { await signInWithEmailAndPassword(auth, document.getElementById('login-phone').value.trim()+dummyDomain, document.getElementById('login-password').value); showToast("Access Granted", "success"); navigateTo('dashboard.html'); } 
       catch (err) { showToast("Invalid number or password", "error"); btn.disabled = false; btn.innerHTML = "Login"; }
     });
   }

   // Auth State & Real-time Data
   onAuthStateChanged(auth, async (user) => {
     const currentPath = window.location.pathname;
     const isAuthPage = currentPath.includes('login.html') || currentPath.includes('register.html') || currentPath === BASE_URL || currentPath.endsWith('/');

     if (user) {
       if (isAuthPage) { navigateTo('dashboard.html'); return; }

       onSnapshot(doc(db, "users", user.uid), (docSnap) => {
         if(docSnap.exists()){
           currentUserData = docSnap.data();
           if (currentUserData.isBanned) { alert("Your access has been revoked."); window.logout(); return; }
           
           setTxt('ui-balance', parseFloat(currentUserData.balance).toFixed(2));
           setTxt('ui-phone', maskPhone(currentUserData.phone));
           setTxt('ui-email', currentUserData.email);
           setTxt('ui-total-credit', parseFloat(currentUserData.totalCredits).toFixed(0));
           const d = new Date(currentUserData.createdAt); const dStr = `${d.getDate()} ${d.toLocaleString('default',{month:'short'})} ${d.getFullYear()}`;
           setTxt('ui-date', dStr);
           
           const avatarUrl = currentUserData.photoURL ? currentUserData.photoURL : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserData.name)}&background=0f172a&color=fff&size=128`;
           setSrc('header-avatar', avatarUrl); setSrc('prof-avatar', avatarUrl);
           const firstName = currentUserData.name.split(' ')[0]; const helloTag = document.querySelector('.section-title + h1'); if(helloTag) helloTag.innerText = `Hello, ${firstName}`;
           setHtml('prof-name', `${currentUserData.name}`); setVal('editNameInput', currentUserData.name); setTxt('prof-date', dStr);
           
           if(!currentUserData.apiToken) { const newToken = generateToken(); updateDoc(doc(db, "users", user.uid), { apiToken: newToken }); currentUserData.apiToken = newToken; }
           setTxt('api-token-val', currentUserData.apiToken); setTxt('api-url-display', `https://infinity-gateway-solution.web.app/?token=${currentUserData.apiToken}&paytoNumber={number}&amount={amount}&comment={comment}`);
         }
       });

       const list = document.getElementById('ui-txn-list');
       if(list) {
         onSnapshot(query(collection(db, "transactions"), where("usersInvolved", "array-contains", user.uid)), (snapshot) => {
           globalTransactions = []; snapshot.forEach(d => globalTransactions.push({id: d.id, ...d.data()}));
           globalTransactions.sort((a,b) => b.timestamp - a.timestamp);
           setTxt('ui-total-txns', snapshot.size); setTxt('ui-total-success', snapshot.size);

           list.innerHTML = '';
           if(globalTransactions.length === 0) { list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:14px; background:rgba(255,255,255,0.5); border-radius:16px;">No recent activity.</div>`; return; }
           globalTransactions.slice(0,10).forEach((txn, i) => {
             const isCredit = txn.to === user.uid || txn.type === 'add_fund'; 
             let iconHtml, amtColor, sign, title, statusHtml = '';
             if(txn.type === 'withdrawal') { iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">account_balance</span></div>`; amtColor = 'var(--text-main)'; sign='-'; title='UPI Withdraw'; } 
             else if(txn.type === 'add_fund') { iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">add</span></div>`; amtColor = '#059669'; sign='+'; title='Deposit Cleared'; statusHtml = `<div style="color:var(--text-muted); font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; justify-content:flex-end;">Success</div>`; } 
             else { const name = isCredit?(txn.senderName||'User'):(txn.receiverName||'User'); iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">${isCredit ? 'south_west' : 'north_east'}</span></div>`; amtColor = isCredit ? '#059669' : 'var(--text-main)'; sign = isCredit?'+':'-'; title = isCredit?`From ${name}`:`To ${name}`; statusHtml = `<div style="color:var(--text-muted); font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; justify-content:flex-end;">Success</div>`; }
             const dateStr = new Date(txn.timestamp).toLocaleString('en-US', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
             list.innerHTML += `<div class="txn-row" onclick="openTxnDetails(${i})"><div class="txn-left">${iconHtml}<div class="txn-info"><h4>${title}</h4><p>${dateStr}</p></div></div><div class="txn-right"><div class="txn-amt" style="color:${amtColor}">${sign}₹${parseFloat(txn.amount).toFixed(2)}</div>${statusHtml}</div></div>`;
           });
         });
       }

       onSnapshot(doc(db, "settings", "addFund"), (docSnap) => {
           if(docSnap.exists()) { addFundSettings = docSnap.data(); setTxt('display-upi-id', addFundSettings.upiId || 'Not Set'); 
             const afConf = document.getElementById('add-fund-configured'); const afNotConf = document.getElementById('add-fund-not-configured');
             if(afConf && afNotConf) {
                if (!addFundSettings.upiId || addFundSettings.status !== 'on') { afConf.classList.add('hidden'); afNotConf.classList.remove('hidden'); } 
                else { afNotConf.classList.add('hidden'); afConf.classList.remove('hidden'); }
             }
           }
       });

       onSnapshot(doc(db, "settings", "withdrawal"), (docSnap) => {
         if(docSnap.exists()) { withdrawSettings = { ...withdrawSettings, ...docSnap.data() }; const wdDesc = document.getElementById('withdraw-modal-desc'); if(wdDesc) { let taxStr = ''; if(withdrawSettings.flatTax > 0 && withdrawSettings.percTax > 0) taxStr = `₹${withdrawSettings.flatTax} + ${withdrawSettings.percTax}%`; else if(withdrawSettings.flatTax > 0) taxStr = `₹${withdrawSettings.flatTax}`; else if(withdrawSettings.percTax > 0) taxStr = `${withdrawSettings.percTax}%`; else taxStr = `0`; wdDesc.innerText = `Limit ₹${withdrawSettings.min} - ₹${withdrawSettings.max}. Withdrawal Tax ${taxStr}. UPI Payouts in 1-24 Hrs.`; const amtInput = document.getElementById('withdrawAmount'); if(amtInput) { amtInput.min = withdrawSettings.min; amtInput.max = withdrawSettings.max; } } window.calcWithdrawTax(); }
       });
     } else { if (!isAuthPage) { navigateTo('login.html'); } }
   });

   // Transfer Logic
   window.handlePayUser = async () => {
     const phoneEl = document.getElementById('payPhone'); const amtEl = document.getElementById('payAmount'); if(!phoneEl || !amtEl) return;
     const phone = phoneEl.value.trim(); const amt = parseFloat(amtEl.value); const comment = document.getElementById('payComment').value.trim();
     const btn = document.getElementById('btn-pay');
     if(amt<=0 || phone.length !== 10) return showToast("Enter valid 10-digit number and amount.", "error"); if(phone === currentUserData.phone) return showToast("Cannot route to self.", "error");
     btn.innerHTML = "Routing..."; btn.disabled = true;

     try {
       const q = await getDocs(query(collection(db, "users"), where("phone", "==", phone)));
       if(q.empty) throw new Error("Destination not found on network.");
       const tDoc = q.docs[0]; const tData = tDoc.data(); let savedId = null; let nSBal = 0; let nRBal = 0;

       await runTransaction(db, async (t) => {
         const sRef = doc(db, "users", auth.currentUser.uid); const rRef = doc(db, "users", tDoc.id);
         const sDoc = await t.get(sRef); if(sDoc.data().balance < amt) throw new Error("Insufficient liquidity.");
         nSBal = sDoc.data().balance - amt; nRBal = tData.balance + amt;
         t.update(sRef, { balance: nSBal }); t.update(rRef, { balance: nRBal, totalCredits: tData.totalCredits + amt });
         const txnRef = doc(collection(db, "transactions")); savedId = txnRef.id;
         t.set(txnRef, { type: "transfer", from: auth.currentUser.uid, to: tDoc.id, senderName: currentUserData.name, senderPhone: currentUserData.phone, receiverName: tData.name, receiverPhone: tData.phone, amount: amt, balanceAfter: nSBal, status: "success", timestamp: Date.now(), comment: comment, usersInvolved: [auth.currentUser.uid, tDoc.id] });
       });

       // Success Modal formatting logic
       const succIcon = document.getElementById('succ-icon-container');
       if(succIcon) {
          if (tData.photoURL) {
             succIcon.style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 25px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:white; border:3px solid var(--obsidian); padding:4px;';
             succIcon.innerHTML = `<img src="${tData.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
          } else {
             succIcon.style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 25px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:var(--obsidian); color:white; border:4px solid white; padding:0;';
             succIcon.innerHTML = `<span class="material-symbols-rounded" style="font-size:40px;">done</span>`;
          }
       }
       setHtml('succ-name', `<span style="font-size:14px; font-weight:600;">Account: ${tData.name}</span><br><span style="font-size:12px;color:var(--text-muted)">Wallet: ${phone}</span>`);
       setTxt('succ-amt', `₹${amt}`); setTxt('succ-id', savedId.toUpperCase());
       openModal('success-modal');
     } catch (e) { showToast(e.message, "error"); }
     btn.innerHTML = "Confirm & Send"; btn.disabled = false;
   };

   // DYNAMIC TRANSACTION DETAILS
   window.openTxnDetails = async (index) => {
     const txn = globalTransactions[index]; const isCredit = txn.to === auth.currentUser.uid || txn.type === 'add_fund';
     let title, amtSign, amtColor, notes, method;
     if(txn.type === 'withdrawal') { title = `Withdraw`; amtSign = '-'; amtColor = 'var(--text-main)'; method = 'Bank Routing'; notes = `Destination: ${txn.upiId || 'N/A'}`; } 
     else if(txn.type === 'add_fund') { title = `Deposit Cleared`; amtSign = '+'; amtColor = '#059669'; method = 'Network Deposit'; notes = `Verified on-chain`; } 
     else { 
       const cName = isCredit ? (txn.senderName||'User') : (txn.receiverName||'User'); title = isCredit ? `Received from ${cName}` : `Sent to ${cName}`;
       amtSign = isCredit ? '+' : '-'; amtColor = isCredit ? '#059669' : 'var(--text-main)'; method = txn.type === 'api_transfer' ? 'API Request' : 'P2P Transfer'; 
       notes = isCredit ? `Account: ${cName}<br>Wallet: ${maskPhone(txn.senderPhone)}` : `Account: ${cName}<br>Wallet: ${maskPhone(txn.receiverPhone)}`;
     }
     setHtml('dtl-title', title);
     const d = new Date(txn.timestamp); setTxt('dtl-date', `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);
     setTxt('dtl-amt', `${amtSign}₹${parseFloat(txn.amount).toFixed(2)}`); document.getElementById('dtl-amt').style.color = amtColor;
     setTxt('dtl-id', txn.id.toUpperCase()); setTxt('dtl-method', method); setTxt('dtl-bal', txn.balanceAfter !== undefined ? `₹${parseFloat(txn.balanceAfter).toFixed(2)}` : 'N/A');
     setHtml('dtl-notes', notes); setTxt('dtl-comment', txn.comment ? txn.comment : "None");

     // --- FETCH PROFILE IMAGE DYNAMICALLY ---
     const iconContainer = document.getElementById('dtl-icon-container');
     if (iconContainer) {
       // Reset to default tick
       iconContainer.style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 15px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:var(--obsidian); color:white; border:4px solid white; padding:0;';
       iconContainer.innerHTML = `<span class="material-symbols-rounded" style="font-size:40px;">done</span>`;

       if (txn.type === 'transfer' || txn.type === 'api_transfer') {
         const otherUid = isCredit ? txn.from : txn.to;
         try {
           const otherDoc = await getDoc(doc(db, "users", otherUid));
           if (otherDoc.exists() && otherDoc.data().photoURL) {
             iconContainer.style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 15px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:white; border:3px solid var(--obsidian); padding:4px;';
             iconContainer.innerHTML = `<img src="${otherDoc.data().photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
           }
         } catch(e) { console.error("Could not fetch image"); }
       }
     }
     openModal('txn-details-modal');
   };

   // Additional Functions mapped identically
   window.handleFundRequest = async () => {
         const amt = parseFloat(document.getElementById('addFundAmount').value); const utr = document.getElementById('addFundUtr').value.trim();
         if(isNaN(amt) || amt <= 0) return showToast("Enter a valid amount.", "error"); if(utr.length < 6) return showToast("Enter a valid 12-digit reference.", "error"); 
         const btn = document.getElementById('btn-submit-fund'); btn.innerText = "Initiating..."; btn.disabled = true;
         try { await setDoc(doc(collection(db, "fund_requests")), { uid: auth.currentUser.uid, name: currentUserData.name, phone: currentUserData.phone, amount: amt, utr: utr, status: "pending", timestamp: Date.now() }); showToast("Deposit request broadcasted!", "success"); document.getElementById('addFundAmount').value = ''; document.getElementById('addFundUtr').value = ''; navigateTo('dashboard.html'); } catch(e) { showToast("Error submitting request", "error"); }
         btn.innerHTML = `Confirm Deposit`; btn.disabled = false;
   };

   window.handleWithdraw = async () => {
     const amt = parseFloat(document.getElementById('withdrawAmount').value); const upi = document.getElementById('withdrawUpi').value.trim();
     if(isNaN(amt) || amt < withdrawSettings.min || amt > withdrawSettings.max) return showToast(`Limits: ₹${withdrawSettings.min} - ₹${withdrawSettings.max}.`, "error"); if(!upi) return showToast("Please enter a valid destination.", "error");
     const tax = withdrawSettings.flatTax + (amt * (withdrawSettings.percTax / 100)); const payable = amt - tax; if (payable <= 0) return showToast("Amount too low after fees.", "error");
     const btn = document.getElementById('btn-withdraw'); btn.innerText = "Processing..."; btn.disabled = true;
     try {
       await runTransaction(db, async (t) => {
         const uRef = doc(db, "users", auth.currentUser.uid); const uDoc = await t.get(uRef); if(uDoc.data().balance < amt) throw new Error("Insufficient liquidity.");
         const nBal = uDoc.data().balance - amt; t.update(uRef, { balance: nBal }); const wRef = doc(collection(db, "withdrawals")); t.set(wRef, { uid: auth.currentUser.uid, name: currentUserData.name, phone: currentUserData.phone, upiId: upi, amount: amt, tax: tax, payable: payable, status: "pending", timestamp: Date.now() }); const txnRef = doc(collection(db, "transactions")); t.set(txnRef, { type: "withdrawal", from: auth.currentUser.uid, to: "admin", amount: amt, balanceAfter: nBal, status: "pending", timestamp: Date.now(), usersInvolved: [auth.currentUser.uid], upiId: upi });
       });
       showToast("UPI Withdrawal Sent For Approval!", "success"); closeModal('withdraw-modal'); 
     } catch(e) { showToast(e.message, "error"); }
     btn.innerText = "Confirm Withdrawal"; btn.disabled = false;
   };

   window.saveProfileName = async () => {
         const newName = document.getElementById('editNameInput').value.trim(); const fileInput = document.getElementById('editPhotoInput'); const file = fileInput.files[0];
         if(!newName) return showToast("Name cannot be empty", "error"); const btn = document.getElementById('btn-save-prof'); if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
         try { 
           let updateData = { name: newName };
           if (file) {
             const base64Img = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = (e) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); const MAX_SIZE = 256; let width = img.width; let height = img.height; if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } } canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); resolve(canvas.toDataURL('image/jpeg', 0.8)); }; img.src = e.target.result; }; reader.readAsDataURL(file); });
             updateData.photoURL = base64Img;
           }
           await updateDoc(doc(db, "users", auth.currentUser.uid), updateData); showToast("Profile Updated", "success"); closeModal('edit-profile-modal'); 
         } catch(e) { showToast("Update failed: " + e.message, "error"); }
         if(btn) { btn.innerText = "Save Changes"; btn.disabled = false; }
   };
       
   window.resetProfilePic = async () => { try { await updateDoc(doc(db, "users", auth.currentUser.uid), { photoURL: null }); document.getElementById('editPhotoInput').value = ''; showToast("Avatar removed", "success"); closeModal('edit-profile-modal'); } catch(e) { showToast("Error removing avatar", "error"); } };

   window.logout = () => { signOut(auth).then(() => { navigateTo('login.html'); document.querySelectorAll('input').forEach(i => i.value = ''); showToast("Logout Successful", "success"); }).catch((e) => showToast(e.message, "error")); };
}
