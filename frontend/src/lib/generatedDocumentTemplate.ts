export type GeneratedDocumentOwner = 'aze' | 'ryan' | 'todd' | 'morales';
export type GeneratedDocumentKind = 'Invoice' | 'Quote';

export type GeneratedDocumentTemplate =
  | 'aze-modern'
  | 'ryan-invoice'
  | 'todd-modern'
  | 'morales-invoice'
  | 'legacy-quote';

export const generatedDocumentTemplateFor = (
  owner: GeneratedDocumentOwner,
  documentType: GeneratedDocumentKind,
): GeneratedDocumentTemplate => {
  if (owner === 'aze') return 'aze-modern';
  if (owner === 'todd') return 'todd-modern';
  if (owner === 'ryan' && documentType === 'Invoice') return 'ryan-invoice';
  if (owner === 'morales' && documentType === 'Invoice') return 'morales-invoice';
  return 'legacy-quote';
};
