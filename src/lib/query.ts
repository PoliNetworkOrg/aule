import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      structuralSharing: false,
    },
  },
});

export function fetchJson<T>(url: string, staleTime = 0): Promise<T> {
  return queryClient.fetchQuery({
    queryKey: ["json", url],
    staleTime,
    queryFn: async () => {
      const response = await fetch(url);

      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);

      const data: T = await response.json();

      return data;
    },
  });
}
