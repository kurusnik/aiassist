import { state } from './state.js';
import {
  setMessages,
  addMessage,
  setLoading,
  updateModel
} from './stateActions.js';
import { updateSystemPrompt } from './stateActions.js';


// ---------- загрузка моделей ----------
async function loadModels() {
  const res = await fetch('/models', { credentials: 'include' });
  const models = await res.json();

  const select = document.getElementById('model');
  select.innerHTML = '';

  models.forEach(m => {
    const option = document.createElement('option');
    option.value = m.id;
    option.textContent = m.name;
    select.appendChild(option);
  });

  select.addEventListener('change', e => {
    updateModel(e.target.value);
  });

  // initial model
  if (select.options.length > 0) {
    updateModel(select.value);
  }
}

// ---------- загрузка истории ----------
async function loadHistory() {
  const res = await fetch('/projects/' + state.currentProjectId + '/messages', { credentials: 'include' });
  const messages = await res.json();

  setMessages(messages);
  renderChat();
}

// ---------- отправка сообщения ----------
async function sendMessage() {
  const textarea = document.getElementById('message');
  const text = textarea.value.trim();
  if (!text || state.ui.loading) return;

  addMessage({ role: 'user', content: text });
  const assistantMessage = { role: 'assistant', content: '' };
  addMessage(assistantMessage);
  renderChat();

  textarea.value = '';
  setLoading(true);

  const response = await fetch('/assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Stream': '1'  // Запрашиваем потоковую выдачу
    },
    credentials: 'include',
    body: JSON.stringify({
      projectId: state.currentProjectId,
      userMessage: text,
      model: state.projectSettings.model
    })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  // Собираем сегменты (не используется, метки уже в content)
  const collectedSegments = [];

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          
if (data.content) {
        assistantMessage.content += data.content;
        renderChat();
      }

      if (data.done) {
        setLoading(false);

        if (data.parsed) {
          assistantMessage.metadata = {
            ...assistantMessage.metadata,
            sources: {
              segmentsCount: data.parsed.segmentsCount,
              hasRAG: data.parsed.hasSource,
              hasModel: data.parsed.hasModel
            }
          };
        }

        renderChat();
      }
        } catch (error) {
          console.error('Error parsing SSE data:', error);
        }
      }
    }
  }
}

// ---------- загрузка и распознавание изображения ----------
async function handleImageUpload(file) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('projectId', state.currentProjectId);

  try {
    // Показываем индикатор загрузки
    setLoading(true);
    const loadingEl = document.getElementById('loading-ocr');
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      loadingEl.textContent = 'Распознавание изображения...';
    }

    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Ошибка распознавания');
    }

    const result = await response.json();

    // Показываем ответ AI напрямую
    addMessage({
      role: 'assistant',
      content: result.aiResponse,
      metadata: {
        source: 'ocr',
        filename: result.filename
      }
    });
    
    renderChat();

    // Очищаем input
    document.getElementById('image-upload').value = '';

  } catch (error) {
    console.error('OCR Error:', error);
    alert('Не удалось распознать изображение: ' + error.message);
  } finally {
    setLoading(false);
    const loadingEl = document.getElementById('loading-ocr');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }
}

// Обработчик для input type="file"
document.getElementById('image-upload')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.type.startsWith('image/')) {
    handleImageUpload(file);
  }
});

// Добавить переключатель системы меток
function addSourceMarkersToggle() {
  const controls = document.querySelector('.controls');
  if (!controls || document.getElementById('toggle-markers')) return;
  
  const toggleContainer = document.createElement('div');
  toggleContainer.style.cssText = `
    margin: 10px 0;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 6px;
    font-size: 13px;
  `;
  
  const isEnabled = localStorage.getItem('sourceMarkersEnabled') !== 'false';
  
  toggleContainer.innerHTML = `
    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      <input type="checkbox" id="toggle-markers" ${isEnabled ? 'checked' : ''}>
      <span>📊 Показывать источники в ответах</span>
    </label>
    <div style="font-size: 11px; color: #6c757d; margin-top: 4px;">
      Выделяет RAG источники и знания модели
    </div>
  `;
  
  controls.insertBefore(toggleContainer, controls.firstChild);
  
  document.getElementById('toggle-markers').addEventListener('change', (e) => {
    localStorage.setItem('sourceMarkersEnabled', e.target.checked);
    renderChat(); // Перерендерить с новыми настройками
  });
}

// Проверим, есть ли старый чат и перерендерим
if (document.getElementById('chat')) {
  setTimeout(() => {
    if (state.messages.length > 0) {
      renderChat();
    }
  }, 200);
}

// Новый проект
async function addProject() {
  const name = prompt('Название проекта:');
  if (!name) return;

  const res = await fetch('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ name })
  });

  const project = await res.json();

  await loadProjects();

  // переключаемся
  state.currentProjectId = project.id;
  localStorage.setItem('currentProjectId', project.id);
  document.getElementById('projectSelect').value = project.id;

  // ✅ ВОТ ЗДЕСЬ очищаем UI
  setMessages([]);
  renderChat();

  // загружаем настройки и историю (будет пусто)
  await loadProjectSettings();
  await loadHistory();
}
async function loadProjectSettings() {
  const res = await fetch('/projects/' + state.currentProjectId, { credentials: 'include' });
  const project = await res.json();

  updateModel(project.model);
  updateSystemPrompt(project.system_prompt || '');

  document.getElementById('model').value = project.model;
  document.getElementById('systemPrompt').value =
    project.system_prompt || '';
}
  // удаление проекта
async function deleteProject() {
  if (!state.currentProjectId) return;

  const confirmDelete = confirm('Удалить проект и всю историю?');
  if (!confirmDelete) return;

  await fetch('/projects/' + state.currentProjectId, {
    method: 'DELETE',
    credentials: 'include'
  });

  // очищаем localStorage
  localStorage.removeItem('currentProjectId');

  // перезагружаем список
  await loadProjects();

  // если проекты остались — переключаемся
  const select = document.getElementById('projectSelect');

  if (select.options.length > 0) {
    const newId = Number(select.options[0].value);
    state.currentProjectId = newId;
    localStorage.setItem('currentProjectId', newId);

    await loadProjectSettings();
    await loadHistory();
  } else {
    // если проектов нет
    state.currentProjectId = null;
    setMessages([]);
    renderChat();
  }
}
  //кнопка удалить
async function resetChat() {
  if (!state.currentProjectId) return;

  const confirmReset = confirm('Очистить весь диалог?');
  if (!confirmReset) return;

  await fetch('/projects/' + state.currentProjectId + '/messages', {
    method: 'DELETE',
    credentials: 'include'
  });

  // очищаем state
  setMessages([]);
  renderChat();
}
/**
 * Парсинг меток источников
 */
function parseResponseMarkers(text) {
  const segments = [];
  let current = text;
  
  // Регулярные выражения для поиска меток
  const markers = [];
  
  // Найти все метки [TYPE] и [/TYPE]
  const openTags = [...current.matchAll(/\[(RAG:SOURCE|RAG:ANALYSIS|MODEL:KNOWLEDGE)\]/g)];
  const closeTags = [...current.matchAll(/\[\/(RAG|MODEL)\]/g)];
  
  openTags.forEach(match => markers.push({ pos: match.index, type: match[1], isOpen: true }));
  closeTags.forEach(match => markers.push({ pos: match.index, type: match[1], isClose: true }));
  
  markers.sort((a, b) => a.pos - b.pos);
  
  let currentType = 'MODEL:KNOWLEDGE';
  let lastPos = 0;
  
  for (const marker of markers) {
    // Сохранить текст перед меткой
    if (marker.pos > lastPos) {
      const content = current.substring(lastPos, marker.pos);
      if (content.trim()) {
        segments.push({
          type: currentType,
          content: content.trim(),
          isSource: currentType.includes('RAG'),
          isModel: currentType.includes('MODEL')
        });
      }
    }
    
    // Обновить текущий тип
    if (marker.isOpen) {
      currentType = marker.type;
    } else if (marker.isClose) {
      currentType = 'MODEL:KNOWLEDGE';
    }
    
    lastPos = marker.pos + (marker.isOpen ? marker.type.length + 2 : 5);
  }
  
  // Добавить остаток
  if (lastPos < current.length) {
    const remaining = current.substring(lastPos);
    if (remaining.trim()) {
      segments.push({
        type: currentType,
        content: remaining.trim(),
        isSource: currentType.includes('RAG'),
        isModel: currentType.includes('MODEL')
      });
    }
  }
  
  // Если нет сегментов, значит не было меток
  if (segments.length === 0 && text.trim()) {
    segments.push({
      type: 'MODEL:KNOWLEDGE',
      content: text.trim(),
      isSource: false,
      isModel: true
    });
  }
  
  return segments;
}

/**
 * Форматирование сегмента с иконкой
 */
function formatSegment(segment) {
  let icon = '💭';
  let iconColor = '#9fb0c0';
  let bgColor = 'rgba(159, 176, 192, 0.08)';
  let borderColor = 'rgba(159, 176, 192, 0.3)';
  let typeName = 'Знания модели';
  let cssClass = 'model-knowledge';
  
  if (segment.type === 'RAG:SOURCE') {
    icon = '📚';
    iconColor = '#4ea1ff';
    bgColor = 'rgba(78, 161, 255, 0.08)';
    borderColor = 'rgba(78, 161, 255, 0.3)';
    typeName = 'RAG источник';
    cssClass = 'rag-source';
  } else if (segment.type === 'RAG:ANALYSIS') {
    icon = '📊';
    iconColor = '#16c47f';
    bgColor = 'rgba(22, 196, 127, 0.08)';
    borderColor = 'rgba(22, 196, 127, 0.3)';
    typeName = 'Анализ RAG';
    cssClass = 'rag-analysis';
  }
  
  return `<div class="response-segment ${cssClass}" style="
    margin: 8px 0;
    padding: 10px 12px;
    background: ${bgColor};
    border-left: 3px solid ${borderColor};
    border-radius: 6px;
    position: relative;
    padding-left: 40px;
    min-height: 24px;
  ">
    <span class="segment-icon" title="${typeName}" style="
      position: absolute;
      left: 10px;
      top: 10px;
      font-size: 22px;
      width: 24px;
      height: 24px;
      text-align: center;
      line-height: 24px;
      font-weight: normal;
      display: inline-block;
    ">${icon}</span>
    <span class="segment-text" style="
      display: block;
      line-height: 1.5;
      color: #1a1a1a;
    ">${segment.content}</span>
    <div class="source-info" style="
      font-size: 11px;
      color: #666;
      margin-top: 4px;
      padding-left: 0;
    ">${typeName}</div>
  </div>`;
}

// ---------- render ----------
function renderChat() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';

  const markersEnabled = localStorage.getItem('sourceMarkersEnabled') !== 'false';

  state.messages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg';

    if (m.role === 'assistant' && markersEnabled) {
      const segments = parseResponseMarkers(m.content);
      div.innerHTML = segments.map(formatSegment).join('');
    } else if (m.role === 'assistant') {
      div.innerHTML = `<div class="bubble">${m.content}</div>`;
    } else {
      div.innerHTML = `<span class="${m.role}">${m.role}:</span> ${m.content}`;
    }

    div.classList.add(m.role);
    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;

  setTimeout(updateSourceStats, 10);
}

// Показать/скрыть легенду меток (теперь есть в HTML)
function toggleSourceLegend() {
  const legend = document.getElementById('source-legend');
  if (!legend) return;
  
  if (legend.style.display === 'none' || legend.style.display === '') {
    legend.style.display = 'block';
    localStorage.setItem('showSourceLegend', 'true');
  } else {
    legend.style.display = 'none';
    localStorage.setItem('showSourceLegend', 'false');
  }
}

// Добавить панель статистики источников (теперь есть в HTML)
function initSourceStats() {
  const resetBtn = document.getElementById('reset-stats');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem('sourceStats');
      updateSourceStats();
    });
  }
  
  // Инициализация переключателя
  const toggle = document.getElementById('toggle-markers');
  if (toggle) {
    const isEnabled = localStorage.getItem('sourceMarkersEnabled') !== 'false';
    toggle.checked = isEnabled;
    
    toggle.addEventListener('change', (e) => {
      localStorage.setItem('sourceMarkersEnabled', e.target.checked);
      renderChat();
    });
  }
  
  // Инициализация видимости легенды
  const legend = document.getElementById('source-legend');
  if (legend) {
    const showLegend = localStorage.getItem('showSourceLegend') !== 'false';
legend.style.display = showLegend ? 'block' : 'none';
  }
}

// Добавить легенду в интерфейс
function addSourceLegend() {
  const controls = document.getElementById('controls');
  if (!controls || document.getElementById('source-legend')) return;
  
  const legend = document.createElement('div');
  legend.id = 'source-legend';
  legend.style.cssText = `
    margin: 10px 0;
    padding: 12px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    font-size: 13px;
    display: ${localStorage.getItem('showSourceLegend') !== 'false' ? 'block' : 'none'};
  `;
  
  legend.innerHTML = `
    <strong>📊 Источники в ответах:</strong>
    <div style="margin-top: 8px;">
      <span style="color: #007BFF">📚</span> <strong>RAG:SOURCE</strong> - цитата из базы знаний
      <span style="margin-left: 15px; color: #28a745">📊</span> <strong>RAG:ANALYSIS</strong> - анализ на основе RAG
      <span style="margin-left: 15px; color: #6c757d">💭</span> <strong>MODEL:KNOWLEDGE</strong> - собственные знания модели
    </div>
    <button id="toggle-legend" style="margin-top: 8px; font-size: 11px; padding: 4px 8px;">
      ${localStorage.getItem('showSourceLegend') !== 'false' ? 'Скрыть' : 'Показать'}
    </button>
  `;
  
  controls.parentNode.insertBefore(legend, controls.nextSibling);
  
  document.getElementById('toggle-legend')?.addEventListener('click', toggleSourceLegend);
}

// ---------- events ----------
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('systemPrompt')
  .addEventListener('input', e => {
    updateSystemPrompt(e.target.value);
  });

// Добавить панель статистики источников
function addSourceStats() {
  const controls = document.getElementById('controls');
  if (!controls || document.getElementById('source-stats')) return;
  
  const stats = document.createElement('div');
  stats.id = 'source-stats';
  stats.style.cssText = `
    margin: 10px 0;
    padding: 8px 12px;
    background: #fff;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    font-size: 12px;
    color: #495057;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  stats.innerHTML = `
    <div>
      <strong>📊 Источники в ответах:</strong>
      <span id="rag-count" style="margin-left: 10px; color: #007BFF;">📚: 0</span>
      <span id="model-count" style="margin-left: 10px; color: #6c757d;">💭: 0</span>
    </div>
    <button id="reset-stats" style="font-size: 11px; padding: 2px 6px;">Сбросить</button>
  `;
  
  controls.parentNode.insertBefore(stats, controls.nextSibling);
  
  document.getElementById('reset-stats')?.addEventListener('click', () => {
    localStorage.removeItem('sourceStats');
    updateSourceStats();
  });
}

// Обновить статистику
function updateSourceStats() {
  const ragCount = document.getElementById('rag-count');
  const modelCount = document.getElementById('model-count');
  
  if (!ragCount || !modelCount) return;
  
  // Подсчитать из текущих сообщений
  let rag = 0;
  let model = 0;
  
  state.messages.forEach(msg => {
    if (msg.role === 'assistant') {
      const segments = parseResponseMarkers(msg.content);
      segments.forEach(seg => {
        if (seg.isSource) rag++;
        if (seg.isModel) model++;
      });
    }
  });
  
  // Сохранить в localStorage
  localStorage.setItem('sourceStats', JSON.stringify({ rag, model }));
  
  // Обновить UI
  ragCount.textContent = '📚: ' + rag;
  modelCount.textContent = '💭: ' + model;
}

// Инициализация системы меток
function initSourceMarkersSystem() {
  setTimeout(() => {
    addSourceStats();
    addSourceLegend();
    addSourceMarkersToggle();
    initSourceStats();
    updateSourceStats();
  }, 100);
}

// Запустить инициализацию при загрузке
initSourceMarkersSystem();

document.getElementById('savePrompt')
  .addEventListener('click', async () => {
    await fetch('/projects/' + state.currentProjectId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        model: state.projectSettings.model,
        systemPrompt: state.projectSettings.systemPrompt
      })
    });

    alert('Сохранено');
  });

document
  .getElementById('addProjectBtn')
  .addEventListener('click', addProject);

document
  .getElementById('deleteProjectBtn')
  .addEventListener('click', deleteProject);

document
  .getElementById('resetChatBtn')
  .addEventListener('click', resetChat);

  // Выбор проекта
async function loadProjects() {
  const res = await fetch('/projects', { credentials: 'include' });
  const projects = await res.json();

  const select = document.getElementById('projectSelect');
  select.innerHTML = '';

  projects.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.name;
    select.appendChild(option);
  });

  select.addEventListener('change', async (e) => {
    const projectId = Number(e.target.value);

    state.currentProjectId = projectId;
    localStorage.setItem('currentProjectId', projectId);

    await loadProjectSettings();
    await loadHistory();
  });

  // если есть сохранённый проект — выбрать его
  const savedProjectId = localStorage.getItem('currentProjectId');
  if (savedProjectId) {
    select.value = savedProjectId;
    state.currentProjectId = Number(savedProjectId);
  } else if (projects.length > 0) {
    state.currentProjectId = projects[0].id;
    select.value = projects[0].id;
    localStorage.setItem('currentProjectId', projects[0].id);
  }
}

// ---------- проверка авторизации ----------
async function checkAuth() {
  try {
    const res = await fetch('/auth/check', { credentials: 'include' });
    const data = await res.json();
    
    if (!data.authenticated) {
      window.location.href = '/login.html';
      return false;
    }
    
    // Показываем имя пользователя
    const userEl = document.getElementById('username');
    if (userEl && data.user) {
      userEl.textContent = data.user.username;
    }
    
    return true;
  } catch (err) {
    console.error('Auth check failed:', err);
    window.location.href = '/login.html';
    return false;
  }
}

// ---------- выход ----------
async function logout() {
  try {
    await fetch('/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  } catch (err) {
    console.error('Logout failed:', err);
  }
}

// Добавляем обработчик кнопки выхода
document.getElementById('logoutBtn')?.addEventListener('click', logout);

  // ---------- init ----------
async function init() {
  const isAuth = await checkAuth();
  if (!isAuth) return;
  
  await loadProjects();
  await loadModels();
  await loadProjectSettings();
  await loadHistory();
}

init();