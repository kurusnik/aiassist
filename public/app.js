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
  const res = await fetch('/models');
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
  const res = await fetch('/projects/' + state.currentProjectId + '/messages');
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
  renderChat();

  textarea.value = '';
  setLoading(true);

  const response = await fetch('/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: state.currentProjectId,
      userMessage: text,
      model: state.projectSettings.model
    })
  });

  const data = await response.json();

  addMessage({ role: 'assistant', content: data.reply });
  setLoading(false);
  renderChat();
}
   //новый проект
async function addProject() {
  const name = prompt('Название проекта:');
  if (!name) return;

  const res = await fetch('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      userId: 1
    })
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
  const res = await fetch('/projects/' + state.currentProjectId);
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
    method: 'DELETE'
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
    method: 'DELETE'
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
  const res = await fetch('/projects');
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

  // ---------- init ----------
async function init() {
  await loadProjects();
  await loadModels();
  await loadProjectSettings();
  await loadHistory();
}

init();