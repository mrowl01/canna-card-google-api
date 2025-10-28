// Environment validation utility
const fs = require('fs');
const path = require('path');

function validateEnvironment() {
  const isVercel = process.env.VERCEL === '1';

  // Required vars differ between local and Vercel
  const requiredEnvVars = [
    'ISSUER_ID',
    'CLASS_SUFFIX',
    'OBJECT_SUFFIX'
  ];

  // Add environment-specific required vars
  if (!isVercel) {
    requiredEnvVars.push('GOOGLE_APPLICATION_CREDENTIALS', 'ORIGINS', 'PORT');
  }

  const missing = [];
  const invalid = [];

  // Check for missing environment variables
  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });

  // Validate Google credentials (file-based for local, JSON for Vercel)
  if (isVercel) {
    // On Vercel, check for GOOGLE_SERVICE_ACCOUNT_JSON
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      missing.push('GOOGLE_SERVICE_ACCOUNT_JSON');
    } else {
      try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        if (!credentials.type || credentials.type !== 'service_account') {
          invalid.push('GOOGLE_SERVICE_ACCOUNT_JSON: Not a valid service account JSON');
        }
      } catch (error) {
        invalid.push(`GOOGLE_SERVICE_ACCOUNT_JSON: Invalid JSON - ${error.message}`);
      }
    }
  } else {
    // Local development - check for file-based credentials
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!fs.existsSync(credentialsPath)) {
        invalid.push(`GOOGLE_APPLICATION_CREDENTIALS: File not found at ${credentialsPath}`);
      } else {
        try {
          const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
          if (!credentials.type || credentials.type !== 'service_account') {
            invalid.push('GOOGLE_APPLICATION_CREDENTIALS: Not a valid service account JSON file');
          }
        } catch (error) {
          invalid.push(`GOOGLE_APPLICATION_CREDENTIALS: Invalid JSON file - ${error.message}`);
        }
      }
    }
  }

  if (process.env.ISSUER_ID && process.env.ISSUER_ID === 'YOUR_ISSUER_ID') {
    invalid.push('ISSUER_ID: Please replace with your actual Issuer ID from Google Wallet Console');
  }

  if (process.env.PORT && isNaN(parseInt(process.env.PORT))) {
    invalid.push('PORT: Must be a valid number');
  }

  // Return validation results
  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    warnings: []
  };
}

function logValidationResults(results) {
  console.log('\n🔍 Environment Validation Results:');

  if (results.valid) {
    console.log('✅ All environment variables are properly configured');
    return true;
  }

  if (results.missing.length > 0) {
    console.log('\n❌ Missing required environment variables:');
    results.missing.forEach(var_ => console.log(`   - ${var_}`));
  }

  if (results.invalid.length > 0) {
    console.log('\n⚠️  Invalid environment variables:');
    results.invalid.forEach(issue => console.log(`   - ${issue}`));
  }

  console.log('\n📖 Please check config/google-cloud-setup.md for setup instructions');
  return false;
}

module.exports = { validateEnvironment, logValidationResults };