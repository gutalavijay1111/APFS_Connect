import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown,
  Sparkles, Braces, Save, Type, MousePointerClick,
  List, Image, Video, FileText, Settings, Zap,
  X, Upload, Bold, Italic, Strikethrough, Code, Check,
} from 'lucide-react';
import { apiClient as api } from '../utils/api';

/* ── WA markdown ↔ TipTap HTML ──────────────────────────────────────── */
function waToHtml(text) {
  if (!text) return '<p></p>';
  return text
    .split('\n')
    .map(line => {
      const s = line
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/~([^~]+)~/g, '<s>$1</s>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      return `<p>${s || '<br>'}</p>`;
    })
    .join('');
}

function htmlToWa(html) {
  return html
    .replace(/<strong>(.*?)<\/strong>/gs, '*$1*')
    .replace(/<em>(.*?)<\/em>/gs, '_$1_')
    .replace(/<s>(.*?)<\/s>/gs, '~$1~')
    .replace(/<code>(.*?)<\/code>/gs, '`$1`')
    .replace(/<\/p><p>/gs, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .trim();
}

/* ── Preview text formatter (for phone bubbles) ─────────────────────── */
function fmtWA(raw) {
  if (!raw) return '';
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/`([^`\n]+)`/g, '<code style="background:#f0f0f0;padding:1px 3px;border-radius:3px;font-size:.88em">$1</code>')
    .replace(/\n/g, '<br/>');
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
let _n = 1;
function uid(p = 'step') { return `${p}${_n++}`; }

function defaultStep(n) {
  return {
    id: `step${n}`, name: `Step ${n}`, is_active: true,
    contentType: 'text', text_body: '',
    btn_header: '', btn_body: '', btn_footer: '',
    buttons: [{ id: 'btn_yes', title: 'Yes' }, { id: 'btn_no', title: 'No' }],
    list_header: '', list_body: 'Choose an option below:', list_footer: '',
    list_button_label: 'View Options',
    sections: [{ title: 'Options', rows: [{ id: 'row_1', title: 'Option 1', description: '' }] }],
    media_url: '', media_caption: '', media_filename: '',
    processors: [],
  };
}

function toFlowJson(meta, steps) {
  return {
    name: meta.name, id: meta.id, trigger: meta.trigger,
    start: steps[0]?.id || '', end: steps[steps.length - 1]?.id || '',
    is_active: meta.is_active,
    ...(meta.next_flow ? { next_flow: meta.next_flow } : {}),
    steps: steps.map((s, i) => {
      let content = {};
      if (s.contentType === 'text') {
        content = { type: 'text', body: s.text_body };
      } else if (s.contentType === 'button_interactive') {
        content = { type: 'interactive', body: {
          type: 'button',
          ...(s.btn_header && { header: { type: 'text', text: s.btn_header } }),
          body: { text: s.btn_body },
          ...(s.btn_footer && { footer: { text: s.btn_footer } }),
          action: { buttons: s.buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
        }};
      } else if (s.contentType === 'list_interactive') {
        content = { type: 'interactive', body: {
          type: 'list',
          ...(s.list_header && { header: { type: 'text', text: s.list_header } }),
          body: { text: s.list_body },
          ...(s.list_footer && { footer: { text: s.list_footer } }),
          action: { button: s.list_button_label, sections: s.sections.map(sec => ({ title: sec.title, rows: sec.rows.map(r => ({ id: r.id, title: r.title, ...(r.description ? { description: r.description } : {}) })) })) },
        }};
      } else if (['image', 'video', 'document'].includes(s.contentType)) {
        content = { type: s.contentType, body: s.media_url, ...(s.media_caption ? { caption: s.media_caption } : {}), ...(s.contentType === 'document' && s.media_filename ? { filename: s.media_filename } : {}) };
      }
      return {
        id: s.id, name: s.name, sequence_no: i + 1, type: 'message',
        action: 'send_message', next_step: steps[i + 1]?.id || null,
        is_active: s.is_active, content,
        processor: s.processors.map(p => ({ name: p.name, wait: !!p.wait, payload_template: (() => { try { return JSON.parse(p.tpl || '{}'); } catch { return {}; } })() })),
      };
    }),
  };
}

async function uploadMedia(file) {
  const res = await api.post('/upload', file, {
    headers: { 'Content-Type': file.type, 'X-File-Name': file.name },
  });
  const filename = res.data?.data?.file;
  const base = process.env.REACT_APP_API_BASE_URL || 'http://localhost:9999/apfsconnect/api';
  return `${base}/uploads/${filename}`;
}

/* ══════════════════════════════════════════════════════════════════════
   RICH TEXT EDITOR (TipTap)
══════════════════════════════════════════════════════════════════════ */
function WaEditor({ value, onChange, stepId, placeholder = 'Type message…', minHeight = 88 }) {
  const prevStepId = useRef(stepId);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false, listItem: false, blockquote: false, horizontalRule: false, codeBlock: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: waToHtml(value),
    onUpdate: ({ editor }) => onChange(htmlToWa(editor.getHTML())),
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed && prevStepId.current !== stepId) {
      prevStepId.current = stepId;
      editor.commands.setContent(waToHtml(value), false);
    }
  }, [stepId, editor, value]);

  if (!editor) return null;

  const tools = [
    { icon: <Bold size={13} />, cmd: 'toggleBold', mark: 'bold', tip: 'Bold  Ctrl+B' },
    { icon: <Italic size={13} />, cmd: 'toggleItalic', mark: 'italic', tip: 'Italic  Ctrl+I' },
    { icon: <Strikethrough size={13} />, cmd: 'toggleStrike', mark: 'strike', tip: 'Strikethrough' },
    { icon: <Code size={13} />, cmd: 'toggleCode', mark: 'code', tip: 'Mono code' },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:border-primary transition-colors">
      <div className="flex items-center gap-1 px-2 py-1.5 bg-base border-b border-gray-200">
        {tools.map(t => (
          <button key={t.mark} type="button" title={t.tip}
                  onMouseDown={e => { e.preventDefault(); editor.chain().focus()[t.cmd]().run(); }}
                  className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${editor.isActive(t.mark) ? 'bg-base2 text-primary' : 'text-gray-500 hover:bg-base2 hover:text-text'}`}>
            {t.icon}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <span className="ml-auto text-xs text-gray-400 font-mono">*b* _i_ ~s~ `c`</span>
      </div>
      <div className="wa-editor" style={{ minHeight }}>
        <EditorContent editor={editor} className="px-3 py-2" />
      </div>
      <div className="flex justify-between items-center px-3 py-1 bg-base border-t border-gray-100">
        <span className="text-xs text-gray-400">Supports WhatsApp markdown</span>
        <span className="text-xs text-gray-400">{value.length} chars</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   PHONE PREVIEW
══════════════════════════════════════════════════════════════════════ */
const WA_DARK = '#075E54';
const WA_TEAL = '#008069';
const WA_LG   = '#DCF8C6';
const WA_BG   = '#E5DDD5';
const WA_SUB  = '#667781';
const WA_SEP  = '#E9EDEF';

function WaTextBubble({ body }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', padding: '6px 10px 4px', maxWidth: 224, wordBreak: 'break-word', boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: '#111B21' }}
           dangerouslySetInnerHTML={{ __html: fmtWA(body) || '<span style="opacity:.35;font-style:italic">Empty message…</span>' }} />
      <div style={{ fontSize: 10, color: WA_SUB, textAlign: 'right', marginTop: 2 }}>Now ✓✓</div>
    </div>
  );
}

function WaButtonBubble({ step }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', maxWidth: 244, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
      {step.btn_header && <div style={{ padding: '8px 10px 0', fontWeight: 600, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: fmtWA(step.btn_header) }} />}
      <div style={{ padding: '6px 10px 2px', fontSize: 13.5, color: '#111B21', lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: fmtWA(step.btn_body) || '<span style="opacity:.35;font-style:italic">Body text…</span>' }} />
      {step.btn_footer && <div style={{ padding: '2px 10px 4px', fontSize: 11, color: WA_SUB }}>{step.btn_footer}</div>}
      <div style={{ fontSize: 10, color: WA_SUB, textAlign: 'right', padding: '2px 10px 4px' }}>Now ✓✓</div>
      <div style={{ borderTop: `1px solid ${WA_SEP}` }}>
        {step.buttons.map((b, i) => (
          <div key={i} style={{ padding: '9px 10px', textAlign: 'center', color: WA_TEAL, fontSize: 13.5, fontWeight: 500, borderBottom: i < step.buttons.length - 1 ? `1px solid ${WA_SEP}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            <span style={{ fontSize: 10 }}>↩</span>{b.title || `Button ${i + 1}`}
          </div>
        ))}
      </div>
    </div>
  );
}

function WaListBubble({ step, isOpen, onToggle }) {
  return (
    <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', maxWidth: 244, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
      {step.list_header && <div style={{ padding: '8px 10px 0', fontWeight: 600, fontSize: 13 }} dangerouslySetInnerHTML={{ __html: fmtWA(step.list_header) }} />}
      <div style={{ padding: '6px 10px 2px', fontSize: 13.5, color: '#111B21', lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: fmtWA(step.list_body) || '<span style="opacity:.35;font-style:italic">Body text…</span>' }} />
      {step.list_footer && <div style={{ padding: '2px 10px 4px', fontSize: 11, color: WA_SUB }}>{step.list_footer}</div>}
      <div style={{ fontSize: 10, color: WA_SUB, textAlign: 'right', padding: '2px 10px 4px' }}>Now ✓✓</div>
      <div style={{ borderTop: `1px solid ${WA_SEP}` }}>
        <button onClick={onToggle} style={{ width: '100%', padding: '9px 10px', textAlign: 'center', color: WA_TEAL, fontSize: 13.5, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>☰</span> {step.list_button_label || 'View Options'}
        </button>
      </div>
      {isOpen && (
        <div style={{ borderTop: `1px solid ${WA_SEP}`, maxHeight: 180, overflowY: 'auto' }}>
          {step.sections.map((sec, si) => (
            <div key={si}>
              {sec.title && <div style={{ padding: '8px 12px 3px', fontSize: 11, fontWeight: 700, color: WA_SUB, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sec.title}</div>}
              {sec.rows.map((row, ri) => (
                <div key={ri} style={{ padding: '9px 12px', borderBottom: '1px solid #F0F0F0' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#111B21' }}>{row.title || `Row ${ri + 1}`}</div>
                  {row.description && <div style={{ fontSize: 11.5, color: WA_SUB, marginTop: 2 }}>{row.description}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WaMediaBubble({ step }) {
  const { contentType: t, media_url: url, media_caption: cap, media_filename: fn } = step;
  return (
    <div style={{ background: '#fff', borderRadius: '0 8px 8px 8px', maxWidth: 224, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
      {t === 'image' && url ? (
        <img src={url} alt="" style={{ width: '100%', maxHeight: 150, objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display = 'none'; }} />
      ) : t === 'video' ? (
        <div style={{ height: 110, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: '#fff' }}>▶</div>
      ) : t === 'document' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F0F2F5' }}>
          <span style={{ fontSize: 26 }}>📄</span>
          <div><div style={{ fontSize: 13, fontWeight: 500 }}>{fn || 'document.pdf'}</div><div style={{ fontSize: 11, color: WA_SUB }}>Document</div></div>
        </div>
      ) : (
        <div style={{ height: 100, background: '#F0F2F5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, color: WA_SUB }}>
          {t === 'image' ? <Image size={28} /> : t === 'video' ? <Video size={28} /> : <FileText size={28} />}
          <span style={{ fontSize: 11 }}>Add media to preview</span>
        </div>
      )}
      {cap && <div style={{ padding: '6px 10px 2px', fontSize: 13, color: '#111B21' }}>{cap}</div>}
      <div style={{ fontSize: 10, color: WA_SUB, textAlign: 'right', padding: '2px 10px 4px' }}>Now ✓✓</div>
    </div>
  );
}

function WaUserPlaceholder({ label }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ background: WA_LG, borderRadius: '8px 0 8px 8px', padding: '6px 10px 4px', maxWidth: 180, boxShadow: '0 1px 2px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize: 12.5, color: '#111B21', fontStyle: 'italic', opacity: 0.65 }}>{label}</div>
        <div style={{ fontSize: 10, color: WA_SUB, textAlign: 'right', marginTop: 2 }}>Now ✓✓</div>
      </div>
    </div>
  );
}

function PhonePreview({ steps, selectedId }) {
  const [openLists, setOpenLists] = useState({});
  const toggle = id => setOpenLists(p => ({ ...p, [id]: !p[id] }));
  const waits = s => s.contentType === 'button_interactive' || s.contentType === 'list_interactive' || s.processors.some(p => p.wait);
  const userLabel = s => {
    if (s.contentType === 'button_interactive') return s.buttons[0]?.title || 'User selects…';
    if (s.contentType === 'list_interactive') return s.sections[0]?.rows[0]?.title || 'User selects…';
    return 'User types response…';
  };

  return (
    <div className="flex flex-col items-center px-2">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Live Preview</p>
      <div style={{ width: 272, background: WA_BG, border: '9px solid #1C1C1E', borderRadius: 40, boxShadow: '0 20px 50px rgba(0,0,0,.3), inset 0 0 0 1px #444', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        {/* Status bar */}
        <div style={{ background: '#111', padding: '7px 16px 5px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>9:41</span>
          <span style={{ color: '#fff', fontSize: 10 }}>●●● 🔋</span>
        </div>
        {/* WA header */}
        <div style={{ background: WA_DARK, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#ddd', fontSize: 16 }}>←</span>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#4CAF91', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>A</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>APFS Connect</div>
            <div style={{ color: '#B2DFDB', fontSize: 10.5 }}>online</div>
          </div>
        </div>
        {/* Chat */}
        <div style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 380, maxHeight: 480, overflowY: 'auto', backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,.04) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
          {steps.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: WA_SUB, fontSize: 12, textAlign: 'center', gap: 8, opacity: .7 }}>
              <span style={{ fontSize: 30 }}>💬</span>Add steps to preview
            </div>
          ) : steps.map(step => (
            <div key={step.id} style={{ border: selectedId === step.id ? '2px solid #343633' : '2px solid transparent', borderRadius: 10, padding: 2, transition: 'border-color .15s' }}>
              {step.contentType === 'text' && <WaTextBubble body={step.text_body} />}
              {step.contentType === 'button_interactive' && <WaButtonBubble step={step} />}
              {step.contentType === 'list_interactive' && <WaListBubble step={step} isOpen={!!openLists[step.id]} onToggle={() => toggle(step.id)} />}
              {['image','video','document'].includes(step.contentType) && <WaMediaBubble step={step} />}
              {waits(step) && <div style={{ marginTop: 5 }}><WaUserPlaceholder label={userLabel(step)} /></div>}
            </div>
          ))}
        </div>
        {/* Input bar */}
        <div style={{ background: '#F0F2F5', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid #ddd' }}>
          <div style={{ flex: 1, background: '#fff', borderRadius: 20, padding: '7px 12px', fontSize: 12.5, color: WA_SUB }}>Type a message</div>
          <div style={{ width: 36, height: 36, background: WA_TEAL, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>🎤</div>
        </div>
      </div>
      {steps.length > 0 && (
        <p className="mt-2 text-xs text-gray-400">{steps.length} step{steps.length !== 1 ? 's' : ''} · {steps.filter(s => s.processors.some(p => p.wait)).length} wait points</p>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   FORM PRIMITIVES
══════════════════════════════════════════════════════════════════════ */
const INPUT = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-text bg-white transition-colors';
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5';
const SECTION_HDR = 'text-xs font-bold text-gray-400 uppercase tracking-wider mb-3';

function Field({ label, children, className = 'mb-4' }) {
  return <div className={className}><label className={LABEL}>{label}</label>{children}</div>;
}

function Divider() {
  return <div className="border-t border-gray-100 my-4" />;
}

/* ══════════════════════════════════════════════════════════════════════
   CONTENT EDITORS
══════════════════════════════════════════════════════════════════════ */
function TextEditor({ step, update, stepId }) {
  return (
    <Field label="Message Text">
      <WaEditor value={step.text_body} onChange={v => update({ text_body: v })} stepId={stepId} placeholder="Type your WhatsApp message… use *bold*, _italic_, ~strike~, `code`, emojis 🎉" minHeight={120} />
    </Field>
  );
}

function ButtonEditor({ step, update, stepId }) {
  const updBtn = (i, patch) => update({ buttons: step.buttons.map((b, x) => x === i ? { ...b, ...patch } : b) });
  const addBtn = () => { if (step.buttons.length < 3) update({ buttons: [...step.buttons, { id: uid('btn'), title: '' }] }); };
  const delBtn = i => update({ buttons: step.buttons.filter((_, x) => x !== i) });
  return (
    <>
      <Field label="Header (optional)">
        <input className={INPUT} value={step.btn_header} onChange={e => update({ btn_header: e.target.value })} placeholder="e.g. Explore Options" />
      </Field>
      <Field label="Body Text">
        <WaEditor value={step.btn_body} onChange={v => update({ btn_body: v })} stepId={stepId} placeholder="Main message *bold* _italic_…" minHeight={72} />
      </Field>
      <Field label="Footer (optional)">
        <input className={INPUT} value={step.btn_footer} onChange={e => update({ btn_footer: e.target.value })} placeholder="e.g. Powered by APFS" />
      </Field>
      <Divider />
      <div className="mb-4">
        <label className={LABEL}>Buttons <span className="text-gray-400 font-normal normal-case">(max 3)</span></label>
        {step.buttons.map((b, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input className={`${INPUT} w-28 flex-none font-mono text-xs`} value={b.id} onChange={e => updBtn(i, { id: e.target.value })} placeholder="id" />
            <input className={`${INPUT} flex-1`} value={b.title} onChange={e => updBtn(i, { title: e.target.value })} placeholder="Button label" />
            {step.buttons.length > 1 && (
              <button type="button" onClick={() => delBtn(i)} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={14} /></button>
            )}
          </div>
        ))}
        {step.buttons.length < 3 && (
          <button type="button" onClick={addBtn} className="flex items-center gap-1.5 text-sm text-primary hover:text-highlight transition-colors mt-1">
            <Plus size={14} /> Add Button
          </button>
        )}
      </div>
    </>
  );
}

function ListEditor({ step, update, stepId }) {
  const updRow = (si, ri, patch) => update({ sections: step.sections.map((s, sx) => sx !== si ? s : { ...s, rows: s.rows.map((r, rx) => rx !== ri ? r : { ...r, ...patch }) }) });
  const addRow = si => update({ sections: step.sections.map((s, sx) => sx !== si ? s : { ...s, rows: [...s.rows, { id: uid('row'), title: '', description: '' }] }) });
  const delRow = (si, ri) => update({ sections: step.sections.map((s, sx) => sx !== si ? s : { ...s, rows: s.rows.filter((_, rx) => rx !== ri) }) });
  const addSec = () => update({ sections: [...step.sections, { title: 'New Section', rows: [{ id: uid('row'), title: 'Option', description: '' }] }] });
  const delSec = si => update({ sections: step.sections.filter((_, sx) => sx !== si) });
  const updSecTitle = (si, title) => update({ sections: step.sections.map((s, sx) => sx === si ? { ...s, title } : s) });
  return (
    <>
      <Field label="Header (optional)">
        <input className={INPUT} value={step.list_header} onChange={e => update({ list_header: e.target.value })} placeholder="e.g. Choose a Category" />
      </Field>
      <Field label="Body Text">
        <WaEditor value={step.list_body} onChange={v => update({ list_body: v })} stepId={stepId} placeholder="Body text…" minHeight={64} />
      </Field>
      <Field label="Footer (optional)">
        <input className={INPUT} value={step.list_footer} onChange={e => update({ list_footer: e.target.value })} placeholder="Footer text" />
      </Field>
      <Field label="Button Label">
        <input className={INPUT} value={step.list_button_label} onChange={e => update({ list_button_label: e.target.value })} placeholder="View Options" />
      </Field>
      <Divider />
      <div className="mb-4">
        <label className={LABEL}>Sections & Rows</label>
        {step.sections.map((sec, si) => (
          <div key={si} className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
            <div className="flex items-center gap-2 bg-base px-3 py-2 border-b border-gray-200">
              <input className="flex-1 text-xs font-semibold bg-transparent outline-none text-text" value={sec.title} onChange={e => updSecTitle(si, e.target.value)} placeholder="Section title" />
              {step.sections.length > 1 && <button type="button" onClick={() => delSec(si)} className="text-gray-400 hover:text-red-500"><X size={13} /></button>}
            </div>
            <div className="p-2">
              {sec.rows.map((row, ri) => (
                <div key={ri} className="grid gap-1.5 mb-1.5" style={{ gridTemplateColumns: '72px 1fr 1fr auto' }}>
                  <input className={`${INPUT} font-mono text-xs`} value={row.id} onChange={e => updRow(si, ri, { id: e.target.value })} placeholder="id" />
                  <input className={INPUT} value={row.title} onChange={e => updRow(si, ri, { title: e.target.value })} placeholder="Title" />
                  <input className={INPUT} value={row.description} onChange={e => updRow(si, ri, { description: e.target.value })} placeholder="Description" />
                  {sec.rows.length > 1 && <button type="button" onClick={() => delRow(si, ri)} className="text-gray-400 hover:text-red-500 p-1"><X size={13} /></button>}
                </div>
              ))}
              <button type="button" onClick={() => addRow(si)} className="flex items-center gap-1 text-xs text-primary hover:text-highlight mt-1"><Plus size={12} /> Add Row</button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addSec} className="flex items-center gap-1.5 text-sm text-primary hover:text-highlight"><Plus size={14} /> Add Section</button>
      </div>
    </>
  );
}

function MediaEditor({ step, update, stepId }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadErr('');
    try {
      const url = await uploadMedia(file);
      update({ media_url: url });
    } catch (err) {
      setUploadErr('Upload failed: ' + (err?.response?.data?.error || err.message));
    } finally {
      setUploading(false); e.target.value = '';
    }
  };

  const accept = step.contentType === 'image' ? 'image/*' : step.contentType === 'video' ? 'video/*' : '*/*';
  const label = { image: 'Image URL', video: 'Video URL', document: 'Document URL' }[step.contentType];

  return (
    <>
      <Field label={label}>
        <input className={INPUT} value={step.media_url} onChange={e => update({ media_url: e.target.value })} placeholder="https://example.com/file.jpg" />
      </Field>
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400 uppercase font-semibold">or upload</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <input ref={fileRef} type="file" accept={accept} onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-base border border-gray-200 rounded-lg text-sm text-text hover:bg-base2 transition-colors mb-4 disabled:opacity-50">
        {uploading ? <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Upload size={14} />}
        {uploading ? 'Uploading…' : 'Upload File'}
      </button>
      {uploadErr && <p className="text-xs text-red-500 mb-3 bg-red-50 px-3 py-2 rounded-lg">{uploadErr}</p>}
      {step.media_url && step.contentType === 'image' && (
        <div className="mb-4 rounded-lg overflow-hidden border border-gray-200">
          <img src={step.media_url} alt="preview" className="w-full max-h-40 object-cover" onError={e => { e.target.style.display = 'none'; }} />
        </div>
      )}
      <Field label="Caption (optional)">
        <WaEditor value={step.media_caption} onChange={v => update({ media_caption: v })} stepId={stepId} placeholder="Describe the media…" minHeight={56} />
      </Field>
      {step.contentType === 'document' && (
        <Field label="Filename">
          <input className={INPUT} value={step.media_filename} onChange={e => update({ media_filename: e.target.value })} placeholder="document.pdf" />
        </Field>
      )}
    </>
  );
}

function ProcessorEditor({ step, update }) {
  const procs = step.processors || [];
  const updP = (i, patch) => update({ processors: procs.map((p, x) => x === i ? { ...p, ...patch } : p) });
  const addP = () => update({ processors: [...procs, { name: '', wait: false, tpl: '{\n  "user_id": "{{user_id}}",\n  "id": "{{id}}",\n  "value": "{{value}}"\n}' }] });
  const delP = i => update({ processors: procs.filter((_, x) => x !== i) });
  return (
    <>
      <div className="bg-base border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-500 leading-relaxed">
        Processors run after the message is sent. Enable <strong>Wait</strong> to pause the flow until the user responds — their reply populates <code className="bg-base2 px-1 rounded">{'{{value}}'}</code> and <code className="bg-base2 px-1 rounded">{'{{id}}'}</code>.
      </div>
      {procs.map((p, i) => (
        <div key={i} className="border border-gray-200 rounded-lg mb-3 overflow-hidden">
          <div className="flex items-center gap-2 bg-base px-3 py-2 border-b border-gray-200">
            <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
            <input className={`${INPUT} flex-1`} value={p.name} onChange={e => updP(i, { name: e.target.value })} placeholder="function_name (e.g. process_bike_selection)" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={!!p.wait} onChange={e => updP(i, { wait: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
              Wait
            </label>
            <button type="button" onClick={() => delP(i)} className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"><X size={14} /></button>
          </div>
          <div className="p-3">
            <label className={`${LABEL} mb-1.5`}>Payload Template (JSON)</label>
            <textarea value={p.tpl} onChange={e => updP(i, { tpl: e.target.value })}
                      spellCheck={false}
                      className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-primary bg-white resize-y text-text"
                      style={{ minHeight: 88, lineHeight: 1.6 }} />
          </div>
        </div>
      ))}
      <button type="button" onClick={addP} className="flex items-center gap-1.5 text-sm text-primary hover:text-highlight transition-colors">
        <Plus size={14} /> Add Processor
      </button>
    </>
  );
}

/* ── Content type config ──────────────────────────────────────────────── */
const CTYPES = [
  { value: 'text',               label: 'Text',            icon: <Type size={16} /> },
  { value: 'button_interactive', label: 'Buttons',         icon: <MousePointerClick size={16} /> },
  { value: 'list_interactive',   label: 'List',            icon: <List size={16} /> },
  { value: 'image',              label: 'Image',           icon: <Image size={16} /> },
  { value: 'video',              label: 'Video',           icon: <Video size={16} /> },
  { value: 'document',           label: 'Document',        icon: <FileText size={16} /> },
];

const TABS = [
  { id: 'content',   label: 'Content',    icon: <Type size={13} /> },
  { id: 'processor', label: 'Processors', icon: <Zap size={13} /> },
  { id: 'settings',  label: 'Settings',   icon: <Settings size={13} /> },
];

function StepEditor({ step, update, stepId }) {
  const [tab, setTab] = useState('content');

  if (!step) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400">
      <MousePointerClick size={36} strokeWidth={1.2} />
      <p className="text-sm">Select a step to edit</p>
      <p className="text-xs text-gray-300">or add a new step from the left panel</p>
    </div>
  );

  const procCount = step.processors?.length || 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Step identity row */}
      <div className="px-5 pt-4 pb-0 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-3">
          <input value={step.name} onChange={e => update({ name: e.target.value })}
                 className="flex-1 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-lg focus:outline-none focus:border-primary text-text"
                 placeholder="Step name" />
          <input value={step.id} onChange={e => update({ id: e.target.value })}
                 className="w-32 px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-primary text-gray-500"
                 placeholder="step_id" />
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none whitespace-nowrap">
            <input type="checkbox" checked={!!step.is_active} onChange={e => update({ is_active: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
            Active
          </label>
        </div>
        {/* Tabs */}
        <div className="flex">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm transition-all border-b-2 ${tab === t.id ? 'border-primary text-primary font-semibold' : 'border-transparent text-gray-500 hover:text-text'}`}>
              {t.icon}
              {t.label}
              {t.id === 'processor' && procCount > 0 && (
                <span className="text-xs bg-primary text-white rounded-full w-4 h-4 flex items-center justify-center leading-none">{procCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'content' && (
          <>
            <div className="mb-5">
              <label className={SECTION_HDR}>Message Type</label>
              <div className="grid grid-cols-3 gap-2">
                {CTYPES.map(ct => (
                  <button key={ct.value} type="button" onClick={() => update({ contentType: ct.value })}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${step.contentType === ct.value ? 'border-primary bg-base2 text-primary' : 'border-gray-200 bg-white text-gray-500 hover:bg-base hover:border-gray-300'}`}>
                    <span className={step.contentType === ct.value ? 'text-primary' : 'text-gray-400'}>{ct.icon}</span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <Divider />
            {step.contentType === 'text' && <TextEditor step={step} update={update} stepId={stepId} />}
            {step.contentType === 'button_interactive' && <ButtonEditor step={step} update={update} stepId={stepId} />}
            {step.contentType === 'list_interactive' && <ListEditor step={step} update={update} stepId={stepId} />}
            {['image','video','document'].includes(step.contentType) && <MediaEditor step={step} update={update} stepId={stepId} />}
          </>
        )}
        {tab === 'processor' && <ProcessorEditor step={step} update={update} />}
        {tab === 'settings' && (
          <div className="space-y-3">
            <div className="bg-base rounded-lg p-4 text-sm text-gray-600 leading-relaxed space-y-2 border border-gray-200">
              <div className="flex justify-between"><span className="text-gray-400 text-xs uppercase font-semibold">Step ID</span><code className="bg-base2 px-2 py-0.5 rounded text-xs font-mono">{step.id}</code></div>
              <div className="flex justify-between"><span className="text-gray-400 text-xs uppercase font-semibold">Type</span><span className="text-xs">{CTYPES.find(c => c.value === step.contentType)?.label}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-xs uppercase font-semibold">Processors</span><span className="text-xs">{procCount}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-xs uppercase font-semibold">Waits for user</span><span className="text-xs">{step.processors.some(p => p.wait) ? '✓ Yes' : 'No'}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-xs uppercase font-semibold">Active</span><span className="text-xs">{step.is_active ? '✓ Yes' : 'No'}</span></div>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">Step order and <code className="bg-base2 px-1 rounded">next_step</code> are derived automatically from the list order. Reorder steps using the arrows in the left panel.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   LEFT PANEL — STEP CARD
══════════════════════════════════════════════════════════════════════ */
const CTYPE_ICON = { text: <Type size={14} />, button_interactive: <MousePointerClick size={14} />, list_interactive: <List size={14} />, image: <Image size={14} />, video: <Video size={14} />, document: <FileText size={14} /> };

function StepCard({ step, index, total, isSelected, onSelect, onDelete, onMove }) {
  return (
    <div onClick={onSelect}
         className={`group flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all mb-1.5 ${isSelected ? 'border-primary bg-base2 text-primary' : 'border-gray-200 bg-white text-text hover:bg-base hover:border-gray-300'}`}>
      <span className="text-xs font-bold text-gray-400 w-5 text-center shrink-0">{index + 1}</span>
      <span className={`shrink-0 ${isSelected ? 'text-primary' : 'text-gray-400'}`}>{CTYPE_ICON[step.contentType]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{step.name}</p>
        {step.processors.some(p => p.wait) && <p className="text-xs text-amber-500 mt-0.5">⏳ waits for input</p>}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button type="button" title="Move up" onClick={e => { e.stopPropagation(); onMove(-1); }} disabled={index === 0}
                className="p-0.5 rounded text-gray-400 hover:text-text disabled:opacity-30 disabled:cursor-default"><ChevronUp size={13} /></button>
        <button type="button" title="Move down" onClick={e => { e.stopPropagation(); onMove(1); }} disabled={index === total - 1}
                className="p-0.5 rounded text-gray-400 hover:text-text disabled:opacity-30 disabled:cursor-default"><ChevronDown size={13} /></button>
        <button type="button" title="Delete step" onClick={e => { e.stopPropagation(); onDelete(); }}
                className="p-0.5 rounded text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════════════════════ */
function JsonModal({ json, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(json, null, 2);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const download = () => { const a = document.createElement('a'); a.href = 'data:application/json,' + encodeURIComponent(text); a.download = `${json.id || 'flow'}.json`; a.click(); };
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-primary rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10">
          <Braces size={16} className="text-gray-400" />
          <span className="text-white font-semibold flex-1">Flow JSON</span>
          <button type="button" onClick={download} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs font-medium transition-colors">
            <Save size={12} /> Download
          </button>
          <button type="button" onClick={copy} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
            {copied ? <><Check size={12} /> Copied!</> : 'Copy'}
          </button>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white ml-1"><X size={18} /></button>
        </div>
        <pre className="flex-1 overflow-y-auto p-5 text-xs font-mono text-green-300 leading-relaxed whitespace-pre-wrap break-words">{text}</pre>
      </div>
    </div>
  );
}

function AIModal({ onClose, onLoad }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await api.post('/flows/generate', { description: prompt });
      onLoad(res.data);
    } catch (e) {
      setError(e?.response?.data?.error || 'Generation failed. Make sure GOOGLE_API_KEY is set.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
          <Sparkles size={18} className="text-highlight" />
          <span className="font-semibold text-text flex-1">AI Flow Generator</span>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-text"><X size={18} /></button>
        </div>
        <div className="p-5">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-xs text-green-700 leading-relaxed">
            <strong>Powered by Gemini</strong> — uses structured JSON generation to produce a complete, backend-compatible flow in one shot. Describe your flow in plain English.
          </div>
          <label className={LABEL}>Describe your flow</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={5}
                    className={`${INPUT} resize-none mb-2`}
                    placeholder="e.g. A loan eligibility check that asks for monthly income and employment type, then shows eligible products with a button to apply or see details." />
          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-base border border-gray-200 rounded-lg text-sm text-text hover:bg-base2 transition-colors">Cancel</button>
            <button type="button" onClick={generate} disabled={loading || !prompt.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-highlight text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Sparkles size={14} />}
              {loading ? 'Generating…' : 'Generate Flow'}
            </button>
          </div>
        </div>
        <div className="px-5 pb-4 text-xs text-gray-400">
          Requires <code className="bg-base px-1 rounded">GOOGLE_API_KEY</code> in environment · Uses <code className="bg-base px-1 rounded">gemini-1.5-flash</code>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════ */
export default function FlowBuilderPage() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState({ name: '', id: '', trigger: '', is_active: true, next_flow: '' });
  const [steps, setSteps] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showJSON, setShowJSON] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const selectedStep = steps.find(s => s.id === selectedId) || null;
  const updateMeta = patch => setMeta(m => ({ ...m, ...patch }));
  const updateStep = patch => setSteps(ss => ss.map(s => s.id === selectedId ? { ...s, ...patch } : s));

  const addStep = () => {
    const s = defaultStep(steps.length + 1);
    setSteps(ss => [...ss, s]);
    setSelectedId(s.id);
  };

  const deleteStep = id => {
    setSteps(ss => ss.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const moveStep = (id, dir) => {
    setSteps(ss => {
      const i = ss.findIndex(s => s.id === id), j = i + dir;
      if (j < 0 || j >= ss.length) return ss;
      const n = [...ss]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  };

  const saveToFile = async () => {
    const json = toFlowJson(meta, steps);
    if (!json.id) { setSaveMsg('Set a Flow ID before saving.'); setTimeout(() => setSaveMsg(''), 3000); return; }
    setSaving(true); setSaveMsg('');
    try {
      await api.post('/flows/file', json);
      setSaveMsg('✓ Saved');
    } catch (e) {
      setSaveMsg('Failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSaving(false); setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  const loadFromAI = (flowJson) => {
    setShowAI(false);
    setMeta({ name: flowJson.name || '', id: flowJson.id || '', trigger: flowJson.trigger || '', is_active: flowJson.is_active !== false, next_flow: flowJson.next_flow || '' });
    const loaded = (flowJson.steps || []).map((s, i) => {
      const base = defaultStep(i + 1);
      const ct = s.content || {};
      let u = { id: s.id, name: s.name, is_active: s.is_active !== false };
      if (ct.type === 'text') {
        u = { ...u, contentType: 'text', text_body: ct.body || '' };
      } else if (ct.type === 'interactive') {
        const b = ct.body || {};
        if (b.type === 'button') {
          u = { ...u, contentType: 'button_interactive', btn_header: b.header?.text || '', btn_body: b.body?.text || '', btn_footer: b.footer?.text || '', buttons: b.action?.buttons?.map(x => ({ id: x.reply?.id || '', title: x.reply?.title || '' })) || [] };
        } else if (b.type === 'list') {
          u = { ...u, contentType: 'list_interactive', list_header: b.header?.text || '', list_body: b.body?.text || '', list_footer: b.footer?.text || '', list_button_label: b.action?.button || 'View Options', sections: b.action?.sections || [] };
        }
      } else if (['image','video','document'].includes(ct.type)) {
        u = { ...u, contentType: ct.type, media_url: ct.body || '', media_caption: ct.caption || '', media_filename: ct.filename || '' };
      }
      u.processors = (s.processor || []).map(p => ({ name: p.name || '', wait: !!p.wait, tpl: JSON.stringify(p.payload_template || {}, null, 2) }));
      return { ...base, ...u };
    });
    setSteps(loaded);
    setSelectedId(loaded[0]?.id || null);
  };

  const flowJson = toFlowJson(meta, steps);

  return (
    <div className="flex flex-col h-screen font-sans overflow-hidden bg-background">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3 shrink-0 z-10">
        <button type="button" onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-base hover:text-text transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <span className="font-semibold text-text">Flow Builder</span>
        {meta.trigger && <span className="text-xs text-gray-500 bg-base px-2 py-1 rounded-lg font-mono">{meta.trigger}</span>}
        <div className="flex-1" />
        {saveMsg && (
          <span className={`text-xs font-medium px-2 py-1 rounded-lg ${saveMsg.startsWith('✓') ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {saveMsg}
          </span>
        )}
        <button type="button" onClick={() => setShowAI(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-highlight text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity">
          <Sparkles size={14} /> AI Generate
        </button>
        <button type="button" onClick={() => setShowJSON(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-base border border-gray-200 text-text rounded-lg text-sm font-medium hover:bg-base2 transition-colors">
          <Braces size={14} /> JSON
        </button>
        <button type="button" onClick={saveToFile} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={14} />}
          Save Flow
        </button>
      </div>

      {/* ── Main body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT — steps panel */}
        <div className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
          {/* Flow meta */}
          <div className="p-4 border-b border-gray-100">
            <p className={SECTION_HDR}>Flow Info</p>
            {[
              { k: 'name',      label: 'Name',             ph: 'e.g. Loan Application',   mono: false },
              { k: 'id',        label: 'Flow ID',          ph: 'e.g. loan_flow',          mono: true  },
              { k: 'trigger',   label: 'Trigger',          ph: 'e.g. /apply_loan',        mono: true  },
              { k: 'next_flow', label: 'Next Flow (opt.)', ph: 'e.g. followup_flow',      mono: true  },
            ].map(f => (
              <div key={f.k} className="mb-2.5">
                <label className="block text-xs text-gray-400 mb-1">{f.label}</label>
                <input value={meta[f.k]} onChange={e => updateMeta({ [f.k]: e.target.value })}
                       placeholder={f.ph}
                       className={`w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-primary bg-white text-text ${f.mono ? 'font-mono' : ''}`} />
              </div>
            ))}
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none mt-1">
              <input type="checkbox" checked={!!meta.is_active} onChange={e => updateMeta({ is_active: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
              Active
            </label>
          </div>

          {/* Steps list */}
          <div className="flex-1 overflow-y-auto p-3">
            <p className={SECTION_HDR}>Steps ({steps.length})</p>
            {steps.map((s, i) => (
              <StepCard key={s.id} step={s} index={i} total={steps.length}
                        isSelected={selectedId === s.id}
                        onSelect={() => setSelectedId(s.id)}
                        onDelete={() => deleteStep(s.id)}
                        onMove={dir => moveStep(s.id, dir)} />
            ))}
            {steps.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 leading-relaxed">No steps yet.<br/>Click below to add your first step.</p>
            )}
          </div>

          {/* Add step */}
          <div className="p-3 border-t border-gray-100">
            <button type="button" onClick={addStep}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-primary hover:text-primary hover:bg-base transition-all">
              <Plus size={15} /> Add Step
            </button>
          </div>
        </div>

        {/* CENTER — step editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          <StepEditor step={selectedStep} update={updateStep} stepId={selectedId} />
        </div>

        {/* RIGHT — phone preview */}
        <div className="w-80 bg-base border-l border-gray-200 overflow-y-auto py-5 shrink-0">
          <PhonePreview steps={steps} selectedId={selectedId} />
        </div>
      </div>

      {showJSON && <JsonModal json={flowJson} onClose={() => setShowJSON(false)} />}
      {showAI   && <AIModal onClose={() => setShowAI(false)} onLoad={loadFromAI} />}
    </div>
  );
}
