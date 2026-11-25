/**
 * The templates the system holds, by code. Pure. Templates are code for now (seed/); the builder will add the ones
 * people make, read from the database, alongside them.
 */
import { HEAT_PUMP_TEMPLATES } from './seed/heat-pump';
import { OFF_GRID_TEMPLATES } from './seed/off-grid';
import { SOLAR_BATTERY_TEMPLATES } from './seed/solar-battery';
import type { DocTemplate } from './types';

export const TEMPLATES: DocTemplate[] = [...SOLAR_BATTERY_TEMPLATES, ...HEAT_PUMP_TEMPLATES, ...OFF_GRID_TEMPLATES];

export const templateByCode = (code: string): DocTemplate | null => TEMPLATES.find((t) => t.code === code) ?? null;

/** The templates that belong on a job with these products (a template for no technology belongs on every job). */
export const templatesForProducts = (products: string[]): DocTemplate[] => TEMPLATES.filter((t) => !t.tech.length || t.tech.some((x) => products.includes(x)));
