import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; onDismiss?: () => void }
type State = { error?: unknown }

const CHUNK_ERROR = /dynamically imported module|importing a module script failed|error loading dynamically|loading (css )?chunk/i
const overlay: CSSProperties = { position: 'fixed', inset: 0, zIndex: 90, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(2,6,23,.55)', fontFamily: 'system-ui,sans-serif' }
const card: CSSProperties = { maxWidth: 420, padding: 24, borderRadius: 14, background: '#fff', color: '#0f172a', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }
const button: CSSProperties = { padding: '9px 16px', borderRadius: 10, border: '1px solid #0f766e', background: '#0f766e', color: '#fff', font: 'inherit', fontWeight: 600, cursor: 'pointer' }

/** Keeps a render or lazy-chunk failure from unmounting the whole React tree, which leaves a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error') }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  private dismiss = () => {
    this.props.onDismiss?.()
    this.setState({ error: undefined })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const isChunkError = CHUNK_ERROR.test(error instanceof Error ? error.message : String(error))
    return (
      <div style={overlay} role="alert">
        <div style={card}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{isChunkError ? 'Không tải được chức năng này' : 'Ứng dụng gặp lỗi hiển thị'}</h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.5 }}>
            {isChunkError ? 'Mạng có thể đang chập chờn, hoặc ứng dụng vừa có bản cập nhật.' : 'Dữ liệu đã lưu không bị ảnh hưởng.'} Hãy tải lại trang để tiếp tục.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {this.props.onDismiss && <button type="button" style={{ ...button, background: '#fff', color: '#0f766e' }} onClick={this.dismiss}>Đóng</button>}
            <button type="button" style={button} onClick={() => window.location.reload()}>Tải lại trang</button>
          </div>
        </div>
      </div>
    )
  }
}
