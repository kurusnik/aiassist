export const state = {
  projects: [],
  currentProjectId: null,

  projectSettings: {
    model: null,
    systemPrompt: ''
  },

  messages: [],

  ui: {
    loading: false,
    error: null
  }
};