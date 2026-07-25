const STOP_WORDS_RU = new Set([
  'это', 'как', 'так', 'что', 'кто', 'где', 'когда', 'зачем', 'почему',
  'для', 'в', 'на', 'с', 'по', 'из', 'от', 'до', 'у', 'о', 'об',
  'и', 'а', 'но', 'да', 'или', 'не', 'ни', 'же', 'бы',
  'если', 'чтобы', 'также', 'при', 'про', 'без',
  'за', 'под', 'над', 'перед', 'между', 'через', 'около', 'возле',
  'весь', 'всего', 'всему', 'всем', 'всём', 'вся', 'все', 'всё',
  'этот', 'эта', 'это', 'эти', 'этого', 'этому', 'этим', 'этом',
  'тот', 'та', 'то', 'те', 'того', 'тому', 'тем', 'том',
  'один', 'одна', 'одно', 'одни', 'одного',
  'я', 'ты', 'он', 'она', 'оно', 'мы', 'вы', 'они',
  'меня', 'тебя', 'его', 'её', 'нас', 'вас', 'их',
  'мне', 'тебе', 'ему', 'ей', 'нам', 'вам', 'им',
  'мой', 'твой', 'наш', 'ваш', 'свой',
  'себя', 'себе', 'собой',
  'может', 'можно', 'нужно', 'надо', 'будет', 'быть', 'есть',
  'очень', 'уже', 'ещё', 'только', 'вот', 'тут', 'там',
  'здесь', 'сейчас', 'потом', 'затем', 'опять', 'снова',
  'всегда', 'иногда', 'часто', 'редко'
]);

const STOP_WORDS_EN = new Set([
  'is', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about',
  'into', 'over', 'after', 'before', 'between', 'under',
  'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their',
  'this', 'that', 'these', 'those',
  'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'shall', 'must', 'need', 'dare'
]);

const STOP_WORDS = new Set([...STOP_WORDS_RU, ...STOP_WORDS_EN]);

function normalize(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return '';
  }

  let text = rawQuery;

  text = text.trim();

  text = text.toLowerCase();

  text = text.replace(/\.\.\./g, ' ');
  text = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  text = text.replace(/\s+/g, ' ');

  const words = text.split(' ').filter(w => w.length > 0);
  const filtered = words.filter(w => !STOP_WORDS.has(w));

  if (filtered.length === 0) {
    return words.join(' ');
  }

  return filtered.join(' ');
}

module.exports = { normalize, STOP_WORDS };