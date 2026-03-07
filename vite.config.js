import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	build: { target: 'es2020' },
	optimizeDeps: { esbuildOptions: { target: 'es2020' } },
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
		alias: {
			'$lib': new URL('./src/lib', import.meta.url).pathname
		}
	}
});
