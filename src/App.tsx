import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  ShieldAlert, 
  CheckCircle2, 
  RefreshCw, 
  LogOut, 
  Plus, 
  ExternalLink, 
  Sparkles, 
  Tv, 
  Globe, 
  Clock, 
  AlertCircle,
  Filter,
  Flame,
  Radio
} from 'lucide-react';
import { initAuth, googleSignIn, logout } from './services/auth';
import { User } from 'firebase/auth';

interface VCTEvent {
  title: string;
  league: string;
  tier?: 'Tier 1' | 'Tier 2' | string;
  startDate: string;
  endDate: string;
  description: string;
  tournamentName: string;
  stage?: string;
  eta?: string;
  vlrUrl?: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [events, setEvents] = useState<VCTEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<string>('');
  
  // Filtering
  const [tierFilter, setTierFilter] = useState<'All' | 'Tier 1' | 'Tier 2'>('All');
  const [selectedLeague, setSelectedLeague] = useState<string>('すべて');
  
  const [syncedEvents, setSyncedEvents] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal confirmation state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setNeedsAuth(false);
      }
    } catch (err: any) {
      setError(err.message || 'Googleログインに失敗しました');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
  };

  const fetchSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vct/schedule');
      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        setEvents(data.events);
        if (data.source) setDataSource(data.source);
      } else {
        setError(data.error || 'VLR.ggからの直接スクレイピングに失敗しました');
      }
    } catch (err: any) {
      setError(err.message || 'スケジュールの取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const addToGoogleCalendar = async (event: VCTEvent) => {
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Googleカレンダーに対戦カードを追加',
      message: `「${event.title}」(${event.tournamentName}) をGoogleカレンダーに追加しますか？`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setSyncing(event.title);
        setStatusMessage(null);

        try {
          const startDateTime = event.startDate ? new Date(event.startDate) : new Date();
          const endDateTime = event.endDate ? new Date(event.endDate) : new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);

          const calendarEvent = {
            summary: `[VALORANT] ${event.title}`,
            description: `${event.description}\n\n大会名: ${event.tournamentName}\nリーグ/部門: ${event.league}\n詳細URL: ${event.vlrUrl || 'https://www.vlr.gg/matches'}\n\n(VLR.gg公式リアルタイム日程より同期)`,
            start: {
              dateTime: startDateTime.toISOString(),
            },
            end: {
              dateTime: endDateTime.toISOString(),
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup', minutes: 15 },
              ],
            },
          };

          const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(calendarEvent),
          });

          if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error?.message || 'カレンダーイベントの作成に失敗しました');
          }

          setSyncedEvents(prev => ({ ...prev, [event.title]: true }));
          setStatusMessage({ type: 'success', text: `「${event.title}」をGoogleカレンダーに追加しました！` });
        } catch (err: any) {
          console.error(err);
          setStatusMessage({ type: 'error', text: err.message || 'カレンダーへの同期に失敗しました' });
        } finally {
          setSyncing(null);
        }
      }
    });
  };

  const addAllToCalendar = async () => {
    if (!token) {
      setNeedsAuth(true);
      return;
    }

    const filtered = filteredEvents.filter(e => !syncedEvents[e.title]);
    if (filtered.length === 0) {
      setStatusMessage({ type: 'error', text: '現在表示中で未同期のイベントはありません。' });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '表示中の全対戦を一括同期',
      message: `表示中のVLR.gg対戦カード ${filtered.length} 件をGoogleカレンダーに一括追加しますか？`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setSyncing('ALL');
        setStatusMessage(null);

        let successCount = 0;
        for (const event of filtered) {
          try {
            const startDateTime = event.startDate ? new Date(event.startDate) : new Date();
            const endDateTime = event.endDate ? new Date(event.endDate) : new Date(startDateTime.getTime() + 2 * 60 * 60 * 1000);

            const calendarEvent = {
              summary: `[VALORANT] ${event.title}`,
              description: `${event.description}\n\n大会名: ${event.tournamentName}\nリーグ: ${event.league}\n詳細URL: ${event.vlrUrl || 'https://www.vlr.gg/matches'}`,
              start: { dateTime: startDateTime.toISOString() },
              end: { dateTime: endDateTime.toISOString() },
            };

            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(calendarEvent),
            });

            if (res.ok) {
              successCount++;
              setSyncedEvents(prev => ({ ...prev, [event.title]: true }));
            }
          } catch (e) {
            console.error('Error adding event', event.title, e);
          }
        }

        setStatusMessage({ type: 'success', text: `${successCount} 件の対戦カードをGoogleカレンダーに追加しました！` });
        setSyncing(null);
      }
    });
  };

  const dynamicLeagues = ['すべて', ...Array.from(new Set(events.map(e => e.league).filter(Boolean)))];

  const filteredEvents = events.filter(e => {
    if (tierFilter === 'Tier 1' && !e.tier?.includes('Tier 1')) return false;
    if (tierFilter === 'Tier 2' && !e.tier?.includes('Tier 2')) return false;
    if (selectedLeague !== 'すべて' && e.league !== selectedLeague) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0f1923] text-white flex flex-col font-sans selection:bg-[#ff4655] selection:text-white">
      {/* Top Header */}
      <header className="border-b border-[#2b3540] bg-[#101820]/90 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-[#ff4655] flex items-center justify-center font-black text-xl shadow-lg shadow-[#ff4655]/30 tracking-tighter">
            VLR
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wide flex items-center gap-2">
              VLR.gg 直接リアルタイム同期
              <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> LIVE SCRAPING
              </span>
            </h1>
            <p className="text-xs text-gray-400">VLR.ggの/matchesから直接抽出した最新の対戦カード日程</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {needsAuth ? (
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="gsi-material-button flex items-center space-x-2 bg-white text-black px-4 py-2 rounded-md font-medium hover:bg-gray-100 transition shadow"
            >
              <div className="w-5 h-5">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              </div>
              <span>{isLoggingIn ? '接続中...' : 'Googleでログイン'}</span>
            </button>
          ) : (
            <div className="flex items-center space-x-3 bg-[#1f2c37] px-3 py-1.5 rounded-lg border border-[#2b3540]">
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'ユーザー'} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#ff4655] flex items-center justify-center font-bold">
                  {user?.email?.[0]?.toUpperCase() || 'U'}
                </div>
              )}
              <div className="text-left text-xs">
                <p className="font-semibold">{user?.displayName || user?.email}</p>
                <p className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> カレンダー連携済み
                </p>
              </div>
              <button
                onClick={handleLogout}
                title="ログアウト"
                className="p-1.5 hover:bg-[#2b3540] rounded text-gray-400 hover:text-white transition ml-2"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        
        {/* Hero Banner */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1f2c37] via-[#101820] to-[#1f2c37] border border-[#2b3540] p-8 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#ff4655]/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="space-y-3 z-10 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#ff4655]/20 text-[#ff4655] border border-[#ff4655]/30 text-xs font-semibold">
              <Flame className="w-3.5 h-3.5" /> VLR.gg 公式サイト直結
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white">
              VLR.ggの全対戦スケジュールをそのまま反映
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              VLR.gg（https://www.vlr.gg/matches）からHTMLを直接パースし、リアルタイムに掲載されている全対戦カード（Game Changers São Paulo、VCT China Threshold、Project Blender等）をそのまま正確に取得・同期します。
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 z-10 w-full md:w-auto">
            <button
              onClick={fetchSchedule}
              disabled={loading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#2b3540] hover:bg-[#384452] text-white px-5 py-3 rounded-xl font-medium transition border border-gray-700 shadow"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'VLRから取得中...' : 'VLR.ggから再取得'}
            </button>
            <button
              onClick={addAllToCalendar}
              disabled={loading || syncing !== null || filteredEvents.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#ff4655] hover:bg-[#e03b48] text-white px-6 py-3 rounded-xl font-semibold transition shadow-lg shadow-[#ff4655]/30 disabled:opacity-50"
            >
              <Calendar className="w-4 h-4" />
              {syncing === 'ALL' ? '一括同期中...' : '表示中すべてをカレンダー同期'}
            </button>
          </div>
        </div>

        {/* Status Messages */}
        {statusMessage && (
          <div className={`p-4 rounded-xl border flex items-center justify-between shadow-lg animate-fadeIn ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200' 
              : 'bg-red-950/40 border-red-500/50 text-red-200'
          }`}>
            <div className="flex items-center space-x-3">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-red-400" />}
              <span className="text-sm font-medium">{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-sm opacity-70 hover:opacity-100 font-bold">閉じる</button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/40 text-red-200 flex items-center space-x-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {needsAuth && (
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Globe className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="text-sm">Googleカレンダーに大会日程を追加するには、右上のGoogleログインを行ってください。</span>
            </div>
            <button 
              onClick={handleLogin}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-lg text-xs transition whitespace-nowrap ml-4"
            >
              ログインする
            </button>
          </div>
        )}

        {/* Tier & League Filters */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#141d26] p-4 rounded-2xl border border-[#2b3540]">
          
          {/* Tier Switcher */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-400 flex items-center gap-1 font-semibold mr-1">
              <Filter className="w-3.5 h-3.5" /> ランク:
            </span>
            {(['All', 'Tier 1', 'Tier 2'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => setTierFilter(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  tierFilter === tier
                    ? tier === 'Tier 2' 
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20' 
                      : tier === 'Tier 1'
                      ? 'bg-cyan-500 text-black shadow-md shadow-cyan-500/20'
                      : 'bg-white text-black'
                    : 'bg-[#1f2c37] text-gray-400 hover:text-white border border-[#2b3540]'
                }`}
              >
                {tier === 'All' ? 'すべて' : tier}
              </button>
            ))}
          </div>

          {/* League Filter */}
          <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {dynamicLeagues.map(league => (
              <button
                key={league}
                onClick={() => setSelectedLeague(league)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  selectedLeague === league
                    ? 'bg-[#ff4655] text-white font-bold shadow-md shadow-[#ff4655]/20'
                    : 'bg-[#18222c] text-gray-400 hover:bg-[#22303d] hover:text-white border border-[#2b3540]'
                }`}
              >
                {league}
              </button>
            ))}
          </div>

          <div className="text-xs text-gray-400 whitespace-nowrap">
            VLR.gg直通: <span className="font-bold text-white">{filteredEvents.length}</span> / {events.length} 件
          </div>
        </div>

        {/* Events Grid */}
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-12 h-12 border-4 border-[#ff4655] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-gray-400">VLR.ggからリアルタイムにHTMLを取得・解析中...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-20 bg-[#141d26] rounded-2xl border border-[#2b3540]">
            <Tv className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-300">該当する対戦は見つかりませんでした</h3>
            <p className="text-xs text-gray-500 mt-1">フィルターの条件を変更するか、「VLR.ggから再取得」をお試しください。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredEvents.map((event, idx) => {
              const isSynced = syncedEvents[event.title];
              const isSyncingThis = syncing === event.title;
              const isTier2 = event.tier?.includes('Tier 2');

              return (
                <div 
                  key={idx} 
                  className="bg-[#141d26] rounded-2xl border border-[#2b3540] hover:border-gray-600 transition-all duration-300 flex flex-col justify-between p-6 shadow-xl relative overflow-hidden group"
                >
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl transition-all ${
                    isTier2 ? 'bg-amber-500/5 group-hover:bg-amber-500/15' : 'bg-[#ff4655]/5 group-hover:bg-[#ff4655]/15'
                  }`}></div>
                  
                  <div className="space-y-3 z-10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                          isTier2 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' 
                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                        }`}>
                          {event.tier || 'Official'}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1f2c37] text-gray-300 border border-[#2b3540]">
                          {event.league}
                        </span>
                      </div>
                      {event.eta && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          event.eta.includes('LIVE') 
                            ? 'bg-red-500 text-white animate-pulse' 
                            : 'bg-[#1f2c37] text-gray-400'
                        }`}>
                          {event.eta}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-white tracking-wide leading-snug">
                      {event.title}
                    </h3>

                    <div className="text-xs text-gray-300 space-y-1">
                      <p className="font-semibold text-gray-200">{event.tournamentName}</p>
                      {event.stage && <p className="text-gray-400 text-[11px]">{event.stage}</p>}
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-[#2b3540] flex items-center justify-between z-10">
                    <div className="flex items-center space-x-1.5 text-xs text-gray-400">
                      <Clock className="w-3.5 h-3.5 text-[#ff4655]" />
                      <span>{event.startDate ? new Date(event.startDate).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未定'}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {event.vlrUrl && (
                        <a
                          href={event.vlrUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="VLR.ggでこの試合を見る"
                          className="p-2 rounded-lg bg-[#1f2c37] text-gray-400 hover:text-white hover:bg-[#2b3540] transition"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      
                      <button
                        onClick={() => addToGoogleCalendar(event)}
                        disabled={isSynced || isSyncingThis || needsAuth}
                        className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                          isSynced
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 cursor-default'
                            : 'bg-[#ff4655] hover:bg-[#e03b48] text-white shadow-md shadow-[#ff4655]/20 disabled:opacity-50'
                        }`}
                      >
                        {isSynced ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>追加済み</span>
                          </>
                        ) : isSyncingThis ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>追加中...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>カレンダーに追加</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141d26] border border-[#2b3540] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center space-x-3 text-[#ff4655]">
              <Sparkles className="w-6 h-6" />
              <h3 className="text-lg font-bold text-white">{confirmModal.title}</h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#2b3540]">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-[#1f2c37] hover:bg-[#2b3540] text-gray-300 transition"
              >
                キャンセル
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#ff4655] hover:bg-[#e03b48] text-white transition shadow-lg shadow-[#ff4655]/30"
              >
                確認して追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#2b3540] bg-[#101820] py-6 px-6 text-center text-xs text-gray-500">
        <p>VLR.gg 直接抽出 カレンダー同期 • 提供元: https://www.vlr.gg/matches • リアルタイムライブ同期</p>
      </footer>
    </div>
  );
}
