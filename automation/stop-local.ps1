# Para o painel, o n8n, o mock e o túnel desta pasta.
# Mata por linha de comando (processos iniciados a partir do projeto) e também por porta, para pegar um painel
# iniciado à mão com "node server.mjs", que não carrega o caminho do projeto na linha de comando.
$ErrorActionPreference = 'Stop'
$ngdRoot = Split-Path -Parent $PSScriptRoot
$portas = 3210, 3211, 3212, 5678, 5679
$pids = @()
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ngdRoot) } | ForEach-Object { $pids += $_.ProcessId }
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $portas -contains $_.LocalPort } | ForEach-Object { $pids += $_.OwningProcess }
Get-CimInstance Win32_Process -Filter "name = 'cloudflared.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -match '127\.0\.0\.1:3211' } | ForEach-Object { $pids += $_.ProcessId }
$pids = $pids | Where-Object { $_ -and $_ -ne $PID } | Sort-Object -Unique
foreach ($alvo in $pids) { Stop-Process -Id $alvo -Force -ErrorAction SilentlyContinue }
if ($pids.Count) { Start-Sleep -Seconds 2 }
Write-Host "Serviços parados: $($pids.Count)"
