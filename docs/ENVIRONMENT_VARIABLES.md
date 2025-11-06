# Environment Variables Configuration

This document provides comprehensive documentation for all environment variables used in Artone Video Editor.

## Quick Start

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Configure required variables for your environment

3. Restart the development server:
   ```bash
   npm run dev
   ```

## Required Variables

### NEXT_PUBLIC_APP_ORIGIN

- **Description**: The origin URL of your application
- **Required**: Yes
- **Default**: `http://localhost:3000`
- **Example**: `https://artone.your-domain.com`
- **Usage**: CORS configuration, CSP headers, security policies

### NEXT_PUBLIC_API_URL

- **Description**: Base URL for API endpoints
- **Required**: Yes
- **Default**: `http://localhost:3001`
- **Example**: `https://api.your-domain.com`
- **Usage**: Backend communication, data fetching

## Security Variables

### CSRF_SECRET

- **Description**: Secret key for CSRF token generation
- **Required**: Recommended for production
- **Default**: Auto-generated (insecure)
- **Generation**: `openssl rand -base64 32`
- **Usage**: CSRF protection middleware

### SESSION_SECRET

- **Description**: Secret key for session encryption
- **Required**: Recommended for production
- **Default**: Auto-generated (insecure)
- **Generation**: `openssl rand -base64 32`
- **Usage**: Session management, authentication

## Optional Services

### AI Provider URLs

Only configure these if you're using AI features:

#### NEXT_PUBLIC_OPENAI_API_URL

- **Description**: OpenAI API endpoint
- **Default**: Not set
- **Example**: `https://api.openai.com/v1`
- **Features**: GPT models, Whisper transcription, TTS

#### NEXT_PUBLIC_ANTHROPIC_API_URL

- **Description**: Anthropic API endpoint
- **Default**: Not set
- **Example**: `https://api.anthropic.com/v1`
- **Features**: Claude AI models

#### NEXT_PUBLIC_GOOGLE_AI_API_URL

- **Description**: Google AI API endpoint
- **Default**: Not set
- **Example**: `https://generativelanguage.googleapis.com/v1`
- **Features**: Gemini models, translation

#### NEXT_PUBLIC_AZURE_API_URL

- **Description**: Microsoft Azure Cognitive Services endpoint
- **Default**: Not set
- **Example**: `https://api.cognitive.microsofttranslator.com`
- **Features**: Azure Translator

#### NEXT_PUBLIC_ELEVENLABS_API_URL

- **Description**: ElevenLabs API endpoint
- **Default**: Not set
- **Example**: `https://api.elevenlabs.io/v1`
- **Features**: Voice synthesis

### Machine Learning

#### NEXT_PUBLIC_TFJS_MODEL_BASE_URL

- **Description**: Base URL for TensorFlow.js model storage
- **Default**: Not set
- **Example**: `https://models.your-domain.com`
- **Usage**: Object detection, face recognition models

### Collaboration

#### NEXT_PUBLIC_COLLABORATION_SERVER

- **Description**: WebSocket server for real-time collaboration
- **Default**: Not set
- **Example**: `wss://collab.your-domain.com`
- **Requirements**: Must use `wss://` protocol with valid TLS certificate

### Content Delivery

#### NEXT_PUBLIC_ASSET_CDN

- **Description**: CDN origin for static assets
- **Default**: Same as NEXT_PUBLIC_APP_ORIGIN
- **Example**: `https://cdn.your-domain.com`
- **Usage**: Image, video, font delivery

### Monitoring & Analytics

#### NEXT_PUBLIC_SENTRY_DSN

- **Description**: Sentry error tracking DSN
- **Default**: Not set
- **Example**: `https://abc123@sentry.io/123456`
- **Usage**: Error monitoring, performance tracking

#### NEXT_PUBLIC_GA_TRACKING_ID

- **Description**: Google Analytics tracking ID
- **Default**: Not set
- **Example**: `G-XXXXXXXXXX`
- **Usage**: User analytics, behavior tracking

### Support

#### NEXT_PUBLIC_SUPPORT_EMAIL

- **Description**: Support contact email
- **Default**: Not set
- **Example**: `support@your-domain.com`
- **Usage**: Displayed in help sections, error messages

## Development Variables

### NODE_ENV

- **Description**: Node.js environment
- **Values**: `development`, `production`, `test`
- **Default**: `development`
- **Usage**: Enables/disables development features

### DEBUG

- **Description**: Enable debug logging
- **Values**: `true`, `false`
- **Default**: `false`
- **Usage**: Verbose console output for troubleshooting

## Environment-Specific Configuration

### Development (.env.local)

```env
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
NODE_ENV=development
DEBUG=true
```

### Staging (.env.staging)

```env
NEXT_PUBLIC_APP_ORIGIN=https://staging.your-domain.com
NEXT_PUBLIC_API_URL=https://api-staging.your-domain.com
CSRF_SECRET=<generated-secret>
SESSION_SECRET=<generated-secret>
NODE_ENV=production
DEBUG=false
```

### Production (.env.production)

```env
NEXT_PUBLIC_APP_ORIGIN=https://artone.your-domain.com
NEXT_PUBLIC_API_URL=https://api.your-domain.com
CSRF_SECRET=<generated-secret>
SESSION_SECRET=<generated-secret>
NEXT_PUBLIC_ASSET_CDN=https://cdn.your-domain.com
NEXT_PUBLIC_SENTRY_DSN=<your-sentry-dsn>
NODE_ENV=production
DEBUG=false
```

## Security Best Practices

### Secret Generation

Generate cryptographically secure secrets:

```bash
# CSRF_SECRET
openssl rand -base64 32

# SESSION_SECRET
openssl rand -base64 32
```

### Secret Management

1. **Never commit secrets to version control**
   - Add `.env.local`, `.env.production` to `.gitignore`
   - Use `.env.example` as template only

2. **Use environment-specific files**
   - `.env.local` for local development
   - `.env.production` for production
   - `.env.test` for testing

3. **Production deployment**
   - Use secrets management service (AWS Secrets Manager, HashiCorp Vault)
   - Set environment variables in hosting platform
   - Rotate secrets regularly (every 90 days)

### URL Validation

All `NEXT_PUBLIC_*` URLs are validated at runtime:
- Must be valid HTTP(S) URLs
- Must use HTTPS in production (except localhost)
- Must not contain credentials
- Must match allowed origins in CORS policy

## Troubleshooting

### Missing Required Variables

**Error**: "NEXT_PUBLIC_APP_ORIGIN is required"

**Solution**: Set the variable in `.env.local`:
```env
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3000
```

### CORS Errors

**Error**: "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution**: Ensure `NEXT_PUBLIC_APP_ORIGIN` matches your current domain

### CSP Violations

**Error**: "Content Security Policy: Refused to load..."

**Solution**: Update CSP configuration in `next.config.js` or use environment-based CSP sources

### AI Features Not Working

**Error**: "Base URL not configured for OpenAI"

**Solution**: Set the appropriate AI provider URL:
```env
NEXT_PUBLIC_OPENAI_API_URL=https://api.openai.com/v1
```

### Collaboration Not Connecting

**Error**: "WebSocket connection failed"

**Solution**:
1. Ensure `NEXT_PUBLIC_COLLABORATION_SERVER` uses `wss://` protocol
2. Verify TLS certificate is valid
3. Check firewall/network configuration

## Validation

### Runtime Validation

Environment variables are validated on application startup:

```typescript
// Automatic validation
import { validateEnvironment } from '@/config/env';

validateEnvironment(); // Throws if required vars missing
```

### Build-Time Validation

Check configuration before deployment:

```bash
# Validate all environment variables
npm run validate:env

# Check security configuration
npm run security:check
```

## Reference

### File Locations

- `.env.example` - Template with all available variables
- `.env.local` - Your local development configuration (gitignored)
- `.env.production` - Production configuration (gitignored)
- `next.config.js` - Next.js environment configuration
- `src/config/env.ts` - Environment validation logic

### Related Documentation

- [Security Implementation](./SECURITY.md)
- [Deployment Checklist](./deployment_checklist.md)
- [Next.js Environment Variables](https://nextjs.org/docs/basic-features/environment-variables)

## Support

For environment configuration issues:
- Check this documentation first
- Review error messages carefully
- Consult [Deployment Checklist](./deployment_checklist.md)
- Contact support if configured: `NEXT_PUBLIC_SUPPORT_EMAIL`
