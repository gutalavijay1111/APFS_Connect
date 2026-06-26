import React, { useState, useEffect, useRef, useCallback } from 'react';
import { simApi } from '../utils/simulatorApi';

// ── Known flow commands ───────────────────────────────────────────────────────
const COMMANDS = [
  { cmd: '/test_ride',          desc: 'Explore Ducati bikes & book a test ride' },
  { cmd: '/apply_loan',         desc: 'Apply for a two-wheeler loan' },
  { cmd: '/check_status',       desc: 'Check loan application status' },
  { cmd: '/emi_reminder',       desc: 'Get EMI payment reminders' },
  { cmd: '/documents',          desc: 'Fetch your loan documents' },
  { cmd: '/insurance_reminder', desc: 'Renew vehicle insurance' },
  { cmd: '/info',               desc: 'Loan information & details' },
  { cmd: '/faq',                desc: 'Frequently asked questions' },
  { cmd: '/feedback',           desc: 'Share your feedback' },
  { cmd: '/quiz',               desc: 'Take a financial quiz' },
  { cmd: '/joke',               desc: 'Hear a joke' },
  { cmd: '/issue',              desc: 'Report an issue' },
  { cmd: '/help',               desc: 'Show all available commands' },
];

// ── WhatsApp dark-theme palette ───────────────────────────────────────────────
const C = {
  bg:        '#0B141A',
  panel:     '#111B21',
  header:    '#202C33',
  sent:      '#005C4B',
  received:  '#202C33',
  input:     '#2A3942',
  green:     '#00A884',
  text:      '#E9EDEF',
  sub:       '#8696A0',
  border:    '#374045',
  hover:     '#2A3942',
  active:    '#2A3942',
  blue:      '#53BDEB',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── WhatsApp text formatter ───────────────────────────────────────────────────
// Converts *bold*, _italic_, ~strike~, `mono` → HTML. Escapes entities first.
function formatWAText(text) {
  if (!text) return null;
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = esc
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del>$1</del>')
    .replace(/`([^`\n]+)`/g, '<code style="background:#1E2D35;padding:1px 5px;border-radius:3px;font-size:13px">$1</code>')
    .replace(/\n/g, '<br>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: color || C.green,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

// ── Tick icons ────────────────────────────────────────────────────────────────
function Ticks({ status }) {
  if (status === 'read')      return <span style={{ color: C.blue,  fontSize: 11, marginLeft: 4 }}>✓✓</span>;
  if (status === 'delivered') return <span style={{ color: C.sub,   fontSize: 11, marginLeft: 4 }}>✓✓</span>;
  return                             <span style={{ color: C.sub,   fontSize: 11, marginLeft: 4 }}>✓</span>;
}

// ── Media message renderers ───────────────────────────────────────────────────
function ImageMessage({ content }) {
  const link = content?.link || '';
  const caption = content?.caption || '';
  return (
    <div>
      {link ? (
        <img src={link} alt="img" style={{
          maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block',
          marginBottom: caption ? 6 : 0,
        }} onError={e => { e.target.replaceWith(Object.assign(document.createElement('div'), { textContent: '🖼️ Image unavailable', style: 'color:#8696A0;font-size:13px' })); }} />
      ) : (
        <div style={{
          width: 200, height: 140, background: C.border, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, marginBottom: caption ? 6 : 0,
        }}>🖼️</div>
      )}
      {caption && <div style={{ fontSize: 13, color: C.sub, wordBreak: 'break-word' }}>{formatWAText(caption)}</div>}
    </div>
  );
}

function VideoMessage({ content }) {
  const link = content?.link || '';
  const caption = content?.caption || '';
  return (
    <div>
      {link ? (
        <video src={link} controls style={{
          maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block',
          marginBottom: caption ? 6 : 0,
        }} />
      ) : (
        <div style={{
          width: 200, height: 140, background: C.border, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
        }}>🎬</div>
      )}
      {caption && <div style={{ fontSize: 13, color: C.sub }}>{formatWAText(caption)}</div>}
    </div>
  );
}

function AudioMessage({ content }) {
  const link = content?.link || '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
      <span style={{ fontSize: 24, flexShrink: 0 }}>🎵</span>
      {link
        ? <audio controls src={link} style={{ flex: 1, height: 36, minWidth: 0 }} />
        : <span style={{ color: C.sub, fontSize: 13 }}>Voice message</span>
      }
    </div>
  );
}

function DocumentMessage({ content }) {
  const link = content?.link || '#';
  const filename = content?.filename || 'Document';
  const caption = content?.caption || '';
  return (
    <div>
      <a href={link} target="_blank" rel="noreferrer" style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: `${C.border}55`, borderRadius: 8, padding: '10px 12px',
        textDecoration: 'none', color: C.text,
      }}>
        <span style={{ fontSize: 28, flexShrink: 0 }}>📄</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filename}
          </div>
          {caption && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{caption}</div>}
        </div>
        <span style={{ fontSize: 16, flexShrink: 0 }}>⬇️</span>
      </a>
    </div>
  );
}

function TemplateMessage({ content, phone, onSent }) {
  const name = content?.name || '';
  const components = content?.components || [];
  const header  = components.find(c => c.type === 'header');
  const body    = components.find(c => c.type === 'body');
  const footer  = components.find(c => c.type === 'footer');
  const buttons = components.filter(c => c.type === 'button');

  const headerText = header?.parameters?.[0]?.text || header?.text || '';
  const rawBody = body?.text || '';
  const bodyText = rawBody
    ? body?.parameters?.reduce((s, p, i) => s.replace(`{{${i + 1}}}`, p.text || ''), rawBody)
    : '';
  const footerText = footer?.text || '';

  return (
    <div>
      {name && (
        <div style={{ fontSize: 10, color: C.sub, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          📋 Template · {name}
        </div>
      )}
      {headerText && (
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{formatWAText(headerText)}</div>
      )}
      {bodyText && (
        <div style={{ marginBottom: footerText ? 4 : 8, wordBreak: 'break-word' }}>{formatWAText(bodyText)}</div>
      )}
      {footerText && (
        <div style={{ fontSize: 12, color: C.sub, marginBottom: buttons.length ? 8 : 0 }}>{footerText}</div>
      )}
      {buttons.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          {buttons.map((btn, i) => {
            const id    = btn?.parameters?.[0]?.payload || String(i);
            const title = btn?.parameters?.[0]?.text || btn?.text || `Button ${i + 1}`;
            return (
              <button key={i} onClick={() => onSent(simApi.sendButtonReply(phone, id, title))}
                style={{
                  display: 'block', width: '100%', padding: '7px 0',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: C.blue, fontSize: 14, fontWeight: 500,
                  borderTop: i > 0 ? `1px solid ${C.border}` : 'none',
                }}>
                {title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Interactive: button message ───────────────────────────────────────────────
function ButtonMessage({ content, phone, onSent }) {
  const buttons = content?.action?.buttons || [];
  const bodyText = content?.body?.text || '';
  const header   = content?.header?.text || '';
  const footer   = content?.footer?.text || '';

  return (
    <div>
      {header && <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>{formatWAText(header)}</div>}
      <div style={{ marginBottom: footer ? 4 : 8 }}>{formatWAText(bodyText)}</div>
      {footer && <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{footer}</div>}
      {buttons.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
          {buttons.map((btn, i) => {
            const id    = btn?.reply?.id    || btn?.id    || String(i);
            const title = btn?.reply?.title || btn?.title || `Option ${i + 1}`;
            return (
              <button key={id} onClick={() => onSent(simApi.sendButtonReply(phone, id, title))}
                style={{
                  display: 'block', width: '100%', padding: '7px 0',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: C.blue, fontSize: 14, fontWeight: 500,
                  borderTop: i > 0 ? `1px solid ${C.border}` : 'none',
                }}>
                {title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Interactive: list message ─────────────────────────────────────────────────
function ListMessage({ content, phone, onSent }) {
  const [open, setOpen] = useState(false);
  const sections  = content?.action?.sections || [];
  const bodyText  = content?.body?.text || '';
  const header    = content?.header?.text || '';
  const footer    = content?.footer?.text || '';
  const btnLabel  = content?.action?.button || 'Menu';

  const allRows = sections.flatMap(s =>
    (s.rows || []).map(r => ({ ...r, _section: s.title }))
  );

  return (
    <div>
      {header && <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatWAText(header)}</div>}
      <div style={{ marginBottom: 6 }}>{formatWAText(bodyText)}</div>
      {footer && <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>{footer}</div>}

      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
        background: 'transparent', border: `1px solid ${C.blue}`, borderRadius: 20,
        color: C.blue, fontSize: 13, cursor: 'pointer', width: '100%', justifyContent: 'center',
      }}>
        ☰ {btnLabel}
      </button>

      {open && (
        <div style={{
          marginTop: 8, borderRadius: 8, overflow: 'hidden',
          border: `1px solid ${C.border}`, background: C.panel,
        }}>
          {sections.map((sec, si) => (
            <div key={si}>
              {sec.title && (
                <div style={{ padding: '6px 12px', fontSize: 12, color: C.sub,
                  fontWeight: 600, background: C.header }}>
                  {sec.title}
                </div>
              )}
              {(sec.rows || []).map(row => (
                <button key={row.id} onClick={() => {
                  setOpen(false);
                  onSent(simApi.sendListReply(phone, row.id, row.title));
                }} style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 14px', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${C.border}`, cursor: 'pointer', color: C.text,
                }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{row.title}</div>
                  {row.description && (
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{row.description}</div>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg, phone, onSent }) {
  const out  = msg.direction === 'outbound';
  const type = msg.type;
  const c    = msg.content || {};

  return (
    <div style={{
      display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start',
      marginBottom: 4, paddingLeft: out ? 60 : 0, paddingRight: out ? 0 : 60,
    }}>
      <div style={{
        maxWidth: '72%', padding: '7px 12px 6px',
        background: out ? C.sent : C.received,
        borderRadius: out ? '12px 0 12px 12px' : '0 12px 12px 12px',
        color: C.text, fontSize: 14, lineHeight: 1.45,
        boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
        position: 'relative',
      }}>
        {/* text / quick-reply labels */}
        {(type === 'text' || type === 'button_reply' || type === 'list_reply') && (
          <span style={{ wordBreak: 'break-word' }}>
            {formatWAText(c.body || '')}
          </span>
        )}

        {/* bot interactive — buttons */}
        {type === 'interactive' && c.type === 'button' && (
          <ButtonMessage content={c} phone={phone} onSent={onSent} />
        )}

        {/* bot interactive — list */}
        {type === 'interactive' && c.type === 'list' && (
          <ListMessage content={c} phone={phone} onSent={onSent} />
        )}

        {/* fallback for unknown interactive */}
        {type === 'interactive' && !['button', 'list'].includes(c.type) && (
          <span style={{ color: C.sub, fontStyle: 'italic' }}>
            {c.body?.text || JSON.stringify(c).slice(0, 80)}
          </span>
        )}

        {/* media messages */}
        {type === 'image'    && <ImageMessage    content={c} />}
        {type === 'video'    && <VideoMessage    content={c} />}
        {type === 'audio'    && <AudioMessage    content={c} />}
        {type === 'document' && <DocumentMessage content={c} />}
        {type === 'sticker'  && (
          <div style={{ fontSize: 48, lineHeight: 1 }}>{c.link ? <img src={c.link} alt="sticker" style={{ maxWidth: 120 }} /> : '🎭'}</div>
        )}

        {/* template messages */}
        {type === 'template' && <TemplateMessage content={c} phone={phone} onSent={onSent} />}

        {/* timestamp + ticks */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 2, marginTop: 4, color: C.sub, fontSize: 11,
        }}>
          {fmtTime(msg.timestamp)}
          {out && <Ticks status={msg.status} />}
        </div>
      </div>
    </div>
  );
}

// ── Date separator ────────────────────────────────────────────────────────────
function DateSep({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '12px 0', padding: '0 16px' }}>
      <div style={{ flex: 1, height: 1, background: C.border }} />
      <div style={{
        margin: '0 12px', padding: '4px 12px', background: C.header,
        borderRadius: 8, fontSize: 12, color: C.sub,
      }}>
        {label}
      </div>
      <div style={{ flex: 1, height: 1, background: C.border }} />
    </div>
  );
}

// ── Contact item ──────────────────────────────────────────────────────────────
function ContactItem({ contact, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 16px', cursor: 'pointer',
        background: active ? C.active : hov ? C.hover : 'transparent',
        borderBottom: `1px solid ${C.border}`, transition: 'background 0.15s',
      }}>
      <Avatar name={contact.name} color={contact.avatar_color} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, color: C.text, fontSize: 15 }}>{contact.name}</span>
          <span style={{ fontSize: 11, color: C.sub }}>{contact.last_time}</span>
        </div>
        <div style={{ fontSize: 13, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact.last_message || 'No messages yet'}
        </div>
      </div>
    </div>
  );
}

// ── Add contact modal ─────────────────────────────────────────────────────────
function AddContactModal({ onClose, onAdded }) {
  const [name,  setName]  = useState('');
  const [phone, setPhone] = useState('91');
  const [err,   setErr]   = useState('');
  const [busy,  setBusy]  = useState(false);

  const submit = async () => {
    setErr('');
    if (!phone.trim() || phone.length < 10) return setErr('Enter a valid phone number');
    if (!name.trim()) return setErr('Name is required');
    setBusy(true);
    try {
      const contact = await simApi.addContact(phone.trim(), name.trim());
      onAdded(contact);
      onClose();
    } catch {
      setErr('Failed to add contact');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: C.panel, borderRadius: 12, padding: 28, width: 340,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>
          New Contact
        </div>

        <label style={{ color: C.sub, fontSize: 13 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Full name" onKeyDown={e => e.key === 'Enter' && submit()}
          style={inputStyle} />

        <label style={{ color: C.sub, fontSize: 13 }}>Phone number</label>
        <input value={phone} onChange={e => setPhone(e.target.value)}
          placeholder="91XXXXXXXXXX" onKeyDown={e => e.key === 'Enter' && submit()}
          style={inputStyle} />

        {err && <div style={{ color: '#FF6B6B', fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: C.input, color: C.sub }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{ ...btnStyle, background: C.green, color: '#fff', flex: 1 }}>
            {busy ? 'Adding…' : 'Add Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block', width: '100%', marginTop: 6, marginBottom: 16,
  padding: '10px 14px', background: C.input, border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const btnStyle = {
  padding: '10px 20px', borderRadius: 8, border: 'none',
  fontSize: 14, fontWeight: 600, cursor: 'pointer',
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SimulatorPage() {
  const [contacts,      setContacts]     = useState([]);
  const [active,        setActive]       = useState(null);   // contact object
  const [messages,      setMessages]     = useState([]);
  const [msgIndex,      setMsgIndex]     = useState(0);      // for incremental polling
  const [input,         setInput]        = useState('');
  const [showModal,     setShowModal]    = useState(false);
  const [showAttach,    setShowAttach]   = useState(false);
  const [search,        setSearch]       = useState('');
  const [typing,        setTyping]       = useState(false);
  const bottomRef    = useRef(null);
  const pollRef      = useRef(null);
  const msgIndexRef  = useRef(0);    // tracks current msg index without stale closure
  const fetchingRef  = useRef(false); // prevents concurrent fetches from duplicating messages

  // load contacts once
  useEffect(() => {
    simApi.getContacts().then(setContacts).catch(() => {});
  }, []);

  // scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // fetchNew reads from ref → stable across renders, no stale closure.
  // Lock prevents the polling interval from duplicating messages when an
  // immediate fetch (after send/button click) is already in flight.
  const fetchNew = useCallback(async () => {
    if (!active || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const data = await simApi.getMessages(active.phone, msgIndexRef.current);
      if (data.messages?.length) {
        setMessages(prev => [...prev, ...data.messages]);
        setMsgIndex(data.total);
        msgIndexRef.current = data.total;
      }
      setTyping(false);
    } catch {}
    finally {
      fetchingRef.current = false;
    }
  }, [active]);

  // Polling — interval only restarts when active contact changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!active) return;
    pollRef.current = setInterval(fetchNew, 800);
    return () => clearInterval(pollRef.current);
  }, [active, fetchNew]);

  // switch contact
  const openContact = async (contact) => {
    clearInterval(pollRef.current);
    fetchingRef.current = false;
    setActive(contact);
    setMessages([]);
    setMsgIndex(0);
    msgIndexRef.current = 0;
    setInput('');
    setTyping(false);
    try {
      const data = await simApi.getMessages(contact.phone, 0);
      setMessages(data.messages || []);
      setMsgIndex(data.total || 0);
      msgIndexRef.current = data.total || 0;
    } catch {}
  };

  const doSend = useCallback(async (text) => {
    if (!text || !active) return;
    setInput('');
    setTyping(true);
    try {
      await simApi.sendText(active.phone, text);
      // Fetch immediately — picks up user msg + all bot replies in one shot
      await fetchNew();
    } catch {
      setTyping(false);
    }
    simApi.getContacts().then(setContacts).catch(() => {});
  }, [active, fetchNew]);

  const sendMessage = () => doSend(input.trim());

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Receives the already-started API promise so we await completion before fetching
  const handleInteractiveSent = useCallback(async (apiCallPromise) => {
    setTyping(true);
    try {
      await apiCallPromise;
      await fetchNew();
    } catch {
      setTyping(false);
    }
    simApi.getContacts().then(setContacts).catch(() => {});
  }, [fetchNew]);

  const clearChat = async () => {
    if (!active) return;
    await simApi.clearMessages(active.phone);
    setMessages([]);
    setMsgIndex(0);
    msgIndexRef.current = 0;
  };

  const removeContact = async (phone) => {
    await simApi.deleteContact(phone);
    setContacts(prev => prev.filter(c => c.phone !== phone));
    if (active?.phone === phone) { setActive(null); setMessages([]); }
  };

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  // Group messages by date
  const grouped = [];
  let lastDate = null;
  messages.forEach(msg => {
    const d = new Date(msg.timestamp);
    const label = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday'
      : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    if (label !== lastDate) { grouped.push({ type: 'sep', label }); lastDate = label; }
    grouped.push({ type: 'msg', msg });
  });

  return (
    <div style={{
      display: 'flex', height: '100vh', background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: C.text, overflow: 'hidden',
    }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: C.panel, borderRight: `1px solid ${C.border}` }}>

        {/* Header */}
        <div style={{
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', background: C.header,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar name="APFS" color={C.green} size={38} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>APFS Connect</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <IconBtn title="Back to Dashboard" onClick={() => window.location.href = '/'}>
              🏠
            </IconBtn>
            <IconBtn title="New Contact" onClick={() => setShowModal(true)}>
              💬
            </IconBtn>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '8px 12px', background: C.panel }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: C.input, borderRadius: 8, padding: '7px 12px',
          }}>
            <span style={{ color: C.sub, fontSize: 14 }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search or start new chat"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: C.text, fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Contacts */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: C.sub, fontSize: 14 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>👤</div>
              No contacts yet.<br />
              <span style={{ color: C.green, cursor: 'pointer' }}
                onClick={() => setShowModal(true)}>
                Add a contact
              </span> to start.
            </div>
          )}
          {filtered.map(c => (
            <ContactItem key={c.phone} contact={c}
              active={active?.phone === c.phone}
              onClick={() => openContact(c)} />
          ))}
        </div>

        {/* Simulator badge */}
        <div style={{
          padding: '8px 16px', background: C.header, borderTop: `1px solid ${C.border}`,
          fontSize: 11, color: C.sub, textAlign: 'center',
        }}>
          🔬 Simulator mode — switch to WhatsApp via <code>CHANNEL=whatsapp</code>
        </div>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      {!active ? (
        <EmptyState onNewContact={() => setShowModal(true)} />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: C.bg }}>

          {/* Chat header */}
          <div style={{
            height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', background: C.header, borderBottom: `1px solid ${C.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={active.name} color={active.avatar_color} size={40} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{active.name}</div>
                <div style={{ fontSize: 12, color: C.sub }}>
                  {typing ? <span style={{ color: C.green }}>typing…</span> : active.phone}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <IconBtn title="Clear chat" onClick={clearChat}>🗑️</IconBtn>
              <IconBtn title="Remove contact" onClick={() => removeContact(active.phone)}>✕</IconBtn>
            </div>
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px 6%',
            backgroundImage: `radial-gradient(circle at 1px 1px, ${C.border}22 1px, transparent 0)`,
            backgroundSize: '24px 24px',
          }}>
            {grouped.length === 0 && (
              <div style={{ textAlign: 'center', marginTop: 40, color: C.sub, fontSize: 14 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
                No messages yet. Type something to trigger a flow!
              </div>
            )}

            {grouped.map((item, i) =>
              item.type === 'sep'
                ? <DateSep key={`sep-${i}`} label={item.label} />
                : <Bubble key={item.msg.id || i} msg={item.msg}
                    phone={active.phone} onSent={handleInteractiveSent} />
            )}

            {typing && (
              <div style={{ display: 'flex', marginBottom: 4 }}>
                <div style={{
                  padding: '10px 14px', background: C.received,
                  borderRadius: '0 12px 12px 12px', color: C.sub, fontSize: 14,
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ position: 'relative', background: C.header, borderTop: `1px solid ${C.border}` }}>
            {/* Command picker — shown when input starts with / */}
            {input.startsWith('/') && (
              <CommandPicker
                query={input}
                onSelect={(cmd) => doSend(cmd)}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 16px' }}>
              <IconBtn title="Send image" onClick={() => setShowAttach(true)}>📎</IconBtn>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center',
                background: C.input, borderRadius: 24, padding: '8px 16px', gap: 8,
              }}>
                <span style={{ color: C.sub, fontSize: 18 }}>😊</span>
                <textarea
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message or / for commands"
                  rows={1}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: C.text, fontSize: 15, resize: 'none', lineHeight: 1.4,
                    maxHeight: 100, overflowY: 'auto',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              <button onClick={sendMessage}
                style={{
                  width: 46, height: 46, borderRadius: '50%', border: 'none',
                  background: input.trim() ? C.green : C.sub,
                  cursor: input.trim() ? 'pointer' : 'default',
                  fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background 0.2s',
                }}>
                {input.trim() ? '➤' : '🎤'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <AddContactModal
          onClose={() => setShowModal(false)}
          onAdded={contact => {
            setContacts(prev => {
              const exists = prev.find(c => c.phone === contact.phone);
              return exists ? prev : [contact, ...prev];
            });
          }}
        />
      )}

      {showAttach && active && (
        <AttachModal
          phone={active.phone}
          onClose={() => setShowAttach(false)}
          onSent={() => {
            setShowAttach(false);
            setTyping(true);
            simApi.getContacts().then(setContacts).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function IconBtn({ children, onClick, title }) {
  const [hov, setHov] = useState(false);
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        width: 36, height: 36, borderRadius: '50%', border: 'none',
        background: hov ? C.input : 'transparent',
        cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: C.sub, transition: 'background 0.15s',
      }}>
      {children}
    </button>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center', height: 16 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: C.sub,
          animation: `wa-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes wa-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function EmptyState({ onNewContact }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: C.bg, borderLeft: `1px solid ${C.border}`,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>💬</div>
        <div style={{ fontSize: 22, fontWeight: 300, color: C.text, marginBottom: 8 }}>
          APFS Connect Simulator
        </div>
        <div style={{ fontSize: 14, color: C.sub, marginBottom: 24, lineHeight: 1.6 }}>
          Send messages through your flow engine, exactly as WhatsApp would.
          Same backend. Same flows. No approval needed.
        </div>
        <button onClick={onNewContact} style={{
          padding: '10px 28px', background: C.green, color: '#fff',
          border: 'none', borderRadius: 24, fontSize: 15, fontWeight: 600,
          cursor: 'pointer',
        }}>
          + New Contact
        </button>
        <div style={{ marginTop: 24, fontSize: 12, color: C.sub }}>
          🔒 Messages flow through the same engine used in production
        </div>
      </div>
    </div>
  );
}

// ── Command picker (/commands) ────────────────────────────────────────────────
function CommandPicker({ query, onSelect }) {
  const q = query.toLowerCase();
  const matches = COMMANDS.filter(c => c.cmd.startsWith(q));
  if (!matches.length) return null;
  return (
    <div style={{
      position: 'absolute', bottom: '100%', left: 0, right: 0,
      background: C.panel, border: `1px solid ${C.border}`,
      borderRadius: '8px 8px 0 0', maxHeight: 260, overflowY: 'auto',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.5)', zIndex: 10,
    }}>
      <div style={{ padding: '8px 14px 4px', fontSize: 11, color: C.sub, fontWeight: 600, letterSpacing: 0.5 }}>
        COMMANDS
      </div>
      {matches.map(c => (
        <button key={c.cmd} onClick={() => onSelect(c.cmd)}
          onMouseEnter={e => e.currentTarget.style.background = C.hover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          style={{
            display: 'flex', alignItems: 'center', width: '100%',
            padding: '9px 14px', background: 'transparent', border: 'none',
            borderTop: `1px solid ${C.border}30`, cursor: 'pointer', gap: 12, textAlign: 'left',
          }}>
          <span style={{ color: C.green, fontWeight: 700, fontSize: 14, minWidth: 180, flexShrink: 0 }}>
            {c.cmd}
          </span>
          <span style={{ color: C.sub, fontSize: 13 }}>{c.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ── Attach (image) modal ──────────────────────────────────────────────────────
function AttachModal({ phone, onClose, onSent }) {
  const [url,     setUrl]     = useState('');
  const [caption, setCaption] = useState('');
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState('');

  const submit = async () => {
    if (!url.trim()) return setErr('Image URL is required');
    setBusy(true);
    try {
      await simApi.sendImage(phone, url.trim(), caption.trim());
      onSent();
    } catch {
      setErr('Failed to send image');
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: C.panel, borderRadius: 12, padding: 28, width: 380,
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 20 }}>
          Send Image
        </div>

        <label style={{ color: C.sub, fontSize: 13 }}>Image URL</label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com/photo.jpg"
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={inputStyle} />

        <label style={{ color: C.sub, fontSize: 13 }}>Caption (optional)</label>
        <input value={caption} onChange={e => setCaption(e.target.value)}
          placeholder="Add a caption…"
          style={inputStyle} />

        {url && (
          <img src={url} alt="preview" style={{
            maxWidth: '100%', maxHeight: 160, borderRadius: 8, marginBottom: 16,
            display: 'block', objectFit: 'cover',
          }} onError={e => { e.target.style.display = 'none'; }} />
        )}

        {err && <div style={{ color: '#FF6B6B', fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: C.input, color: C.sub }}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy}
            style={{ ...btnStyle, background: C.green, color: '#fff', flex: 1 }}>
            {busy ? 'Sending…' : 'Send Image'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}
function isYesterday(d) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
}
