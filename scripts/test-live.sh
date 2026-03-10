#!/bin/bash

# Test script to verify Sky.svelte fixes on live deployment
# Usage: ./scripts/test-live.sh https://cwcorella.com

set -e

LIVE_URL="${1:-https://cwcorella.com}"
NODE_ENV=production

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Testing Sky.svelte fixes on live deployment"
echo "Target: $LIVE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if Node 20+ is available
node_version=$(node -v | cut -d. -f1 | sed 's/v//')
if [ "$node_version" -lt 20 ]; then
    echo "⚠ Node 20+ required. Current: $(node -v)"
    echo "Loading nvm..."
    [ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh
    nvm use 20 || { echo "❌ Failed to load Node 20"; exit 1; }
fi

echo "✓ Node version: $(node -v)"
echo "✓ npm version: $(npm -v)"
echo ""

# Run Playwright tests against live site
echo "Running Playwright tests against live site..."
TEST_URL="$LIVE_URL" npx playwright test tests/sky-rendering.spec.ts \
    --config=<(cat <<'EOF'
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_URL || 'https://cwcorella.com';

export default defineConfig({
	testDir: './tests',
	outputDir: '/tmp/pw-results',
	snapshotDir: '/tmp/pw-snapshots',

	use: {
		baseURL: baseURL,
		screenshot: 'only-on-failure',
		actionTimeout: 10000,
		navigationTimeout: 30000,
	},

	projects: [
		{
			name: 'mobile',
			use: {
				browserName: 'chromium',
				viewport: { width: 375, height: 812 },
				deviceScaleFactor: 2,
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: 'desktop',
			use: {
				browserName: 'chromium',
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			},
		},
	],

	webServer: undefined,
	fullyParallel: true,
	workers: 2,
	retries: 1,
	timeout: 30000,
});
EOF
)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Live site verification complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
