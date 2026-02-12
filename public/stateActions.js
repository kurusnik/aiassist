import { state } from './state.js';

export function setProjects(projects) {
  state.projects = projects;
}

export function selectProject(project) {
  state.currentProjectId = project.id;
  state.projectSettings.model = project.model;
  state.projectSettings.systemPrompt = project.system_prompt;
  state.messages = [];
}

export function setMessages(messages) {
  state.messages = messages;
}

export function addMessage(message) {
  state.messages.push(message);
}

export function setLoading(value) {
  state.ui.loading = value;
}

export function updateSystemPrompt(text) {
  state.projectSettings.systemPrompt = text;
}

export function updateModel(model) {
  state.projectSettings.model = model;
}