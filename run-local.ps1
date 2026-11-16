$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command python -ErrorAction SilentlyContinue }
if (-not $python) {
  Write-Host 'Nie znaleziono Python 3. Uruchom run-local.bat albo użyj Live Server w Visual Studio Code.'
  exit 1
}
$server = Start-Process -FilePath $python.Source -ArgumentList '-m http.server 8000' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($server.HasExited) { throw 'Serwer nie wystartował. Port 8000 może być zajęty.' }
    try {
      $response = Invoke-WebRequest -Uri 'http://localhost:8000/' -UseBasicParsing -TimeoutSec 1
      if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) { throw 'Serwer nie odpowiedział pod adresem http://localhost:8000/.' }
  Start-Process 'http://localhost:8000/'
  Write-Host 'Serwer działa pod adresem http://localhost:8000/.'
  [void](Read-Host 'Naciśnij Enter, aby zatrzymać serwer')
} finally {
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
