# Create certificate directories
$certsDir = "./certs"
if (-Not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
    Write-Host "Creating certificate directory: $certsDir"
}

# Ensure NeuroMotion_Front/certs directory exists
$frontendCertsDir = "./NeuroMotion_Front/certs"
if (-Not (Test-Path $frontendCertsDir)) {
    New-Item -ItemType Directory -Path $frontendCertsDir | Out-Null
    Write-Host "Creating frontend certificate directory: $frontendCertsDir"
}

# Ensure NeuroMotion API/certs directory exists
$apiCertsDir = "./NeuroMotion API/certs"
if (-Not (Test-Path $apiCertsDir)) {
    New-Item -ItemType Directory -Path $apiCertsDir | Out-Null
    Write-Host "Creating API certificate directory: $apiCertsDir"
}

# Define certificate password
$password = "password"
$securePassword = ConvertTo-SecureString -String $password -Force -AsPlainText

# Generate self-signed certificate
Write-Host "Generating self-signed certificate..."
$cert = New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "Cert:\CurrentUser\My" -NotAfter (Get-Date).AddYears(1) -KeyUsage KeyEncipherment, DigitalSignature -KeyAlgorithm RSA -KeyLength 2048

# Export PFX file
$pfxPath = Join-Path $certsDir "https.pfx"
Write-Host "Exporting PFX certificate to $pfxPath"
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

# Copy certificate to frontend and API directories
Copy-Item -Path $pfxPath -Destination $frontendCertsDir
Copy-Item -Path $pfxPath -Destination $apiCertsDir
Write-Host "Copied certificate to frontend and API directories"

# Generate random AES-256 key and convert to Base64
Write-Host "Generating random AES-256 key..."
$aesKey = New-Object byte[] 32
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$rng.GetBytes($aesKey)
$base64Key = [Convert]::ToBase64String($aesKey)

# Output environment variable commands
Write-Host "`n=========================================================="
Write-Host "Certificate generated successfully! Password: $password"
Write-Host "Please set the following environment variable for development:"
Write-Host "Environment variable: NEUROMOTION_AES_KEY=$base64Key"
Write-Host "=========================================================="
Write-Host "You can use the following commands to set the environment variable:"
Write-Host "`nFor current PowerShell session:"
Write-Host "`$env:NEUROMOTION_AES_KEY='$base64Key'"
Write-Host "`nFor system environment variable (requires admin rights):"
Write-Host "[System.Environment]::SetEnvironmentVariable('NEUROMOTION_AES_KEY', '$base64Key', 'Machine')"
Write-Host "=========================================================="
Write-Host "WARNING: Production environments should use more secure methods for key storage!"

# Write .env example file
$envContent = @"
# NeuroMotion Environment Variables Example
# Note: Do not use these values in production

# AES-256-GCM encryption key (Base64 encoded, 32 bytes)
NEUROMOTION_AES_KEY=$base64Key
"@

$envPath = "./.env.example"
$envContent | Out-File -FilePath $envPath -Encoding utf8

Write-Host "`nExample environment variables written to $envPath"
Write-Host "Please ensure environment variables are set before running the project!" 