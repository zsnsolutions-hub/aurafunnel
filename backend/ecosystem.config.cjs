module.exports = {
  apps: [
    {
      name: 'scaliyo-backend',
      script: 'dist/index.js',
      cwd: '/var/www/scaliyo/backend',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        REDIS_URL: 'redis://127.0.0.1:6379',
        // These should be set in the PM2 environment or .env file
        // SUPABASE_URL: '',
        // SUPABASE_SERVICE_ROLE_KEY: '',
      },
    },
  ],
};
