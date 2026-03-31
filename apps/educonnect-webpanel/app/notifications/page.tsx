'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { NotificationService, Notification as AppNotification, NotificationType } from '@/services/notificationService';
import { useDocumentTitle } from '@/hooks';
import EmptyState from '@/components/common/EmptyState';
import Button from '@/components/common/Button';
import {
  Bell, BellOff, CheckCheck, Info, AlertTriangle, AlertCircle,
  CheckCircle2, CreditCard, Shield, Settings,
  Trash2, Eye, Filter, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';

// ─── Helpers ─────────────────────────────────────────────
const typeConfig: Record<NotificationType, { icon: React.ElementType; color: string; bg: string }> = {
  info:         { icon: Info,          color: 'text-blue-600',    bg: 'bg-blue-50' },
  warning:      { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-50' },
  error:        { icon: AlertCircle,   color: 'text-red-600',     bg: 'bg-red-50' },
  success:      { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
  payment:      { icon: CreditCard,    color: 'text-violet-600',  bg: 'bg-violet-50' },
  subscription: { icon: Shield,        color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  system:       { icon: Settings,      color: 'text-slate-600',   bg: 'bg-slate-100' },
};

type FilterTab = 'all' | 'unread' | 'read';

export default function NotificationsPage() {
  useDocumentTitle('Notifications');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await NotificationService.getNotifications({ limit: 100 });
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await NotificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      toast.error('Failed to mark as read');
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await NotificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  };

  const filtered = useMemo(() => {
    if (activeTab === 'unread') return notifications.filter(n => !n.read);
    if (activeTab === 'read') return notifications.filter(n => n.read);
    return notifications;
  }, [notifications, activeTab]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'read', label: 'Read' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Notifications</h1>
              <p className="text-sm text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setLoading(true); fetchNotifications(); }}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={markingAll}
              >
                <CheckCheck className="w-4 h-4 mr-1.5" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="ml-1.5 text-xs text-slate-400">({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<BellOff className="w-8 h-8" />}
            title="No notifications"
            description={activeTab === 'unread' ? 'You have no unread notifications.' : 'No notifications to show.'}
          />
        ) : (
          <div className="space-y-2">
            {filtered.map(notification => {
              const config = typeConfig[notification.type] || typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer group ${
                    notification.read
                      ? 'bg-white border-slate-200 hover:bg-slate-50'
                      : 'bg-blue-50/30 border-blue-200/60 hover:bg-blue-50/50'
                  }`}
                  onClick={() => !notification.read && handleMarkRead(notification.id)}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl ${config.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={`text-sm font-medium ${notification.read ? 'text-slate-700' : 'text-slate-900'}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                      </div>
                      {!notification.read && (
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
