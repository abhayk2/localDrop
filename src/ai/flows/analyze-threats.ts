// This flow is no longer used in the P2P implementation.
// It is kept for reference or future use.
'use server';

import {z} from 'genkit';
export type AnalyzeThreatsInput = z.infer<any>;
export type AnalyzeThreatsOutput = z.infer<any>;
export async function analyzeThreats(input: AnalyzeThreatsInput): Promise<AnalyzeThreatsOutput> {
  return { hasThreats: false, threatReport: '' };
}
