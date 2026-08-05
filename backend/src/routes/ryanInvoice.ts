import type { Express } from 'express';
import { z } from 'zod';
import { asyncRoute } from '../lib/http.js';
import {
  fallbackRyanSummary,
  isLikelySpanish,
  summarizeRyanWork,
  translateRyanSummaryToEnglish,
} from '../lib/ryanInvoiceText.js';

const requestSchema = z.object({
  items: z.array(z.object({
    description: z.string().max(3000),
    service: z.string().max(180),
    area: z.string().max(180),
  })).min(1).max(100),
});

export const registerRyanInvoiceRoutes = (app: Express) => {
  app.post('/api/ryan-invoice/prepare-descriptions', asyncRoute(async (request, response) => {
    const payload = requestSchema.parse(request.body);
    const items = await Promise.all(payload.items.map(async (item) => {
      const summary = summarizeRyanWork(item.description);
      const translated = await translateRyanSummaryToEnglish(summary);
      return {
        description: translated || (!summary || isLikelySpanish(summary)
          ? fallbackRyanSummary(item.service, item.area)
          : summary),
      };
    }));

    response.json({ items });
  }));
};
