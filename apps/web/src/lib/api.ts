import axios from 'axios';

import { env } from '@socialIO/env/web';

/**
 * @description
 * Axios instance for API requests
 */
export const api = axios.create({
	baseURL: typeof window === 'undefined' ? process.env.SSR_SERVER_URL || env.NEXT_PUBLIC_SERVER_URL : env.NEXT_PUBLIC_SERVER_URL,
	withCredentials: true,
	headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
	(res) => res,
	(err) => {
		if (err.response?.status === 401) {
			window.location.href = '/login';
		}
		return Promise.reject(err);
	},
);
