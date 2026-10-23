# 首次鏡頭實測用：啟動「本機」Firebase 模擬器（Auth 127.0.0.1:9099、Firestore 127.0.0.1:8080，專案 demo-remotion）。
# 不連任何正式 Firebase 專案；demo- 開頭的專案 ID 只存在於本機模擬器。
# 用法（PowerShell，在本資料夾執行）：
#   powershell -ExecutionPolicy Bypass -File .\start-emulators.ps1
# 需求：Node.js、Java JDK 21 以上（firebase-tools 15 的 Firestore 模擬器需要）。
# 資料會在按 Ctrl+C 結束時匯出到 .\emulator-data，下次啟動自動載入（帳號與測試結果都保留）。
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
# firebase.json 只能讀取本資料夾內的檔案：每次啟動前複製目前程式庫的 firestore.rules，確保規則與程式一致。
Copy-Item -Path (Join-Path $here "..\..\..\..\firestore.rules") -Destination (Join-Path $here "firestore.rules") -Force
# 這台電腦預設的 java 可能是 1.8（太舊）：若 C:\Program Files\Java 下有 jdk-21 以上，優先使用。
$jdk = Get-ChildItem "C:\Program Files\Java" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^jdk-(\d+)' -and [int]$Matches[1] -ge 21 } | Sort-Object Name -Descending | Select-Object -First 1
if ($jdk) { $env:PATH = (Join-Path $jdk.FullName "bin") + ";" + $env:PATH; Write-Host "使用 Java：$($jdk.FullName)" }
else { Write-Host "找不到 JDK 21 以上；若啟動失敗，請先安裝 JDK 21+。" }
$data = Join-Path $here "emulator-data"
# 已知狀況（2026-10-22 在這台 Windows 實測）：結束時匯出的資料已完整寫入暫存資料夾 firebase-export-xxxx，
# 但最後改名為 emulator-data 時出現 EPERM；模擬器關閉後該資料夾仍無法改名，但可以複製。
# 因此每次啟動前，先把最新一份完整的暫存匯出「複製」成 emulator-data（暫存資料夾刪得掉就刪，刪不掉就留著，不影響使用）。
$pending = Get-ChildItem $here -Directory -Filter "firebase-export-*" | Where-Object { Test-Path (Join-Path $_.FullName "firebase-export-metadata.json") } | Sort-Object LastWriteTime -Descending
if ($pending -and (-not (Test-Path $data) -or $pending[0].LastWriteTime -gt (Get-Item $data).LastWriteTime)) {
  if (Test-Path $data) { Remove-Item $data -Recurse -Force }
  Copy-Item $pending[0].FullName $data -Recurse
  Write-Host "已載入上次結束時匯出的資料：$($pending[0].Name) -> emulator-data"
}
$pending | ForEach-Object { try { Remove-Item $_.FullName -Recurse -Force -ErrorAction Stop } catch { } }
$importArgs = @()
if (Test-Path (Join-Path $data "firebase-export-metadata.json")) { $importArgs = @("--import", $data) }
npx -y firebase-tools@15 emulators:start --only auth,firestore --project demo-remotion @importArgs --export-on-exit $data
