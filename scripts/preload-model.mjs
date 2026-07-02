// Предзагрузка модели эмбеддингов в кэш
process.env.XOVA_DEFAULT_CACHE = '/app/.cache/transformers';

(async () => {
  try {
    console.log('Preloading embedding model...');
    console.log('Cache directory:', process.env.XOVA_DEFAULT_CACHE);
    
    const { pipeline } = await import('@xenova/transformers');
    
    await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      progress_callback: (progress) => {
        if (progress.downloaded && progress.total) {
          const percent = (progress.downloaded / progress.total * 100).toFixed(0);
          process.stderr.write(`\rDownloading: ${percent}%`);
        }
      }
    });
    
    console.log('\nEmbedding model cached successfully');
  } catch (e) {
    console.warn('Preload failed (model will load on first use):', e.message);
    process.exit(0);
  }
})();
