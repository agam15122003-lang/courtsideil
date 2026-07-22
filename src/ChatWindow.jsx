import { useRef, useEffect, useState } from 'react'
import { Trash2, Send } from 'lucide-react'
import Avatar from './Avatar'
import { SkeletonCards } from './Skeleton'
import { L } from './i18n'

const GROUP_GAP = 5 * 60 * 1000 // הודעות בטווח 5 דק' מאותו שולח מתקבצות

function sameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function dayLabel(ts) {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diff = Math.round((today - that) / 86400000)
  if (diff === 0) return L('היום', 'Today')
  if (diff === 1) return L('אתמול', 'Yesterday')
  return d.toLocaleDateString(L('he-IL', 'en-US'), { day: 'numeric', month: 'numeric', year: 'numeric' })
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString(L('he-IL', 'en-US'), { hour: '2-digit', minute: '2-digit' })
}

function ChatBubble({ it, mine, showAuthor, onDelete }) {
  const { m, firstOfGroup, lastOfGroup } = it
  return (
    <div
      className={
        'chat-row' +
        (mine ? ' mine' : '') +
        (firstOfGroup ? ' first' : '') +
        (lastOfGroup ? ' last' : '')
      }
    >
      {!mine && (
        <div className="chat-ava">{lastOfGroup ? <Avatar name={m.senderName} size={30} /> : null}</div>
      )}
      <div className="chat-col">
        {showAuthor && !mine && firstOfGroup && <span className="chat-name">{m.senderName}</span>}
        <div className="chat-bubble">
          <span className="chat-bubble-text">{m.content}</span>
          {mine && onDelete && (
            <button
              type="button"
              className="chat-del"
              onClick={() => onDelete(m.id)}
              aria-label={L('מחיקת הודעה', 'Delete message')}
              title={L('מחיקה', 'Delete')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        {lastOfGroup && <span className="chat-time">{timeLabel(m.created_at)}</span>}
      </div>
    </div>
  )
}

// מסך צ'אט מודרני משותף (פרטי + קבוצתי).
// props: messages [{id,content,created_at,senderId,senderName}], myId,
//   onSend(text), onDelete(id), sending, loading, error, empty (node),
//   header (node, אופציונלי), showAuthor (bool — שמות שולחים בקבוצתי)
export default function ChatWindow({
  messages,
  myId,
  onSend,
  onDelete,
  sending,
  loading,
  error,
  empty,
  header,
  showAuthor,
  readOnly,
  readOnlyNote,
}) {
  const scrollRef = useRef(null)
  const taRef = useRef(null)
  const [hasText, setHasText] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading])

  const submit = async () => {
    const ta = taRef.current
    const val = (ta?.value || '').trim()
    if (!val || sending) return
    // מנקים את התיבה רק אחרי שהשליחה הצליחה — כדי לא לאבד הודעה בכשל רשת
    const ok = await onSend(val)
    if (ok !== false && ta) {
      ta.value = ''
      ta.style.height = 'auto'
      setHasText(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = (e) => {
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    setHasText(!!ta.value.trim())
  }

  // בניית פריטי תצוגה: מפרידי תאריך + הודעות עם דגלי קיבוץ
  const items = []
  let prev = null
  messages.forEach((m, i) => {
    if (!prev || !sameDay(prev.created_at, m.created_at)) {
      items.push({ type: 'divider', id: 'd' + m.id, label: dayLabel(m.created_at) })
    }
    const grouped =
      prev &&
      prev.senderId === m.senderId &&
      sameDay(prev.created_at, m.created_at) &&
      new Date(m.created_at) - new Date(prev.created_at) < GROUP_GAP
    const next = messages[i + 1]
    const groupedNext =
      next &&
      next.senderId === m.senderId &&
      sameDay(next.created_at, m.created_at) &&
      new Date(next.created_at) - new Date(m.created_at) < GROUP_GAP
    items.push({ type: 'msg', m, firstOfGroup: !grouped, lastOfGroup: !groupedNext })
    prev = m
  })

  return (
    <div className="chat">
      {header && <div className="chat-header">{header}</div>}

      <div className="chat-scroll" ref={scrollRef}>
        {loading ? (
          <SkeletonCards count={3} />
        ) : error ? (
          <div className="alert alert-error" role="alert">{error}</div>
        ) : messages.length === 0 ? (
          empty
        ) : (
          items.map((it) =>
            it.type === 'divider' ? (
              <div key={it.id} className="chat-divider">
                <span>{it.label}</span>
              </div>
            ) : (
              <ChatBubble
                key={it.m.id}
                it={it}
                mine={it.m.senderId === myId}
                showAuthor={showAuthor}
                onDelete={onDelete}
              />
            )
          )
        )}
      </div>

      {readOnly ? (
        <div className="chat-readonly">{readOnlyNote || L('הצ׳אט במצב קריאה בלבד', 'Chat is read-only')}</div>
      ) : (
        <div className="chat-composer">
          <textarea
            ref={taRef}
            className="chat-input"
            rows={1}
            maxLength={2000}
            placeholder={L('כתוב הודעה...', 'Type a message...')}
            onKeyDown={onKeyDown}
            onInput={onInput}
            aria-label={L('כתיבת הודעה', 'Write a message')}
          />
          <button
            className="btn-send"
            disabled={sending || !hasText}
            onClick={submit}
            aria-label={L('שליחה', 'Send')}
            title={L('שליחה', 'Send')}
          >
            <Send size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
