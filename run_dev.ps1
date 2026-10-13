$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPort = 5679
$frontendPort = 3013
$runtimeNode = Join-Path $root 'runtime-node\node_modules\node\bin\node.exe'
$backendEntry = Join-Path $root 'backend-node\src\server.js'
$logDir = Join-Path $root 'runtime-logs'
New-Item -ItemType Directory -Force $logDir | Out-Null

foreach ($port in @($backendPort, $frontendPort)) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

if (-not (Test-Path $runtimeNode)) { throw "项目内置 Node 22 不存在: $runtimeNode" }
Write-Host "启动后端服务 (Node 22, $backendPort)..." -ForegroundColor Cyan
Start-Process -FilePath $runtimeNode -ArgumentList $backendEntry -WorkingDirectory (Join-Path $root 'backend-node') -RedirectStandardOutput (Join-Path $logDir 'backend.out.log') -RedirectStandardError (Join-Path $logDir 'backend.err.log') -WindowStyle Hidden | Out-Null

Write-Host "启动前端服务 (Vite, $frontendPort)..." -ForegroundColor Cyan
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory (Join-Path $root 'frontweb') -RedirectStandardOutput (Join-Path $logDir 'frontend.out.log') -RedirectStandardError (Join-Path $logDir 'frontend.err.log') -WindowStyle Hidden | Out-Null

$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $ready = @(Get-NetTCPConnection -LocalPort $backendPort, $frontendPort -State Listen -ErrorAction SilentlyContinue).LocalPort
} while (((($ready -contains $backendPort) -and ($ready -contains $frontendPort)) -eq $false) -and (Get-Date) -lt $deadline)

if (($ready -contains $backendPort) -and ($ready -contains $frontendPort)) {
  Write-Host "开发服务器已启动！" -ForegroundColor Green
  Write-Host "  后端: http://127.0.0.1:$backendPort" -ForegroundColor Yellow
  Write-Host "  前端: http://127.0.0.1:$frontendPort" -ForegroundColor Yellow
} else {
  Write-Host "启动失败，详见 $logDir" -ForegroundColor Red
  exit 1
}
