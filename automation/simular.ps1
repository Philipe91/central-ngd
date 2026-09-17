# Liga o modo simulado (fluxos do n8n apontando para o mock local das plataformas) ou volta aos fluxos reais com -Desligar.
# Nada é publicado de verdade no modo simulado. Credenciais e banco do n8n não são alterados.
param([switch]$Desligar)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& (Join-Path $PSScriptRoot 'stop-local.ps1')
if ($Desligar) {
    Write-Host 'Importando os fluxos REAIS (automation/workflows.json)...'
    node automation/n8n.mjs import:workflow --input=automation/workflows.json
} else {
    Write-Host 'Gerando e importando os fluxos SIMULADOS...'
    node automation/create-workflows.mjs --simulate
    if ($LASTEXITCODE) { throw 'Falha ao gerar os fluxos simulados.' }
    node automation/n8n.mjs import:workflow --input=data/workflows.simulado.json
}
if ($LASTEXITCODE) { throw 'Falha ao importar os fluxos no n8n.' }
foreach ($id in 'ngdLocalHealth01', 'ngdPublishQueue01', 'ngdTestConnection01', 'ngdCollectMetrics01') {
    node automation/n8n.mjs publish:workflow --id=$id | Where-Object { $_ -match 'Publishing|Error|error' }
    if ($LASTEXITCODE) { throw "Falha ao publicar o fluxo $id." }
}
& (Join-Path $PSScriptRoot 'start-local.ps1') -Simular:(-not $Desligar)
Write-Host 'Aguardando o n8n ativar os fluxos...'
$pronto = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    try { $s = (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3210/api/n8n/status' -TimeoutSec 8).Content | ConvertFrom-Json; if ($s.connected) { $pronto = $true; break } } catch { }
}
if (-not $pronto) { throw 'O painel não confirmou a conexão com o n8n em 3 minutos. Veja data/n8n.log.' }
if ($Desligar) {
    Write-Host 'Modo REAL ativo: fluxos apontam para YouTube, Meta e TikTok. Mock desligado.'
} else {
    $m = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3212/__mock/estado' -TimeoutSec 5).Content | ConvertFrom-Json
    Write-Host "Modo SIMULADO ativo: mock em http://127.0.0.1:3212 (modos: $(($m.modos | ConvertTo-Json -Compress))). Painel: http://localhost:3210"
}
