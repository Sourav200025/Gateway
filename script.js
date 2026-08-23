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

// API Routing Check
const urlParams = new URLSearchParams(window.location.search);
const apiToken = urlParams.get('token');
const apiPayTo = urlParams.get('paytoNumber');
const apiAmt = parseFloat(urlParams.get('amount'));
const apiComment = urlParams.get('comment') || "";

if (apiToken) {
   // --- HEADLESS API MODE (No UI rendering) ---
   document.body.style.cssText = "background: #f8fafc !important; color: #0f172a !important; font-family: monospace; padding: 20px; margin: 0;";
   document.body.innerHTML = '<pre id="api-response" style="font-size: 14px; white-space: pre-wrap; word-wrap: break-word;">{\n  "status": "processing..."\n}</pre>';
   
   const executeAPI = async () => {
      try {
         if(!apiPayTo || isNaN(apiAmt) || apiAmt <= 0) throw new Error("Invalid parameters: paytoNumber (10 digits) and amount (> 0) required.");

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
             t.update(sRef, { balance: nSBal });
             t.update(rRef, { balance: nRBal, totalCredits: receiverData.totalCredits + apiAmt });

             const txnRef = doc(collection(db, "transactions")); txnId = txnRef.id;
             t.set(txnRef, { type: "api_transfer", from: senderDoc.id, to: receiverDoc.id, senderName: senderData.name, senderPhone: senderData.phone, receiverName: receiverData.name, receiverPhone: receiverData.phone, amount: apiAmt, balanceAfter: nSBal, status: "success", comment: apiComment, timestamp: Date.now(), usersInvolved: [senderDoc.id, receiverDoc.id] });
         });

         if(senderData.telegramUid) {
            const sendAlert = `<b>💸 Amount Sent Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Receiver :</b> <code>${receiverData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${apiAmt.toFixed(1)}\n 👩‍💻 <b>Method:</b> API\n 💰 <b>Updated Balance:</b> <code>₹${nSBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely debited!`;
            fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: senderData.telegramUid, text: sendAlert, parse_mode: "HTML" }) });
         }
         if(receiverData.telegramUid) {
            const rcvAlert = `<b>💸 Amount Credited Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Sender :</b> <code>${senderData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${apiAmt.toFixed(1)}\n 👩‍💻 <b>Method:</b> API\n 💰 <b>Updated Balance:</b> <code>₹${nRBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely Credited!`;
            fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: receiverData.telegramUid, text: rcvAlert, parse_mode: "HTML" }) });
         }

         const dObj = new Date(); 
         const tStamp = `${('0'+dObj.getDate()).slice(-2)}-${('0'+(dObj.getMonth()+1)).slice(-2)}-${dObj.getFullYear()} ${('0'+dObj.getHours()).slice(-2)}:${('0'+dObj.getMinutes()).slice(-2)}:${('0'+dObj.getSeconds()).slice(-2)}`;

         const responseData = {
            status: "success",
            message: "Payment successful",
            data: {
               transaction_id: txnId.toUpperCase(),
               amount: apiAmt,
               receiver: { name: receiverData.name, number: receiverData.phone },
               comment: apiComment,
               timestamp: tStamp
            }
         };
         document.getElementById('api-response').innerText = JSON.stringify(responseData, null, 2);
      } catch(e) {
         const errorData = {
            status: "failure",
            message: e.message || "Transaction failed"
         };
         document.body.style.color = '#ef4444';
         document.getElementById('api-response').innerText = JSON.stringify(errorData, null, 2);
      }
   };
   executeAPI();

} else {
   // --- NORMAL UI MODE ---

   let addFundSettings = { upiId: null, status: 'off' };
   let withdrawSettings = { min: 50, max: 500, flatTax: 2, percTax: 4 };
   let currentUserData = null; let generatedOTP = null; let pendingTgId = null; let globalTransactions = [];

   // Window Global Functions for UI interaction
   window.togglePwd = (id, el) => {
     const input = document.getElementById(id);
     if (input.type === 'password') {
       input.type = 'text';
       el.innerText = 'visibility_off';
     } else {
       input.type = 'password';
       el.innerText = 'visibility';
     }
   };

   window.copyApiUrl = () => {
      const url = document.getElementById('api-url-display').innerText;
      if (url && !url.includes('Loading')) { copyText(url, "API URL Copied!"); }
   };
   
   window.testApiCall = async () => {
      const phone = document.getElementById('testApiPhone').value.trim();
      const amt = parseFloat(document.getElementById('testApiAmount').value);
      const comment = document.getElementById('testApiComment').value.trim() || "";
      
      if (phone.length !== 10) return showToast("Enter a valid 10-digit number", "error");
      if (isNaN(amt) || amt <= 0) return showToast("Enter a valid amount", "error");
      if (!currentUserData || !currentUserData.apiToken) return showToast("API token not ready", "error");
      
      const responseBox = document.getElementById('test-api-response');
      responseBox.classList.remove('hidden');
      responseBox.style.color = 'var(--text-main)'; 
      responseBox.innerText = '{\n  "status": "processing..."\n}';
      
      try {
         const senderData = currentUserData;
         const receiverQ = await getDocs(query(collection(db, "users"), where("phone", "==", phone)));
         if (receiverQ.empty) throw new Error("Receiver wallet not found");
         const receiverDoc = receiverQ.docs[0]; const receiverData = receiverDoc.data();

         if (senderData.phone === receiverData.phone) throw new Error("Cannot transfer to self");

         let txnId = ""; let nSBal = 0; let nRBal = 0;
         await runTransaction(db, async (t) => {
             const sRef = doc(db, "users", auth.currentUser.uid); const rRef = doc(db, "users", receiverDoc.id);
             const sFresh = await t.get(sRef);
             if (sFresh.data().balance < amt) throw new Error("Insufficient balance");

             nSBal = sFresh.data().balance - amt; nRBal = receiverData.balance + amt;
             t.update(sRef, { balance: nSBal });
             t.update(rRef, { balance: nRBal, totalCredits: receiverData.totalCredits + amt });

             const txnRef = doc(collection(db, "transactions")); txnId = txnRef.id;
             t.set(txnRef, { type: "api_transfer", from: auth.currentUser.uid, to: receiverDoc.id, senderName: senderData.name, senderPhone: senderData.phone, receiverName: receiverData.name, receiverPhone: receiverData.phone, amount: amt, balanceAfter: nSBal, status: "success", comment: comment, timestamp: Date.now(), usersInvolved: [auth.currentUser.uid, receiverDoc.id] });
         });

         if(senderData.telegramUid) {
            const sendAlert = `<b>💸 Amount Sent Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Receiver :</b> <code>${receiverData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${amt.toFixed(1)}\n 👩‍💻 <b>Method:</b> API\n 💰 <b>Updated Balance:</b> <code>₹${nSBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely debited!`;
            sendBotMessage(senderData.telegramUid, sendAlert);
         }
         if(receiverData.telegramUid) {
            const rcvAlert = `<b>💸 Amount Credited Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Sender :</b> <code>${senderData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${amt.toFixed(1)}\n 👩‍💻 <b>Method:</b> API\n 💰 <b>Updated Balance:</b> <code>₹${nRBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely Credited!`;
            sendBotMessage(receiverData.telegramUid, rcvAlert);
         }

         const dObj = new Date(); 
         const tStamp = `${('0'+dObj.getDate()).slice(-2)}-${('0'+(dObj.getMonth()+1)).slice(-2)}-${dObj.getFullYear()} ${('0'+dObj.getHours()).slice(-2)}:${('0'+dObj.getMinutes()).slice(-2)}:${('0'+dObj.getSeconds()).slice(-2)}`;

         const responseData = {
            status: "success",
            message: "Payment successful",
            data: {
               transaction_id: txnId.toUpperCase(),
               amount: amt.toString(),
               receiver: { name: receiverData.name, number: receiverData.phone }
            },
            comment: comment,
            timestamp: tStamp
         };
         responseBox.innerText = JSON.stringify(responseData, null, 2);
      } catch(e) {
         const errorData = {
            status: "failure",
            message: e.message || "Transaction failed"
         };
         responseBox.style.color = 'var(--danger)';
         responseBox.innerText = JSON.stringify(errorData, null, 2);
      }
   };

   window.showCurlCommand = () => {
     if(!currentUserData || !currentUserData.apiToken) return;
     const phone = document.getElementById('testApiPhone').value.trim() || "{number}";
     const amt = document.getElementById('testApiAmount').value || "{amount}";
     const comment = document.getElementById('testApiComment').value.trim() || "{comment}";
     const url = `https://infinity-gateway-solution.web.app/?token=${currentUserData.apiToken}&paytoNumber=${phone}&amount=${amt}&comment=${encodeURIComponent(comment)}`;
     
     const responseBox = document.getElementById('test-api-response');
     responseBox.classList.remove('hidden');
     responseBox.style.color = 'var(--text-main)';
     responseBox.innerText = `curl -X GET "${url}"`;
   };

   window.showToast = (msg, type = 'info') => {
     const c = document.getElementById('toast-container');
     const t = document.createElement('div'); t.className = `toast`;
     let i = type==='success'?'check_circle':type==='error'?'error':'info';
     let cHex = type==='success'?'#059669':type==='error'?'#e11d48':'#0f172a';
     t.innerHTML = `<span class="material-symbols-rounded" style="color:${cHex}; font-size: 20px;">${i}</span> ${msg}`;
     c.appendChild(t); 
     
     // LIVE Swipe to dismiss logic
     let startX = 0; let currentX = 0;
     t.addEventListener('touchstart', e => { 
       startX = e.touches[0].clientX; 
       t.style.transition = 'none'; // Critical for LIVE drag feel
     }, {passive: true});
     t.addEventListener('touchmove', e => {
       currentX = e.touches[0].clientX - startX;
       t.style.transform = `translateX(${currentX}px)`; // Live positional update
       t.style.opacity = 1 - (Math.abs(currentX)/200);
     }, {passive: true});
     t.addEventListener('touchend', e => {
       if (Math.abs(currentX) > 60) {
         t.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s';
         t.style.transform = `translateX(${currentX > 0 ? 100 : -100}%)`;
         t.style.opacity = 0;
         setTimeout(() => t.remove(), 200);
       } else {
         t.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s';
         t.style.transform = `translateX(0)`;
         t.style.opacity = 1;
       }
     });

     setTimeout(() => { 
       if(document.body.contains(t)) {
           t.classList.add('out'); setTimeout(() => { if(document.body.contains(t)) t.remove(); }, 300); 
       }
     }, 3000);
   };

   window.copyText = (text, msg) => {
     if (navigator.clipboard && window.isSecureContext) {
       navigator.clipboard.writeText(text).then(() => showToast(msg, 'success')).catch(() => fallbackCopyTextToClipboard(text, msg));
     } else {
       fallbackCopyTextToClipboard(text, msg);
     }
   };

   function fallbackCopyTextToClipboard(text, msg) {
     var textArea = document.createElement("textarea");
     textArea.value = text;
     textArea.style.top = "0"; textArea.style.left = "0"; textArea.style.position = "fixed";
     document.body.appendChild(textArea); textArea.focus(); textArea.select();
     try {
       var successful = document.execCommand('copy');
       if(successful) showToast(msg, 'success');
       else showToast('Failed to copy', 'error');
     } catch (err) { showToast('Failed to copy', 'error'); }
     document.body.removeChild(textArea);
   }

   window.openSidebar = () => { document.getElementById('sidebar').classList.add('active'); document.getElementById('sidebar-backdrop').classList.add('active'); };
   window.closeSidebar = () => { document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-backdrop').classList.remove('active'); };
   
   window.switchView = (id) => {
     if (id === 'view-add-fund') {
        if (!addFundSettings.upiId || addFundSettings.status !== 'on') {
            document.getElementById('add-fund-configured').classList.add('hidden');
            document.getElementById('add-fund-not-configured').classList.remove('hidden');
        } else {
            document.getElementById('add-fund-not-configured').classList.add('hidden');
            document.getElementById('add-fund-configured').classList.remove('hidden');
        }
     }

     ['view-dashboard','view-pay','view-api','view-profile', 'view-add-fund'].forEach(v => document.getElementById(v).classList.add('hidden'));
     document.getElementById(id).classList.remove('hidden');
     
     if(id === 'view-dashboard') {
        const loader = document.getElementById('dash-loader');
        loader.classList.remove('hidden');
        setTimeout(() => { loader.classList.add('hidden'); }, 1200);
     }

     if(id==='view-pay') { 
       document.getElementById('payPhone').value=''; document.getElementById('payAmount').value=''; document.getElementById('payComment').value=''; updateSummary(); 
     }
   };

   window.openModal = (id) => document.getElementById(id).classList.add('active');
   window.closeModal = (id) => {
     document.getElementById(id).classList.remove('active');
     if(id==='bot-modal'){ document.getElementById('bot-step-1').classList.remove('hidden'); document.getElementById('bot-step-2').classList.add('hidden'); }
     if(id==='withdraw-modal'){
         document.getElementById('withdrawAmount').value = ''; document.getElementById('withdrawUpi').value = '';
         if(document.getElementById('withdraw-tax-info')) document.getElementById('withdraw-tax-info').innerHTML = 'Settlement: <b style="color:var(--obsidian)">₹0.00</b> (Fee: ₹0.00)';
     }
   };

   window.setAmount = (val) => { document.getElementById('payAmount').value = val; updateSummary(); };
   window.updateSummary = () => {
     let p = document.getElementById('payPhone').value; let a = document.getElementById('payAmount').value;
     document.getElementById('sum-phone').innerText = p || '-'; document.getElementById('sum-amt').innerText = a ? `₹ ${a}` : '₹ 0';
     document.getElementById('sum-total').innerText = a ? `₹ ${a}` : '₹ 0';
   };

   window.calcWithdrawTax = () => {
       const amt = parseFloat(document.getElementById('withdrawAmount').value) || 0;
       if(amt > 0) {
           const tax = withdrawSettings.flatTax + (amt * (withdrawSettings.percTax / 100));
           const recv = amt - tax;
           document.getElementById('withdraw-tax-info').innerHTML = `Settlement: <b style="color:var(--obsidian)">₹${recv > 0 ? recv.toFixed(2) : '0.00'}</b> (Fee: ₹${tax.toFixed(2)})`;
       } else {
           document.getElementById('withdraw-tax-info').innerHTML = 'Settlement: <b style="color:var(--obsidian)">₹0.00</b> (Fee: ₹0.00)';
       }
   };

   const maskPhone = (p) => p && p.length >= 10 ? `${p.substring(0,3)}••••${p.substring(p.length-3)}` : p;
   const generateToken = () => Array.from({length:8}, ()=>String.fromCharCode(97+Math.floor(Math.random()*26)+(Math.random()>0.5?-32:0))).join('');

   let touchstartX = 0; let touchendX = 0;
   document.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
   document.addEventListener('touchend', e => {
     // PREVENT SWIPE IF AUTH SCREEN IS VISIBLE
     if (!document.getElementById('auth-screen').classList.contains('hidden')) return;
     touchendX = e.changedTouches[0].screenX;
     if (touchendX < touchstartX - 60) closeSidebar(); 
     if (touchendX > touchstartX + 60 && touchstartX < 30) openSidebar(); 
   }, {passive: true});

   window.switchAuthFlow = (id) => { ['login-card', 'signup-card'].forEach(i => document.getElementById(i).classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); };

   // Firebase Listeners
   onSnapshot(doc(db, "settings", "gateway"), (docSnap) => {
     if(docSnap.exists()) {
       const status = docSnap.data().status || 'on';
       const overlay = document.getElementById('gateway-overlay'); const icon = document.getElementById('gw-icon'); const title = document.getElementById('gw-title'); const desc = document.getElementById('gw-desc');
       if(status === 'on') { overlay.style.display = 'none'; } 
       else {
         overlay.style.display = 'flex';
         if(status === 'off') {
           icon.innerText = 'cloud_off'; title.innerText = 'Network Offline'; desc.innerText = 'The payment protocol is temporarily suspended by the Administrator.';
         } else {
           icon.innerText = 'engineering'; title.innerText = 'System Update'; desc.innerText = 'We are currently upgrading our nodes. Please check back shortly.';
         }
       }
     }
   });

   onSnapshot(doc(db, "settings", "addFund"), (docSnap) => {
     if(docSnap.exists()) {
       addFundSettings = docSnap.data();
       document.getElementById('display-upi-id').innerText = addFundSettings.upiId || 'Not Set';
       if (!document.getElementById('view-add-fund').classList.contains('hidden')) {
            if (!addFundSettings.upiId || addFundSettings.status !== 'on') {
                document.getElementById('add-fund-configured').classList.add('hidden'); document.getElementById('add-fund-not-configured').classList.remove('hidden');
            } else {
                document.getElementById('add-fund-not-configured').classList.add('hidden'); document.getElementById('add-fund-configured').classList.remove('hidden');
            }
       }
     }
   });

   onSnapshot(doc(db, "settings", "withdrawal"), (docSnap) => {
     if(docSnap.exists()) {
       withdrawSettings = { ...withdrawSettings, ...docSnap.data() };
       const wdDesc = document.getElementById('withdraw-modal-desc');
       if(wdDesc) {
           let taxStr = '';
           if(withdrawSettings.flatTax > 0 && withdrawSettings.percTax > 0) taxStr = `₹${withdrawSettings.flatTax} + ${withdrawSettings.percTax}%`;
           else if(withdrawSettings.flatTax > 0) taxStr = `₹${withdrawSettings.flatTax}`;
           else if(withdrawSettings.percTax > 0) taxStr = `${withdrawSettings.percTax}%`;
           else taxStr = `0`;

           wdDesc.innerText = `Limit ₹${withdrawSettings.min} - ₹${withdrawSettings.max}. Withdrawal Tax ${taxStr}. UPI Payouts in 1-24 Hrs.`;
           const amtInput = document.getElementById('withdrawAmount'); if(amtInput) { amtInput.min = withdrawSettings.min; amtInput.max = withdrawSettings.max; }
       }
       window.calcWithdrawTax();
     }
   });

   document.getElementById('signup-form').addEventListener('submit', async (e) => {
     e.preventDefault();
     const email = document.getElementById('reg-email').value.trim();
     if(!email.endsWith('@gmail.com')) return showToast("Only @gmail.com emails allowed", "error");

     const btn = document.getElementById('btn-register'); btn.innerHTML = "Processing..."; btn.disabled = true;
     const p = document.getElementById('reg-phone').value.trim(); const pass = document.getElementById('reg-pass').value;
     
     try {
       const cred = await createUserWithEmailAndPassword(auth, p+dummyDomain, pass);
       await setDoc(doc(db, "users", cred.user.uid), { 
         name: document.getElementById('reg-name').value.trim(), email: email, 
         phone: p, password: pass, balance: 0, totalCredits: 0, telegramUid: null, 
         apiToken: generateToken(), createdAt: Date.now(), isBanned: false, photoURL: null
       });
       showToast("Account Initialized", "success");
     } catch (err) { showToast(err.message.replace('Firebase: ',''), "error"); }
     btn.disabled = false; btn.innerHTML = "Create Account";
   });

   document.getElementById('login-form').addEventListener('submit', async (e) => {
     e.preventDefault();
     const btn = document.getElementById('btn-login'); btn.innerHTML = "Verifying..."; btn.disabled = true;
     try {
       await signInWithEmailAndPassword(auth, document.getElementById('login-phone').value.trim()+dummyDomain, document.getElementById('login-password').value);
       showToast("Access Granted", "success");
     } catch (err) { showToast("Invalid number or password", "error"); }
     btn.disabled = false; btn.innerHTML = "Login";
   });

   onAuthStateChanged(auth, async (user) => {
     if (user) {
       document.getElementById('auth-screen').classList.add('hidden');
       document.getElementById('app-wrapper').classList.remove('hidden');

       const loader = document.getElementById('dash-loader');
       loader.classList.remove('hidden');
       setTimeout(() => { loader.classList.add('hidden'); }, 1200);

       onSnapshot(doc(db, "users", user.uid), (docSnap) => {
         if(docSnap.exists()){
           currentUserData = docSnap.data();

           if (currentUserData.isBanned) { alert("Your access has been revoked."); window.logout(); return; }
           
           document.getElementById('ui-balance').innerText = parseFloat(currentUserData.balance).toFixed(2);
           document.getElementById('ui-phone').innerText = maskPhone(currentUserData.phone);
           document.getElementById('ui-email').innerText = currentUserData.email;
           document.getElementById('ui-total-credit').innerText = parseFloat(currentUserData.totalCredits).toFixed(0);
           const d = new Date(currentUserData.createdAt); 
           const dStr = `${d.getDate()} ${d.toLocaleString('default',{month:'short'})} ${d.getFullYear()}`;
           document.getElementById('ui-date').innerText = dStr;
           
           // Updated Avatar theming to match new style
           const avatarUrl = currentUserData.photoURL ? currentUserData.photoURL : `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserData.name)}&background=0f172a&color=fff&size=128`;
           document.getElementById('header-avatar').src = avatarUrl; document.getElementById('prof-avatar').src = avatarUrl;
           
           // Extract first name for dashboard greeting
           const firstName = currentUserData.name.split(' ')[0];
           document.querySelector('.section-title + h1').innerText = `Hello, ${firstName}`;

           document.getElementById('prof-name').innerHTML = `${currentUserData.name}`;
           document.getElementById('editNameInput').value = currentUserData.name;
           document.getElementById('prof-date').innerText = dStr;

           if(!currentUserData.apiToken) {
             const newToken = generateToken(); updateDoc(doc(db, "users", user.uid), { apiToken: newToken }); currentUserData.apiToken = newToken;
           }
           document.getElementById('api-token-val').innerText = currentUserData.apiToken;
           
           document.getElementById('api-url-display').innerText = `https://infinity-gateway-solution.web.app/?token=${currentUserData.apiToken}&paytoNumber={number}&amount={amount}&comment={comment}`;
         }
       });

       const q = query(collection(db, "transactions"), where("usersInvolved", "array-contains", user.uid));
       onSnapshot(q, (snapshot) => {
         globalTransactions = []; snapshot.forEach(d => globalTransactions.push({id: d.id, ...d.data()}));
         globalTransactions.sort((a,b) => b.timestamp - a.timestamp);
         
         document.getElementById('ui-total-txns').innerText = snapshot.size;
         document.getElementById('ui-total-success').innerText = snapshot.size;

         const list = document.getElementById('ui-txn-list'); list.innerHTML = '';
         if(globalTransactions.length === 0) { list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:14px; background:rgba(255,255,255,0.5); border-radius:16px;">No recent activity.</div>`; return; }

         globalTransactions.slice(0,10).forEach((txn, i) => {
           const isCredit = txn.to === user.uid || txn.type === 'add_fund'; 
           let iconHtml, amtColor, sign, title, statusHtml = '';
           
           if(txn.type === 'withdrawal') { 
             iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">account_balance</span></div>`; 
             amtColor = 'var(--text-main)'; sign='-'; title='UPI Withdraw'; statusHtml = ''; 
           } else if(txn.type === 'add_fund') {
             iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">add</span></div>`;
             amtColor = '#059669'; sign='+'; title='Deposit Cleared'; 
             statusHtml = `<div style="color:var(--text-muted); font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; justify-content:flex-end;">Success</div>`;
           } else { 
             const name = isCredit?(txn.senderName||'User'):(txn.receiverName||'User');
             iconHtml = `<div class="txn-icon" style="color:var(--obsidian);"><span class="material-symbols-rounded">${isCredit ? 'south_west' : 'north_east'}</span></div>`;
             amtColor = isCredit ? '#059669' : 'var(--text-main)'; sign = isCredit?'+':'-'; title = isCredit?`From ${name}`:`To ${name}`; 
             statusHtml = `<div style="color:var(--text-muted); font-size:12px; font-weight:600; display:flex; align-items:center; gap:4px; justify-content:flex-end;">Success</div>`;
           }
           const dateStr = new Date(txn.timestamp).toLocaleString('en-US', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'});
           
           list.innerHTML += `<div class="txn-row" onclick="openTxnDetails(${i})">
             <div class="txn-left">${iconHtml}<div class="txn-info"><h4>${title}</h4><p>${dateStr}</p></div></div>
             <div class="txn-right">
               <div class="txn-amt" style="color:${amtColor}">${sign}₹${parseFloat(txn.amount).toFixed(2)}</div>
               ${statusHtml}
             </div>
           </div>`;
         });
       });
     } else {
       document.getElementById('auth-screen').classList.remove('hidden'); document.getElementById('app-wrapper').classList.add('hidden');
       switchAuthFlow('login-card');
     }
   });

   window.saveProfileName = async () => {
     const newName = document.getElementById('editNameInput').value.trim();
     const fileInput = document.getElementById('editPhotoInput'); const file = fileInput.files[0];
     if(!newName) return showToast("Name cannot be empty", "error");
     
     const btn = document.getElementById('btn-save-prof'); if(btn) { btn.innerText = "Saving..."; btn.disabled = true; }
     
     try { 
       let updateData = { name: newName };
       if (file) {
         const base64Img = await new Promise((resolve) => {
           const reader = new FileReader();
           reader.onload = (e) => {
             const img = new Image();
             img.onload = () => {
               const canvas = document.createElement('canvas'); const MAX_SIZE = 256; 
               let width = img.width; let height = img.height;
               if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
               else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
               canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
               resolve(canvas.toDataURL('image/jpeg', 0.8));
             };
             img.src = e.target.result;
           };
           reader.readAsDataURL(file);
         });
         updateData.photoURL = base64Img;
       }
       await updateDoc(doc(db, "users", auth.currentUser.uid), updateData); 
       showToast("Profile Updated", "success"); closeModal('edit-profile-modal'); 
     } 
     catch(e) { showToast("Update failed: " + e.message, "error"); }
     if(btn) { btn.innerText = "Save Changes"; btn.disabled = false; }
   };
   
   window.resetProfilePic = async () => {
      try {
          await updateDoc(doc(db, "users", auth.currentUser.uid), { photoURL: null }); document.getElementById('editPhotoInput').value = '';
          showToast("Avatar removed", "success"); closeModal('edit-profile-modal');
      } catch(e) { showToast("Error removing avatar", "error"); }
   };

   const sendBotMessage = async (tgId, text, reply_markup = null) => {
     try {
       const body = { chat_id: tgId, text: text, parse_mode: "HTML" }; if(reply_markup) body.reply_markup = reply_markup;
       await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
     } catch (e) {}
   };

   window.handleFundRequest = async () => {
     const amt = parseFloat(document.getElementById('addFundAmount').value); const utr = document.getElementById('addFundUtr').value.trim();
     if(isNaN(amt) || amt <= 0) return showToast("Enter a valid amount.", "error"); if(utr.length < 6) return showToast("Enter a valid 12-digit reference.", "error"); 
     const btn = document.getElementById('btn-submit-fund'); btn.innerText = "Initiating..."; btn.disabled = true;

     try {
       const docRef = doc(collection(db, "fund_requests"));
       await setDoc(docRef, { uid: auth.currentUser.uid, name: currentUserData.name, phone: currentUserData.phone, amount: amt, utr: utr, status: "pending", timestamp: Date.now() });
       showToast("Deposit request broadcasted!", "success"); document.getElementById('addFundAmount').value = ''; document.getElementById('addFundUtr').value = ''; switchView('view-dashboard');
     } catch(e) { showToast("Error submitting request", "error"); }
     btn.innerHTML = `Confirm Deposit`; btn.disabled = false;
   };

   window.handlePayUser = async () => {
     const phone = document.getElementById('payPhone').value.trim(); const amt = parseFloat(document.getElementById('payAmount').value); const comment = document.getElementById('payComment').value.trim();
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

       if(currentUserData.telegramUid) { const sendAlert = `<b>💸 Amount Sent Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Receiver :</b> <code>${tData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${amt.toFixed(1)}\n 👩‍💻 <b>Method:</b> P2P\n 💰 <b>Updated Balance:</b> <code>₹${nSBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely debited!`; sendBotMessage(currentUserData.telegramUid, sendAlert); }
       if(tData.telegramUid) { const rcvAlert = `<b>💸 Amount Credited Successfully</b>\n━━━━━━━━━━━━━━━━━━\n 🆔 <b>Sender :</b> <code>${currentUserData.phone}</code>\n ⚡️ <b>Amount:</b> ₹${amt.toFixed(1)}\n 👩‍💻 <b>Method:</b> P2P\n 💰 <b>Updated Balance:</b> <code>₹${nRBal.toFixed(1)}</code>\n━━━━━━━━━━━━━━━━━━\n🚀 Payment has been securely Credited!`; sendBotMessage(tData.telegramUid, rcvAlert); }

       if (tData.photoURL) {
         document.getElementById('succ-icon-container').style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 25px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:white; border:3px solid var(--obsidian); padding:4px;';
         document.getElementById('succ-icon-container').innerHTML = `<img src="${tData.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
       } else {
         document.getElementById('succ-icon-container').style.cssText = 'width:80px; height:80px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 25px auto; box-shadow:0 10px 30px rgba(0,0,0,0.15); background:var(--obsidian); color:white; border:4px solid white; padding:0;';
         document.getElementById('succ-icon-container').innerHTML = `<span class="material-symbols-rounded" style="font-size:40px;">done</span>`;
       }

       // Split values logically matching the updated success-modal rows
       document.getElementById('succ-name').innerText = tData.name; 
       document.getElementById('succ-wallet').innerText = phone;
       document.getElementById('succ-amt').innerText = `₹${amt}`; 
       document.getElementById('succ-id').innerText = savedId.toUpperCase();
       
       switchView('view-dashboard'); openModal('success-modal');
     } catch (e) { showToast(e.message, "error"); }
     btn.innerHTML = "Pay Now"; btn.disabled = false;
   };

   window.openTxnDetails = (index) => {
     const txn = globalTransactions[index]; const isCredit = txn.to === auth.currentUser.uid || txn.type === 'add_fund';
     let title, amtSign, amtColor, notes, method;
     
     const ribbonBg = document.getElementById('dtl-ribbon-bg'); const ribbonIcon = document.getElementById('dtl-ribbon-icon');
     const statusPill = document.getElementById('dtl-status-pill'); const statusIconBg = document.getElementById('dtl-status-icon-bg');

     if(txn.type === 'withdrawal') { 
       title = `Withdraw`; amtSign = '-'; amtColor = 'var(--text-main)'; method = 'Bank Routing'; notes = `Destination: ${txn.upiId || 'N/A'}`; 
       document.getElementById('dtl-notes-container').innerHTML = `<div style="font-size: 11px; color: #64748b; font-weight: 500; margin-bottom: 2px;">Notes</div><div id="dtl-notes" style="font-size: 13px; font-weight: 500; color: #000;">${notes}</div>`;
     } else if(txn.type === 'add_fund') {
       title = `Deposit Cleared`; amtSign = '+'; amtColor = '#059669'; method = 'Network Deposit'; notes = `Verified on-chain`;
       document.getElementById('dtl-notes-container').innerHTML = `<div style="font-size: 11px; color: #64748b; font-weight: 500; margin-bottom: 2px;">Notes</div><div id="dtl-notes" style="font-size: 13px; font-weight: 500; color: #000;">${notes}</div>`;
     } else { 
       const cName = isCredit ? (txn.senderName||'User') : (txn.receiverName||'User');
       title = isCredit ? `Received from ${cName}` : `Sent to ${cName}`;
       amtSign = isCredit ? '+' : '-'; amtColor = isCredit ? '#059669' : 'var(--text-main)'; method = txn.type === 'api_transfer' ? 'API Request' : 'P2P Transfer'; 
       
       // Replaces Notes with a structured Account and Wallet view for accurate separation
       document.getElementById('dtl-notes-container').innerHTML = `
         <div style="display: flex; justify-content: space-between; width: 100%;">
           <div>
             <div style="font-size: 11px; color: #64748b; font-weight: 500; margin-bottom: 2px;">Account</div>
             <div style="font-size: 13px; font-weight: 600; color: #000;">${cName}</div>
           </div>
           <div style="text-align: right;">
             <div style="font-size: 11px; color: #64748b; font-weight: 500; margin-bottom: 2px;">Wallet</div>
             <div style="font-size: 13px; font-weight: 600; color: #000;">${isCredit ? maskPhone(txn.senderPhone) : maskPhone(txn.receiverPhone)}</div>
           </div>
         </div>`;
     }
     
     document.getElementById('dtl-title').innerHTML = title;
     const d = new Date(txn.timestamp);
     document.getElementById('dtl-date').innerText = `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
     document.getElementById('dtl-amt').innerText = `${amtSign}₹${parseFloat(txn.amount).toFixed(2)}`; document.getElementById('dtl-amt').style.color = amtColor;
     document.getElementById('dtl-id').innerText = txn.id.toUpperCase(); document.getElementById('dtl-method').innerText = method; 
     document.getElementById('dtl-bal').innerText = txn.balanceAfter !== undefined ? `₹${parseFloat(txn.balanceAfter).toFixed(2)}` : 'N/A';
     document.getElementById('dtl-comment').innerText = txn.comment ? txn.comment : "None";
     openModal('txn-details-modal');
   };

   window.handleWithdraw = async () => {
     const amt = parseFloat(document.getElementById('withdrawAmount').value); const upi = document.getElementById('withdrawUpi').value.trim();
     if(isNaN(amt) || amt < withdrawSettings.min || amt > withdrawSettings.max) return showToast(`Limits: ₹${withdrawSettings.min} - ₹${withdrawSettings.max}.`, "error");
     if(!upi) return showToast("Please enter a valid destination.", "error");
     const tax = withdrawSettings.flatTax + (amt * (withdrawSettings.percTax / 100)); const payable = amt - tax;
     if (payable <= 0) return showToast("Amount too low after fees.", "error");
     const btn = document.getElementById('btn-withdraw'); btn.innerText = "Processing..."; btn.disabled = true;

     try {
       let wId = null;
       await runTransaction(db, async (t) => {
         const uRef = doc(db, "users", auth.currentUser.uid); const uDoc = await t.get(uRef);
         if(uDoc.data().balance < amt) throw new Error("Insufficient liquidity.");
         const nBal = uDoc.data().balance - amt; t.update(uRef, { balance: nBal }); const wRef = doc(collection(db, "withdrawals")); wId = wRef.id;
         t.set(wRef, { uid: auth.currentUser.uid, name: currentUserData.name, phone: currentUserData.phone, upiId: upi, amount: amt, tax: tax, payable: payable, status: "pending", timestamp: Date.now() });
         const txnRef = doc(collection(db, "transactions")); t.set(txnRef, { type: "withdrawal", from: auth.currentUser.uid, to: "admin", amount: amt, balanceAfter: nBal, status: "pending", timestamp: Date.now(), usersInvolved: [auth.currentUser.uid], upiId: upi });
       });
       showToast("UPI Withdrawal Sent For Approval!", "success"); closeModal('withdraw-modal'); 
     } catch(e) { showToast(e.message, "error"); }
     btn.innerText = "Confirm Withdrawal"; btn.disabled = false;
   };

   window.sendTelegramOTP = async () => {
     if(currentUserData.telegramUid) return showToast("Already connected.", "error");
     const tgId = document.getElementById('botTgId').value.trim(); if(!tgId) return showToast("Enter Telegram Chat ID.", "error");
     const btn = document.getElementById('btn-send-otp'); btn.innerText = "Transmitting..."; generatedOTP = Math.floor(1000 + Math.random() * 9000).toString(); pendingTgId = tgId;
     const otpMsg = `<b>✅ Verification Token</b>\n━━━━━━━━━━━━━━━━━━\n🔐 <b>OTP =</b> <code>${generatedOTP}</code>\nProvide this code in the app to establish webhook link.\n━━━━━━━━━━━━━━━━━━\n⚡️ Powered by INFINITY Gateway`;
     
     try {
       await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: tgId, text: otpMsg, parse_mode: "HTML" }) }).then(r=>r.json()).then(d=>{
         if(d.ok) { document.getElementById('bot-step-1').classList.add('hidden'); document.getElementById('bot-step-2').classList.remove('hidden'); showToast("Token Sent!", "success"); } else showToast("Start the Bot first.", "error");
       });
     } catch (e) { showToast("Connection Error.", "error"); }
     btn.innerText = "Send OTP";
   };
   
   window.verifyOTP = async () => {
     if(document.getElementById('botOtpInput').value.trim() !== generatedOTP) return showToast("Invalid Code.", "error");
     try { await setDoc(doc(db, "users", auth.currentUser.uid), { telegramUid: pendingTgId }, { merge: true }); showToast("Webhooks Established!", "success"); closeModal('bot-modal'); } catch(e) { showToast("System Error.", "error"); }
   };

   window.logout = () => {
     signOut(auth).then(() => {
       document.getElementById('app-wrapper').classList.add('hidden'); document.getElementById('auth-screen').classList.remove('hidden'); switchAuthFlow('login-card'); closeSidebar(); document.querySelectorAll('input').forEach(i => i.value = ''); showToast("Logout Successful", "success");
     }).catch((e) => showToast(e.message, "error"));
   };
}
