# Baixa ferramentas portateis gratuitas usadas pela Central NGD (sem instalador, sem admin).
# ffmpeg/ffprobe: conversao e capa | yt-dlp: importar video do Instagram | cloudflared: link temporario para o Instagram Graph API
param([switch]$Force)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.runtime/tools'
New-Item -ItemType Directory -Force $tools | Out-Null
function Get-Tool($name, $url, $target) {
    if ((Test-Path $target) -and -not $Force) { Write-Host "$name ja instalado"; return }
    Write-Host "Baixando $name..."
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $target
}
Get-Tool 'yt-dlp' 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' (Join-Path $tools 'yt-dlp.exe')
Get-Tool 'cloudflared' 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' (Join-Path $tools 'cloudflared.exe')
if (-not (Test-Path (Join-Path $tools 'ffmpeg.exe')) -or $Force) {
    $zip = Join-Path $tools 'ffmpeg.zip'
    Get-Tool 'ffmpeg' 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' $zip
    $extract = Join-Path $tools 'ffmpeg-extract'
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    foreach ($exe in 'ffmpeg.exe', 'ffprobe.exe') {
        $found = Get-ChildItem -Path $extract -Recurse -Filter $exe | Select-Object -First 1
        if (-not $found) { throw "Nao encontrei $exe no pacote do ffmpeg" }
        Copy-Item $found.FullName (Join-Path $tools $exe) -Force
    }
    Remove-Item -Recurse -Force $extract
    Remove-Item -Force $zip
}
foreach ($exe in 'ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe', 'cloudflared.exe') {
    $p = Join-Path $tools $exe
    if (Test-Path $p) { Write-Host ("OK  {0,-16} {1:N1} MB" -f $exe, ((Get-Item $p).Length / 1MB)) } else { Write-Host "FALTA $exe" }
}
