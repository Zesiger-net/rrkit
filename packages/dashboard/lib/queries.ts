import { useQuery } from '@tanstack/react-query';
import type {
  IntegrationResponse,
  MetadataFieldsResponse,
  SessionFacetsResponse,
  SessionListResponse,
  SessionRecord,
  SessionStatsResponse,
  StatusResponse,
} from '@rrkit/shared';
import { api } from './api';

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<StatusResponse>('/status'),
  });
}

export function useSessions(queryString: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ['sessions', queryString],
    queryFn: () => api.get<SessionListResponse>(`/sessions${queryString}`),
    refetchInterval,
  });
}

export function useStats(refetchInterval?: number) {
  return useQuery({
    queryKey: ['sessions-stats'],
    queryFn: () => api.get<SessionStatsResponse>('/sessions/stats'),
    refetchInterval,
  });
}

export function useFacets() {
  return useQuery({
    queryKey: ['sessions-facets'],
    queryFn: () => api.get<SessionFacetsResponse>('/sessions/facets'),
  });
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: ['session', id],
    queryFn: () => api.get<SessionRecord>(`/sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useMetadataFields() {
  return useQuery({
    queryKey: ['metadata-fields'],
    queryFn: () => api.get<MetadataFieldsResponse>('/settings/metadata'),
  });
}

export function useIntegration() {
  return useQuery({
    queryKey: ['integration'],
    queryFn: () => api.get<IntegrationResponse>('/settings/integration'),
  });
}
