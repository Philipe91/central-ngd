param([switch]$OpenDashboard, [switch]$Simular, [switch]$Reiniciar)
$ErrorActionPreference = 'Stop'
$ngdRoot = Split-Path -Parent $PSScriptRoot
$ngdNode = (Get-Command node.exe -ErrorAction Stop).Source
$ngdTools = Join-Path $ngdRoot '.runtime/tools'
if (-not (Test-Path (Join-Path $ngdTools 'ffmpeg.exe')) -or -not (Test-Path (Join-Path $ngdTools 'yt-dlp.exe'))) { & (Join-Path $PSScriptRoot 'install-tools.ps1') }
if ($Reiniciar) { & (Join-Path $PSScriptRoot 'stop-local.ps1') }
$ngdServices = @(
    @{ Url = 'http://localhost:3210/api/state'; Script = 'server.mjs'; Name = 'dashboard' },
    @{ Url = 'http://localhost:5678/healthz'; Script = 'automation/n8n.mjs'; Name = 'n8n' }
)
if ($Simular) {
    # Modo simulado: o mock das plataformas sobe junto e o Instagram usa o servidor de compartilhamento local em vez do cloudflared.
    $env:NGD_SHARE_PUBLIC_URL = 'http://127.0.0.1:3211'
    $ngdServices = @(@{ Url = 'http://127.0.0.1:3212/__mock/estado'; Script = 'automation/mock-platforms.mjs'; Name = 'mock' }) + $ngdServices
} else {
    Remove-Item Env:NGD_SHARE_PUBLIC_URL -ErrorAction SilentlyContinue
}
foreach ($ngdService in $ngdServices) {
    $ngdReady = $false
    try { $ngdReady = (Invoke-WebRequest -UseBasicParsing -Uri $ngdService.Url -TimeoutSec 2).StatusCode -eq 200 } catch { }
    if (-not $ngdReady) {
        $ngdExisting = Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains((Join-Path $ngdRoot $ngdService.Script)) }
        if (-not $ngdExisting) {
            $ngdScriptPath = Join-Path $ngdRoot $ngdService.Script
            Start-Process -FilePath $ngdNode -ArgumentList ('"' + $ngdScriptPath + '"') -WorkingDirectory $ngdRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $ngdRoot ('data/' + $ngdService.Name + '.log')) -RedirectStandardError (Join-Path $ngdRoot ('data/' + $ngdService.Name + '-error.log'))
        }
    }
}
if ($OpenDashboard) { Start-Process 'http://localhost:3210' }
