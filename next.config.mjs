/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Your existing configuration
  webpack: (config, { isServer }) => {
    // Prevent bundling of 'original-fs' on the client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'original-fs': false,
      };
    }
    return config;
  },
};

export default nextConfig;
