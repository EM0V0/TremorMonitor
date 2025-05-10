# DARKside
Parkinson's multi-data fusion detection system

## Secure Communication Setup Guide

### HTTPS Configuration

The project now supports local HTTPS communication and AES-256-GCM encryption to protect sensitive data. Here's how to set it up:

1. **Generate Certificates and Keys**

   Use the PowerShell script in the project root to generate a self-signed certificate and encryption key:

   ```powershell
   # Run in PowerShell
   .\generate-cert.ps1
   ```

   The script will:
   - Create a self-signed HTTPS certificate and copy it to appropriate directories
   - Generate a random AES-256 key
   - Provide instructions for setting environment variables

2. **Set Environment Variables**

   Set the AES key as an environment variable:

   ```powershell
   # For current session
   $env:NEUROMOTION_AES_KEY='generated-key'
   
   # Or system-wide (requires admin privileges)
   [System.Environment]::SetEnvironmentVariable('NEUROMOTION_AES_KEY', 'generated-key', 'Machine')
   ```

3. **Trust the Certificate**

   In Windows:
   - Double-click the `certs/https.pfx` file
   - Select "Local Machine" as store location
   - Enter password: `password`
   - Place the certificate in the "Trusted Root Certification Authorities" store

### Launch Services

1. **Start the API Service**

   ```bash
   # Navigate to API directory
   cd "NeuroMotion API"
   dotnet run
   ```

   The API will run at:
   - HTTP: http://localhost:5037
   - HTTPS: https://localhost:5038

2. **Start the Frontend Service**

   ```bash
   # Navigate to frontend directory
   cd NeuroMotion_Front
   npm install
   npm run dev
   ```

   The frontend will run at https://localhost:3000

### Verify Encryption

1. **Check HTTPS Connection**
   - Browser address bar should show a lock icon
   - Network requests in developer tools should use HTTPS protocol

2. **Verify AES Encryption**
   - Use browser developer tools to inspect network requests
   - Login or registration requests should contain `iv`, `ciphertext`, and `tag` fields
   - Check API logs for "Successfully decrypted..." messages

### Security Notes

- This encryption system is for development purposes only
- Production environments should use more secure key management solutions
- Self-signed certificates are for development only; production should use trusted certificates
