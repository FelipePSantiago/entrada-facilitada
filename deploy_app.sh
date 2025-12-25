#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# Increment version first
bash increment_version.sh

echo "Starting clean build and optimized deploy for the application..."

# 1. Clean previous build artifacts
echo "1. Cleaning previous build..."
rm -rf .next

# 2. Build the Next.js application
echo "2. Building the application for production..."
npm run build

# 3. Deploy to Firebase Hosting
echo "3. Deploying application to Firebase Hosting..."
firebase deploy --only hosting

echo "
Application deployment complete!"
