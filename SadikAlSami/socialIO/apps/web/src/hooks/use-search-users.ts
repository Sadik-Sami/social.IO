import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

import { api } from '@/lib/api';
import { profileKeys } from '@/lib/query-keys';
import { searchResultSchema } from '@/types/api';

/**
 * @description
 * Searches for user profiles via GET /api/profile/search?q=.
 * Enabled only when query is >= 2 characters.
 */
export function useSearchUsers(query: string) {
	return useQuery({
		queryKey: profileKeys.search(query),
		queryFn: async () => {
			const res = await api.get('/api/profile/search', { params: { q: query } });
			return z.array(searchResultSchema).parse(res.data.results);
		},
		enabled: query.length >= 2,
		staleTime: 5 * 60_000,
	});
}
