import TerserPlugin from 'terser-webpack-plugin';
import withPWA from 'next-pwa';

const pwaConfig = {
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },

  experimental: {
    optimizeCss: true,
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      'radix-ui',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
  },

  // ABORDAGEM DE DEPURAÇÃO: Adicionando a URL exata e a com wildcard.
  allowedDevOrigins: [
    'https://*.cloudworkstations.dev',
    'https://3000-firebase-studio-1754258520668.cluster-ve345ymguzcd6qqzuko2qbxtfe.cloudworkstations.dev'
  ],

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },

  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'original-fs': false,
        'fs': false,
        'path': false,
        'crypto': false,
      };
    }

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /'''[\\/]node_modules[\\/]'''/,
              name: 'vendors',
              chunks: 'all',
              priority: 10,
            },
            radix: {
              test: /'''[\\/]node_modules[\\/]@radix-ui[\\/]'''/,
              name: 'radix',
              chunks: 'all',
              priority: 20,
            },
            lucide: {
              test: /'''[\\/]node_modules[\\/]lucide-react[\\/]'''/,
              name: 'lucide',
              chunks: 'all',
              priority: 30,
            },
            firebase: {
              test: /'''[\\/]node_modules[\\/]firebase[\\/]'''/,
              name: 'firebase',
              chunks: 'all',
              priority: 40,
            },
            datefns: {
              test: /'''[\\/]node_modules[\\/]date-fns[\\/]'''/,
              name: 'datefns',
              chunks: 'all',
              priority: 50,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 5,
            },
          },
        },
        usedExports: true,
        sideEffects: false,
      };
    }

    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src',
    };

    config.module.rules.push({
      test: /\.(png|jpe?g|gif|svg)$/i,
      type: 'asset',
      parser: {
        dataUrlCondition: {
          maxSize: 8 * 1024, // 8KB
        },
      },
      generator: {
        filename: 'static/images/[name].[hash][ext]',
      },
    });

    if (!dev) {
      config.optimization.minimizer.push(
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          },
        })
      );
    }

    return config;
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },

  compress: true,

  poweredByHeader: false,
};

export default withPWA(pwaConfig)(nextConfig);
