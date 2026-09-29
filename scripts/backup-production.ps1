param(
  [Parameter(Mandatory=$true)][string]$OutputRoot,
  [string[]]$Buckets = @("kwinest-documents","kwinest-site")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' is missing."
  }
}

function Require-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Environment variable $Name is required."
  }
  return $value
}

function Encode-StoragePath([string]$Path) {
  return (($Path -split "/") | ForEach-Object { [uri]::EscapeDataString($_) }) -join "/"
}

function Get-StorageEntries {
  param(
    [string]$ProjectUrl,
    [hashtable]$Headers,
    [string]$Bucket,
    [string]$Prefix = ""
  )

  $all = @()
  $offset = 0
  $limit = 1000

  while ($true) {
    $body = @{
      prefix = $Prefix
      limit = $limit
      offset = $offset
      sortBy = @{ column = "name"; order = "asc" }
    } | ConvertTo-Json -Depth 4

    $uri = "$ProjectUrl/storage/v1/object/list/$([uri]::EscapeDataString($Bucket))"
    $page = @(Invoke-RestMethod -Method Post -Uri $uri -Headers $Headers -ContentType "application/json" -Body $body)

    foreach ($item in $page) {
      $name = [string]$item.name
      if ([string]::IsNullOrWhiteSpace($name)) { continue }
      $full = if ($Prefix) { "$Prefix$name" } else { $name }

      if ($null -eq $item.id -or $null -eq $item.metadata) {
        $all += Get-StorageEntries -ProjectUrl $ProjectUrl -Headers $Headers -Bucket $Bucket -Prefix "$full/"
      } else {
        $all += [pscustomobject]@{
          Bucket = $Bucket
          Path = $full
          Size = if ($item.metadata.size) { [int64]$item.metadata.size } else { 0 }
          MimeType = if ($item.metadata.mimetype) { [string]$item.metadata.mimetype } else { $null }
        }
      }
    }

    if ($page.Count -lt $limit) { break }
    $offset += $limit
  }

  return $all
}

Require-Command "supabase"
Require-Command "docker"
Require-Command "pg_dump"

$dbUrl = Require-Env "SUPABASE_DB_URL"
$projectUrl = (Require-Env "SUPABASE_URL").TrimEnd("/")
$serviceRoleKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$backupDir = Join-Path $OutputRoot "boekuna-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

Write-Host "Creating database backup in $backupDir"

& supabase db dump --db-url $dbUrl -f (Join-Path $backupDir "roles.sql") --role-only
if ($LASTEXITCODE -ne 0) { throw "roles.sql backup failed" }

& supabase db dump --db-url $dbUrl -f (Join-Path $backupDir "schema.sql")
if ($LASTEXITCODE -ne 0) { throw "schema.sql backup failed" }

& supabase db dump --db-url $dbUrl -f (Join-Path $backupDir "data.sql") --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
if ($LASTEXITCODE -ne 0) { throw "data.sql backup failed" }

& supabase db dump --db-url $dbUrl -f (Join-Path $backupDir "history_schema.sql") --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw "migration history schema backup failed" }

& supabase db dump --db-url $dbUrl -f (Join-Path $backupDir "history_data.sql") --use-copy --data-only --schema supabase_migrations
if ($LASTEXITCODE -ne 0) { throw "migration history data backup failed" }

# Preserve Auth rows separately. Supabase's normal db dump intentionally filters managed schemas.
& pg_dump --dbname=$dbUrl --schema=auth --data-only --no-owner --no-privileges --file=(Join-Path $backupDir "auth-data.sql")
if ($LASTEXITCODE -ne 0) { throw "auth-data.sql backup failed" }

$headers = @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
}

$storageManifest = @()
foreach ($bucket in $Buckets) {
  Write-Host "Backing up Storage bucket: $bucket"
  $bucketDir = Join-Path $backupDir (Join-Path "storage" $bucket)
  New-Item -ItemType Directory -Path $bucketDir -Force | Out-Null

  $entries = @(Get-StorageEntries -ProjectUrl $projectUrl -Headers $headers -Bucket $bucket)
  foreach ($entry in $entries) {
    $relative = $entry.Path.Replace("/", [IO.Path]::DirectorySeparatorChar)
    $target = Join-Path $bucketDir $relative
    $parent = Split-Path -Parent $target
    if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }

    $encodedPath = Encode-StoragePath $entry.Path
    $downloadUri = "$projectUrl/storage/v1/object/$([uri]::EscapeDataString($bucket))/$encodedPath"
    Invoke-WebRequest -Method Get -Uri $downloadUri -Headers $headers -OutFile $target

    $actualLength = (Get-Item $target).Length
    if ($entry.Size -gt 0 -and $actualLength -ne $entry.Size) {
      throw "Storage size mismatch for $bucket/$($entry.Path)"
    }

    $storageManifest += [pscustomobject]@{
      bucket = $bucket
      path = $entry.Path
      bytes = $actualLength
      mimeType = $entry.MimeType
      sha256 = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
    }
  }
}

$filesToHash = @(
  "roles.sql","schema.sql","data.sql","history_schema.sql","history_data.sql","auth-data.sql"
)

$databaseFiles = foreach ($name in $filesToHash) {
  $path = Join-Path $backupDir $name
  [pscustomobject]@{
    name = $name
    bytes = (Get-Item $path).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
  }
}

$manifest = [ordered]@{
  formatVersion = 1
  createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
  projectUrl = $projectUrl
  databaseFiles = @($databaseFiles)
  storageObjects = @($storageManifest)
  storageObjectCount = $storageManifest.Count
  storageBytes = [int64](($storageManifest | Measure-Object -Property bytes -Sum).Sum)
}

$manifestPath = Join-Path $backupDir "manifest.json"
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Path $manifestPath -Encoding UTF8

foreach ($dbFile in $databaseFiles) {
  if ($dbFile.bytes -le 0) { throw "Backup file $($dbFile.name) is empty" }
}
foreach ($obj in $storageManifest) {
  $target = Join-Path $backupDir (Join-Path "storage" (Join-Path $obj.bucket ($obj.path.Replace("/", [IO.Path]::DirectorySeparatorChar))))
  $actualHash = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
  if ($actualHash -ne $obj.sha256) { throw "Checksum verification failed for $($obj.bucket)/$($obj.path)" }
}

Write-Host ""
Write-Host "BOOKUNA BACKUP COMPLETE"
Write-Host "Path: $backupDir"
Write-Host "Storage objects: $($storageManifest.Count)"
Write-Host "Manifest: $manifestPath"
Write-Host "Keep this directory outside the repository and copy it to encrypted off-site storage."
