const buildTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(__APP_BUILD_TIME__))

export function VersionBadge() {
  return (
    <div className="version-badge">
      v{__APP_VERSION__} · {__APP_COMMIT__} · {buildTime}
    </div>
  )
}
