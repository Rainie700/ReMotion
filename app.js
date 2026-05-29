const app = document.getElementById("app");

const BASE_TABS = [
  { key: "home", off: "/images/home.png", on: "/images/home_selected.png", label: "首頁" },
  { key: "data", off: "/images/data.png", on: "/images/data_selected.png", label: "數據" },
  { key: "profile", off: "/images/profile.png", on: "/images/profile_selected.png", label: "我的" },
];

const state = {
  route: "splash",
  tab: "home",
  user: null,
  users: JSON.parse(localStorage.getItem("remotion_users") || "[]"),
};

const mockUsers = [
  { account: "patient01", password: "123456", role: "patient", name: "黃小謙" },
  { account: "therapist01", password: "123456", role: "therapist", name: "邱大壯" },
];

if (!state.users.length) {
  state.users = mockUsers;
  localStorage.setItem("remotion_users", JSON.stringify(state.users));
}

const remembered = localStorage.getItem("remotion_session");
if (remembered) {
  state.user = JSON.parse(remembered);
  state.route = "dashboard";
}

function setSession(user) {
  state.user = user;
  localStorage.setItem("remotion_session", JSON.stringify(user));
  state.route = "dashboard";
  render();
}

function logout() {
  localStorage.removeItem("remotion_session");
  state.user = null;
  state.route = "auth";
  state.tab = "home";
  render();
}

function phone(content, withNav = false) {
  return `
    <main class="phone">
      <section class="content">${content}</section>
      ${withNav ? renderNav() : ""}
    </main>
  `;
}

function renderNav() {
  const midTab = state.user?.role === "therapist"
    ? { key: "work", off: "/images/files.png", on: "/images/files_selected.png", label: "檔案" }
    : { key: "work", off: "/images/train.png", on: "/images/train_selected.png", label: "訓練" };
  const tabs = [BASE_TABS[0], midTab, BASE_TABS[1], BASE_TABS[2]];

  return `
    <nav class="bottom-nav">
      ${tabs
        .map((v) => {
          const key = v.key;
          const active = state.tab === key;
          return `
          <button class="tab-btn ${active ? "active" : ""}" onclick="switchTab('${key}')">
            <img src="${active ? v.on : v.off}" alt="${v.label}" />
            <span>${v.label}</span>
          </button>`;
        })
        .join("")}
    </nav>
  `;
}

function renderSplash() {
  return phone(`
    <div class="splash">
      <img class="hero-img" src="/images/image_1.png" alt="ReMotion 啟動畫面" />
      <h1 class="title">ReMotion</h1>
      <p class="subtitle">為你的復健旅程提供專屬 AI 陪伴</p>
      <button class="btn btn-primary" onclick="goAuth()">開始使用</button>
    </div>
  `);
}

//登入註冊
function renderAuth() {
  return phone(`
    <div class="auth">
      <h2>登入 / 註冊</h2>
      <p class="small">首次可先註冊。範例帳密：patient01 / 123456，therapist01 / 123456</p>
      <div class="card">
        <h3>登入</h3>
        <input id="loginAccount" placeholder="帳號" />
        <div style="height:8px"></div>
        <input id="loginPassword" type="password" placeholder="密碼" />
        <div style="height:10px"></div>
        <button class="btn btn-primary" style="width:100%" onclick="login()">登入</button>
      </div>
      <div class="card">
        <h3>註冊</h3>
        <input id="regName" placeholder="姓名" />
        <div style="height:8px"></div>
        <input id="regAccount" placeholder="帳號" />
        <div style="height:8px"></div>
        <input id="regPassword" type="password" placeholder="密碼" />
        <div style="height:8px"></div>
        <select id="regRole">
          <option value="patient">患者</option>
          <option value="therapist">復健師</option>
        </select>
        <div style="height:10px"></div>
        <button class="btn btn-light" style="width:100%" onclick="register()">註冊</button>
      </div>
    </div>
  `);
}

//患者主畫面
function patientHome() {
  return `
    <div class="top-profile-container">
      
      <div class="header">
        <h1 class="page-title">Re<span class="logo-dark">Motion</span></h1>
        <div class="top-actions">
          <img class="icon" src="/images/notice.png" alt="通知" />
        </div>
      </div>

      <div class="user-row">
        <div class="avatar">${state.user.name[0]}</div>
        <div class="user-info">
          <strong>${state.user.name} 👋</strong><br />
          <small class="small">一起持續進步吧！</small>
        </div>
        <div class="top-right-icon">
          </div>
      </div>

    </div>

    <div class="section-header">
      <h3 class="section-title">今日訓練計畫</h3>
      <span class="ai-tag">AI 智能推薦</span>
    </div>
    
    <div class="train-card-group">
      
      <div class="train-item-row" onclick="goSquatDetail()">
        <img class="train-img" src="/images/trainpic1.png" alt="深蹲訓練" />
        <div class="train-info">
          <b class="train-name">深蹲訓練</b>
          <div class="train-meta">3組 x 15次</div>
          <div class="train-desc">強化下肢力量</div>
        </div>
        <div class="train-right-status">
          <span class="pill active-status">進行中</span>
          
        </div>
      </div>
      
      <div class="train-item-row">
        <img class="train-img" src="/images/trainpic2.png" alt="手臂伸展訓練" />
        <div class="train-info">
          <b class="train-name">手臂伸展訓練</b>
          <div class="train-meta">2組 x 30秒</div>
          <div class="train-desc">增加肩關節活動度</div>
        </div>
        <div class="train-right-status">
          <span class="pill pending">待開始</span>
        </div>
      </div>

    </div>

    <h3 class="section-title">AI 分析建議</h3>
    <div class="ai-box">
      <div class="ai-content">
        <img src="/images/ai_robot.png" alt="AI 助手" class="ai-avatar" />
        
        <p class="ai-text">
          建議降低膝蓋負擔，並加強核心訓練，有助於提升穩定性！
        </p>
      </div>
    </div>

    <div class="section-header">
      <h3 class="section-title">本週進度</h3>
      <span class="more-link" onclick="switchTab('data')">查看詳情 &gt;</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_count.png" alt="次數" />
          <span>訓練次數</span>
        </div>
        <div class="stat-value">
          <span class="num-big">5</span><span class="num-small">/7 次</span>
        </div>
      </div>
      
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_time.png" alt="時間" />
          <span>總訓練時間</span>
        </div>
        <div class="stat-value">
          <span class="num-big">125</span><span class="num-small"> 分鐘</span>
        </div>
      </div>
      
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_cal.png" alt="熱量" />
          <span>消耗熱量</span>
        </div>
        <div class="stat-value">
          <span class="num-big">620</span><span class="num-small"> 大卡</span>
        </div>
      </div>
    </div>
    <button class="btn btn-primary full" onclick="switchTab('work')">開始訓練 →</button>
    
  `;
}
//患者主畫面（動態版，暫時保留靜態版測試）
// function patientHome() {
//   // 1. 先把動態的訓練計畫資料轉成 HTML 字串（假設你的 state.todayPlans 是一個陣列）
//   // 如果目前沒資料，就先用你原本的預設資料當備用
//   const plans = state.todayPlans || [
//     { id: 1, title: '深蹲訓練', detail: '3組 x 15次', status: '進行中', statusClass: 'active-status', onClick: 'goSquatDetail()' },
//     { id: 2, title: '手臂伸展訓練', detail: '2組 x 30秒', status: '待開始', statusClass: 'pending', onClick: '' }
//   ];

//   // 把資料陣列 map 成 HTML
//   const planItemsHtml = plans.map(plan => `
//     <div class="train-item" onclick="${plan.onClick || ''}">
//       <img src="/images/image_1.png" alt="${plan.title}" />
//       <div class="train-info">
//         <b>${plan.title}</b>
//         <div class="small">${plan.detail}</div>
//       </div>
//       <span class="pill ${plan.statusClass}">${plan.status}</span>
//       <button class="delete-plan-btn" onclick="deletePlan(${plan.id}, event)">×</button>
//     </div>
//   `).join('');

//   // 2. 回傳整個頁面的 HTML
//   return `
//     <div class="header">
//       <h1 class="page-title">ReMotion</h1>
//       <div class="top-actions">
//         <img class="icon" src="/images/notice.png" alt="通知" />
//       </div>
//     </div>

//     <div class="user-row">
//       <div class="avatar">${state.user.name[0]}</div>
//       <div class="user-info">
//         <strong>${state.user.name} 👋</strong><br />
//         <small class="small">一起持續進步吧！</small>
//       </div>
//     </div>

//     <div class="section-header">
//       <h3 class="section-title">今日訓練計畫</h3>
//       <button class="add-plan-btn" onclick="openAddPlanModal()">+ 新增</button>
//     </div>
    
//     <div class="train-list">
//       ${planItemsHtml}
//     </div>

//     <h3 class="section-title">AI 分析建議</h3>
//     <div class="ai-box">
//       建議降低膝蓋負擔，並加強核心訓練，有助於提升穩定性！
//     </div>

//     <h3 class="section-title">本週進度</h3>
//     <div class="stats">
//       <div class="stat"><b>5/7</b><span class="small">次數</span></div>
//       <div class="stat"><b>125</b><span class="small">分鐘</span></div>
//       <div class="stat"><b>620</b><span class="small">卡路里</span></div>
//     </div>
    
//     <button class="btn btn-primary full" onclick="switchTab('work')">開始訓練 →</button>
    
//     <div class="card muted center" style="height:100px; display:flex; align-items:center; justify-content:center;">
//       ( 向下捲動測試內容 )
//     </div>
//   `;
// }

//復健師主畫面
function therapistHome() {
  return `
    <div class="header">
      <h1 class="page-title">ReMotion</h1>
      <img class="icon" src="/images/notice.png" alt="通知" />
    </div>
    <div class="user-row">
      <div class="avatar">${state.user.name[0]}</div>
      <div>
        <strong>${state.user.name} 復健師</strong><br />
        <small class="small">專業守護每一步進步</small>
      </div>
    </div>

    <div class="card">
      <b>個案列表</b>
      <div class="small">今日待辦：3，通知：3</div>
    </div>
    <h3 class="section-title">追蹤中的個案</h3>
    <div class="coach-list">
      <div class="train-item"><img src="/images/image_1.png" alt="" /><div><b>黃小謙</b><div class="small">膝關節術後復健</div></div><span class="pill">進步中</span></div>
      <div class="train-item"><img src="/images/image_1.png" alt="" /><div><b>陳小莉</b><div class="small">肩關節活動訓練</div></div><span class="pill">需調整</span></div>
      <div class="train-item"><img src="/images/image_1.png" alt="" /><div><b>林阿姨</b><div class="small">下肢肌力訓練</div></div><span class="pill">穩定中</span></div>
    </div>
    <h3 class="section-title">個案分析（黃小謙）</h3>
    <div class="stats">
      <div class="stat"><span class="small">動作正確率</span><b>82%</b></div>
      <div class="stat"><span class="small">訓練次數</span><b>12</b></div>
      <div class="stat"><span class="small">總時長</span><b>125</b></div>
    </div>
  `;
}
//訓練頁面
function trainPage() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">訓練</h1>
        <div class="small">早安，${state.user.name} 👋</div>
      </div>
      <img class="icon" src="/images/notice.png" alt="通知" />
    </div>
    <div class="train-item" onclick="goSquatDetail()">
      <img src="/images/image_1.png" alt="膝蓋復健訓練" />
      <div><b>膝蓋復健訓練</b><div class="small">初階，15 分鐘</div></div>
      <span class="pill">開始訓練</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="肩膀活動訓練" />
      <div><b>肩膀活動訓練</b><div class="small">初階，12 分鐘</div></div>
      <span class="pill">開始訓練</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="手臂肌力訓練" />
      <div><b>手臂肌力訓練</b><div class="small">初階，10 分鐘</div></div>
      <span class="pill">開始訓練</span>
    </div>
  `;
}

//復健師檔案頁面
function therapistFilesPage() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">檔案</h1>
        <div class="small">個案報告與訓練紀錄管理</div>
      </div>
      <img class="icon" src="/images/files.png" alt="檔案" />
    </div>
    <h3 class="section-title">最新檔案</h3>
    <div class="train-item">
      <img src="/images/image_1.png" alt="黃小謙每週報告" />
      <div>
        <b>黃小謙_每週復健報告.pdf</b>
        <div class="small">更新：今天 10:30</div>
      </div>
      <span class="pill active-status">已同步</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="陳小莉動作評估" />
      <div>
        <b>陳小莉_動作評估紀錄.docx</b>
        <div class="small">更新：昨天 16:20</div>
      </div>
      <span class="pill pending">待審核</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="林阿姨訓練回饋" />
      <div>
        <b>林阿姨_訓練回饋單.xlsx</b>
        <div class="small">更新：04/30 14:40</div>
      </div>
      <span class="pill active-status">完成</span>
    </div>
    <div class="card">
      <b>檔案提醒</b>
      <div class="small">目前有 2 份個案檔案待你確認。</div>
    </div>
  `;
}
//訓練內部細節頁面
function squatDetailPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="backToTrain()">返回</button>
      <b>深蹲訓練</b>
      <img class="icon" src="/images/data.png" alt="設定" />
    </div>
    <img class="demo-shot" src="/images/image_1.png" alt="深蹲動作偵測" />
    <div class="row" style="margin-top:10px;">
      <div class="card" style="flex:1"><div class="small">次數</div><b>12 / 15</b></div>
      <div class="card" style="flex:1"><div class="small">時間</div><b>00:28</b></div>
      <div class="card" style="flex:1"><div class="small">大卡</div><b>98</b></div>
    </div>
    <div class="card" style="margin-top:10px">
      <b>膝蓋彎曲角度偏小</b>
      <div class="small">建議下蹲再低一點，保持膝蓋與腳尖同向。</div>
    </div>
    <button class="btn btn-primary" style="width:100%; margin-top:10px;">動作正確</button>
  `;
}

//數據頁面
function dataPage() {
  return `
    <div class="header">
      <div><h1 class="page-title">我的數據</h1><div class="small">5/12 - 5/18</div></div>
      <img class="icon" src="/images/calendar.png" alt="日曆" />
    </div>
    <div class="stats">
      <div class="stat"><span class="small">訓練次數</span><b>5</b><span class="small">次</span></div>
      <div class="stat"><span class="small">訓練時間</span><b>125</b><span class="small">分鐘</span></div>
      <div class="stat"><span class="small">消耗熱量</span><b>620</b><span class="small">大卡</span></div>
    </div>
    <h3 class="section-title">訓練趨勢</h3>
    <div class="line"></div>
    <h3 class="section-title">AI 建議</h3>
    <div class="card">
      <div class="small">你的膝蓋穩定度進步很多，建議增加訓練強度以提升恢復效果。</div>
    </div>
  `;
}

//個人資料頁面
function profilePage() {
  return `
    <div class="center">
      <div class="avatar" style="margin: 12px auto 8px;">${state.user.name[0]}</div>
      <h2>${state.user.name}</h2>
      <p class="muted">角色：${state.user.role === "patient" ? "患者" : "復健師"}</p>
    </div>
    <div class="card">
      <div>帳號：${state.user.account}</div>
      <div class="small">此示範版僅先完成介面與流程串接。</div>
    </div>
    <div style="height:10px"></div>
    <button class="btn btn-light" style="width:100%" onclick="logout()">登出</button>
  `;
}

//主畫面（根據不同角色與選單顯示不同內容）
function renderDashboard() {
  const body = state.tab === "home"
    ? state.user.role === "patient" ? patientHome() : therapistHome()
    : state.tab === "work"
      ? state.user.role === "patient" ? trainPage() : therapistFilesPage()
      : state.tab === "data"
        ? dataPage()
        : profilePage();
  return phone(body, true);
}

function renderSquat() {
  return phone(squatDetailPage(), true);
}

function render() {
  if (state.route === "splash") app.innerHTML = renderSplash();
  if (state.route === "auth") app.innerHTML = renderAuth();
  if (state.route === "dashboard") app.innerHTML = renderDashboard();
  if (state.route === "squat") app.innerHTML = renderSquat();
}

function goAuth() {
  state.route = "auth";
  render();
}

function login() {
  const account = document.getElementById("loginAccount").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const user = state.users.find((u) => u.account === account && u.password === password);
  if (!user) return alert("帳號或密碼錯誤");
  setSession(user);
}

function register() {
  const name = document.getElementById("regName").value.trim();
  const account = document.getElementById("regAccount").value.trim();
  const password = document.getElementById("regPassword").value.trim();
  const role = document.getElementById("regRole").value;
  if (!name || !account || !password) return alert("請填寫完整資料");
  if (state.users.some((u) => u.account === account)) return alert("帳號已存在");
  const user = { name, account, password, role };
  state.users.push(user);
  localStorage.setItem("remotion_users", JSON.stringify(state.users));
  setSession(user);
}

function switchTab(tab) {
  state.route = "dashboard";
  state.tab = tab;
  render();
}

function goSquatDetail() {
  state.route = "squat";
  state.tab = "work";
  render();
}

function backToTrain() {
  state.route = "dashboard";
  state.tab = "work";
  render();
}

window.goAuth = goAuth;
window.login = login;
window.register = register;
window.switchTab = switchTab;
window.goSquatDetail = goSquatDetail;
window.backToTrain = backToTrain;
window.logout = logout;

render();
