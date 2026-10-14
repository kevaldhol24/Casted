# One-time: creates the Google Play upload key and stores it as GitHub Actions secrets for
# .github/workflows/android-release.yml. Needs keytool (any JDK) and gh (logged in). Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File tools/android/setup-signing.ps1
# The key goes to %USERPROFILE%\casted-keys, outside the repo. Back that folder up: Play only accepts updates
# signed with this key (a lost key needs an upload-key reset from Play support).
$ErrorActionPreference = 'Stop'
$repo = 'kevaldhol24/Casted'
$alias = 'casted-upload'
$dir = Join-Path $env:USERPROFILE 'casted-keys'
$ks = Join-Path $dir 'casted-upload.jks'

$keytool = (Get-Command keytool -ErrorAction SilentlyContinue).Source
if (-not $keytool -and $env:JAVA_HOME) { $keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe' }
if (-not $keytool -or -not (Test-Path $keytool)) { throw 'keytool not found (set JAVA_HOME to a JDK)' }

New-Item -ItemType Directory -Force $dir | Out-Null
if (Test-Path $ks) { throw "$ks already exists; not overwriting the upload key" }

$chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 28
$rng.GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

& $keytool -genkeypair -keystore $ks -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 -validity 10000 `
  -storepass $pw -keypass $pw -dname 'CN=Keval Dhol, O=Casted, C=IN'
if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }

@"
Casted - Google Play UPLOAD key. Back this folder up (password manager / cloud drive). Never commit it.
Keystore: $ks
Alias:    $alias
Password: $pw   (store and key password are the same, PKCS12)
GitHub secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
"@ | Out-File -Encoding utf8 (Join-Path $dir 'README-casted-upload-key.txt')

[Convert]::ToBase64String([IO.File]::ReadAllBytes($ks)) | gh secret set ANDROID_KEYSTORE_BASE64 --repo $repo
gh secret set ANDROID_KEYSTORE_PASSWORD --repo $repo --body $pw
gh secret set ANDROID_KEY_PASSWORD --repo $repo --body $pw
gh secret set ANDROID_KEY_ALIAS --repo $repo --body $alias
gh secret list --repo $repo
Write-Host "Done. Upload key + password saved in $dir - back it up."
