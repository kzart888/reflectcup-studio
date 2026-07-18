$ErrorActionPreference = "Stop"

$workspace = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$data = [IO.Path]::GetFullPath((Join-Path $workspace "data\postgres"))
$log = [IO.Path]::GetFullPath((Join-Path $workspace "data\postgres.log"))
$bin = "C:\Program Files\PostgreSQL\16\bin"

if (-not $data.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a PostgreSQL data path outside the workspace."
}

if (-not (Test-Path -LiteralPath (Join-Path $bin "pg_ctl.exe"))) {
  throw "PostgreSQL 16 is not installed at $bin. Use Docker Compose instead."
}

if (-not (Test-Path -LiteralPath (Join-Path $data "PG_VERSION"))) {
  New-Item -ItemType Directory -Force -Path $data | Out-Null
  & (Join-Path $bin "initdb.exe") -D $data -U reflectcup --auth=trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw "initdb failed" }
}

& (Join-Path $bin "pg_isready.exe") -h 127.0.0.1 -p 54329 -U reflectcup *> $null
if ($LASTEXITCODE -ne 0) {
  & (Join-Path $bin "pg_ctl.exe") -D $data -l $log -o "-p 54329" start
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL failed to start. See $log" }
}

& (Join-Path $bin "psql.exe") -h 127.0.0.1 -p 54329 -U reflectcup -d postgres -tAc "ALTER USER reflectcup WITH PASSWORD 'reflectcup';" *> $null
$database = & (Join-Path $bin "psql.exe") -h 127.0.0.1 -p 54329 -U reflectcup -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='reflectcup'"
if (-not $database) {
  & (Join-Path $bin "createdb.exe") -h 127.0.0.1 -p 54329 -U reflectcup reflectcup
}

Write-Host "PostgreSQL is ready at 127.0.0.1:54329."
