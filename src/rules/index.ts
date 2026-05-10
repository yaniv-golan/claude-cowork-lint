/**
 * Registry for the per-rule modules.
 *
 * The single owner of imports across every `cw0NN.ts` file. `ALL_RULES` is
 * the canonical ordered list (CW001..CW006, CW008..CW012; CW007 reserved).
 */

export type { Rule } from "./_helpers.js";

import type { Rule } from "./_helpers.js";
import { CW001 } from "./cw001.js";
import { CW002 } from "./cw002.js";
import { CW003 } from "./cw003.js";
import { CW004 } from "./cw004.js";
import { CW005 } from "./cw005.js";
import { CW006 } from "./cw006.js";
import { CW008 } from "./cw008.js";
import { CW009 } from "./cw009.js";
import { CW010 } from "./cw010.js";
import { CW011 } from "./cw011.js";
import { CW012 } from "./cw012.js";

export { CW001, CW002, CW003, CW004, CW005, CW006, CW008, CW009, CW010, CW011, CW012 };

export const ALL_RULES: Rule[] = [
  CW001,
  CW002,
  CW003,
  CW004,
  CW005,
  CW006,
  CW008,
  CW009,
  CW010,
  CW011,
  CW012,
];
