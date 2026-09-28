import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { NotificationApi } from '@/services/staffApi';
import { getStaffSocket } from '@/services/socketClient';
import { cn } from '@/utils/cn';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: ['notifications'], queryFn: NotificationApi.list, refetchInterval: 30000 });

  useEffect(() => {
    const socket = getStaffSocket();
    const onNew = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [queryClient]);

  const markAllRead = useMutation({
    mutationFn: NotificationApi.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-neutral-200 bg-white shadow-floating">
            <div className="flex items-center justify-between border-b border-neutral-100 p-3">
              <h3 className="text-sm font-semibold text-ink-900">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={() => markAllRead.mutate()} className="text-xs text-brand-600 hover:underline">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(data?.items ?? []).length === 0 && <p className="p-4 text-center text-sm text-neutral-400">No notifications yet.</p>}
              {data?.items?.map((n: { _id: string; title: string; message: string; isRead: boolean; createdAt: string }) => (
                <div key={n._id} className={cn('border-b border-neutral-50 p-3 text-sm', !n.isRead && 'bg-brand-50/50')}>
                  <p className="font-medium text-ink-900">{n.title}</p>
                  <p className="text-xs text-neutral-500">{n.message}</p>
                  <p className="mt-1 text-[10px] text-neutral-400">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
