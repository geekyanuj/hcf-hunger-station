import { useQuery } from '@tanstack/react-query';
import { CustomerApi } from '@/services/domainApi';
import { useSessionStore } from '@/stores/session.store';
import { CustomerProfile } from '@/types/domain';

/**
 * Where the customer stands before a DELIVERY order:
 *  LOADING          - still checking the saved profile
 *  LOGIN_REQUIRED   - not signed in as a customer
 *  DETAILS_REQUIRED - signed in, but name and/or delivery address is missing -> send to the details page
 *  READY            - name + at least one saved address
 */
export type DeliveryStatus = 'LOADING' | 'LOGIN_REQUIRED' | 'DETAILS_REQUIRED' | 'READY';

export const CUSTOMER_PROFILE_KEY = ['customer-profile'] as const;

export function useCustomerProfile() {
  const isCustomer = useSessionStore((s) => !!s.accessToken && s.principalType === 'CUSTOMER');
  const query = useQuery({ queryKey: CUSTOMER_PROFILE_KEY, queryFn: CustomerApi.me, enabled: isCustomer, staleTime: 30_000 });
  return { isCustomer, ...query };
}

export function useDeliveryReadiness(): { status: DeliveryStatus; profile?: CustomerProfile } {
  const { isCustomer, data, isLoading, isError } = useCustomerProfile();
  if (!isCustomer) return { status: 'LOGIN_REQUIRED' };
  if (isLoading) return { status: 'LOADING' };
  // If the profile cannot be loaded, do not let them through on a guess.
  if (isError || !data) return { status: 'DETAILS_REQUIRED' };
  return { status: data.delivery.ready ? 'READY' : 'DETAILS_REQUIRED', profile: data };
}

/** Builds the URL of the login / details page with a return path. */
export function deliverySetupPath(status: DeliveryStatus, next: string): string {
  const q = `?next=${encodeURIComponent(next)}`;
  return status === 'LOGIN_REQUIRED' ? `/account${q}&reason=delivery` : `/delivery-details${q}`;
}

/** Only allow same-site relative paths as a post-save redirect target (prevents open redirects). */
export function safeNext(value: string | null, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
