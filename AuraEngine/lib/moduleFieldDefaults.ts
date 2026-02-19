import type {
  ImageModuleType,
  BusinessProfile,
  ModuleFieldValues,
  NewsletterModuleFields,
  PricingModuleFields,
  ProductsModuleFields,
  ServicesModuleFields,
} from '../types';

export function buildDefaultModuleFields(
  moduleType: ImageModuleType,
  bp?: BusinessProfile,
): ModuleFieldValues {
  switch (moduleType) {
    case 'newsletter': {
      const fields: NewsletterModuleFields = {
        headline: bp?.companyName && bp?.valueProp
          ? `${bp.companyName} — ${bp.valueProp}`
          : bp?.companyName || '',
        subheadline: bp?.competitiveAdvantage || bp?.contentTone || '',
        ctaText: 'Learn More',
        targetAudience: bp?.targetAudience || '',
      };
      return { type: 'newsletter', fields };
    }

    case 'pricing': {
      const fields: PricingModuleFields = {
        tiers: bp?.pricingTiers?.length
          ? bp.pricingTiers.map(t => ({
              id: t.id,
              name: t.name,
              price: t.price || '',
              features: t.features || [],
              featured: false,
            }))
          : [],
        pricingModelSummary: bp?.pricingModel || '',
      };
      return { type: 'pricing', fields };
    }

    case 'products': {
      const fields: ProductsModuleFields = {
        items: bp?.services?.length
          ? bp.services.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description || '',
            }))
          : [],
        sellingPoints: bp?.uniqueSellingPoints || [],
      };
      return { type: 'products', fields };
    }

    case 'services': {
      const fields: ServicesModuleFields = {
        items: bp?.services?.length
          ? bp.services.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description || '',
            }))
          : [],
        companyStory: bp?.companyStory || bp?.businessDescription || '',
        differentiators: bp?.competitiveAdvantage || '',
      };
      return { type: 'services', fields };
    }
  }
}
