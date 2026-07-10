/**
 * Sanity schema definitions (reference for Studio).
 * Wire these into a Sanity Studio project with the same field names.
 * Public site + admin API use @sanity/client against this shape.
 */

export const categorySchema = {
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (R: { required: () => unknown }) => R.required() },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (R: { required: () => unknown }) => R.required(),
    },
    { name: 'description', title: 'Description', type: 'text' },
  ],
};

export const postSchema = {
  name: 'post',
  title: 'Blog post',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (R: { required: () => unknown }) => R.required() },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (R: { required: () => unknown }) => R.required(),
    },
    { name: 'excerpt', title: 'Excerpt', type: 'text', rows: 3 },
    {
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [
        {
          type: 'block',
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'H2', value: 'h2' },
            { title: 'H3', value: 'h3' },
            { title: 'Quote', value: 'blockquote' },
          ],
          lists: [{ title: 'Bullet', value: 'bullet' }],
        },
        {
          type: 'object',
          name: 'cta',
          title: 'CTA',
          fields: [
            { name: 'label', type: 'string', title: 'Label' },
            { name: 'href', type: 'string', title: 'Link' },
          ],
        },
      ],
    },
    {
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alt text' }],
    },
    {
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'category' }] }],
    },
    { name: 'author', title: 'Author', type: 'string', initialValue: 'Heliaxis' },
    {
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Draft', value: 'draft' },
          { title: 'Scheduled', value: 'scheduled' },
          { title: 'Published', value: 'published' },
          { title: 'Archived', value: 'archived' },
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
    },
    {
      name: 'publishAt',
      title: 'Publish at',
      type: 'datetime',
      description: 'Public when status is published/scheduled and this time is in the past (DIY schedule on Free plan).',
    },
    { name: 'seoTitle', title: 'SEO title', type: 'string' },
    { name: 'seoDescription', title: 'SEO description', type: 'text', rows: 2 },
    { name: 'ogImage', title: 'OG image', type: 'image' },
    { name: 'aiPrompt', title: 'AI prompt (internal)', type: 'text', rows: 3 },
    { name: 'generatedAt', title: 'Generated at', type: 'datetime' },
  ],
  orderings: [
    {
      title: 'Publish date, new',
      name: 'publishAtDesc',
      by: [{ field: 'publishAt', direction: 'desc' }],
    },
  ],
};

export const schemaTypes = [categorySchema, postSchema];
