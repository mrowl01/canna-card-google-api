# Google Cloud Setup for Google Wallet Integration

Follow these steps to set up Google Cloud for your loyalty card POC:

## 1. Create or Select a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID for later use

## 2. Enable Google Wallet API

1. In the Google Cloud Console, navigate to APIs & Services > Library
2. Search for "Google Wallet API"
3. Click on it and press "Enable"

## 3. Create a Service Account

1. Go to IAM & Admin > Service Accounts
2. Click "Create Service Account"
3. Fill in details:
   - Name: `google-wallet-service`
   - Description: `Service account for Google Wallet loyalty card integration`
4. Click "Create and Continue"

## 4. Assign Roles

Assign these roles to your service account:
- **Wallet Objects Admin** (for full wallet operations)
- **Service Account Token Creator** (for JWT signing)

## 5. Generate and Download Credentials

1. Click on your newly created service account
2. Go to the "Keys" tab
3. Click "Add Key" > "Create new key"
4. Choose JSON format
5. Download the JSON file
6. Move it to a secure location on your system
7. Update your `.env` file with the absolute path:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/your/service-account.json
   ```

## 6. Set up Google Wallet Console

1. Go to [Google Wallet Console](https://console.developers.google.com/apis/credentials)
2. Navigate to Google Wallet API settings
3. Add your service account email as a Developer with appropriate permissions
4. Note your Issuer ID and update your `.env` file:
   ```
   ISSUER_ID=your_issuer_id_here
   ```

## 7. Configure Allowed Origins

In your JWT configuration, ensure you include the origins where your app will run:
- Development: `http://localhost:3001`
- Production: Your actual domain

## 8. Testing

Once configured, you can test the authentication with:
```bash
npm run dev
curl http://localhost:3001/health
```

## Important Notes

- Keep your service account JSON file secure and never commit it to version control
- The service account email should be added as a Developer in Google Wallet Console
- For production, you'll need to request publishing access and complete brand review
- Test with your Gmail account first before going live

## Troubleshooting

- If authentication fails, verify the service account has the correct roles
- Ensure the JSON file path in `.env` is absolute and accessible
- Check that Google Wallet API is enabled in your project
- Verify your Issuer ID is correct from the Wallet Console