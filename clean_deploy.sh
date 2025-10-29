#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# Increment version first
bash increment_version.sh

echo "Starting clean deployment process..."

# Determine the script's directory to use absolute paths
SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
TEMP_DIR="$SCRIPT_DIR/../temp_deploy"

# 1. Create a temporary directory (if it doesn't exist)
echo "Creating temporary directory..."
mkdir -p "$TEMP_DIR"

# 2. Copy necessary files
echo "Copying files to temporary directory..."
cp -r "$SCRIPT_DIR/functions" "$TEMP_DIR/"
cp "$SCRIPT_DIR/firebase.json" "$TEMP_DIR/"

# 3. Install dependencies in the temporary directory (in a subshell)
echo "Installing dependencies..."
(cd "$TEMP_DIR/functions" && npm install)

# 4. Deploy from the temporary directory (in a subshell)
echo "Deploying Firebase Functions..."
(cd "$TEMP_DIR" && firebase deploy --only functions)

# 5. Clean up the temporary directory
echo "Cleaning up temporary directory..."
rm -rf "$TEMP_DIR"

echo "Clean deployment complete!"
