import { useEffect, useState } from 'react'
import {
  Bell,
  Bookmark,
  FileText,
  Globe2,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { SECTIONS } from '../utils/forumConstants'

function Sidebar({
  activeSection,
  onChange,
  dark,
  onToggleDark,
  roleKey,
  mobileOpen: mobileOpenProp,
  unreadNotificationsCount = 0,
  pendingReviewCount = 0,
  onExpandedChange,
  onClose,
}) {
  const [desktopHovered, setDesktopHovered] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(Boolean(mobileOpenProp))
  const expanded = desktopHovered || mobileOpen

  useEffect(() => {
    setMobileOpen(Boolean(mobileOpenProp))
  }, [mobileOpenProp])

  useEffect(() => {
    onExpandedChange?.(desktopHovered)
    return () => onExpandedChange?.(false)
  }, [desktopHovered, onExpandedChange])

  const closeMobile = () => {
    setMobileOpen(false)
    onClose?.()
  }

  const items = [
    { id: SECTIONS.HALL, label: 'Cộng đồng ZUNY', icon: Globe2 },
    { id: SECTIONS.GROUPS, label: 'Nhóm học', icon: Users },
    { id: SECTIONS.MY_POSTS, label: 'Bài của tôi', icon: FileText },
    { id: SECTIONS.SAVED, label: 'Đã lưu', icon: Bookmark },
    { id: SECTIONS.NOTIFICATIONS, label: 'Thông báo', icon: Bell, badge: unreadNotificationsCount },
    ...(roleKey === 'admin_dev'
      ? [{ id: SECTIONS.ADMIN_REVIEW, label: 'Quản lý', icon: ShieldCheck, badge: pendingReviewCount }]
      : []),
  ]

  const content = (
    <aside
      className={`flex h-full max-h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-200/70 backdrop-blur transition-all duration-300 dark:border-white/10 dark:bg-slate-950/95 dark:shadow-black/20 ${expanded ? 'w-72' : 'w-24'
        }`}
    >
      <div className={`shrink-0 flex items-center gap-3 px-2 py-2 ${expanded ? 'justify-between' : 'justify-center'}`}>
        <div className={`flex items-center gap-3 ${expanded ? '' : 'justify-center'}`}>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-cyan-500 text-white shadow-lg shadow-sky-500/25">
            <Globe2 className="h-6 w-6" />
          </div>

          {expanded && (
            <div>
    <aside
      className={`relative flex h-fit max-h-[calc(100dvh-112px)] shrink-0 flex-col overflow-hidden rounded-[26px] border p-2 transition-[width] duration-300 ease-out ${expanded ? 'w-[240px]' : 'w-16'
        } border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-200/70 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:shadow-black/20`}
          )}
        </div>
      <div className={`flex h-[64px] shrink-0 items-center border-b ${expanded ? 'gap-3 px-2' : 'justify-center px-1'} border-slate-200/80 dark:border-white/10`}>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="mt-8 flex-1 space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const Icon = item.icon
          const active = activeSection === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              title={!expanded ? item.label : undefined}
              className={`flex w-full items-center rounded-2xl px-4 py-3 text-sm font-black transition ${expanded ? 'gap-3' : 'justify-center'
                } ${active
                  ? 'bg-gradient-to-r from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-500/25'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'
                }`}
            >
              <span className="relative inline-flex">
                <Icon className="h-5 w-5 shrink-0" />
                {item.badge > 0 && (
                  <span className="absolute -right-2.5 -top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-black text-white shadow-lg shadow-cyan-400/40">
                    {item.badge > 999 ? '999+' : item.badge}
                  </span>
                )}
              </span>
              {expanded && <span className="truncate">{item.label}</span>}
            </button>
          )
        })}
      </nav>

    </aside>
        )

        return (
        <>
          <div className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block" onMouseEnter={() => setDesktopHovered(true)} onMouseLeave={() => setDesktopHovered(false)}>{content}</div>
          <nav className="forum-mobile-navbar lg:hidden" aria-label="Điều hướng diễn đàn">
            {items.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" className={activeSection === item.id ? 'active' : ''} onClick={() => onChange(item.id)} aria-label={item.label}><span className="relative"><Icon className="h-5 w-5" />{item.badge > 0 && <b>{item.badge > 999 ? '999+' : item.badge}</b>}</span><small>{item.label}</small></button> })}
          </nav>
        </>
        )
}


        export default Sidebar
