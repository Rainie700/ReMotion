import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const repo=process.env.REPO;
if(!repo||process.env.GCLOUD_PROJECT!=="demo-remotion")throw Error("Local demo project only");
const env=await initializeTestEnvironment({projectId:"demo-remotion",firestore:{host:"127.0.0.1",port:8080,rules:readFileSync(`${repo}/firestore.rules`,"utf8")}});
const admin=fn=>env.withSecurityRulesDisabled(c=>fn(c.firestore()));
const password="local-manual-only-123",tag=Date.now();
async function account(role){
  const email=`manual-${role}-${tag}@local.test`;
  const response=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password,returnSecureToken:true})});
  const data=await response.json();assert.ok(data.localId,JSON.stringify(data));
  const user={id:data.localId,email,account:email,name:`Manual ${role}`,role,createdAt:new Date().toISOString()};
  await admin(async db=>{await setDoc(doc(db,"users",user.id),user);await setDoc(doc(db,"publicUsers",user.id),user);});return user;
}
const patient=await account("patient"),therapist=await account("therapist");
await admin(db=>setDoc(doc(db,"therapistPatientRelations","manual-browser-rel"),{id:"manual-browser-rel",patientId:patient.id,therapistId:therapist.id,status:"accepted",createdAt:new Date().toISOString()}));
const read=async name=>{let rows;await admin(async db=>{rows=(await getDocs(query(collection(db,name),where("patientId","==",patient.id)))).docs.map(d=>d.data());});return rows;};
const vite=spawn(process.execPath,[`${repo}/node_modules/vite/bin/vite.js`,"--host","127.0.0.1","--port","5173","--strictPort"],{cwd:repo,stdio:"ignore"});
let browser,allowVoid=false;const errors=[];
try{
  for(let i=0;i<100;i++){try{if((await fetch("http://127.0.0.1:5173")).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  async function login(user,width){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route("**/*",r=>["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
    page.on("dialog",async d=>{if(allowVoid&&d.type()==="confirm"){allowVoid=false;await d.accept();}else{errors.push(d.message());await d.dismiss();}});
    await page.goto("http://127.0.0.1:5173/?emulator=1");await page.waitForFunction(()=>typeof window.confirmAuthRole==="function");
    await page.evaluate(role=>{window.goAuth();window.setAuthMode("login");window.selectAuthRole(role);window.confirmAuthRole();},user.role);
    await page.locator("#loginAccount").fill(user.email);await page.locator("#loginPassword").fill(password);await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(()=>!document.querySelector("#loginAccount"),null,{timeout:20000});return page;
  }
  const p=await login(patient,390);
  await p.evaluate(()=>window.goSelfPracticeExerciseDetail("F01-01"));
  await p.getByRole("button",{name:"不使用相機，自行回報",exact:true}).click();
  const draft=await p.evaluate(async id=>(await import('/js/data/selfReportedTrainingService.js')).selfReportedTrainingService.begin(id,'F01-01'),patient.id);
  await p.locator("#manualBasis").selectOption("per_side");
  await p.locator("#manualLeft").fill("3");await p.locator("#manualRight").fill("0");await p.locator("#manualNote").fill("本機本人回報測試");await p.locator("#manualAttested").check();
  await p.getByRole("button",{name:"儲存本人回報",exact:true}).click();
  await p.getByText("已儲存本人回報",{exact:true}).waitFor();
  assert.equal((await read("selfReportedTraining")).length,1);
  assert.equal((await read("selfReportedTraining"))[0].actual.rightReps,0);
  const retried=await p.evaluate(async ({patientId,sessionId})=>(await import('/js/data/selfReportedTrainingService.js')).selfReportedTrainingService.save({patientId,sessionId,exerciseId:'F01-01',actual:{basis:'per_side',durationSeconds:null,totalReps:null,leftReps:3,rightReps:0},note:'本機本人回報測試',unrecordedPracticeAttested:true}),{patientId:patient.id,sessionId:draft.sessionId});
  assert.equal(retried.alreadySaved,true);assert.equal((await read("selfReportedTraining")).length,1);
  console.log("PASS | mobile UI saves self-reported side counts and explicit zero; retry same session produces one cloud document");
  await p.getByRole("button",{name:"返回查看紀錄",exact:true}).click();
  await p.evaluate(()=>window.goSelfPracticeExerciseDetail("F03-09"));await p.getByRole("button",{name:"不使用相機，自行回報",exact:true}).click();
  await p.locator("#manualSeconds").fill("30");await p.locator("#manualAttested").check();await p.getByRole("button",{name:"儲存本人回報",exact:true}).click();
  await p.getByText("已儲存本人回報",{exact:true}).waitFor();assert.equal((await read("selfReportedTraining")).length,2);
  await p.getByRole("button",{name:"返回查看紀錄",exact:true}).click();
  await p.locator('.self-report-history summary').first().click();allowVoid=true;
  await p.getByRole("button",{name:"作廢這筆回報",exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.self-report-history')?.textContent.includes('已作廢'));
  const rows=await read("selfReportedTraining");assert.equal(rows.length,2);assert.equal(rows.find(r=>r.exerciseId==='F03-09').status,'voided');
  console.log("PASS | duration record saved, then owner voided it; amount and history retained");
  const t=await login(therapist,1100);await t.evaluate(id=>window.goCaseDetail(id,'overview'),patient.id);
  await t.getByRole('heading',{name:'自行回報的練習',exact:true}).waitFor();
  const history=await t.locator('.self-report-history').textContent();assert.ok(history.includes('左 3 次／右 0 次')&&history.includes('已作廢'));assert.ok(!history.includes('作廢這筆回報'));
  console.log("PASS | separate therapist context loads both sources of self-reported amount with void status, no edit control");
  for(const name of ['analysisRecords','trackingCycles','schedules'])assert.equal((await read(name)).length,0);
  for(const row of rows)for(const key of ['score','overallScore','quality','completedSets'])assert.ok(!Object.hasOwn(row,key));
  assert.deepEqual(errors,[]);console.log("PASS | no AI analysis, score, cycle/schedule credit, page error or unexpected dialog; local-only requests, no camera/Gemini");
}finally{await browser?.close();vite.kill('SIGTERM');await env.cleanup();}
