interface ToastItem {
	id: number;
	message: string;
	type: 'error' | 'success';
}

let _toasts = $state<ToastItem[]>([]);
let _nextId = 0;

function add(message: string, type: ToastItem['type']) {
	const id = _nextId++;
	_toasts = [..._toasts, { id, message, type }];
	setTimeout(() => dismiss(id), 5000);
}

function dismiss(id: number) {
	_toasts = _toasts.filter((t) => t.id !== id);
}

export const toast = {
	get items() { return _toasts; },
	error(message: string) { add(message, 'error'); },
	success(message: string) { add(message, 'success'); },
	dismiss
};
