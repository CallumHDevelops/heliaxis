import 'server-only';

/**
 * M3 Opportunity planner job handlers (wired into jobs.ts by the dispatcher):
 * - runKeywordResearch(db): monthly on the 1st. Pool refresh including the paid Labs calls, in steps; returns done: false
 *   while steps remain, so the dispatcher should call it again ("later").
 * - runOpportunityScoring(db): weekly, Monday 08:00. Group, map, score and upsert the queue. Free.
 */
export { runKeywordResearch, readResearchState, planResearch, type ResearchSummary } from './research';
export { runOpportunityScoring, type ScoringSummary } from './scoring';
