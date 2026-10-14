$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskRuntime = Join-Path $taskRoot 'runtime'
if (!(Test-Path -LiteralPath (Join-Path $taskRuntime 'config.yaml'))) { throw 'Prepare the isolated runtime first.' }
foreach ($taskPort in @(5681, 3015)) {
    $taskListener = Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue
    if ($taskListener) { throw "Port $taskPort is occupied; existing processes will not be stopped." }
}
$env:LOCALMINIDRAMA_CONFIG_PATH = Join-Path $taskRuntime 'config.yaml'
$env:LOCALMINIDRAMA_SAFE_RESTART = '1'
$env:LOCALMINIDRAMA_STATIC_EVIDENCE_ROOT = Join-Path $taskRuntime 'evidence'
$env:LOCALMINIDRAMA_IDENTITY_TRANSFER_MANIFEST = Join-Path $taskRuntime 'reference-transfer/manifest.json'
$env:LOCALMINIDRAMA_FRONTEND_HOST = '127.0.0.1'
$env:LOCALMINIDRAMA_FRONTEND_PORT = '3015'
$env:LOCALMINIDRAMA_BACKEND_URL = 'http://127.0.0.1:5681'
$env:PORT = '5681'
$taskNode = (Get-Command node.exe).Source
$taskBackend = Start-Process -FilePath $taskNode -ArgumentList 'src/server.js' -WorkingDirectory (Join-Path $taskRoot 'backend-node') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'backend.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'backend.stderr.log')
$taskReady = $false
for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
    if ($taskBackend.HasExited) { throw 'Isolated backend exited; inspect runtime/backend.stderr.log.' }
    try {
        $taskHealth = Invoke-RestMethod 'http://127.0.0.1:5681/health' -TimeoutSec 1
        if ($taskHealth.status -eq 'ok') { $taskReady = $true; break }
    } catch { Start-Sleep -Milliseconds 300 }
}
if (!$taskReady) { throw 'Isolated backend did not become healthy; no frontend was started.' }
$taskFrontend = Start-Process -FilePath $taskNode -ArgumentList 'node_modules/vite/bin/vite.js' -WorkingDirectory (Join-Path $taskRoot 'frontweb') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime 'frontend.stdout.log') -RedirectStandardError (Join-Path $taskRuntime 'frontend.stderr.log')
@{ backend_pid = $taskBackend.Id; frontend_pid = $taskFrontend.Id; root = $taskRoot; started_at = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskRuntime 'processes.json') -Encoding utf8
Write-Output 'Isolated frontend: http://127.0.0.1:3015/film/2?episode=2'
