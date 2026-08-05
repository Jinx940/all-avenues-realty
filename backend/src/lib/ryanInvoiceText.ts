const spanishSignals = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'para', 'por', 'con', 'se', 'y', 'fue', 'fueron',
  'reparó', 'repararon', 'retiró', 'retiraron', 'reemplazó', 'reemplazaron', 'instaló',
  'instalaron', 'limpió', 'limpiaron', 'aseguró', 'aseguraron', 'dañado', 'dañados',
]);

const actionSignals = /\b(repair|repaired|replace|replaced|remove|removed|install|installed|clean|cleaned|secure|secured|restore|restored|seal|sealed|paint|painted|fix|fixed|repar|reemplaz|retir|instal|limpi|asegur|restaur|sell|pint)\w*/i;

const splitSentences = (value: string) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?;]+[.!?;]+|[^.!?;]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];

export const isLikelySpanish = (value: string) => {
  if (/[áéíóúñ¿¡]/i.test(value)) return true;
  const words = value.toLowerCase().match(/[a-záéíóúñ]+/g) ?? [];
  const matches = words.filter((word) => spanishSignals.has(word)).length;
  return matches >= 2 && matches / Math.max(words.length, 1) >= 0.08;
};

export const summarizeRyanWork = (value: string) => {
  const sentences = splitSentences(value);
  if (!sentences.length) return '';

  const englishSentences = sentences.filter((sentence) => !isLikelySpanish(sentence));
  const spanishSentences = sentences.filter(isLikelySpanish);
  const candidates = englishSentences.length && spanishSentences.length ? englishSentences : sentences;
  const unique = candidates.filter((sentence, index, items) => {
    const normalized = sentence.toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, ' ').trim();
    return items.findIndex((item) => item.toLowerCase().replace(/[^a-záéíóúñ0-9]+/g, ' ').trim() === normalized) === index;
  });
  const ranked = unique
    .map((sentence, index) => ({ sentence, index, score: actionSignals.test(sentence) ? 2 : 0 }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 2)
    .sort((left, right) => left.index - right.index)
    .map(({ sentence }) => sentence);

  return ranked.join(' ').slice(0, 900).trim();
};

export const fallbackRyanSummary = (service: string, area: string) => {
  const safeService = String(service || 'maintenance').trim().replace(/[.!?;]+$/g, '');
  const safeArea = String(area || '').trim().replace(/[.!?;]+$/g, '');
  return safeArea
    ? `Completed ${safeService.toLowerCase()} work in ${safeArea}.`
    : `Completed ${safeService.toLowerCase()} work.`;
};

type MyMemoryResponse = {
  responseStatus?: number | string;
  responseData?: { translatedText?: string };
};

export const translateRyanSummaryToEnglish = async (summary: string) => {
  if (!summary || !isLikelySpanish(summary)) return summary;

  const segments = splitSentences(summary).slice(0, 2);
  const translated: string[] = [];

  for (const segment of segments) {
    const query = new URLSearchParams({ q: segment.slice(0, 450), langpair: 'es|en', mt: '1' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?${query}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const payload = await response.json() as MyMemoryResponse;
      const result = String(payload.responseData?.translatedText ?? '').trim();
      if (!response.ok || !result || /MYMEMORY WARNING/i.test(result)) return '';
      translated.push(result);
    } catch {
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }

  return translated.join(' ').trim();
};
