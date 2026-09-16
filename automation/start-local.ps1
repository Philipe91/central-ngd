param([switch]$OpenDashboard)
$ErrorActionPreference = 'Stop'
$ngdRoot = Split-Path -Parent $PSScriptRoot
$ngdNode = (Get-Command node.exe -ErrorAction Stop).Source
$ngdServices = @(
    @{ Url = 'http://localhost:3210/api/state'; Script = 'server.mjs'; Name = 'dashboard' },
    @{ Url = 'http://localhost:5678/healthz'; Script = 'automation/n8n.mjs'; Name = 'n8n' }
)
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
