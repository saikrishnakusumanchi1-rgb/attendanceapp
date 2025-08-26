(async function(){
  function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js');
  await loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js');

  const cfgResp = await fetch('/firebaseConfig.json').catch(()=>null);
  let firebaseConfig = null;
  if(cfgResp && cfgResp.ok){
    firebaseConfig = await cfgResp.json();
  } else {
    firebaseConfig = {"apiKey":"YOUR_API_KEY","authDomain":"attendanceuhe-aabaa.firebaseapp.com","projectId":"attendanceuhe-aabaa","storageBucket":"attendanceuhe-aabaa.appspot.com","messagingSenderId":"YOUR_MESSAGING_SENDER_ID","appId":"YOUR_APP_ID"};
  }

  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const root = document.getElementById('root');
  function render(html){ root.innerHTML = html; }

  function showLogin(errMsg){
    render(`
      <div class="container">
        <div class="card" style="max-width:420px;margin:40px auto;">
          <h2>Coordinator Login</h2>
          <input id="email" class="input" placeholder="Email" style="margin-bottom:8px;" />
          <input id="password" type="password" class="input" placeholder="Password" style="margin-bottom:8px;" />
          <div style="display:flex;gap:8px"><button id="loginBtn" class="btn">Login</button></div>
          <div id="err" style="color:red;margin-top:8px;">${errMsg||''}</div>
          <div style="margin-top:12px;font-size:13px;color:#555">Add coordinators in Firebase Console → Authentication → Add user</div>
        </div>
      </div>
    `);
    document.getElementById('loginBtn').onclick = async ()=>{
      const email = document.getElementById('email').value;
      const pass = document.getElementById('password').value;
      try{ await auth.signInWithEmailAndPassword(email, pass); initApp(); }catch(e){ showLogin('Login failed: ' + e.message); }
    };
  }

  function fmtDate(d){ return new Date(d).toISOString().split('T')[0]; }

  async function initApp(){
    const user = auth.currentUser;
    if(!user) return showLogin();
    render(`
      <div class="container">
        <div class="header">
          <div><h1>Coordinator Dashboard</h1><div style="color:#555">Logged in: ${user.email}</div></div>
          <div><button id="logout" class="btn secondary">Logout</button></div>
        </div>
        <div class="tabs">
          <button id="tabStudents" class="btn">Students</button>
          <button id="tabAttendance" class="btn">Attendance</button>
          <button id="tabReports" class="btn">Reports</button>
        </div>
        <div id="content" class="card"></div>
      </div>
    `);
    document.getElementById('logout').onclick = async ()=>{ await auth.signOut(); showLogin(); };
    document.getElementById('tabStudents').onclick = showStudents;
    document.getElementById('tabAttendance').onclick = showAttendance;
    document.getElementById('tabReports').onclick = showReports;
    showStudents();
  }

  async function showStudents(){
    const content = document.getElementById('content');
    content.innerHTML = '<h3>Students</h3><div id="studentsArea">Loading...</div>';
    const snapshot = await db.collection('students').orderBy('class_year').get();
    const students = snapshot.docs.map(d=>({id:d.id,...d.data()}));
    let html = '<div style="display:flex;gap:8px;margin-bottom:12px;"><input id="sname" class="input" placeholder="Name" /><input id="sclass" class="input" placeholder="Class/Year" /><button id="addBtn" class="btn">Add</button></div>';
    html += '<table><thead><tr><th>Name</th><th>Class</th><th>Action</th></tr></thead><tbody>';
    for(const s of students){ html += `<tr><td>${s.name}</td><td>${s.class_year||''}</td><td><button data-id="${s.id}" class="delBtn btn secondary">Delete</button></td></tr>`; }
    html += '</tbody></table>';
    document.getElementById('studentsArea').innerHTML = html;
    document.getElementById('addBtn').onclick = async ()=>{ const name = document.getElementById('sname').value.trim(); const klass = document.getElementById('sclass').value.trim(); if(!name||!klass) return alert('Enter name and class'); await db.collection('students').add({name, class_year:klass}); showStudents(); };
    Array.from(document.getElementsByClassName('delBtn')).forEach(b=>{ b.onclick = async ()=>{ if(!confirm('Delete?')) return; await db.collection('students').doc(b.dataset.id).delete(); showStudents(); }; });
  }

  async function showAttendance(){
    const content = document.getElementById('content');
    content.innerHTML = '<h3>Attendance</h3><div id="attArea">Loading...</div>';
    const snap = await db.collection('students').orderBy('class_year').get();
    const students = snap.docs.map(d=>({id:d.id,...d.data()}));
    let html = '<table><thead><tr><th>Name</th><th>Class</th><th>Status</th><th>Reason</th></tr></thead><tbody>';
    for(const s of students){ html += `<tr><td>${s.name}</td><td>${s.class_year||''}</td><td><select id="st_${s.id}"><option value="">--</option><option value="Present">Present</option><option value="Late">Late</option><option value="Absent">Absent</option></select></td><td><input id="rs_${s.id}" class="input" placeholder="Reason" /></td></tr>`; }
    html += '</tbody></table><div style="margin-top:12px;"><button id="saveAtt" class="btn">Save Attendance</button></div>';
    document.getElementById('attArea').innerHTML = html;
    document.getElementById('saveAtt').onclick = async ()=>{ const entries = []; const today = fmtDate(new Date()); for(const s of students){ const status = document.getElementById('st_'+s.id).value; const reason = document.getElementById('rs_'+s.id).value; if(!status) continue; if(status==='Absent' && (!reason||reason.trim()==='')) { alert('Provide reason for absent: '+s.name); return; } const points = status==='Present'?2:status==='Late'?1:0; entries.push({ studentId: s.id, studentName: s.name, date: today, status, points, reason, markedBy:{uid:auth.currentUser.uid, email:auth.currentUser.email}, createdAt: new Date().toISOString() }); }
      if(entries.length===0) return alert('No attendance selected');
      for(const e of entries){ await db.collection('attendance').add(e); }
      alert('Saved '+entries.length+' entries. An Excel will be downloaded.');
      const rows = entries.map(en=>({Date:en.date,Student:en.studentName,Status:en.status,Points:en.points,Reason:en.reason,MarkedBy:en.markedBy.email}));
      const csv = [Object.keys(rows[0]).join(',')].concat(rows.map(r=>Object.values(r).map(v=>`"${String(v||'')}"`).join(','))).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='attendance_export.csv'; a.click(); URL.revokeObjectURL(url);
    };
  }

  async function showReports(){
    const content = document.getElementById('content');
    content.innerHTML = '<h3>Reports</h3><div id="repArea">Loading...</div>';
    const snap = await db.collection('attendance').orderBy('date').get();
    const rows = snap.docs.map(d=>d.data());
    const byDate = {}; const byStudent = {}; const counts = {Present:0, Late:0, Absent:0};
    rows.forEach(r=>{ byDate[r.date] = (byDate[r.date]||0) + (r.points||0); byStudent[r.studentName] = (byStudent[r.studentName]||0) + (r.points||0); counts[r.status] = (counts[r.status]||0) + 1; });
    let html = '<h4>Weekly Points (by date)</h4><pre>'+JSON.stringify(byDate,null,2)+'</pre>';
    html += '<h4>Student Points</h4><pre>'+JSON.stringify(byStudent,null,2)+'</pre>';
    html += '<h4>Attendance Counts</h4><pre>'+JSON.stringify(counts,null,2)+'</pre>';
    document.getElementById('repArea').innerHTML = html;
  }

  auth.onAuthStateChanged(user => { if(user) initApp(); else showLogin(); });

})();