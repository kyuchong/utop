// ══════════════════════════════════════════════════════════════════
// TO-DO 페이지 (관리자 공용) — 서버 저장 + WebSocket 실시간 동기화.
// 항목별: 번호(자동), 내용(inline 편집), 상태(대기/진행중/완료 → 완료 시 취소선).
// ══════════════════════════════════════════════════════════════════

// 서버 형식과 호환: [{text, status, at}, ...]
var _todoList = [];      // in-memory 캐시 (fetch 결과)
var _todoLoaded = false; // 최초 fetch 완료 여부
var _todoSaveTimer = null;
var _todoInflightGet = null;

// 상태 정의
const TODO_STATUSES = [
  { v: 'todo',  label: '대기',    color: '#8a93a5' },
  { v: 'doing', label: '진행 중', color: '#e8820c' },
  { v: 'done',  label: '완료',    color: '#00a872' },
];
function _todoStatusMeta(v) {
  return TODO_STATUSES.find(s => s.v === v) || TODO_STATUSES[0];
}

function _todoEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function _todoFetch(silent) {
  // 진행 중 요청이 있으면 그 promise 재사용 (중복 fetch 방지)
  if (_todoInflightGet) return _todoInflightGet;
  _todoInflightGet = (async function () {
    try {
      const r = await fetch('/api/todo?_=' + Date.now(), { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        _todoList = Array.isArray(d && d.items) ? d.items : [];
        _todoLoaded = true;
        // 최초 fetch: 서버 비어 있고 localStorage 에 기존 데이터 있으면 자동 마이그레이션 (한 번만)
        if (_todoList.length === 0 && !localStorage.getItem('utop_admin_todo_migrated')) {
          try {
            const raw = localStorage.getItem('utop_admin_todo_v1');
            if (raw) {
              const arr = JSON.parse(raw);
              if (Array.isArray(arr) && arr.length) {
                _todoList = arr.map(function (it) {
                  if (!it || typeof it !== 'object') return { text: '', status: 'todo' };
                  if (it.status) return it;
                  return { text: String(it.text || ''), status: it.done ? 'done' : 'todo', at: it.at || 0 };
                });
                localStorage.setItem('utop_admin_todo_migrated', '1');
                await _todoSaveServer();
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
    _todoInflightGet = null;
  })();
  return _todoInflightGet;
}

async function _todoSaveServer() {
  try {
    const r = await fetch('/api/todo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: _todoList }),
    });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d && d.items)) _todoList = d.items;
    }
  } catch (e) {
    if (typeof showToast === 'function') showToast('TO-DO 저장 실패: ' + (e && e.message ? e.message : ''));
  }
}

// 텍스트 편집 후 blur 시 짧게 지연시켜 여러 필드 편집 한 번에 저장 (연속 편집 시 중복 요청 방지)
function _todoSaveDebounced() {
  if (_todoSaveTimer) clearTimeout(_todoSaveTimer);
  _todoSaveTimer = setTimeout(function () { _todoSaveTimer = null; _todoSaveServer(); }, 300);
}

async function renderTodoPage() {
  const el = document.getElementById('page-todo');
  if (!el) return;
  if (typeof isAdmin === 'function' && !isAdmin()) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px;">' +
      '<i class="ti ti-lock" style="font-size:46px;opacity:0.3;display:block;margin-bottom:14px;"></i>' +
      '<div style="font-size:16px;font-weight:700;">관리자만 접근할 수 있습니다.</div></div>';
    return;
  }
  // 첫 진입 시 서버에서 로드 (스켈레톤 잠깐 표시)
  if (!_todoLoaded) {
    el.innerHTML = '<div style="text-align:center;color:var(--text3);padding:60px;">' +
      '<i class="ti ti-loader-2 spin" style="font-size:26px;color:#7c3aed;"></i>' +
      '<div style="margin-top:10px;font-size:13px;">TO-DO 로드 중…</div></div>';
    await _todoFetch();
  }

  const list = _todoList;
  const cntDone  = list.filter(x => x && x.status === 'done').length;
  const cntDoing = list.filter(x => x && x.status === 'doing').length;
  const cntTodo  = list.filter(x => x && (x.status === 'todo' || !x.status)).length;

  const header = ''
    + '<div style="display:flex;align-items:center;gap:16px;margin-bottom:22px;flex-wrap:wrap;">'
    +   '<i class="ti ti-checklist" style="font-size:34px;color:#7c3aed;"></i>'
    +   '<span style="font-size:26px;font-weight:800;color:var(--text);">TO-DO</span>'
    +   '<span style="font-size:14px;color:var(--text3);">총 ' + list.length + '개</span>'
    +   '<span style="display:inline-flex;gap:8px;align-items:center;font-size:13px;">'
    +     '<span style="padding:5px 13px;border-radius:14px;background:#eef1f5;color:#8a93a5;font-weight:700;">대기 ' + cntTodo + '</span>'
    +     '<span style="padding:5px 13px;border-radius:14px;background:#fff2e0;color:#e8820c;font-weight:700;">진행 중 ' + cntDoing + '</span>'
    +     '<span style="padding:5px 13px;border-radius:14px;background:#e5f7ee;color:#00a872;font-weight:700;">완료 ' + cntDone + '</span>'
    +   '</span>'
    +   '<span style="flex:1;"></span>'
    +   '<button onclick="todoAdd()" style="font-size:15px;font-weight:700;padding:10px 18px;border-radius:8px;border:1px solid #7c3aed;background:#7c3aed;color:#fff;cursor:pointer;">'
    +     '<i class="ti ti-plus" style="font-size:16px;"></i> 항목 추가'
    +   '</button>'
    +   (list.length ? ('<button onclick="todoClearDone()" title="완료 항목만 지우기" style="font-size:14px;font-weight:600;padding:9px 15px;border-radius:8px;border:1px solid var(--border);background:#fff;color:var(--text2);cursor:pointer;">'
    +     '<i class="ti ti-eraser" style="font-size:15px;"></i> 완료 지우기</button>') : '')
    + '</div>';

  const rows = list.map(function (it, i) {
    const n = i + 1;
    const st = (it && it.status) || 'todo';
    const meta = _todoStatusMeta(st);
    const isDone = (st === 'done');
    const txt = _todoEsc((it && it.text) || '');
    const textStyle = isDone
      ? 'color:var(--text3);text-decoration:line-through;'
      : 'color:var(--text);';
    const options = TODO_STATUSES.map(function (s) {
      return '<option value="' + s.v + '"' + (s.v === st ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
    const comments = Array.isArray(it && it.comments) ? it.comments : [];
    const openKey = 'todo_c_open_' + i;
    const isOpen = (typeof _todoCmtOpen !== 'undefined') && _todoCmtOpen[i];
    const cmtBtn = ''
      + '<button onclick="todoToggleComments(' + i + ')" title="댓글" style="display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:14px;border:1px solid ' + (comments.length ? '#7c3aed' : 'var(--border)') + ';background:' + (comments.length ? '#f4efff' : '#fff') + ';color:' + (comments.length ? '#7c3aed' : 'var(--text3)') + ';cursor:pointer;font-size:12px;font-weight:700;margin-top:6px;">'
      +   '<i class="ti ti-message-2" style="font-size:14px;"></i>'
      +   (comments.length ? ('<span>' + comments.length + '</span>') : '<span>댓글</span>')
      + '</button>';
    return ''
      + '<div class="todo-row-wrap" style="margin-bottom:10px;">'
      + '<div class="todo-row" data-idx="' + i + '" style="display:flex;align-items:flex-start;gap:16px;padding:16px 18px;background:#fff;border:1px solid var(--border);border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,0.03);border-left:5px solid ' + meta.color + ';' + (isOpen ? 'border-bottom-left-radius:0;border-bottom-right-radius:0;' : '') + '">'
      +   '<span style="font-size:17px;font-weight:800;color:#7c3aed;min-width:34px;padding-top:8px;">' + n + '.</span>'
      +   '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">'
      +     '<div contenteditable="true" onblur="todoSetText(' + i + ', this.innerText)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();this.blur();}" style="font-size:16px;line-height:1.7;min-height:30px;padding:6px 8px;border-radius:5px;outline:none;' + textStyle + '">' + txt + '</div>'
      +     cmtBtn
      +   '</div>'
      +   '<select onchange="todoSetStatus(' + i + ', this.value)" title="상태 변경" style="font-size:14px;font-weight:700;padding:8px 14px;border-radius:7px;border:1.5px solid ' + meta.color + ';background:#fff;color:' + meta.color + ';outline:none;cursor:pointer;min-width:110px;">' + options + '</select>'
      +   '<button onclick="todoRemove(' + i + ')" title="이 항목 삭제" style="width:36px;height:36px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--text3);cursor:pointer;padding:0;">'
      +     '<i class="ti ti-trash" style="font-size:18px;"></i>'
      +   '</button>'
      + '</div>'
      + (isOpen ? _todoRenderCommentPanel(i, comments, meta.color) : '')
      + '</div>';
  }).join('');

  const empty = list.length ? '' : ''
    + '<div style="text-align:center;color:var(--text3);padding:80px 20px;background:#fff;border:1px dashed var(--border);border-radius:12px;">'
    +   '<i class="ti ti-clipboard-text" style="font-size:48px;opacity:0.25;display:block;margin-bottom:14px;"></i>'
    +   '<div style="font-size:15px;">항목이 없습니다. 상단 <b style="color:#7c3aed;">[+ 항목 추가]</b> 로 시작하세요.</div>'
    + '</div>';

  el.innerHTML = ''
    + '<div style="max-width:1400px;margin:0 auto;">'
    +   header
    +   '<div id="todo-list">' + rows + empty + '</div>'
    + '</div>';
}

// 다른 사용자가 저장했을 때 WS 로 호출 → 서버 재조회 후 렌더링 (다만 지금 페이지에 있을 때만)
async function _todoOnWsUpdate() {
  // 편집 중(활성 contenteditable 이 이 페이지 안) 이면 스킵 → 사용자 입력 안 지움
  try {
    const ae = document.activeElement;
    const page = document.getElementById('page-todo');
    if (page && ae && ae.isContentEditable && page.contains(ae)) return;
  } catch (e) {}
  await _todoFetch();
  // 현재 TO-DO 페이지 보고 있으면 재렌더링
  const pg = document.getElementById('page-todo');
  if (pg && pg.classList.contains('active')) renderTodoPage();
}

async function todoAdd() {
  _todoList.push({ text: '', status: 'todo', at: Date.now() });
  await _todoSaveServer();
  renderTodoPage();
  // 방금 추가된 항목에 자동 포커스
  setTimeout(function () {
    const rows = document.querySelectorAll('#todo-list .todo-row');
    const last = rows[rows.length - 1];
    if (last) {
      const ed = last.querySelector('[contenteditable]');
      if (ed) ed.focus();
    }
  }, 30);
}

async function todoSetStatus(idx, value) {
  if (!_todoList[idx]) return;
  const valid = TODO_STATUSES.some(s => s.v === value);
  _todoList[idx].status = valid ? value : 'todo';
  await _todoSaveServer();
  renderTodoPage();
}

function todoSetText(idx, text) {
  if (!_todoList[idx]) return;
  const v = String(text || '').trim();
  if (_todoList[idx].text === v) return;
  _todoList[idx].text = v;
  _todoSaveDebounced();
  // 재렌더 생략 (사용자 커서 위치 유지)
}

async function todoRemove(idx) {
  if (!_todoList[idx]) return;
  if (!confirm((idx + 1) + '번 항목을 삭제할까요?')) return;
  _todoList.splice(idx, 1);
  await _todoSaveServer();
  renderTodoPage();
}

async function todoClearDone() {
  const kept = _todoList.filter(x => x && x.status !== 'done');
  if (kept.length === _todoList.length) return;
  if (!confirm('완료된 항목 ' + (_todoList.length - kept.length) + '개를 지울까요?')) return;
  _todoList = kept;
  await _todoSaveServer();
  renderTodoPage();
}

// ── 댓글(코멘트) 기능 ───────────────────────────────────────────
// 항목별 comments 배열 = [{id, text, images:[dataURL...], author, at}]
// 열려있는 항목 인덱스 상태 (페이지 전환 시 유지되지 않아도 문제 없음)
var _todoCmtOpen = {};

function _todoCurrentUser() {
  try {
    if (typeof currentUser === 'function') { var u = currentUser(); return (u && (u.name || u.username || u.email)) || '관리자'; }
    if (typeof getCurrentUser === 'function') { var u2 = getCurrentUser(); return (u2 && (u2.name || u2.username || u2.email)) || '관리자'; }
  } catch (e) {}
  return '관리자';
}

function _todoFmtTime(ts) {
  try {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  } catch (e) { return ''; }
}

function todoToggleComments(i) {
  _todoCmtOpen[i] = !_todoCmtOpen[i];
  renderTodoPage();
}

function _todoRenderCommentPanel(i, comments, accent) {
  var meAuthor = _todoEsc(_todoCurrentUser());
  var items = comments.map(function (c, ci) {
    var text = _todoEsc(c && c.text || '');
    var author = _todoEsc(c && c.author || '');
    var when = _todoEsc(_todoFmtTime((c && c.at) || 0));
    var imgs = (Array.isArray(c && c.images) ? c.images : []).map(function (src, ii) {
      // dataURL 그대로 삽입 (사용자 붙여넣은 이미지)
      return '<img src="' + src + '" onclick="todoOpenImage(this.src)" style="max-width:220px;max-height:180px;object-fit:contain;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;background:#fafbfc;" title="클릭 시 원본 크기로 보기" />';
    }).join('');
    return ''
      + '<div class="todo-cmt-row" style="display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #eef0f3;">'
      +   '<div style="width:28px;height:28px;border-radius:50%;background:' + accent + ';color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' + (author ? author.charAt(0).toUpperCase() : '?') + '</div>'
      +   '<div style="flex:1;min-width:0;">'
      +     '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px;">'
      +       '<b style="font-size:13px;color:var(--text);">' + author + '</b>'
      +       '<span style="font-size:11.5px;color:var(--text3);">' + when + '</span>'
      +       '<span style="flex:1;"></span>'
      +       '<button onclick="todoDeleteComment(' + i + ',\'' + _todoEsc((c && c.id) || '') + '\')" title="댓글 삭제" style="background:transparent;border:none;color:var(--text3);cursor:pointer;padding:2px 4px;font-size:12px;">'
      +         '<i class="ti ti-x"></i>'
      +       '</button>'
      +     '</div>'
      +     (text ? ('<div style="font-size:13.5px;line-height:1.55;color:var(--text);white-space:pre-wrap;word-break:break-word;">' + text + '</div>') : '')
      +     (imgs ? ('<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">' + imgs + '</div>') : '')
      +   '</div>'
      + '</div>';
  }).join('');
  var empty = comments.length ? '' : '<div style="padding:14px;text-align:center;color:var(--text3);font-size:12.5px;">아직 댓글이 없습니다.</div>';
  return ''
    + '<div class="todo-cmt-panel" style="background:#fafbfc;border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;margin-left:0;">'
    +   '<div>' + items + empty + '</div>'
    +   '<div style="padding:10px 12px;border-top:1px solid #eef0f3;background:#fff;border-radius:0 0 12px 12px;">'
    +     '<div id="todo-cmt-preview-' + i + '" style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:6px;"></div>'
    +     '<div style="display:flex;gap:8px;align-items:flex-end;">'
    +       '<div contenteditable="true" id="todo-cmt-input-' + i + '" data-idx="' + i + '" '
    +         'onpaste="return todoCmtPaste(event,' + i + ')" '
    +         'onkeydown="if(event.key===\'Enter\'&&(event.ctrlKey||event.metaKey)){event.preventDefault();todoCmtSubmit(' + i + ');}" '
    +         'style="flex:1;min-height:38px;max-height:160px;overflow-y:auto;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13.5px;line-height:1.5;background:#fff;outline:none;" '
    +         'data-placeholder="댓글 입력 · Ctrl+Enter 로 등록 · 이미지 붙여넣기 가능"></div>'
    +       '<button onclick="todoCmtSubmit(' + i + ')" style="height:38px;padding:0 16px;border-radius:8px;border:1px solid #7c3aed;background:#7c3aed;color:#fff;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0;">'
    +         '등록'
    +       '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

// 붙여넣기 이벤트 → 이미지가 clipboard 에 있으면 dataURL 로 변환하여 프리뷰에 추가
function todoCmtPaste(event, i) {
  try {
    var items = (event.clipboardData && event.clipboardData.items) || [];
    var handled = false;
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (it && it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
        var file = it.getAsFile();
        if (file) {
          handled = true;
          var reader = new FileReader();
          reader.onload = function (ev) { _todoCmtAddPreviewImage(i, ev.target.result); };
          reader.readAsDataURL(file);
        }
      }
    }
    if (handled) { event.preventDefault(); return false; }
  } catch (e) {}
  return true;
}

function _todoCmtAddPreviewImage(i, dataURL) {
  var box = document.getElementById('todo-cmt-preview-' + i);
  if (!box) return;
  box.style.display = 'flex';
  var wrap = document.createElement('span');
  wrap.style.cssText = 'position:relative;display:inline-block;';
  wrap.setAttribute('data-src', dataURL);
  wrap.innerHTML = ''
    + '<img src="' + dataURL + '" style="max-width:100px;max-height:80px;object-fit:cover;border:1px solid var(--border);border-radius:6px;" />'
    + '<button onclick="this.parentNode.remove();var b=document.getElementById(\'todo-cmt-preview-' + i + '\');if(b&&!b.querySelector(\'span\'))b.style.display=\'none\';" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:1.5px solid #fff;background:#e35;color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0;">×</button>';
  box.appendChild(wrap);
}

async function todoCmtSubmit(i) {
  if (!_todoList[i]) return;
  var input = document.getElementById('todo-cmt-input-' + i);
  var box = document.getElementById('todo-cmt-preview-' + i);
  var text = input ? (input.innerText || '').replace(/ /g, ' ').trim() : '';
  var images = [];
  if (box) {
    var spans = box.querySelectorAll('span[data-src]');
    for (var k = 0; k < spans.length; k++) {
      var src = spans[k].getAttribute('data-src');
      if (src) images.push(src);
    }
  }
  if (!text && !images.length) return;
  if (!Array.isArray(_todoList[i].comments)) _todoList[i].comments = [];
  var cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  _todoList[i].comments.push({
    id: cid,
    text: text,
    images: images,
    author: _todoCurrentUser(),
    at: Date.now(),
  });
  await _todoSaveServer();
  renderTodoPage();
}

async function todoDeleteComment(i, cid) {
  if (!_todoList[i] || !Array.isArray(_todoList[i].comments)) return;
  if (!confirm('이 댓글을 삭제할까요?')) return;
  _todoList[i].comments = _todoList[i].comments.filter(function (c) { return c && c.id !== cid; });
  await _todoSaveServer();
  renderTodoPage();
}

function todoOpenImage(src) {
  try {
    var prev = document.getElementById('todo-img-modal');
    if (prev) prev.remove();
    var ov = document.createElement('div');
    ov.id = 'todo-img-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(10,12,18,0.86);z-index:99999;display:flex;align-items:center;justify-content:center;padding:32px;cursor:zoom-out;';
    ov.onclick = function (ev) { if (ev.target === ov) ov.remove(); };
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.title = '닫기 (Esc)';
    closeBtn.innerHTML = '<i class="ti ti-x" style="font-size:20px;"></i>';
    closeBtn.style.cssText = 'position:absolute;top:18px;right:22px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;';
    closeBtn.onclick = function () { ov.remove(); };
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,0.6);cursor:default;';
    img.onclick = function (ev) { ev.stopPropagation(); };
    ov.appendChild(img);
    ov.appendChild(closeBtn);
    document.body.appendChild(ov);
    var onKey = function (ev) {
      if (ev.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  } catch (e) {}
}

// contenteditable placeholder (empty state)
(function () {
  try {
    var css = document.createElement('style');
    css.textContent = ''
      + '[id^="todo-cmt-input-"]:empty:before{content:attr(data-placeholder);color:var(--text3);pointer-events:none;}'
      + '.todo-cmt-panel img{transition:transform 0.1s;}'
      + '.todo-cmt-panel img:hover{transform:scale(1.02);}';
    document.head.appendChild(css);
  } catch (e) {}
})();
