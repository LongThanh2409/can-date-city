import { useEffect, useState } from 'react'
import {
  Check, ChevronDown, Edit2, Loader2, Lock, Mail, Plus, Shield, Trash2,
  TriangleAlert, User, UserCheck, UserX, X
} from 'lucide-react'
import { subscribeAllowedUsers } from '../services/firestore'
import { createManagedUser, removeManagedUser, updateManagedUser } from '../services/authAdmin'
import type { AllowedUser, UserRole } from '../types'

interface Props {
  notify: (message: string, error?: boolean) => void
  onClose: () => void
  currentUid: string
}

const ROLE_LABELS: Record<UserRole, string> = { admin: 'Quản trị viên', sale: 'Nhân viên bán hàng', user: 'Người dùng' }
const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-rose-100 text-rose-700 border-rose-200',
  sale: 'bg-amber-100 text-amber-700 border-amber-200',
  user: 'bg-slate-100 text-slate-600 border-slate-200',
}
const usesAdminFunctions = import.meta.env.VITE_USE_ADMIN_FUNCTIONS === 'true'

const emptyForm = (): FormState => ({ active: true, displayName: '', email: '', role: 'user', password: '' })

interface FormState {
  active: boolean
  displayName: string
  email: string
  role: UserRole
  password: string
}

export function AdminPanel({ notify, onClose, currentUid }: Props) {
  const [users, setUsers] = useState<AllowedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingUid, setDeletingUid] = useState<string | null>(null)
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeAllowedUsers(
      (items) => { setUsers(items); setLoading(false) },
      () => { notify('Không thể tải danh sách tài khoản.', true); setLoading(false) },
    )
    return unsub
  }, [notify])
  useEffect(()=>{const close=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(formOpen)closeForm();else onClose()};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[formOpen,onClose])

  function openCreate() {
    setEditingUid(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  function openEdit(u: AllowedUser) {
    setEditingUid(u.uid)
    setForm({ active: u.active, displayName: u.displayName ?? '', email: u.email ?? '', role: u.role ?? 'user', password: '' })
    setFormOpen(true)
  }

  function closeForm() { setFormOpen(false); setEditingUid(null); setForm(emptyForm()) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.displayName.trim()) { notify('Vui lòng nhập tên hiển thị.', true); return }
    if (!editingUid && !form.email.trim()) { notify('Vui lòng nhập email.', true); return }
    if (!editingUid && form.password.length < 6) { notify('Mật khẩu phải từ 6 ký tự trở lên.', true); return }
    if (editingUid === currentUid && (!form.active || form.role !== 'admin')) { notify('Không thể vô hiệu hóa hoặc hạ quyền tài khoản admin đang đăng nhập.', true); return }
    setSaving(true)
    try {
      if (editingUid) await updateManagedUser({
        uid:editingUid,
        active: form.active,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        role: form.role,
      })
      else await createManagedUser({
        active: form.active,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        role: form.role,
      },form.password)
      notify(editingUid ? 'Đã cập nhật tài khoản.' : 'Đã tạo tài khoản mới.')
      closeForm()
    } catch (err) {
      notify((err as Error).message || 'Thao tác thất bại.', true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(uid: string) {
    if (uid === currentUid) { notify('Không thể xóa quyền của tài khoản admin đang đăng nhập.', true); return }
    if (confirmDeleteUid !== uid) { setConfirmDeleteUid(uid); return }
    setDeletingUid(uid)
    setConfirmDeleteUid(null)
    try {
      await removeManagedUser(uid)
      notify('Đã xóa tài khoản khỏi danh sách cho phép.')
    } catch {
      notify('Xóa tài khoản thất bại.', true)
    } finally {
      setDeletingUid(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 backdrop-blur-sm">
      {/* Panel */}
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-brand-900 to-brand-700 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Quản lý tài khoản</h2>
              <p className="text-[11px] text-teal-100/70">Chỉ quản trị viên mới có quyền truy cập</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <p className="text-sm text-slate-500">
            {loading ? 'Đang tải…' : `${users.length} tài khoản`}
          </p>
          <button
            className="btn-primary"
            onClick={openCreate}
          >
            <Plus size={16} /> Thêm tài khoản
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Đang tải dữ liệu…</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <User size={36} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Chưa có tài khoản nào</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 pl-6 pr-3 text-left">Tên hiển thị</th>
                  <th className="px-3 py-2.5 text-left">Email</th>
                  <th className="px-3 py-2.5 text-left">Vai trò</th>
                  <th className="px-3 py-2.5 text-center">Trạng thái</th>
                  <th className="py-2.5 pl-3 pr-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => {
                  const displayName = u.displayName?.trim() || u.email?.split('@')[0] || 'Chưa đặt tên'
                  const email = u.email?.trim() || 'Chưa có email trong dữ liệu cũ'
                  return <tr key={u.uid} className="transition hover:bg-slate-50/60">
                    <td className="py-3 pl-6 pr-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                          {displayName.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-slate-800">{displayName}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Mail size={13} className="shrink-0 text-slate-400" />
                        {email}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[u.role]}`}>
                        {u.role === 'admin' && <Shield size={11} />}
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {u.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          <UserCheck size={12} /> Hoạt động
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                          <UserX size={12} /> Vô hiệu
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          className="icon-btn"
                          title="Chỉnh sửa"
                          onClick={() => openEdit(u)}
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          className={`icon-btn transition ${confirmDeleteUid === u.uid ? 'border-rose-300 bg-rose-50 text-rose-600' : 'text-rose-500 hover:border-rose-300 hover:bg-rose-50'}`}
                          title={confirmDeleteUid === u.uid ? 'Nhấn lần nữa để xác nhận xóa' : 'Xóa tài khoản'}
                          disabled={deletingUid === u.uid || u.uid === currentUid}
                          onClick={() => void handleDelete(u.uid)}
                        >
                          {deletingUid === u.uid ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                        {confirmDeleteUid === u.uid && (
                          <button
                            className="icon-btn border-slate-300 text-slate-500"
                            title="Hủy xóa"
                            onClick={() => setConfirmDeleteUid(null)}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Warning footer */}
        <div className="rounded-b-2xl border-t bg-amber-50 px-6 py-3">
          <p className="flex items-start gap-2 text-xs text-amber-700">
            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
            {usesAdminFunctions ? 'Xóa tài khoản sẽ thu hồi quyền và xóa luôn tài khoản Firebase Authentication.' : <>Xóa tài khoản khỏi danh sách sẽ thu hồi quyền truy cập nhưng <strong className="mx-0.5">không xóa</strong> tài khoản Firebase Auth. Deploy Functions và bật VITE_USE_ADMIN_FUNCTIONS để đồng bộ hoàn toàn.</>}
          </p>
        </div>
      </div>

      {/* ── Form Modal ─────────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-4">
              <h3 className="font-bold text-white">
                {editingUid ? 'Chỉnh sửa tài khoản' : 'Tạo tài khoản mới'}
              </h3>
              <button
                onClick={closeForm}
                aria-label="Đóng biểu mẫu"
                className="grid h-7 w-7 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-5">
              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Trạng thái tài khoản</p>
                  <p className="text-xs text-slate-400">{form.active ? 'Đang hoạt động' : 'Vô hiệu hóa'}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.active}
                  onClick={() => setForm({ ...form, active: !form.active })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${form.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-200 ${form.active ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>

              {/* Display Name */}
              <div>
                <label className="label" htmlFor="admin-displayName">
                  <User size={13} className="inline mr-1" />Tên hiển thị <span className="text-rose-500">*</span>
                </label>
                <input
                  id="admin-displayName"
                  className="input"
                  type="text"
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* Email — chỉ nhập khi tạo mới */}
              <div>
                <label className="label" htmlFor="admin-email">
                  <Mail size={13} className="inline mr-1" />Email <span className="text-rose-500">*</span>
                  {editingUid && <span className="ml-1 text-slate-400">(không thể thay đổi)</span>}
                </label>
                <input
                  id="admin-email"
                  className={`input ${editingUid ? 'cursor-not-allowed opacity-60' : ''}`}
                  type="email"
                  placeholder="ten@congty.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required={!editingUid}
                  disabled={!!editingUid}
                />
              </div>

              {/* Role */}
              <div>
                <label className="label" htmlFor="admin-role">
                  <Shield size={13} className="inline mr-1" />Vai trò
                </label>
                <div className="relative">
                  <select
                    id="admin-role"
                    className="input appearance-none pr-8"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                  >
                    <option value="user">Người xem — chỉ xem và xuất báo cáo</option>
                    <option value="sale">Nhân viên bán hàng — chỉ sửa ghi chú bán</option>
                    <option value="admin">Quản trị viên — toàn quyền</option>
                  </select>
                  <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              {/* Password — chỉ khi tạo mới */}
              {!editingUid && (
                <div>
                  <label className="label" htmlFor="admin-password">
                    <Lock size={13} className="inline mr-1" />Mật khẩu <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="admin-password"
                    className="input"
                    type="password"
                    placeholder="Tối thiểu 6 ký tự"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={6}
                    required
                  />
                  <p className="mt-1 text-xs text-slate-400">Mật khẩu chỉ dùng để tạo tài khoản, không lưu trong cơ sở dữ liệu.</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 border-t pt-3">
                <button type="button" className="btn-secondary flex-1" onClick={closeForm} disabled={saving}>
                  Hủy
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving
                    ? <><Loader2 size={15} className="animate-spin" />Đang lưu…</>
                    : <><Check size={15} />{editingUid ? 'Lưu thay đổi' : 'Tạo tài khoản'}</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
