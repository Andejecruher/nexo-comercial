export const requiredTestEnv = {
  BASE_URL: 'http://localhost:8000',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ENCRYPTION_KEY: 'test-encryption-key',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
  WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
  WHATSAPP_APP_ID: 'test-app-id',
  WHATSAPP_APP_SECRET: 'test-app-secret',
  WHATSAPP_ACCESS_TOKEN: 'test-access-token',
  WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'test-business-id',
} as const;

for (const [key, value] of Object.entries(requiredTestEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
