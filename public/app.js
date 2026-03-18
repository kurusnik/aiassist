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
// ---------- render ----------
function renderChat() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';

  state.messages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML =
  '<span class="' + m.role + '">' +
  m.role + ':</span> ' +
  m.content;
    chat.appendChild(div);
  });

  chat.scrollTop = chat.scrollHeight;
}

// ---------- events ----------
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('systemPrompt')
  .addEventListener('input', e => {
    updateSystemPrompt(e.target.value);
  });

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