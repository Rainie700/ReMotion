(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})(),((e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports))((()=>{var e=document.getElementById(`app`),t=[{key:`home`,off:`/images/home.png`,on:`/images/home_selected.png`,label:`首頁`},{key:`data`,off:`/images/data.png`,on:`/images/data_selected.png`,label:`數據`},{key:`profile`,off:`/images/profile.png`,on:`/images/profile_selected.png`,label:`我的`}],n={route:`splash`,tab:`home`,user:null,users:JSON.parse(localStorage.getItem(`remotion_users`)||`[]`)};n.users.length||(n.users=[{account:`patient01`,password:`123456`,role:`patient`,name:`黃小謙`},{account:`therapist01`,password:`123456`,role:`therapist`,name:`邱大壯`}],localStorage.setItem(`remotion_users`,JSON.stringify(n.users)));var r=localStorage.getItem(`remotion_session`);r&&(n.user=JSON.parse(r),n.route=`dashboard`);function i(e){n.user=e,localStorage.setItem(`remotion_session`,JSON.stringify(e)),n.route=`dashboard`,y()}function a(){localStorage.removeItem(`remotion_session`),n.user=null,n.route=`auth`,n.tab=`home`,y()}function o(e,t=!1){return`
    <main class="phone">
      <section class="content">${e}</section>
      ${t?s():``}
    </main>
  `}function s(){let e=n.user?.role===`therapist`?{key:`work`,off:`/images/files.png`,on:`/images/files_selected.png`,label:`檔案`}:{key:`work`,off:`/images/train.png`,on:`/images/train_selected.png`,label:`訓練`};return`
    <nav class="bottom-nav">
      ${[t[0],e,t[1],t[2]].map(e=>{let t=e.key,r=n.tab===t;return`
          <button class="tab-btn ${r?`active`:``}" onclick="switchTab('${t}')">
            <img src="${r?e.on:e.off}" alt="${e.label}" />
            <span>${e.label}</span>
          </button>`}).join(``)}
    </nav>
  `}function c(){return o(`
    <div class="splash">
      <img class="hero-img" src="/images/image_1.png" alt="ReMotion 啟動畫面" />
      <h1 class="title">ReMotion</h1>
      <p class="subtitle">為你的復健旅程提供專屬 AI 陪伴</p>
      <button class="btn btn-primary" onclick="goAuth()">開始使用</button>
    </div>
  `)}function l(){return o(`
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
  `)}function u(){return`
    <div class="top-profile-container">
      
      <div class="header">
        <h1 class="page-title">Re<span class="logo-dark">Motion</span></h1>
        <div class="top-actions">
          <img class="icon" src="/images/notice.png" alt="通知" />
        </div>
      </div>

      <div class="user-row">
        <div class="avatar">${n.user.name[0]}</div>
        <div class="user-info">
          <strong>${n.user.name} 👋</strong><br />
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
    
  `}function d(){return`
    <div class="header">
      <h1 class="page-title">ReMotion</h1>
      <img class="icon" src="/images/notice.png" alt="通知" />
    </div>
    <div class="user-row">
      <div class="avatar">${n.user.name[0]}</div>
      <div>
        <strong>${n.user.name} 復健師</strong><br />
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
  `}function f(){return`
    <div class="header">
      <div>
        <h1 class="page-title">訓練</h1>
        <div class="small">早安，${n.user.name} 👋</div>
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
  `}function p(){return`
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
  `}function m(){return`
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
  `}function h(){return`
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
  `}function g(){return`
    <div class="center">
      <div class="avatar" style="margin: 12px auto 8px;">${n.user.name[0]}</div>
      <h2>${n.user.name}</h2>
      <p class="muted">角色：${n.user.role===`patient`?`患者`:`復健師`}</p>
    </div>
    <div class="card">
      <div>帳號：${n.user.account}</div>
      <div class="small">此示範版僅先完成介面與流程串接。</div>
    </div>
    <div style="height:10px"></div>
    <button class="btn btn-light" style="width:100%" onclick="logout()">登出</button>
  `}function _(){return o(n.tab===`home`?n.user.role===`patient`?u():d():n.tab===`work`?n.user.role===`patient`?f():p():n.tab===`data`?h():g(),!0)}function v(){return o(m(),!0)}function y(){n.route===`splash`&&(e.innerHTML=c()),n.route===`auth`&&(e.innerHTML=l()),n.route===`dashboard`&&(e.innerHTML=_()),n.route===`squat`&&(e.innerHTML=v())}function b(){n.route=`auth`,y()}function x(){let e=document.getElementById(`loginAccount`).value.trim(),t=document.getElementById(`loginPassword`).value.trim(),r=n.users.find(n=>n.account===e&&n.password===t);if(!r)return alert(`帳號或密碼錯誤`);i(r)}function S(){let e=document.getElementById(`regName`).value.trim(),t=document.getElementById(`regAccount`).value.trim(),r=document.getElementById(`regPassword`).value.trim(),a=document.getElementById(`regRole`).value;if(!e||!t||!r)return alert(`請填寫完整資料`);if(n.users.some(e=>e.account===t))return alert(`帳號已存在`);let o={name:e,account:t,password:r,role:a};n.users.push(o),localStorage.setItem(`remotion_users`,JSON.stringify(n.users)),i(o)}function C(e){n.route=`dashboard`,n.tab=e,y()}function w(){n.route=`squat`,n.tab=`work`,y()}function T(){n.route=`dashboard`,n.tab=`work`,y()}window.goAuth=b,window.login=x,window.register=S,window.switchTab=C,window.goSquatDetail=w,window.backToTrain=T,window.logout=a,y()}))();