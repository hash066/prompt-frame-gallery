/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_MAX_FILE_SIZE: process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760',
    NEXT_PUBLIC_ALLOWED_TYPES: process.env.NEXT_PUBLIC_ALLOWED_TYPES || 'image/jpeg,image/png,image/webp,image/avif',
  },
}

module.exports = nextConfig
