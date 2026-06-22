// Предзагрузка модели эмбеддингов в кэш
(async () => {
  try {
    console.log('Preloading embedding model...');
    const { pipeline } = await import('@xenova/transformers');
    await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model cached successfully');
  } catch (e) {
    console.warn('Preload failed (model will load on first use):', e.message);
    process.exit(0);
  }
})();