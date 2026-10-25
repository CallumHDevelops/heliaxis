import { atLeast, maxSeverity, raiseOne, type Severity } from './types';

/**
 * Combines the keyword layer, the AI layer and the history rules into one severity
 * (docs/social-monitoring/03-classifier.md §5-§6). Pure: no I/O. The AI can only ever raise a result,
 * never lower what the keyword layer found.
 *
 * Applied in order. Every rule that changes the result adds its id to `adjustments`.
 */

export type ModelResult = {
  severity: Severity;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  safetyRelated: boolean;
  injectionSuspected: boolean;
};

export type CombineInput = {
  /** From the keyword layer: only ever 'high', 'critical' or nothing. */
  keywordSeverity: 'high' | 'critical' | null;
  /** The keyword layer hit one of the safety categories. */
  keywordSafetyRelated: boolean;
  /** From the AI layer; null if it hasn't run or failed. */
  model: ModelResult | null;
  /** The AI layer ran out of retries, was refused, or returned invalid output. */
  modelFailed: boolean;
  /** Star rating for reviews. */
  rating: number | null;
  author: {
    /** Other negative mentions by the same author on the same platform in the last 30 days. */
    negativeMentions30d: number;
    /** The author has any open Critical mention. */
    hasOpenCritical: boolean;
  };
  thread: {
    /** Severity of the thread's parent or root, if it is still open. */
    parentOrRootOpenSeverity: Severity | null;
  };
  /** We already replied (marked Posted) and the same author answered negatively. */
  escalatingThread: boolean;
  /** The highest severity this mention has had so far (never lower automatically, 03 §7). */
  floor: Severity | null;
};

export type CombineResult = {
  severity: Severity;
  keywordSeverity: 'high' | 'critical' | null;
  modelSeverity: Severity | null;
  safetyRelated: boolean;
  injectionSuspected: boolean;
  modelStatus: 'ok' | 'failed' | 'pending';
  adjustments: string[];
  tags: string[];
};

export function combine(input: CombineInput): CombineResult {
  const { keywordSeverity, model, modelFailed } = input;
  const adjustments: string[] = [];
  const tags: string[] = [];
  const note = (id: string) => adjustments.push(id);

  let modelSeverity: Severity | null = model ? model.severity : null;
  let safetyRelated = input.keywordSafetyRelated;

  // S1: the AI found a safety matter the keywords missed.
  if (model?.safetyRelated) {
    safetyRelated = true;
    if (modelSeverity !== 'critical') {
      modelSeverity = 'critical';
      note('S1');
    }
  }

  // C1: the higher of the two layers.
  let severity: Severity = maxSeverity(keywordSeverity, modelSeverity) ?? 'low';

  // C2: star ratings.
  if (input.rating !== null) {
    const min: Severity | null = input.rating <= 2 ? 'high' : input.rating === 3 ? 'medium' : null;
    if (min && severity !== atLeast(severity, min)) {
      severity = min;
      note('C2');
    }
  }

  // C3: low confidence on anything negative goes up one level.
  if (model && model.confidence < 0.7 && (model.sentiment === 'negative' || model.sentiment === 'mixed')) {
    const raised = raiseOne(severity);
    if (raised !== severity) {
      severity = raised;
      note('C3');
    }
  }

  // C4: the comment seems to be talking to the bot.
  const injectionSuspected = !!model?.injectionSuspected;
  if (injectionSuspected) {
    const raised = atLeast(severity, 'medium');
    if (raised !== severity) severity = raised;
    note('C4');
  }

  // C5: Ignore only when no keyword hit and the AI is confident; otherwise Low.
  if (severity === 'ignore') {
    const allowed = keywordSeverity === null && !!model && !modelFailed && model.severity === 'ignore' && model.confidence >= 0.85;
    if (!allowed) {
      severity = 'low';
      note('C5');
    }
  }

  // R1: a commenter with a run of negative mentions. Spam is left alone.
  if (severity !== 'ignore' && input.author.negativeMentions30d >= 2) {
    const raised = raiseOne(severity);
    if (raised !== severity) {
      severity = raised;
      note('R1');
    }
    tags.push('repeat_commenter');
  }

  // R2: the author has an open Critical.
  if (input.author.hasOpenCritical && severity !== atLeast(severity, 'high')) {
    severity = 'high';
    note('R2');
  }

  // T1: replies inherit urgency from an open parent or root.
  const parent = input.thread.parentOrRootOpenSeverity;
  if (parent === 'critical' && severity !== atLeast(severity, 'high')) {
    severity = 'high';
    note('T1');
  } else if (parent === 'high' && severity !== atLeast(severity, 'medium')) {
    severity = 'medium';
    note('T1');
  }

  // T3: we replied and they came back unhappy.
  if (input.escalatingThread) {
    tags.push('escalating_thread');
    if (severity !== atLeast(severity, 'high')) {
      severity = 'high';
      note('T3');
    }
  }

  // F1: no AI result at all: urgent until a person has looked.
  if (modelFailed) {
    if (severity !== atLeast(severity, 'high')) severity = 'high';
    note('F1');
  }

  // FLOOR: a re-classification never lowers what was already assigned.
  if (input.floor && severity !== atLeast(severity, input.floor)) {
    severity = input.floor;
    note('FLOOR');
  }

  return {
    severity,
    keywordSeverity,
    modelSeverity,
    safetyRelated,
    injectionSuspected,
    modelStatus: modelFailed ? 'failed' : model ? 'ok' : 'pending',
    adjustments,
    tags,
  };
}
