<script lang="ts">
	import { toast } from '$lib/admin/toast.svelte';
</script>

<div class="toasts" aria-live="assertive" aria-atomic="false">
	{#each toast.items as item (item.id)}
		<div class="toast" class:error={item.type === 'error'} class:success={item.type === 'success'}>
			<span>{item.message}</span>
			<button onclick={() => toast.dismiss(item.id)} aria-label="Dismiss">×</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 600;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 340px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.65rem 0.9rem;
		background: #120e04;
		border: 1px solid rgba(200, 150, 60, 0.25);
		font-family: 'Courier New', Courier, monospace;
		font-size: 0.65rem;
		letter-spacing: 0.05em;
		color: #b8a880;
		pointer-events: all;
		animation: slide-in 0.15s ease-out;
	}

	.toast.error {
		border-color: rgba(180, 60, 60, 0.45);
		color: #c07070;
	}

	.toast.success {
		border-color: rgba(60, 150, 80, 0.45);
		color: #70b880;
	}

	@keyframes slide-in {
		from { opacity: 0; transform: translateX(0.5rem); }
		to   { opacity: 1; transform: translateX(0); }
	}

	button {
		background: none;
		border: none;
		cursor: pointer;
		color: inherit;
		opacity: 0.5;
		font-size: 1rem;
		padding: 0;
		line-height: 1;
		flex-shrink: 0;
		transition: opacity 0.15s;
	}
	button:hover { opacity: 1; }
</style>
