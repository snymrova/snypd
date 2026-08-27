/**
 * Token counting for the agent-friendliness metrics (docs/05 §agent-friendliness).
 * "Standard tokeniser" = o200k_base (GPT-4o / o-series). Claude's tokeniser is not public;
 * o200k is within ~10 % of it on English prose + markdown, and is stable and offline.
 */
import { encode } from "gpt-tokenizer/encoding/o200k_base";

export const TOKENIZER = "o200k_base";
export function countTokens(text: string): number { return encode(text).length; }
