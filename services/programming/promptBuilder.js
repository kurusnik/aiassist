class PromptBuilder {
  build(context) {
    const task = context.task;
    if (!task) {
      return 'Выполни задачу пользователя.';
    }
    const language = task.language || 'unknown';
    const type = task.type || 'development';
    const domain = task.domain || 'general';
    const request = task.originalRequest || '';
    const lines = [
      `Ты — профессиональный разработчик. Язык: ${language}. Домен: ${domain}. Тип задачи: ${type}.`,
      '',
      `Задача пользователя:`,
      request,
      '',
      'Сгенерируй только код. Если нужно объяснение, добавь его после кода.'
    ];
    return lines.join('\n');
  }
}
module.exports = PromptBuilder;
