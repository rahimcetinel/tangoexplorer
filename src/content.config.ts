import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const categories = [
  'etkinlik',
  'festival',
  'turkiye',
  'dunya',
  'topluluk',
] as const;

export const eventKinds = [
  'festival',
  'marathon',
  'encuentro',
  'workshop',
  'ders',
  'pratik',
] as const;

export const contentFormats = ['etkinlik', 'blog'] as const;

export const sourceKeys = ['instagram', 'facebook', 'tangocat', 'hoymilonga'] as const;

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(categories),
    source: z.string(),
    sourceUrl: z.string().url(),
    locale: z.enum(['tr', 'en']).default('tr'),
    summary: z.string(),
    featured: z.boolean().optional().default(false),
    breaking: z.boolean().optional().default(false),
    eventName: z.string().optional(),
    eventWhen: z.string().optional(),
    eventLocation: z.string().optional(),
    eventWebsite: z.string().url().optional(),
    eventFacebook: z.string().url().optional(),
    eventInstagram: z.string().url().optional(),
    image: z.string().optional(),
    imageCredit: z.string().optional(),
    imageSourceUrl: z.string().url().optional(),
    kinds: z.array(z.enum(eventKinds)).default([]),
    format: z.enum(contentFormats).default('etkinlik'),
    sourceKey: z.enum(['instagram', 'facebook', 'tangocat', 'hoymilonga', 'diger']).default('diger'),
    country: z.string().optional(),
    city: z.string().optional(),
    eventStart: z.coerce.date().optional(),
    eventEnd: z.coerce.date().optional(),
  }),
});

export const collections = { news };
