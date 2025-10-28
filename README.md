# Google Wallet Loyalty Card POC

A complete proof-of-concept implementation of a loyalty card system using Google Wallet API with push notifications, points management, and tier-based rewards.

## 🚀 Features

### Core Functionality
- ✅ **Google Wallet Integration** - Create and manage loyalty cards in Google Wallet
- ✅ **JWT Generation** - Secure token generation for "Save to Wallet" functionality
- ✅ **Points Management** - Add, redeem, and transfer loyalty points
- ✅ **Tier System** - Bronze, Silver, Gold tier management with automatic benefits
- ✅ **Push Notifications** - Send real-time updates to users' Google Wallet cards
- ✅ **Rate Limiting** - Protect against abuse with intelligent rate limiting
- ✅ **Transaction History** - Track all points transactions and changes

### Advanced Features
- ✅ **Batch Operations** - Send notifications to multiple users simultaneously
- ✅ **Error Handling** - Comprehensive error handling with retry logic
- ✅ **Logging System** - Structured logging with multiple severity levels
- ✅ **Security** - Input validation, XSS protection, Helmet security headers
- ✅ **Testing** - 56 unit and integration tests with Jest
- ✅ **Circuit Breaker** - Automatic failure detection and recovery

## 📋 Prerequisites

- Node.js 18+
- npm or yarn
- Google Cloud Platform account
- Google Wallet API enabled
- Service account with Google Wallet permissions

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd Android-poc
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section below).

### 4. Set Up Google Wallet Credentials

1. Download your service account JSON key from Google Cloud Console
2. Place it in the project root or a secure location
3. Update `GOOGLE_APPLICATION_CREDENTIALS` in `.env` to point to the file

### 5. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3001` (or your configured PORT).

## ⚙️ Configuration

### Environment Variables

See `.env.example` for a complete list. Key variables:

```bash
# Google Wallet Configuration
ISSUER_ID=your_issuer_id              # From Google Wallet Console
CLASS_SUFFIX=loyalty_class_v1         # Unique identifier for your loyalty class
OBJECT_SUFFIX=loyalty_object          # Unique identifier for loyalty objects

# Service Account
GOOGLE_APPLICATION_CREDENTIALS=./path/to/service-account.json

# Program Branding
PROGRAM_NAME="Your Rewards Program"
PROGRAM_LOGO_URL=https://your-domain.com/logo.png
BRAND_COLOR=#1976D2
BACKGROUND_COLOR=#FFFFFF

# Server Configuration
PORT=3001
NODE_ENV=production

# Security
JWT_SECRET=your-super-secret-jwt-key  # Generate a strong random key
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# Logging
LOG_LEVEL=info                        # debug, info, warn, error
LOG_DIR=./logs
```

## 📖 API Documentation

### Base URL
```
http://localhost:3001
```

### Health Check

```http
GET /health
```

Returns server health status and Google Wallet API connectivity.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-01T00:00:00.000Z",
  "googleWallet": "connected",
  "version": "1.0.0"
}
```

### Loyalty Class Endpoints

#### Create Loyalty Class
```http
POST /create-class
Content-Type: application/json

{
  "programName": "Your Rewards Program",
  "reviewStatus": "UNDER_REVIEW"
}
```

#### Get Loyalty Class
```http
GET /class/:classId
```

#### List All Classes
```http
GET /classes
```

### JWT & Save to Wallet Endpoints

#### Create Wallet Pass
```http
POST /create-pass/:userId
Content-Type: application/json

{
  "points": 100,
  "tier": "Bronze",
  "memberName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "userId": "user123",
  "jwt": "eyJhbGc...",
  "saveUrl": "https://pay.google.com/gp/v/save/...",
  "objectId": "issuer.object-user123",
  "classId": "issuer.class"
}
```

#### Get Save URL
```http
GET /save-url/:userId?points=50&tier=Silver
```

### Points Management Endpoints

#### Add Points
```http
POST /add-points/:userId
Content-Type: application/json

{
  "points": 50,
  "reason": "Purchase reward",
  "sendNotification": true
}
```

#### Redeem Points
```http
POST /redeem-points/:userId
Content-Type: application/json

{
  "points": 25,
  "reason": "Redeemed for discount"
}
```

#### Get Points Balance
```http
GET /points-balance/:userId
```

#### Transaction History
```http
GET /transaction-history/:userId
```

### Notification Endpoints

#### Send Notification
```http
POST /send-notification/:userId
Content-Type: application/json

{
  "type": "POINTS_EARNED",
  "data": {
    "points": 50,
    "newBalance": 150,
    "reason": "Purchase reward"
  }
}
```

**Notification Types:**
- `POINTS_EARNED` - Points added
- `POINTS_REDEEMED` - Points redeemed
- `TIER_UPGRADE` - Tier upgraded
- `WELCOME` - Welcome message
- `CUSTOM` - Custom message

For complete API documentation, see [docs/API.md](docs/API.md).

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only

# Watch mode for development
npm run test:watch
```

**Test Coverage:** 56 tests covering JWT generation, retry logic, API endpoints, validation, and error handling.

See [test/README.md](test/README.md) for detailed testing documentation.

## 📁 Project Structure

```
Android-poc/
├── src/
│   ├── server.js                 # Main Express application
│   ├── auth/
│   │   └── google-wallet-auth.js # Google Wallet authentication
│   ├── services/
│   │   ├── loyalty-class.js      # Loyalty class management
│   │   ├── loyalty-object.js     # Loyalty object management
│   │   ├── jwt-service.js        # JWT generation
│   │   ├── points-manager.js     # Points management
│   │   └── notification-service.js # Push notifications
│   ├── middleware/
│   │   ├── security.js           # Security middleware
│   │   └── error-handler.js      # Error handling
│   └── utils/
│       ├── logger.js             # Logging utility
│       └── retry.js              # Retry logic with circuit breaker
├── config/
│   └── env-validation.js         # Environment validation
├── test/                         # Test suite
├── logs/                         # Application logs
├── docs/                         # Documentation
└── README.md
```

## 🔒 Security

### Built-in Security Features

- **Helmet.js** - Security headers (CSP, XSS protection, etc.)
- **CORS** - Configurable cross-origin resource sharing
- **Rate Limiting** - Prevent API abuse
- **Input Validation** - XSS and injection protection
- **JWT Validation** - Secure token verification
- **Error Sanitization** - No sensitive data in error messages

### Security Best Practices

1. **Never commit `.env` file** - Add to `.gitignore`
2. **Use strong JWT secrets** - Generate with `openssl rand -base64 32`
3. **Restrict CORS origins** - Only allow trusted domains
4. **Rotate service account keys** - Regularly update credentials
5. **Enable HTTPS** - Always use TLS in production

## 🚀 Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

### Quick Deploy Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure production `CORS_ORIGINS`
- [ ] Set strong `JWT_SECRET`
- [ ] Enable HTTPS/TLS
- [ ] Configure log rotation
- [ ] Test all endpoints
- [ ] Submit brand review to Google

## 📊 Monitoring & Logging

Logs are written to:
- `logs/app.log` - All logs
- `logs/error.log` - Errors only
- Console output (formatted with colors)

Log levels: `ERROR`, `WARN`, `INFO`, `DEBUG`

## 🐛 Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues and solutions.

## 📚 Additional Documentation

- [Google Wallet Setup Guide](docs/GOOGLE_WALLET_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Complete API Reference](docs/API.md)
- [Testing Guide](test/README.md)

## 🔗 Resources

- [Google Wallet API Documentation](https://developers.google.com/wallet)
- [Google Wallet Console](https://pay.google.com/business/console)
- [JWT.io](https://jwt.io/) - JWT debugging

## 💡 Support

For issues or questions:
1. Check [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
2. Review Google Wallet API documentation
3. Check server logs in `logs/` directory
4. Enable debug logging: `LOG_LEVEL=debug`

---

**Built with:** Node.js • Express • Google Wallet API • JWT • Jest • Helmet

**Project Status:** Production-ready POC ✅
